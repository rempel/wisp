import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { randomUUID } from 'crypto'
import { basename, join } from 'path'
import type { AttachmentPreview, ChatEvent, ConversationSummary, Provider } from '../shared/ipc'
import { DATA_DIR } from './paths'
import { t } from '../shared/i18n'

/**
 * ~/.local/share/wisp/conversas: o histórico, um arquivo JSONL por conversa. A primeira linha
 * descreve a conversa; as outras são os eventos dela, na ordem, como o chat os recebeu.
 *
 * O Claude Code também grava as sessões, mas num formato interno que muda entre versões. Aqui
 * fica o que o painel mostrou, para reabrir a conversa igual; o contexto do Claude volta com o
 * --resume.
 */
export const HISTORY_DIR = join(DATA_DIR, 'conversas')
/** As conversas fixadas no topo do histórico (Fase 21): só os ids. */
export const PINS_FILE = join(DATA_DIR, 'fixadas.json')

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
  /** Pasta de uma sessão trazida do terminal (sem ela, o workspace do Wisp). */
  cwd?: string
  /** A conversa foi pela OpenRouter (sem o campo, pela assinatura). */
  provider?: 'openrouter'
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
  'permission-resolved',
  'compacted',
  'subagent-step',
  'subagent-step-end',
  'rewind'
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
      return isString(event.outcome) && (event.at === undefined || isString(event.at))
    case 'rewind':
      return true
    case 'notice':
      return isString(event.level) && isString(event.text)
    case 'permission-request':
      return isString(event.id) && isString(event.toolName)
    case 'permission-resolved':
      return isString(event.id) && isString(event.decision)
    case 'compacted':
      return event.trigger === 'manual' || event.trigger === 'auto'
    case 'subagent-step':
      return isString(event.parent) && isString(event.id) && isString(event.name)
    case 'subagent-step-end':
      return isString(event.parent) && isString(event.id) && typeof event.isError === 'boolean'
    default:
      return false
  }
}

/** Título da conversa: a primeira linha da primeira mensagem, ou os nomes dos anexos. */
export function titleOf(text: string, attachments: AttachmentPreview[]): string {
  const line = text.trim().split('\n')[0].replace(/\s+/g, ' ')
  const title = line || attachments.map((attachment) => attachment.name).join(', ')
  if (!title) return t('Conversa')
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
  /** A primeira mensagem, encurtada (o nome da aba). */
  title: string
  /** Com que session_id retomar no Claude Code. */
  sessionId: string
  createdAt: number
  /** Pasta onde retomar (uma sessão trazida do terminal). */
  cwd?: string
  /** Por onde a conversa foi: retomar pelo mesmo lado (as sessões de cada um ficam separadas). */
  provider?: 'openrouter'
  events: ChatEvent[]
}

/** A próxima conversa vem de uma sessão do terminal: pasta e o que mostrar antes das mensagens. */
export interface ConversationSeed {
  cwd: string
  preface: ChatEvent[]
}

/**
 * Grava a conversa aberta e lê as guardadas. O texto da resposta chega em pedacinhos; eles são
 * juntados num evento só por bloco antes de ir para o disco.
 */
export class History {
  private current: { id: string; sessionId: string; file: string } | null = null
  private text: { blockId: string; delta: string } | null = null
  private warned = false
  private seed: ConversationSeed | null = null
  /** Por onde vão as conversas gravadas daqui para a frente. */
  provider: Provider = 'subscription'
  /** A pasta das conversas gravadas daqui para a frente (uma conversa numa pasta). */
  cwd: string | null = null

  constructor(private readonly dir = HISTORY_DIR) {}

  /** A conversa sendo gravada, se houver. */
  currentId(): string | null {
    return this.current?.id ?? null
  }

  /**
   * Uma mensagem do usuário. A primeira de uma conversa cria o arquivo dela. `inTurn`: mandada
   * com o Claude trabalhando (entra no turno em andamento, não começa um).
   */
  user(
    sessionId: string,
    text: string,
    attachments: AttachmentPreview[],
    voice = false,
    inTurn = false
  ): void {
    if (!this.current) this.start(sessionId, titleOf(text, attachments))
    else this.setSession(sessionId)
    this.record({
      type: 'user',
      text,
      attachments,
      ...(voice ? { voice } : {}),
      ...(inTurn ? { inTurn } : {})
    })
  }

  /** Os eventos da conversa aberta (lidos do arquivo), com as edições já aplicadas. */
  events(): ChatEvent[] {
    const id = this.current?.id
    if (!id) return []
    return applyRewinds(this.load(id)?.events ?? [])
  }

  /** A conversa aberta passou a usar outro session_id (uma cópia feita pelo Claude Code). */
  setSession(sessionId: string): void {
    if (!this.current || this.current.sessionId === sessionId) return
    this.current.sessionId = sessionId
    this.append({ type: 'sessao', sessionId } satisfies SessionLine)
  }

  /**
   * A próxima conversa continua uma sessão do terminal: ela grava a pasta e começa com o
   * resumo do que veio de lá. Vale até a primeira mensagem ou até uma conversa nova.
   */
  prepare(seed: ConversationSeed): void {
    this.seed = seed
  }

