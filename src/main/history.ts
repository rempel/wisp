import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
  unlinkSync
} from 'fs'
import { join } from 'path'
import type { AttachmentPreview, ChatEvent, ConversationSummary } from '../shared/ipc'
import { DATA_DIR } from './paths'

/**
 * ~/.local/share/wisp/conversas: o histórico, um arquivo JSONL por conversa. A primeira linha
 * descreve a conversa; as outras são os eventos dela, na ordem, como o chat os recebeu.
 *
 * O Claude Code também grava as sessões, mas num formato interno que muda entre versões. Aqui
 * fica o que o painel mostrou, para reabrir a conversa igual; o contexto do Claude volta com o
 * --resume.
 */
export const HISTORY_DIR = join(DATA_DIR, 'conversas')

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TITLE_MAX = 80
/** O bastante para a primeira linha, que só tem o título e as datas. */
const HEAD_BYTES = 4096

/** Primeira linha do arquivo. */
interface Header {
  type: 'conversa'
  v: 1
  id: string
  createdAt: number
  title: string
}

/** O Claude Code passou a usar outro session_id (raro); o --resume usa o último. */
interface SessionLine {
  type: 'sessao'
  sessionId: string
}

/** Eventos que entram no histórico. Os outros (ocupado, modelo, uso) só valem ao vivo. */
const KEPT = new Set<ChatEvent['type']>([
  'user',
  'text',
  'tool-start',
  'tool-input',
  'tool-result',
  'turn-end',
  'notice',
  'permission-request',
  'permission-resolved'
])

const isString = (value: unknown): value is string => typeof value === 'string'

/** Confere o formato de um evento lido do disco, para um arquivo estragado não quebrar o chat. */
function validEvent(value: unknown): value is ChatEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  if (!KEPT.has(event.type as ChatEvent['type'])) return false
  switch (event.type) {
    case 'user':
      return isString(event.text) && Array.isArray(event.attachments)
    case 'text':
      return isString(event.blockId) && isString(event.delta)
    case 'tool-start':
    case 'tool-input':
      return isString(event.id) && isString(event.name)
    case 'tool-result':
      return isString(event.id) && typeof event.isError === 'boolean' && isString(event.output)
    case 'turn-end':
      return isString(event.outcome)
    case 'notice':
      return isString(event.level) && isString(event.text)
    case 'permission-request':
      return isString(event.id) && isString(event.toolName)
    case 'permission-resolved':
      return isString(event.id) && isString(event.decision)
    default:
      return false
  }
}

