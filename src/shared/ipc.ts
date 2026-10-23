// Contrato de IPC entre main, preload e renderer.

import type { AvatarName } from './avatars'
import type { DropZone, Layout } from './layout'
import type { SavedPrompt, ScheduledTask } from './prompts'

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
  /** main → mascote: o avatar escolhido (Fase 19). Arg: AvatarName. */
  mascotAvatar: 'mascot:avatar',
  /** main → mascote: menos movimento, mesmo com o sistema animando (Fase 22). Arg: boolean. */
  mascotMotion: 'mascot:motion',
  mascotIsland: 'mascot:island',
  agendaNext: 'agenda:next',
  summaryGet: 'summary:get',
  summaryShow: 'summary:show',
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
  /** chat → main: mensagem do usuário. Args: (conversa, texto, anexos). */
  chatSend: 'chat:send',
  /** chat → main: parar a resposta em andamento. Arg: conversa. */
  chatStop: 'chat:stop',
  /**
   * chat → main (invoke): troca a última mensagem por outra (Fase 21): a conversa volta para
   * antes dela e a nova vai no lugar. Args: (conversa, texto, anexos). Devolve boolean.
   */
  chatEditLast: 'chat:edit-last',
  /** chat → main: o rascunho da caixa de uma aba, para voltar ao reabrir. Args: (conversa, texto). */
  chatDraft: 'chat:draft',
  /** chat → main (invoke): exporta a conversa da aba em Markdown. Arg: conversa. Devolve ExportResult. */
  chatExport: 'chat:export',
  /** chat → main: recomeçar a conversa de uma aba (Ctrl+K). Arg: conversa. */
  chatNew: 'chat:new',
  /** chat → main: trocar o modelo. Args: (conversa, um de MODEL_CHOICES ou null). */
  chatModel: 'chat:model',
  /** chat → main: trocar o provedor da aba (recomeça a conversa). Args: (conversa, Provider). */
  chatProvider: 'chat:provider',
  /** chat → main: compactar a conversa. Args: (conversa, instruções opcionais). */
  chatCompact: 'chat:compact',
  chatView: 'chat:view',
  tuiAttach: 'tui:attach',
  tuiInput: 'tui:input',
  tuiResize: 'tui:resize',
  tuiData: 'tui:data',
  /** chat → main (invoke): os modelos da OpenRouter. Devolve OpenRouterModelInfo[] ou { error }. */
  openrouterModels: 'openrouter:models',
  /** chat → main (invoke): guarda a chave no chaveiro (conferida antes). Devolve OpenRouterKeyResult. */
  openrouterSetKey: 'openrouter:set-key',
  /** chat → main (invoke): apaga a chave do chaveiro. Devolve OpenRouterKeyResult. */
  openrouterClearKey: 'openrouter:clear-key',
  /**
   * chat → main (invoke): pareia um celular (Fase 18): sorteia os tópicos e os guarda no chaveiro.
   * Args: (servidor, ficha de acesso ou ''). Devolve PhonePairResult.
   */
  phonePair: 'phone:pair',
  /** chat → main (invoke): o link do pareamento de novo (o QR code). Devolve PhonePairResult. */
  phoneLink: 'phone:link',
  /**
   * chat → main (invoke): manda o teste com o botão Confirmar e espera o celular (até 2 minutos);
   * respondido, a função liga. Devolve PhoneResult.
   */
  phoneConfirm: 'phone:confirm',
  /** chat → main: desiste de esperar o teste. */
  phoneCancel: 'phone:cancel',
  /** chat → main (invoke): desliga a função (o pareamento fica). Devolve PhoneResult. */
  phoneDisable: 'phone:disable',
  /** chat → main (invoke): desfaz o pareamento (apaga os tópicos do chaveiro). Devolve PhoneResult. */
  phoneUnpair: 'phone:unpair',
  /** chat → main (invoke): roda as conferências (Fase 20). Devolve DiagnosticsSnapshot. */
  diagnosticsRun: 'diagnostics:run',
  /** chat → main: copia o último relatório do diagnóstico. */
  diagnosticsCopy: 'diagnostics:copy',
  /** chat → main: abre uma issue nova no GitHub, com o último relatório. */
  diagnosticsIssue: 'diagnostics:issue',
  /** chat → main (invoke): o botão de uma conferência. Arg: DiagnosticAction. Devolve PhoneResult. */
  diagnosticsAction: 'diagnostics:action',
  /** main → chat: mostra uma tela do painel. Arg: 'welcome' | 'diagnostics'. */
  panelView: 'panel:view',
  /** chat → main: os primeiros passos acabaram (ou foram pulados). */
  welcomeDone: 'welcome:done',
  /** chat → main: trocar o modo de permissão. Args: (conversa, PermissionMode). */
  chatMode: 'chat:mode',
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
  /** main → chat: um ChatEvent de uma conversa. Args: (conversa, ChatEvent). */
  chatEvent: 'chat:event',

  /** main → chat: as abas e como estão divididas na janela. Arg: TabsState. */
  tabsState: 'tabs:state',
  /** chat → main: abrir uma conversa nova numa aba (Ctrl+T). */
  tabsNew: 'tabs:new',
  /** chat → main: fechar uma aba. Arg: id da aba. */
  tabsClose: 'tabs:close',
  /** chat → main: mostrar uma aba no painel em foco. Arg: id da aba. */
  tabsShow: 'tabs:show',
  /** chat → main: o usuário mexeu num painel (ele passa a ser o do foco). Arg: índice. */
  tabsFocus: 'tabs:focus',
  /** chat → main: dividir o painel em foco (até MAX_PANES). Arg: 'row' (ao lado) ou 'column'. */
  tabsSplit: 'tabs:split',
  /** chat → main: uma aba arrastada para um painel. Args: (aba, aba do painel, DropZone). */
  tabsDrop: 'tabs:drop',
  /** chat → main: novas proporções de uma divisão da grade. Args: (caminho, proporções). */
  tabsResize: 'tabs:resize',
  /** chat → main: maximizar ou restaurar a janela. */
  windowMaximize: 'window:maximize',
  /** chat → main: a janela volta para perto do mascote. */
  windowDock: 'window:dock',
  /** main → chat: a janela mudou (maximizada, solta). Arg: WindowState. */
  windowState: 'window:state',
  /** chat → main: fechar um painel (as abas continuam abertas). Arg: índice. */
  tabsUnsplit: 'tabs:unsplit',
  /** chat → main: abrir uma sessão do terminal numa aba. Arg: id da sessão. */
  tabsOpenSession: 'tabs:open-session',
  /** chat → main (invoke): os projetos (das pastas de projetos) para abrir numa aba. */
  tabsProjects: 'tabs:projects',
  /**
   * chat → main (invoke): uma conversa numa pasta, numa aba nova. Arg: o caminho de um projeto
   * da lista, ou null para escolher a pasta. Devolve FolderResult.
   */
  tabsOpenFolder: 'tabs:open-folder',
  /** chat → main (invoke): as skills instaladas. Devolve SkillInfo[]. */
  skillsList: 'skills:list',
  /** chat → main (invoke): escolher uma pasta com uma skill. Devolve SkillPreview, { error } ou null. */
  skillsPick: 'skills:pick',
  /** chat → main (invoke): instalar a skill escolhida no skillsPick. Devolve SkillResult. */
  skillsInstall: 'skills:install',
  /** chat → main (invoke): mandar uma skill pessoal para a lixeira. Arg: nome. Devolve SkillResult. */
  skillsRemove: 'skills:remove',
  /** chat → main: abrir a pasta das skills pessoais no gerenciador de arquivos. */
  skillsOpenFolder: 'skills:open-folder',
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

  /** chat → main (invoke): as configurações de agora. Devolve SettingsSnapshot. */
  settingsGet: 'settings:get',
  /**
   * chat → main (invoke): muda configurações (um Partial<Settings>, e `autostart`). Devolve
   * SettingsResult; deu certo, o settingsChanged traz o novo estado.
   */
  settingsSet: 'settings:set',
  /** main → chat: as configurações mudaram (pela tela, pelo menu ou no arquivo). */
  settingsChanged: 'settings:changed',
  /** chat → main: abre o config.json (no editor de JSON, ou a pasta dele). */
  settingsOpenFile: 'settings:open-file',
  /** Abre o Wisp de novo (o idioma novo vale a partir daí). */
  settingsRelaunch: 'settings:relaunch',
  /** chat → main: roda uma tarefa agendada agora (o botão das configurações). Devolve TaskResult. */
  settingsRunTask: 'settings:run-task',
  /** chat → main: os prompts salvos, para o menu da barra. */
  promptsList: 'prompts:list',
  /** chat → main: o texto de um prompt salvo, com as variáveis preenchidas para a conversa. */
  promptsExpand: 'prompts:expand',
  /** main → chat: mostra a tela de configurações (o item do menu do mascote). */
  settingsShow: 'settings:show',
  /** chat → main: desiste da escuta (Esc). */
  voiceCancel: 'voice:cancel',
  /** chat → main (invoke): o teste de voz das configurações. Devolve VoiceTestResult. */
  voiceTest: 'voice:test',

  /** chat → main (invoke): as conversas guardadas. Devolve ConversationSummary[]. */
  historyList: 'history:list',
  /** chat → main (invoke): reabre uma conversa do histórico numa aba. Arg: id. Devolve boolean. */
  historyOpen: 'history:open',
  /** chat → main (invoke): apaga uma conversa do histórico. Arg: id. Devolve boolean. */
  historyDelete: 'history:delete',
  /** chat → main (invoke): fixa ou solta uma conversa no topo. Args: (id, fixada). Devolve boolean. */
  historyPin: 'history:pin',
  /** chat → main (invoke): exporta uma conversa guardada em Markdown. Arg: id. Devolve ExportResult. */
  historyExport: 'history:export',

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

