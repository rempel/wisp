import { app, BrowserWindow, ipcMain, nativeTheme, screen, shell } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent, Rectangle, WebContents } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { basename, join } from 'path'
import appIcon from '../../resources/icon.png?asset'
import workspaceClaudeMd from '../../resources/workspace/CLAUDE.md?raw'
import { ATTACHMENTS_DIR, isThumbnail, saveIncoming, savePasted } from './attachments'
import { SAFE_TOOLS } from './claude'
import type { DemoPlayer } from './claude'
import { ClipboardChip } from './clipboard'
import {
  CONFIG_PATH,
  configProblems,
  getConfig,
  MODEL_NAME,
  onConfigChange,
  onConfigProblems,
  updateConfig
} from './config'
import { Conversation } from './conversation'
import type { ConversationHost } from './conversation'
import { exportFileName, exportMarkdown } from './export'
import { History, setPinned } from './history'
import type { SavedConversation } from './history'
import type { RelayEvent } from './hooks/protocol'
import type { PendingReply } from './hooks/server'
import type { Approval, ApprovalRequest } from './mcp-server'
import { loadPage, PRELOAD, reloadOnCrash } from './page'
import { listProjects } from './desktop'
import { tilde, usableFolder } from './folders'
import { listModels, OPENROUTER_SECRET } from './openrouter'
import { pickFolder, pickSaveFile } from './pick'
import { DATA_DIR, runtimeDir } from './paths'
import { readSecret } from './secrets'
import { captureScreens, CaptureError, thumbnailOf, thumbnailOfBase64 } from './screenshot'
import type { ScreenImage } from './screenshot'
import { IPC, MAX_PANES, MODEL_CHOICES, PERMISSION_MODES } from '../shared/ipc'
import {
  columns,
  dropTab,
  leaf,
  leaves,
  mapLeaves,
  removeLeaf,
  replaceLeaf,
  resize as resizeLayout,
  rows,
  sanitize,
  splitLeaf
} from '../shared/layout'
import type { DropZone, Layout } from '../shared/layout'
import type {
  AgendaItem,
  AttachmentPreview,
  ChatEvent,
  ClipboardUse,
  ConversationView,
  DroppedFile,
  DroppedFiles,
  MascotState,
  NoticeLevel,
  PanelView,
  ExportResult,
  OutgoingAttachment,
  PastedImage,
  PermissionDecision,
  PermissionMode,
  Provider,
  FolderChoice,
  FolderResult,
  SettingsSnapshot,
  SoundSettings,
  TabInfo,
  TabsState,
  WindowState,
  VoiceStatus
} from '../shared/ipc'
import { t } from '../shared/i18n'

/** Largura de cada painel (a janela cresce com a tela dividida) e altura da janela. */
const PANE_WIDTH = 420
const CHAT_HEIGHT = 600
/** Largura mínima de cada painel. */
const PANE_MIN_WIDTH = 320
/** Distância entre o mascote e o painel. */
const GAP = 8
/** Fundo da janela antes de a página pintar; igual ao --bg do chat.css. */
const BACKGROUND = { dark: '#0b1418', light: '#f5fafb' }
/** Quanto esperar o painel sumir da tela (inclusive a animação do desktop) antes do print. */
const PANEL_AWAY_MS = 350
/** De quanto em quanto tempo, no máximo, a área de transferência é conferida. */
const CLIPBOARD_CHECK_MS = 1000
/** Quantas abas abertas, no máximo: cada conversa é um processo do Claude Code. */
const MAX_TABS = 12

const WORKSPACE_DIR = join(DATA_DIR, 'workspace')
/** As abas abertas, para voltarem quando o app abrir de novo. */
const TABS_FILE = join(DATA_DIR, 'abas.json')
/** O Claude Code gravado do modo demonstração e as gravações dele. */
const DEMO: DemoPlayer = {
  player: join(__dirname, 'wisp-demo.js'),
  recordings: join(__dirname, '../../resources/demo')
}
const DECISIONS: PermissionDecision[] = [
  'allow',
  'allow-always',
  'deny',
  'allow-edits',
  'allow-auto'
]

const APPEND_SYSTEM_PROMPT =
  t(
    'Você está respondendo dentro do Wisp, um painel de chat pequeno no desktop Linux do usuário. '
  ) +
  t(
    'Responda em português do Brasil, de forma breve. O painel é estreito: use Markdown leve, com '
  ) +
  t(
    'parágrafos curtos e listas simples, sem títulos grandes nem tabelas largas. Quando o usuário '
  ) +
  t(
    'anexa arquivos, a mensagem termina com um bloco <anexos> com os caminhos deles: leia-os com a '
  ) +
  t('ferramenta Read (ela também lê imagens e PDFs) antes de responder sobre eles.')

/** Os anexos de uma mensagem, conferidos: caminhos não vazios e miniaturas no formato certo. */
function outgoing(value: unknown): OutgoingAttachment[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item: Record<string, unknown> | null) => {
    const path = item?.path
    if (typeof path !== 'string' || !path) return []
    const thumbnail = item?.thumbnail
    return [isThumbnail(thumbnail) ? { path, thumbnail } : { path }]
  })
}

/** Como o anexo aparece no histórico: nome, tamanho e a miniatura que o chat gerou. */
function previewOf({ path, thumbnail }: OutgoingAttachment): AttachmentPreview {
  let size = 0
  try {
    size = statSync(path).size
  } catch {
    // O arquivo sumiu; o envio vai avisar.
  }
  return { name: basename(path), size, ...(thumbnail ? { thumbnail } : {}) }
}

/** Os bytes de uma imagem colada, como chegam pelo IPC (ArrayBuffer ou uma view dele). */
function bytesOf(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return null
}

/** Cria a pasta de trabalho do Claude Code e, na primeira vez, o CLAUDE.md com a persona. */
function prepareWorkspace(): string {
  mkdirSync(WORKSPACE_DIR, { recursive: true })
  const claudeMd = join(WORKSPACE_DIR, 'CLAUDE.md')
  if (!existsSync(claudeMd)) writeFileSync(claudeMd, workspaceClaudeMd)
  return WORKSPACE_DIR
}

function openExternal(url: string): void {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
}

const isMode = (value: unknown): value is PermissionMode =>
  PERMISSION_MODES.includes(value as PermissionMode)

/** O arquivo do modo de permissão de uma conversa (o hook do Bash do processo dela o lê). */
const modeFileOf = (conversation: string): string =>
  join(runtimeDir(), `modo-${process.pid}-${conversation}`)

/** Uma aba: uma conversa do Wisp ou uma sessão do Claude Code no terminal. */
type Tab =
  | { id: string; kind: 'chat'; conversation: Conversation }
  | { id: string; kind: 'session'; sessionId: string; title: string }

/**
 * Como as abas ficam guardadas no disco. Na versão 2, a grade (com o índice de cada aba no
 * lugar do id) e a janela; a versão 1 tinha só a fileira de painéis.
 */
interface SavedTabs {
  v: 1 | 2
  tabs: (
    | {
        kind: 'chat'
        history: string | null
        mode: PermissionMode
        folder?: string
        /** A aba estava no modo terminal (Fase 17). */
        view?: ConversationView
        /** O rascunho da caixa de texto (Fase 21). */
        draft?: string
      }
    | { kind: 'session'; sessionId: string; title: string }
  )[]
  panes?: number[]
  layout?: unknown
  focused: number
  window?: SavedWindow
}

/** A janela solta (você a moveu, redimensionou ou maximizou): onde reabrir. */
interface SavedWindow {
  detached: boolean
  maximized: boolean
  bounds?: Rectangle
}

const DIRECTIONS = new Set(['row', 'column'])
const ZONES = new Set(['left', 'right', 'top', 'bottom', 'center'])
/** A menor altura de um painel na grade (px), para o tamanho mínimo da janela. */
const PANE_MIN_HEIGHT = 240

