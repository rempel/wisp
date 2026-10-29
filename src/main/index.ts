// O idioma antes de tudo: os textos guardados em constantes já saem nele (Fase 25).
import './locale-init'
import { app, ipcMain, nativeTheme, powerMonitor, screen, session, shell } from 'electron'
import type { Point } from 'electron'
import { basename, join } from 'path'
import appIcon from '../../resources/icon.png?asset'
import { accessoryFor, msUntilMidnight } from './accessory'
import { setupAgenda } from './agenda-alerts'
import { isAutostartEnabled, refreshAutostart, setAutostart } from './autostart'
import { cleanOldAttachments } from './attachments'
import { runClaudeCli } from './claude-cli'
import { findBrowser, playwrightServer } from './browser'
import { setupChat } from './chat'
import type { Chat } from './chat'
import {
  CONFIG_PATH,
  getConfig,
  loadConfig,
  notifyConfigChange,
  onConfigChange,
  updateConfig
} from './config'
import { openInEditor } from './desktop'
import { setupGithub } from './github-alerts'
import { deployRelay } from './hooks/install'
import {
  APP_ID,
  checkCommand,
  deployLauncher,
  desktopIcon,
  installKind,
  launchTarget,
  parseCommand
} from './launcher'
import type { WispCommand } from './launcher'
import { installLog } from './log'
import { startHookServer } from './hooks/server'
import type { HookServer } from './hooks/server'
import {
  actMascot,
  getMascotBounds,
  getMascotWindow,
  getVisibleMascotBounds,
  islandMessage,
  isMascotVisible,
  playMascotSound,
  pulseMascot,
  reactMascot,
  sendMascotCustomSound,
  setMascotAccessory,
  setMascotAvatar,
  setMascotDanceStyle,
  setMascotMotion,
  setMascotGaze,
  setMascotView,
  setMascotVisible,
  setMascotVoice,
  sendVoiceCommand,
  setCompact,
  setupMascot
} from './mascot'
import { startDesktopServer } from './mcp-server'
import { DANCE_MS, FEEL_MS, holdMs, isDance, isEmotion } from '../shared/emotions'
import type { DesktopServer } from './mcp-server'
import { Media } from './media'
import { setupMcpIpc } from './mcp-ipc'
import { wispServers } from './mcp-servers'
import { MascotMood } from './mood'
import { setupNotifications } from './notify'
import type { Signals } from './notify'
import { setupOpenRouterIpc } from './openrouter-ipc'
import { CACHE_DIR, DATA_DIR } from './paths'
import { setupPortableIpc } from './portable-ipc'
import { synthesize } from './piper'
import { describeWhen, Reminders } from './reminders'
import { encodeForModel } from './screenshot'
import { ScreenLock } from './screenlock'
import { AwayTracker } from './away'
import { TaskScheduler } from './scheduler'
import type { ScheduledTask } from '../shared/prompts'
import { setupPhone } from './phone-ipc'
import { setupDiagnostics } from './diagnostics-ipc'
import { releaseKey, SelfUpdater, updateTarget } from './self-update'
import { UpdateChecker } from './updates'
import type { Phone } from './phone-ipc'
import { Presence } from './presence'
import { ExternalSessions } from './sessions'
import { setupSessionsIpc } from './sessions-ipc'
import { setupSettings } from './settings-ipc'
import { setupSkillsIpc } from './skills-ipc'
import { soundForEvent, Sounds } from './sounds'
import { releaseShortcuts, setupShortcuts } from './shortcut'
import type { ShortcutStatus } from './shortcut'
import { setupTray } from './tray'
import type { AppMenu } from './tray'
import { Voice } from './voice'
import { voiceQuick } from './voice-quick'
import { setupWeekly } from './weekly'
import { transcribe, whisperSetup } from './whisper'
import { XPointer } from './xpointer'
import { IPC } from '../shared/ipc'
import type { TaskResult, VoiceTestResult } from '../shared/ipc'
import { pcmStats } from '../shared/vad'
import { t } from '../shared/i18n'
import { setSelfCommand } from './claude-settings'
import { IS_LINUX, IS_WINDOWS } from './platform'