/** O resumo de uma semana (de segunda a segunda), só com contagens (Fase 13). */
export interface WeekSummary {
  from: number
  to: number
  conversations: number
  turns: number
  /** Minutos do Claude trabalhando (a soma dos turnos). */
  claudeMinutes: number
  stopped: number
  errors: number
  edits: number
  added: number
  removed: number
  approved: number
  denied: number
  tools: [string, number][]
  apps: [string, number][]
  terminal: number
  projects: [string, number][]
  reminders: number
}

/** O que o painel recebe para o cartão da semana. */
export interface WeekSummaries {
  enabled: boolean
  current: WeekSummary
  previous: WeekSummary
}

/** O próximo compromisso da agenda, para o painel vazio mostrar (Fase 13). */
export interface AgendaItem {
  title: string
  start: number
  end: number
  location: string
}

/**
 * A ilha (o modo compacto), para a página do mascote: aberta ou recolhida, o texto e o tom (calmo,
 * ocupado, pedindo atenção, feliz). null: fora da ilha, o mascote flutuando.
 */
export type MascotIsland = {
  expanded: boolean
  title: string
  detail: string
  tone: 'calm' | 'busy' | 'alert' | 'happy'
} | null

/**
 * Como a escuta termina: 'hold', quando o atalho for solto (o silêncio longo só por garantia);
 * 'auto', no silêncio depois da fala; 'test', depois de 3 s, com todo o áudio (o teste de voz).
 */
