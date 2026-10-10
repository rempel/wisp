import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'
import type { ChatEvent } from '../../shared/ipc'
import { Avatar, CloseIcon, PlusIcon, SendIcon, StopIcon } from './icons'
import { Markdown } from './Markdown'
import { PermissionCard } from './PermissionCard'
import { awaitingPermission, initialState, reducer, statusText } from './state'
import type { Item } from './state'
import { ToolCard } from './ToolCard'

/** Distância do fim (px) em que a lista ainda acompanha o texto que chega. */
const STICK_DISTANCE = 48

function Message({ item, streaming }: { item: Item; streaming: boolean }): JSX.Element {
  switch (item.kind) {
    case 'user':
      return <div className="msg user">{item.text}</div>
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
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
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

  // Acompanha o fim da conversa, a menos que o usuário tenha subido para ler.
  useLayoutEffect(() => {
    const el = list.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [state.items, state.busy])

  function onScroll(): void {
    const el = list.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_DISTANCE
  }

  function send(): void {
    const text = draft.trim()
    if (!text || state.busy) return
    dispatch({ type: 'user-message', text })
    window.wisp.chat.send(text)
    setDraft('')
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
            <p>Pergunte qualquer coisa. Enter envia, Shift+Enter quebra a linha.</p>
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
            disabled={!draft.trim()}
            title="Enviar (Enter)"
            aria-label="Enviar"
          >
            <SendIcon />
          </button>
        )}
      </form>
    </div>
  )
}