// O cache e os dados internos do Chromium ficam fora de ~/.config/wisp, que guarda só o
// config.json. Precisa ser definido antes do app ficar pronto.
app.setPath('userData', join(CACHE_DIR, 'electron'))
// A identidade do app no desktop: o nome do .desktop, a classe das janelas no X11 e o id que os
// portais conferem (o GNOME 50 recusa o atalho global de um id sem .desktop instalado).
if (IS_LINUX) app.setDesktopName(APP_ID)

const kind = installKind(app.isPackaged)
/** Numa sessão Wayland sem --ozone-platform=x11, o Wisp seria um app Wayland nativo. */
const waylandNative =
  process.platform === 'linux' &&
  process.env.XDG_SESSION_TYPE === 'wayland' &&
  app.commandLine.getSwitchValue('ozone-platform') !== 'x11'
/** Marca da reabertura com o X11, contra um laço se a opção não pegar. */
const RELAUNCH_ENV = 'WISP_X11_RELAUNCH'
if (waylandNative && (kind === 'dev' || process.env[RELAUNCH_ENV])) {
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
} else if (waylandNative && kind !== 'dev' && !process.env[RELAUNCH_ENV]) {
  // Empacotado, o Wisp precisa do XWayland para ficar no topo e se posicionar. Aberto sem a opção
  // (pelo /usr/bin/wisp, por um clique no AppImage), ele se abre de novo com ela. No AppImage, pelo
  // próprio arquivo: a montagem deste processo some quando ele sai.
  process.env[RELAUNCH_ENV] = '1'
  app.relaunch({
    execPath: launchTarget(kind),
    args: [...process.argv.slice(1), '--ozone-platform=x11']
  })
  app.exit(0)
} else {
  // O que vai para o terminal também fica em ~/.local/state/wisp/wisp.log (limpo e com limite).
  installLog(
    `Wisp ${app.getVersion()} (${kind}), Electron ${process.versions.electron}, ` +
      `sessão ${process.env.XDG_SESSION_TYPE || 'desconhecida'}`
  )
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
  // O ícone dos .desktop que o Wisp escreve (menu de apps, início com o sistema).
  const entryIcon = desktopIcon(kind, appIcon)
  loadConfig()
  console.log(`[wisp] config: ${CONFIG_PATH}`)
  // Os hooks do Windows rodam o próprio Wisp (forma exec): o Wisp.exe, ou o Electron com o app.
  setSelfCommand(process.execPath, app.isPackaged ? [] : [app.getAppPath()])
  void cleanOldAttachments()
  guardPermissions()

  // Os players de música (MPRIS): ferramentas do Claude e a dança do mascote. Conecta mais
  // abaixo; até lá, as ferramentas respondem que não há D-Bus.
  let media: Media | null = null
  let music = false

  // O servidor MCP precisa do chat para os pedidos de permissão, e o chat precisa do arquivo de
  // configuração do servidor; os pedidos só chegam depois que os dois existem.
  let chat: Chat | null = null
  let phone: Phone | null = null

  // As notificações do sistema e os cards que viram notificação (notify.ts).
  const { notify, approvals: desktopApprovals, dnd, quiet } = setupNotifications(() => chat)
  /** Como os avisos chegam até você: o mascote e os sons vêm mais abaixo. */
  const signals: Signals = {
    notify,
    activity: () => presence.activity(),
    flash: (state) => mood.flashExternal(state),
    sound: (name) => sounds.play(name)
  }

  // O registro da semana (só contagens e nomes, nada do conteúdo), para o resumo de segunda.
  const weekly = setupWeekly(notify, () => chat)
  const { activity } = weekly

  // Os lembretes ficam num arquivo e avisam na hora, mesmo com o app reaberto no meio. A
  // notificação, o som e o sininho do mascote saem juntos; clicar na notificação abre o painel.
  const reminders = new Reminders(join(DATA_DIR, 'lembretes.json'), {
    fire: (reminder, late) => {
      presence.activity()
      activity.record({ k: 'lembrete' })
      islandMessage(t('Lembrete'), reminder.text, 6000)
      reactMascot('remind')
      sounds.play('lembrete')
      const body = late
        ? t('{text} (era para {v2})', { text: reminder.text, v2: describeWhen(reminder.at) })
        : reminder.text
      notify(t('Lembrete do Wisp'), body, () => chat?.open())
    },
    missed: (count) =>
      notify(
        t('Lembretes perdidos'),
        t('E mais {count} {v2} com o Wisp fechado.', {
          count,
          v2: count === 1 ? t('lembrete venceu') : t('lembretes venceram')
        })
      )
  })

  // Enquanto você estava fora (Fase 24): o que aconteceu com a tela bloqueada, ao desbloquear.
  const away = new AwayTracker()
  // Os alertas do GitHub e a agenda (opcionais).
  const github = setupGithub(signals, () => chat)
  const calendar = setupAgenda(signals, () => chat)

  let desktop: DesktopServer | null = null
  try {
    desktop = await startDesktopServer({
      requestApproval: (request) =>
        chat
          ? chat.requestApproval(request)
          : Promise.resolve({ allow: false, message: t('O Wisp ainda está abrindo.') }),
      notify,
      projectRoots: () => getConfig().projectRoots,
      editorCommand: () => getConfig().editorCommand,
      terminalCommand: () => getConfig().terminalCommand,
      reminders,
      github: github.describe,
      weekly: weekly.describe,
      agenda: calendar.describe,
      media: () => media,
      express: ({ emotion, dance, seconds }) => {
        presence.activity()
        if (emotion) actMascot({ kind: 'feel', emotion, ms: holdMs(seconds, FEEL_MS) })
        if (dance) actMascot({ kind: 'dance', dance, ms: holdMs(seconds, DANCE_MS) })
      },
      screenshot: async () => {
        if (!chat) throw new Error(t('o Wisp ainda está abrindo'))
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
    canSleep: () => mood.quiet && voice?.current.state === 'idle',
    sleepAfter: () => getConfig().sleepAfterMinutes * 60_000
  })
  // Os sons tocam na página do mascote; quem decide se tocam é o main.
  let menu: AppMenu | null = null
  // Os atalhos globais (ligados mais abaixo); o menu mostra quais são.
  let shortcuts = new Map<string, ShortcutStatus>()
  const shortcutLabel = (id: string): string | null => {
    const status = shortcuts.get(id)
    return !status || status.via === 'none' ? null : (status.label ?? 'ligado')
  }
  // A voz (criada mais abaixo, com o chat).
  let voice: Voice | null = null
  const sounds = new Sounds({
    play: playMascotSound,
    muted: quiet,
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
    mcpConfig: desktop ? (conversation) => desktop!.configFor(conversation) : undefined,
    releaseMcpConfig: (conversation) => desktop?.releaseConfig(conversation),
    sessionTitle: (id) => sessions.get(id)?.project ?? null,
    onEvent: (event, conversation) => {
      presence.activity()
      activity.onChatEvent(event, conversation)
      mood.onEvent(event, conversation)
      voice?.onChatEvent(event, conversation)
      phone?.onChatEvent(event)
      if (event.type === 'permission-request') {
        desktopApprovals.request(event.id, event.toolName, event.input)
      } else if (event.type === 'permission-resolved') desktopApprovals.resolved(event.id)
      away.onEvent(event, conversation, chat?.conversationTitle(conversation) ?? '')
      const sound = soundForEvent(event)
      if (sound) sounds.play(sound)
    },
    onClose: (conversation) => mood.forget(conversation),
    onPanel: (change) => {
      presence.activity()
      sounds.play(change === 'open' ? 'abrir' : 'fechar')
      updateAccessory()
    },
    onAttention: (attended) => {
      if (attended) desktopApprovals.panelShown()
      else desktopApprovals.panelHidden()
    },
    onActivity: () => presence.activity()
  })

  // A voz: o botão do microfone do painel e o atalho de voz. Escuta só quando pedida, e nunca com
  // a tela bloqueada.
  // O 'change' chega também com o estado inicial (uma tela que já estava bloqueada).
  const screenLock = ScreenLock.watch()
  screenLock.on('change', (locked: boolean) => {
    voice?.setLocked(locked)
    phone?.approvals.setLocked(locked)
    if (locked) return away.lock()
    const summary = away.unlock(chat?.pendingApprovals() ?? 0)
    if (summary) notify(summary.title, summary.body, () => chat?.open())
  })
  const whisperOptions = (): { binary: string; model: string; language: string } => {
    const config = getConfig()
    return {
      binary: config.whisperPath,
      model: config.whisperModel,
      language: config.voiceLanguage
    }
  }
  const quick = voiceQuick({
    chat: () => chat,
    media: () => media,
    notify,
    happy: () => mood.flashExternal('happy')
  })
  voice = new Voice({
    command: sendVoiceCommand,
    status: (status) => {
      setMascotVoice(status)
      chat?.voiceStatus(status)
    },
    level: (level) => chat?.voiceLevel(level),
    check: () => void whisperSetup(whisperOptions()),
    transcribe: async (pcm) => {
      // No registro, como foi (nunca o que foi dito): quanto áudio, quão alto e quanto demorou.
      const { seconds, peakDb } = pcmStats(pcm)
      const started = Date.now()
      const text = await transcribe(pcm, whisperOptions())
      console.log(
        `[wisp] voz: ${seconds.toFixed(1)} s de áudio, pico de ${peakDb} dB, transcrito em ` +
          `${((Date.now() - started) / 1000).toFixed(1)} s (${text.length} caracteres)`
      )
      return text
    },
    locked: () => screenLock.locked,
    pendingApprovals: () => chat?.pendingApprovals() ?? 0,
    denyApprovals: () => chat?.denyApprovals(),
    quickCommands: () => getConfig().quickCommands,
    runQuick: quick.run,
    deliver: (text, source) => {
      if (!chat) return null
      // Pelo botão do painel (ou com voiceReview), o texto fica na caixa para revisar.
      if (source === 'panel' || getConfig().voiceReview) {
        chat.compose(text)
        return null
      }
      return chat.ask(text, { voice: true })
    },
    notice: quick.notice,
    activity: () => presence.activity(),
    replies: () => getConfig().voiceReplies,
    synthesize: (text) =>
      synthesize(text, { binary: getConfig().piperPath, model: getConfig().piperModel })
  })
  // A galeria das configurações (Fase 27): mostra uma emoção ou uma dança no mascote.
  ipcMain.on(IPC.mascotPreview, (event, preview: unknown) => {
    if (!chat?.isSender(event.sender)) return
    const value = (preview ?? {}) as { emotion?: unknown; dance?: unknown }
    presence.activity()
    if (isEmotion(value.emotion)) {
      actMascot({ kind: 'feel', emotion: value.emotion, ms: FEEL_MS })
    } else if (isDance(value.dance)) {
      actMascot({ kind: 'dance', dance: value.dance, ms: DANCE_MS })
    }
  })
  ipcMain.on(IPC.voiceToggle, (event) => {
    if (chat?.isSender(event.sender)) voice?.togglePanel()
  })
  ipcMain.on(IPC.voiceCancel, (event) => {
    if (chat?.isSender(event.sender)) voice?.cancel()
  })
  ipcMain.handle(IPC.voiceTest, async (event): Promise<VoiceTestResult | null> => {
    if (!chat?.isSender(event.sender) || !voice) return null
    return voice.test()
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
  // A aparência (Fase 22): o tema vale para todas as janelas, pelo nativeTheme.
  const applyAppearance = (): void => {
    const config = getConfig()
    setMascotAvatar(config.avatar)
    setMascotDanceStyle(config.dance)
    setMascotMotion(config.reduceMotion)
    nativeTheme.themeSource = config.theme
  }
  applyAppearance()
  onConfigChange(() => {
    updateAccessory()
    applyAppearance()
    sounds.check()
    updateBrowser()
    setCompact(getConfig().compact)
    github.update()
    calendar.update()
  })

  // Os servidores MCP extras de cada conversa nova: os seus que você ligou (Fase 30), lidos do
  // ~/.claude.json a cada conversa, e o navegador do Claude.
  let browserServers: Record<string, unknown> = {}
  desktop?.setExtraServers(() => ({
    ...wispServers(getConfig().enabledMcpServers),
    ...browserServers
  }))
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
    browserServers = found && 'path' in found ? { playwright: playwrightServer(found.path) } : {}
    if (found && 'error' in found) {
      chat?.notice(
        'warning',
        t('O navegador do Claude está ligado no config.json, mas {v1}{v2}', {
          v1: found.error.charAt(0).toLowerCase(),
          v2: found.error.slice(1)
        })
      )
    } else if (!first) {
      chat?.notice(
        'info',
        found
          ? t('Navegador do Claude ligado: vale a partir da próxima conversa (Ctrl+K).')
          : t('Navegador do Claude desligado a partir da próxima conversa.')
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
  let listening: { ok: boolean; problem?: string } = IS_WINDOWS
    ? { ok: false, problem: t('no Windows, as sessões do terminal chegam numa próxima versão') }
    : { ok: false, problem: 'abrindo…' }
  // No Windows (Fase 33), sem o socket dos hooks por enquanto (o named pipe vem na Fase 35).
  if (!IS_WINDOWS)
    void startHookServer((event, pending) => {
      // Uma mensagem no Claude Code do terminal conta no resumo da semana, com a pasta do projeto.
      if (event.event === 'UserPromptSubmit' && typeof event.input.cwd === 'string') {
        activity.record({
          k: 'terminal',
          projeto: basename(event.input.cwd).slice(0, 100) || 'terminal'
        })
      }
      // O modo terminal de uma aba (a ficha dela vem no evento): vai para a aba, não para Sessões.
      if (event.tab) {
        if (!chat?.terminalEvent(event, pending)) pending?.reply({ decision: null })
        return
      }
      sessions.handle(event, pending)
    }).then((started) => {
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
  // As tarefas agendadas (Fase 26): cada uma numa aba nova, no modo Pedir; o card dela espera você
  // (ou vai para o celular e para a notificação, como qualquer card).
  const runTask = (task: ScheduledTask, late: boolean): TaskResult => {
    const result: TaskResult = chat
      ? chat.runTask(task)
      : { ok: false, message: t('O Wisp ainda está abrindo.') }
    if (result.ok) {
      notify(
        late
          ? t('Tarefa agendada (atrasada): {name}', { name: task.name })
          : t('Tarefa agendada: {name}', { name: task.name }),
        t('Começou numa aba nova, no modo Pedir. O que precisar do seu clique espera no painel.'),
        () => chat?.open()
      )
    } else {
      notify(t('A tarefa “{name}” não rodou', { name: task.name }), result.message)
    }
    return result
  }
  const scheduler = new TaskScheduler({
    tasks: () => getConfig().scheduledTasks,
    run: (task, late) => void runTask(task, late),
    file: join(DATA_DIR, 'tarefas.json')
  })
  onConfigChange(() => scheduler.refresh())
  // A OpenRouter e as skills nas configurações.
  const openrouter = setupOpenRouterIpc({
    isSender: (sender) => chat?.isSender(sender) ?? false,
    keyChanged: () => chat?.openrouterKeyChanged(),
    refresh: () => settings.notify()
  })
  setupSkillsIpc((sender) => chat?.isSender(sender) ?? false)
  setupMcpIpc({
    isSender: (sender) => chat?.isSender(sender) ?? false,
    run: (args) => runClaudeCli(getConfig().claudePath, args)
  })
  setupPortableIpc({
    isSender: (sender) => chat?.isSender(sender) ?? false,
    version: app.getVersion()
  })
  // A tela de configurações do painel (e a pílula do modo demonstração).
  const settings = setupSettings({
    isSender: (sender) => chat?.isSender(sender) ?? false,
    // No Flatpak, pelo comando de dentro dele (o zypak); no AppImage, pelo arquivo .AppImage.
    relaunch: () => {
      app.relaunch({
        execPath: kind === 'flatpak' ? '/app/bin/wisp' : launchTarget(kind),
        args: process.argv.slice(1).filter((arg) => !parseCommand([arg]))
      })
      app.quit()
    },
    send: (snapshot) => chat?.notifySettings(snapshot),
    autostart: {
      get: isAutostartEnabled,
      set: (enabled) => setAutostart(enabled, entryIcon)
    },
    onChange: () => menu?.refresh(),
    openrouterKey: () => openrouter.hasKey(),
    phone: () => phone!.status(),
    taskRuns: () => scheduler.runs(),
    dnd: () => dnd.state().active,
    runTask: async (id) => {
      const task = getConfig().scheduledTasks.find((item) => item.id === id)
      if (!task) return { ok: false, message: t('Essa tarefa não existe mais.') }
      let result: TaskResult = { ok: true }
      scheduler.runNow(id, (ran) => (result = runTask(ran, false)))
      return result
    }
  })
  // O "não perturbe" do desktop mudou: a tela de configurações mostra (Fase 32).
  dnd.onChange(() => {
    settings.notify()
    menu?.refresh()
  })
  // Atualizar com um clique (Fase 31): só o AppImage, e só com a chave que confere a assinatura.
  const updateFile = updateTarget(kind, app.isPackaged)
  const publicKey = releaseKey(app.isPackaged)
  const downloadBase = app.isPackaged ? '' : (process.env.WISP_TEST_DOWNLOAD_BASE ?? '')
  const selfUpdate =
    updateFile && publicKey
      ? new SelfUpdater({
          target: updateFile,
          publicKey,
          rewrite: downloadBase
            ? (url) => url.replace(/^https:\/\/github\.com/, downloadBase)
            : undefined,
          relaunch: (target) => {
            app.relaunch({
              execPath: target,
              args: process.argv.slice(1).filter((arg) => !parseCommand([arg]))
            })
            app.quit()
          }
        })
      : null
  // O aviso de versão nova (Fase 20), desligado por padrão: uma conferência por dia no GitHub.
  const updates = new UpdateChecker({
    current: app.getVersion(),
    enabled: () => getConfig().updateCheck,
    stateFile: join(DATA_DIR, 'versao.json'),
    notify: (release) =>
      selfUpdate
        ? notify(
            t('Wisp {version} disponível', { version: release.version }),
            t('Clique para atualizar: o Wisp baixa, confere a assinatura e troca o AppImage.'),
            () => chat?.showView('diagnostics')
          )
        : notify(
            t('Wisp {version} disponível', { version: release.version }),
            t('Clique para ver o que mudou e baixar. As configurações e as conversas continuam.'),
            () => void shell.openExternal(release.url)
          )
  })
  updates.schedule()
  onConfigChange(() => updates.schedule())
  // O diagnóstico e os primeiros passos (Fase 20).
  const diagnostics = setupDiagnostics({
    isSender: (sender) => chat?.isSender(sender) ?? false,
    version: app.getVersion(),
    install: kind,
    shortcut: () => shortcuts.get('toggle') ?? null,
    updates,
    selfUpdate,
    showView: (view) => chat?.showView(view)
  })
  diagnostics.maybeWelcome()
  // Aprovar pelo celular (Fase 18), pelo ntfy; desligado por padrão.
  const phoneExpiry = Number(process.env.WISP_TEST_PHONE_EXPIRY_MS)
  phone = setupPhone({
    isSender: (sender) => chat?.isSender(sender) ?? false,
    notify: () => settings.notify(),
    answer: (id, decision, how) => {
      const ok = chat?.answerRemote(id, decision, how) ?? false
      if (ok && how === 'expired') away.expiredOnPhone()
      return ok
    },
    ...(phoneExpiry > 0 ? { expiryMs: phoneExpiry } : {})
  })
  // A tela de agora, se o D-Bus já respondeu (senão, o watch acima avisa quando responder).
  phone.approvals.setLocked(screenLock.locked)

  menu = setupTray({
    mascotVisible: isMascotVisible,
    setMascotVisible,
    newConversation: () => chat?.newConversation(),
    avatar: () => getConfig().avatar,
    setAvatar: (avatar) => {
      updateConfig({ avatar })
      notifyConfigChange()
    },
    compactEnabled: () => getConfig().compact,
    setCompactEnabled: (enabled) => {
      updateConfig({ compact: enabled })
      notifyConfigChange()
    },
    soundEnabled: () => sounds.settings().enabled,
    setSoundEnabled: (enabled) => sounds.setEnabled(enabled),
    autostartEnabled: isAutostartEnabled,
    setAutostartEnabled: (enabled) => {
      const problem = setAutostart(enabled, entryIcon)
      if (problem) notify(t('Não mudei o início com o sistema'), problem)
      settings.notify()
    },
    demoEnabled: () => getConfig().demo,
    setDemoEnabled: (enabled) => {
      updateConfig({ demo: enabled })
      notifyConfigChange()
    },
    openSettings: () => chat?.openSettings(),
    openDiagnostics: () => chat?.showView('diagnostics'),
    openPalette: () => chat?.showView('palette'),
    quiet,
    shortcutLabel: () => shortcutLabel('toggle'),
    voiceShortcutLabel: () => shortcutLabel('voice'),
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
    ready: () => {
      sounds.resend()
      // A página recarregou: o que ela ouvia se perdeu.
      voice?.cancel()
      if (voice) setMascotVoice(voice.current)
    },
    moved: () => presence.start(),
    voice: (event) => voice?.handle(event)
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
  const remindersStart = setTimeout(() => {
    reminders.start()
    scheduler.start()
  }, 3000)
  powerMonitor.on('resume', () => {
    reminders.resume()
    scheduler.resume()
    github.watcher.refreshSoon()
    if (calendar.agenda.enabled) void calendar.agenda.refresh()
  })
  github.update()
  calendar.update()

  // O comando `wisp` e a entrada do menu de apps (fora de um pacote, que traz a dele). A entrada
  // vem antes do atalho: o portal confere o id do app contra ela.
  // No AppImage, o comando chama o arquivo .AppImage, e o ícone vai para um lugar fixo.
  if (IS_LINUX)
    deployLauncher(
      {
        electron: launchTarget(kind),
        appPath: kind === 'dev' ? app.getAppPath() : null,
        icon: entryIcon,
        flatpak: kind === 'flatpak' ? (process.env.FLATPAK_ID ?? null) : null
      },
      // O .deb e o Flatpak trazem a entrada do menu de apps deles.
      kind !== 'package' && kind !== 'flatpak'
    )
  // Os atalhos globais: um abre e fecha o painel; outro, segurado, ouve; e o da paleta (Fase 32). Trocados no
  // config.json, valem na hora (no Wayland, o desktop pergunta de novo).
  let boundShortcuts: string | undefined
  const bindShortcuts = async (): Promise<void> => {
    const { shortcut, voiceShortcut, paletteShortcut } = getConfig()
    const key = JSON.stringify([shortcut, voiceShortcut, paletteShortcut])
    if (key === boundShortcuts) return
    boundShortcuts = key
    shortcuts = await setupShortcuts([
      {
        id: 'toggle',
        accelerator: shortcut,
        description: t('Abrir ou fechar o painel do Wisp'),
        press: () => {
          presence.activity()
          chat?.toggle()
        }
      },
      {
        id: 'voice',
        accelerator: voiceShortcut,
        description: t('Falar com o Wisp (segure enquanto fala)'),
        press: () => voice?.press(shortcuts.get('voice')?.releases ?? false),
        release: () => voice?.release()
      },
      {
        id: 'palette',
        accelerator: paletteShortcut,
        description: t('Abrir a paleta de comandos do Wisp'),
        press: () => {
          presence.activity()
          chat?.showView('palette')
        }
      }
    ])
    for (const [id, status] of shortcuts) {
      if (status.problem) console.warn(`[wisp] sem o atalho ${id}: ${status.problem}.`)
    }
    menu?.refresh()
  }
  void bindShortcuts().catch((err: unknown) =>
    console.warn('[wisp] erro nos atalhos globais:', err)
  )
  onConfigChange(() => void bindShortcuts().catch(() => {}))
  refreshAutostart(entryIcon)

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
      case 'palette':
        chat?.showView('palette')
        break
    }
  })

  app.on('before-quit', () => {
    clearTimeout(remindersStart)
    media?.dispose()
    reminders.dispose()
    scheduler.dispose()
    releaseShortcuts()
    voice?.cancel()
    screenLock.dispose()
    phone?.dispose()
    desktopApprovals.reset()
    updates.dispose()
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

/**
 * As permissões que as páginas do Wisp podem pedir ao Chromium: o microfone, só para a página do
 * mascote (onde roda a captura de voz) e só o áudio; e escrever na área de transferência (o botão
 * de copiar do painel). Câmera, tela, localização, notificações e o resto são negados.
 */
function guardPermissions(): void {
  const isMascot = (contents: Electron.WebContents | null): boolean =>
    contents !== null && contents === getMascotWindow()?.webContents
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (permission === 'media') {
      const types = (details as { mediaTypes?: string[] }).mediaTypes ?? []
      callback(isMascot(contents) && types.length > 0 && types.every((type) => type === 'audio'))
      return
    }
    callback(permission === 'clipboard-sanitized-write')
  })
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => {
    if (permission !== 'media') return true
    return isMascot(contents) && (details as { mediaType?: string }).mediaType === 'audio'
  })
}

app.on('window-all-closed', () => {
  app.quit()
})
