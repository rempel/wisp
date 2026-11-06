import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { DEFAULT_AVATAR } from '../../shared/avatars'
import { ATTACHMENT_LIMITS, MAX_PANES } from '../../shared/ipc'
import { leaf, neighbor } from '../../shared/layout'
import type { Side } from '../../shared/layout'
import type {
  AgendaItem,
  AttachmentPreview,
  ChatEvent,
  ClipboardOffer,
  MascotState,
  PlanUsage,
  SettingsSnapshot,
  SoundSettings,
  TabsState,
  WindowState,
  VoiceStatus
} from '../../shared/ipc'
import { reducedMotion, setAppearance } from '../common/appearance'
import { AvatarContext } from './avatar-context'
import { CommandPalette } from './CommandPalette'
import { FileViewer } from './FileViewer'
import { fileViewOpen } from './fileView'
import { MarkdownPreview, PreviewBar } from './Preview'
import { markdownOpen } from './preview-store'
import { DiagnosticsView, WelcomeView } from './Diagnostics'
import { Grid } from './Grid'
import { cardWaiting, fromTerminal, isCardShortcut, isWispTerminalShortcut } from './terminal-keys'
import { HistoryView } from './HistoryView'
import {
  Avatar,
  BackIcon,
  CloseIcon,
  DockIcon,
  MaximizeIcon,
  RestoreIcon,
  DemoIcon,
  HistoryIcon,
  PaperclipIcon,
  SettingsIcon,
  TerminalIcon
} from './icons'
import { Pane } from './Pane'
import { PaneBus } from './paneBus'
import { paletteActions } from './palette-actions'
import type { PaletteItem } from './palette'
import { SessionPane } from './SessionPane'
import { SessionsView } from './SessionsView'
import { SettingsView } from './SettingsView'
import { awaitingPermission, initialState, reducer, statusText } from './state'
import type { Action, ChatState } from './state'
import { TabBar } from './TabBar'
import type { TabStatus } from './TabBar'
import { CostPill } from './CostPill'
import { UsagePill } from './UsagePill'
import { useSessions } from './useSessions'
import { t } from '../../shared/i18n'

/** De quanto em quanto tempo (ms), no máximo, o painel avisa que o usuário está mexendo nele. */
const ACTIVITY_EVERY_MS = 20_000

/** A "mola" do painel quando ele aparece. */
const SHOW_KEYFRAMES: Keyframe[] = [
  { transform: 'translateY(10px) scale(0.97)', opacity: 0.4 },
  { transform: 'none', opacity: 1 }
]

const EMPTY_TABS: TabsState = { tabs: [], panes: [], focused: 0, layout: leaf('') }

/** Alt+Shift+setas: o painel vizinho. */
const ARROWS: Record<string, Side> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'top',
  ArrowDown: 'bottom'
}

/**
 * O painel: o cabeçalho, as abas e até MAX_PANES painéis lado a lado, cada um com uma conversa
 * (ou uma sessão do terminal). O estado de cada conversa fica aqui, pelo id dela.
 */

/** Os passos do tamanho do painel (o zoom da página), de 70% a 200%. */
const ZOOM_MIN = 0.7
const ZOOM_MAX = 2

/** Aumenta (+, =), diminui (-) ou volta ao normal (0) o tamanho do painel; fica no config.json. */
async function zoomPanel(key: string): Promise<void> {
  const snapshot = await window.wisp.settings.get()
  const now = snapshot?.values.panelZoom ?? 1
  const step = key === '-' ? -0.1 : key === '0' ? 0 : 0.1
  const next =
    key === '0' ? 1 : Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, now + step)) * 10) / 10
  if (next !== now) await window.wisp.settings.set({ panelZoom: next })
}

/** O título e a linha de baixo do cabeçalho de cada tela. */
const VIEW_TITLES: Record<string, [string, string]> = {
  history: [t('Conversas'), t('guardadas neste computador')],
  settings: [t('Configurações'), t('gravadas no config.json')],
  sessions: [t('Sessões'), t('do Claude Code no terminal')],
  diagnostics: [t('Diagnóstico'), t('o que o Wisp precisa e o que está ligado')],
  welcome: [t('Primeiros passos'), t('uma coisa de cada vez')]
}

