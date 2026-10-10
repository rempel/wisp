import { app, BrowserWindow, ipcMain, nativeTheme, screen, shell } from 'electron'
import type { IpcMainEvent, Rectangle } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import workspaceClaudeMd from '../../resources/workspace/CLAUDE.md?raw'
import { ClaudeSession, SAFE_TOOLS } from './claude'
import { getConfig } from './config'
import type { Approval, ApprovalRequest } from './mcp-server'
import { loadPage, PRELOAD } from './page'
import { DATA_DIR } from './paths'
import { IPC } from '../shared/ipc'
import type { ChatEvent } from '../shared/ipc'

const CHAT_WIDTH = 420
const CHAT_HEIGHT = 600
/** Distância entre o mascote e o painel. */
const GAP = 8
/** Fundo da janela antes de a página pintar; igual ao --bg do chat.css. */
const BACKGROUND = { dark: '#0b1418', light: '#f5fafb' }

const WORKSPACE_DIR = join(DATA_DIR, 'workspace')

const APPEND_SYSTEM_PROMPT =
  'Você está respondendo dentro do Wisp, um painel de chat pequeno no desktop Linux do usuário. ' +
  'Responda em português do Brasil, de forma breve. Quando o usuário anexa arquivos, a mensagem ' +
  'termina com um bloco <anexos> com os caminhos deles: leia-os com a ferramenta Read (ela também ' +
  'lê imagens e PDFs) antes de responder sobre eles.'

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
  /** Mostra o card de permissão e resolve com a decisão do usuário. */
  requestApproval(request: ApprovalRequest): Promise<Approval>
  /** Encerra o processo do Claude Code (o app está fechando). */
  dispose(): void
}

/**
 * Painel de chat: uma janela que nasce na primeira vez que é aberta e depois só é escondida,
 * para a conversa continuar lá. `anchor` diz onde está o mascote; `mcpConfigPath` liga o
 * servidor `desktop` (sem ele, a conversa roda sem as ferramentas de desktop).
 */
export function setupChat(anchor: () => Rectangle | null, mcpConfigPath?: string): Chat {
  let win: BrowserWindow | null = null
  // A página ainda não ouve eventos enquanto carrega; até lá eles esperam aqui.
  let pageReady = false
  const queued: ChatEvent[] = []
  let quitting = false
  // Pedidos de permissão esperando o clique no card, e o que já foi liberado "sempre".
  const approvals = new Map<string, { scope: string; resolve: (approval: Approval) => void }>()
  const alwaysAllowed = new Set<string>()

  const send = (event: ChatEvent): void => {
    if (win && pageReady) win.webContents.send(IPC.chatEvent, event)
    else queued.push(event)
  }

  const deliver = (event: ChatEvent): void => {
    // Turno encerrado (parado, com erro) ou conversa nova: nenhum pedido aberto vai ser usado.
    if (event.type === 'turn-end' || event.type === 'reset') cancelApprovals()
    if (event.type === 'reset') alwaysAllowed.clear()
    send(event)
  }

  function cancelApprovals(): void {
    for (const [id, approval] of approvals) {
      approval.resolve({ allow: false, message: 'O usuário parou a resposta.' })
      send({ type: 'permission-resolved', id, decision: 'cancelled' })
    }
    approvals.clear()
  }

  const config = getConfig()
  const session = new ClaudeSession(
    {
      claudePath: config.claudePath,
      workspace: prepareWorkspace,
      allowedTools: [...SAFE_TOOLS, ...config.extraAllowedTools],
      appendSystemPrompt: APPEND_SYSTEM_PROMPT,
      mcpConfigPath
    },
    deliver
  )

  const fromChat = (event: IpcMainEvent): boolean =>
    win !== null && event.sender === win.webContents

  ipcMain.on(IPC.chatReady, (event) => {
    if (!fromChat(event) || !win) return
    pageReady = true
    for (const waiting of queued.splice(0)) win.webContents.send(IPC.chatEvent, waiting)
  })
  ipcMain.on(IPC.chatSend, (event, text: unknown, attachments: unknown) => {
    if (!fromChat(event) || typeof text !== 'string') return
    const paths = Array.isArray(attachments)
      ? attachments.filter((path): path is string => typeof path === 'string' && path !== '')
      : []
    if (text.trim() || paths.length) void session.send(text, paths)
  })
  ipcMain.on(IPC.chatStop, (event) => {
    if (fromChat(event)) void session.stop()
  })
  ipcMain.on(IPC.chatNew, (event) => {
    if (fromChat(event)) void session.reset()
  })
  ipcMain.on(IPC.chatHide, (event) => {
    if (fromChat(event)) win?.hide()
  })
  ipcMain.on(IPC.chatPermission, (event, id: unknown, decision: unknown) => {
    if (!fromChat(event) || typeof id !== 'string') return
    if (decision !== 'allow' && decision !== 'allow-always' && decision !== 'deny') return
    const approval = approvals.get(id)
    if (!approval) return
    approvals.delete(id)
    if (decision === 'allow-always') alwaysAllowed.add(approval.scope)
    approval.resolve(
      decision === 'deny' ? { allow: false, message: 'Usuário negou' } : { allow: true }
    )
    send({ type: 'permission-resolved', id, decision })
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
    if (!chat.isVisible()) placeNextToMascot(chat)
    chat.show()
    chat.focus()
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
    // Já avisa no chat se o Claude Code não estiver instalado ou logado.
    void session.preflight()
    return chat
  }

  return {
    requestApproval(request) {
      if (alwaysAllowed.has(permissionScope(request))) return Promise.resolve({ allow: true })
      const id = randomUUID()
      return new Promise<Approval>((resolve) => {
        approvals.set(id, { scope: permissionScope(request), resolve })
        send({
          type: 'permission-request',
          id,
          toolName: request.toolName,
          input: request.input,
          toolUseId: request.toolUseId
        })
        // O Claude fica parado esperando: com o painel escondido, ele aparece, sem roubar o foco.
        if (win && !win.isVisible()) {
          placeNextToMascot(win)
          win.showInactive()
        }
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
    dispose() {
      session.dispose()
    }
  }
}