/** Título da conversa: a primeira linha da primeira mensagem, ou os nomes dos anexos. */
export function titleOf(text: string, attachments: AttachmentPreview[]): string {
  const line = text.trim().split('\n')[0].replace(/\s+/g, ' ')
  const title = line || attachments.map((attachment) => attachment.name).join(', ')
  if (!title) return 'Conversa'
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1).trimEnd()}…` : title
}

function readHeader(file: string): Header | null {
  let fd: number | null = null
  try {
    fd = openSync(file, 'r')
    const buffer = Buffer.alloc(HEAD_BYTES)
    const bytes = readSync(fd, buffer, 0, HEAD_BYTES, 0)
    const first = buffer.toString('utf8', 0, bytes).split('\n')[0]
    const header = JSON.parse(first) as Partial<Header>
    if (header.type !== 'conversa' || !isString(header.id) || !isString(header.title)) return null
    if (typeof header.createdAt !== 'number') return null
    return header as Header
  } catch {
    return null
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

export interface SavedConversation {
  id: string
  /** Com que session_id retomar no Claude Code. */
  sessionId: string
  createdAt: number
  events: ChatEvent[]
}

/**
 * Grava a conversa aberta e lê as guardadas. O texto da resposta chega em pedacinhos; eles são
 * juntados num evento só por bloco antes de ir para o disco.
 */
export class History {
  private current: { id: string; sessionId: string; file: string } | null = null
  private text: { blockId: string; delta: string } | null = null
  private warned = false

  constructor(private readonly dir = HISTORY_DIR) {}

  /** A conversa sendo gravada, se houver. */
  currentId(): string | null {
    return this.current?.id ?? null
  }

  /** Uma mensagem do usuário. A primeira de uma conversa cria o arquivo dela. */
  user(sessionId: string, text: string, attachments: AttachmentPreview[]): void {
    if (!this.current) {
      this.start(sessionId, titleOf(text, attachments))
    } else if (this.current.sessionId !== sessionId) {
      this.current.sessionId = sessionId
      this.append({ type: 'sessao', sessionId } satisfies SessionLine)
    }
    this.record({ type: 'user', text, attachments })
  }

  /** Um evento da conversa aberta. Uma conversa nova ('reset') fecha a atual. */
  record(event: ChatEvent): void {
    if (event.type === 'reset') {
      this.flush()
      this.current = null
      return
    }
    if (!this.current || !KEPT.has(event.type)) return
    if (event.type === 'text') {
      if (this.text?.blockId === event.blockId) {
        this.text.delta += event.delta
        return
      }
      this.flush()
      this.text = { blockId: event.blockId, delta: event.delta }
      return
    }
    this.flush()
    this.append(event)
  }

  /** Grava o texto que ainda estava sendo juntado (o app está fechando). */
  flush(): void {
    if (!this.text) return
    const { blockId, delta } = this.text
    this.text = null
    this.append({ type: 'text', blockId, delta })
  }

  /** As conversas guardadas, da mais recente para a mais antiga. */
  list(): ConversationSummary[] {
    this.flush()
    let names: string[]
    try {
      names = readdirSync(this.dir)
    } catch {
      return []
    }
    const conversations: ConversationSummary[] = []
    for (const name of names) {
      const id = name.slice(0, -'.jsonl'.length)
      if (!name.endsWith('.jsonl') || !ID.test(id)) continue
      const file = join(this.dir, name)
      const header = readHeader(file)
      if (!header || header.id !== id) continue
      let updatedAt: number
      try {
        updatedAt = statSync(file).mtimeMs
      } catch {
        // Sumiu entre o readdir e agora.
        continue
      }
      conversations.push({
        id,
        title: header.title,
        createdAt: header.createdAt,
        updatedAt,
        current: id === this.current?.id
      })
    }
    return conversations.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** Lê uma conversa guardada; null se ela não existir ou não der para ler. */
  load(id: string): SavedConversation | null {
    if (!ID.test(id)) return null
    this.flush()
    let lines: string[]
    try {
      lines = readFileSync(this.file(id), 'utf8').split('\n')
    } catch {
      return null
    }
    let header: Header | null = null
    let sessionId = id
    const events: ChatEvent[] = []
    for (const line of lines) {
      if (!line.trim()) continue
      let value: unknown
      try {
        value = JSON.parse(line)
      } catch {
        // Uma linha cortada (o app caiu no meio da escrita): fica de fora.
        continue
      }
      const type = (value as { type?: unknown } | null)?.type
      if (type === 'conversa' && !header) header = value as Header
      else if (type === 'sessao' && isString((value as SessionLine).sessionId)) {
        sessionId = (value as SessionLine).sessionId
      } else if (validEvent(value)) events.push(value)
    }
    if (!header || header.id !== id) return null
    return { id, sessionId, createdAt: header.createdAt, events }
  }

  /** Continua gravando numa conversa reaberta do histórico. */
  continue(saved: SavedConversation): void {
    this.flush()
    this.current = { id: saved.id, sessionId: saved.sessionId, file: this.file(saved.id) }
  }

  /** Apaga uma conversa. Se for a aberta, ela para de ser gravada. */
  remove(id: string): boolean {
    if (!ID.test(id)) return false
    if (this.current?.id === id) {
      this.text = null
      this.current = null
    }
    try {
      unlinkSync(this.file(id))
      return true
    } catch {
      return false
    }
  }

  private file(id: string): string {
    return join(this.dir, `${id}.jsonl`)
  }

  private start(id: string, title: string): void {
    this.current = { id, sessionId: id, file: this.file(id) }
    this.append({ type: 'conversa', v: 1, id, createdAt: Date.now(), title } satisfies Header)
  }

  private append(line: Header | SessionLine | ChatEvent): void {
    if (!this.current) return
    try {
      // Só o usuário lê: as conversas podem ter qualquer coisa que passou pelo chat.
      mkdirSync(this.dir, { recursive: true, mode: 0o700 })
      appendFileSync(this.current.file, JSON.stringify(line) + '\n', { mode: 0o600 })
    } catch (err) {
      if (this.warned) return
      this.warned = true
      console.warn('[wisp] não consegui gravar o histórico da conversa:', err)
    }
  }
}
