// O Início (Fase 89): o que a tela com o seu dia mostra, juntado aqui num pedido só: a agenda de
// hoje, os próximos lembretes e tarefas (as suas e o batimento), o GitHub, o último batimento e as
// anotações recentes da memória. As conversas recentes e o uso do plano a página já tem.
// O painel de controle (Fases 94 a 97) pede o resto bloco a bloco: a agenda de um período, a
// atividade por dia, o que o Wisp fez hoje, as suas tarefas e hábitos, o foco, a música e o clima.

import { app, ipcMain } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { readFileSync } from 'fs'
import type { ActivityLog } from './activity'
import type { Agenda } from './agenda'
import { getConfig, notifyConfigChange, updateConfig } from './config'
import type { FocusMode } from './focus'
import { heartbeatTasks } from './heartbeat'
import { Habits, Todos } from './home-store'
import { setupPentest } from './pentest'
import type { MediaPlayers } from './media'
import { MEMORY_DIR, personalMemory } from './personal-memory'
import type { Reminder } from './reminders'
import { Weather } from './weather'
import { IPC, IPC_HOME } from '../shared/ipc'
import type {
  ActivityDay,
  FeedLine,
  FocusState,
  HabitChange,
  HomeEvent,
  HomeSnapshot,
  IslandMusicAction,
  TodoChange
} from '../shared/ipc'
import { dateLocale, t } from '../shared/i18n'
import { describeSchedule, nextRun } from '../shared/prompts'

const GITHUB_WAIT_MS = 4000

export interface HomeDeps {
  isSender(sender: WebContents): boolean
  agenda(): Agenda | null
  reminders(): Reminder[]
  /** Os seus PRs em texto (null: o GitHub está desligado). */
  github(): Promise<string> | null
  now?(): number
  /** O registro de atividade (Fase 13, para a semana do Wisp) e os players de música. */
  live?: () => { activity: ActivityLog | null; media: MediaPlayers | null }
  /** O modo foco (Fase 45), no bloco Foco. */
  focus?: FocusMode
  /** A notificação do sistema (os avisos do pentester, Fase 100). */
  notify?: (title: string, body: string) => void
}

let todosStore: Todos | null = null
/** As suas tarefas: uma lista só no app (o bloco e as ferramentas todo_* mexem nela). */
export function todos(): Todos {
  todosStore ??= new Todos()
  return todosStore
}

const DAY_MS = 24 * 60 * 60_000
/** A agenda de um período: no máximo seis semanas (o calendário do mês, com as pontas). */
const MAX_RANGE_MS = 43 * DAY_MS

/** O começo do dia (0h, no fuso local). */
const dayStart = (at: number): number => {
  const date = new Date(at)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** As contagens por dia dos últimos `days` dias (até 63, o que o registro guarda). */
export function activityDays(log: ActivityLog | null, days: number, now: number): ActivityDay[] {
  const count = Math.max(1, Math.min(63, Math.round(days)))
  const today = dayStart(now)
  const out: ActivityDay[] = []
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    out.push({ day: date.getTime(), conversations: 0, turns: 0, edits: 0, reminders: 0 })
  }
  for (const entry of log?.entries(out[0].day, Infinity) ?? []) {
    const slot = out.find((item) => item.day === dayStart(entry.t))
    if (!slot) continue
    if (entry.k === 'conversa') slot.conversations++
    if (entry.k === 'turno') slot.turns++
    if (entry.k === 'edicao') slot.edits++
    if (entry.k === 'lembrete') slot.reminders++
  }
  return out
}

/** As linhas do diário de hoje ("- 14:30 texto"), o que o Wisp fez. */
export function feedLines(text: string): FeedLine[] {
  return text
    .split('\n')
    .map((line) => /^- (\d{2}:\d{2}) (.+)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => !!match)
    .map((match) => ({ time: match[1], text: match[2].slice(0, 300) }))
}

