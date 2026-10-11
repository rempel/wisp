import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ClipboardEvent, JSX, KeyboardEvent } from 'react'
import type {
  AttachmentPreview,
  ClipboardOffer,
  MascotState,
  SoundSettings,
  VoiceStatus
} from '../../shared/ipc'
import { AttachmentList } from './AttachmentList'
import { ClipboardChip } from './ClipboardChip'
import {
  Avatar,
  CloseIcon,
  MicIcon,
  PaperclipIcon,
  ScreenshotIcon,
  SendIcon,
  SoundOffIcon,
  SoundOnIcon,
  StopIcon
} from './icons'
import { Markdown } from './Markdown'
import { ModelPill } from './ModelPill'
import { ModePill } from './ModePill'
import { nextMode } from './modes'
import type { PaneBus } from './paneBus'
import { PermissionCard } from './PermissionCard'
import { QuestionCard } from './QuestionCard'
import { awaitingPermission } from './state'
import type { ChatState, Item } from './state'
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
          {item.text && (
            <div className={`msg user${item.voice ? ' spoken' : ''}`}>
              {item.voice && (
                <span className="voice-badge" title="Falado">
                  <MicIcon />
                </span>
              )}
              {item.text}
            </div>
          )}
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

export interface PaneProps {
  /** A conversa desta aba. */
  conversation: string
  state: ChatState
  /** Posição do painel na janela (da esquerda para a direita). */
  index: number
  focused: boolean
  /** A janela está dividida: o painel ganha um cabeçalho com o título e o fechar. */
  split: boolean
  title: string
  /** O humor do mascote (o avatar da conversa vazia). */
  mood: MascotState
  sound: SoundSettings | null
  onToggleSound: (current: SoundSettings) => void
  /** O chip "usar o que você copiou" (só no painel em foco). */
  clip: ClipboardOffer | null
  onClipDone: () => void
  /** A voz (só no painel em foco o microfone mostra que ouve). */
  voice: VoiceStatus
  bus: PaneBus
  /** O usuário mandou uma mensagem: ela aparece na hora, sem esperar o main. */
  onSent: (text: string, attachments: AttachmentPreview[]) => void
}

