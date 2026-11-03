// As tarefas (Fase 26 e 44): cada uma roda o prompt dela numa aba nova, no modo Pedir, e o card
// dela espera você (ou vai para o celular e para a notificação, como qualquer card). Pelo
// horário (o agendador), ou, desde a Fase 44, por um evento: uma revisão num PR seu, um CI que
// falhou, um arquivo novo numa pasta ou a tela desbloqueada. O {evento} do prompt diz o que
// aconteceu.

import { readdirSync, watch } from 'fs'
import type { FSWatcher } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { Chat } from './chat'
import { getConfig, onConfigChange } from './config'
import { describeAlert } from './github'
import type { GithubAlert } from './github'
import type { GithubAlerts } from './github-alerts'
import type { Notify } from './notify'
import { DATA_DIR } from './paths'
import { TaskScheduler } from './scheduler'
import type { TaskResult } from '../shared/ipc'
import type { ScheduledTask, TaskTrigger } from '../shared/prompts'
import { dateLocale, t } from '../shared/i18n'

/** Uma tarefa por evento não roda de novo antes disso (um PR com dez comentários não abre dez abas). */
export const TRIGGER_COOLDOWN_MS = 5 * 60_000
/** Os arquivos novos de uma pasta que chegam juntos (um download, uma cópia) viram uma rodada só. */
const FOLDER_SETTLE_MS = 3000
/** Quantos arquivos o {evento} lista. */
const MAX_FILES_LISTED = 20

/** As tarefas de um gatilho que valem agora (ligadas, com o gatilho). */
export function tasksFor(tasks: ScheduledTask[], trigger: TaskTrigger): ScheduledTask[] {
  return tasks.filter((task) => task.enabled && (task.trigger ?? 'time') === trigger)
}

export interface TriggerDeps {
  tasks(): ScheduledTask[]
  run(task: ScheduledTask, event: string): void
  now?(): number
  /** Os nomes numa pasta (os testes trocam). */
  list?(dir: string): string[]
  watch?(dir: string, onChange: () => void): { close(): void }
}

/** Os gatilhos por evento, com o intervalo mínimo de cada tarefa e as pastas acompanhadas. */
export class TaskTriggers {
  private readonly last = new Map<string, number>()
  private readonly watchers = new Map<string, { close(): void; known: Set<string> }>()
  private readonly pending = new Map<string, { files: Set<string>; timer: NodeJS.Timeout }>()

