import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ClipboardEvent, JSX, KeyboardEvent } from 'react'
import type {
  AgendaItem,
  AttachmentPreview,
  ClipboardOffer,
  HistoryTarget,
  MascotState,
  SoundSettings,
  VoiceStatus
} from '../../shared/ipc'
import { AttachmentList } from './AttachmentList'
import { ClipboardChip } from './ClipboardChip'
import { Avatar, CloseIcon, MicIcon, SendIcon, SoundOffIcon, SoundOnIcon, StopIcon } from './icons'
import { ComposerMenu } from './ComposerMenu'
import { ContextPill } from './ContextPill'
import { ModelPill } from './ModelPill'
import { OpenRouterModelPill } from './OpenRouterModelPill'
import { ProviderPill } from './ProviderPill'
import { ModePill } from './ModePill'
import { nextMode } from './modes'
import type { PaneBus } from './paneBus'
import { requestTitle } from './describe-request'
import { matchCommands, slashQuery } from './slash'
import type { SlashCommand } from './slash'
import type { SavedPrompt } from '../../shared/prompts'
import { SlashMenu } from './SlashMenu'
import { FindBar } from './FindBar'
import { awaitingPermission, lastTurnStart } from './state'
import type { ChatState, Item } from './state'
import { Message } from './Message'
import { NextEvent } from './NextEvent'
import { TaskBar } from './TaskBar'
import { TerminalView } from './TerminalView'
import { ViewToggle } from './ViewToggle'
import { useAttachments } from './useAttachments'
import { t } from '../../shared/i18n'

/** Distância do fim (px) em que a lista ainda acompanha o texto que chega. */
const STICK_DISTANCE = 48
/** Quanto esperar o fim da digitação para guardar o rascunho (ms). */
const DRAFT_SAVE_MS = 400
/**
 * Quantos itens do fim da conversa ficam na página (Fase 23): numa conversa longa, o resto
 * espera o "Mostrar anteriores", de tantos em tantos. Buscando (Ctrl+F), ficam todos.
 */
const PAGE_ITEMS = 150

/**
 * O rascunho de cada conversa, enquanto o painel está aberto: a caixa de uma aba que sai da tela
 * e volta continua com o que tinha (o main guarda para a próxima abertura do Wisp).
 */
const drafts = new Map<string, string>()

