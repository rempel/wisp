import { app, BrowserWindow, ipcMain, nativeTheme, screen, shell } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent, Rectangle } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { basename, join } from 'path'
import appIcon from '../../resources/icon.png?asset'
import workspaceClaudeMd from '../../resources/workspace/CLAUDE.md?raw'
import { savePasted } from './attachments'
import { ClaudeSession, SAFE_TOOLS } from './claude'
import { CONFIG_PATH, configProblems, getConfig, onConfigProblems, updateConfig } from './config'
import { History } from './history'
import type { Approval, ApprovalRequest } from './mcp-server'
import { loadPage, PRELOAD, reloadOnCrash } from './page'
import { DATA_DIR } from './paths'
import { checkAnswers, parseQuestions, QUESTION_TOOL } from './questions'
import { IPC, MODEL_CHOICES } from '../shared/ipc'
import type {
  AttachmentPreview,
  ChatEvent,
  MascotState,
  OutgoingAttachment,
  PastedImage
} from '../shared/ipc'

type PermissionRequestEvent = Extract<ChatEvent, { type: 'permission-request' }>

const CHAT_WIDTH = 420
const CHAT_HEIGHT = 600
/** Distância entre o mascote e o painel. */
const GAP = 8
/** Fundo da janela antes de a página pintar; igual ao --bg do chat.css. */
const BACKGROUND = { dark: '#0b1418', light: '#f5fafb' }

const WORKSPACE_DIR = join(DATA_DIR, 'workspace')

const APPEND_SYSTEM_PROMPT =
  'Você está respondendo dentro do Wisp, um painel de chat pequeno no desktop Linux do usuário. ' +
  'Responda em português do Brasil, de forma breve. O painel é estreito: use Markdown leve, com ' +
  'parágrafos curtos e listas simples, sem títulos grandes nem tabelas largas. Quando o usuário ' +
  'anexa arquivos, a mensagem termina com um bloco <anexos> com os caminhos deles: leia-os com a ' +
  'ferramenta Read (ela também lê imagens e PDFs) antes de responder sobre eles.'

/** Miniatura que o chat manda junto com um anexo: um data URL de imagem pequeno. */
const THUMBNAIL = /^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+=*$/
const MAX_THUMBNAIL = 100_000

/** Os anexos de uma mensagem, conferidos: caminhos não vazios e miniaturas no formato certo. */
function outgoing(value: unknown): OutgoingAttachment[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item: Record<string, unknown> | null) => {
    const path = item?.path
    if (typeof path !== 'string' || !path) return []
    const thumbnail = item?.thumbnail
    const valid =
      typeof thumbnail === 'string' &&
      thumbnail.length <= MAX_THUMBNAIL &&
      THUMBNAIL.test(thumbnail)
    return [valid ? { path, thumbnail } : { path }]
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
  /** O humor do mascote mudou: o avatar do cabeçalho acompanha. */
  setMood(state: MascotState): void
  /** Abre o painel numa conversa nova (menu da bandeja). */
  newConversation(): void
  /** De que lado do mascote o painel fica (para o mascote olhar para ele). */
  side(): 'left' | 'right'
  /** Mostra o card de permissão e resolve com a decisão do usuário. */
  requestApproval(request: ApprovalRequest): Promise<Approval>
  /** Encerra o processo do Claude Code (o app está fechando). */
  dispose(): void
}

export interface ChatOptions {
  /** Onde está o mascote, para ancorar o painel ao lado dele. */
  anchor: () => Rectangle | null
  /** Liga o servidor `desktop`; sem ele, a conversa roda sem as ferramentas de desktop. */
  mcpConfigPath?: string
  /** Recebe cada evento da conversa (o humor do mascote acompanha a conversa por aqui). */
  onEvent?: (event: ChatEvent) => void
}

/**
 * Painel de chat: uma janela que nasce na primeira vez que é aberta e depois só é escondida,
 * para a conversa continuar lá.
 */
export function setupChat({ anchor, mcpConfigPath, onEvent }: ChatOptions): Chat {
  let win: BrowserWindow | null = null
  // A página ainda não ouve eventos enquanto carrega; até lá eles esperam aqui.
  let pageReady = false
  const queued: ChatEvent[] = []
  let quitting = false
  let mood: MascotState = 'idle'
  // O último uso do plano, para mostrar de novo se a página recarregar.
  let lastUsage: Extract<ChatEvent, { type: 'usage' }> | null = null
  const history = new History()
  // Pedidos de permissão esperando o clique no card, e o que já foi liberado "sempre".
  const approvals = new Map<
    string,
    { scope: string; resolve: (approval: Approval) => void; event: PermissionRequestEvent }
  >()
  const alwaysAllowed = new Set<string>()

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
      model: config.model
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
  ipcMain.handle(IPC.historyList, (event) => (fromChat(event) ? history.list() : []))
  ipcMain.handle(IPC.historyOpen, (event, id: unknown) => {
    if (!fromChat(event) || typeof id !== 'string') return false
    if (id === history.currentId()) return true
    const saved = history.load(id)
    if (!saved) return false
    // A conversa atual fecha (o 'reset' passa pelo histórico e pelos cards) e a guardada volta:
    // primeiro o que o painel mostrava, depois a próxima mensagem retoma o Claude Code.
    session.resume(saved.sessionId)
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
    if (fromChat(event)) win?.hide()
  })
  ipcMain.on(IPC.chatPermission, (event, id: unknown, decision: unknown) => {
    if (!fromChat(event) || typeof id !== 'string') return
    if (decision !== 'allow' && decision !== 'allow-always' && decision !== 'deny') return
    const approval = approvals.get(id)
    // Perguntas se respondem pelo chatAnswer: liberadas sem respostas, o Claude entenderia que o
    // usuário não respondeu.
    if (!approval || approval.event.toolName === QUESTION_TOOL) return
    approvals.delete(id)
    if (decision === 'allow-always') alwaysAllowed.add(approval.scope)
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
    if (appearing && pageReady) chat.webContents.send(IPC.chatShown)
  }

  function createWindow(): BrowserWindow {
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

    chat.once('ready-to-show', () => show(chat))
    // Fechar (Alt+F4, botão do gerenciador de janelas) só esconde; a conversa continua.
    chat.on('close', (event) => {
      if (quitting) return
      event.preventDefault()
      chat.hide()
    })
    chat.on('closed', () => {
      win = null
      pageReady = false
    })
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
      if (alwaysAllowed.has(permissionScope(request))) return Promise.resolve({ allow: true })
      const id = randomUUID()
      return new Promise<Approval>((resolve) => {
        const event: PermissionRequestEvent = {
          type: 'permission-request',
          id,
          toolName: request.toolName,
          input: request.input,
          toolUseId: request.toolUseId
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
      if (win.isVisible() && win.isFocused()) win.hide()
      else show(win)
    },
    setMood(state) {
      mood = state
      if (win && pageReady) win.webContents.send(IPC.chatMood, state)
    },
    newConversation() {
      session.reset()
      if (!win) win = createWindow()
      else show(win)
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
