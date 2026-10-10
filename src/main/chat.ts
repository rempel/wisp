import { app, BrowserWindow, ipcMain, nativeTheme, screen, shell } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent, Rectangle, WebContents } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { basename, join } from 'path'
import appIcon from '../../resources/icon.png?asset'
import workspaceClaudeMd from '../../resources/workspace/CLAUDE.md?raw'
import { isThumbnail, saveIncoming, savePasted } from './attachments'
import { BROWSER_PREFIX, BrowserPolicy } from './browser-policy'
import { ClaudeSession, SAFE_TOOLS } from './claude'
import { ClipboardChip } from './clipboard'
import { CONFIG_PATH, configProblems, getConfig, onConfigProblems, updateConfig } from './config'
import { History } from './history'
import type { Approval, ApprovalRequest } from './mcp-server'
import { loadPage, PRELOAD, reloadOnCrash } from './page'
import { DATA_DIR } from './paths'
import { checkAnswers, parseQuestions, QUESTION_TOOL } from './questions'
import { captureScreens, CaptureError, thumbnailOf, thumbnailOfBase64 } from './screenshot'
import type { ScreenImage } from './screenshot'
import { IPC, MODEL_CHOICES } from '../shared/ipc'
import type {
  AttachmentPreview,
  ChatEvent,
  ClipboardUse,
  DroppedFile,
  DroppedFiles,
  MascotState,
  NoticeLevel,
  OutgoingAttachment,
  PastedImage,
  SoundSettings
} from '../shared/ipc'

type PermissionRequestEvent = Extract<ChatEvent, { type: 'permission-request' }>

const CHAT_WIDTH = 420
const CHAT_HEIGHT = 600
/** Distância entre o mascote e o painel. */
const GAP = 8
/** Fundo da janela antes de a página pintar; igual ao --bg do chat.css. */
const BACKGROUND = { dark: '#0b1418', light: '#f5fafb' }
/** Quanto esperar o painel sumir da tela (inclusive a animação do desktop) antes do print. */
const PANEL_AWAY_MS = 350
/** De quanto em quanto tempo, no máximo, a área de transferência é conferida. */
const CLIPBOARD_CHECK_MS = 1000

const WORKSPACE_DIR = join(DATA_DIR, 'workspace')

const APPEND_SYSTEM_PROMPT =
  'Você está respondendo dentro do Wisp, um painel de chat pequeno no desktop Linux do usuário. ' +
  'Responda em português do Brasil, de forma breve. O painel é estreito: use Markdown leve, com ' +
  'parágrafos curtos e listas simples, sem títulos grandes nem tabelas largas. Quando o usuário ' +
  'anexa arquivos, a mensagem termina com um bloco <anexos> com os caminhos deles: leia-os com a ' +
  'ferramenta Read (ela também lê imagens e PDFs) antes de responder sobre eles.'

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

/**
 * Até onde vai o "Permitir sempre nesta conversa": no Bash, o mesmo comando exato (liberar todo
 * Bash por causa de um `ls` seria perigoso); nas outras ferramentas, a ferramenta toda.
 */
function permissionScope({ toolName, input }: ApprovalRequest): string {
  const command = (input as { command?: unknown } | null)?.command
  return toolName === 'Bash' && typeof command === 'string' ? `Bash:${command}` : toolName
}

