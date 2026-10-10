import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'
import { ATTACHMENT_LIMITS } from '../../shared/ipc'
import type { ChatEvent } from '../../shared/ipc'
import { AttachmentList } from './AttachmentList'
import { Avatar, CloseIcon, PaperclipIcon, PlusIcon, SendIcon, StopIcon } from './icons'
import { Markdown } from './Markdown'
import { PermissionCard } from './PermissionCard'
import { awaitingPermission, initialState, reducer, statusText } from './state'
import type { Item } from './state'
import { ToolCard } from './ToolCard'
import { useAttachments } from './useAttachments'

/** Distância do fim (px) em que a lista ainda acompanha o texto que chega. */
const STICK_DISTANCE = 48

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
      return (
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
  const attachments = useAttachments()
  const [dragging, setDragging] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const stick = useRef(true)

  // Eventos do main. Os que chegam no mesmo quadro viram um render só.
  useEffect(() => {
    let queued: ChatEvent[] = []
    let frame = 0
    const off = window.wisp.chat.onEvent((event) => {
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

  // Esc fecha; voltar ao painel devolve o foco para a caixa de texto (se não houver seleção).
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') window.wisp.chat.hide()
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
  }, [state.items, state.busy])

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
      files.map((file) => file.path)
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

  function newConversation(): void {
    window.wisp.chat.newConversation()
    input.current?.focus()
  }

  const last = state.items[state.items.length - 1]
  // "Pensando" enquanto ainda não há texto, ferramenta rodando ou pedido de permissão na tela.
  const thinking =
    state.busy &&
    last?.kind !== 'text' &&
    !(last?.kind === 'tool' && last.status === 'running') &&
    !awaitingPermission(state)

  return (
    <div className="chat">
      {dragging && (
        <div className="drop-overlay" aria-hidden>
          <PaperclipIcon />
          <strong>Solte para anexar</strong>
          <span>Imagens, PDFs, textos… até {ATTACHMENT_LIMITS.maxBytes / 1024 / 1024} MB cada</span>
        </div>
      )}
      <header className="header">
        <Avatar size={26} />
        <div className="title">
          <strong>Wisp</strong>
          <span className={`status${state.busy ? ' busy' : ''}`}>{statusText(state)}</span>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={newConversation}
          title="Nova conversa"
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

      <div className="messages" ref={list} onScroll={onScroll}>
        {state.items.length === 0 ? (
          <div className="empty">
            <Avatar size={64} />
            <p className="hello">Oi! Eu sou o Wisp.</p>
            <p>
              Pergunte qualquer coisa ou arraste arquivos para cá. Enter envia, Shift+Enter quebra a
              linha.
            </p>
          </div>
        ) : (
          state.items.map((item) => (
            <Message key={item.id} item={item} streaming={state.busy && item === last} />
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
        <div className="composer-row">
          <button
            type="button"
            className="icon-button attach"
            onClick={() => picker.current?.click()}
            title="Anexar arquivos (ou arraste para o painel)"
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
            placeholder="Pergunte ao Wisp…"
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
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
    </div>
  )
}
