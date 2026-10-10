import { app, ipcMain, Notification, powerMonitor, screen, shell } from 'electron'
import type { Point } from 'electron'
import { join } from 'path'
import appIcon from '../../resources/icon.png?asset'
import { accessoryFor, msUntilMidnight } from './accessory'
import { isAutostartEnabled, refreshAutostart, setAutostart } from './autostart'
import { cleanOldAttachments } from './attachments'
import { findBrowser, playwrightServer } from './browser'
import { setupChat } from './chat'
import type { Chat } from './chat'
import { CONFIG_PATH, getConfig, loadConfig, onConfigChange } from './config'
import { openInEditor } from './desktop'
import { deployRelay } from './hooks/install'
import { APP_ID, checkCommand, deployLauncher, parseCommand } from './launcher'
import type { WispCommand } from './launcher'
import { startHookServer } from './hooks/server'
import type { HookServer } from './hooks/server'
import {
  getMascotBounds,
  getMascotWindow,
  getVisibleMascotBounds,
  isMascotVisible,
  playMascotSound,
  pulseMascot,
  reactMascot,
  sendMascotCustomSound,
  setMascotAccessory,
  setMascotGaze,
  setMascotView,
  setMascotVisible,
  setupMascot
} from './mascot'
import { startDesktopServer } from './mcp-server'
import type { DesktopServer } from './mcp-server'
import { Media } from './media'
import { MascotMood } from './mood'
import { CACHE_DIR, DATA_DIR } from './paths'
import { describeWhen, Reminders } from './reminders'
import { encodeForModel } from './screenshot'
import { Presence } from './presence'
import { ExternalSessions } from './sessions'
import { setupSessionsIpc } from './sessions-ipc'
import { soundForEvent, Sounds } from './sounds'
import { releaseShortcut, setupShortcut } from './shortcut'
import type { ShortcutStatus } from './shortcut'
import { setupTray } from './tray'
import type { AppMenu } from './tray'
import { XPointer } from './xpointer'
import { IPC } from '../shared/ipc'

// O cache e os dados internos do Chromium ficam fora de ~/.config/wisp, que guarda só o
// config.json. Precisa ser definido antes do app ficar pronto.
app.setPath('userData', join(CACHE_DIR, 'electron'))
// A identidade do app no desktop: o nome do .desktop, a classe das janelas no X11 e o id que os
// portais conferem (o GNOME 50 recusa o atalho global de um id sem .desktop instalado).
app.setDesktopName(APP_ID)

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

// Um Wisp só. Abrir de novo (o comando `wisp`, um atalho, o menu de apps) entrega o pedido da
// linha de comando ao que já está aberto e sai.
const startCommand = parseCommand(process.argv)
if (!app.requestSingleInstanceLock({ command: startCommand })) {
  app.quit()
} else {
  // Pedidos que chegam antes de o app ficar pronto esperam aqui.
  let runCommand: ((command: WispCommand) => void) | null = null
  let waitingCommand: WispCommand | null = startCommand
  app.on('second-instance', (_event, argv, _cwd, data) => {
    const sent = checkCommand((data as { command?: unknown } | null)?.command)
    const command = sent ?? parseCommand(argv) ?? { kind: 'show' }
    if (runCommand) runCommand(command)
    else waitingCommand = command
  })
  app.whenReady().then(async () => {
    await start((run) => {
      runCommand = run
      if (waitingCommand) run(waitingCommand)
      waitingCommand = null
    })
  })
}

