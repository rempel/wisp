// O Início (Fase 89): o que a tela com o seu dia mostra, juntado aqui num pedido só: a agenda de
// hoje, os próximos lembretes e tarefas (as suas e o batimento), o GitHub, o último batimento e as
// anotações recentes da memória. As conversas recentes e o uso do plano a página já tem.

import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { readFileSync } from 'fs'
import type { Agenda } from './agenda'
import { getConfig } from './config'
import { heartbeatTasks } from './heartbeat'
import { MEMORY_DIR, personalMemory } from './personal-memory'
import type { Reminder } from './reminders'
import { IPC } from '../shared/ipc'
import type { HomeSnapshot } from '../shared/ipc'
import { describeSchedule, nextRun } from '../shared/prompts'

const GITHUB_WAIT_MS = 4000

export interface HomeDeps {
  isSender(sender: WebContents): boolean
  agenda(): Agenda | null
  reminders(): Reminder[]
  /** Os seus PRs em texto (null: o GitHub está desligado). */
  github(): Promise<string> | null
  now?(): number
}

/** As linhas do diário de hoje que falam do batimento, a última delas. */
function lastHeartbeat(): string | null {
  try {
    const text = readFileSync(personalMemory().path('diario'), 'utf8')
    const lines = text
      .split('\n')
      .filter((line) => /^- \d{2}:\d{2} .*(Batimento|Heartbeat)/.test(line))
    return lines.length ? lines[lines.length - 1].replace(/^- /, '') : null
  } catch {
    return null
  }
}

export async function homeSnapshot(deps: HomeDeps): Promise<HomeSnapshot> {
  const now = deps.now?.() ?? Date.now()
  const day = new Date(now)
  const endOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime()
  const config = getConfig()

  const agenda = deps.agenda()
  const events = agenda?.enabled
    ? (await agenda.between(now - 60 * 60_000, endOfDay).catch(() => [])).map((item) => ({
        title: item.title,
        start: item.start,
        end: item.end,
        location: item.location,
        allDay: item.allDay
      }))
    : null

  const after = new Date(now)
  const tasks = [...config.scheduledTasks, ...heartbeatTasks(config, MEMORY_DIR)]
    .map((task) => ({ task, at: nextRun(task, after)?.getTime() ?? null }))
    .filter((item): item is { task: (typeof item)['task']; at: number } => item.at !== null)
    .sort((a, b) => a.at - b.at)
    .slice(0, 5)
    .map(({ task, at }) => ({ id: task.id, name: task.name, at, schedule: describeSchedule(task) }))

  const reminders = deps
    .reminders()
    .filter((item) => item.at >= now)
    .slice(0, 5)
    .map((item) => ({ text: item.text, at: item.at }))

  let github: string | null = null
  const pending = deps.github()
  if (pending) {
    github = await Promise.race([
      pending.catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), GITHUB_WAIT_MS))
    ])
  }

  return {
    events,
    tasks,
    reminders,
    github,
    heartbeat: config.heartbeat ? lastHeartbeat() : null,
    notes: personalMemory()
      .notes()
      .filter((note) => !note.undone && note.action === 'save')
      .slice(0, 4)
      .map((note) => ({ text: note.text, at: note.at }))
  }
}

export function setupHomeIpc(deps: HomeDeps): void {
  ipcMain.handle(IPC.homeSnapshot, (event) =>
    deps.isSender(event.sender) ? homeSnapshot(deps) : null
  )
}
