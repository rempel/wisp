import { app, ipcMain, Notification, powerMonitor, screen, session, shell } from 'electron'
import type { Point } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import appIcon from '../../resources/icon.png?asset'
import { accessoryFor, msUntilMidnight } from './accessory'
import {
  ActivityLog,
  describeWeek,
  formatMinutes,
  isEmpty,
  nextWeek,
  plural,
  summarize,
  weekStart
} from './activity'
import { Agenda, describeAgenda } from './agenda'
import { isAutostartEnabled, refreshAutostart, setAutostart } from './autostart'
import { cleanOldAttachments } from './attachments'
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
import { listApps, openApp, openInEditor } from './desktop'
import { EdsCalendars } from './eds'
import { describeAlert, describeSnapshot, GithubWatcher, MAX_ALERTS } from './github'
import type { GithubAlert } from './github'
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
  setMascotGaze,
  setMascotView,
  setMascotVisible,
  setMascotVoice,
  sendVoiceCommand,
  setCompact,
  setIslandNote,
  setupMascot
} from './mascot'
import { startDesktopServer } from './mcp-server'
import type { DesktopServer } from './mcp-server'
import { Media } from './media'
import { MascotMood } from './mood'
import { CACHE_DIR, DATA_DIR } from './paths'
import { findProgram } from './programs'
import { synthesize } from './piper'
import { describeWhen, Reminders } from './reminders'
import { encodeForModel } from './screenshot'
import { ScreenLock } from './screenlock'
import { setupPhone } from './phone-ipc'
import type { Phone } from './phone-ipc'
import { Presence } from './presence'
import { ExternalSessions } from './sessions'
import { setupSessionsIpc } from './sessions-ipc'
import { setupSettings } from './settings-ipc'
import { soundForEvent, Sounds } from './sounds'
import { releaseShortcuts, setupShortcuts } from './shortcut'
import type { ShortcutStatus } from './shortcut'
import { setupTray } from './tray'
import type { AppMenu } from './tray'
import { Voice } from './voice'
import { matchApp } from './voice-commands'
import type { QuickCommand } from './voice-commands'
import { stepSystemVolume } from './volume'
import { transcribe, whisperSetup } from './whisper'
import { checkKey, listModels, looksLikeKey, OPENROUTER_SECRET } from './openrouter'
import { pickFolder } from './pick'
import { deleteSecret, hasSecret, storeSecret } from './secrets'
import { claudeConfigDir, inspectSkill, installSkill, listSkills, SKILL_NAME } from './skills'
import { XPointer } from './xpointer'
import { IPC } from '../shared/ipc'
import type {
  NoticeLevel,
  OpenRouterKeyResult,
  SkillInfo,
  SkillResult,
  VoiceTestResult
} from '../shared/ipc'
import { pcmStats } from '../shared/vad'

