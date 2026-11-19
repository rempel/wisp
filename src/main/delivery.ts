// A entrega do resultado (Fases 83 e 84): quando uma tarefa agendada (ou o batimento) termina, o
// que o Claude respondeu vai para os lugares dela: a conversa principal (a Wisp), a notificação,
// o Telegram (Fase 85) e o mascote. E entra no diário do dia, como o resto da memória.

import type { ChatEvent } from '../shared/ipc'
import type { TaskDelivery } from '../shared/prompts'
import { TASK_DELIVERIES } from '../shared/prompts'
import { messagesOf } from './history-search'

/** Os canais que se registram depois (o Telegram, Fase 85). */
export const channels: { telegram?: (title: string, text: string) => void } = {}

export interface DeliveryDeps {
  /** Um aviso em Markdown na Wisp. */
  postMain(text: string): void
  notify(title: string, body: string): void
  /** O balão do mascote (na ilha) e o sininho. */
  mascot(title: string, text: string): void
  /** Uma linha no diário de hoje. */
  diary(line: string, origin: { conversation?: string; title: string }): void
}

export interface DeliveredResult {
  title: string
  text: string
  outcome: 'done' | 'error' | 'stopped'
  /** O id da conversa no histórico, para a origem no diário. */
  conversation?: string
}

/** O que o Claude respondeu no último turno: as mensagens dele depois da última sua. */
export function lastReply(events: ChatEvent[]): string {
  const messages = messagesOf(events)
  const lastUser = messages.map((message) => message.who).lastIndexOf('user')
  return messages
    .slice(lastUser + 1)
    .filter((message) => message.who === 'claude')
    .map((message) => message.text.trim())
    .filter(Boolean)
    .join('\n\n')
}

const firstLine = (text: string, max: number): string => {
  const line = text
    .replace(/^#+\s*/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\*\*|__|`+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** Manda o resultado para os lugares pedidos (sem `to`, para todos). */
export function deliver(
  result: DeliveredResult,
  to: TaskDelivery[] | undefined,
  deps: DeliveryDeps
): TaskDelivery[] {
  const wanted = new Set(to?.length ? to : TASK_DELIVERIES)
  const text =
    result.text.trim() ||
    (result.outcome === 'done' ? '(sem resposta em texto)' : '(a tarefa não terminou)')
  const sent: TaskDelivery[] = []
  if (wanted.has('main')) {
    deps.postMain(`**${result.title}**\n\n${text}`)
    sent.push('main')
  }
  if (wanted.has('notify')) {
    deps.notify(result.title, firstLine(text, 300))
    sent.push('notify')
  }
  if (wanted.has('mascot')) {
    deps.mascot(result.title, firstLine(text, 140))
    sent.push('mascot')
  }
  if (wanted.has('telegram') && channels.telegram) {
    channels.telegram(result.title, text)
    sent.push('telegram')
  }
  deps.diary(`${result.title}: ${firstLine(text, 280)}`, {
    ...(result.conversation ? { conversation: result.conversation } : {}),
    title: result.title
  })
  return sent
}
