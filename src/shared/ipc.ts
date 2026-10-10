// Contrato de IPC entre main, preload e renderer.

export const IPC = {
  /** renderer → main: começou um arraste. Args: (offsetX, offsetY) do ponto agarrado. */
  mascotDragStart: 'mascot:drag-start',
  /** renderer → main: o arraste terminou (botão solto ou captura perdida). */
  mascotDragEnd: 'mascot:drag-end',
  /** renderer → main: clique sem arraste no mascote. */
  mascotClick: 'mascot:click',
  /** mascote → main: a página carregou e já ouve o estado (o main manda o atual). */
  mascotReady: 'mascot:ready',
  /** main → mascote: o estado mudou. Arg: MascotView. */
  mascotState: 'mascot:state',
  /** main → mascote: chegou um pedaço de texto da resposta (o brilho pulsa no ritmo). */
  mascotPulse: 'mascot:pulse',

  /** chat → main: a página carregou e já ouve eventos (o main manda os que guardou). */
  chatReady: 'chat:ready',
  /** chat → main: mensagem do usuário. Args: (texto, caminhos dos arquivos anexados). */
  chatSend: 'chat:send',
  /** chat → main: parar a resposta em andamento. */
  chatStop: 'chat:stop',
  /** chat → main: começar uma conversa nova. */
  chatNew: 'chat:new',
  /** chat → main: trocar o modelo. Arg: um de MODEL_CHOICES, ou null para o padrão. */
  chatModel: 'chat:model',
  /**
   * chat → main (invoke): guarda uma imagem colada (Ctrl+V) para virar anexo. Args: (bytes,
   * tipo MIME). Devolve PastedImage.
   */
  chatPaste: 'chat:paste',
  /** chat → main: esconder o painel. */
  chatHide: 'chat:hide',
  /** chat → main: resposta a um card de permissão. Args: (id, PermissionDecision). */
  chatPermission: 'chat:permission',
  /**
   * chat → main: respostas a uma pergunta do Claude. Args: (id, mapa pergunta → resposta, ou
   * null para pular).
   */
  chatAnswer: 'chat:answer',
  /** main → chat: um ChatEvent. */
  chatEvent: 'chat:event',
  /** main → chat: o humor do mascote mudou (o avatar do cabeçalho acompanha). Arg: MascotState. */
  chatMood: 'chat:mood',
  /** main → chat: o painel acabou de aparecer (para a animação de abertura). */
  chatShown: 'chat:shown',

  /** chat → main (invoke): as conversas guardadas. Devolve ConversationSummary[]. */
  historyList: 'history:list',
  /** chat → main (invoke): reabre uma conversa do histórico. Arg: id. Devolve boolean. */
  historyOpen: 'history:open',
  /** chat → main (invoke): apaga uma conversa do histórico. Arg: id. Devolve boolean. */
  historyDelete: 'history:delete'
} as const

/** Estados do mascote, ligados aos eventos da conversa (seção 5.3 da especificação). */
export type MascotState = 'idle' | 'talking' | 'working' | 'permission' | 'happy' | 'error'

/** O que o mascote mostra: o estado e para que lado fica o painel de chat. */
export interface MascotView {
  state: MascotState
  look: 'left' | 'right'
}

/** Limites dos anexos de uma mensagem. O chat confere ao anexar; o main, de novo, ao copiar. */
export const ATTACHMENT_LIMITS = { maxFiles: 20, maxBytes: 50 * 1024 * 1024 } as const

/** Um anexo saindo com a mensagem: o arquivo e, se for imagem, a miniatura (data URL). */
export interface OutgoingAttachment {
  path: string
  thumbnail?: string
}

/** Como um anexo aparece na conversa. */
export interface AttachmentPreview {
  name: string
  size: number
  /** Miniatura (data URL) quando é uma imagem que dá para mostrar. */
  thumbnail?: string
}

/** Imagem colada guardada pelo main, ou por que não deu. */
export type PastedImage = { path: string; name: string } | { error: string }

/**
 * Modelos da pílula, pelos apelidos que o `--model` do Claude Code aceita (cada um aponta para
 * a versão mais nova da família). null é o padrão do Claude Code.
 */
export const MODEL_CHOICES = ['haiku', 'sonnet', 'opus', 'fable'] as const

/** Uma janela de uso do plano: quanto já foi usado (0 a 1) e quando ela reinicia. */
export interface UsageWindow {
  used: number
  /** Segundos Unix; null se o CLI não disse. */
  resetsAt: number | null
}

/** Uso do plano do Claude, como o Claude Code informa a cada resposta. */
export interface PlanUsage {
  /** Janela de 5 horas. */
  session: UsageWindow | null
  /** Janela de 7 dias. */
  week: UsageWindow | null
  /** O limite foi atingido. */
  limited: boolean
  /** Quando a informação chegou (ms Unix). */
  at: number
}