export interface Chat {
  /** Mostra o painel ao lado do mascote, traz para a frente ou esconde. */
  toggle(): void
  /** Mostra o painel e traz para a frente (sem esconder, se já estiver à vista). */
  open(): void
  /** Manda uma mensagem como se o usuário a tivesse escrito (o comando `wisp --ask`). */
  ask(text: string): void
  /** O humor do mascote mudou: o avatar do cabeçalho acompanha. */
  setMood(state: MascotState): void
  /** Abre o painel numa conversa nova (menu da bandeja). */
  newConversation(): void
  /** De que lado do mascote o painel fica (para o mascote olhar para ele). */
  side(): 'left' | 'right'
  /** Mostra o card de permissão e resolve com a decisão do usuário. */
  requestApproval(request: ApprovalRequest): Promise<Approval>
  /** O IPC veio da página do painel? */
  isSender(sender: WebContents): boolean
  /** As sessões do terminal mudaram: a aba Sessões busca de novo. */
  notifySessions(): void
  /** Uma sessão do terminal pede algo: o painel aparece (sem roubar o foco) na aba Sessões. */
  showSessions(): void
  /** Continua no chat uma sessão do terminal. */
  continueSession(seed: SessionSeed): void
  /** Arquivos soltos no mascote: o painel aparece com eles anexados. */
  attach(dropped: DroppedFiles): void
  /** Os sons foram ligados ou desligados (o botão de mudo acompanha). */
  notifySound(settings: SoundSettings): void
  /**
   * Tira o print das telas com o painel fora da frente; depois ele volta como estava. Lança
   * CaptureError com o motivo.
   */
  capture(): Promise<ScreenImage[]>
  /** Um aviso na conversa (fora do histórico), como um problema na configuração. */
  notice(level: NoticeLevel, text: string): void
  /** Encerra o processo do Claude Code (o app está fechando). */
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
  /** Liga o servidor `desktop`; sem ele, a conversa roda sem as ferramentas de desktop. */
  mcpConfigPath?: string
  /** Recebe cada evento da conversa (o humor do mascote acompanha a conversa por aqui). */
  onEvent?: (event: ChatEvent) => void
  /** O usuário abriu ou fechou o painel (os sons de abrir e fechar). */
  onPanel?: (change: 'open' | 'close') => void
  /** O usuário está mexendo no painel (o mascote não cochila). */
  onActivity?: () => void
}

/**
 * Painel de chat: uma janela que nasce na primeira vez que é aberta e depois só é escondida,
 * para a conversa continuar lá.
 */
