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
  /** main → mascote: para onde os olhos olham (Gaze), ou null para voltarem ao centro. */
  mascotGaze: 'mascot:gaze',
  /** mascote → main: o cursor entrou (true) ou saiu (false) de cima do mascote. */
  mascotHover: 'mascot:hover',
  /** mascote → main: o usuário mexeu com o mascote (cutucou, fez carinho). */
  mascotActivity: 'mascot:activity',
  /** mascote → main: arquivos soltos no mascote, para anexar no painel. Arg: DroppedFiles. */
  mascotDrop: 'mascot:drop',
  /** mascote → main: clique com o botão direito (abre o menu do mascote). */
  mascotMenu: 'mascot:menu',
  /** main → mascote: uma reação que vem de fora da página. Arg: MascotReaction. */
  mascotReact: 'mascot:react',
  /** main → mascote: o acessório do dia. Arg: Accessory | null. */
  mascotAccessory: 'mascot:accessory',
  /** main → mascote: tocar um som. Args: (SoundName, volume de 0 a 1). */
  mascotSound: 'mascot:sound',
  /**
   * main → mascote: um som da pasta de sons do usuário. Args: (SoundName, bytes do arquivo, ou
   * null quando ele sai da pasta e o som sintetizado volta).
   */
  mascotCustomSound: 'mascot:custom-sound',

  /** mascote → main: pede um som de reação (o main confere se os sons estão ligados). */
  soundPlay: 'sound:play',
  /** chat → main (invoke): os sons estão ligados? Devolve SoundSettings. */
  soundGet: 'sound:get',
  /** chat → main: liga ou desliga os sons. Arg: boolean. */
  soundSet: 'sound:set',
  /** main → chat: os sons foram ligados ou desligados. Arg: SoundSettings. */
  soundChanged: 'sound:changed',

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
  /** main → chat: arquivos soltos no mascote, para virar anexos. Arg: DroppedFiles. */
  chatAttach: 'chat:attach',
  /** chat → main: o usuário está mexendo no painel (o mascote não cochila). */
  chatActivity: 'chat:activity',
  /**
   * chat → main (invoke): tira um print da tela, com o painel fora da frente, para anexar.
   * Devolve DroppedFiles (um arquivo por tela, ou o motivo em problems).
   */
  chatCapture: 'chat:capture',
  /** main → chat: o que há de novo na área de transferência (ClipboardOffer), ou null. */
  chatClipboard: 'chat:clipboard',
  /** chat → main (invoke): usar o que foi copiado. Arg: id da oferta. Devolve ClipboardUse. */
  chatClipboardUse: 'chat:clipboard-use',
  /** chat → main: dispensar a oferta (o × do chip). Arg: id. */
  chatClipboardDismiss: 'chat:clipboard-dismiss',
  /** chat → main: o usuário copiou algo do painel (não é para oferecer de volta). */
  chatCopied: 'chat:copied',
  /** main → chat: um texto ditado, para a caixa de mensagem (o usuário revisa e envia). */
  chatCompose: 'chat:compose',

  /** main → mascote: o que fazer com o microfone e com a fala do Wisp. Arg: VoiceCommand. */
  voiceCommand: 'voice:command',
  /** mascote → main: o que a captura ouviu (ou por que não deu). Arg: VoiceCaptureEvent. */
  voiceEvent: 'voice:event',
  /** main → chat e mascote: em que pé está a voz. Arg: VoiceStatus. */
  voiceStatus: 'voice:status',
  /** main → chat: o volume do que o microfone ouve, de 0 a 1 (o botão do microfone pulsa). */
  voiceLevel: 'voice:level',
  /** chat → main: o botão do microfone (começa a ouvir; ouvindo, termina). */
  voiceToggle: 'voice:toggle',
  /** chat → main: desiste da escuta (Esc). */
  voiceCancel: 'voice:cancel',

  /** chat → main (invoke): as conversas guardadas. Devolve ConversationSummary[]. */
  historyList: 'history:list',
  /** chat → main (invoke): reabre uma conversa do histórico. Arg: id. Devolve boolean. */
  historyOpen: 'history:open',
  /** chat → main (invoke): apaga uma conversa do histórico. Arg: id. Devolve boolean. */
  historyDelete: 'history:delete',

  /** chat → main (invoke): as sessões do Claude Code no terminal. Devolve SessionsSnapshot. */
  sessionsGet: 'sessions:get',
  /** main → chat: as sessões mudaram (a página pede de novo com sessionsGet). */
  sessionsChanged: 'sessions:changed',
  /** main → chat: mostrar a aba Sessões (chegou um pedido de uma sessão). */
  sessionsShow: 'sessions:show',
  /** chat → main: resposta a um pedido de uma sessão. Args: (sessão, pedido, SessionAnswer). */
  sessionsAnswer: 'sessions:answer',
  /** chat → main (invoke): trazer o terminal da sessão para a frente. Arg: sessão. */
  sessionsFocus: 'sessions:focus',
  /** chat → main: abrir a pasta da sessão no editor. Arg: sessão. */
  sessionsFolder: 'sessions:folder',
  /** chat → main: continuar a sessão no chat do Wisp. Arg: sessão. */
  sessionsContinue: 'sessions:continue',
  /** chat → main: tirar uma sessão encerrada da lista. Arg: sessão. */
  sessionsForget: 'sessions:forget',
  /** chat → main (invoke): o que instalar ou tirar os hooks muda. Arg: HooksAction. */
  hooksPreview: 'hooks:preview',
  /** chat → main (invoke): grava a mudança vista na prévia. Args: (HooksAction, impressão). */
  hooksApply: 'hooks:apply'
} as const