// O cache e os dados internos do Chromium ficam fora de ~/.config/wisp, que guarda só o
// config.json. Precisa ser definido antes do app ficar pronto.
app.setPath('userData', join(CACHE_DIR, 'electron'))
// A identidade do app no desktop: o nome do .desktop, a classe das janelas no X11 e o id que os
// portais conferem (o GNOME 50 recusa o atalho global de um id sem .desktop instalado).
app.setDesktopName(APP_ID)

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
  void cleanOldAttachments()
  guardPermissions()

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

  // O registro da semana (só contagens e nomes, nada do conteúdo), para o resumo de segunda.
  const activity = new ActivityLog(join(DATA_DIR, 'atividade.jsonl'), {
    enabled: () => getConfig().weeklySummary
  })
  activity.prune()
  const summaries = (): {
    current: ReturnType<typeof summarize>
    previous: ReturnType<typeof summarize>
  } => {
    const start = weekStart(Date.now())
    const before = weekStart(start - 1)
    const entries = activity.entries(before, nextWeek(start))
    return {
      current: summarize(entries, start, nextWeek(start)),
      previous: summarize(entries, before, start)
    }
  }

  // Os lembretes ficam num arquivo e avisam na hora, mesmo com o app reaberto no meio. A
  // notificação, o som e o sininho do mascote saem juntos; clicar na notificação abre o painel.
  const reminders = new Reminders(join(DATA_DIR, 'lembretes.json'), {
    fire: (reminder, late) => {
      presence.activity()
      activity.record({ k: 'lembrete' })
      islandMessage('Lembrete', reminder.text, 6000)
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
  let phone: Phone | null = null

  // Os alertas do GitHub (opcional), pelo gh já logado: CI e revisões dos seus PRs, e pedidos de
  // revisão. O clique na notificação abre o PR no navegador.
  const github = new GithubWatcher({
    gh: () =>
      findProgram('gh', ['gh'], ['/usr/local/bin', '/snap/bin', '/home/linuxbrew/.linuxbrew/bin']),
    onAlerts: (alerts) => githubAlerts(alerts),
    onProblem: (problem) => {
      if (!problem) return chat?.notice('info', 'Os alertas do GitHub voltaram a funcionar.')
      chat?.notice(
        'warning',
        problem.kind === 'missing'
          ? 'Para os alertas do GitHub, instale o **gh** (GitHub CLI) e rode `gh auth login` no ' +
              'terminal. O Wisp pergunta de novo de tempos em tempos.'
          : 'O **gh** não está logado no GitHub: rode `gh auth login` no terminal. O Wisp ' +
              'pergunta de novo de tempos em tempos.'
      )
    }
  })
  const githubAlerts = (alerts: GithubAlert[]): void => {
    presence.activity()
    const first = describeAlert(alerts[0])
    islandMessage(first.title, first.body, 8000)
    for (const alert of alerts.slice(0, MAX_ALERTS)) {
      const { title, body, url } = describeAlert(alert)
      notify(title, body, () => void shell.openExternal(url))
    }
    if (alerts.length > MAX_ALERTS) {
      const more = alerts.length - MAX_ALERTS
      notify('GitHub', `E mais ${more} ${more === 1 ? 'novidade' : 'novidades'} nos seus PRs.`)
    }
    // O mascote reage ao mais importante: CI vermelho ou pedido de mudanças, aprovação ou CI
    // verde, e o resto (pedido de revisão, comentário) com o sininho.
    const bad = alerts.some(
      (a) => a.kind === 'ci-failed' || (a.kind === 'review' && a.state === 'CHANGES_REQUESTED')
    )
    const good = alerts.some(
      (a) => a.kind === 'ci-passed' || (a.kind === 'review' && a.state === 'APPROVED')
    )
    if (bad) {
      mood.flashExternal('error')
      sounds.play('erro')
    } else if (good) {
      mood.flashExternal('happy')
      sounds.play('pronto')
    } else {
      reactMascot('remind')
      sounds.play('lembrete')
    }
  }
  const updateGithub = (): void => {
    if (getConfig().github) github.start()
    else github.stop()
  }

  // A agenda (opcional): as agendas do GNOME (EDS) e arquivos .ics. Avisa alguns minutos antes de
  // cada compromisso, e o painel vazio mostra o próximo.
  let eds: EdsCalendars | null = null
  const agenda = new Agenda({
    eds: async () => {
      if (!eds?.alive) eds = await EdsCalendars.connect()
      return eds
    },
    files: () => getConfig().calendarFiles,
    alertMinutes: () => getConfig().calendarAlertMinutes,
    onAlert: (event, minutes) => {
      presence.activity()
      reactMascot('remind')
      sounds.play('lembrete')
      const clock = (ms: number): string =>
        new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      const span =
        event.end > event.start ? `${clock(event.start)}–${clock(event.end)}` : clock(event.start)
      islandMessage(`Em ${minutes} min`, event.title, 8000)
      notify(
        `Em ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}: ${event.title}`,
        event.location ? `${span} · ${event.location}` : span,
        () => chat?.open()
      )
    },
    onNext: (next) => {
      chat?.setAgenda(
        next
          ? { title: next.title, start: next.start, end: next.end, location: next.location }
          : null
      )
      // Na ilha, o próximo compromisso fica na linha de baixo.
      setIslandNote(
        next
          ? `${new Date(next.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ${next.title}`
          : ''
      )
    }
  })
  let agendaKey = ''
  const updateAgenda = (): void => {
    const { calendar, calendarFiles, calendarAlertMinutes } = getConfig()
    const key = JSON.stringify([calendar, calendarFiles, calendarAlertMinutes])
    if (key === agendaKey) return
    agendaKey = key
    if (!calendar) {
      agenda.stop()
      eds?.close()
      eds = null
    } else if (agenda.enabled) {
      void agenda.refresh()
    } else {
      agenda.start()
    }
  }

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
      github: async () => {
        if (!getConfig().github) {
          return (
            'Os alertas do GitHub estão desligados. Dá para ligar em Configurações → ' +
            'Integrações (precisa do gh, o GitHub CLI, logado).'
          )
        }
        // Uma leitura com mais de um minuto é refeita na hora.
        const last = github.snapshot()
        if (!last || Date.now() - last.at > 60_000) await github.poll()
        const problem = github.currentProblem()
        if (problem === 'missing') return 'O gh (GitHub CLI) não está instalado.'
        if (problem === 'login') return 'O gh não está logado: falta rodar `gh auth login`.'
        const snapshot = github.snapshot()
        return snapshot ? describeSnapshot(snapshot) : 'Não consegui ler o GitHub agora.'
      },
      weekly: (which) => {
        if (!getConfig().weeklySummary) {
          return 'O resumo da semana está desligado (Configurações → Integrações).'
        }
        const { current, previous } = summaries()
        if (which === 'anterior') {
          const start = previous.from
          const older = summarize(
            activity.entries(weekStart(start - 1), start),
            weekStart(start - 1),
            start
          )
          return describeWeek(previous, older)
        }
        return `${describeWeek(current, previous)}\n(Semana em andamento; a anterior teve ${previous.conversations} conversas.)`
      },
      agenda: async (days, from) => {
        if (!getConfig().calendar) {
          return (
            'A agenda está desligada. Dá para ligar em Configurações → Integrações (lê as ' +
            'agendas do GNOME e arquivos .ics).'
          )
        }
        const today = new Date()
        let start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
        if (from) {
          const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from.trim())
          if (!match) return 'Use a data no formato AAAA-MM-DD.'
          start = new Date(+match[1], +match[2] - 1, +match[3]).getTime()
        }
        const end = new Date(start + days * 86_400_000 + 3_600_000).setHours(0, 0, 0, 0)
        const list = await agenda.between(start, end)
        const text = describeAgenda(list, start, end)
        return agenda.problems.length ? `${text}\nAvisos: ${agenda.problems.join(' ')}` : text
      },
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
      const sound = soundForEvent(event)
      if (sound) sounds.play(sound)
    },
    onClose: (conversation) => mood.forget(conversation),
    onPanel: (change) => {
      presence.activity()
      sounds.play(change === 'open' ? 'abrir' : 'fechar')
      updateAccessory()
    },
    onActivity: () => presence.activity()
  })

  // A voz: o botão do microfone do painel e o atalho de voz. Escuta só quando pedida, e nunca com
  // a tela bloqueada.
  let screenLock: ScreenLock | null = null
  void ScreenLock.watch().then((watching) => {
    screenLock = watching
    phone?.approvals.setLocked(watching.locked)
    watching.on('change', (locked: boolean) => {
      voice?.setLocked(locked)
      phone?.approvals.setLocked(locked)
    })
  })
  const whisperOptions = (): { binary: string; model: string; language: string } => {
    const config = getConfig()
    return {
      binary: config.whisperPath,
      model: config.whisperModel,
      language: config.voiceLanguage
    }
  }
  /** Um aviso da voz: no painel e, com ele escondido, numa notificação (menos os informativos). */
  const voiceNotice = (level: NoticeLevel, text: string): void => {
    chat?.notice(level, text)
    if (level !== 'info' && !chat?.visible()) notify('Wisp', text.replace(/\*\*|`/g, ''))
  }
  /** Um comando rápido de voz, feito aqui mesmo; false se é para o Claude. */
  const runQuick = async (command: QuickCommand, text: string): Promise<boolean> => {
    if (!chat) return false
    try {
      return await quick(command, text)
    } catch (err) {
      chat.utterance(text)
      voiceNotice('warning', `Não consegui: ${(err as Error).message}.`)
      return true
    }
  }
  const quick = async (command: QuickCommand, text: string): Promise<boolean> => {
    if (!chat) return false
    const done = (ok: boolean, message: string): true => {
      chat?.utterance(text)
      if (ok) {
        chat?.notice('info', message)
        mood.flashExternal('happy')
      } else {
        voiceNotice('warning', message)
      }
      return true
    }
    switch (command.kind) {
      case 'media': {
        if (!media || !(await media.players()).length) {
          return done(false, 'Nenhum player de música aberto.')
        }
        return done(true, (await media.control(command.action)) || 'Feito.')
      }
      case 'volume': {
        const level = await stepSystemVolume(command.direction)
        if (level !== null) return done(true, `Volume do sistema em ${level}%.`)
        if (media && (await media.players()).length) {
          return done(true, await media.volume(undefined, command.direction * 10))
        }
        return done(false, 'Não consegui mudar o volume: não achei o wpctl nem o pactl.')
      }
      case 'open': {
        // Um nome que não é de um app instalado vai para o Claude, que sabe procurar melhor.
        const found = matchApp(command.name, listApps())
        if (!found) return false
        chat.utterance(text)
        // O mesmo card do open_app do Claude: nada abre sem um clique (a não ser que o open_app
        // esteja em extraAllowedTools, como para o Claude).
        const allowed = getConfig().extraAllowedTools.includes('mcp__desktop__open_app')
        const approval = allowed
          ? { allow: true }
          : await chat.requestApproval({
              toolName: 'mcp__desktop__open_app',
              input: { id: found.id }
            })
        if (!approval.allow) return true
        const outcome = await openApp(found.id)
        chat.notice(outcome.ok ? 'info' : 'warning', outcome.message)
        if (outcome.ok) mood.flashExternal('happy')
        return true
      }
    }
  }
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
    locked: () => screenLock?.locked ?? false,
    pendingApprovals: () => chat?.pendingApprovals() ?? 0,
    denyApprovals: () => chat?.denyApprovals(),
    quickCommands: () => getConfig().quickCommands,
    runQuick,
    deliver: (text, source) => {
      if (!chat) return null
      // Pelo botão do painel (ou com voiceReview), o texto fica na caixa para revisar.
      if (source === 'panel' || getConfig().voiceReview) {
        chat.compose(text)
        return null
      }
      return chat.ask(text, { voice: true })
    },
    notice: voiceNotice,
    activity: () => presence.activity(),
    replies: () => getConfig().voiceReplies,
    synthesize: (text) =>
      synthesize(text, { binary: getConfig().piperPath, model: getConfig().piperModel })
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
  setMascotAvatar(getConfig().avatar)
  onConfigChange(() => {
    updateAccessory()
    setMascotAvatar(getConfig().avatar)
    sounds.check()
    updateBrowser()
    setCompact(getConfig().compact)
    updateGithub()
    updateAgenda()
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
  // A tela de configurações do painel (e a pílula do modo demonstração).
  // A chave da OpenRouter fica no chaveiro do sistema; aqui, só se ela existe (sem destrancar).
  // O chaveiro só é consultado quando a tela de configurações abre: quem não usa a OpenRouter
  // não tem por que acordá-lo.
  let openrouterKey: boolean | null = null
  let openrouterKeyAsked = false
  const settings = setupSettings({
    isSender: (sender) => chat?.isSender(sender) ?? false,
    send: (snapshot) => chat?.notifySettings(snapshot),
    autostart: {
      get: isAutostartEnabled,
      set: (enabled) => setAutostart(enabled, entryIcon)
    },
    onChange: () => menu?.refresh(),
    openrouterKey: () => {
      if (!openrouterKeyAsked) {
        openrouterKeyAsked = true
        void refreshOpenRouterKey()
      }
      return openrouterKey
    },
    phone: () => phone!.status()
  })
  // Aprovar pelo celular (Fase 18), pelo ntfy; desligado por padrão.
  const phoneExpiry = Number(process.env.WISP_TEST_PHONE_EXPIRY_MS)
  phone = setupPhone({
    isSender: (sender) => chat?.isSender(sender) ?? false,
    notify: () => settings.notify(),
    answer: (id, decision, how) => chat?.answerFromPhone(id, decision, how) ?? false,
    ...(phoneExpiry > 0 ? { expiryMs: phoneExpiry } : {})
  })
  // A tela de agora, se o D-Bus já respondeu (senão, o watch acima avisa quando responder).
  phone.approvals.setLocked((screenLock as ScreenLock | null)?.locked ?? false)
  const refreshOpenRouterKey = async (): Promise<void> => {
    try {
      openrouterKey = await hasSecret(OPENROUTER_SECRET)
    } catch {
      openrouterKey = null
    }
    settings.notify()
  }
  ipcMain.handle(IPC.openrouterModels, async (event) => {
    if (!chat?.isSender(event.sender)) return { error: 'pedido inválido' }
    try {
      return (await listModels()).map(({ id, name, prompt, completion, context }) => ({
        id,
        name,
        prompt,
        completion,
        context
      }))
    } catch (err) {
      return { error: `Não consegui buscar os modelos da OpenRouter (${(err as Error).message}).` }
    }
  })
  ipcMain.handle(
    IPC.openrouterSetKey,
    async (event, key: unknown): Promise<OpenRouterKeyResult> => {
      if (!chat?.isSender(event.sender)) return { ok: false, message: 'pedido inválido' }
      const value = typeof key === 'string' ? key.trim() : ''
      if (!looksLikeKey(value)) {
        return {
          ok: false,
          message: 'Isso não parece uma chave da OpenRouter (elas começam com sk-or-).'
        }
      }
      const checked = await checkKey(value)
      // Sem rede, a chave é guardada mesmo assim; recusada pela OpenRouter, não.
      const offline = !checked.ok && checked.message.startsWith('Não consegui falar')
      if (!checked.ok && !offline) return checked
      try {
        await storeSecret(OPENROUTER_SECRET, 'Wisp: chave da OpenRouter', value)
      } catch (err) {
        return { ok: false, message: (err as Error).message }
      }
      openrouterKey = true
      chat?.openrouterKeyChanged()
      settings.notify()
      return checked.ok
        ? { ok: true, label: checked.label }
        : { ok: true, label: null, note: 'Guardada, mas não deu para conferir agora (sem rede).' }
    }
  )
  // As skills (Fase 15): listar, instalar de uma pasta (escolhida no diálogo do sistema, com uma
  // prévia antes de copiar) e mandar para a lixeira.
  let pickedSkill: string | null = null
  ipcMain.handle(IPC.skillsList, (event): SkillInfo[] =>
    chat?.isSender(event.sender) ? listSkills() : []
  )
  ipcMain.handle(IPC.skillsPick, async (event) => {
    if (!chat?.isSender(event.sender)) return null
    pickedSkill = null
    const dir = await pickFolder('Escolha a pasta da skill (a que tem o SKILL.md)', undefined, null)
    if (!dir) return null
    try {
      const preview = inspectSkill(dir)
      pickedSkill = dir
      return preview
    } catch (err) {
      return { error: (err as Error).message }
    }
  })
  ipcMain.handle(IPC.skillsInstall, (event): SkillResult => {
    if (!chat?.isSender(event.sender) || !pickedSkill) {
      return { ok: false, message: 'Escolha a pasta da skill antes.' }
    }
    const dir = pickedSkill
    pickedSkill = null
    try {
      installSkill(dir)
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
    return { ok: true, message: 'Instalada. Ela vale nas conversas novas (Ctrl+K).' }
  })
  ipcMain.handle(IPC.skillsRemove, async (event, name: unknown): Promise<SkillResult> => {
    if (!chat?.isSender(event.sender)) return { ok: false, message: 'pedido inválido' }
    // Só as pessoais, pelo nome: os plugins se removem pelo /plugin do Claude Code.
    if (typeof name !== 'string' || !SKILL_NAME.test(name)) {
      return { ok: false, message: 'Nome de skill inválido.' }
    }
    const skill = listSkills().find((item) => item.origin === 'personal' && item.name === name)
    if (!skill) return { ok: false, message: 'Essa skill não está nas suas skills pessoais.' }
    try {
      await shell.trashItem(skill.path)
    } catch (err) {
      return { ok: false, message: `Não consegui mandar para a lixeira: ${(err as Error).message}` }
    }
    return { ok: true, message: `"${name}" foi para a lixeira.` }
  })
  ipcMain.on(IPC.skillsOpenFolder, (event) => {
    if (!chat?.isSender(event.sender)) return
    const dir = join(claudeConfigDir(), 'skills')
    mkdirSync(dir, { recursive: true })
    void shell.openPath(dir)
  })
  ipcMain.handle(IPC.openrouterClearKey, async (event): Promise<OpenRouterKeyResult> => {
    if (!chat?.isSender(event.sender)) return { ok: false, message: 'pedido inválido' }
    try {
      await deleteSecret(OPENROUTER_SECRET)
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
    openrouterKey = false
    chat?.openrouterKeyChanged()
    settings.notify()
    return { ok: true, label: null }
  })

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
      if (problem) notify('Não mudei o início com o sistema', problem)
      settings.notify()
    },
    demoEnabled: () => getConfig().demo,
    setDemoEnabled: (enabled) => {
      updateConfig({ demo: enabled })
      notifyConfigChange()
    },
    openSettings: () => chat?.openSettings(),
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
  const remindersStart = setTimeout(() => reminders.start(), 3000)
  powerMonitor.on('resume', () => {
    reminders.resume()
    github.refreshSoon()
    if (agenda.enabled) void agenda.refresh()
  })
  updateGithub()
  updateAgenda()

  // Na segunda (a partir das 9h, ou na primeira vez que o Wisp abre depois disso), o resumo da
  // semana que passou, uma vez só. O clique abre o painel com ele.
  const seenPath = join(DATA_DIR, 'resumo.json')
  const checkWeekly = (): void => {
    if (!getConfig().weeklySummary) return
    const now = Date.now()
    const start = weekStart(now)
    if (now < start + 9 * 3_600_000) return
    let seen = 0
    try {
      seen = (JSON.parse(readFileSync(seenPath, 'utf8')) as { semana?: number }).semana ?? 0
    } catch {
      // Nunca mostrou.
    }
    if (seen >= start) return
    try {
      writeFileSync(seenPath, JSON.stringify({ semana: start }), { mode: 0o600 })
    } catch {
      return
    }
    const { previous } = summaries()
    if (isEmpty(previous)) return
    notify(
      'O resumo da sua semana',
      `${plural(previous.conversations, 'conversa', 'conversas')}, o Claude trabalhou ` +
        `${formatMinutes(previous.claudeMinutes)}, ` +
        `+${previous.added} −${previous.removed} linhas editadas.`,
      () => chat?.openSummary()
    )
  }
  setTimeout(checkWeekly, 10_000)
  setInterval(checkWeekly, 3_600_000).unref()
  ipcMain.handle(IPC.summaryGet, (event) => {
    if (!chat?.isSender(event.sender)) return null
    return { enabled: getConfig().weeklySummary, ...summaries() }
  })

  // O comando `wisp` e a entrada do menu de apps (fora de um pacote, que traz a dele). A entrada
  // vem antes do atalho: o portal confere o id do app contra ela.
  // No AppImage, o comando chama o arquivo .AppImage, e o ícone vai para um lugar fixo.
  deployLauncher(
    {
      electron: launchTarget(kind),
      appPath: kind === 'dev' ? app.getAppPath() : null,
      icon: entryIcon
    },
    kind !== 'package'
  )
  // Os atalhos globais: um abre e fecha o painel; o outro, segurado, ouve. Trocados no
  // config.json, valem na hora (no Wayland, o desktop pergunta de novo).
  let boundShortcuts: string | undefined
  const bindShortcuts = async (): Promise<void> => {
    const { shortcut, voiceShortcut } = getConfig()
    const key = JSON.stringify([shortcut, voiceShortcut])
    if (key === boundShortcuts) return
    boundShortcuts = key
    shortcuts = await setupShortcuts([
      {
        id: 'toggle',
        accelerator: shortcut,
        description: 'Abrir ou fechar o painel do Wisp',
        press: () => {
          presence.activity()
          chat?.toggle()
        }
      },
      {
        id: 'voice',
        accelerator: voiceShortcut,
        description: 'Falar com o Wisp (segure enquanto fala)',
        press: () => voice?.press(shortcuts.get('voice')?.releases ?? false),
        release: () => voice?.release()
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
    }
  })

  app.on('before-quit', () => {
    clearTimeout(remindersStart)
    media?.dispose()
    reminders.dispose()
    releaseShortcuts()
    voice?.cancel()
    screenLock?.dispose()
    phone?.dispose()
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