export type VoiceMode = 'hold' | 'auto' | 'test'

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

/** O resultado do "Testar voz" das configurações: 3 s gravados e transcritos. */
export interface VoiceTestResult {
  ok: boolean
  /** O que o whisper.cpp entendeu (pode ser vazio). */
  text: string
  /** Por que não deu (o microfone, o whisper.cpp). */
  error?: string
  /** O áudio gravado: segundos e pico em dBFS. */
  seconds?: number
  peakDb?: number
  /** Quanto a transcrição demorou (ms). */
  ms?: number
  /** O que fazer, se algo parece errado. */
  hint?: string
}

/** Em que pé está a voz, para o painel e o mascote. */
export interface VoiceStatus {
  state: 'idle' | 'listening' | 'transcribing' | 'speaking'
  /** De onde veio a escuta: o botão do painel, o atalho ou o teste das configurações. */
  source?: 'panel' | 'shortcut' | 'test'
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
  /** Bash: o que o "Permitir sempre" libera (veja o permission-request do chat). */
  scope?: string
  exact?: boolean
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
  /** Está aberta numa aba. */
  current: boolean
  /** Projeto de uma sessão trazida do terminal. */
  project?: string
  /** Foi pela OpenRouter. */
  provider?: 'openrouter'
  /** Fixada no topo do histórico. */
  pinned?: boolean
}