export default function Chat(): JSX.Element {
  const [conversations, setConversations] = useState<Map<string, ChatState>>(() => new Map())
  const [tabs, setTabs] = useState<TabsState>(EMPTY_TABS)
  const [view, setView] = useState<
    'chat' | 'history' | 'sessions' | 'settings' | 'diagnostics' | 'welcome'
  >('chat')
  // As configurações: o modo demonstração muda o cabeçalho e o painel vazio.
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null)
  /** O próximo compromisso da agenda (o painel vazio mostra). */
  const [agendaNext, setAgendaNext] = useState<AgendaItem | null>(null)
  const demo = settings?.values.demo ?? false
  const sessions = useSessions()
  const requests = sessions?.sessions.reduce((sum, item) => sum + item.requests.length, 0) ?? 0
  const [mood, setMood] = useState<MascotState>('idle')
  const [sound, setSound] = useState<SoundSettings | null>(null)
  const [usage, setUsage] = useState<PlanUsage | null>(null)
  const [dragging, setDragging] = useState(false)
  /** Uma aba sendo arrastada da barra (os painéis mostram onde ela cai). */
  const [draggingTab, setDraggingTab] = useState<string | null>(null)
  /** A janela: maximizada, e solta (onde você a deixou) ou ao lado do mascote. */
  const [windowState, setWindowState] = useState<WindowState>({
    maximized: false,
    detached: false
  })
  useEffect(() => window.wisp.chat.onWindowState(setWindowState), [])
  // O chip "usar o que você copiou" (mostrado no painel em foco).
  const [clip, setClip] = useState<ClipboardOffer | null>(null)
  // A voz: o botão do microfone do painel em foco acompanha (ouvindo, transcrevendo, falando).
  const [voice, setVoice] = useState<VoiceStatus>({ state: 'idle' })
  // Conversas com uma resposta nova que ainda não foi vista (o pontinho da aba).
  const [unread, setUnread] = useState<Set<string>>(() => new Set())
  // A paleta de comandos (Fase 32): Ctrl+P no painel, ou o atalho global.
  const [palette, setPalette] = useState(false)
  const paletteRef = useRef(palette)
  useEffect(() => {
    paletteRef.current = palette
  }, [palette])
  const root = useRef<HTMLDivElement>(null)
  const [bus] = useState(() => new PaneBus())
  // O que os atalhos e os eventos precisam ler sem esperar o render.
  const tabsRef = useRef(tabs)
  const viewRef = useRef(view)
  const voiceRef = useRef(voice)
  const soundRef = useRef(sound)
  useEffect(() => {
    viewRef.current = view
  }, [view])
  useEffect(() => {
    soundRef.current = sound
  }, [sound])

  /** A conversa do painel em foco (null se lá estiver uma sessão do terminal). */
  const focusedConversation = useCallback((): string | null => {
    const state = tabsRef.current
    const id = state.panes[state.focused]
    return state.tabs.find((tab) => tab.id === id)?.kind === 'chat' ? id : null
  }, [])

  const apply = useCallback((conversation: string, action: Action): void => {
    setConversations((current) => {
      const next = new Map(current)
      next.set(conversation, reducer(current.get(conversation) ?? initialState, action))
      return next
    })
  }, [])

  // O humor do mascote (o avatar acompanha), as abas, a voz e a animação de abertura. Antes do
  // ready(), para o main já encontrar quem ouve.
  useEffect(() => {
    const offMood = window.wisp.chat.onMood(setMood)
    const offClipboard = window.wisp.chat.onClipboard(setClip)
    const offTabs = window.wisp.tabs.onState((state) => {
      tabsRef.current = state
      setTabs(state)
      // Abas à vista não têm nada "novo"; as fechadas saem da memória.
      setUnread((current) => {
        const next = new Set([...current].filter((id) => !state.panes.includes(id)))
        return next.size === current.size ? current : next
      })
      setConversations((current) => {
        const open = new Set(state.tabs.map((tab) => tab.id))
        if ([...current.keys()].every((id) => open.has(id))) return current
        return new Map([...current].filter(([id]) => open.has(id)))
      })
    })
    const offVoice = window.wisp.voice.onStatus((status) => {
      voiceRef.current = status
      setVoice(status)
      if (status.state !== 'listening') root.current?.style.setProperty('--lvl', '0')
    })
    // O volume do microfone mexe no anel do botão direto no estilo, sem render.
    const offLevel = window.wisp.voice.onLevel((level) => {
      root.current?.style.setProperty('--lvl', String(level))
    })
    // Um texto ditado vai para o fim da caixa do painel em foco, para revisar e enviar.
    const offCompose = window.wisp.chat.onCompose((text) => {
      const conversation = focusedConversation()
      if (conversation) bus.emit(conversation, { type: 'compose', text })
    })
    const offSessions = window.wisp.sessions.onShow(() => setView('sessions'))
    const offSettingsShow = window.wisp.settings.onShow(() => setView('settings'))
    const offPanelView = window.wisp.diagnostics.onView((next) =>
      next === 'palette' ? setPalette(true) : setView(next)
    )
    const offSettings = window.wisp.settings.onChanged(setSettings)
    const offAgenda = window.wisp.agenda.onNext(setAgendaNext)
    const offSummary = window.wisp.summary.onShow(() => setView('history'))
    void window.wisp.settings.get().then((snapshot) => snapshot && setSettings(snapshot))
    const offShown = window.wisp.chat.onShown(() => {
      if (!reducedMotion()) {
        root.current?.animate(SHOW_KEYFRAMES, {
          duration: 360,
          easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)'
        })
      }
    })
    // Copiar algo do painel (uma resposta, um código) não vira oferta de volta.
    const onCopy = (): void => window.wisp.chat.copied()
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCopy)
    return () => {
      offMood()
      offClipboard()
      offTabs()
      offVoice()
      offLevel()
      offCompose()
      offShown()
      offSessions()
      offSettingsShow()
      offPanelView()
      offSettings()
      offAgenda()
      offSummary()
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCopy)
    }
  }, [bus, focusedConversation])

  // Os sons (o botão de mudo) e os arquivos soltos no mascote, que viram anexos no painel em foco.
  useEffect(() => {
    let alive = true
    void window.wisp.sound.get().then((settings) => {
      if (alive && settings) setSound(settings)
    })
    const offSound = window.wisp.sound.onChanged(setSound)
    const offAttach = window.wisp.chat.onAttach((dropped) => {
      setView('chat')
      const conversation = focusedConversation()
      if (conversation) bus.emit(conversation, { type: 'attach', dropped })
    })
    return () => {
      alive = false
      offSound()
      offAttach()
    }
  }, [bus, focusedConversation])

  // Mexer no painel (teclas, cliques, rolagem) conta como atividade: o mascote não cochila com o
  // usuário escrevendo ou lendo. O aviso vai no máximo a cada ACTIVITY_EVERY_MS.
  useEffect(() => {
    let last = 0
    const onActivity = (): void => {
      const now = Date.now()
      if (now - last < ACTIVITY_EVERY_MS) return
      last = now
      window.wisp.chat.activity()
    }
    const options = { capture: true, passive: true }
    const events = ['keydown', 'pointerdown', 'wheel'] as const
    for (const name of events) window.addEventListener(name, onActivity, options)
    return () => {
      for (const name of events) window.removeEventListener(name, onActivity, options)
    }
  }, [])

  // Eventos do main, de todas as conversas. Os que chegam no mesmo quadro viram um render só.
  useEffect(() => {
    let queued: [string, ChatEvent][] = []
    let frame = 0
    // As conversas com um turno rodando agora (desde o busy, até o fim do turno).
    const running = new Set<string>()
    const off = window.wisp.chat.onEvent((conversation, event) => {
      queued.push([conversation, event])
      frame ||= requestAnimationFrame(() => {
        const batch = queued
        queued = []
        frame = 0
        const grouped = new Map<string, ChatEvent[]>()
        for (const [id, item] of batch) grouped.set(id, [...(grouped.get(id) ?? []), item])
        setConversations((current) => {
          const next = new Map(current)
          for (const [id, events] of grouped) {
            next.set(id, reducer(current.get(id) ?? initialState, { type: 'events', events }))
          }
          return next
        })
        // Uma resposta que terminou numa aba fora da vista ganha o pontinho de "nova". Só as que
        // rodaram agora: a conversa reaberta do histórico também traz os fins de turno dela.
        const finished: string[] = []
        for (const [id, item] of batch) {
          if (item.type === 'usage') setUsage(item.usage)
          // Aberta pela busca do histórico (Fase 29): a busca na conversa abre na mensagem.
          else if (item.type === 'jump') bus.emit(id, { type: 'find', target: item.target })
          else if (item.type === 'busy' && item.busy) running.add(id)
          else if (item.type === 'turn-end' && running.delete(id)) {
            if (!tabsRef.current.panes.includes(id)) finished.push(id)
          }
        }
        if (finished.length) setUnread((current) => new Set([...current, ...finished]))
      })
    })
    window.wisp.chat.ready()
    return () => {
      off()
      cancelAnimationFrame(frame)
    }
  }, [bus])

  const toggleSound = useCallback((current: SoundSettings): void => {
    const next = { ...current, enabled: !current.enabled }
    setSound(next)
    window.wisp.sound.set(next.enabled)
  }, [])

  // A aparência das configurações (Fase 22): menos movimento e alto contraste, além do sistema.
  useEffect(() => {
    if (settings) {
      setAppearance({
        reduceMotion: settings.values.reduceMotion,
        highContrast: settings.values.highContrast
      })
    }
  }, [settings])

  /** Exporta a conversa em Markdown; o resultado aparece nela, como um aviso (fora do histórico). */
  const exportConversation = useCallback(
    async (conversation: string): Promise<void> => {
      const result = await window.wisp.chat.exportMarkdown(conversation)
      if (!result) return
      apply(conversation, {
        type: 'events',
        events: [
          result.ok
            ? {
                type: 'notice',
                level: 'info',
                text: t('Conversa exportada para `{path}`.', { path: result.path })
              }
            : { type: 'notice', level: 'warning', text: result.message }
        ]
      })
    },
    [apply]
  )

  // Atalhos: Esc fecha (ou volta do histórico); Ctrl+K recomeça a conversa da aba; Ctrl+T abre
  // uma aba; Ctrl+W fecha a aba; Ctrl+Tab e Ctrl+1…9 trocam de aba; Ctrl+\ divide a janela;
  // Ctrl+M liga e desliga os sons. Voltar ao painel devolve o foco para a caixa de texto.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      // Com a paleta ou um arquivo aberto (Fase 34), as teclas são deles.
      if (paletteRef.current || fileViewOpen() || markdownOpen()) return
      // No terminal, as teclas são do Claude Code (o Esc interrompe), menos as das abas.
      if (
        fromTerminal(event.target) &&
        !isWispTerminalShortcut(event) &&
        !(isCardShortcut(event) && cardWaiting(event.target))
      )
        return
      const ctrl = event.ctrlKey && !event.altKey && !event.metaKey
      const plain = ctrl && !event.shiftKey
      const state = tabsRef.current
      const key = event.key.toLowerCase()
      const focusedTab = state.panes[state.focused]
      if (ctrl && key === 'p' && (event.shiftKey || !fromTerminal(event.target))) {
        // A paleta de comandos (Fase 32): Ctrl+P (no terminal, que usa o Ctrl+P, Ctrl+Shift+P).
        event.preventDefault()
        setPalette(true)
      } else if (event.key === 'Escape') {
        // Ouvindo, transcrevendo ou falando, o Esc só desiste disso.
        if (voiceRef.current.state !== 'idle') window.wisp.voice.cancel()
        else if (viewRef.current !== 'chat') setView('chat')
        else window.wisp.chat.hide()
      } else if (plain && key === 'k') {
        event.preventDefault()
        const conversation = focusedConversation()
        if (conversation) window.wisp.chat.newConversation(conversation)
        setView('chat')
      } else if (ctrl && ['=', '+', '-', '0'].includes(event.key)) {
        // O tamanho do painel (Fase 22): Ctrl+mais, Ctrl+menos e Ctrl+0 volta ao normal.
        event.preventDefault()
        void zoomPanel(event.key)
      } else if (isCardShortcut(event)) {
        // Alt+P (Fase 22): o foco vai para o card que espera resposta, sem o mouse.
        event.preventDefault()
        const conversation = focusedConversation()
        if (conversation) bus.emit(conversation, { type: 'focus-card' })
      } else if (plain && key === 'f') {
        // A busca na conversa em foco (Fase 21).
        event.preventDefault()
        setView('chat')
        const conversation = focusedConversation()
        if (conversation) bus.emit(conversation, { type: 'find' })
      } else if (ctrl && event.shiftKey && key === 'e') {
        // Exportar a conversa em foco em Markdown.
        event.preventDefault()
        const conversation = focusedConversation()
        if (conversation) void exportConversation(conversation)
      } else if (plain && key === 't') {
        event.preventDefault()
        window.wisp.tabs.create()
        setView('chat')
      } else if (plain && key === 'w') {
        event.preventDefault()
        if (focusedTab) window.wisp.tabs.close(focusedTab)
      } else if (ctrl && event.key === 'Tab' && state.tabs.length > 1) {
        event.preventDefault()
        const index = state.tabs.findIndex((tab) => tab.id === focusedTab)
        const step = event.shiftKey ? -1 : 1
        const next = state.tabs[(index + step + state.tabs.length) % state.tabs.length]
        window.wisp.tabs.show(next.id)
        setView('chat')
      } else if (plain && /^[1-9]$/.test(event.key)) {
        const tab = state.tabs[Number(event.key) - 1]
        if (!tab) return
        event.preventDefault()
        window.wisp.tabs.show(tab.id)
        setView('chat')
      } else if (ctrl && event.code === 'Backslash') {
        // Ctrl+\ divide ao lado; com Shift, embaixo.
        event.preventDefault()
        if (state.panes.length < MAX_PANES) {
          window.wisp.tabs.split(event.shiftKey ? 'column' : 'row')
        }
      } else if (
        event.altKey &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        ARROWS[event.key] &&
        focusedTab
      ) {
        event.preventDefault()
        const next = neighbor(state.layout, focusedTab, ARROWS[event.key])
        const index = next ? state.panes.indexOf(next) : -1
        if (index >= 0) window.wisp.tabs.focus(index)
      } else if (plain && key === 'm') {
        event.preventDefault()
        const current = soundRef.current
        if (current) toggleSound(current)
      }
    }
    const onFocus = (): void => {
      const conversation = focusedConversation()
      if (conversation) bus.emit(conversation, { type: 'focus' })
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('focus', onFocus)
    }
  }, [bus, focusedConversation, toggleSound, exportConversation])

  // Arquivos arrastados para qualquer ponto da janela viram anexos do painel em foco. Sem o
  // preventDefault, soltar um arquivo faria a janela navegar até ele.
  useEffect(() => {
    let depth = 0
    const hasFiles = (event: DragEvent): boolean =>
      event.dataTransfer?.types.includes('Files') ?? false
    const onEnter = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth++
      setDragging(true)
    }
    const onOver = (event: DragEvent): void => {
      if (!hasFiles(event) || !event.dataTransfer) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
    const onLeave = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (event: DragEvent): void => {
      depth = 0
      setDragging(false)
      if (!hasFiles(event) || !event.dataTransfer) return
      event.preventDefault()
      // Soltou em cima de um painel: ele é o destino (e passa a ser o do foco).
      const pane = (event.target as Element | null)?.closest?.('[data-conversation]')
      const target = pane?.getAttribute('data-conversation') ?? focusedConversation()
      setView('chat')
      if (target) bus.emit(target, { type: 'drop', data: event.dataTransfer })
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [bus, focusedConversation])

  const onSent = useCallback(
    (conversation: string) =>
      (text: string, attachments: AttachmentPreview[], replace = false): void =>
        apply(conversation, { type: 'user-message', text, attachments, replace }),
    [apply]
  )

  // O pontinho de cada aba: esperando você, trabalhando, resposta nova.
  const statuses = new Map<string, TabStatus>()
  for (const tab of tabs.tabs) {
    if (tab.kind === 'session') {
      const session = sessions?.sessions.find((item) => item.id === tab.sessionId)
      const state = session?.state
      statuses.set(
        tab.id,
        session?.requests.length || state === 'waiting'
          ? 'waiting'
          : state === 'working'
            ? 'working'
            : state === 'error'
              ? 'error'
              : 'idle'
      )
      continue
    }
    const state = conversations.get(tab.id)
    statuses.set(
      tab.id,
      state && awaitingPermission(state)
        ? 'waiting'
        : state?.busy
          ? 'working'
          : unread.has(tab.id)
            ? 'done'
            : 'idle'
    )
  }

  const focusedId = tabs.panes[tabs.focused]
  const focusedTab = tabs.tabs.find((tab) => tab.id === focusedId)
  const focusedState =
    focusedTab?.kind === 'chat' ? (conversations.get(focusedTab.id) ?? initialState) : null
  const split = tabs.panes.length > 1

  /** Um painel da grade: a conversa (ou a sessão do terminal) da aba. */
  const renderPane = (id: string): ReactNode => {
    const index = tabs.panes.indexOf(id)

    const tab = tabs.tabs.find((item) => item.id === id)
    if (!tab) return null
    const focused = index === tabs.focused
    if (tab.kind === 'session') {
      return (
        <section
          key={id}
          className={`pane${focused ? ' focused' : ''}`}
          onPointerDownCapture={() => {
            if (!focused) window.wisp.tabs.focus(index)
          }}
        >
          {split && (
            <div className="pane-head">
              <span className="pane-title">{tab.title}</span>
              <button
                type="button"
                className="icon-button pane-close"
                onClick={() => window.wisp.tabs.unsplit(index)}
                title={t('Tirar este painel da janela (a aba continua aberta)')}
                aria-label={t('Tirar este painel da janela')}
              >
                <CloseIcon />
              </button>
            </div>
          )}
          <SessionPane
            sessionId={tab.sessionId}
            snapshot={sessions}
            onClose={() => window.wisp.tabs.close(id)}
          />
        </section>
      )
    }
    return (
      <Pane
        key={id}
        conversation={id}
        state={conversations.get(id) ?? initialState}
        index={index}
        focused={focused}
        split={split}
        title={tab.title}
        mood={mood}
        sound={sound}
        onToggleSound={toggleSound}
        clip={focused ? clip : null}
        onClipDone={() => setClip(null)}
        voice={focused ? voice : { state: 'idle' }}
        bus={bus}
        demo={demo}
        agenda={agendaNext}
        onSent={onSent(id)}
      />
    )
  }

  // As ações da paleta, para a aba em foco (refeitas se algo muda com ela aberta).
  const actions = useMemo((): PaletteItem[] => {
    if (!palette) return []
    const focusedTab = tabs.panes[tabs.focused] ?? null
    const conversation =
      tabs.tabs.find((tab) => tab.id === focusedTab)?.kind === 'chat' ? focusedTab : null
    const state = conversation ? conversations.get(conversation) : undefined
    return paletteActions({
      conversation,
      state: state ? { mode: state.mode, provider: state.provider, view: state.view } : null,
      tabs: tabs.tabs,
      focusedTab,
      settings,
      sessions: sessions?.sessions ?? [],
      sound: sound?.enabled ?? null,
      canSplit: tabs.panes.length < MAX_PANES,
      setView,
      find: (id) => {
        setView('chat')
        bus.emit(id, { type: 'find' })
      },
      exportMarkdown: (id) => void exportConversation(id),
      toggleSound: () => {
        if (sound) toggleSound(sound)
      },
      usePrompt: (id, name) => {
        setView('chat')
        bus.emit(id, { type: 'prompt', name })
      },
      notice: (text, warning = false) => {
        if (!conversation) return
        apply(conversation, {
          type: 'events',
          events: [{ type: 'notice', level: warning ? 'warning' : 'info', text }]
        })
      }
    })
  }, [
    palette,
    tabs,
    conversations,
    settings,
    sessions,
    sound,
    bus,
    exportConversation,
    toggleSound,
    apply
  ])
  const closePalette = useCallback(
    (ran: boolean): void => {
      setPalette(false)
      // Sem fazer nada, a caixa de texto volta a ter o foco.
      if (ran) return
      const conversation = focusedConversation()
      if (conversation) bus.emit(conversation, { type: 'focus' })
    },
    [bus, focusedConversation]
  )

  return (
    <AvatarContext.Provider value={settings?.values.avatar ?? DEFAULT_AVATAR}>
      <div className={`chat mood-${mood}${split ? ' split' : ''}`} ref={root}>
        {dragging && (
          <div className="drop-overlay" aria-hidden>
            <PaperclipIcon />
            <strong>{t('Solte para anexar')}</strong>
            <span>
              {t('Imagens, PDFs, textos… até')} {ATTACHMENT_LIMITS.maxBytes / 1024 / 1024}{' '}
              {t('MB cada')}
            </span>
          </div>
        )}
        <header className="header">
          {view !== 'chat' ? (
            <>
              <button
                type="button"
                className="icon-button"
                onClick={() => setView('chat')}
                title={t('Voltar para a conversa (Esc)')}
                aria-label={t('Voltar para a conversa')}
              >
                <BackIcon />
              </button>
              <div className="title">
                <strong>{VIEW_TITLES[view][0]}</strong>
                <span className="status">{VIEW_TITLES[view][1]}</span>
              </div>
            </>
          ) : (
            <>
              <Avatar size={26} mood={mood} />
              <div className="title">
                <strong>Wisp</strong>
                <span className={`status${focusedState?.busy ? ' busy' : ''}`}>
                  {focusedState ? statusText(focusedState) : t('sessão do terminal')}
                </span>
              </div>
            </>
          )}
          {demo && (
            <button
              type="button"
              className="demo-pill"
              onClick={() => void window.wisp.settings.set({ demo: false })}
              title={t(
                'Modo demonstração: as respostas são gravadas, e nada roda de verdade. Clique para desligar.'
              )}
              aria-label={t('Modo demonstração (clique para desligar)')}
            >
              <DemoIcon />
              {t('Demo')}
            </button>
          )}
          {!demo &&
            (focusedState?.provider === 'openrouter' ? (
              <CostPill cost={focusedState.cost} />
            ) : (
              usage && <UsagePill usage={usage} />
            ))}
          <button
            type="button"
            className={`icon-button badge-host${view === 'sessions' ? ' active' : ''}`}
            onClick={() => setView((current) => (current === 'sessions' ? 'chat' : 'sessions'))}
            title={
              requests
                ? t('Sessões do terminal ({requests} {v2})', {
                    requests,
                    v2: requests === 1 ? t('pedido') : t('pedidos')
                  })
                : t('Sessões do Claude Code no terminal')
            }
            aria-label={t('Sessões do terminal')}
            aria-pressed={view === 'sessions'}
          >
            <TerminalIcon />
            {requests > 0 && <span className="badge">{requests}</span>}
          </button>
          <button
            type="button"
            className={`icon-button${view === 'history' ? ' active' : ''}`}
            onClick={() => setView((current) => (current === 'history' ? 'chat' : 'history'))}
            title={t('Conversas anteriores')}
            aria-label={t('Conversas anteriores')}
            aria-pressed={view === 'history'}
          >
            <HistoryIcon />
          </button>
          <button
            type="button"
            className={`icon-button${view === 'settings' ? ' active' : ''}`}
            onClick={() => setView((current) => (current === 'settings' ? 'chat' : 'settings'))}
            title={t('Configurações')}
            aria-label={t('Configurações')}
            aria-pressed={view === 'settings'}
          >
            <SettingsIcon />
          </button>
          {windowState.detached && !windowState.maximized && (
            <button
              type="button"
              className="icon-button window-dock"
              onClick={() => window.wisp.chat.dock()}
              title={t('Voltar para perto do mascote')}
              aria-label={t('Voltar para perto do mascote')}
            >
              <DockIcon />
            </button>
          )}
          <button
            type="button"
            className="icon-button window-maximize"
            onClick={() => window.wisp.chat.maximize()}
            title={windowState.maximized ? t('Restaurar') : t('Maximizar')}
            aria-label={windowState.maximized ? t('Restaurar') : t('Maximizar')}
          >
            {windowState.maximized ? <RestoreIcon /> : <MaximizeIcon />}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => window.wisp.chat.hide()}
            title={t('Fechar (Esc)')}
            aria-label={t('Fechar')}
          >
            <CloseIcon />
          </button>
        </header>

        {view === 'settings' ? (
          <SettingsView
            onDiagnostics={() => setView('diagnostics')}
            onWelcome={() => setView('welcome')}
          />
        ) : view === 'diagnostics' ? (
          <DiagnosticsView onSettings={() => setView('settings')} />
        ) : view === 'welcome' ? (
          <WelcomeView onDone={() => setView('chat')} onSettings={() => setView('settings')} />
        ) : view === 'history' ? (
          <HistoryView onClose={() => setView('chat')} />
        ) : view === 'sessions' ? (
          <SessionsView snapshot={sessions} onContinue={() => setView('chat')} />
        ) : (
          <>
            {tabs.tabs.length > 0 && (
              <TabBar state={tabs} statuses={statuses} onDragTab={setDraggingTab} />
            )}
            <PreviewBar />
            <div className="panes">
              <Grid layout={tabs.layout} renderPane={renderPane} draggingTab={draggingTab} />
            </div>
          </>
        )}
        {palette && <CommandPalette actions={actions} onClose={closePalette} />}
        <FileViewer />
        <MarkdownPreview />
      </div>
    </AvatarContext.Provider>
  )
}
