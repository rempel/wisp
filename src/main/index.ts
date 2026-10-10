import { app, ipcMain, Notification, screen, shell } from 'electron'
import type { Point } from 'electron'
import { join } from 'path'
import appIcon from '../../resources/icon.png?asset'
import { accessoryFor, msUntilMidnight } from './accessory'
import { cleanOldAttachments } from './attachments'
import { setupChat } from './chat'
import type { Chat } from './chat'
import { CONFIG_PATH, getConfig, loadConfig, onConfigChange } from './config'
import { openInEditor } from './desktop'
import { deployRelay } from './hooks/install'
import { startHookServer } from './hooks/server'
import type { HookServer } from './hooks/server'
import {
  getMascotBounds,
  getMascotWindow,
  getVisibleMascotBounds,
  isMascotVisible,
  playMascotSound,
  pulseMascot,
  sendMascotCustomSound,
  setMascotAccessory,
  setMascotGaze,
  setMascotView,
  setMascotVisible,
  setupMascot
} from './mascot'
import { startDesktopServer } from './mcp-server'
import type { DesktopServer } from './mcp-server'
import { MascotMood } from './mood'
import { CACHE_DIR } from './paths'
import { Presence } from './presence'
import { ExternalSessions } from './sessions'
import { setupSessionsIpc } from './sessions-ipc'
import { soundForEvent, Sounds } from './sounds'
import { setupTray } from './tray'
import type { AppMenu } from './tray'
import { XPointer } from './xpointer'
import { IPC } from '../shared/ipc'

// O cache e os dados internos do Chromium ficam fora de ~/.config/wisp, que guarda só o
// config.json. Precisa ser definido antes do app ficar pronto.
app.setPath('userData', join(CACHE_DIR, 'electron'))

if (
  process.platform === 'linux' &&
  process.env.XDG_SESSION_TYPE === 'wayland' &&
  app.commandLine.getSwitchValue('ozone-platform') !== 'x11'
) {
  console.warn(
    '[wisp] Rodando como app Wayland nativo: o mascote não consegue se posicionar nem ficar ' +
      'sempre no topo. Inicie com --ozone-platform=x11 (o `npm run dev` já faz isso).'
  )
}

// Uma promessa rejeitada sem tratamento não deve derrubar o app; fica registrada no terminal.
process.on('unhandledRejection', (reason) => {
  console.error('[wisp] erro não tratado:', reason)
})