/** Exportar uma conversa: onde ficou, ou por que não (null: a pessoa desistiu). */
export type ExportResult = { ok: true; path: string } | { ok: false; message: string } | null

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
  | {
      type: 'turn-end'
      outcome: 'done' | 'error' | 'stopped'
      /** A última resposta do turno no Claude Code (o uuid): onde voltar para editar a seguinte. */
      at?: string
    }
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
      /**
       * Comando do Bash: o que o "Permitir sempre" libera ("git status", "ls" ou o comando
       * inteiro, quando não dá para generalizar com segurança).
       */
      scope?: string
      /** O comando inteiro é o escopo (comando composto, perigoso ou com segredos). */
      exact?: boolean
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
  /** A última mensagem (e o que veio depois dela) saiu: ela foi editada (Fase 21). */
  | { type: 'rewind' }
  /** O rascunho da caixa, guardado da última vez. */
  | { type: 'draft'; text: string }
  /**
   * O modelo: o escolhido na pílula (null é o padrão do Claude Code) e o que respondeu por
   * último, como o CLI o chama (por exemplo "claude-sonnet-5-5"), se já se sabe.
   */
  | { type: 'model'; choice: string | null; active: string | null }
  /** O uso do plano mudou. */
  | { type: 'usage'; usage: PlanUsage }
  /** Por onde a conversa vai (assinatura ou OpenRouter). */
  | { type: 'provider'; provider: Provider }
  /** A pasta onde a conversa roda (com ~), ou null: o espaço de trabalho do Wisp. */
  | { type: 'folder'; folder: string | null }
  /** O custo estimado da conversa pela OpenRouter, a cada resposta. */
  | { type: 'cost'; cost: ConversationCost }
  /** Quanto da janela de contexto a conversa ocupa (a cada resposta e ao compactar). */
  | { type: 'context'; context: ContextUsage }
  /** A conversa foi compactada (por você ou sozinha, perto do limite): tokens antes e depois. */
  | {
      type: 'compacted'
      trigger: 'manual' | 'auto'
      before: number | null
      after: number | null
    }
  /** O modo de permissão da conversa mudou (pelo usuário ou pelo Claude Code). */
  | { type: 'mode'; mode: PermissionMode }
  /**
   * Uma mensagem do usuário, ao reabrir uma conversa do histórico. Ao vivo, o chat mostra a
   * mensagem na hora do envio, sem esperar o main; as faladas (`voice`) vêm do main. `queued`:
   * mandada com o Claude trabalhando, espera ele pegar (o user-delivered avisa).
   */
  | {
      type: 'user'
      text: string
      attachments: AttachmentPreview[]
      voice?: boolean
      queued?: boolean
      /** No histórico: entrou num turno em andamento (não começou um). */
      inTurn?: boolean
    }
  /** A mais antiga das mensagens mandadas com o Claude trabalhando chegou a ele. */
  | { type: 'user-delivered' }
  /** As mensagens que esperavam o Claude não chegaram (a resposta parou, o processo caiu). */
  | { type: 'queue-dropped' }
  /** Um passo de um subagente (o card do Agente mostra a lista). */
  | { type: 'subagent-step'; parent: string; id: string; name: string; input: unknown }
  | { type: 'subagent-step-end'; parent: string; id: string; isError: boolean }
  /** Uma tarefa do Claude Code começou ou mudou (um comando em segundo plano, por exemplo). */
  | { type: 'task'; task: TaskInfo }
  /** Os comandos com barra que o Claude Code aceita nesta conversa (skills e comandos). */
  | { type: 'commands'; commands: string[] }
  /** A aba passou a mostrar o chat ou o terminal (o Claude Code de verdade). */
  | { type: 'view'; view: ConversationView }
  /** Como está o Claude Code do modo terminal: rodando, encerrado (com o código) ou parado. */
  | { type: 'terminal'; terminal: TerminalStatus }
  /** Fim da reabertura de uma conversa do histórico (vem depois das mensagens dela). */
  | { type: 'restored'; createdAt: number }

/**
 * "allow-always" vale até a conversa recomeçar (Permitir sempre nesta conversa). No card do
 * plano (ExitPlanMode), "allow" aprova e volta a pedir antes das ações, e "allow-edits" e
 * "allow-auto" aprovam e passam para Aceitar edições ou Automático.
 */
export type PermissionDecision = 'allow' | 'allow-always' | 'deny' | 'allow-edits' | 'allow-auto'

/**
 * Os modos de permissão do Claude Code que o Wisp oferece, como no Shift+Tab do terminal:
 * - 'default' (Pedir): tudo fora da lista segura vira card;
 * - 'acceptEdits' (Aceitar edições): edições de arquivos passam direto (menos os ocultos);
 * - 'plan' (Planejar): o Claude só lê e planeja, e o plano vem num card para aprovar;
 * - 'auto' (Automático): o classificador do Claude Code aprova o que você pediu e barra o
 *   arriscado; só o que ele não decidir vira card.
 * O "bypassPermissions" (pular todas as permissões) fica de fora de propósito.
 */
