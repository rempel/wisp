import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import type { ClipboardEvent, JSX, KeyboardEvent } from 'react'
import { ATTACHMENT_LIMITS } from '../../shared/ipc'
import type { ChatEvent, ClipboardOffer, MascotState, SoundSettings } from '../../shared/ipc'
import { AttachmentList } from './AttachmentList'
import { ClipboardChip } from './ClipboardChip'
import { HistoryView } from './HistoryView'
import {
  Avatar,
  BackIcon,
  CloseIcon,
  HistoryIcon,
  PaperclipIcon,
  PlusIcon,
  ScreenshotIcon,
  SendIcon,
  SoundOffIcon,
  SoundOnIcon,
  StopIcon,
  TerminalIcon
} from './icons'
import { Markdown } from './Markdown'
import { ModelPill } from './ModelPill'
import { PermissionCard } from './PermissionCard'
import { QuestionCard } from './QuestionCard'
import { SessionsView } from './SessionsView'
import { awaitingPermission, initialState, reducer, statusText } from './state'
import type { Item } from './state'
import { ToolCard } from './ToolCard'
import { UsagePill } from './UsagePill'
import { useAttachments } from './useAttachments'
import { useSessions } from './useSessions'

/** Distância do fim (px) em que a lista ainda acompanha o texto que chega. */
const STICK_DISTANCE = 48
/** De quanto em quanto tempo (ms), no máximo, o painel avisa que o usuário está mexendo nele. */
const ACTIVITY_EVERY_MS = 20_000

/** A "mola" do painel quando ele aparece. */
const SHOW_KEYFRAMES: Keyframe[] = [
  { transform: 'translateY(10px) scale(0.97)', opacity: 0.4 },
  { transform: 'none', opacity: 1 }
]

function Message({ item, streaming }: { item: Item; streaming: boolean }): JSX.Element {
  switch (item.kind) {
    case 'user':
      return (
        <div className="user-turn">
          {item.attachments.length > 0 && <AttachmentList items={item.attachments} />}
          {item.text && <div className="msg user">{item.text}</div>}
        </div>
      )
    case 'text':
      return (
        <div className={`msg assistant${streaming ? ' streaming' : ''}`}>
          <Markdown text={item.text} />
        </div>
      )
    case 'tool':
      return <ToolCard tool={item} />
    case 'notice':
      return (
        <div className={`notice notice-${item.level}`}>
          <Markdown text={item.text} />
        </div>
      )
    case 'permission':
      return item.toolName === 'AskUserQuestion' ? (
        <QuestionCard
          request={item}
          onAnswer={(answers) => window.wisp.chat.answerQuestion(item.id, answers)}
        />
      ) : (
        <PermissionCard
          request={item}
          onAnswer={(decision) => window.wisp.chat.answerPermission(item.id, decision)}
        />
      )
  }
}

