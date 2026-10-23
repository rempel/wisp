// As tarefas agendadas (Fase 26): cada uma roda o prompt dela no horário, numa aba nova, sempre no
// modo Pedir. O que já rodou fica num arquivo (sobrevive ao app fechar), para nada rodar duas
// vezes. Com o computador desligado (ou o Wisp fechado) na hora, a tarefa roda quando o Wisp
// abrir, se ainda for até CATCH_UP_MS depois; mais tarde que isso, fica para a próxima.

import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { lastDue, nextRun, scheduleSignature } from '../shared/prompts'
import type { ScheduledTask } from '../shared/prompts'

/** Até quanto tempo depois da hora uma tarefa perdida ainda roda. */
export const CATCH_UP_MS = 2 * 60 * 60_000
/**
 * O temporizador nunca espera mais que isso: depois de suspender o computador ou de o relógio
 * mudar, a tarefa sai no máximo um minuto atrasada.
 */
const MAX_WAIT_MS = 60_000

interface Seen {
  /** A última vez que rodou (ou que o Wisp passou a contar, para uma tarefa nova). */
  last: number
  /** O horário de quando contou: mexer nele recomeça a contagem. */
  sig: string
  /** Rodou de verdade (e não só começou a contar). */
  ran?: boolean
}

export interface SchedulerDeps {
  tasks(): ScheduledTask[]
  /** Roda a tarefa; `late` se a hora passou com o Wisp fechado. */
  run(task: ScheduledTask, late: boolean): void
  file: string
  now?(): number
}

export class TaskScheduler {
  private seen: Record<string, Seen> = {}
  private timer: NodeJS.Timeout | null = null
  private started = false

  constructor(private readonly deps: SchedulerDeps) {
    try {
      const data = JSON.parse(readFileSync(deps.file, 'utf8')) as unknown
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        for (const [id, value] of Object.entries(data as Record<string, unknown>)) {
          const item = value as Partial<Seen> | null
          if (typeof item?.last === 'number' && typeof item.sig === 'string') {
            this.seen[id] = { last: item.last, sig: item.sig, ...(item.ran ? { ran: true } : {}) }
          }
        }
      }
    } catch {
      // Sem arquivo (ou estragado): as tarefas começam a contar agora.
    }
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  start(): void {
    this.started = true
    this.tick()
  }

  /** A lista ou os horários mudaram (nas configurações ou no arquivo). */
  refresh(): void {
    if (this.started) this.tick()
  }

  /** O computador voltou da suspensão: confere na hora. */
  resume(): void {
    if (this.started) this.tick()
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.started = false
  }

  /** Quando cada tarefa rodou de verdade pela última vez. */
  runs(): Record<string, number> {
    return Object.fromEntries(
      Object.entries(this.seen)
        .filter(([, item]) => item.ran)
        .map(([id, item]) => [id, item.last])
    )
  }

  /**
   * Roda uma tarefa agora (o botão das configurações), ligada ou não; `run` troca o de sempre
   * (para quem pediu saber como foi). Devolve false se a tarefa não existe.
   */
  runNow(id: string, run?: (task: ScheduledTask) => void): boolean {
    const task = this.deps.tasks().find((item) => item.id === id)
    if (!task) return false
    this.mark(task, this.now())
    this.save()
    if (run) run(task)
    else this.deps.run(task, false)
    return true
  }

  private mark(task: ScheduledTask, when: number): void {
    this.seen[task.id] = { last: when, sig: scheduleSignature(task), ran: true }
  }

  private tick(): void {
    this.timer = null
    const now = this.now()
    const tasks = this.deps.tasks()
    let changed = false
    const due: { task: ScheduledTask; late: boolean }[] = []
    for (const task of tasks) {
      const sig = scheduleSignature(task)
      const seen = this.seen[task.id]
      // Uma tarefa nova (ou com o horário mudado) conta a partir de agora: nada do passado roda.
      if (!seen || seen.sig !== sig) {
        this.seen[task.id] = { last: now, sig, ...(seen?.ran ? { ran: true } : {}) }
        changed = true
        continue
      }
      const when = lastDue(task, new Date(now))
      if (!when || when.getTime() <= seen.last) continue
      if (now - when.getTime() > CATCH_UP_MS) {
        // Passou da hora demais: fica para a próxima, sem rodar.
        this.seen[task.id] = { ...seen, last: when.getTime() }
        changed = true
        continue
      }
      this.mark(task, now)
      changed = true
      due.push({ task, late: now - when.getTime() > MAX_WAIT_MS })
    }
    // As que saíram da lista saem do arquivo também.
    const ids = new Set(tasks.map((task) => task.id))
    for (const id of Object.keys(this.seen)) {
      if (!ids.has(id)) {
        delete this.seen[id]
        changed = true
      }
    }
    if (changed) this.save()
    for (const { task, late } of due) this.deps.run(task, late)
    this.schedule(tasks, now)
  }

  private schedule(tasks: ScheduledTask[], now: number): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (!this.started) return
    const next = tasks
      .map((task) => nextRun(task, new Date(now))?.getTime() ?? Infinity)
      .reduce((a, b) => Math.min(a, b), Infinity)
    if (next === Infinity) return
    const wait = Math.min(Math.max(0, next - now), MAX_WAIT_MS)
    this.timer = setTimeout(() => this.tick(), wait)
    this.timer.unref?.()
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.deps.file), { recursive: true, mode: 0o700 })
      const tmp = `${this.deps.file}.tmp`
      writeFileSync(tmp, JSON.stringify(this.seen, null, 2) + '\n', { mode: 0o600 })
      chmodSync(tmp, 0o600)
      renameSync(tmp, this.deps.file)
    } catch (err) {
      console.warn('[wisp] não consegui gravar as tarefas agendadas:', err)
    }
  }
}