/**
 * Estados do mascote, ligados aos eventos da conversa (seção 5.3 da especificação). 'sleeping' é
 * o cochilo: nada acontece há um tempo e o cursor está longe.
 */
export type MascotState =
  'idle' | 'talking' | 'working' | 'permission' | 'happy' | 'error' | 'sleeping'

/** O que o mascote mostra: o estado, para que lado fica o painel de chat e se há música. */
export interface MascotView {
  state: MascotState
  look: 'left' | 'right'
  /** Algum player está tocando: ocioso e acordado, ele dança. */
  music?: boolean
}

/**
 * Para onde os olhos do mascote olham: de -1 a 1 em cada eixo (o máximo é o canto do visor).
 * Positivo é para a direita e para baixo.
 */
export interface Gaze {
  x: number
  y: number
}

/** Reações que o main pede ao mascote: a saudação, quando o app abre, e o toque de um lembrete. */
export type MascotReaction = 'greet' | 'remind'

/**
 * Como a escuta termina: 'hold', quando o atalho for solto (o silêncio longo só por garantia);
 * 'auto', no silêncio depois da fala.
 */
export type VoiceMode = 'hold' | 'auto'

/** main → mascote: a captura do microfone e a fala do Wisp, que rodam na página do mascote. */
export type VoiceCommand =
  | { type: 'start'; id: number; mode: VoiceMode }
  /** O atalho foi solto logo (um toque): a escuta segue até o silêncio. */
  | { type: 'mode'; id: number; mode: VoiceMode }
  /** Acabou (o atalho foi solto): manda o que ouviu. */
  | { type: 'stop'; id: number }
  /** Desiste: o microfone fecha e o áudio é descartado. */
  | { type: 'cancel'; id: number }
  /** Fala uma resposta: PCM de 16 bits, mono, nesta taxa. */
  | { type: 'say'; id: number; pcm: Uint8Array; rate: number }
  /** Para de falar. */
  | { type: 'hush' }

