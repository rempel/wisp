// Contrato de IPC entre main, preload e renderer.

export const IPC = {
  /** renderer → main: começou um arraste. Args: (offsetX, offsetY) do ponto agarrado. */
  mascotDragStart: 'mascot:drag-start',
  /** renderer → main: o arraste terminou (botão solto ou captura perdida). */
  mascotDragEnd: 'mascot:drag-end',
  /** renderer → main: clique sem arraste no mascote. */
  mascotClick: 'mascot:click',

  /** chat → main: a página carregou e já ouve eventos (o main manda os que guardou). */
  chatReady: 'chat:ready',
  /** chat → main: mensagem do usuário. Arg: texto. */
  chatSend: 'chat:send',
  /** chat → main: parar a resposta em andamento. */
  chatStop: 'chat:stop',
  /** chat → main: começar uma conversa nova. */
  chatNew: 'chat:new',
  /** chat → main: esconder o painel. */
  chatHide: 'chat:hide',
  /** main → chat: um ChatEvent. */
  chatEvent: 'chat:event'
} as const

/**
 * O que o main conta ao chat sobre a conversa. É uma versão enxuta da saída stream-json do
 * Claude Code, para a interface não depender do formato do CLI.
 */
export type ChatEvent =
  /** Começou ou terminou um turno (do envio da mensagem até a resposta final). */
  | { type: 'busy'; busy: boolean }
  /** Pedaço de texto da resposta. Blocos diferentes têm ids diferentes. */
  | { type: 'text'; blockId: string; delta: string }
  /** O Claude começou a chamar uma ferramenta. */
  | { type: 'tool-start'; id: string; name: string }
  /** Os argumentos completos da chamada. */
  | { type: 'tool-input'; id: string; name: string; input: unknown }
  /** Resultado da ferramenta (texto, possivelmente cortado). */
  | { type: 'tool-result'; id: string; isError: boolean; output: string }
  /** O turno acabou: normalmente, com erro ou porque o usuário parou. */
  | { type: 'turn-end'; outcome: 'done' | 'error' | 'stopped' }
  /** Aviso para mostrar na conversa (texto em Markdown). */
  | { type: 'notice'; level: NoticeLevel; text: string }
  /**
   * A conversa recomeçou. Vem pelo mesmo canal dos outros eventos, então nada da conversa
   * anterior chega depois dele.
   */
  | { type: 'reset' }

export type NoticeLevel = 'info' | 'warning' | 'error'

/** API que o preload expõe ao renderer como `window.wisp`. */
export interface WispApi {
  mascot: {
    /** Começa a arrastar o mascote; o offset é o ponto agarrado dentro da janela (px CSS). */
    dragStart(offsetX: number, offsetY: number): void
    dragEnd(): void
    click(): void
  }
  chat: {
    /** Avisa que a página está pronta. Chame depois de registrar o onEvent. */
    ready(): void
    send(text: string): void
    stop(): void
    newConversation(): void
    hide(): void
    /** Registra quem recebe os eventos da conversa; devolve a função que cancela. */
    onEvent(listener: (event: ChatEvent) => void): () => void
  }
}