export interface Chat {
  /** Mostra o painel ao lado do mascote, traz para a frente ou esconde. */
  toggle(): void
  /** Mostra o painel e traz para a frente (sem esconder, se já estiver à vista). */
  open(): void
  /**
   * Manda uma mensagem como se o usuário a tivesse escrito, na aba em foco (o comando
   * `wisp --ask`, o atalho de voz). Devolve a conversa, ou null se não foi: o Claude ainda
   * respondia a anterior (a falada fica na caixa).
   */
  ask(text: string, options?: { voice?: boolean }): string | null
  /** Põe um texto ditado na caixa de mensagem da aba em foco, para revisar e enviar. */
  compose(text: string): void
  /** Mostra uma frase dita ao Wisp que ele mesmo resolve (um comando rápido de voz). */
  utterance(text: string): void
  /** Quantos cards de permissão (não perguntas) esperam resposta, em todas as abas. */
  pendingApprovals(): number
  /** Nega os cards da conversa com o pedido mais recente (o "não" falado). */
  denyApprovals(): void
  /**
   * A resposta a um card que veio de fora do painel: do celular (ou o tempo dele acabou: fica
   * negado) ou da notificação do sistema. Devolve false se o card já não esperava.
   */
  answerRemote(
    id: string,
    decision: 'allow' | 'deny',
    how: 'phone' | 'expired' | 'notification'
  ): boolean
  /** O título da aba de uma conversa (para o resumo de quando a tela estava bloqueada). */
  conversationTitle(id: string): string
  /** O painel está à vista. */
  visible(): boolean
  /** O painel está à vista e com o foco: você está olhando para ele. */
  attended(): boolean
  /** Em que pé está a voz (o botão do microfone acompanha). */
  voiceStatus(status: VoiceStatus): void
  /** O volume do microfone enquanto ouve. */
  voiceLevel(level: number): void
  /** O humor do mascote mudou: o avatar do cabeçalho acompanha. */
  setMood(state: MascotState): void
  /** Abre o painel numa conversa nova, numa aba (menu da bandeja). */
  newConversation(): void
  /** Abre o painel na tela de configurações (menu do mascote). */
  openSettings(): void
  /** Abre o painel numa tela: os primeiros passos ou o diagnóstico (Fase 20). */
  showView(view: PanelView): void
  /** Abre o painel no histórico, com o resumo da semana em cima (a notificação de segunda). */
  openSummary(): void
  /** De que lado do mascote o painel fica (para o mascote olhar para ele). */
  side(): 'left' | 'right'
  /** Mostra o card de permissão na conversa do pedido e resolve com a decisão do usuário. */
  requestApproval(request: ApprovalRequest): Promise<Approval>
  /** O IPC veio da página do painel? */
  isSender(sender: WebContents): boolean
  /** As sessões do terminal mudaram: a aba Sessões busca de novo. */
  notifySessions(): void
  /** Uma sessão do terminal pede algo: o painel aparece (sem roubar o foco) na aba Sessões. */
  showSessions(): void
  /** Continua no chat, numa aba, uma sessão do terminal. */
  continueSession(seed: SessionSeed): void
  /** Arquivos soltos no mascote: o painel aparece com eles anexados. */
  attach(dropped: DroppedFiles): void
  /** Os sons foram ligados ou desligados (o botão de mudo acompanha). */
  notifySound(settings: SoundSettings): void
  /** As configurações mudaram (a tela de configurações e a pílula da demonstração). */
  notifySettings(snapshot: SettingsSnapshot): void
  /** O próximo compromisso da agenda (null: nenhum), para o painel vazio. */
  setAgenda(next: AgendaItem | null): void
  /**
   * Tira o print das telas com o painel fora da frente; depois ele volta como estava. Lança
   * CaptureError com o motivo.
   */
  capture(): Promise<ScreenImage[]>
  /** Um aviso na conversa em foco (fora do histórico), como um problema na configuração. */
  notice(level: NoticeLevel, text: string): void
  /** A chave da OpenRouter mudou: as conversas de lá a leem de novo. */
  openrouterKeyChanged(): void
  /**
   * Um evento dos hooks do Claude Code do modo terminal de uma aba (pela ficha dele). false: não
   * é de nenhuma aba aberta.
   */
  terminalEvent(event: RelayEvent, pending: PendingReply | null): boolean
  /** Encerra os processos do Claude Code (o app está fechando). */
  dispose(): void
}

/** Uma sessão do terminal para continuar no chat. */
export interface SessionSeed {
  sessionId: string
  cwd: string
  project: string
  /** A sessão ainda roda no terminal: o chat segue numa cópia dela. */
  alive: boolean
  prompt?: string
  lastMessage?: string
}

export interface ChatOptions {
  /** Onde está o mascote, para ancorar o painel ao lado dele. */
  anchor: () => Rectangle | null
  /**
   * O --mcp-config de uma conversa (o servidor `desktop`); sem ele, as conversas rodam sem as
   * ferramentas de desktop.
   */
  mcpConfig?: (conversation: string) => string
  /** A conversa fechou: o arquivo do --mcp-config dela sai. */
  releaseMcpConfig?: (conversation: string) => void
  /** O nome de uma sessão do terminal (o projeto), para a aba dela; null se ela não existe. */
  sessionTitle?: (sessionId: string) => string | null
  /** Recebe cada evento das conversas (o humor do mascote acompanha por aqui). */
  onEvent?: (event: ChatEvent, conversation: string) => void
  /** Uma aba de conversa fechou. */
  onClose?: (conversation: string) => void
  /** O usuário abriu ou fechou o painel (os sons de abrir e fechar). */
  onPanel?: (change: 'open' | 'close') => void
  /** O usuário está mexendo no painel (o mascote não cochila). */
  onActivity?: () => void
  /** A janela do painel apareceu ou sumiu, de qualquer jeito (o modo compacto acompanha). */
  onVisible?: (visible: boolean) => void
  /**
   * Você passou a olhar o painel (à vista e com o foco) ou deixou de olhar (Fase 24: os cards
   * viram notificações enquanto ninguém olha).
   */
  onAttention?: (attended: boolean) => void
}

/**
 * Painel de chat: uma janela que nasce na primeira vez que é aberta e depois só é escondida,
 * para as conversas continuarem lá. Cada aba é uma conversa (um processo do Claude Code) ou uma
 * sessão do terminal; a janela mostra até MAX_PANES abas lado a lado.
 */