/** mascote → main: o que aconteceu na captura (e na fala). */
export type VoiceCaptureEvent =
  /** O microfone abriu. */
  | { type: 'open'; id: number }
  /** Começou a fala (o detector de voz ouviu alguém). */
  | { type: 'speech'; id: number }
  /** O áudio da fala, de 500 ms antes dela até o fim: PCM de 16 bits a 16 kHz. */
  | { type: 'audio'; id: number; pcm: ArrayBuffer }
  /** Acabou sem fala. */
  | { type: 'empty'; id: number }
  | { type: 'error'; id: number; reason: 'denied' | 'no-device' | 'failed'; message: string }
  /** Acabou de falar a resposta. */
  | { type: 'said'; id: number }
  /** O volume do microfone (0 a 1), a cada 100 ms. */
  | { type: 'level'; id: number; level: number }

/** Em que pé está a voz, para o painel e o mascote. */
export interface VoiceStatus {
  state: 'idle' | 'listening' | 'transcribing' | 'speaking'
  /** De onde veio a escuta: o botão do painel ou o atalho. */
  source?: 'panel' | 'shortcut'
  /** Segurando o atalho (a escuta acaba quando ele for solto). */
  holding?: boolean
  /** Já ouviu fala nesta escuta. */
  heard?: boolean
}

/** Acessórios por data: gorro no Natal, óculos no verão. */
export type Accessory = 'christmas' | 'summer'

/**
 * Os sons do Wisp. O main toca os da conversa (abrir, fechar, enviar, pronto, pedido, erro); o
 * mascote, os das reações. Cada um pode ser trocado por um arquivo na pasta de sons.
 */
export const SOUND_NAMES = [
  'abrir',
  'fechar',
  'enviar',
  'pronto',
  'pedido',
  'erro',
  'cutucada',
  'tonto',
  'carinho',
  'oi',
  'absorver',
  'lembrete'
] as const

export type SoundName = (typeof SOUND_NAMES)[number]

export interface SoundSettings {
  enabled: boolean
  /** De 0 a 1. */
  volume: number
}

/** Um arquivo solto no mascote, a caminho dos anexos do painel. */
export interface DroppedFile {
  path: string
  name: string
  size: number
  /** Miniatura (data URL) quando é uma imagem. */
  thumbnail?: string
}