function focusState(focus: FocusMode | undefined): FocusState {
  return {
    endsAt: focus?.endsAt() ?? null,
    minutes: focus?.length() ?? 0,
    doneToday: focus?.doneToday() ?? 0
  }
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
  // A página do painel que pediu por último: é ela que fica sabendo das mudanças.
  let page: WebContents | null = null
  const ok = (event: IpcMainInvokeEvent): boolean => {
    const yes = deps.isSender(event.sender)
    if (yes) page = event.sender
    return yes
  }
  const now = (): number => deps.now?.() ?? Date.now()
  const send = (channel: string, value: unknown): void => {
    if (page && !page.isDestroyed()) page.send(channel, value)
  }
  // O pentester (Fases 98 a 103) é aberto junto: a tela dele é a irmã do Início.
  const stopPentest = setupPentest({
    isSender: deps.isSender,
    notify: (title, body) => deps.notify?.(title, body)
  })
  app.on('before-quit', stopPentest)
  const habits = new Habits()
  const weather = new Weather(() => getConfig().weather)
  todos().onChange((list) => send(IPC_HOME.todosChanged, list))
  deps.focus?.subscribe(() => send(IPC_HOME.focusChanged, focusState(deps.focus)))

  ipcMain.handle(IPC.homeSnapshot, (event) => (ok(event) ? homeSnapshot(deps) : null))
  ipcMain.handle(
    IPC_HOME.agenda,
    async (event, from: unknown, to: unknown): Promise<HomeEvent[] | null> => {
      const agenda = deps.agenda()
      if (!ok(event) || !agenda?.enabled) return null
      if (typeof from !== 'number' || typeof to !== 'number' || to <= from) return []
      const items = await agenda.between(from, Math.min(to, from + MAX_RANGE_MS)).catch(() => [])
      return items.map((item) => ({
        title: item.title,
        start: item.start,
        end: item.end,
        location: item.location,
        allDay: item.allDay
      }))
    }
  )
  ipcMain.handle(IPC_HOME.activity, (event, days: unknown) =>
    ok(event) && typeof days === 'number'
      ? activityDays(deps.live?.().activity ?? null, days, now())
      : []
  )
  ipcMain.handle(IPC_HOME.feed, (event) => {
    if (!ok(event)) return []
    try {
      return feedLines(readFileSync(personalMemory().path('diario'), 'utf8'))
    } catch {
      return []
    }
  })
  ipcMain.handle(IPC_HOME.note, (event, text: unknown) => {
    if (!ok(event) || typeof text !== 'string') return { error: 'pedido inválido' }
    const result = personalMemory().save('memoria', text, { title: t('Início') })
    return result.ok ? { ok: true } : { error: result.error }
  })
  ipcMain.handle(IPC_HOME.todos, (event) => (ok(event) ? todos().list() : []))
  ipcMain.handle(IPC_HOME.todoChange, (event, change: unknown) => {
    if (ok(event) && change && typeof change === 'object') todos().change(change as TodoChange)
    return todos().list()
  })
  ipcMain.handle(IPC_HOME.habits, (event) => (ok(event) ? habits.list() : []))
  ipcMain.handle(IPC_HOME.habitChange, (event, change: unknown) =>
    ok(event) && change && typeof change === 'object'
      ? habits.change(change as HabitChange)
      : habits.list()
  )
  ipcMain.handle(IPC_HOME.focus, (event) => focusState(ok(event) ? deps.focus : undefined))
  ipcMain.handle(IPC_HOME.focusAction, (event, action: unknown) => {
    const wanted = action as { kind?: unknown; minutes?: unknown } | null
    if (ok(event) && deps.focus && wanted?.kind === 'stop') deps.focus.stop()
    if (ok(event) && deps.focus && wanted?.kind === 'start' && typeof wanted.minutes === 'number') {
      deps.focus.start(Math.max(1, Math.min(180, Math.round(wanted.minutes))))
    }
    return focusState(deps.focus)
  })
  ipcMain.handle(IPC_HOME.music, async (event) =>
    ok(event)
      ? ((await deps
          .live?.()
          .media?.nowPlaying()
          .catch(() => null)) ?? null)
      : null
  )
  ipcMain.handle(IPC_HOME.musicAction, async (event, action: unknown) => {
    const media = deps.live?.().media
    if (ok(event) && media && action && typeof action === 'object') {
      await media.musicAction(action as IslandMusicAction).catch(() => undefined)
    }
  })
  ipcMain.handle(IPC_HOME.weather, (event) =>
    ok(event) ? weather.get() : { state: 'error', message: '' }
  )
  ipcMain.handle(IPC_HOME.weatherPlace, async (event, name: unknown) => {
    if (!ok(event) || typeof name !== 'string') return { error: 'pedido inválido' }
    if (!name.trim()) {
      updateConfig({ weather: null })
      notifyConfigChange()
      return { ok: true, place: '' }
    }
    const found = await weather.find(name, dateLocale().slice(0, 2))
    if ('error' in found) return found
    updateConfig({ weather: found })
    notifyConfigChange()
    return { ok: true, place: found.place }
  })
}
