import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import appIcon from '../../resources/icon.png?asset'
import { saveIncoming, savePasted } from './attachments'
import { captureArea } from './area-capture'
import { setupTurnReviews } from './turn-review'
import type { TurnReviews } from './turn-review'
import { ChatTabs, MAX_TABS } from './chat-tabs'
import type { SavedTabs } from './chat-tabs'
import { CHAT_HEIGHT, PANE_MIN_WIDTH, PanelPlacement } from './chat-window'
import { bytesOf, conversationFactory, modeFileOf, outgoing, previewOf } from './chat-conversation'
import { promptValues, registerLibrary } from './chat-library'
import type { Chat, ChatOptions } from './chat-types'
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
import { History } from './history'
import { loadPage, PRELOAD, reloadOnCrash } from './page'
import { usableFolder } from './folders'
import { DATA_DIR } from './paths'
import { captureScreens, CaptureError, thumbnailOf } from './screenshot'
import type { ScreenImage } from './screenshot'
import { IPC, MODEL_CHOICES, PERMISSION_MODES } from '../shared/ipc'
import { columns } from '../shared/layout'
import type { DropZone } from '../shared/layout'
import type {
  AgendaItem,
  ChatEvent,
  ClipboardUse,
  DroppedFile,
  DroppedFiles,
  MascotState,
  PanelView,
  PastedImage,
  PermissionDecision,
  PermissionMode,
  Provider,
  WindowState,
  VoiceStatus
} from '../shared/ipc'
import { t } from '../shared/i18n'
import { expandPrompt } from '../shared/prompts'

/** Fundo da janela antes de a página pintar; igual ao --bg do chat (styles/base.css). */
const BACKGROUND = { dark: '#0b1418', light: '#f5fafb' }
/** Quanto esperar o painel sumir da tela (inclusive a animação do desktop) antes do print. */
const PANEL_AWAY_MS = 350
/** De quanto em quanto tempo, no máximo, a área de transferência é conferida. */
const CLIPBOARD_CHECK_MS = 1000

/** As abas abertas, para voltarem quando o app abrir de novo. */
const TABS_FILE = join(DATA_DIR, 'abas.json')
const DECISIONS: PermissionDecision[] = [
  'allow',
  'allow-always',
  'deny',
  'allow-edits',
  'allow-auto'
]

function openExternal(url: string): void {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
}

const isMode = (value: unknown): value is PermissionMode =>
  PERMISSION_MODES.includes(value as PermissionMode)

const DIRECTIONS = new Set(['row', 'column'])
const ZONES = new Set(['left', 'right', 'top', 'bottom', 'center'])