export const PERMISSION_MODES = ['default', 'acceptEdits', 'plan', 'auto'] as const

/** Os campos do config.json que a tela de configurações mostra e muda. */
export interface Settings {
  projectRoots: string[]
  editorCommand: string
  terminalCommand: string | null
  model: string | null
  permissionMode: PermissionMode
  extraAllowedTools: string[]
  sound: boolean
  volume: number
  sleepAfterMinutes: number
  accessory: 'auto' | 'none' | 'christmas' | 'summer'
  avatar: AvatarName
  theme: 'system' | 'light' | 'dark'
  highContrast: boolean
  reduceMotion: boolean
  panelZoom: number
  tabSleepMinutes: number
  notifyApprovals: boolean
  language: 'auto' | 'pt' | 'en'
  shortcut: string | null
  voiceShortcut: string | null
  clipboardChip: boolean
  browserAutomation: boolean
  voiceReview: boolean
  quickCommands: boolean
  voiceReplies: boolean
  voiceLanguage: string
  demo: boolean
  compact: boolean
  github: boolean
  calendar: boolean
  calendarFiles: string[]
  calendarAlertMinutes: number
  weeklySummary: boolean
  provider: Provider
  openrouterModel: string | null
  phoneAfterSeconds: number
  updateCheck: boolean
  prompts: SavedPrompt[]
  scheduledTasks: ScheduledTask[]
}

export const SETTINGS_KEYS: readonly (keyof Settings)[] = [
  'projectRoots',
  'editorCommand',
  'terminalCommand',
  'model',
  'permissionMode',
  'extraAllowedTools',
  'sound',
  'volume',
  'sleepAfterMinutes',
  'accessory',
  'avatar',
  'theme',
  'highContrast',
  'reduceMotion',
  'panelZoom',
  'tabSleepMinutes',
  'notifyApprovals',
  'language',
  'shortcut',
  'voiceShortcut',
  'clipboardChip',
  'browserAutomation',
  'voiceReview',
  'quickCommands',
  'voiceReplies',
  'voiceLanguage',
  'demo',
  'compact',
  'github',
  'calendar',
  'calendarFiles',
  'calendarAlertMinutes',
  'weeklySummary',
  'provider',
  'openrouterModel',
  'phoneAfterSeconds',
  'updateCheck',
  'prompts',
  'scheduledTasks'
]

/** O que a tela de configurações recebe. */
/** Uma tarefa agendada que rodou (ou não deu para rodar). */
export type TaskResult = { ok: true } | { ok: false; message: string }

export interface SettingsSnapshot {
  values: Settings
  /** Iniciar com o sistema (um arquivo em ~/.config/autostart, fora do config.json). */
  autostart: boolean
  /** O config.json, com ~ no lugar da pasta pessoal. */
  configPath: string
  /** O registro (wisp.log), com ~ no lugar da pasta pessoal. */
  logPath: string
  /** O que está errado no config.json (os campos inválidos caem no padrão). */
  problems: string[]
  /** Há uma chave da OpenRouter no chaveiro (null: não deu para saber, o chaveiro não respondeu). */
  openrouterKey: boolean | null
  /** Aprovar pelo celular (Fase 18). */
  phone: PhoneStatus
  /** O idioma em que o Wisp abriu, e o que ele terá ao abrir de novo (Fase 25). */
  locale: 'pt' | 'en'
  nextLocale: 'pt' | 'en'
  /** Quando cada tarefa agendada rodou pela última vez (ms), pelo id (Fase 26). */
  taskRuns: Record<string, number>
}

/** O resultado de uma conferência do diagnóstico (Fase 20). */
export type DiagnosticStatus = 'ok' | 'warn' | 'error' | 'off'

/** O que o botão de uma conferência faz. */
export type DiagnosticAction = 'terminal' | 'demo' | 'settings' | 'release'

/** Uma conferência: o Claude Code, o login, o atalho, a bandeja, o chaveiro, a voz... */
export interface DiagnosticCheck {
  id:
    | 'claude'
    | 'login'
    | 'shortcut'
    | 'tray'
    | 'keyring'
    | 'voice'
    | 'terminal'
    | 'config'
    | 'update'
  title: string
  status: DiagnosticStatus
  /** Uma frase curta, a do relatório (nada pessoal). */
  summary: string
  /** O que foi visto, para a tela. */
  detail: string
  /** O que fazer (Markdown). */
  fix?: string
  action?: DiagnosticAction
  /** Não impede de usar o Wisp (fica como "opcional" nos primeiros passos). */
  optional?: boolean
}

