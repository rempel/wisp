// Enquanto você estava fora (Fase 24): com a tela bloqueada, o Wisp anota o que aconteceu nas
// conversas (as respostas que ficaram prontas, as que deram erro, os pedidos que o celular deixou
// expirar) e, ao desbloquear, junta tudo numa notificação, com o que ainda espera você. Só os
// títulos das abas, nada do conteúdo.

import type { ChatEvent } from '../shared/ipc'

export interface AwaySummary {
  title: string
  body: string
}

/** Quantos títulos de abas a notificação lista antes do "e mais". */
const MAX_TITLES = 3

const list = (titles: string[]): string => {
  const shown = titles.slice(0, MAX_TITLES).map((title) => `“${title}”`)
  const more = titles.length - shown.length
  return more > 0 ? `${shown.join(', ')} e mais ${more}` : shown.join(', ')
}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`

/** O resumo; null se nada aconteceu e nada espera. */
export function awaySummary(away: {
  done: string[]
  failed: string[]
  expired: number
  waiting: number
}): AwaySummary | null {
  const lines: string[] = []
  if (away.done.length) {
    lines.push(
      `${plural(away.done.length, 'resposta pronta', 'respostas prontas')}: ${list(away.done)}.`
    )
  }
  if (away.failed.length) {
    lines.push(`${plural(away.failed.length, 'deu erro', 'deram erro')}: ${list(away.failed)}.`)
  }
  if (away.expired) {
    lines.push(
      `${plural(away.expired, 'pedido ficou negado', 'pedidos ficaram negados')} por tempo, no celular.`
    )
  }
  if (away.waiting) {
    lines.push(`${plural(away.waiting, 'pedido espera', 'pedidos esperam')} você no painel.`)
  }
  if (!lines.length) return null
  return { title: 'Enquanto você estava fora', body: lines.join('\n') }
}

/** Anota o que acontece entre o bloqueio e o desbloqueio da tela. */
export class AwayTracker {
  private since: number | null = null
  private readonly done = new Map<string, string>()
  private readonly failed = new Map<string, string>()
  private expired = 0

  get away(): boolean {
    return this.since !== null
  }

  /** A tela bloqueou: começa a anotar do zero. */
  lock(now = Date.now()): void {
    if (this.since !== null) return
    this.since = now
    this.done.clear()
    this.failed.clear()
    this.expired = 0
  }

  /** Um evento de uma conversa (`title`: o título da aba). */
  onEvent(event: ChatEvent, conversation: string, title: string): void {
    if (this.since === null || event.type !== 'turn-end') return
    if (event.outcome === 'done') {
      this.failed.delete(conversation)
      this.done.set(conversation, title)
    } else if (event.outcome === 'error') {
      this.done.delete(conversation)
      this.failed.set(conversation, title)
    }
  }

  /** Um pedido que foi para o celular e expirou. */
  expiredOnPhone(): void {
    if (this.since !== null) this.expired++
  }

  /** A tela desbloqueou: o resumo (null se não houve nada), com os pedidos que ainda esperam. */
  unlock(waiting: number): AwaySummary | null {
    if (this.since === null) return null
    this.since = null
    return awaySummary({
      done: [...this.done.values()],
      failed: [...this.failed.values()],
      expired: this.expired,
      waiting
    })
  }
}