export default function Chat(): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [draft, setDraft] = useState('')
  const [view, setView] = useState<'chat' | 'history' | 'sessions'>('chat')
  const sessions = useSessions()
  const requests = sessions?.sessions.reduce((sum, item) => sum + item.requests.length, 0) ?? 0
  const [mood, setMood] = useState<MascotState>('idle')
  const [sound, setSound] = useState<SoundSettings | null>(null)
  const attachments = useAttachments()
  const [dragging, setDragging] = useState(false)
  // O chip "usar o que você copiou" e o print da tela em andamento.
  const [clip, setClip] = useState<ClipboardOffer | null>(null)
  const [capturing, setCapturing] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const stick = useRef(true)
  // A vista atual, para os atalhos de teclado registrados uma vez só.
  const viewRef = useRef(view)
  useEffect(() => {
    viewRef.current = view
  }, [view])

  // O humor do mascote (o avatar acompanha) e a animação de abertura. Antes do ready(), para o
  // main já encontrar quem ouve.
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const offMood = window.wisp.chat.onMood(setMood)
    const offClipboard = window.wisp.chat.onClipboard(setClip)
    const offSessions = window.wisp.sessions.onShow(() => setView('sessions'))
    const offShown = window.wisp.chat.onShown(() => {
      if (!reducedMotion.matches) {
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
      offShown()
      offSessions()
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCopy)
    }
  }, [])

  // Os sons (o botão de mudo) e os arquivos soltos no mascote, que viram anexos aqui.
  const { addPrepared } = attachments
  useEffect(() => {
    let alive = true
    void window.wisp.sound.get().then((settings) => {
      if (alive && settings) setSound(settings)
    })
    const offSound = window.wisp.sound.onChanged(setSound)
    const offAttach = window.wisp.chat.onAttach((dropped) => {
      addPrepared(dropped)
      setView('chat')
      input.current?.focus()
    })
    return () => {
      alive = false
      offSound()
      offAttach()
    }
  }, [addPrepared])

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

  // Eventos do main. Os que chegam no mesmo quadro viram um render só.
  useEffect(() => {
    let queued: ChatEvent[] = []
    let frame = 0
    const off = window.wisp.chat.onEvent((event) => {
      if (event.type === 'reset') stick.current = true
      queued.push(event)
      frame ||= requestAnimationFrame(() => {
        const events = queued
        queued = []
        frame = 0
        dispatch({ type: 'events', events })
      })
    })
    window.wisp.chat.ready()
    return () => {
      off()
      cancelAnimationFrame(frame)
    }
  }, [])

  // Esc fecha (ou volta do histórico); Ctrl+K começa uma conversa nova; Ctrl+M liga e desliga os
  // sons; voltar ao painel devolve o foco para a caixa de texto (se não houver seleção).
  const soundRef = useRef(sound)
  useEffect(() => {
    soundRef.current = sound
  }, [sound])
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      const ctrl = event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey
      if (event.key === 'Escape') {
        if (viewRef.current !== 'chat') setView('chat')
        else window.wisp.chat.hide()
      } else if (ctrl && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        window.wisp.chat.newConversation()
        setView('chat')
        input.current?.focus()
      } else if (ctrl && event.key.toLowerCase() === 'm') {
        event.preventDefault()
        const current = soundRef.current
        if (current) toggleSound(current)
      }
    }
    const onFocus = (): void => {
      if (!window.getSelection()?.toString()) input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  // Arquivos arrastados para qualquer ponto do painel viram anexos. Sem o preventDefault, soltar
  // um arquivo faria a janela navegar até ele.
  const { addDropped } = attachments
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
      addDropped(event.dataTransfer)
      setView('chat')
      input.current?.focus()
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
  }, [addDropped])

  // Acompanha o fim da conversa, a menos que o usuário tenha subido para ler.
  useLayoutEffect(() => {
    const el = list.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [state.items, state.busy, view])

  // Quando a resposta termina, o foco volta para a caixa de texto (se não estiver em outro campo).
  const wasBusy = useRef(false)
  useEffect(() => {
    if (wasBusy.current && !state.busy && document.hasFocus()) {
      const active = document.activeElement
      if (!active || active === document.body || active instanceof HTMLButtonElement) {
        input.current?.focus()
      }
    }
    wasBusy.current = state.busy
  }, [state.busy])

  function onScroll(): void {
    const el = list.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_DISTANCE
  }

  const canSend = draft.trim() !== '' || attachments.pending.length > 0

  function send(): void {
    if (!canSend || state.busy) return
    const text = draft.trim()
    const files = attachments.pending
    dispatch({
      type: 'user-message',
      text,
      attachments: files.map(({ name, size, thumbnail }) => ({ name, size, thumbnail }))
    })
    window.wisp.chat.send(
      text,
      files.map(({ path, thumbnail }) => ({ path, thumbnail }))
    )
    setDraft('')
    attachments.clear()
    // O chip ignorado sai; volta se outra coisa for copiada.
    setClip(null)
    stick.current = true
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send()
    }
  }

  // Imagem copiada (um print, por exemplo) vira anexo; texto cola normalmente.
  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>): void {
    // Colar é usar o que o chip oferecia.
    if (clip) dismissClip(clip)
    const files = Array.from(event.clipboardData.files)
    if (!files.length) return
    event.preventDefault()
    void attachments.addPasted(files)
  }

  /** Põe o texto onde está o cursor da caixa de texto, como uma colagem. */
  function insertText(text: string): void {
    const box = input.current
    const start = box?.selectionStart ?? draft.length
    const end = box?.selectionEnd ?? draft.length
    setDraft((current) => current.slice(0, start) + text + current.slice(end))
    requestAnimationFrame(() => {
      box?.focus()
      box?.setSelectionRange(start + text.length, start + text.length)
    })
  }

  async function takeClip(offer: ClipboardOffer): Promise<void> {
    setClip(null)
    const result = await window.wisp.chat.takeClipboard(offer.id)
    if ('text' in result) insertText(result.text)
    else if ('attachment' in result)
      attachments.addPrepared({ files: [result.attachment], problems: [] })
    else attachments.addPrepared({ files: [], problems: [result.error] })
    input.current?.focus()
  }

  function dismissClip(offer: ClipboardOffer): void {
    setClip(null)
    window.wisp.chat.dismissClipboard(offer.id)
  }

  /** Print da tela como anexo: o painel some, a tela é capturada e ele volta com o print. */
  async function captureScreen(): Promise<void> {
    if (capturing) return
    setCapturing(true)
    try {
      attachments.addPrepared(await window.wisp.chat.captureScreen())
    } finally {
      setCapturing(false)
      input.current?.focus()
    }
  }

  function toggleSound(current: SoundSettings): void {
    const next = { ...current, enabled: !current.enabled }
    setSound(next)
    window.wisp.sound.set(next.enabled)
  }

  function newConversation(): void {
    window.wisp.chat.newConversation()
    setView('chat')
    input.current?.focus()
  }

  const last = state.items[state.items.length - 1]
  // "Pensando" enquanto ainda não há texto, ferramenta rodando ou pedido de permissão na tela.
  const thinking =
    state.busy &&
    last?.kind !== 'text' &&
    !(last?.kind === 'tool' && last.status === 'running') &&
    !awaitingPermission(state)
  const started = state.items.some((item) => item.kind === 'user')

  return (
    <div className={`chat mood-${mood}`} ref={root}>
      {dragging && (
        <div className="drop-overlay" aria-hidden>
          <PaperclipIcon />
          <strong>Solte para anexar</strong>
          <span>Imagens, PDFs, textos… até {ATTACHMENT_LIMITS.maxBytes / 1024 / 1024} MB cada</span>
        </div>
      )}
      <header className="header">
        {view !== 'chat' ? (
          <>
            <button
              type="button"
              className="icon-button"
              onClick={() => setView('chat')}
              title="Voltar para a conversa (Esc)"
              aria-label="Voltar para a conversa"
            >
              <BackIcon />
            </button>
            <div className="title">
              <strong>{view === 'history' ? 'Conversas' : 'Sessões'}</strong>
              <span className="status">
                {view === 'history' ? 'guardadas neste computador' : 'do Claude Code no terminal'}
              </span>
            </div>
          </>
        ) : (
          <>
            <Avatar size={26} mood={mood} />
            <div className="title">
              <strong>Wisp</strong>
              <span className={`status${state.busy ? ' busy' : ''}`}>{statusText(state)}</span>
            </div>
          </>
        )}
        {state.usage && <UsagePill usage={state.usage} />}
        <button
          type="button"
          className={`icon-button badge-host${view === 'sessions' ? ' active' : ''}`}
          onClick={() => setView((current) => (current === 'sessions' ? 'chat' : 'sessions'))}
          title={
            requests
              ? `Sessões do terminal (${requests} ${requests === 1 ? 'pedido' : 'pedidos'})`
              : 'Sessões do Claude Code no terminal'
          }
          aria-label="Sessões do terminal"
          aria-pressed={view === 'sessions'}
        >
          <TerminalIcon />
          {requests > 0 && <span className="badge">{requests}</span>}
        </button>
        <button
          type="button"
          className={`icon-button${view === 'history' ? ' active' : ''}`}
          onClick={() => setView((current) => (current === 'history' ? 'chat' : 'history'))}
          title="Conversas anteriores"
          aria-label="Conversas anteriores"
          aria-pressed={view === 'history'}
        >
          <HistoryIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={newConversation}
          title="Nova conversa (Ctrl+K)"
          aria-label="Nova conversa"
        >
          <PlusIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => window.wisp.chat.hide()}
          title="Fechar (Esc)"
          aria-label="Fechar"
        >
          <CloseIcon />
        </button>
      </header>

      {view === 'history' ? (
        <HistoryView onClose={() => setView('chat')} />
      ) : view === 'sessions' ? (
        <SessionsView snapshot={sessions} onContinue={() => setView('chat')} />
      ) : (
        <>
          <div className="messages" ref={list} onScroll={onScroll}>
            {state.items.length === 0 ? (
              <div className="empty">
                <Avatar size={64} mood={mood} />
                <p className="hello">Oi! Eu sou o Wisp.</p>
                <p>
                  Pergunte qualquer coisa, arraste arquivos para cá ou cole uma imagem. Enter envia,
                  Shift+Enter quebra a linha.
                </p>
              </div>
            ) : (
              // A lista só cresce (itens mudam no lugar), então a posição identifica o item.
              state.items.map((item, index) => (
                <Message
                  key={`${item.kind}-${index}`}
                  item={item}
                  streaming={state.busy && item === last}
                />
              ))
            )}
            {thinking && (
              <div className="thinking" aria-label="Pensando">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>

          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault()
              send()
            }}
          >
            {clip && (
              <ClipboardChip
                offer={clip}
                onTake={() => void takeClip(clip)}
                onDismiss={() => dismissClip(clip)}
              />
            )}
            {attachments.pending.length > 0 && (
              <AttachmentList items={attachments.pending} onRemove={attachments.remove} />
            )}
            {attachments.error && (
              <div className="attach-error" role="alert">
                {attachments.error}
              </div>
            )}
            <div className="composer-meta">
              {state.model && <ModelPill choice={state.model.choice} active={state.model.active} />}
              {sound && (
                <button
                  type="button"
                  className={`icon-button sound-toggle${sound.enabled ? '' : ' off'}`}
                  onClick={() => toggleSound(sound)}
                  title={sound.enabled ? 'Desligar os sons (Ctrl+M)' : 'Ligar os sons (Ctrl+M)'}
                  aria-label={sound.enabled ? 'Desligar os sons' : 'Ligar os sons'}
                  aria-pressed={!sound.enabled}
                >
                  {sound.enabled ? <SoundOnIcon /> : <SoundOffIcon />}
                </button>
              )}
            </div>
            <div className="composer-row">
              <button
                type="button"
                className="icon-button attach"
                onClick={() => picker.current?.click()}
                title="Anexar arquivos (ou arraste para o painel, ou cole uma imagem)"
                aria-label="Anexar arquivos"
              >
                <PaperclipIcon />
              </button>
              <button
                type="button"
                className="icon-button attach"
                onClick={() => void captureScreen()}
                disabled={capturing}
                title="Anexar um print da tela (o painel sai da frente)"
                aria-label="Anexar um print da tela"
              >
                {capturing ? <span className="spinner" /> : <ScreenshotIcon />}
              </button>
              <input
                ref={picker}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                  void attachments.add(Array.from(event.target.files ?? []))
                  // Limpa para o mesmo arquivo poder ser escolhido de novo.
                  event.target.value = ''
                  input.current?.focus()
                }}
              />
              <textarea
                ref={input}
                rows={1}
                value={draft}
                placeholder={started ? 'Continuar a conversa…' : 'Pergunte ao Wisp…'}
                autoFocus
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
              />
              {state.busy ? (
                <button
                  type="button"
                  className="icon-button stop"
                  onClick={() => window.wisp.chat.stop()}
                  title="Parar"
                  aria-label="Parar"
                >
                  <StopIcon />
                </button>
              ) : (
                <button
                  type="submit"
                  className="icon-button send"
                  disabled={!canSend}
                  title="Enviar (Enter)"
                  aria-label="Enviar"
                >
                  <SendIcon />
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  )
}