/** As conferências de agora e o relatório para uma issue. */
export interface DiagnosticsSnapshot {
  checks: DiagnosticCheck[]
  report: string
}

/** Uma tela do painel aberta pelo main. */
export type PanelView = 'welcome' | 'diagnostics'

/** Em que pé está a aprovação pelo celular. */
export interface PhoneStatus {
  /** Ligada (pareada e confirmada pelo celular). */
  enabled: boolean
  /** Há um pareamento no chaveiro (null: não deu para saber). */
  paired: boolean | null
  /** O servidor do ntfy. */
  server: string
}

/** O pareamento: o link para o app do ntfy (o QR code), o mesmo no navegador, ou o motivo. */
export type PhonePairResult =
  { ok: true; link: string; web: string; server: string } | { ok: false; message: string }

export type PhoneResult = { ok: true; message?: string } | { ok: false; message: string }

/**
 * Por onde a conversa vai: o Claude Code com a assinatura (o padrão) ou com a API da OpenRouter
 * (experimental), com a chave da pessoa e um modelo de lá.
 */
export type Provider = 'subscription' | 'openrouter'

/** Um projeto para abrir numa aba: o nome, o caminho com ~ e o caminho de verdade. */
export interface FolderChoice {
  name: string
  display: string
  path: string
}

/** Abrir uma pasta numa aba: deu certo, a pessoa desistiu, ou o motivo. */
export type FolderResult = { ok: true } | { ok: false; message?: string }

/** Uma skill do Claude Code. */
export interface SkillInfo {
  name: string
  description: string
  /** Pessoal (~/.claude/skills) ou de um plugin. */
  origin: 'personal' | 'plugin'
  plugin?: string
  /** Ferramentas que a skill libera sem card (o allowed-tools dela). */
  allowedTools?: string
  path: string
}

/** A skill escolhida para instalar, antes de instalar. */
export type SkillPreview = SkillInfo & { files: number }

export type SkillResult = { ok: true; message: string } | { ok: false; message: string }

/** Um modelo da OpenRouter para a pílula, com os preços em dólares por milhão de tokens. */
export interface OpenRouterModelInfo {
  id: string
  name: string
  prompt: number | null
  completion: number | null
  context: number | null
}

/** O custo estimado de uma conversa pela OpenRouter: dólares (null sem preço) e tokens. */
export interface ConversationCost {
  usd: number | null
  inputTokens: number
  outputTokens: number
  /** Quantas respostas entraram na conta. */
  turns: number
}

/** O contexto da conversa: tokens ocupados, o tamanho da janela (null até o CLI contar) e se está
 * compactando agora. */
export interface ContextUsage {
  used: number
  window: number | null
  compacting: boolean
}

/** Uma tarefa do Claude Code (um comando rodando, um subagente em segundo plano). */
export interface TaskInfo {
  id: string
  description: string
  status: 'running' | 'completed' | 'failed' | 'stopped'
  /** Roda em segundo plano: a resposta segue sem esperar por ela. */
  background: boolean
}

/** O que a aba mostra: o chat do Wisp ou o Claude Code de verdade, num terminal. */
export type ConversationView = 'chat' | 'terminal'

/** O processo do modo terminal. */
export type TerminalStatus =
  { state: 'idle' } | { state: 'running' } | { state: 'exited'; code: number | null }

/** Guardar ou conferir a chave: deu certo (com o nome que ela tem na OpenRouter) ou o motivo. */
export type OpenRouterKeyResult =
  { ok: true; label: string | null; note?: string } | { ok: false; message: string }

/** A mudança deu certo, ou o campo que estava errado e o motivo. */
export type SettingsResult = { ok: true } | { ok: false; field: string; message: string }
export type PermissionMode = (typeof PERMISSION_MODES)[number]

/** Quantos painéis a janela do chat mostra, no máximo (a grade, em shared/layout.ts). */
export { MAX_PANES } from './layout'

/** Uma aba do painel: uma conversa do Wisp ou uma sessão do Claude Code no terminal. */
export type TabInfo =
  | { id: string; kind: 'chat'; title: string; project?: string; folder?: string }
  | { id: string; kind: 'session'; title: string; sessionId: string }