export function setupChat({
  anchor,
  mcpConfigPath,
  onEvent,
  onPanel,
  onActivity
}: ChatOptions): Chat {
  let win: BrowserWindow | null = null
  // A página ainda não ouve eventos enquanto carrega; até lá eles esperam aqui.
  let pageReady = false
  const queued: ChatEvent[] = []
  let quitting = false
  let mood: MascotState = 'idle'
  // Mostrar a aba Sessões assim que a página carregar (o pedido chegou antes).
  let showSessionsOnReady = false
  // Arquivos soltos no mascote antes de a página carregar.
  const pendingAttach: DroppedFiles[] = []
  // O último uso do plano, para mostrar de novo se a página recarregar.
  let lastUsage: Extract<ChatEvent, { type: 'usage' }> | null = null
  const history = new History()
  // A oferta de "usar o que você copiou" que o painel mostra (o id), e quando foi conferida.
  const clipboardChip = new ClipboardChip()
  let clipboardOffered: string | null = null
  let clipboardCheckedAt = 0
  // Os prints, um de cada vez (o painel some e volta em cada um).
  let captureQueue: Promise<unknown> = Promise.resolve()
  // Pedidos de permissão esperando o clique no card, e o que já foi liberado "sempre".
  const approvals = new Map<
    string,
    { scope: string; resolve: (approval: Approval) => void; event: PermissionRequestEvent }
  >()
  const alwaysAllowed = new Set<string>()
  // O navegador do Claude: sites liberados e em que página ele está (browser-policy.ts).
  const browser = new BrowserPolicy()

  /** Manda um evento só para a página (as reaberturas do histórico não mexem no mascote). */
  const toPage = (event: ChatEvent): void => {
    if (win && pageReady) win.webContents.send(IPC.chatEvent, event)
    else queued.push(event)
  }
  const send = (event: ChatEvent): void => {
    onEvent?.(event)
    toPage(event)
  }

  // Problemas no config.json aparecem na conversa (o terminal nem sempre está à vista): ao abrir
  // o painel pela primeira vez e quando o arquivo muda com eles.
  const configNotice = (problems: string[]): ChatEvent => ({
    type: 'notice',
    level: 'warning',
    text:
      `Encontrei problemas no \`${CONFIG_PATH.replace(homedir(), '~')}\`:\n\n` +
      problems.map((problem) => `- ${problem}`).join('\n')
  })
  onConfigProblems((problems) => {
    if (win && problems.length) send(configNotice(problems))
  })

  // O tema do sistema mudou: a página troca sozinha (prefers-color-scheme); o fundo da janela,
  // que aparece antes de a página pintar e ao redimensionar, acompanha aqui.
  nativeTheme.on('updated', () => {
    win?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light)
  })

  const deliver = (event: ChatEvent): void => {
    // Turno encerrado (parado, com erro) ou conversa nova: nenhum pedido aberto vai ser usado.
    if (event.type === 'turn-end' || event.type === 'reset') cancelApprovals()
    if (event.type === 'reset') alwaysAllowed.clear()
    if (event.type === 'usage') lastUsage = event
    browser.track(event)
    history.record(event)
    send(event)
  }

  function cancelApprovals(): void {
    for (const [id, approval] of approvals) {
      approval.resolve({ allow: false, message: 'O usuário parou a resposta.' })
      deliver({ type: 'permission-resolved', id, decision: 'cancelled' })
    }
    approvals.clear()
  }

  /** Manda de novo para a página a conversa atual, do histórico (a página recarregou). */
  function replayCurrent(): boolean {
    const id = history.currentId()
    const saved = id ? history.load(id) : null
    if (!saved) return false
    for (const event of saved.events) toPage(event)
    return true
  }

  const config = getConfig()
  const session = new ClaudeSession(
    {
      claudePath: config.claudePath,
      workspace: prepareWorkspace,
      allowedTools: [...SAFE_TOOLS, ...config.extraAllowedTools],
      appendSystemPrompt: APPEND_SYSTEM_PROMPT,
      mcpConfigPath,
      model: config.model,
      onSessionId: (id) => history.setSession(id),
      thumbnail: thumbnailOfBase64
    },
    deliver
  )

  const fromChat = (event: IpcMainEvent | IpcMainInvokeEvent): boolean =>
    win !== null && event.sender === win.webContents

  ipcMain.on(IPC.chatReady, (event) => {
    if (!fromChat(event) || !win) return
    pageReady = true
    win.webContents.send(IPC.chatMood, mood)
    for (const waiting of queued.splice(0)) win.webContents.send(IPC.chatEvent, waiting)
    if (showSessionsOnReady) win.webContents.send(IPC.sessionsShow)
    showSessionsOnReady = false
    for (const dropped of pendingAttach.splice(0)) win.webContents.send(IPC.chatAttach, dropped)
    // A página (re)começou sem chip: o que estiver copiado é oferecido de novo.
    clipboardOffered = null
    clipboardCheckedAt = 0
    if (win.isFocused()) void offerClipboard()
  })
  ipcMain.on(IPC.chatActivity, (event) => {
    if (fromChat(event)) onActivity?.()
  })
  ipcMain.on(IPC.chatSend, (event, text: unknown, attachments: unknown) => {
    if (!fromChat(event) || typeof text !== 'string' || session.isBusy()) return
    const files = outgoing(attachments)
    if (!text.trim() && !files.length) return
    history.user(session.ensureSessionId(), text, files.map(previewOf))
    void session.send(
      text,
      files.map((file) => file.path)
    )
  })
  ipcMain.on(IPC.chatStop, (event) => {
    if (fromChat(event)) session.stop()
  })
  ipcMain.on(IPC.chatNew, (event) => {
    if (fromChat(event)) session.reset()
  })
  ipcMain.on(IPC.chatModel, (event, choice: unknown) => {
    if (!fromChat(event)) return
    if (choice !== null && !MODEL_CHOICES.includes(choice as (typeof MODEL_CHOICES)[number])) return
    const model = choice as string | null
    updateConfig({ model })
    session.setModel(model)
  })
  ipcMain.handle(
    IPC.chatPaste,
    async (event, data: unknown, type: unknown): Promise<PastedImage> => {
      const bytes = bytesOf(data)
      if (!fromChat(event) || !bytes || typeof type !== 'string')
        return { error: 'pedido inválido' }
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
      return { files: [], problems: [`Não consegui tirar o print: ${reason}.`] }
    }
  })
  ipcMain.handle(IPC.chatClipboardUse, async (event, id: unknown): Promise<ClipboardUse> => {
    if (!fromChat(event) || typeof id !== 'string') return { error: 'pedido inválido' }
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
  ipcMain.handle(IPC.historyList, (event) => (fromChat(event) ? history.list() : []))
  ipcMain.handle(IPC.historyOpen, (event, id: unknown) => {
    if (!fromChat(event) || typeof id !== 'string') return false
    if (id === history.currentId()) return true
    const saved = history.load(id)
    if (!saved) return false
    // A conversa atual fecha (o 'reset' passa pelo histórico e pelos cards) e a guardada volta:
    // primeiro o que o painel mostrava, depois a próxima mensagem retoma o Claude Code.
    session.resume(saved.sessionId, { cwd: saved.cwd })
    history.continue(saved)
    for (const replayed of saved.events) toPage(replayed)
    toPage({ type: 'restored', createdAt: saved.createdAt })
    return true
  })
  ipcMain.handle(IPC.historyDelete, (event, id: unknown) => {
    if (!fromChat(event) || typeof id !== 'string') return false
    const current = id === history.currentId()
    const removed = history.remove(id)
    // Apagar a conversa aberta é começar outra.
    if (current) session.reset()
    return removed
  })
  ipcMain.on(IPC.chatHide, (event) => {
    if (fromChat(event) && win) hide(win)
  })
  ipcMain.on(IPC.chatPermission, (event, id: unknown, decision: unknown) => {
    if (!fromChat(event) || typeof id !== 'string') return
    if (decision !== 'allow' && decision !== 'allow-always' && decision !== 'deny') return
    const approval = approvals.get(id)
    // Perguntas se respondem pelo chatAnswer: liberadas sem respostas, o Claude entenderia que o
    // usuário não respondeu.
    if (!approval || approval.event.toolName === QUESTION_TOOL) return
    approvals.delete(id)
    if (decision === 'allow-always') {
      // No navegador, o "sempre" vale para o site; código na página e arquivos não têm "sempre".
      const { always, site } = approval.event
      if (always === 'site' && site) browser.allowSite(site)
      else if (!always) alwaysAllowed.add(approval.scope)
    }
    approval.resolve(
      decision === 'deny' ? { allow: false, message: 'Usuário negou' } : { allow: true }
    )
    deliver({ type: 'permission-resolved', id, decision })
  })
  ipcMain.on(IPC.chatAnswer, (event, id: unknown, answers: unknown) => {
    if (!fromChat(event) || typeof id !== 'string') return
    const approval = approvals.get(id)
    if (!approval || approval.event.toolName !== QUESTION_TOOL) return
    const input = approval.event.input as Record<string, unknown>
    if (answers === null) {
      approvals.delete(id)
      approval.resolve({ allow: false, message: 'O usuário preferiu não responder.' })
      deliver({ type: 'permission-resolved', id, decision: 'deny' })
      return
    }
    const questions = parseQuestions(input)
    const checked = questions && checkAnswers(questions, answers)
    if (!checked) return
    approvals.delete(id)
    approval.resolve({ allow: true, updatedInput: { ...input, answers: checked } })
    deliver({ type: 'permission-resolved', id, decision: 'answered', answers: checked })
  })
  app.on('before-quit', () => {
    quitting = true
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

  /** Tira o print com o painel fora da frente e depois o devolve como estava. */
  function captureWithoutPanel(): Promise<ScreenImage[]> {
    const run = async (): Promise<ScreenImage[]> => {
      const chat = win?.isVisible() ? win : null
      const focused = chat?.isFocused() ?? false
      if (chat) {
        // Sem o hide(): sumir e voltar para o print não toca os sons de fechar e abrir.
        chat.hide()
        await new Promise((resolve) => setTimeout(resolve, PANEL_AWAY_MS))
      }
      try {
        return await captureScreens()
      } finally {
        if (chat && !chat.isDestroyed()) {
          if (focused) {
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

  /** Coloca o painel ao lado do mascote (à esquerda, ou à direita se não couber), dentro da área útil. */
  function placeNextToMascot(chat: BrowserWindow): void {
    const mascot = anchor()
    if (!mascot) return
    const area = screen.getDisplayMatching(mascot).workArea
    const [currentWidth, currentHeight] = chat.getSize()
    const width = Math.min(currentWidth, area.width)
    const height = Math.min(currentHeight, area.height)
    const clamp = (value: number, min: number, max: number): number =>
      Math.min(Math.max(value, min), max)

    let x = mascot.x - GAP - width
    if (x < area.x) x = mascot.x + mascot.width + GAP
    x = clamp(x, area.x, area.x + area.width - width)
    // Alinhado pela base do mascote, crescendo para cima.
    const y = clamp(mascot.y + mascot.height - height, area.y, area.y + area.height - height)
    chat.setBounds({ x, y, width, height })
  }

  function show(chat: BrowserWindow): void {
    // Relê o config.json se ele mudou; problemas novos chegam pelo onConfigProblems, e um
    // modelo trocado no arquivo vale a partir da próxima mensagem.
    session.setModel(getConfig().model)
    const appearing = !chat.isVisible()
    if (appearing) placeNextToMascot(chat)
    chat.show()
    chat.focus()
    if (!appearing) return
    if (pageReady) chat.webContents.send(IPC.chatShown)
    onPanel?.('open')
  }

  /** Esconde o painel (a conversa continua). */
  function hide(chat: BrowserWindow): void {
    if (!chat.isVisible()) return
    chat.hide()
    onPanel?.('close')
  }

  /** Cria o painel. `inactive`: aparece sem roubar o foco (um pedido de uma sessão do terminal). */
  function createWindow(inactive = false): BrowserWindow {
    const chat = new BrowserWindow({
      width: CHAT_WIDTH,
      height: CHAT_HEIGHT,
      minWidth: 320,
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

    chat.once('ready-to-show', () => {
      if (!inactive) return show(chat)
      placeNextToMascot(chat)
      chat.showInactive()
    })
    // Fechar (Alt+F4, botão do gerenciador de janelas) só esconde; a conversa continua.
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
    // Se a página cair, ela recarrega vazia: o processo do Claude Code e a conversa continuam.
    // A conversa volta do histórico, com os cards de permissão ainda abertos, e depois o resto.
    reloadOnCrash(chat, () => {
      pageReady = false
      history.flush()
      const replayed = replayCurrent()
      if (!replayed) for (const approval of approvals.values()) toPage(approval.event)
      toPage(session.modelEvent())
      if (lastUsage) toPage(lastUsage)
      if (session.isBusy()) toPage({ type: 'busy', busy: true })
      toPage({
        type: 'notice',
        level: 'warning',
        text: 'O painel reiniciou depois de uma falha. A conversa continua.'
      })
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

    loadPage(chat, 'chat')
    toPage(session.modelEvent())
    if (configProblems().length) send(configNotice(configProblems()))
    // Já avisa no chat se o Claude Code não estiver instalado ou logado.
    void session.preflight()
    return chat
  }

  return {
    requestApproval(request) {
      if (request.signal?.aborted) {
        return Promise.resolve({ allow: false, message: 'O pedido foi cancelado.' })
      }
      let scope: Pick<PermissionRequestEvent, 'site' | 'always'> = {}
      if (request.toolName.startsWith(BROWSER_PREFIX)) {
        const verdict = browser.check(request.toolName, request.input)
        if (verdict.allow) return Promise.resolve({ allow: true })
        scope = {
          ...(verdict.site ? { site: verdict.site } : {}),
          always: verdict.always ? 'site' : 'none'
        }
      } else if (alwaysAllowed.has(permissionScope(request))) {
        return Promise.resolve({ allow: true })
      }
      const id = randomUUID()
      return new Promise<Approval>((resolve) => {
        const event: PermissionRequestEvent = {
          type: 'permission-request',
          id,
          toolName: request.toolName,
          input: request.input,
          toolUseId: request.toolUseId,
          ...scope
        }
        approvals.set(id, { scope: permissionScope(request), resolve, event })
        // O Claude Code desistiu (Parar, turno encerrado, conexão fechada): o card some.
        request.signal?.addEventListener(
          'abort',
          () => {
            if (!approvals.delete(id)) return
            resolve({ allow: false, message: 'O pedido foi cancelado.' })
            deliver({ type: 'permission-resolved', id, decision: 'cancelled' })
          },
          { once: true }
        )
        // O Claude fica parado esperando: com o painel escondido, ele aparece, sem roubar o foco.
        // Aparece antes do evento, para o mascote já olhar para o lado certo.
        if (win && !win.isVisible()) {
          placeNextToMascot(win)
          win.showInactive()
        }
        deliver(event)
      })
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
    ask(text) {
      if (!win) win = createWindow()
      else show(win)
      if (session.isBusy()) {
        deliver({
          type: 'notice',
          level: 'warning',
          text: 'Ainda estou respondendo a mensagem anterior. Mande de novo quando eu terminar.'
        })
        return
      }
      // O painel mostra a mensagem como se ela tivesse sido escrita nele.
      toPage({ type: 'user', text, attachments: [] })
      history.user(session.ensureSessionId(), text, [])
      void session.send(text, [])
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
        placeNextToMascot(win)
        win.showInactive()
      }
      if (pageReady) win.webContents.send(IPC.sessionsShow)
      else showSessionsOnReady = true
    },
    continueSession(seed) {
      session.resume(seed.sessionId, { cwd: seed.cwd, fork: seed.alive })
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
          ? `Sessão do terminal em ${seed.project}. Ela continua aberta lá, então o Wisp segue numa cópia: as duas não se misturam.`
          : `Sessão do terminal em ${seed.project}. O Claude continua de onde parou.`
      })
      history.prepare({ cwd: seed.cwd, preface })
      for (const event of preface) toPage(event)
      if (!win) win = createWindow()
      else show(win)
    },
    newConversation() {
      session.reset()
      if (!win) win = createWindow()
      else show(win)
    },
    attach(dropped) {
      if (win && pageReady) win.webContents.send(IPC.chatAttach, dropped)
      else pendingAttach.push(dropped)
      if (!win) win = createWindow()
      else show(win)
    },
    notifySound(settings) {
      if (win && pageReady) win.webContents.send(IPC.soundChanged, settings)
    },
    capture: captureWithoutPanel,
    notice(level, text) {
      send({ type: 'notice', level, text })
    },
    side() {
      const mascot = anchor()
      if (!win || !mascot) return 'left'
      const chat = win.getBounds()
      return chat.x + chat.width / 2 < mascot.x + mascot.width / 2 ? 'left' : 'right'
    },
    dispose() {
      history.flush()
      session.dispose()
    }
  }
}