/** O que foi solto no mascote: os arquivos e o que ficou de fora (uma pasta, por exemplo). */
export interface DroppedFiles {
  files: DroppedFile[]
  problems: string[]
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
 * O chip "usar o que você copiou": só o tipo e o tamanho do que está na área de transferência.
 * O conteúdo fica no main até o usuário clicar.
 */
export interface ClipboardOffer {
  /** Identifica este conteúdo (para usar ou dispensar exatamente ele). */
  id: string
  kind: 'text' | 'link' | 'image'
  /** Texto: caracteres e linhas. */
  chars?: number
  lines?: number
  /** Link: o domínio. */
  host?: string
  /** Imagem: o tamanho. */
  width?: number
  height?: number
  /** Texto longo demais para a caixa: entra como anexo .txt. */
  asFile?: boolean
}

/** O que foi copiado, pronto para usar: texto para a caixa ou um anexo. */
export type ClipboardUse = { text: string } | { attachment: DroppedFile } | { error: string }

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

/** Instalar ou tirar os hooks do Wisp do settings.json do Claude Code. */
export type HooksAction = 'install' | 'uninstall'

export interface HooksStatus {
  installed: boolean
  /** Há entradas do Wisp, mas diferentes das de agora (de outra versão): vale reinstalar. */
  outdated: boolean
  /** O settings.json (com ~ no lugar da pasta pessoal). */
  settingsPath: string
  /** Por que não dá para ler ou mexer no arquivo. */
  problem?: string
}

/** A prévia da mudança no settings.json. */
export interface HookPreview {
  action: HooksAction
  settingsPath: string
  /** Onde fica o backup; null se o arquivo ainda não existe. */
  backupPath: string | null
  diff: DiffHunk[]
  /** Impressão digital do arquivo lido: só ele pode ser gravado com esta prévia. */
  fingerprint: string
  /** Há o que mudar (instalar de novo algo já instalado não muda nada). */
  changes: boolean
}

/** O estado de uma sessão do Claude Code que roda fora do Wisp (num terminal). */
export type ExternalState = 'working' | 'waiting' | 'idle' | 'ended' | 'error'

/** Um passo de uma sessão: uma chamada de ferramenta. */
export interface ExternalStep {
  id: string
  tool: string
  input?: unknown
  status: 'running' | 'done' | 'error'
  diff?: FileDiff
  at: number
  /** Feito por um subagente. */
  subagent?: boolean
}

/** Um pedido de permissão (ou pergunta) de uma sessão, esperando resposta. */
export interface ExternalRequest {
  id: string
  toolName: string
  input: unknown
  at: number
}

export interface ExternalSession {
  id: string
  /** A pasta onde a sessão roda. */
  cwd: string
  /** O nome curto do projeto (o fim do caminho). */
  project: string
  state: ExternalState
  startedAt: number
  updatedAt: number
  /** A última mensagem do usuário. */
  prompt?: string
  /** A última resposta do Claude, quando o turno acaba. */
  lastMessage?: string
  error?: string
  model?: string
  /** Os últimos passos, do mais antigo para o mais novo. */
  steps: ExternalStep[]
  requests: ExternalRequest[]
  /** O processo do Claude Code ainda está rodando. */
  alive: boolean
}

/** O que a aba Sessões mostra. */
export interface SessionsSnapshot {
  hooks: HooksStatus
  /** O Wisp está ouvindo os hooks. Se não, `problem` diz por quê. */
  listening: boolean
  problem?: string
  sessions: ExternalSession[]
}

/** Resposta a um pedido de uma sessão: permissão (ou "responder no terminal") ou pergunta. */
export type SessionAnswer =
  { decision: PermissionDecision | 'terminal' } | { answers: Record<string, string> | null }

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
  /** Projeto de uma sessão trazida do terminal. */
  project?: string
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
   * quando o Claude Code o informa, e imagens vêm como miniaturas.
   */
  | {
      type: 'tool-result'
      id: string
      isError: boolean
      output: string
      diff?: FileDiff
      /** Miniaturas (data URLs) das imagens que a ferramenta devolveu, como um print da tela. */
      images?: string[]
    }
  /** O turno acabou: normalmente, com erro ou porque o usuário parou. */
  | { type: 'turn-end'; outcome: 'done' | 'error' | 'stopped' }
  /** Aviso para mostrar na conversa (texto em Markdown). */
  | { type: 'notice'; level: NoticeLevel; text: string }
  /**
   * O Claude quer usar uma ferramenta que precisa de aprovação. `toolUseId` liga o pedido ao
   * card da ferramenta.
   */
  | {
      type: 'permission-request'
      id: string
      toolName: string
      input: unknown
      toolUseId?: string
      /** Navegador: o site em jogo (o de destino, ou o da página aberta). */
      site?: string
      /**
       * Até onde vai o "Permitir sempre": 'site' libera o site nesta conversa (navegador); 'none'
       * não oferece (código na página, envio de arquivos). Sem o campo, a ferramenta ou o comando.
       */
      always?: 'site' | 'none'
    }
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
   * mensagem na hora do envio, sem esperar o main; as faladas (`voice`) vêm do main.
   */
  | { type: 'user'; text: string; attachments: AttachmentPreview[]; voice?: boolean }
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
    onGaze(listener: (gaze: Gaze | null) => void): () => void
    onReact(listener: (reaction: MascotReaction) => void): () => void
    onAccessory(listener: (accessory: Accessory | null) => void): () => void
    /** Tocar um som com este volume (o main já conferiu se os sons estão ligados). */
    onSound(listener: (name: SoundName, volume: number) => void): () => void
    /** Um som da pasta do usuário chegou (bytes) ou saiu (null). */
    onCustomSound(listener: (name: SoundName, data: ArrayBuffer | null) => void): () => void
    /** O cursor entrou ou saiu de cima do mascote. */
    hover(inside: boolean): void
    /** O usuário mexeu com o mascote (conta como atividade: ele não cochila). */
    activity(): void
    /** Pede um som de reação; toca se os sons estiverem ligados. */
    playSound(name: SoundName): void
    /** Arquivos soltos no mascote: o painel abre com eles anexados. */
    drop(dropped: DroppedFiles): void
    /** Caminho no disco de um File solto ('' se não houver). */
    pathForFile(file: File): string
    /** Abre o menu do mascote (botão direito). */
    menu(): void
    /** O main pede para ouvir, parar de ouvir ou falar. */
    onVoice(listener: (command: VoiceCommand) => void): () => void
    /** O que a captura ouviu. */
    voiceEvent(event: VoiceCaptureEvent): void
    /** Em que pé está a voz (para o mascote mostrar que ouve). */
    onVoiceStatus(listener: (status: VoiceStatus) => void): () => void
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
    /** Arquivos soltos no mascote, para anexar. */
    onAttach(listener: (dropped: DroppedFiles) => void): () => void
    /** O usuário está mexendo no painel (chame no máximo de tempos em tempos). */
    activity(): void
    /** Tira um print da tela (o painel sai da frente) e devolve os arquivos para anexar. */
    captureScreen(): Promise<DroppedFiles>
    /** O que há de novo na área de transferência (null: nada a oferecer). */
    onClipboard(listener: (offer: ClipboardOffer | null) => void): () => void
    /** Usa o que foi copiado: o texto para a caixa ou um anexo. */
    takeClipboard(id: string): Promise<ClipboardUse>
    dismissClipboard(id: string): void
    /** O usuário copiou algo do painel. */
    copied(): void
    /** Um texto ditado para a caixa de mensagem. */
    onCompose(listener: (text: string) => void): () => void
  }
  /** A voz: o botão do microfone do painel. */
  voice: {
    /** Começa a ouvir; se já estiver ouvindo, termina e transcreve. */
    toggle(): void
    cancel(): void
    onStatus(listener: (status: VoiceStatus) => void): () => void
    onLevel(listener: (level: number) => void): () => void
  }
  /** Os sons do Wisp (o botão de mudo do painel). */
  sound: {
    get(): Promise<SoundSettings>
    set(enabled: boolean): void
    onChanged(listener: (settings: SoundSettings) => void): () => void
  }
  history: {
    list(): Promise<ConversationSummary[]>
    /** Reabre a conversa: ela chega pelo onEvent, depois de um 'reset'. */
    open(id: string): Promise<boolean>
    remove(id: string): Promise<boolean>
  }
  /** As sessões do Claude Code que rodam no terminal (aba Sessões). */
  sessions: {
    get(): Promise<SessionsSnapshot>
    /** Avisa que algo mudou (chame get de novo); devolve a função que cancela. */
    onChanged(listener: () => void): () => void
    /** O main pede para mostrar a aba (chegou um pedido). */
    onShow(listener: () => void): () => void
    answer(sessionId: string, requestId: string, answer: SessionAnswer): void
    /** Traz o terminal da sessão para a frente; false se não deu (o motivo vem em message). */
    focus(sessionId: string): Promise<{ ok: boolean; message?: string }>
    openFolder(sessionId: string): void
    continueInChat(sessionId: string): void
    forget(sessionId: string): void
    previewHooks(action: HooksAction): Promise<HookPreview | { error: string }>
    applyHooks(
      action: HooksAction,
      fingerprint: string
    ): Promise<{ ok: true; backupPath: string | null } | { error: string }>
  }
}