/** As abas abertas e os painéis da grade (cada um mostra uma aba). */
export interface TabsState {
  tabs: TabInfo[]
  /** Ids das abas à vista, na ordem da grade (1 a MAX_PANES). */
  panes: string[]
  /** O painel em foco (onde vão o atalho de voz, o --ask e os arquivos soltos). */
  focused: number
  /** A grade: como os painéis se dividem e as proporções de cada um. */
  layout: Layout
}

/** A janela do painel: maximizada, e solta (onde você deixou) ou ao lado do mascote. */
export interface WindowState {
  maximized: boolean
  detached: boolean
}

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
    /** O avatar escolhido (o robô, o fantasminha). */
    onAvatar(listener: (avatar: AvatarName) => void): () => void
    /** Menos movimento pedido nas configurações (o do sistema vale sempre). */
    onMotion(listener: (reduce: boolean) => void): () => void
    /** A ilha: aberta ou recolhida, o texto e o tom (null: fora da ilha). */
    onIsland(listener: (island: MascotIsland) => void): () => void
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
    send(conversation: string, text: string, attachments: OutgoingAttachment[]): void
    /** Caminho no disco de um File vindo de um arraste ou do seletor de arquivos ('' se não houver). */
    pathForFile(file: File): string
    /** Guarda uma imagem colada num arquivo, para ela poder ser anexada. */
    savePasted(data: ArrayBuffer, type: string): Promise<PastedImage>
    stop(conversation: string): void
    /** Troca a última mensagem por outra: a conversa volta para antes dela (Fase 21). */
    editLast(
      conversation: string,
      text: string,
      attachments: OutgoingAttachment[]
    ): Promise<boolean>
    /** Guarda o rascunho da caixa da aba. */
    saveDraft(conversation: string, text: string): void
    /** Exporta a conversa da aba em Markdown (o diálogo do sistema escolhe onde). */
    exportMarkdown(conversation: string): Promise<ExportResult>
    /** Recomeça a conversa de uma aba (Ctrl+K). */
    newConversation(conversation: string): void
    hide(): void
    /** Maximiza ou restaura a janela do painel. */
    maximize(): void
    /** A janela volta para perto do mascote (e para de lembrar onde você a deixou). */
    dock(): void
    onWindowState(listener: (state: WindowState) => void): () => void
    /**
     * Troca o modelo: um de MODEL_CHOICES, ou null para o padrão; numa conversa pela OpenRouter,
     * o id de um modelo de lá.
     */
    setModel(conversation: string, choice: string | null): void
    /** Troca o provedor da aba; a conversa recomeça (a atual fica no histórico). */
    setProvider(conversation: string, provider: Provider): void
    /** Compacta a conversa (o /compact do Claude Code), com instruções opcionais do que manter. */
    compact(conversation: string, instructions?: string): void
    /** A aba mostra o chat ou o Claude Code de verdade, num terminal (mesma conversa). */
    setView(conversation: string, view: ConversationView): void
    /** Troca o modo de permissão da conversa. */
    setMode(conversation: string, mode: PermissionMode): void
    answerPermission(id: string, decision: PermissionDecision): void
    /** Responde uma pergunta do Claude (texto da pergunta → resposta); null pula. */
    answerQuestion(id: string, answers: Record<string, string> | null): void
    /** Registra quem recebe os eventos das conversas; devolve a função que cancela. */
    onEvent(listener: (conversation: string, event: ChatEvent) => void): () => void
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
  /** O modo terminal: o Claude Code de verdade numa aba (Fase 17). */
  tui: {
    /** O que o terminal da conversa já mostrou (e sobe o processo, se preciso). */
    attach(conversation: string): Promise<string>
    /** O que foi digitado no terminal. */
    input(conversation: string, data: string): void
    /** O tamanho do terminal na página, em colunas e linhas. */
    resize(conversation: string, cols: number, rows: number): void
    /** A saída dos terminais (de qualquer conversa). */
    onData(listener: (conversation: string, data: string) => void): () => void
  }
  /** As abas e os painéis lado a lado. */
  tabs: {
    onState(listener: (state: TabsState) => void): () => void
    /** Uma conversa nova numa aba, no painel em foco. */
    create(): void
    close(id: string): void
    /** Mostra a aba no painel em foco (ou foca o painel onde ela já está). */
    show(id: string): void
    focus(pane: number): void
    /** Divide o painel em foco: ao lado ('row') ou embaixo ('column'). */
    split(dir?: 'row' | 'column'): void
    unsplit(pane: number): void
    /** Uma aba arrastada para o painel de outra: na borda divide, no meio troca. */
    drop(tab: string, target: string, zone: DropZone): void
    /** Novas proporções para a divisão no caminho dado (índices a partir da raiz). */
    resize(path: number[], sizes: number[]): void
    openSession(sessionId: string): void
    /** Os projetos das pastas de projetos, para abrir um numa aba. */
    projects(): Promise<FolderChoice[]>
    /** Uma conversa numa pasta (um projeto da lista, ou null para escolher), numa aba nova. */
    openFolder(path: string | null): Promise<FolderResult>
  }
  /** As skills do Claude Code: listar, instalar de uma pasta e remover. */
  skills: {
    list(): Promise<SkillInfo[]>
    pick(): Promise<SkillPreview | { error: string } | null>
    install(): Promise<SkillResult>
    remove(name: string): Promise<SkillResult>
    openFolder(): void
  }
  /** A voz: o botão do microfone do painel. */
  voice: {
    /** Começa a ouvir; se já estiver ouvindo, termina e transcreve. */
    toggle(): void
    cancel(): void
    /** Grava 3 s e transcreve, para ver se a voz funciona (as configurações). */
    test(): Promise<VoiceTestResult>
    onStatus(listener: (status: VoiceStatus) => void): () => void
    onLevel(listener: (level: number) => void): () => void
  }
  /** Os sons do Wisp (o botão de mudo do painel). */
  sound: {
    get(): Promise<SoundSettings>
    set(enabled: boolean): void
    onChanged(listener: (settings: SoundSettings) => void): () => void
  }
  /** A agenda: o próximo compromisso, para o painel vazio (null: nenhum nas próximas horas). */
  agenda: {
    onNext(listener: (next: AgendaItem | null) => void): () => void
  }
  /** O resumo da semana: o cartão no topo do histórico. */
  summary: {
    get(): Promise<WeekSummaries | null>
    /** A notificação de segunda-feira pediu o resumo. */
    onShow(listener: () => void): () => void
  }
  /** As configurações (a tela de configurações e o modo demonstração). */
  /** A OpenRouter (experimental): os modelos e a chave, que fica no chaveiro do sistema. */
  openrouter: {
    models(): Promise<OpenRouterModelInfo[] | { error: string }>
    setKey(key: string): Promise<OpenRouterKeyResult>
    clearKey(): Promise<OpenRouterKeyResult>
  }
  /** O diagnóstico e os primeiros passos (Fase 20). */
  diagnostics: {
    run(): Promise<DiagnosticsSnapshot>
    copy(): void
    issue(): void
    action(action: DiagnosticAction): Promise<PhoneResult>
    /** O main pediu uma tela (os primeiros passos na primeira vez, o Diagnóstico… do menu). */
    onView(listener: (view: PanelView) => void): () => void
    welcomeDone(): void
  }
  /** Aprovar pelo celular (Fase 18): o pareamento com o ntfy. */
  phone: {
    pair(server: string, token: string): Promise<PhonePairResult>
    link(): Promise<PhonePairResult>
    confirm(): Promise<PhoneResult>
    cancel(): void
    disable(): Promise<PhoneResult>
    unpair(): Promise<PhoneResult>
  }
  settings: {
    get(): Promise<SettingsSnapshot>
    set(patch: Partial<Settings> & { autostart?: boolean }): Promise<SettingsResult>
    onChanged(listener: (snapshot: SettingsSnapshot) => void): () => void
    /** Abre o config.json ou o registro no app padrão (ou mostra na pasta). */
    openFile(which: 'config' | 'log'): void
    /** Fecha e abre o Wisp de novo (para o idioma novo valer). */
    relaunch(): void
    /** Roda uma tarefa agendada agora, numa aba nova. */
    runTask(id: string): Promise<TaskResult>
    /** O menu do mascote pediu a tela de configurações. */
    onShow(listener: () => void): () => void
  }
  prompts: {
    list(): Promise<SavedPrompt[]>
    /** O texto do prompt com as variáveis da conversa; null se ele não existe. */
    expand(conversation: string, name: string): Promise<string | null>
  }
  history: {
    list(): Promise<ConversationSummary[]>
    /** Reabre a conversa numa aba (ou mostra a aba onde ela já está aberta). */
    open(id: string): Promise<boolean>
    remove(id: string): Promise<boolean>
    pin(id: string, pinned: boolean): Promise<boolean>
    exportMarkdown(id: string): Promise<ExportResult>
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
