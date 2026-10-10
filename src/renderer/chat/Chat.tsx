import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import type { ClipboardEvent, JSX, KeyboardEvent } from 'react'
import { ATTACHMENT_LIMITS } from '../../shared/ipc'
import type { ChatEvent, MascotState } from '../../shared/ipc'
import { AttachmentList } from './AttachmentList'
import { HistoryView } from './HistoryView'
import {
  Avatar,
  BackIcon,
  CloseIcon,
  HistoryIcon,
  PaperclipIcon,
  PlusIcon,
  SendIcon,
  StopIcon
} from './icons'
import { Markdown } from './Markdown'
import { ModelPill } from './ModelPill'
import { PermissionCard } from './PermissionCard'
import { QuestionCard } from './QuestionCard'
import { awaitingPermission, initialState, reducer, statusText } from './state'
import type { Item } from './state'
import { ToolCard } from './ToolCard'
import { UsagePill } from './UsagePill'
import { useAttachments } from './useAttachments'

/** Distância do fim (px) em que a lista ainda acompanha o texto que chega. */
const STICK_DISTANCE = 48

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
  const [view, setView] = useState<'chat' | 'history'>('chat')
  const [mood, setMood] = useState<MascotState>('idle')
  const attachments = useAttachments()
  const [dragging, setDragging] = useState(false)
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
    const offShown = window.wisp.chat.onShown(() => {
      if (!reducedMotion.matches) {
        root.current?.animate(SHOW_KEYFRAMES, {
          duration: 360,
          easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)'
        })
      }
    })
    return () => {
      offMood()
      offShown()
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

  // Esc fecha (ou volta do histórico); Ctrl+K começa uma conversa nova; voltar ao painel devolve
  // o foco para a caixa de texto (se não houver seleção).
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (viewRef.current === 'history') setView('chat')
        else window.wisp.chat.hide()
      } else if (event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        window.wisp.chat.newConversation()
        setView('chat')
        input.current?.focus()
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
    const files = Array.from(event.clipboardData.files)
    if (!files.length) return
    event.preventDefault()
    void attachments.addPasted(files)
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
        {view === 'history' ? (
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
              <strong>Conversas</strong>
              <span className="status">guardadas neste computador</span>
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
            {attachments.pending.length > 0 && (
              <AttachmentList items={attachments.pending} onRemove={attachments.remove} />
            )}
            {attachments.error && (
              <div className="attach-error" role="alert">
                {attachments.error}
              </div>
            )}
            {state.model && (
              <div className="composer-meta">
                <ModelPill choice={state.model.choice} active={state.model.active} />
              </div>
            )}
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