/** Trecho de um diff: cada linha começa com ' ' (contexto), '-' (saiu) ou '+' (entrou). */
export interface DiffHunk {
  oldStart: number
  newStart: number
  lines: string[]
}

/** O que uma edição de arquivo mudou. */
export interface FileDiff {
  added: number
  removed: number
  hunks: DiffHunk[]
  /** Linhas demais: os trechos trazem só o começo (as contagens valem para tudo). */
  truncated: boolean
}

/** Uma conversa guardada no histórico. */
export interface ConversationSummary {
  id: string
  /** A primeira mensagem, encurtada. */
  title: string
  /** ms Unix. */
  createdAt: number
  updatedAt: number
  /** É a conversa aberta no painel. */
  current: boolean
}

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
  /**
   * Resultado da ferramenta (texto, possivelmente cortado). Edições de arquivo trazem o diff,
   * quando o Claude Code o informa.
   */
  | { type: 'tool-result'; id: string; isError: boolean; output: string; diff?: FileDiff }
  /** O turno acabou: normalmente, com erro ou porque o usuário parou. */
  | { type: 'turn-end'; outcome: 'done' | 'error' | 'stopped' }
  /** Aviso para mostrar na conversa (texto em Markdown). */
  | { type: 'notice'; level: NoticeLevel; text: string }
  /**
   * O Claude quer usar uma ferramenta que precisa de aprovação. `toolUseId` liga o pedido ao
   * card da ferramenta.
   */
  | { type: 'permission-request'; id: string; toolName: string; input: unknown; toolUseId?: string }
  /**
   * O pedido foi respondido, ou cancelado (o turno acabou ou o Claude desistiu). Perguntas
   * respondidas trazem as respostas.
   */
  | {
      type: 'permission-resolved'
      id: string
      decision: PermissionDecision | 'answered' | 'cancelled'
      answers?: Record<string, string>
    }
  /**
   * A conversa recomeçou. Vem pelo mesmo canal dos outros eventos, então nada da conversa
   * anterior chega depois dele.
   */
  | { type: 'reset' }
  /**
   * O modelo: o escolhido na pílula (null é o padrão do Claude Code) e o que respondeu por
   * último, como o CLI o chama (por exemplo "claude-sonnet-5-5"), se já se sabe.
   */
  | { type: 'model'; choice: string | null; active: string | null }
  /** O uso do plano mudou. */
  | { type: 'usage'; usage: PlanUsage }
  /**
   * Uma mensagem do usuário, ao reabrir uma conversa do histórico. Ao vivo, o chat mostra a
   * mensagem na hora do envio, sem esperar o main.
   */
  | { type: 'user'; text: string; attachments: AttachmentPreview[] }
  /** Fim da reabertura de uma conversa do histórico (vem depois das mensagens dela). */
  | { type: 'restored'; createdAt: number }

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
    /** Avisa que a página está pronta. Chame depois de registrar o onState. */
    ready(): void
    /** Registra quem recebe as mudanças de estado; devolve a função que cancela. */
    onState(listener: (view: MascotView) => void): () => void
    onPulse(listener: () => void): () => void
  }
  chat: {
    /** Avisa que a página está pronta. Chame depois de registrar o onEvent. */
    ready(): void
    /** Manda uma mensagem com os anexos (caminhos: veja pathForFile e savePasted). */
    send(text: string, attachments: OutgoingAttachment[]): void
    /** Caminho no disco de um File vindo de um arraste ou do seletor de arquivos ('' se não houver). */
    pathForFile(file: File): string
    /** Guarda uma imagem colada num arquivo, para ela poder ser anexada. */
    savePasted(data: ArrayBuffer, type: string): Promise<PastedImage>
    stop(): void
    newConversation(): void
    hide(): void
    /** Troca o modelo (um de MODEL_CHOICES, ou null para o padrão). */
    setModel(choice: string | null): void
    answerPermission(id: string, decision: PermissionDecision): void
    /** Responde uma pergunta do Claude (texto da pergunta → resposta); null pula. */
    answerQuestion(id: string, answers: Record<string, string> | null): void
    /** Registra quem recebe os eventos da conversa; devolve a função que cancela. */
    onEvent(listener: (event: ChatEvent) => void): () => void
    /** O humor do mascote, para o avatar do cabeçalho. */
    onMood(listener: (state: MascotState) => void): () => void
    /** O painel acabou de aparecer. */
    onShown(listener: () => void): () => void
  }
  history: {
    list(): Promise<ConversationSummary[]>
    /** Reabre a conversa: ela chega pelo onEvent, depois de um 'reset'. */
    open(id: string): Promise<boolean>
    remove(id: string): Promise<boolean>
  }
}
