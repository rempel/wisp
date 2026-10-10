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
  /** chat → main: mensagem do usuário. Args: (texto, caminhos dos arquivos anexados). */
  chatSend: 'chat:send',
  /** chat → main: parar a resposta em andamento. */
  chatStop: 'chat:stop',
  /** chat → main: começar uma conversa nova. */
  chatNew: 'chat:new',
  /** chat → main: esconder o painel. */
  chatHide: 'chat:hide',
  /** chat → main: resposta a um card de permissão. Args: (id, PermissionDecision). */
  chatPermission: 'chat:permission',
  /** main → chat: um ChatEvent. */
  chatEvent: 'chat:event'
} as const

/** Limites dos anexos de uma mensagem. O chat confere ao anexar; o main, de novo, ao copiar. */
export const ATTACHMENT_LIMITS = { maxFiles: 20, maxBytes: 50 * 1024 * 1024 } as const

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
   * O Claude quer usar uma ferramenta que precisa de aprovação. `toolUseId` liga o pedido ao
   * card da ferramenta.
   */
  | { type: 'permission-request'; id: string; toolName: string; input: unknown; toolUseId?: string }
  /** O pedido foi respondido, ou cancelado porque o turno acabou. */
  | { type: 'permission-resolved'; id: string; decision: PermissionDecision | 'cancelled' }
  /**
   * A conversa recomeçou. Vem pelo mesmo canal dos outros eventos, então nada da conversa
   * anterior chega depois dele.
   */
  | { type: 'reset' }

/** "allow-always" vale até a conversa recomeçar (Permitir sempre nesta conversa). */
export type PermissionDecision = 'allow' | 'allow-always' | 'deny'

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
    /** Manda uma mensagem; `attachments` são caminhos de arquivos (veja pathForFile). */
    send(text: string, attachments: string[]): void
    /** Caminho no disco de um File vindo de um arraste ou do seletor de arquivos ('' se não houver). */
    pathForFile(file: File): string
    stop(): void
    newConversation(): void
    hide(): void
    answerPermission(id: string, decision: PermissionDecision): void
    /** Registra quem recebe os eventos da conversa; devolve a função que cancela. */
    onEvent(listener: (event: ChatEvent) => void): () => void
  }
}