/** Sobe o app. `ready` recebe quem executa os pedidos da linha de comando. */
async function start(ready: (run: (command: WispCommand) => void) => void): Promise<void> {
  loadConfig()
  console.log(`[wisp] config: ${CONFIG_PATH}`)
  void cleanOldAttachments()

  // Os players de música (MPRIS): ferramentas do Claude e a dança do mascote. Conecta mais
  // abaixo; até lá, as ferramentas respondem que não há D-Bus.
  let media: Media | null = null
  let music = false

  /** Uma notificação do sistema; `onClick`, quando o desktop repassa o clique. */
  const notify = (title: string, body: string, onClick?: () => void): void => {
    if (!Notification.isSupported()) return
    const notification = new Notification({ title, body, icon: appIcon })
    if (onClick) notification.on('click', onClick)
    notification.show()
  }

  // Os lembretes ficam num arquivo e avisam na hora, mesmo com o app reaberto no meio. A
  // notificação, o som e o sininho do mascote saem juntos; clicar na notificação abre o painel.
  const reminders = new Reminders(join(DATA_DIR, 'lembretes.json'), {
    fire: (reminder, late) => {
      presence.activity()
      reactMascot('remind')
      sounds.play('lembrete')
      const body = late ? `${reminder.text} (era para ${describeWhen(reminder.at)})` : reminder.text
      notify('Lembrete do Wisp', body, () => chat?.open())
    },
    missed: (count) =>
      notify(
        'Lembretes perdidos',
        `E mais ${count} ${count === 1 ? 'lembrete venceu' : 'lembretes venceram'} com o Wisp fechado.`
      )
  })

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
      notify,
      projectRoots: () => getConfig().projectRoots,
      editorCommand: () => getConfig().editorCommand,
      terminalCommand: () => getConfig().terminalCommand,
      reminders,
      media: () => media,
      screenshot: async () => {
        if (!chat) throw new Error('o Wisp ainda está abrindo')
        const shots = await chat.capture()
        return shots.map((shot) => ({ ...encodeForModel(shot.image), label: shot.label }))
      }
    })
  } catch (err) {
    console.warn('[wisp] o servidor MCP não subiu; o chat vai funcionar sem as ferramentas:', err)
  }

  // O mascote acompanha a conversa: falando, trabalhando, pedindo permissão, feliz, erro.
  const mood = new MascotMood({
    state: (state) => {
      setMascotView({ state, look: chat?.side() ?? 'left', music })
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
  // O atalho global (ligado mais abaixo); o menu mostra qual é.
  let shortcut: ShortcutStatus = { via: 'none' }
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
    updateBrowser()
  })

  // O navegador do Claude (opcional): o servidor do Playwright entra no --mcp-config e vale a
  // partir da próxima conversa. Um problema (nenhum Chrome achado) aparece uma vez no chat.
  let browserState = ''
  const updateBrowser = (): void => {
    const { browserAutomation, browserExecutable } = getConfig()
    const found = browserAutomation ? findBrowser(browserExecutable) : null
    const state = !found ? 'off' : 'error' in found ? `error:${found.error}` : `on:${found.path}`
    if (state === browserState) return
    const first = browserState === ''
    browserState = state
    desktop?.setExtraServers(
      found && 'path' in found ? { playwright: playwrightServer(found.path) } : {}
    )
    if (found && 'error' in found) {
      chat?.notice(
        'warning',
        `O navegador do Claude está ligado no config.json, mas ${found.error.charAt(0).toLowerCase()}${found.error.slice(1)}`
      )
    } else if (!first) {
      chat?.notice(
        'info',
        found
          ? 'Navegador do Claude ligado: vale a partir da próxima conversa (Ctrl+K).'
          : 'Navegador do Claude desligado a partir da próxima conversa.'
      )
    }
  }
  updateBrowser()

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
    autostartEnabled: isAutostartEnabled,
    setAutostartEnabled: (enabled) => {
      const problem = setAutostart(enabled, appIcon)
      if (problem) notify('Não mudei o início com o sistema', problem)
    },
    shortcutLabel: () => (shortcut.via === 'none' ? null : (shortcut.label ?? 'ligado')),
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
  void Media.connect().then((connected) => {
    media = connected
    if (!media) return
    const dance = (playing: boolean): void => {
      music = playing
      setMascotView({ state: mood.state, look: chat?.side() ?? 'left', music })
    }
    media.on('playing', dance)
    // Um player que já tocava quando o app abriu.
    dance(media.playing)
  })
  // Os lembretes vencidos com o app fechado saem depois da saudação, com o mascote já na tela.
  const remindersStart = setTimeout(() => reminders.start(), 3000)
  powerMonitor.on('resume', () => reminders.resume())

  // O comando `wisp` e a entrada do menu de apps (fora de um pacote, que traz a dele). A entrada
  // vem antes do atalho: o portal confere o id do app contra ela.
  deployLauncher(
    {
      electron: process.execPath,
      appPath: app.isPackaged ? null : app.getAppPath(),
      icon: appIcon
    },
    !app.isPackaged
  )
  // O atalho global abre e fecha o painel. Trocado no config.json, vale na hora (no Wayland, o
  // desktop pergunta de novo).
  let boundAccelerator: string | null | undefined
  const bindShortcut = async (): Promise<void> => {
    const accelerator = getConfig().shortcut
    if (accelerator === boundAccelerator) return
    boundAccelerator = accelerator
    shortcut = await setupShortcut(accelerator, () => {
      presence.activity()
      chat?.toggle()
    })
    if (shortcut.problem) console.warn(`[wisp] sem atalho global: ${shortcut.problem}.`)
    menu?.refresh()
  }
  void bindShortcut().catch((err: unknown) => console.warn('[wisp] erro no atalho global:', err))
  onConfigChange(() => void bindShortcut().catch(() => {}))
  refreshAutostart(appIcon)

  ready((command) => {
    switch (command.kind) {
      case 'toggle':
        chat?.toggle()
        break
      case 'show':
        chat?.open()
        break
      case 'new':
        chat?.newConversation()
        break
      case 'ask':
        chat?.ask(command.text)
        break
    }
  })

  app.on('before-quit', () => {
    clearTimeout(remindersStart)
    media?.dispose()
    reminders.dispose()
    releaseShortcut()
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
}

app.on('window-all-closed', () => {
  app.quit()
})