export type { Chat, ChatOptions, SessionSeed } from './chat-types'

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
  // O card do fim do turno (Fase 42): criado junto com os pedidos da página, mais abaixo.
  let reviews: TurnReviews | null = null
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

  // As abas e a grade dos painéis (chat-tabs.ts), e onde a janela aparece (chat-window.ts).
  const tabs = new ChatTabs({
    makeConversation: (mode, folder) => makeConversation(mode, undefined, folder ?? null),
    sessionTitle,
    closed(conversation) {
      conversation.dispose()
      releaseMcpConfig?.(conversation.id)
      rmSync(modeFileOf(conversation.id), { force: true })
      reviews?.forget(conversation.id)
      onClose?.(conversation.id)
    },
    changed() {
      resizeForPanes()
      sendTabs()
      scheduleSave()
    }
  })
  const placement = new PanelPlacement(anchor, () => {
    sendWindow()
    scheduleSave()
  })
  let saveTimer: NodeJS.Timeout | null = null

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
      const review = live ? reviews?.onEvent(conversation.id, event) : null
      if (review) toPage(conversation.id, review)
    },
    attention(conversation) {
      // O Claude fica parado esperando: com o painel escondido (ou ainda nem criado, num comando
      // de voz), ele aparece, sem roubar o foco, com a aba do pedido à vista.
      if (win?.isVisible()) return
      if (!tabs.panes.includes(conversation.id)) showTab(conversation.id)
      if (!win) {
        win = createWindow(true)
      } else {
        placement.place(win, tabs.layout)
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

  /** Uma conversa nova (ainda sem aba), com o claudePath e as ferramentas de quando o Wisp abriu. */
  const conversationOf = conversationFactory(getConfig(), host, mcpConfig)
  function makeConversation(
    mode: PermissionMode = getConfig().permissionMode,
    provider: Provider = getConfig().provider,
    folder: string | null = null
  ): Conversation {
    const conversation = conversationOf(mode, provider, folder)
    for (const event of conversation.initialEvents()) toPage(conversation.id, event)
    return conversation
  }

  // ---- Abas e painéis ------------------------------------------------------

  const conversations = (): Conversation[] => tabs.conversations()
  const conversationById = (id: string | undefined | null): Conversation | undefined =>
    tabs.conversationById(id)
  const focusedConversation = (): Conversation => tabs.focusedConversation()
  const showTab = (id: string): void => tabs.show(id)

  function sendTabs(): void {
    if (win && pageReady) win.webContents.send(IPC.tabsState, tabs.state())
  }

  // ---- Guardar e trazer de volta as abas -----------------------------------

  function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveTabs, 500)
  }

  function saveTabs(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    try {
      mkdirSync(DATA_DIR, { recursive: true })
      writeFileSync(TABS_FILE, JSON.stringify(tabs.snapshot(placement.window)), { mode: 0o600 })
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
    tabs.restore(saved, (entry) => {
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
      return conversation
    })
    placement.restore(saved?.window)
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
  // O card do fim do turno, com o desfazer (Fase 42).
  reviews = setupTurnReviews(fromChat, () => getConfig().turnReview)

  ipcMain.on(IPC.chatReady, (event) => {
    if (!fromChat(event) || !win) return
    pageReady = true
    win.webContents.send(IPC.chatMood, mood)
    win.webContents.send(IPC.tabsState, tabs.state())
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
  // Recortar uma área (Fase 41): o mesmo print sem o painel, e a camada para arrastar.
  ipcMain.handle(IPC.chatCaptureArea, (event): Promise<DroppedFiles> | DroppedFiles =>
    fromChat(event) ? captureArea(captureWithoutPanel) : { files: [], problems: [] }
  )
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
    if (!fromChat(event) || tabs.full) return
    tabs.addChat()
  })
  ipcMain.on(IPC.tabsClose, (event, id: unknown) => {
    if (fromChat(event) && typeof id === 'string') tabs.close(id)
  })
  ipcMain.on(IPC.tabsShow, (event, id: unknown) => {
    if (fromChat(event) && typeof id === 'string') showTab(id)
  })
  ipcMain.on(IPC.tabsFocus, (event, pane: unknown) => {
    if (fromChat(event) && Number.isInteger(pane)) tabs.focus(pane as number)
  })
  ipcMain.on(IPC.tabsSplit, (event, dir: unknown) => {
    if (fromChat(event))
      tabs.split(DIRECTIONS.has(dir as string) ? (dir as 'row' | 'column') : 'row')
  })
  ipcMain.on(IPC.tabsDrop, (event, tab: unknown, target: unknown, zone: unknown) => {
    if (!fromChat(event) || typeof tab !== 'string' || typeof target !== 'string') return
    if (ZONES.has(zone as string)) tabs.drop(tab, target, zone as DropZone)
  })
  ipcMain.on(IPC.tabsResize, (event, path: unknown, sizes: unknown) => {
    if (!fromChat(event) || !tabs.layout) return
    if (!Array.isArray(path) || !path.every((i) => Number.isInteger(i) && i >= 0)) return
    if (!Array.isArray(sizes) || !sizes.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return
    }
    tabs.resize(path as number[], sizes as number[])
    sendTabs()
    scheduleSave()
  })
  ipcMain.on(IPC.windowMaximize, (event) => {
    if (!fromChat(event) || !win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on(IPC.windowDock, (event) => {
    if (fromChat(event) && win) placement.dock(win, tabs.layout)
  })
  ipcMain.on(IPC.tabsUnsplit, (event, pane: unknown) => {
    if (fromChat(event) && Number.isInteger(pane)) tabs.unsplit(pane as number)
  })
  ipcMain.on(IPC.tabsOpenSession, (event, sessionId: unknown) => {
    if (fromChat(event) && typeof sessionId === 'string') tabs.openSession(sessionId)
  })
  // O histórico, a exportação, as pastas e os prompts salvos (chat-library.ts).
  const search = registerLibrary({
    fromChat,
    window: () => win,
    store,
    tabs,
    toPage,
    makeConversation,
    show: () => {
      if (win) show(win)
    }
  })
  app.on('before-quit', () => {
    quitting = true
    saveTabs()
    search.dispose()
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

  /** O estado da janela para a página (o botão de maximizar e o de voltar para perto do mascote). */
  function sendWindow(): void {
    if (!win || !pageReady) return
    const state: WindowState = { maximized: win.isMaximized(), detached: placement.window.detached }
    win.webContents.send(IPC.windowState, state)
  }

  /** A grade mudou: a janela acompanha (veja PanelPlacement.resizeForPanes). */
  function resizeForPanes(): void {
    if (win) placement.resizeForPanes(win, tabs.layout)
  }

  function show(chat: BrowserWindow): void {
    // Relê o config.json se ele mudou; problemas novos chegam pelo onConfigProblems, e um
    // modelo trocado no arquivo vale a partir da próxima mensagem.
    for (const conversation of conversations()) conversation.syncModel()
    const appearing = !chat.isVisible()
    if (appearing) placement.place(chat, tabs.layout)
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
    placement.shownPanes = columns(tabs.layout)
    const chat = new BrowserWindow({
      width: placement.paneWidth * placement.shownPanes,
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
    // Você moveu, redimensionou ou maximizou: a janela passa a reabrir assim.
    placement.watch(chat, () => tabs.layout)
    chat.once('ready-to-show', () => {
      if (!inactive) return show(chat)
      placement.place(chat, tabs.layout)
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
      if (conversation.busy && !queue && !tabs.full) conversation = tabs.addChat()
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
    askQuiet(text, files, { voice = false } = {}) {
      let conversation = focusedConversation()
      if (!conversation.canSend || conversation.busy) {
        if (tabs.full) return null
        conversation = tabs.addChat()
      }
      conversation.showUser(text, voice, files.map(previewOf))
      return conversation.send(text, files, previewOf, voice) ? conversation.id : null
    },
    compose,
    runTask(task) {
      if (tabs.full) {
        return {
          ok: false,
          message: t('Já há {MAX_TABS} abas abertas: feche uma para a tarefa rodar.', { MAX_TABS })
        }
      }
      let folder: string | null = null
      if (task.folder) {
        const asked = task.folder.replace(/^~(?=\/|$)/, homedir())
        folder = usableFolder(asked)
        if (!folder) {
          return {
            ok: false,
            message: t('A pasta {folder} não existe (ou não dá para abrir numa conversa).', {
              folder: task.folder
            })
          }
        }
      }
      const conversation = makeConversation('default', undefined, folder)
      conversation.title = task.name
      tabs.push(conversation)
      if (!(win?.isVisible() && win.isFocused())) tabs.showInFocused(conversation.id)
      tabs.changed()
      const text = expandPrompt(task.prompt, promptValues(folder))
      conversation.showUser(text, false)
      conversation.send(text, [], previewOf)
      return { ok: true }
    },
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
    answerIsland(id, answer) {
      const owner = conversations().find((conversation) => conversation.owns(id))
      if (!owner) return false
      if ('answers' in answer) return owner.answerQuestion(id, answer.answers)
      const ok = owner.answer(id, answer.decision)
      if (ok) {
        owner.notice(
          'info',
          answer.decision === 'deny' ? t('Negado pela ilha.') : t('Permitido pela ilha.')
        )
      }
      return ok
    },
    showConversation(id) {
      tabs.show(id)
      if (!win) win = createWindow()
      else show(win)
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
        placement.place(win, tabs.layout)
        win.showInactive()
      }
      if (pageReady) win.webContents.send(IPC.sessionsShow)
      else showSessionsOnReady = true
    },
    continueSession(seed) {
      if (tabs.full && !tabs.emptyFocused()) {
        focusedConversation().notice(
          'warning',
          t('Já há {MAX_TABS} abas abertas. Feche uma para continuar a sessão aqui.', { MAX_TABS })
        )
        return
      }
      const conversation = tabs.fresh()
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
      if (!tabs.full || tabs.emptyFocused()) showTab(tabs.fresh().id)
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