/** O começo da resposta, em texto corrido, para o leitor de tela (sem a marcação do Markdown). */
function plainStart(markdown: string, max = 200): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' (código) ')
    .replace(/[#*_`>|~[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** O que dizer quando a resposta termina: o começo do último texto do Claude. */
function replyAnnouncement(items: Item[]): string {
  const from = lastTurnStart(items)
  for (let i = items.length - 1; i > from; i--) {
    const item = items[i]
    if (item.kind === 'text' && item.text.trim())
      return t('Resposta pronta: {v1}', { v1: plainStart(item.text) })
  }
  return t('O Claude terminou.')
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
  /** Modo demonstração: o painel vazio sugere o que pedir. */
  demo: boolean
  /** O próximo compromisso da agenda, para o painel vazio (null: nenhum). */
  agenda: AgendaItem | null
  /**
   * O usuário mandou uma mensagem: ela aparece na hora, sem esperar o main. `replace`: ela troca
   * a última (a edição), que sai com o que veio depois.
   */
  onSent: (text: string, attachments: AttachmentPreview[], replace?: boolean) => void
}

/** O que a demonstração sugere pedir (cada um tem uma resposta gravada). */
const DEMO_PROMPTS = [
  'O que você faz?',
  'Abre o Firefox',
  'Arruma o bug do contador',
  'Pesquisa a previsão do tempo',
  'Me lembra de beber água'
]

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
  demo,
  agenda,
  onSent
}: PaneProps): JSX.Element {
  const [draft, setDraft] = useState(() => drafts.get(conversation) ?? state.draft ?? '')
  // O rascunho guardado chega do main depois de o painel abrir: entra se a caixa está vazia.
  const [seenDraft, setSeenDraft] = useState(state.draft)
  if (state.draft !== seenDraft) {
    setSeenDraft(state.draft)
    if (!draft && state.draft) setDraft(state.draft)
  }
  // Editando a última mensagem (Fase 21): o que estava na caixa antes, para voltar se desistir.
  const [editing, setEditing] = useState<{ before: string; attachments: number } | null>(null)
  const [finding, setFinding] = useState(false)
  // Aberta pela busca do histórico (Fase 29): a mensagem onde a busca na conversa começa.
  const [findAt, setFindAt] = useState<{ target: HistoryTarget; seq: number } | null>(null)
  // O aviso para o leitor de tela (Fase 22): a resposta que terminou, o pedido que chegou.
  const [announcement, setAnnouncement] = useState('')
  const [seenBusy, setSeenBusy] = useState(state.busy)
  const waitingCard = state.items.find(
    (item): item is Extract<Item, { kind: 'permission' }> =>
      item.kind === 'permission' && item.status === 'pending'
  )
  const [seenCard, setSeenCard] = useState(waitingCard?.id ?? null)
  if (state.busy !== seenBusy) {
    setSeenBusy(state.busy)
    if (!state.busy && focused) setAnnouncement(replyAnnouncement(state.items))
  }
  if ((waitingCard?.id ?? null) !== seenCard) {
    setSeenCard(waitingCard?.id ?? null)
    if (waitingCard && focused) {
      setAnnouncement(
        t('O Claude pede: {v1}. Alt+P vai para o card.', { v1: requestTitle(waitingCard) })
      )
    }
  }
  const attachments = useAttachments()
  // O menu dos comandos com barra: o item escolhido e se foi fechado (Esc) para este texto.
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashClosed, setSlashClosed] = useState<string | null>(null)
  // Os prompts salvos (Fase 26), lidos de novo cada vez que a barra abre o menu.
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([])
  const slashTyped = draft.startsWith('/')
  useEffect(() => {
    if (!slashTyped) return
    let alive = true
    void window.wisp.prompts.list().then((list) => alive && setSavedPrompts(list))
    return () => {
      alive = false
    }
  }, [slashTyped])
  const [capturing, setCapturing] = useState(false)
  const root = useRef<HTMLElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const stick = useRef(true)
  // As páginas a mais de itens antigos à vista, e a distância do fim a manter ao mostrá-las.
  const [earlier, setEarlier] = useState(0)
  const keepFromBottom = useRef<number | null>(null)

  // O que a casca manda para esta conversa: ditado, anexos, arquivos soltos na janela.
  const { addPrepared, addDropped } = attachments
  const terminalView = state.view === 'terminal'
  const viewRef = useRef(state.view)
  viewRef.current = state.view

  // No terminal, arquivos e prints vão direto para a caixa do Claude Code, como caminhos.
  const { pending: pendingFiles, clear: clearFiles } = attachments
  useEffect(() => {
    if (!terminalView || !pendingFiles.length) return
    window.wisp.chat.send(
      conversation,
      '',
      pendingFiles.map(({ path, thumbnail }) => ({ path, thumbnail }))
    )
    clearFiles()
  }, [terminalView, pendingFiles, clearFiles, conversation])
  useEffect(
    () =>
      bus.on(conversation, (message) => {
        if (message.type === 'compose' && viewRef.current === 'terminal') {
          // No terminal, o ditado vai colado na caixa do Claude Code, para revisar e mandar.
          window.wisp.tui.input(conversation, `\x1b[200~${message.text}\x1b[201~`)
        } else if (message.type === 'compose') {
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
        } else if (message.type === 'find') {
          if (viewRef.current !== 'terminal') {
            setFinding(true)
            const target = message.target
            if (target) setFindAt((current) => ({ target, seq: (current?.seq ?? 0) + 1 }))
          }
        } else if (message.type === 'focus-card') {
          // Alt+P (Fase 22): o primeiro botão do card que espera resposta.
          const target = root.current?.querySelector<HTMLElement>(
            '.permission-pending :is(button, input, textarea):not(:disabled)'
          )
          if (target) target.focus()
          else setAnnouncement('Nenhum pedido esperando resposta.')
        } else if (!window.getSelection()?.toString()) {
          input.current?.focus()
        }
      }),
    [bus, conversation, addPrepared, addDropped]
  )

  // O rascunho: na hora para a aba que sai da tela e volta, e no main (para a próxima abertura
  // do Wisp) depois de parar de digitar. Editando a última mensagem, a caixa não é rascunho.
  useEffect(() => {
    if (editing) return
    drafts.set(conversation, draft)
    const timer = window.setTimeout(
      () => window.wisp.chat.saveDraft(conversation, draft),
      DRAFT_SAVE_MS
    )
    return () => window.clearTimeout(timer)
  }, [draft, conversation, editing])
  // O painel saiu da tela no meio da digitação: o main fica com o último rascunho.
  useEffect(
    () => () => window.wisp.chat.saveDraft(conversation, drafts.get(conversation) ?? ''),
    [conversation]
  )

  // Ganhou o foco (clique, troca de aba): a caixa de texto recebe o cursor.
  useEffect(() => {
    if (focused && !terminalView && !window.getSelection()?.toString()) input.current?.focus()
  }, [focused, terminalView])

  // Uma conversa recomeçada (Ctrl+K) volta a acompanhar o fim.
  const first = state.items[0]
  useEffect(() => {
    if (!first) stick.current = true
  }, [first])

  // Os itens antigos apareceram em cima: a parte que estava à vista continua no mesmo lugar.
  useLayoutEffect(() => {
    const el = list.current
    if (!el || keepFromBottom.current === null) return
    el.scrollTop = el.scrollHeight - keepFromBottom.current
    keepFromBottom.current = null
  }, [earlier])

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
  const query = slashQuery(draft)
  const slashCommands =
    query !== null && slashClosed !== draft && !demo
      ? matchCommands(query, state.commands, savedPrompts)
      : []
  const slashOpen = slashCommands.length > 0

  /**
   * Completa o comando escolhido no menu (o texto continua na caixa, para os argumentos). Um
   * prompt salvo vira o texto dele, com as variáveis preenchidas, para revisar e mandar.
   */
  function pickCommand(command: SlashCommand): void {
    setSlashIndex(0)
    input.current?.focus()
    if (!command.prompt) return setDraft(`/${command.name} `)
    void window.wisp.prompts.expand(conversation, command.name).then((text) => {
      if (text !== null) setDraft(text)
    })
  }

  /** Os comandos que o Wisp atende sozinho; true se era um deles. */
  function runWispCommand(text: string): boolean {
    // Um prompt salvo mandado pelo nome (/nome, sem o menu): vira o texto, para revisar.
    const saved = /^\/([a-z0-9-]+)$/.exec(text.trim())
    if (saved && savedPrompts.some((prompt) => prompt.name === saved[1])) {
      pickCommand({ name: saved[1], description: '', prompt: true })
      return true
    }
    const match = /^\/(compact|clear)(?:\s+([\s\S]*))?$/.exec(text)
    if (!match || attachments.pending.length) return false
    if (match[1] === 'compact') window.wisp.chat.compact(conversation, match[2]?.trim() ?? '')
    else window.wisp.chat.newConversation(conversation)
    setDraft('')
    return true
  }

  // A última mensagem dá para editar com o Claude parado, no chat (no terminal, o Esc Esc dele).
  const editIndex = !state.busy && !terminalView && !demo ? lastTurnStart(state.items) : -1
  // Só o fim de uma conversa longa fica na página (Fase 23).
  const hiddenItems = finding ? 0 : Math.max(0, state.items.length - PAGE_ITEMS * (earlier + 1))

  /** Mais uma página de itens antigos, sem a conversa pular na tela. */
  function showEarlier(): void {
    const el = list.current
    if (el) keepFromBottom.current = el.scrollHeight - el.scrollTop
    stick.current = false
    setEarlier((count) => count + 1)
  }

  function startEdit(): void {
    const item = state.items[editIndex]
    if (!item || item.kind !== 'user') return
    setEditing({ before: draft, attachments: item.attachments.length })
    setDraft(item.text)
    requestAnimationFrame(() => {
      const box = input.current
      if (!box) return
      box.focus()
      box.setSelectionRange(box.value.length, box.value.length)
    })
  }

  function cancelEdit(): void {
    if (!editing) return
    setDraft(editing.before)
    setEditing(null)
    input.current?.focus()
  }

  /** Manda a mensagem editada no lugar da última; o main volta a conversa no Claude Code. */
  async function sendEdit(): Promise<void> {
    if (!editing) return
    const text = draft.trim()
    const files = attachments.pending
    const ok = await window.wisp.chat.editLast(
      conversation,
      text,
      files.map(({ path, thumbnail }) => ({ path, thumbnail }))
    )
    if (!ok) return
    onSent(
      text,
      files.map(({ name, size, thumbnail }) => ({ name, size, thumbnail })),
      true
    )
    setDraft(editing.before)
    setEditing(null)
    attachments.clear()
    stick.current = true
  }

  function send(): void {
    if (!canSend) return
    if (editing) {
      void sendEdit()
      return
    }
    const text = draft.trim()
    if (runWispCommand(text)) return
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

  /** Manda um texto pronto (uma sugestão da demonstração). */
  function sendText(text: string): void {
    if (state.busy) return
    onSent(text, [])
    window.wisp.chat.send(conversation, text, [])
    stick.current = true
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (slashOpen) {
      const selected = Math.min(slashIndex, slashCommands.length - 1)
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        setSlashIndex((selected + step + slashCommands.length) % slashCommands.length)
        return
      }
      if (event.key === 'Tab' && !event.shiftKey) {
        event.preventDefault()
        pickCommand(slashCommands[selected])
        return
      }
      // Enter completa; se o nome já está inteiro, manda.
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        const command = slashCommands[selected]
        if (command.prompt || draft !== `/${command.name}`) {
          event.preventDefault()
          pickCommand(command)
          return
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setSlashClosed(draft)
        return
      }
    }
    if (event.key === 'Escape' && editing) {
      event.preventDefault()
      event.stopPropagation()
      cancelEdit()
      return
    }
    // ↑ na caixa vazia edita a última mensagem, como em outros chats.
    if (
      event.key === 'ArrowUp' &&
      !draft &&
      !attachments.pending.length &&
      !editing &&
      editIndex >= 0
    ) {
      event.preventDefault()
      startEdit()
      return
    }
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
  // Os cards esperando resposta, que no modo terminal aparecem por cima dele.
  const pendingCards = terminalView
    ? state.items.filter((item) => item.kind === 'permission' && item.status === 'pending')
    : []

  return (
    <section
      ref={root}
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
            title={t('Tirar este painel da janela (a aba continua aberta)')}
            aria-label={t('Tirar este painel da janela')}
          >
            <CloseIcon />
          </button>
        </div>
      )}
      {terminalView && (
        <div className="terminal-wrap">
          <TerminalView conversation={conversation} focused={focused} />
          {pendingCards.length > 0 && (
            <div className="terminal-cards">
              {pendingCards.map((item) => (
                <Message key={item.id} item={item} streaming={false} />
              ))}
            </div>
          )}
        </div>
      )}
      {finding && !terminalView && (
        <FindBar
          key={findAt?.seq ?? 0}
          root={list}
          target={findAt?.target}
          onClose={() => {
            setFinding(false)
            setFindAt(null)
            input.current?.focus()
          }}
        />
      )}
      <div className="sr-only" role="status" aria-live="polite" data-announce>
        {announcement}
      </div>
      <div
        className="messages"
        ref={list}
        onScroll={onScroll}
        hidden={terminalView}
        role="log"
        aria-label={t('Conversa')}
      >
        {/* Na demonstração, as sugestões ficam até a primeira pergunta (os avisos não as tiram). */}
        {(state.items.length === 0 || (demo && !started)) && (
          <div className="empty">
            <Avatar size={64} mood={mood} />
            <p className="hello">{t('Oi! Eu sou o Wisp.')}</p>
            {state.folder && (
              <p className="empty-folder">
                {t('Trabalhando em')} <code>{state.folder}</code>
                {t(
                  ', como o Claude Code no terminal: com o CLAUDE.md, as configurações e as skills deste projeto.'
                )}
              </p>
            )}
            {agenda && <NextEvent event={agenda} />}
            {demo ? (
              <>
                <p>
                  {t('Esta é a')} <strong>{t('demonstração')}</strong>
                  {t(
                    ': as respostas são gravadas, e nada roda de verdade no seu computador. Experimente:'
                  )}
                </p>
                <div className="demo-prompts">
                  {DEMO_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="demo-prompt"
                      onClick={() => sendText(prompt)}
                      disabled={state.busy}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p>
                {t(
                  'Pergunte qualquer coisa, arraste arquivos para cá ou cole uma imagem. Enter envia, Shift+Enter quebra a linha e Shift+Tab troca o modo de permissão.'
                )}
              </p>
            )}
          </div>
        )}
        {hiddenItems > 0 && (
          <button type="button" className="load-earlier" onClick={showEarlier}>
            {t('Mostrar anteriores (')}
            {hiddenItems})
          </button>
        )}
        {/* A lista só cresce (itens mudam no lugar), então a posição identifica o item. */}
        {state.items.slice(hiddenItems).map((item, index) => {
          const position = hiddenItems + index
          return (
            <Message
              key={`${item.kind}-${position}`}
              item={item}
              streaming={state.busy && item === last}
              onEdit={position === editIndex && !editing ? startEdit : undefined}
            />
          )
        })}
        {thinking && (
          <div className="thinking" aria-label={t('Pensando')}>
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
        {state.tasks.length > 0 && <TaskBar tasks={state.tasks} />}
        {editing && (
          <div className="edit-banner" role="status">
            <span>
              {t(
                'Editando a última mensagem: a resposta dela sai da conversa, e vem uma nova (os arquivos que ela mudou continuam como estão).'
              )}
              {editing.attachments > 0 &&
                t(' Os anexos dela não vão junto: anexe de novo se precisar.')}
            </span>
            <button type="button" className="link" onClick={cancelEdit}>
              {t('Cancelar')}
            </button>
          </div>
        )}
        {slashOpen && (
          <SlashMenu
            commands={slashCommands}
            selected={Math.min(slashIndex, slashCommands.length - 1)}
            onPick={pickCommand}
          />
        )}
        <div className="composer-meta-wrap">
          <div className="composer-meta">
            {!demo && (
              <ViewToggle
                view={state.view}
                busy={state.busy}
                onPick={(view) => window.wisp.chat.setView(conversation, view)}
              />
            )}
            <ProviderPill
              provider={state.provider}
              onPick={(provider) => window.wisp.chat.setProvider(conversation, provider)}
            />
            {state.model &&
              (state.provider === 'openrouter' ? (
                <OpenRouterModelPill
                  choice={state.model.choice}
                  onPick={(model) => window.wisp.chat.setModel(conversation, model)}
                />
              ) : (
                <ModelPill
                  choice={state.model.choice}
                  active={state.model.active}
                  onPick={(model) => window.wisp.chat.setModel(conversation, model)}
                />
              ))}
            {state.context && !demo && (
              <ContextPill
                context={state.context}
                busy={state.busy}
                onCompact={(instructions) => window.wisp.chat.compact(conversation, instructions)}
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
                    ? t('Ouvindo… solte o atalho')
                    : t('Ouvindo… (Esc desiste)')
                  : voice.state === 'transcribing'
                    ? t('Entendendo…')
                    : t('Falando… (Esc para)')}
              </span>
            )}
            {sound && (
              <button
                type="button"
                className={`icon-button sound-toggle${sound.enabled ? '' : ' off'}`}
                onClick={() => onToggleSound(sound)}
                title={sound.enabled ? t('Desligar os sons (Ctrl+M)') : t('Ligar os sons (Ctrl+M)')}
                aria-label={sound.enabled ? t('Desligar os sons') : t('Ligar os sons')}
                aria-pressed={!sound.enabled}
              >
                {sound.enabled ? <SoundOnIcon /> : <SoundOffIcon />}
              </button>
            )}
          </div>
        </div>
        <div className="composer-row">
          <ComposerMenu
            onAttach={() => picker.current?.click()}
            onCapture={() => void captureScreen()}
            capturing={capturing}
          />
          <button
            type="button"
            className={`icon-button attach mic ${voice.state}`}
            onClick={() => window.wisp.voice.toggle()}
            disabled={voice.state === 'transcribing'}
            title={
              voice.state === 'listening'
                ? t('Parar de ouvir e usar o que eu ouvi')
                : t('Falar (o texto vem para a caixa)')
            }
            aria-label={voice.state === 'listening' ? t('Parar de ouvir') : t('Falar')}
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
          {terminalView && (
            <span className="terminal-hint">
              {t('Digite no terminal. Arquivos, prints e a voz entram na caixa dele.')}
            </span>
          )}
          <textarea
            ref={input}
            hidden={terminalView}
            rows={1}
            value={draft}
            placeholder={
              state.busy
                ? t('Mande mais instruções: o Claude recebe sem parar…')
                : started
                  ? t('Continuar a conversa…')
                  : t('Pergunte ao Wisp…')
            }
            autoFocus={focused}
            onChange={(event) => {
              setDraft(event.target.value)
              setSlashIndex(0)
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
          />
          {state.busy && (
            <button
              type="button"
              className="icon-button stop"
              onClick={() => window.wisp.chat.stop(conversation)}
              title={t('Parar')}
              aria-label={t('Parar')}
            >
              <StopIcon />
            </button>
          )}
          {!terminalView && (!state.busy || canSend) && (
            <button
              type="submit"
              className="icon-button send"
              disabled={!canSend}
              title={
                state.busy
                  ? t('Mandar agora: o Claude recebe na próxima pausa (Enter)')
                  : t('Enviar (Enter)')
              }
              aria-label={t('Enviar')}
            >
              <SendIcon />
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