/** Uma conversa: as mensagens, os cards e a caixa de texto com anexos, microfone e pílulas. */
export function Pane({
  conversation,
  state,
  index,
  focused,
  split,
  title,
  mood,
  sound,
  onToggleSound,
  clip,
  onClipDone,
  voice,
  bus,
  onSent
}: PaneProps): JSX.Element {
  const [draft, setDraft] = useState('')
  const attachments = useAttachments()
  const [capturing, setCapturing] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const stick = useRef(true)

  // O que a casca manda para esta conversa: ditado, anexos, arquivos soltos na janela.
  const { addPrepared, addDropped } = attachments
  useEffect(
    () =>
      bus.on(conversation, (message) => {
        if (message.type === 'compose') {
          setDraft((current) =>
            current && !/\s$/.test(current) ? `${current} ${message.text}` : current + message.text
          )
          requestAnimationFrame(() => {
            const box = input.current
            if (!box) return
            box.focus()
            box.setSelectionRange(box.value.length, box.value.length)
          })
        } else if (message.type === 'attach') {
          addPrepared(message.dropped)
          input.current?.focus()
        } else if (message.type === 'drop') {
          addDropped(message.data)
          input.current?.focus()
        } else if (!window.getSelection()?.toString()) {
          input.current?.focus()
        }
      }),
    [bus, conversation, addPrepared, addDropped]
  )

  // Ganhou o foco (clique, troca de aba): a caixa de texto recebe o cursor.
  useEffect(() => {
    if (focused && !window.getSelection()?.toString()) input.current?.focus()
  }, [focused])

  // Uma conversa recomeçada (Ctrl+K) volta a acompanhar o fim.
  const first = state.items[0]
  useEffect(() => {
    if (!first) stick.current = true
  }, [first])

  // Acompanha o fim da conversa, a menos que o usuário tenha subido para ler.
  useLayoutEffect(() => {
    const el = list.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [state.items, state.busy])

  // Quando a resposta termina, o foco volta para a caixa de texto (se não estiver em outro campo).
  const wasBusy = useRef(false)
  useEffect(() => {
    if (wasBusy.current && !state.busy && focused && document.hasFocus()) {
      const active = document.activeElement
      if (!active || active === document.body || active instanceof HTMLButtonElement) {
        input.current?.focus()
      }
    }
    wasBusy.current = state.busy
  }, [state.busy, focused])

  function onScroll(): void {
    const el = list.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_DISTANCE
  }

  const canSend = draft.trim() !== '' || attachments.pending.length > 0

  function send(): void {
    if (!canSend || state.busy) return
    const text = draft.trim()
    const files = attachments.pending
    onSent(
      text,
      files.map(({ name, size, thumbnail }) => ({ name, size, thumbnail }))
    )
    window.wisp.chat.send(
      conversation,
      text,
      files.map(({ path, thumbnail }) => ({ path, thumbnail }))
    )
    setDraft('')
    attachments.clear()
    // O chip ignorado sai; volta se outra coisa for copiada.
    if (clip) onClipDone()
    stick.current = true
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send()
    } else if (event.key === 'Tab' && event.shiftKey && !event.ctrlKey && !event.altKey) {
      // Shift+Tab troca o modo de permissão, como no Claude Code do terminal.
      event.preventDefault()
      window.wisp.chat.setMode(conversation, nextMode(state.mode))
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
    onClipDone()
    const result = await window.wisp.chat.takeClipboard(offer.id)
    if ('text' in result) insertText(result.text)
    else if ('attachment' in result)
      attachments.addPrepared({ files: [result.attachment], problems: [] })
    else attachments.addPrepared({ files: [], problems: [result.error] })
    input.current?.focus()
  }

  function dismissClip(offer: ClipboardOffer): void {
    onClipDone()
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

  const last = state.items[state.items.length - 1]
  // "Pensando" enquanto ainda não há texto, ferramenta rodando ou pedido de permissão na tela.
  const thinking =
    state.busy &&
    last?.kind !== 'text' &&
    !(last?.kind === 'tool' && last.status === 'running') &&
    !awaitingPermission(state)
  const started = state.items.some((item) => item.kind === 'user')

  return (
    <section
      className={`pane${focused ? ' focused' : ''}`}
      data-conversation={conversation}
      onPointerDownCapture={() => {
        if (!focused) window.wisp.tabs.focus(index)
      }}
    >
      {split && (
        <div className="pane-head">
          <span className="pane-title" title={title}>
            {title}
          </span>
          <button
            type="button"
            className="icon-button pane-close"
            onClick={() => window.wisp.tabs.unsplit(index)}
            title="Tirar este painel da janela (a aba continua aberta)"
            aria-label="Tirar este painel da janela"
          >
            <CloseIcon />
          </button>
        </div>
      )}
      <div className="messages" ref={list} onScroll={onScroll}>
        {state.items.length === 0 ? (
          <div className="empty">
            <Avatar size={64} mood={mood} />
            <p className="hello">Oi! Eu sou o Wisp.</p>
            <p>
              Pergunte qualquer coisa, arraste arquivos para cá ou cole uma imagem. Enter envia,
              Shift+Enter quebra a linha e Shift+Tab troca o modo de permissão.
            </p>
          </div>
        ) : (
          // A lista só cresce (itens mudam no lugar), então a posição identifica o item.
          state.items.map((item, position) => (
            <Message
              key={`${item.kind}-${position}`}
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
        {clip && focused && (
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
          {state.model && (
            <ModelPill
              choice={state.model.choice}
              active={state.model.active}
              onPick={(model) => window.wisp.chat.setModel(conversation, model)}
            />
          )}
          <ModePill
            mode={state.mode}
            onPick={(mode) => window.wisp.chat.setMode(conversation, mode)}
          />
          {voice.state !== 'idle' && (
            <span className={`voice-hint ${voice.state}`} role="status">
              {voice.state === 'listening'
                ? voice.holding
                  ? 'Ouvindo… solte o atalho'
                  : 'Ouvindo… (Esc desiste)'
                : voice.state === 'transcribing'
                  ? 'Entendendo…'
                  : 'Falando… (Esc para)'}
            </span>
          )}
          {sound && (
            <button
              type="button"
              className={`icon-button sound-toggle${sound.enabled ? '' : ' off'}`}
              onClick={() => onToggleSound(sound)}
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
          <button
            type="button"
            className={`icon-button attach mic ${voice.state}`}
            onClick={() => window.wisp.voice.toggle()}
            disabled={voice.state === 'transcribing'}
            title={
              voice.state === 'listening'
                ? 'Parar de ouvir e usar o que eu ouvi'
                : 'Falar (o texto vem para a caixa)'
            }
            aria-label={voice.state === 'listening' ? 'Parar de ouvir' : 'Falar'}
            aria-pressed={voice.state === 'listening'}
          >
            {voice.state === 'transcribing' ? <span className="spinner" /> : <MicIcon />}
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
            autoFocus={focused}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
          />
          {state.busy ? (
            <button
              type="button"
              className="icon-button stop"
              onClick={() => window.wisp.chat.stop(conversation)}
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
    </section>
  )
}
