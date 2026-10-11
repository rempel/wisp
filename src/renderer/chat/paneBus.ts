import type { DroppedFiles } from '../../shared/ipc'

/** O que a casca do painel manda para o painel de uma conversa. */
export type PaneMessage =
  /** Um texto ditado para o fim da caixa. */
  | { type: 'compose'; text: string }
  /** Arquivos prontos para anexar (soltos no mascote). */
  | { type: 'attach'; dropped: DroppedFiles }
  /** Arquivos soltos na janela: só dá para ler o DataTransfer durante o evento. */
  | { type: 'drop'; data: DataTransfer }
  /** Volta o foco para a caixa de texto. */
  | { type: 'focus' }

/**
 * Entrega mensagens ao painel de uma conversa. O ditado e os anexos esperam, se o painel ainda
 * não estiver na tela (a aba acabou de aparecer); o arraste não espera, porque o DataTransfer só
 * vale durante o evento.
 */
export class PaneBus {
  private readonly handlers = new Map<string, (message: PaneMessage) => void>()
  private readonly waiting = new Map<string, PaneMessage[]>()

  on(conversation: string, handler: (message: PaneMessage) => void): () => void {
    this.handlers.set(conversation, handler)
    for (const message of this.waiting.get(conversation) ?? []) handler(message)
    this.waiting.delete(conversation)
    return () => {
      if (this.handlers.get(conversation) === handler) this.handlers.delete(conversation)
    }
  }

  emit(conversation: string, message: PaneMessage): void {
    const handler = this.handlers.get(conversation)
    if (handler) return handler(message)
    if (message.type === 'drop' || message.type === 'focus') return
    this.waiting.set(conversation, [...(this.waiting.get(conversation) ?? []), message])
  }
}
