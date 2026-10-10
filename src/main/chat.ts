import { app, BrowserWindow, ipcMain, nativeTheme, screen, shell } from 'electron'
import type { IpcMainEvent, Rectangle } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import workspaceClaudeMd from '../../resources/workspace/CLAUDE.md?raw'
import { ClaudeSession, SAFE_TOOLS } from './claude'
import { getConfig } from './config'
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
  'Responda em português do Brasil, de forma breve.'

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

export interface Chat {
  /** Mostra o painel ao lado do mascote, traz para a frente ou esconde. */
  toggle(): void
  /** Encerra o processo do Claude Code (o app está fechando). */
  dispose(): void
}

/**
 * Painel de chat: uma janela que nasce na primeira vez que é aberta e depois só é escondida,
 * para a conversa continuar lá. `anchor` diz onde está o mascote.
 */
export function setupChat(anchor: () => Rectangle | null): Chat {
  let win: BrowserWindow | null = null
  // A página ainda não ouve eventos enquanto carrega; até lá eles esperam aqui.
  let pageReady = false
  const pending: ChatEvent[] = []
  let quitting = false

  const deliver = (event: ChatEvent): void => {
    if (win && pageReady) win.webContents.send(IPC.chatEvent, event)
    else pending.push(event)
  }

  const config = getConfig()
  const session = new ClaudeSession(
    {
      claudePath: config.claudePath,
      workspace: prepareWorkspace,
      allowedTools: [...SAFE_TOOLS, ...config.extraAllowedTools],
      appendSystemPrompt: APPEND_SYSTEM_PROMPT
    },
    deliver
  )

  const fromChat = (event: IpcMainEvent): boolean =>
    win !== null && event.sender === win.webContents

  ipcMain.on(IPC.chatReady, (event) => {
    if (!fromChat(event) || !win) return
    pageReady = true
    for (const queued of pending.splice(0)) win.webContents.send(IPC.chatEvent, queued)
  })
  ipcMain.on(IPC.chatSend, (event, text: unknown) => {
    if (fromChat(event) && typeof text === 'string' && text.trim()) void session.send(text)
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