  /** Um evento da conversa aberta. Uma conversa nova ('reset') fecha a atual. */
  record(event: ChatEvent): void {
    if (event.type === 'reset') {
      this.flush()
      this.current = null
      this.seed = null
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

  /**
   * As conversas guardadas, da mais recente para a mais antiga. `open` são as que estão abertas
   * em abas (cada aba grava a sua com o próprio History).
   */
  list(open: Set<string> = new Set()): ConversationSummary[] {
    this.flush()
    let names: string[]
    try {
      names = readdirSync(this.dir)
    } catch {
      return []
    }
    const conversations: ConversationSummary[] = []
    const pins = readPins()
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
        current: open.has(id) || id === this.current?.id,
        ...(header.cwd ? { project: basename(header.cwd), folder: header.cwd } : {}),
        ...(header.provider === 'openrouter' ? { provider: 'openrouter' as const } : {}),
        ...(pins.has(id) ? { pinned: true } : {})
      })
    }
    // As fixadas primeiro; dentro de cada grupo, da mais recente para a mais antiga.
    return conversations.sort(
      (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt
    )
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
    return {
      id,
      title: header.title,
      sessionId,
      createdAt: header.createdAt,
      ...(typeof header.cwd === 'string' && header.cwd ? { cwd: header.cwd } : {}),
      ...(header.provider === 'openrouter' ? { provider: 'openrouter' as const } : {}),
      events
    }
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
    } catch {
      return false
    }
    setPinned(id, false)
    return true
  }

  private file(id: string): string {
    return join(this.dir, `${id}.jsonl`)
  }

  private start(sessionId: string, title: string): void {
    const seed = this.seed
    this.seed = null
    // Uma sessão do terminal ganha um id de conversa próprio: o dela pode já ter outra conversa.
    const id = seed ? randomUUID() : sessionId
    this.current = { id, sessionId, file: this.file(id) }
    this.append({
      type: 'conversa',
      v: 1,
      id,
      createdAt: Date.now(),
      title,
      ...(seed ? { cwd: seed.cwd } : this.cwd ? { cwd: this.cwd } : {}),
      ...(this.provider === 'openrouter' ? { provider: 'openrouter' as const } : {})
    } satisfies Header)
    if (seed && sessionId !== id) this.append({ type: 'sessao', sessionId } satisfies SessionLine)
    for (const event of seed?.preface ?? []) this.append(event)
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

/** O índice da mensagem que começa o último turno (a que dá para editar); -1 se não há. */
function lastTurnStart(events: ChatEvent[]): number {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event.type === 'user' && !event.queued && !event.inTurn) return i
  }
  return -1
}

/**
 * Os eventos com as edições aplicadas: cada 'rewind' tira a mensagem que começou o último
 * turno e tudo o que veio depois dela.
 */
export function applyRewinds(events: ChatEvent[]): ChatEvent[] {
  const out: ChatEvent[] = []
  for (const event of events) {
    if (event.type !== 'rewind') {
      out.push(event)
      continue
    }
    const start = lastTurnStart(out)
    if (start >= 0) out.length = start
  }
  return out
}

/**
 * Para onde voltar a conversa no Claude Code para trocar a última mensagem: o uuid da última
 * resposta do turno anterior (`at`), ou null se ela é a primeira (a conversa recomeça numa
 * sessão nova). Devolve undefined quando não dá: não há mensagem, ou o turno anterior é de antes
 * de o Wisp guardar esse ponto.
 */
export function rewindPoint(
  events: ChatEvent[]
): { at: string | null; text: string; attachments: AttachmentPreview[] } | undefined {
  const done = applyRewinds(events)
  const start = lastTurnStart(done)
  if (start < 0) return undefined
  const user = done[start] as Extract<ChatEvent, { type: 'user' }>
  const before = done.slice(0, start)
  const ends = before.filter(
    (event): event is Extract<ChatEvent, { type: 'turn-end' }> => event.type === 'turn-end'
  )
  const last = ends.at(-1)
  if (!before.some((event) => event.type === 'user')) {
    return { at: null, text: user.text, attachments: user.attachments }
  }
  if (!last?.at) return undefined
  return { at: last.at, text: user.text, attachments: user.attachments }
}

/** As conversas fixadas. */
export function readPins(file = PINS_FILE): Set<string> {
  try {
    const ids = JSON.parse(readFileSync(file, 'utf8')) as unknown
    return new Set(Array.isArray(ids) ? ids.filter((id) => isString(id) && ID.test(id)) : [])
  } catch {
    return new Set()
  }
}

/** Fixa ou solta uma conversa. */
export function setPinned(id: string, pinned: boolean, file = PINS_FILE): boolean {
  if (!ID.test(id)) return false
  const pins = readPins(file)
  if (pins.has(id) === pinned) return true
  if (pinned) pins.add(id)
  else pins.delete(id)
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    const temp = `${file}.tmp`
    writeFileSync(temp, JSON.stringify([...pins]), { mode: 0o600 })
    renameSync(temp, file)
    return true
  } catch (err) {
    console.warn('[wisp] não consegui guardar as conversas fixadas:', err)
    return false
  }
}