export function setupChat({
  anchor,
  mcpConfig,
  releaseMcpConfig,
  sessionTitle,
  onEvent,
  onClose,
  onAttention,
  onPanel,
  onActivity,
  onVisible
}: ChatOptions): Chat {
  let win: BrowserWindow | null = null
  // A página ainda não ouve eventos enquanto carrega; até lá eles esperam aqui.
  let pageReady = false
  /** O próximo compromisso da agenda, reenviado quando a página (re)carrega. */
  let agendaNext: AgendaItem | null = null
  const queued: [string, ChatEvent][] = []
  let quitting = false
  let mood: MascotState = 'idle'
  // Mostrar a aba Sessões assim que a página carregar (o pedido chegou antes).
  let showSessionsOnReady = false
  let showSettingsOnReady = false
  let showSummaryOnReady = false
  let viewOnReady: PanelView | null = null
  // Arquivos soltos no mascote antes de a página carregar.
  const pendingAttach: DroppedFiles[] = []
  // O último uso do plano (vale para a conta toda), para mostrar de novo se a página recarregar.
  let lastUsage: [string, Extract<ChatEvent, { type: 'usage' }>] | null = null
  // Só lê, lista e apaga: cada conversa grava a sua com o próprio History.
  const store = new History()
  // A oferta de "usar o que você copiou" que o painel mostra (o id), e quando foi conferida.
  const clipboardChip = new ClipboardChip()
  let clipboardOffered: string | null = null
  let clipboardCheckedAt = 0
  // Os prints, um de cada vez (o painel some e volta em cada um).
  let captureQueue: Promise<unknown> = Promise.resolve()
  // A voz (o botão do microfone), reenviada quando a página recarrega; e um texto ditado que
  // chegou antes de ela carregar.
  let voice: VoiceStatus = { state: 'idle' }
  let pendingCompose: string | null = null

  // As abas, a grade dos painéis (as folhas são abas), os painéis à vista na ordem da grade
  // (sempre leaves(layout)) e o painel em foco.
  const tabs: Tab[] = []
  let layout: Layout | null = null
  let panes: string[] = []
  let focused = 0
  /** A grade mudou: os painéis à vista acompanham, e o foco continua na mesma aba se der. */
  const setLayout = (next: Layout | null, focus?: string): void => {
    const before = panes[focused]
    layout = next
    panes = leaves(next)
    const index = panes.indexOf(focus ?? before)
    focused = index >= 0 ? index : Math.min(focused, Math.max(0, panes.length - 1))
  }
  /** O painel em foco passa a mostrar esta aba (ou é o primeiro). */
  const showInFocused = (id: string): void => {
    if (!layout || !panes.length) return setLayout(leaf(id), id)
    setLayout(replaceLeaf(layout, panes[focused], id), id)
  }
  // A janela: solta (onde você a deixou) ou ao lado do mascote.
  let placement: SavedWindow = { detached: false, maximized: false }
  /** Os limites que o próprio Wisp deu à janela por último (para saber se foi você que a mexeu). */
  let placedBounds: Rectangle | null = null
  let placedAt = 0
  // A última aba de conversa em foco: o --ask e a voz vão para ela se o foco estiver numa sessão.
  let lastChatTab: string | null = null
  let saveTimer: NodeJS.Timeout | null = null
  // A largura de cada painel (o usuário pode ter redimensionado) e quantos a janela mostra.
  let paneWidth = PANE_WIDTH
  let shownPanes = 1

  /** Manda um evento de uma conversa para a página (ou guarda até ela carregar). */
  const toPage = (conversation: string, event: ChatEvent): void => {
    if (win && pageReady) win.webContents.send(IPC.chatEvent, conversation, event)
    else queued.push([conversation, event])
  }

  const host: ConversationHost = {
    emit(conversation, event, live) {
      if (live) {
        if (event.type === 'usage') lastUsage = [conversation.id, event]
        if (event.type === 'mode') scheduleSave()
        onEvent?.(event, conversation.id)
      }
      toPage(conversation.id, event)
    },
    attention(conversation) {
      // O Claude fica parado esperando: com o painel escondido (ou ainda nem criado, num comando
      // de voz), ele aparece, sem roubar o foco, com a aba do pedido à vista.
      if (win?.isVisible()) return
      if (!panes.includes(conversation.id)) showTab(conversation.id)
      if (!win) {
        win = createWindow(true)
      } else {
        place(win)
        win.showInactive()
      }
    },
    terminalData(conversation, chunk) {
      if (win && pageReady) win.webContents.send(IPC.tuiData, conversation.id, chunk)
    },
    changed() {
      sendTabs()
      scheduleSave()
    }
  }

  const config = getConfig()
  /** Uma conversa nova (ainda sem aba). */
  function makeConversation(
    mode: PermissionMode = getConfig().permissionMode,
    provider: Provider = getConfig().provider,
    folder: string | null = null
  ): Conversation {
    const id = randomUUID()
    const conversation = new Conversation({
      id,
      host,
      claude: {
        claudePath: config.claudePath,
        workspace: prepareWorkspace,
        allowedTools: [...SAFE_TOOLS, ...config.extraAllowedTools],
        appendSystemPrompt: APPEND_SYSTEM_PROMPT,
        thumbnail: thumbnailOfBase64,
        demo: () => (getConfig().demo ? DEMO : null),
        openrouter: {
          key: () => readSecret(OPENROUTER_SECRET),
          // A lista é pública e fica guardada por uma hora; sem rede, o custo fica sem preço.
          pricing: async (model) =>
            (await listModels().catch(() => [])).find((item) => item.id === model) ?? null
        }
      },
      demo: () => getConfig().demo,
      mcpConfig: mcpConfig ? () => mcpConfig(id) : undefined,
      modeFile: modeFileOf(id),
      permissionMode: mode,
      provider,
      folder,
      modelFor: (which) =>
        which === 'openrouter' ? getConfig().openrouterModel : getConfig().model,
      projectRoots: () => getConfig().projectRoots,
      trustedDirs: [WORKSPACE_DIR, ATTACHMENTS_DIR]
    })
    for (const event of conversation.initialEvents()) toPage(id, event)
    return conversation
  }

  // ---- Abas e painéis ------------------------------------------------------

  const tabById = (id: string | undefined): Tab | undefined => tabs.find((tab) => tab.id === id)
  const conversations = (): Conversation[] =>
    tabs.flatMap((tab) => (tab.kind === 'chat' ? [tab.conversation] : []))
  const conversationById = (id: string | undefined | null): Conversation | undefined =>
    conversations().find((conversation) => conversation.id === id)

  function tabInfo(tab: Tab): TabInfo {
    if (tab.kind === 'session') {
      return { id: tab.id, kind: 'session', title: tab.title, sessionId: tab.sessionId }
    }
    const { title, project, folder } = tab.conversation
    return {
      id: tab.id,
      kind: 'chat',
      // Uma conversa numa pasta, ainda sem mensagens, leva o nome do projeto.
      title: title ?? project ?? t('Nova conversa'),
      ...(project ? { project } : {}),
      ...(folder ? { folder: tilde(folder) } : {})
    }
  }

  function tabsState(): TabsState {
    return {
      tabs: tabs.map(tabInfo),
      panes: [...panes],
      focused,
      layout: layout ?? leaf(tabs[0]?.id ?? '')
    }
  }

  function sendTabs(): void {
    if (win && pageReady) win.webContents.send(IPC.tabsState, tabsState())
  }

  /** As abas mudaram: a página, o disco e o tamanho da janela acompanham. */
  function tabsChanged(): void {
    const focusedTab = tabById(panes[focused])
    if (focusedTab?.kind === 'chat') lastChatTab = focusedTab.id
    resizeForPanes()
    sendTabs()
    scheduleSave()
  }

  /** Abre uma conversa numa aba nova, à vista no painel em foco. */
  function addChatTab(conversation = makeConversation()): Conversation {
    tabs.push({ id: conversation.id, kind: 'chat', conversation })
    showInFocused(conversation.id)
    tabsChanged()
    return conversation
  }

  /** A conversa da aba em foco, se nada foi dito nela: dá para usar em vez de abrir outra. */
  function emptyFocusedConversation(): Conversation | null {
    const conversation = conversationById(panes[focused])
    return conversation && !conversation.title && !conversation.busy && !conversation.historyId
      ? conversation
      : null
  }

  /** Uma conversa para algo novo: a aba em foco, se estiver vazia, ou uma aba nova. */
  function freshConversation(): Conversation {
    return emptyFocusedConversation() ?? addChatTab()
  }

  /** Mostra a aba no painel em foco, ou foca o painel onde ela já está. */
  function showTab(id: string): void {
    if (!tabById(id)) return
    const index = panes.indexOf(id)
    if (index >= 0) focused = index
    else showInFocused(id)
    tabsChanged()
  }

  function closeTab(id: string): void {
    const index = tabs.findIndex((tab) => tab.id === id)
    if (index < 0) return
    const [tab] = tabs.splice(index, 1)
    if (tab.kind === 'chat') {
      tab.conversation.dispose()
      releaseMcpConfig?.(tab.id)
      rmSync(modeFileOf(tab.id), { force: true })
      onClose?.(tab.id)
    }
    if (lastChatTab === id) lastChatTab = null
    if (!tabs.length) {
      const conversation = makeConversation()
      tabs.push({ id: conversation.id, kind: 'chat', conversation })
    }
    // O painel que mostrava a aba passa a mostrar outra que não está à vista (ou sai).
    if (layout && panes.includes(id)) {
      const hidden = tabs.find((other) => !panes.includes(other.id))
      if (hidden) setLayout(replaceLeaf(layout, id, hidden.id))
      else if (panes.length > 1) setLayout(removeLeaf(layout, id))
      else setLayout(leaf(tabs[0].id))
    }
    tabsChanged()
  }

  /**
   * Divide o painel em foco (ao lado ou embaixo), com uma aba que não está à vista (ou uma
   * conversa nova) no painel novo, que fica em foco.
   */
  function split(dir: 'row' | 'column' = 'row'): void {
    if (!layout || panes.length >= MAX_PANES) return
    let hidden = tabs.find((tab) => !panes.includes(tab.id))
    if (!hidden) {
      if (tabs.length >= MAX_TABS) return
      const conversation = makeConversation()
      hidden = { id: conversation.id, kind: 'chat', conversation }
      tabs.push(hidden)
    }
    setLayout(
      splitLeaf(layout, panes[focused], hidden.id, dir === 'row' ? 'right' : 'bottom'),
      hidden.id
    )
    tabsChanged()
  }

  function unsplit(pane: number): void {
    if (!layout || panes.length <= 1 || pane < 0 || pane >= panes.length) return
    setLayout(removeLeaf(layout, panes[pane]))
    tabsChanged()
  }

  /** Uma aba arrastada para o painel de outra: na borda divide, no meio troca. */
  function drop(tab: string, target: string, zone: DropZone): void {
    if (!layout || !tabById(tab) || !panes.includes(target) || tab === target) return
    // Uma divisão nova precisa de espaço para mais um painel.
    if (zone !== 'center' && !panes.includes(tab) && panes.length >= MAX_PANES) return
    setLayout(dropTab(layout, tab, target, zone), tab)
    tabsChanged()
  }

  function openSessionTab(sessionId: string): void {
    const existing = tabs.find((tab) => tab.kind === 'session' && tab.sessionId === sessionId)
    if (existing) return showTab(existing.id)
    const title = sessionTitle?.(sessionId)
    if (!title || tabs.length >= MAX_TABS) return
    const tab: Tab = { id: `sessao-${randomUUID()}`, kind: 'session', sessionId, title }
    tabs.push(tab)
    showInFocused(tab.id)
    tabsChanged()
  }

  /** A conversa que recebe o --ask, a voz e os arquivos soltos: a da aba em foco. */
  function focusedConversation(): Conversation {
    const current = conversationById(panes[focused])
    if (current) return current
    // O foco está numa sessão do terminal: a última conversa vista vai para o painel em foco.
    const last = conversationById(lastChatTab) ?? conversations()[0]
    if (last) {
      showTab(last.id)
      return last
    }
    return addChatTab()
  }

  // ---- Guardar e trazer de volta as abas -----------------------------------

  function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveTabs, 500)
  }

  function saveTabs(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    const index = (id: string): number => tabs.findIndex((tab) => tab.id === id)
    const saved: SavedTabs = {
      v: 2,
      tabs: tabs.map((tab) =>
        tab.kind === 'chat'
          ? {
              kind: 'chat',
              history: tab.conversation.historyId,
              mode: tab.conversation.mode,
              ...(tab.conversation.folder ? { folder: tab.conversation.folder } : {}),
              ...(tab.conversation.view === 'terminal' ? { view: 'terminal' as const } : {}),
              ...(tab.conversation.draft ? { draft: tab.conversation.draft } : {})
            }
          : { kind: 'session', sessionId: tab.sessionId, title: tab.title }
      ),
      layout: layout ? mapLeaves(layout, index) : undefined,
      focused,
      window: placement
    }
    try {
      mkdirSync(DATA_DIR, { recursive: true })
      writeFileSync(TABS_FILE, JSON.stringify(saved), { mode: 0o600 })
    } catch (err) {
      console.warn('[wisp] não consegui guardar as abas:', err)
    }
  }

  /** As abas da última vez: as conversas voltam do histórico, prontas para continuar. */
  function restoreTabs(): void {
    let saved: Partial<SavedTabs> | null = null
    try {
      saved = JSON.parse(readFileSync(TABS_FILE, 'utf8')) as Partial<SavedTabs>
    } catch {
      // Primeira vez, ou um arquivo estragado: começa com uma aba vazia.
    }
    const entries = Array.isArray(saved?.tabs) ? saved.tabs.slice(0, MAX_TABS) : []
    for (const entry of entries) {
      if (entry?.kind === 'session' && typeof entry.sessionId === 'string') {
        tabs.push({
          id: `sessao-${randomUUID()}`,
          kind: 'session',
          sessionId: entry.sessionId,
          title: typeof entry.title === 'string' ? entry.title.slice(0, 80) : t('Sessão')
        })
        continue
      }
      if (entry?.kind !== 'chat') continue
      const folder = typeof entry.folder === 'string' ? usableFolder(entry.folder) : null
      const conversation = makeConversation(
        isMode(entry.mode) ? entry.mode : undefined,
        undefined,
        folder
      )
      const old = typeof entry.history === 'string' ? store.load(entry.history) : null
      if (old) for (const event of conversation.restore(old)) toPage(conversation.id, event)
      // No modo terminal, o Claude Code sobe quando a aba aparece.
      if (entry.view === 'terminal') conversation.presetView('terminal')
      if (typeof entry.draft === 'string' && entry.draft) {
        conversation.setDraft(entry.draft)
        toPage(conversation.id, { type: 'draft', text: conversation.draft })
      }
      tabs.push({ id: conversation.id, kind: 'chat', conversation })
    }
    if (!tabs.length) {
      const conversation = makeConversation()
      tabs.push({ id: conversation.id, kind: 'chat', conversation })
    }
    // A grade guarda o índice de cada aba; a versão 1 guardava só a fileira de painéis.
    const byIndex = (value: unknown): unknown => {
      if (!value || typeof value !== 'object') return value
      const node = value as Record<string, unknown>
      if (node.type === 'leaf') {
        const i = Number(node.tab)
        return { type: 'leaf', tab: Number.isInteger(i) && tabs[i] ? tabs[i].id : '' }
      }
      return { ...node, children: Array.isArray(node.children) ? node.children.map(byIndex) : [] }
    }
    const valid = (id: string): boolean => !!tabById(id)
    let restored = saved?.layout ? sanitize(byIndex(saved.layout), valid) : null
    if (!restored && Array.isArray(saved?.panes)) {
      const ids = saved.panes.flatMap((i) => (Number.isInteger(i) && tabs[i] ? [tabs[i].id] : []))
      restored = sanitize(
        { type: 'split', dir: 'row', sizes: [], children: ids.map((id) => leaf(id)) },
        valid
      )
    }
    setLayout(restored ?? leaf(tabs[0].id))
    focused = Math.min(Math.max(Number(saved?.focused) || 0, 0), panes.length - 1)
    const window = saved?.window
    if (window && typeof window === 'object') {
      const bounds = window.bounds
      const sane =
        bounds &&
        [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) &&
        bounds.width >= PANE_MIN_WIDTH &&
        bounds.height >= 300
      placement = {
        detached: window.detached === true && !!sane,
        maximized: window.maximized === true,
        ...(sane ? { bounds } : {})
      }
    }
    const focusedTab = tabById(panes[focused])
    lastChatTab = focusedTab?.kind === 'chat' ? focusedTab.id : (conversations()[0]?.id ?? null)
  }

  restoreTabs()

  // O modo demonstração ligou ou desligou (no menu, na tela de configurações, no arquivo): as
  // conversas recomeçam, para respostas gravadas e de verdade não se misturarem.
  let demoOn = getConfig().demo
  onConfigChange((config) => {
    if (config.demo === demoOn) return
    demoOn = config.demo
    for (const conversation of conversations()) conversation.reset()
    focusedConversation().notice(
      'info',
      demoOn
        ? t('Modo demonstração ligado: as respostas são gravadas, e nada roda de verdade. ') +
            t('Experimente "abre o Firefox" ou "arruma o bug do contador".')
        : t('Modo demonstração desligado: as próximas respostas vêm do Claude Code de verdade.')
    )
  })

  // Problemas no config.json aparecem na conversa (o terminal nem sempre está à vista): ao abrir
  // o painel pela primeira vez e quando o arquivo muda com eles.
  const configNotice = (problems: string[]): string =>
    t('Encontrei problemas no `{v1}`:\n\n', { v1: CONFIG_PATH.replace(homedir(), '~') }) +
    problems.map((problem) => `- ${problem}`).join('\n')
  onConfigProblems((problems) => {
    if (win && problems.length) focusedConversation().notice('warning', configNotice(problems))
  })

  // O tamanho do painel (Fase 22) mudou nas configurações, no Ctrl+mais ou no arquivo.
  onConfigChange((config) => {
    if (win && !win.isDestroyed() && win.webContents.getZoomFactor() !== config.panelZoom) {
      win.webContents.setZoomFactor(config.panelZoom)
    }
  })

  // As abas paradas dormem (Fase 23): o Claude Code de uma aba sem uso sai, e a próxima mensagem
  // o sobe de novo, na mesma sessão. Uma conferência por minuto (nos testes, mais rápido).
  const testSleep = Number(process.env.WISP_TEST_TAB_SLEEP_MS) || 0
  setInterval(() => {
    const minutes = getConfig().tabSleepMinutes
    if (!minutes) return
    const after = testSleep || minutes * 60_000
    for (const conversation of conversations()) conversation.sleepIfIdle(after)
  }, testSleep || 60_000).unref()

  // O tema do sistema mudou: a página troca sozinha (prefers-color-scheme); o fundo da janela,
  // que aparece antes de a página pintar e ao redimensionar, acompanha aqui.
  nativeTheme.on('updated', () => {
    win?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light)
  })

  const fromChat = (event: IpcMainEvent | IpcMainInvokeEvent): boolean =>
    win !== null && event.sender === win.webContents
  /** A conversa de um pedido da página, se ele veio da página e a conversa existe. */
  const target = (
    event: IpcMainEvent | IpcMainInvokeEvent,
    id: unknown
  ): Conversation | undefined =>
    fromChat(event) && typeof id === 'string' ? conversationById(id) : undefined

  ipcMain.on(IPC.chatReady, (event) => {
    if (!fromChat(event) || !win) return
    pageReady = true
    win.webContents.send(IPC.chatMood, mood)
    win.webContents.send(IPC.tabsState, tabsState())
    sendWindow()
    for (const [conversation, waiting] of queued.splice(0)) {
      win.webContents.send(IPC.chatEvent, conversation, waiting)
    }
    if (showSessionsOnReady) win.webContents.send(IPC.sessionsShow)
    showSessionsOnReady = false
    if (showSettingsOnReady) win.webContents.send(IPC.settingsShow)
    showSettingsOnReady = false
    if (showSummaryOnReady) win.webContents.send(IPC.summaryShow)
    showSummaryOnReady = false
    if (viewOnReady) win.webContents.send(IPC.panelView, viewOnReady)
    viewOnReady = null
    for (const dropped of pendingAttach.splice(0)) win.webContents.send(IPC.chatAttach, dropped)
    win.webContents.send(IPC.voiceStatus, voice)
    win.webContents.send(IPC.agendaNext, agendaNext)
    if (pendingCompose !== null) win.webContents.send(IPC.chatCompose, pendingCompose)
    pendingCompose = null
    // A página (re)começou sem chip: o que estiver copiado é oferecido de novo.
    clipboardOffered = null
    clipboardCheckedAt = 0
    if (win.isFocused()) void offerClipboard()
  })
  ipcMain.on(IPC.chatActivity, (event) => {
    if (fromChat(event)) onActivity?.()
  })
  ipcMain.on(IPC.chatSend, (event, id: unknown, text: unknown, attachments: unknown) => {
    const conversation = target(event, id)
    if (!conversation || typeof text !== 'string') return
    conversation.send(text, outgoing(attachments), previewOf)
  })
  ipcMain.on(IPC.chatStop, (event, id: unknown) => target(event, id)?.stop())
  ipcMain.handle(
    IPC.chatEditLast,
    (event, id: unknown, text: unknown, attachments: unknown): boolean => {
      const conversation = target(event, id)
      if (!conversation || typeof text !== 'string') return false
      return conversation.editLast(text, outgoing(attachments), previewOf)
    }
  )
  ipcMain.on(IPC.chatDraft, (event, id: unknown, text: unknown) => {
    const conversation = target(event, id)
    if (!conversation || typeof text !== 'string' || text === conversation.draft) return
    conversation.setDraft(text)
    scheduleSave()
  })
  /** Exporta uma conversa guardada: o diálogo do sistema escolhe onde. */
  const exportConversation = async (saved: SavedConversation | null): Promise<ExportResult> => {
    if (!saved) return { ok: false, message: t('Esta conversa ainda não tem mensagens guardadas.') }
    const file = await pickSaveFile(
      t('Exportar a conversa'),
      join(app.getPath('documents'), exportFileName(saved.title)),
      [{ name: 'Markdown', extensions: ['md'] }],
      win
    )
    if (!file) return null
    try {
      writeFileSync(file, exportMarkdown(saved))
    } catch (err) {
      return {
        ok: false,
        message: t('Não consegui gravar o arquivo: {message}', { message: (err as Error).message })
      }
    }
    return { ok: true, path: tilde(file) }
  }
  ipcMain.handle(IPC.chatExport, (event, id: unknown) => {
    const conversation = target(event, id)
    if (!conversation) return null
    const historyId = conversation.historyId
    return exportConversation(historyId ? conversation.history.load(historyId) : null)
  })
  ipcMain.handle(IPC.historyExport, (event, id: unknown) => {
    if (!fromChat(event) || typeof id !== 'string') return null
    const open = conversations().find((conversation) => conversation.historyId === id)
    return exportConversation(open ? open.history.load(id) : store.load(id))
  })
  ipcMain.handle(IPC.historyPin, (event, id: unknown, pinned: unknown) => {
    if (!fromChat(event) || typeof id !== 'string' || typeof pinned !== 'boolean') return false
    return setPinned(id, pinned)
  })
  ipcMain.on(IPC.chatNew, (event, id: unknown) => target(event, id)?.reset())
  ipcMain.on(IPC.chatModel, (event, id: unknown, choice: unknown) => {
    const conversation = target(event, id)
    if (!conversation) return
    if (conversation.provider === 'openrouter') {
      // Qualquer modelo da OpenRouter, desde que o nome tenha cara de nome de modelo.
      if (typeof choice !== 'string' || !MODEL_NAME.test(choice)) return
      updateConfig({ openrouterModel: choice })
      conversation.setModel(choice)
      return
    }
    if (choice !== null && !MODEL_CHOICES.includes(choice as (typeof MODEL_CHOICES)[number])) return
    const model = choice as string | null
    updateConfig({ model })
    conversation.setModel(model)
  })
  ipcMain.on(IPC.chatView, (event, id: unknown, view: unknown) => {
    if (view !== 'chat' && view !== 'terminal') return
    void target(event, id)?.setView(view)
  })
  ipcMain.handle(IPC.tuiAttach, (event, id: unknown) => target(event, id)?.attachTerminal() ?? '')
  ipcMain.on(IPC.tuiInput, (event, id: unknown, data: unknown) => {
    if (typeof data !== 'string' || data.length > 1_000_000) return
    target(event, id)?.terminalInput(data)
  })
  ipcMain.on(IPC.tuiResize, (event, id: unknown, cols: unknown, rows: unknown) => {
    if (typeof cols !== 'number' || typeof rows !== 'number') return
    target(event, id)?.resizeTerminal(Math.floor(cols), Math.floor(rows))
  })
  ipcMain.on(IPC.chatCompact, (event, id: unknown, instructions: unknown) => {
    target(event, id)?.compact(typeof instructions === 'string' ? instructions : '')
  })
  ipcMain.on(IPC.chatProvider, (event, id: unknown, provider: unknown) => {
    if (provider !== 'subscription' && provider !== 'openrouter') return
    target(event, id)?.setProvider(provider)
  })
  ipcMain.on(IPC.chatMode, (event, id: unknown, mode: unknown) => {
    if (isMode(mode)) target(event, id)?.setMode(mode)
  })
  ipcMain.handle(
    IPC.chatPaste,
    async (event, data: unknown, type: unknown): Promise<PastedImage> => {
      const bytes = bytesOf(data)
      if (!fromChat(event) || !bytes || typeof type !== 'string')
        return { error: t('pedido inválido') }
      try {
        return await savePasted(bytes, type)
      } catch (err) {
        return { error: (err as Error).message }
      }
    }
  )
  ipcMain.handle(IPC.chatCapture, async (event): Promise<DroppedFiles> => {
    if (!fromChat(event)) return { files: [], problems: [] }
    try {
      const shots = await captureWithoutPanel()
      const files: DroppedFile[] = []
      for (const [index, shot] of shots.entries()) {
        const prefix = shots.length > 1 ? `print-tela${index + 1}` : 'print'
        const saved = await saveIncoming(shot.image.toPNG(), prefix, 'png')
        const thumbnail = thumbnailOf(shot.image)
        files.push({ ...saved, ...(thumbnail ? { thumbnail } : {}) })
      }
      return { files, problems: [] }
    } catch (err) {
      const reason = err instanceof CaptureError ? err.message : (err as Error).message
      return { files: [], problems: [t('Não consegui tirar o print: {reason}.', { reason })] }
    }
  })
  ipcMain.handle(IPC.chatClipboardUse, async (event, id: unknown): Promise<ClipboardUse> => {
    if (!fromChat(event) || typeof id !== 'string') return { error: t('pedido inválido') }
    clipboardOffered = null
    return clipboardChip.use(id)
  })
  ipcMain.on(IPC.chatClipboardDismiss, (event, id: unknown) => {
    if (!fromChat(event) || typeof id !== 'string') return
    clipboardOffered = null
    clipboardChip.dismiss(id)
  })
  ipcMain.on(IPC.chatCopied, (event) => {
    // O texto vai para a área de transferência logo depois do evento de copiar.
    if (fromChat(event)) setTimeout(() => void clipboardChip.markCopied(), 200)
  })
  ipcMain.handle(IPC.historyList, (event) => {
    if (!fromChat(event)) return []
    const open = new Set(conversations().flatMap((c) => (c.historyId ? [c.historyId] : [])))
    return store.list(open)
  })
  ipcMain.handle(IPC.historyOpen, (event, id: unknown) => {
    if (!fromChat(event) || typeof id !== 'string') return false
    // Já aberta numa aba: só mostra.
    const open = conversations().find((conversation) => conversation.historyId === id)
    if (open) {
      showTab(open.id)
      return true
    }
    const saved = store.load(id)
    if (!saved) return false
    if (tabs.length >= MAX_TABS && !emptyFocusedConversation()) return false
    const conversation = freshConversation()
    // A conversa da aba recomeça (o 'reset' passa pelo histórico e pelos cards) e a guardada
    // volta: primeiro o que o painel mostrava, depois a próxima mensagem retoma o Claude Code.
    for (const replayed of conversation.restore(saved)) toPage(conversation.id, replayed)
    showTab(conversation.id)
    return true
  })
  ipcMain.handle(IPC.historyDelete, (event, id: unknown) => {
    if (!fromChat(event) || typeof id !== 'string') return false
    const open = conversations().find((conversation) => conversation.historyId === id)
    const removed = open ? open.history.remove(id) : store.remove(id)
    // Apagar a conversa aberta numa aba é recomeçar a aba.
    open?.reset()
    return removed
  })
  ipcMain.on(IPC.chatHide, (event) => {
    if (fromChat(event) && win) hide(win)
  })
  ipcMain.on(IPC.chatPermission, (event, id: unknown, decision: unknown) => {
    if (!fromChat(event) || typeof id !== 'string') return
    if (!DECISIONS.includes(decision as PermissionDecision)) return
    const owner = conversations().find((conversation) => conversation.owns(id))
    owner?.answer(id, decision as PermissionDecision)
  })
  ipcMain.on(IPC.chatAnswer, (event, id: unknown, answers: unknown) => {
    if (!fromChat(event) || typeof id !== 'string') return
    conversations()
      .find((conversation) => conversation.owns(id))
      ?.answerQuestion(id, answers)
  })
  ipcMain.on(IPC.tabsNew, (event) => {
    if (!fromChat(event) || tabs.length >= MAX_TABS) return
    addChatTab()
  })
  ipcMain.on(IPC.tabsClose, (event, id: unknown) => {
    if (fromChat(event) && typeof id === 'string') closeTab(id)
  })
  ipcMain.on(IPC.tabsShow, (event, id: unknown) => {
    if (fromChat(event) && typeof id === 'string') showTab(id)
  })
  ipcMain.on(IPC.tabsFocus, (event, pane: unknown) => {
    if (!fromChat(event) || !Number.isInteger(pane)) return
    const index = pane as number
    if (index < 0 || index >= panes.length || index === focused) return
    focused = index
    tabsChanged()
  })
  ipcMain.on(IPC.tabsSplit, (event, dir: unknown) => {
    if (fromChat(event)) split(DIRECTIONS.has(dir as string) ? (dir as 'row' | 'column') : 'row')
  })
  ipcMain.on(IPC.tabsDrop, (event, tab: unknown, target: unknown, zone: unknown) => {
    if (!fromChat(event) || typeof tab !== 'string' || typeof target !== 'string') return
    if (ZONES.has(zone as string)) drop(tab, target, zone as DropZone)
  })
  ipcMain.on(IPC.tabsResize, (event, path: unknown, sizes: unknown) => {
    if (!fromChat(event) || !layout) return
    if (!Array.isArray(path) || !path.every((i) => Number.isInteger(i) && i >= 0)) return
    if (!Array.isArray(sizes) || !sizes.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return
    }
    setLayout(resizeLayout(layout, path as number[], sizes as number[]))
    sendTabs()
    scheduleSave()
  })
  ipcMain.on(IPC.windowMaximize, (event) => {
    if (!fromChat(event) || !win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on(IPC.windowDock, (event) => {
    if (!fromChat(event) || !win) return
    placement = { detached: false, maximized: false }
    if (win.isMaximized()) win.unmaximize()
    placeNextToMascot(win, paneWidth * columns(layout))
    sendWindow()
    scheduleSave()
  })
  ipcMain.on(IPC.tabsUnsplit, (event, pane: unknown) => {
    if (fromChat(event) && Number.isInteger(pane)) unsplit(pane as number)
  })
  ipcMain.on(IPC.tabsOpenSession, (event, sessionId: unknown) => {
    if (fromChat(event) && typeof sessionId === 'string') openSessionTab(sessionId)
  })
  const projects = (): FolderChoice[] =>
    listProjects(getConfig().projectRoots).map(({ nome, caminho }) => ({
      name: nome,
      display: tilde(caminho),
      path: caminho
    }))
  ipcMain.handle(IPC.tabsProjects, (event): FolderChoice[] => (fromChat(event) ? projects() : []))
  ipcMain.handle(IPC.tabsOpenFolder, async (event, path: unknown): Promise<FolderResult> => {
    if (!fromChat(event)) return { ok: false, message: t('pedido inválido') }
    let chosen: string | null
    if (typeof path === 'string') {
      // Da página, só um projeto da lista; outra pasta, só escolhida no diálogo do sistema.
      if (!projects().some((project) => project.path === path)) {
        return { ok: false, message: t('Essa pasta não está nas suas pastas de projetos.') }
      }
      chosen = path
    } else {
      chosen = await pickFolder(t('Abrir uma pasta numa conversa'), homedir(), win)
      if (!chosen) return { ok: false }
    }
    const folder = usableFolder(chosen)
    if (!folder) return { ok: false, message: t('Não dá para abrir essa pasta numa conversa.') }
    const conversation = addChatTab(makeConversation(undefined, undefined, folder))
    if (win) show(win)
    // Se a pasta tiver hooks ou ferramentas liberadas, o card de confiança já aparece.
    void conversation.checkFolder()
    return { ok: true }
  })
  app.on('before-quit', () => {
    quitting = true
    saveTabs()
  })

  /**
   * Oferece no painel o que há de novo na área de transferência. Só quando o painel ganha o foco
   * (o Wisp não fica vigiando o que você copia) e no máximo uma vez por CLIPBOARD_CHECK_MS.
   */
  async function offerClipboard(): Promise<void> {
    const now = Date.now()
    if (!win || !pageReady || now - clipboardCheckedAt < CLIPBOARD_CHECK_MS) return
    clipboardCheckedAt = now
    const offer = getConfig().clipboardChip ? await clipboardChip.check() : null
    if ((offer?.id ?? null) === clipboardOffered) return
    clipboardOffered = offer?.id ?? null
    if (win && pageReady) win.webContents.send(IPC.chatClipboard, offer)
  }

  /** Abre o painel com um texto ditado na caixa de mensagem da conversa em foco. */
  function compose(text: string): void {
    focusedConversation()
    if (win && pageReady) win.webContents.send(IPC.chatCompose, text)
    else pendingCompose = pendingCompose ? `${pendingCompose} ${text}` : text
    if (!win) win = createWindow()
    else show(win)
  }

  /** Tira o print com o painel fora da frente e depois o devolve como estava. */
  function captureWithoutPanel(): Promise<ScreenImage[]> {
    const run = async (): Promise<ScreenImage[]> => {
      const chat = win?.isVisible() ? win : null
      const wasFocused = chat?.isFocused() ?? false
      if (chat) {
        // Sem o hide(): sumir e voltar para o print não toca os sons de fechar e abrir.
        chat.hide()
        await new Promise((resolve) => setTimeout(resolve, PANEL_AWAY_MS))
      }
      try {
        return await captureScreens()
      } finally {
        if (chat && !chat.isDestroyed()) {
          if (wasFocused) {
            chat.show()
            chat.focus()
          } else {
            chat.showInactive()
          }
        }
      }
    }
    const next = captureQueue.then(run, run)
    captureQueue = next.catch(() => {})
    return next
  }

  /**
   * Coloca o painel ao lado do mascote (à esquerda, ou à direita se não couber), dentro da área
   * útil. `width`: a largura nova (a tela dividida mudou); sem ela, a de agora.
   */
  /** O mascote a menos disto do topo da tela (a ilha): o painel abre embaixo dele (px). */
  const TOP_ANCHOR = 40

  function placeNextToMascot(chat: BrowserWindow, width?: number): void {
    const mascot = anchor()
    if (!mascot) return
    const area = screen.getDisplayMatching(mascot).workArea
    const [currentWidth, currentHeight] = chat.getSize()
    const w = Math.min(width ?? currentWidth, area.width)
    const height = Math.min(currentHeight, area.height)
    const clamp = (value: number, min: number, max: number): number =>
      Math.min(Math.max(value, min), max)

    // Colado no topo da tela (a ilha): o painel abre logo abaixo, centralizado com ela.
    if (mascot.y - area.y < TOP_ANCHOR) {
      const below = Math.min(height, area.y + area.height - (mascot.y + mascot.height + GAP))
      chat.setBounds({
        x: clamp(Math.round(mascot.x + (mascot.width - w) / 2), area.x, area.x + area.width - w),
        y: mascot.y + mascot.height + GAP,
        width: w,
        height: Math.max(360, below)
      })
      return
    }
    let x = mascot.x - GAP - w
    if (x < area.x) x = mascot.x + mascot.width + GAP
    x = clamp(x, area.x, area.x + area.width - w)
    // Alinhado pela base do mascote, crescendo para cima.
    const y = clamp(mascot.y + mascot.height - height, area.y, area.y + area.height - height)
    chat.setBounds({ x, y, width: w, height })
    placed(chat)
  }

  /** O Wisp acabou de pôr a janela aqui: um "move" que chegar agora não foi você. */
  function placed(chat: BrowserWindow): void {
    placedBounds = chat.getBounds()
    placedAt = Date.now()
  }

  /**
   * Põe a janela onde ela deve aparecer: onde você a deixou (solta, ou maximizada), ou ao lado do
   * mascote. Uma posição que não cabe mais em nenhum monitor volta para perto do mascote.
   */
  function place(chat: BrowserWindow): void {
    const bounds = placement.bounds
    if (placement.detached && bounds) {
      const area = screen.getDisplayMatching(bounds).workArea
      const visible =
        bounds.x < area.x + area.width - 80 &&
        bounds.x + bounds.width > area.x + 80 &&
        bounds.y < area.y + area.height - 60 &&
        bounds.y + 40 > area.y
      if (visible) {
        chat.setBounds({
          ...bounds,
          width: Math.min(bounds.width, area.width),
          height: Math.min(bounds.height, area.height)
        })
        placed(chat)
        if (placement.maximized && !chat.isMaximized()) chat.maximize()
        return
      }
      placement = { detached: false, maximized: false }
      scheduleSave()
    }
    placeNextToMascot(chat, paneWidth * columns(layout))
  }

  /** O estado da janela para a página (o botão de maximizar e o de voltar para perto do mascote). */
  function sendWindow(): void {
    if (!win || !pageReady) return
    const state: WindowState = { maximized: win.isMaximized(), detached: placement.detached }
    win.webContents.send(IPC.windowState, state)
  }

  /**
   * A janela mexeu: se não foi o Wisp (os limites diferem dos que ele deu), foi você. A partir
   * daí, ela reabre onde você a deixou.
   */
  function noticeMoved(chat: BrowserWindow): void {
    if (!chat.isVisible() || chat.isMaximized() || chat.isMinimized()) return
    const bounds = chat.getBounds()
    const near = (a: number, b: number): boolean => Math.abs(a - b) <= 6
    if (
      placedBounds &&
      near(bounds.x, placedBounds.x) &&
      near(bounds.y, placedBounds.y) &&
      near(bounds.width, placedBounds.width) &&
      near(bounds.height, placedBounds.height)
    ) {
      return
    }
    placement = { detached: true, maximized: false, bounds }
    placedBounds = bounds
    sendWindow()
    scheduleSave()
  }

  /** O tamanho mínimo da janela para a grade caber (sem passar do monitor). */
  function minimumSize(chat: BrowserWindow): [number, number] {
    const area = screen.getDisplayMatching(chat.getBounds()).workArea
    return [
      Math.min(PANE_MIN_WIDTH * columns(layout), area.width),
      Math.min(Math.max(360, PANE_MIN_HEIGHT * rows(layout) + 90), area.height)
    ]
  }

  /**
   * A grade mudou. Ao lado do mascote, a janela alarga ou estreita conforme os painéis lado a
   * lado, respeitando a largura que você deu a cada um. Solta ou maximizada, ela fica como está:
   * dividir reparte o espaço.
   */
  function resizeForPanes(): void {
    if (!win) return
    const [minWidth, minHeight] = minimumSize(win)
    win.setMinimumSize(minWidth, minHeight)
    const cols = columns(layout)
    if (shownPanes === cols) return
    if (placement.detached || win.isMaximized()) {
      shownPanes = cols
      return
    }
    const [width] = win.getSize()
    paneWidth = Math.max(PANE_MIN_WIDTH, Math.round(width / shownPanes))
    shownPanes = cols
    placeNextToMascot(win, paneWidth * cols)
  }

  function show(chat: BrowserWindow): void {
    // Relê o config.json se ele mudou; problemas novos chegam pelo onConfigProblems, e um
    // modelo trocado no arquivo vale a partir da próxima mensagem.
    for (const conversation of conversations()) conversation.syncModel()
    const appearing = !chat.isVisible()
    if (appearing) place(chat)
    chat.show()
    chat.focus()
    if (!appearing) return
    if (pageReady) chat.webContents.send(IPC.chatShown)
    onPanel?.('open')
  }

  /** Esconde o painel (as conversas continuam). */
  function hide(chat: BrowserWindow): void {
    if (!chat.isVisible()) return
    chat.hide()
    onPanel?.('close')
  }

  /** Cria o painel. `inactive`: aparece sem roubar o foco (um pedido, uma sessão do terminal). */
  function createWindow(inactive = false): BrowserWindow {
    shownPanes = columns(layout)
    const chat = new BrowserWindow({
      width: paneWidth * shownPanes,
      height: CHAT_HEIGHT,
      minWidth: PANE_MIN_WIDTH,
      minHeight: 360,
      show: false,
      frame: false,
      title: 'Wisp',
      icon: appIcon,
      backgroundColor: nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light,
      webPreferences: {
        preload: PRELOAD,
        sandbox: true,
        // O corretor do Chromium baixaria dicionários do Google; não vale a pena aqui.
        spellcheck: false
      }
    })

    chat.on('show', () => onVisible?.(true))
    chat.on('hide', () => {
      onVisible?.(false)
      onAttention?.(false)
    })
    chat.on('focus', () => onAttention?.(true))
    chat.on('blur', () => onAttention?.(false))
    // Você moveu ou redimensionou: espera parar (o arraste manda muitos) e confere.
    let settle: NodeJS.Timeout | null = null
    const moved = (): void => {
      if (settle) clearTimeout(settle)
      settle = setTimeout(() => {
        settle = null
        if (Date.now() - placedAt > 250) noticeMoved(chat)
        else placed(chat)
      }, 450)
    }
    chat.on('move', moved)
    chat.on('resize', moved)
    // Maximizar faz a janela reabrir maximizada; restaurar volta ao que era antes (solta ou ao
    // lado do mascote).
    let detachedBefore = false
    chat.on('maximize', () => {
      detachedBefore = placement.detached
      placement = {
        detached: true,
        maximized: true,
        bounds: placement.bounds ?? placedBounds ?? undefined
      }
      sendWindow()
      scheduleSave()
    })
    chat.on('unmaximize', () => {
      placement = { ...placement, maximized: false, detached: detachedBefore }
      sendWindow()
      scheduleSave()
    })
    chat.once('ready-to-show', () => {
      const [minWidth, minHeight] = minimumSize(chat)
      chat.setMinimumSize(minWidth, minHeight)
    })
    chat.once('ready-to-show', () => {
      if (!inactive) return show(chat)
      place(chat)
      chat.showInactive()
    })
    // Fechar (Alt+F4, botão do gerenciador de janelas) só esconde; as conversas continuam.
    chat.on('close', (event) => {
      if (quitting) return
      event.preventDefault()
      hide(chat)
    })
    chat.on('closed', () => {
      win = null
      pageReady = false
    })
    chat.on('focus', () => void offerClipboard())
    // Se a página recarregar (dev), os eventos esperam até ela avisar que está pronta de novo.
    chat.webContents.on('did-start-loading', () => {
      pageReady = false
    })
    // Se a página cair, ela recarrega vazia: os processos do Claude Code e as conversas continuam.
    // Cada conversa volta do histórico, com os cards ainda abertos, e depois o resto.
    reloadOnCrash(chat, () => {
      pageReady = false
      for (const conversation of conversations()) {
        for (const event of conversation.replay()) toPage(conversation.id, event)
      }
      if (lastUsage) toPage(lastUsage[0], lastUsage[1])
      focusedConversation().notice(
        'warning',
        t('O painel reiniciou depois de uma falha. As conversas continuam.')
      )
    })

    // Links da conversa abrem no navegador; a janela nunca navega para fora.
    chat.webContents.setWindowOpenHandler(({ url }) => {
      openExternal(url)
      return { action: 'deny' }
    })
    chat.webContents.on('will-navigate', (event, url) => {
      if (url === chat.webContents.getURL()) return
      event.preventDefault()
      openExternal(url)
    })

    // O tamanho do painel (Ctrl+mais e Ctrl+menos, Fase 22) vale a cada carga da página.
    chat.webContents.on('did-finish-load', () => {
      chat.webContents.setZoomFactor(getConfig().panelZoom)
    })
    loadPage(chat, 'chat')
    if (configProblems().length) {
      focusedConversation().notice('warning', configNotice(configProblems()))
    }
    // Já avisa no chat se o Claude Code não estiver instalado ou logado.
    void focusedConversation().session.preflight()
    return chat
  }

  return {
    requestApproval(request) {
      const conversation = conversationById(request.conversation) ?? focusedConversation()
      return conversation.requestApproval(request)
    },
    toggle() {
      if (!win) {
        win = createWindow()
        return
      }
      if (win.isVisible() && win.isFocused()) hide(win)
      else show(win)
    },
    open() {
      if (!win) win = createWindow()
      else show(win)
    },
    openSettings() {
      if (win && pageReady) win.webContents.send(IPC.settingsShow)
      else showSettingsOnReady = true
      if (!win) win = createWindow()
      else show(win)
    },
    showView(view) {
      if (win && pageReady) win.webContents.send(IPC.panelView, view)
      else viewOnReady = view
      if (!win) win = createWindow()
      else show(win)
    },
    openSummary() {
      if (win && pageReady) win.webContents.send(IPC.summaryShow)
      else showSummaryOnReady = true
      if (!win) win = createWindow()
      else show(win)
    },
    ask(text, { voice = false } = {}) {
      let conversation = focusedConversation()
      // A conversa em foco está respondendo: o que foi falado entra na fila dela, como no
      // terminal; uma pergunta do --ask vai numa aba nova, e a outra segue.
      const queue = voice && conversation.busy && conversation.canSend
      if (conversation.busy && !queue && tabs.length < MAX_TABS) conversation = addChatTab()
      if (!win) win = createWindow()
      else show(win)
      if (conversation.busy && !queue) {
        if (voice) compose(text)
        conversation.notice(
          'warning',
          voice
            ? t(
                'Ainda estou respondendo a mensagem anterior. Deixei o que você disse na caixa: mande quando eu terminar.'
              )
            : t('Ainda estou respondendo a mensagem anterior. Mande de novo quando eu terminar.')
        )
        return null
      }
      // O painel mostra a mensagem como se ela tivesse sido escrita nele.
      conversation.showUser(text, voice)
      conversation.send(text, [], previewOf, voice)
      return conversation.id
    },
    compose,
    utterance(text) {
      focusedConversation().showUser(text, true)
    },
    pendingApprovals() {
      return conversations().reduce((sum, conversation) => sum + conversation.pendingCount(), 0)
    },
    denyApprovals() {
      const latest = conversations()
        .filter((conversation) => conversation.pendingCount() > 0)
        .sort((a, b) => b.lastRequestAt - a.lastRequestAt)[0]
      latest?.denyPending()
    },
    answerRemote(id, decision, how) {
      const owner = conversations().find((conversation) => conversation.owns(id))
      if (!owner) return false
      const expired = how === 'expired'
      const ok = owner.answer(
        id,
        decision,
        expired ? t('Ninguém respondeu a tempo: o pedido foi para o celular e expirou.') : undefined
      )
      if (ok) {
        const where = how === 'notification' ? t('pela notificação') : t('pelo celular')
        owner.notice(
          'info',
          expired
            ? t('O pedido foi para o celular e ninguém respondeu em 2 minutos: ficou negado.')
            : decision === 'allow'
              ? t('Permitido {where}.', { where })
              : t('Negado {where}.', { where })
        )
      }
      return ok
    },
    conversationTitle(id) {
      const conversation = conversationById(id)
      return conversation ? (conversation.title ?? conversation.project ?? t('Nova conversa')) : ''
    },
    visible() {
      return win?.isVisible() ?? false
    },
    attended() {
      return (win?.isVisible() && win.isFocused()) ?? false
    },
    voiceStatus(status) {
      voice = status
      if (win && pageReady) win.webContents.send(IPC.voiceStatus, status)
    },
    voiceLevel(level) {
      if (win && pageReady && win.isVisible()) win.webContents.send(IPC.voiceLevel, level)
    },
    setMood(state) {
      mood = state
      if (win && pageReady) win.webContents.send(IPC.chatMood, state)
    },
    isSender(sender) {
      return win !== null && sender === win.webContents
    },
    notifySessions() {
      if (win && pageReady) win.webContents.send(IPC.sessionsChanged)
    },
    showSessions() {
      if (!win) {
        showSessionsOnReady = true
        win = createWindow(true)
        return
      }
      // Quem está usando o painel não perde o que faz: o contador e o mascote já avisam.
      if (win.isVisible() && win.isFocused()) return
      if (!win.isVisible()) {
        place(win)
        win.showInactive()
      }
      if (pageReady) win.webContents.send(IPC.sessionsShow)
      else showSessionsOnReady = true
    },
    continueSession(seed) {
      if (tabs.length >= MAX_TABS && !emptyFocusedConversation()) {
        focusedConversation().notice(
          'warning',
          t('Já há {MAX_TABS} abas abertas. Feche uma para continuar a sessão aqui.', { MAX_TABS })
        )
        return
      }
      const conversation = freshConversation()
      // O que se viu por último no terminal, para a conversa não começar do nada.
      const preface: ChatEvent[] = []
      if (seed.prompt) preface.push({ type: 'user', text: seed.prompt, attachments: [] })
      if (seed.lastMessage) {
        preface.push({
          type: 'text',
          blockId: `terminal:${seed.sessionId}`,
          delta: seed.lastMessage
        })
      }
      preface.push({
        type: 'notice',
        level: 'info',
        text: seed.alive
          ? t(
              'Sessão do terminal em {project}. Ela continua aberta lá, então o Wisp segue numa cópia: as duas não se misturam.',
              { project: seed.project }
            )
          : t('Sessão do terminal em {project}. O Claude continua de onde parou.', {
              project: seed.project
            })
      })
      conversation.continueSession({ ...seed, preface })
      for (const event of preface) toPage(conversation.id, event)
      showTab(conversation.id)
      if (!win) win = createWindow()
      else show(win)
    },
    newConversation() {
      if (tabs.length < MAX_TABS || emptyFocusedConversation()) showTab(freshConversation().id)
      if (!win) win = createWindow()
      else show(win)
    },
    attach(dropped) {
      focusedConversation()
      if (win && pageReady) win.webContents.send(IPC.chatAttach, dropped)
      else pendingAttach.push(dropped)
      if (!win) win = createWindow()
      else show(win)
    },
    notifySound(settings) {
      if (win && pageReady) win.webContents.send(IPC.soundChanged, settings)
    },
    notifySettings(snapshot) {
      if (win && pageReady) win.webContents.send(IPC.settingsChanged, snapshot)
    },
    setAgenda(next) {
      agendaNext = next
      if (win && pageReady) win.webContents.send(IPC.agendaNext, next)
    },
    capture: captureWithoutPanel,
    notice(level, text) {
      focusedConversation().notice(level, text)
    },
    side() {
      const mascot = anchor()
      if (!win || !mascot) return 'left'
      const chat = win.getBounds()
      return chat.x + chat.width / 2 < mascot.x + mascot.width / 2 ? 'left' : 'right'
    },
    openrouterKeyChanged() {
      for (const conversation of conversations()) conversation.session.dropSecret()
    },
    terminalEvent(event, pending) {
      const conversation = conversations().find((c) => c.terminalToken === event.tab)
      if (!conversation) return false
      conversation.terminalEvent(event, pending)
      return true
    },
    dispose() {
      saveTabs()
      for (const conversation of conversations()) {
        conversation.dispose()
        rmSync(modeFileOf(conversation.id), { force: true })
      }
    }
  }
}