  constructor(private readonly deps: TriggerDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  /** Um evento aconteceu: roda cada tarefa dele (que não rodou há pouco). */
  fire(trigger: TaskTrigger, event: string, only?: (task: ScheduledTask) => boolean): number {
    let ran = 0
    for (const task of tasksFor(this.deps.tasks(), trigger)) {
      if (only && !only(task)) continue
      const last = this.last.get(task.id)
      if (last !== undefined && this.now() - last < TRIGGER_COOLDOWN_MS) continue
      this.last.set(task.id, this.now())
      this.deps.run(task, event)
      ran++
    }
    return ran
  }

  /** As pastas das tarefas de arquivo novo: liga as que entraram e desliga as que saíram. */
  refreshFolders(): void {
    const wanted = new Map<string, ScheduledTask[]>()
    for (const task of tasksFor(this.deps.tasks(), 'new-file')) {
      if (!task.watch) continue
      const dir = task.watch.replace(/^~(?=\/|\\|$)/, homedir())
      wanted.set(dir, [...(wanted.get(dir) ?? []), task])
    }
    for (const [dir, watcher] of this.watchers) {
      if (wanted.has(dir)) continue
      watcher.close()
      this.watchers.delete(dir)
    }
    const list = this.deps.list ?? ((dir: string) => readdirSync(dir))
    for (const dir of wanted.keys()) {
      if (this.watchers.has(dir)) continue
      let known: Set<string>
      try {
        // O que já estava lá não conta como novo.
        known = new Set(list(dir))
      } catch {
        continue
      }
      const onChange = (): void => this.scan(dir)
      try {
        const handle = (this.deps.watch ?? defaultWatch)(dir, onChange)
        this.watchers.set(dir, { close: () => handle.close(), known })
      } catch {
        // A pasta sumiu ou não dá para acompanhar: a tarefa fica sem rodar.
      }
    }
  }

  /** Confere a pasta: os nomes que apareceram esperam um pouco (chegam juntos) e rodam. */
  scan(dir: string): void {
    const watcher = this.watchers.get(dir)
    if (!watcher) return
    let names: string[]
    try {
      names = (this.deps.list ?? ((path: string) => readdirSync(path)))(dir)
    } catch {
      return
    }
    const fresh = names.filter((name) => !watcher.known.has(name) && !name.startsWith('.'))
    // Um arquivo baixando (.part, .crdownload) ainda não chegou.
    const arrived = fresh.filter((name) => !/\.(part|crdownload|download|tmp)$/i.test(name))
    for (const name of names) watcher.known.add(name)
    // O arquivo temporário que vira o de verdade aparece de novo, com o nome final.
    for (const name of fresh) if (!arrived.includes(name)) watcher.known.delete(name)
    if (!arrived.length) return
    const batch = this.pending.get(dir)
    if (batch) {
      for (const name of arrived) batch.files.add(name)
      return
    }
    const files = new Set(arrived)
    const timer = setTimeout(() => {
      this.pending.delete(dir)
      const listed = [...files].slice(0, MAX_FILES_LISTED).map((name) => join(dir, name))
      const event =
        files.size === 1
          ? t('Um arquivo novo em {dir}: {file}', { dir, file: listed[0] })
          : t('{count} arquivos novos em {dir}:\n{files}', {
              count: files.size,
              dir,
              files: listed.map((path) => `- ${path}`).join('\n')
            })
      this.fire('new-file', event, (task) => {
        const watched = (task.watch ?? '').replace(/^~(?=\/|\\|$)/, homedir())
        return watched === dir
      })
    }, FOLDER_SETTLE_MS)
    this.pending.set(dir, { files, timer })
  }

  dispose(): void {
    for (const watcher of this.watchers.values()) watcher.close()
    this.watchers.clear()
    for (const batch of this.pending.values()) clearTimeout(batch.timer)
    this.pending.clear()
  }
}

/** O fs.watch da pasta (sem descer nas de dentro), quieto se der erro. */
function defaultWatch(dir: string, onChange: () => void): FSWatcher {
  const watcher = watch(dir, { persistent: false }, () => onChange())
  watcher.on('error', () => watcher.close())
  return watcher
}

/** O gatilho e o {evento} de um alerta do GitHub; null para os que não rodam tarefa. */
export function githubTrigger(alert: GithubAlert): { trigger: TaskTrigger; event: string } | null {
  if (alert.kind !== 'ci-failed' && alert.kind !== 'review') return null
  const { title, body, url } = describeAlert(alert)
  return {
    trigger: alert.kind === 'ci-failed' ? 'ci-failed' : 'pr-review',
    event: `${title}: ${body} (${url})`
  }
}

/** As tarefas do app: o agendador, os gatilhos e o rodar (com o aviso). */
export function setupTasks(options: {
  chat: () => Chat | null
  notify: Notify
  github: GithubAlerts
  /** A tela bloqueada (o 'change' com true ao bloquear e false ao desbloquear). */
  screenLock: { on(event: 'change', listener: (locked: boolean) => void): unknown }
}): {
  scheduler: TaskScheduler
  triggers: TaskTriggers
  /** Roda uma tarefa agora (o "Rodar agora" das configurações). */
  runNow(id: string): TaskResult
} {
  const { notify } = options
  const runTask = (task: ScheduledTask, late: boolean, event?: string): TaskResult => {
    const chat = options.chat()
    const result: TaskResult = chat
      ? chat.runTask(task, event)
      : { ok: false, message: t('O Wisp ainda está abrindo.') }
    if (result.ok) {
      notify(
        event
          ? t('Tarefa: {name}', { name: task.name })
          : late
            ? t('Tarefa agendada (atrasada): {name}', { name: task.name })
            : t('Tarefa agendada: {name}', { name: task.name }),
        t('Começou numa aba nova, no modo Pedir. O que precisar do seu clique espera no painel.'),
        () => options.chat()?.open()
      )
    } else {
      notify(t('A tarefa “{name}” não rodou', { name: task.name }), result.message)
    }
    return result
  }
  const scheduler = new TaskScheduler({
    tasks: () => getConfig().scheduledTasks,
    run: (task, late) => void runTask(task, late),
    file: join(DATA_DIR, 'tarefas.json')
  })
  const triggers = new TaskTriggers({
    tasks: () => getConfig().scheduledTasks,
    run: (task, event) => void runTask(task, false, event)
  })
  triggers.refreshFolders()
  options.github.onAlerts((alerts) => {
    for (const alert of alerts) {
      const fired = githubTrigger(alert)
      if (fired) triggers.fire(fired.trigger, fired.event)
    }
  })
  options.screenLock.on('change', (locked) => {
    if (locked) return
    const time = new Date().toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
    triggers.fire('unlock', t('A tela foi desbloqueada às {time}.', { time }))
  })
  onConfigChange(() => {
    scheduler.refresh()
    triggers.refreshFolders()
  })
  return {
    scheduler,
    triggers,
    runNow: (id) => {
      const task = getConfig().scheduledTasks.find((item) => item.id === id)
      if (!task) return { ok: false, message: t('Essa tarefa não existe mais.') }
      if ((task.trigger ?? 'time') !== 'time') {
        return runTask(task, false, t('(rodada à mão, sem um evento)'))
      }
      let result: TaskResult = { ok: true }
      scheduler.runNow(id, (ran) => (result = runTask(ran, false)))
      return result
    }
  }
}
