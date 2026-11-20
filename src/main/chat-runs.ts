// O que o painel acompanha das conversas para o resto do Wisp (Fases 82 a 85), separado do chat.ts
// para ele caber no limite: as tarefas que rodam (e as quietas, do batimento), quem quer saber do
// fim de cada turno, e o dia da Wisp (uma sessão por dia, e o primeiro abrir do dia a mostra).

import type { TaskDoneListener } from './chat-types'
import type { ChatTabs } from './chat-tabs'
import type { Conversation } from './conversation'
import { distiller } from './memory-setup'
import { dayOf } from './personal-memory'
import type { ScheduledTask } from '../shared/prompts'
import { t } from '../shared/i18n'

type Outcome = 'done' | 'error' | 'stopped'

/** As tarefas que rodam e quem quer saber dos turnos. */
export class ChatRuns {
  private readonly tasks = new Map<string, ScheduledTask>()
  /** As do batimento (Fase 84): não aparecem e não são destiladas. */
  private readonly quiet = new Set<string>()
  private readonly turnListeners: ((conversation: Conversation, outcome: Outcome) => void)[] = []
  private readonly taskListeners: TaskDoneListener[] = []

  /** Uma tarefa começou nesta conversa (Fase 83). */
  track(conversation: string, task: ScheduledTask, quiet: boolean): void {
    this.tasks.set(conversation, task)
    if (quiet) this.quiet.add(conversation)
  }

  forget(conversation: string): void {
    this.quiet.delete(conversation)
    this.tasks.delete(conversation)
  }

  onTurnEnd(listener: (conversation: Conversation, outcome: Outcome) => void): void {
    this.turnListeners.push(listener)
  }

  onTaskDone(listener: TaskDoneListener): void {
    this.taskListeners.push(listener)
  }

  /**
   * O fim de um turno: a destilação fica sabendo (menos das quietas), quem pediu também, e uma
   * tarefa que terminou o primeiro turno avisa quem quer o resultado.
   */
  turnEnded(conversation: Conversation, outcome: Outcome): void {
    if (!this.quiet.has(conversation.id)) distiller().touch(conversation.historyId)
    for (const listener of this.turnListeners) listener(conversation, outcome)
    const task = this.tasks.get(conversation.id)
    if (!task) return
    this.tasks.delete(conversation.id)
    for (const listener of this.taskListeners) listener(task, conversation, outcome)
  }
}

/**
 * O dia da Wisp (Fase 82): virou o dia e ela está parada (sem resposta no meio nem card), ela
 * recomeça, e a de ontem fica no histórico. Conferido ao abrir e de minuto em minuto. Devolve o
 * que mostra a Wisp no primeiro abrir do painel no dia.
 */
export function watchMainDay(tabs: ChatTabs, show: (id: string) => void): () => void {
  const roll = (): void => {
    const main = tabs.main()
    const started = main.history.startedAt
    if (!started || dayOf(started) === dayOf(Date.now())) return
    if (main.busy || main.pendingCount() > 0) return
    main.reset()
    main.notice('info', t('Um dia novo: a conversa de ontem ficou no histórico.'))
  }
  roll()
  setInterval(roll, 60_000).unref()
  let shownDay = ''
  return () => {
    const today = dayOf(Date.now())
    if (shownDay === today) return
    shownDay = today
    show(tabs.main().id)
  }
}