app.whenReady().then(async () => {
  loadConfig()
  console.log(`[wisp] config: ${CONFIG_PATH}`)
  void cleanOldAttachments()

  // O servidor MCP precisa do chat para os pedidos de permissão, e o chat precisa do arquivo de
  // configuração do servidor; os pedidos só chegam depois que os dois existem.
  let chat: Chat | null = null
  let desktop: DesktopServer | null = null
  try {
    desktop = await startDesktopServer({
      requestApproval: (request) =>
        chat
          ? chat.requestApproval(request)
          : Promise.resolve({ allow: false, message: 'O Wisp ainda está abrindo.' }),
      notify: (title, body) => {
        if (Notification.isSupported()) new Notification({ title, body, icon: appIcon }).show()
      },
      projectRoots: () => getConfig().projectRoots,
      editorCommand: () => getConfig().editorCommand
    })
  } catch (err) {
    console.warn('[wisp] o servidor MCP não subiu; o chat vai funcionar sem as ferramentas:', err)
  }

  // O mascote acompanha a conversa: falando, trabalhando, pedindo permissão, feliz, erro.
  const mood = new MascotMood({
    state: (state) => {
      setMascotView({ state, look: chat?.side() ?? 'left' })
      chat?.setMood(state)
    },
    pulse: pulseMascot
  })
  // Os olhos seguem o cursor, e o mascote cochila quando nada acontece e o cursor está longe. O
  // cursor vem direto do servidor X (xpointer.ts): o do Electron fica parado enquanto ele está
  // fora das janelas do Wisp.
  let xpointer: XPointer | null = null
  void XPointer.open().then((opened) => {
    xpointer = opened
  })
  const cursor = async (): Promise<Point> => {
    const point = xpointer?.alive ? await xpointer.query() : null
    if (!point) return screen.getCursorScreenPoint()
    const scale = screen.getPrimaryDisplay().scaleFactor
    return { x: Math.round(point.x / scale), y: Math.round(point.y / scale) }
  }
  const presence = new Presence({
    bounds: getVisibleMascotBounds,
    cursor,
    gaze: setMascotGaze,
    sleep: (asleep) => mood.setAsleep(asleep),
    canSleep: () => mood.quiet,
    sleepAfter: () => getConfig().sleepAfterMinutes * 60_000
  })
  // Os sons tocam na página do mascote; quem decide se tocam é o main.
  let menu: AppMenu | null = null
  const sounds = new Sounds({
    play: playMascotSound,
    custom: sendMascotCustomSound,
    changed: (settings) => {
      chat?.notifySound(settings)
      menu?.refresh()
    }
  })
  ipcMain.handle(IPC.soundGet, (event) => (chat?.isSender(event.sender) ? sounds.check() : null))
  ipcMain.on(IPC.soundSet, (event, enabled: unknown) => {
    if (chat?.isSender(event.sender) && typeof enabled === 'boolean') sounds.setEnabled(enabled)
  })

  chat = setupChat({
    anchor: getMascotBounds,
    mcpConfigPath: desktop?.configPath,
    onEvent: (event) => {
      presence.activity()
      mood.onEvent(event)
      const sound = soundForEvent(event)
      if (sound) sounds.play(sound)
    },
    onPanel: (change) => {
      presence.activity()
      sounds.play(change === 'open' ? 'abrir' : 'fechar')
      updateAccessory()
    },
    onActivity: () => presence.activity()
  })

  // Gorro no Natal, óculos no verão (o país do idioma do sistema diz o hemisfério).
  const updateAccessory = (): void => {
    setMascotAccessory(accessoryFor(new Date(), app.getLocaleCountryCode(), getConfig().accessory))
  }
  let midnight: NodeJS.Timeout | null = null
  const atMidnight = (): void => {
    updateAccessory()
    midnight = setTimeout(atMidnight, msUntilMidnight())
  }
  atMidnight()
  onConfigChange(() => {
    updateAccessory()
    sounds.check()
  })

  // As sessões do Claude Code no terminal, pelos hooks (aba Sessões). O relay é reescrito a cada
  // abertura, para acompanhar o lugar do app.
  deployRelay()
  const sessions = new ExternalSessions({
    onChange: () => {
      mood.setExternalRequests(sessions.pendingCount())
      chat?.notifySessions()
    },
    onAttention: (kind) => {
      presence.activity()
      if (kind === 'request') {
        chat?.showSessions()
        sounds.play('pedido')
      } else {
        mood.flashExternal(kind === 'done' ? 'happy' : 'error')
        sounds.play(kind === 'done' ? 'pronto' : 'erro')
      }
    }
  })
  let hooks: HookServer | null = null
  let listening: { ok: boolean; problem?: string } = { ok: false, problem: 'abrindo…' }
  void startHookServer((event, pending) => sessions.handle(event, pending)).then((started) => {
    if (started.ok) {
      hooks = started.server
      listening = { ok: true }
    } else {
      listening = { ok: false, problem: started.problem }
      console.warn('[wisp] não vou ouvir as sessões do Claude Code:', started.problem)
    }
    chat?.notifySessions()
  })
  setupSessionsIpc({
    sessions,
    isChat: (sender) => chat?.isSender(sender) ?? false,
    listening: () => listening,
    changed: () => chat?.notifySessions(),
    openFolder: (cwd) => void openInEditor(cwd, getConfig().editorCommand),
    continueInChat: (id) => {
      const session = sessions.get(id)
      if (!session || !chat) return
      chat.continueSession({
        sessionId: session.id,
        cwd: session.cwd,
        project: session.project,
        alive: session.alive,
        prompt: session.prompt,
        lastMessage: session.lastMessage
      })
    }
  })
  menu = setupTray({
    mascotVisible: isMascotVisible,
    setMascotVisible,
    newConversation: () => chat?.newConversation(),
    soundEnabled: () => sounds.settings().enabled,
    setSoundEnabled: (enabled) => sounds.setEnabled(enabled),
    openConfig: () => {
      // Abre no app padrão para .json; sem um, mostra o arquivo na pasta.
      void shell.openPath(CONFIG_PATH).then((error) => {
        if (error) shell.showItemInFolder(CONFIG_PATH)
      })
    },
    quit: () => app.quit()
  })
  setupMascot({
    click: () => {
      presence.activity()
      chat?.toggle()
    },
    hover: (inside) => presence.setHover(inside),
    activity: () => presence.activity(),
    drop: (dropped) => {
      presence.activity()
      chat?.attach(dropped)
    },
    menu: () => {
      const win = getMascotWindow()
      if (win) menu?.popup(win)
    },
    sound: (name) => sounds.play(name),
    ready: () => sounds.resend(),
    moved: () => presence.start()
  })
  sounds.watch()

  app.on('before-quit', () => {
    if (midnight) clearTimeout(midnight)
    presence.dispose()
    xpointer?.close()
    sounds.dispose()
    mood.dispose()
    sessions.dispose()
    hooks?.close()
    chat?.dispose()
    desktop?.close()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
