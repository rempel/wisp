import { formatDate } from '../../shared/format'
import type {
  AttachmentPreview,
  ChatEvent,
  FileDiff,
  NoticeLevel,
  PermissionDecision,
  PlanUsage
} from '../../shared/ipc'

export type { AttachmentPreview }

/** "waiting": parada esperando o usuário responder o card de permissão. */
export type ToolStatus = 'running' | 'waiting' | 'done' | 'error' | 'stopped'

/** 'answered': uma pergunta do Claude respondida; 'deny' numa pergunta é "pulada". */
export type PermissionStatus = 'pending' | PermissionDecision | 'answered' | 'cancelled'

/** Um item da conversa, na ordem em que aparece. */
export type Item =
  | { kind: 'user'; id: string; text: string; attachments: AttachmentPreview[] }
  /** Bloco de texto da resposta (Markdown), que cresce enquanto chega. */
  | { kind: 'text'; id: string; text: string }
  | {
      kind: 'tool'
      id: string
      name: string
      input?: unknown
      status: ToolStatus
      output?: string
      /** O que uma edição de arquivo mudou, como o Claude Code informou. */
      diff?: FileDiff
    }
  | { kind: 'notice'; id: string; level: NoticeLevel; text: string }
  | {
      kind: 'permission'
      id: string
      toolName: string
      input: unknown
      toolUseId?: string
      status: PermissionStatus
      /** Respostas dadas, quando é uma pergunta do Claude. */
      answers?: Record<string, string>
    }

export interface ChatState {
  items: Item[]
  busy: boolean
  /** O modelo escolhido e o que respondeu por último (null até o main contar). */
  model: { choice: string | null; active: string | null } | null
  /** O uso do plano (null até a primeira resposta). */
  usage: PlanUsage | null
}

export type Action =
  /** Eventos do main, aplicados em lote (no máximo um render por quadro). */
  | { type: 'events'; events: ChatEvent[] }
  | { type: 'user-message'; text: string; attachments: AttachmentPreview[] }

export const initialState: ChatState = { items: [], busy: false, model: null, usage: null }

function userItem(items: Item[], text: string, attachments: AttachmentPreview[]): Item {
  return { kind: 'user', id: `user-${items.length}`, text, attachments }
}

export function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case 'user-message':
      // Fica ocupado na hora, sem esperar o main, para um segundo Enter não mandar outra.
      return {
        ...append(state, userItem(state.items, action.text, action.attachments)),
        busy: true
      }
    case 'events':
      return action.events.reduce(applyEvent, state)
  }
}

function applyEvent(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case 'reset':
      // O modelo e o uso do plano não são da conversa: continuam.
      return { ...initialState, model: state.model, usage: state.usage }
    case 'model':
      return { ...state, model: { choice: event.choice, active: event.active } }
    case 'usage':
      return { ...state, usage: event.usage }
    case 'user':
      return append(state, userItem(state.items, event.text, event.attachments))
    case 'restored': {
      // O que ficou pela metade quando a conversa foi guardada não vai terminar.
      const items = state.items.map((item): Item => {
        if (item.kind === 'tool' && (item.status === 'running' || item.status === 'waiting')) {
          return { ...item, status: 'stopped' }
        }
        if (item.kind === 'permission' && item.status === 'pending') {
          return { ...item, status: 'cancelled' }
        }
        return item
      })
      const text = `Conversa de ${formatDate(event.createdAt)}. O Claude continua de onde parou.`
      return append({ ...state, items }, notice(items, 'info', text))
    }
    case 'busy':
      return { ...state, busy: event.busy }
    case 'text': {
      const text = findItem(state, 'text', event.blockId)
      if (text) return replaceItem(state, text, { ...text, text: text.text + event.delta })
      return append(state, { kind: 'text', id: event.blockId, text: event.delta })
    }
    case 'tool-start':
      if (findItem(state, 'tool', event.id)) return state
      return append(state, { kind: 'tool', id: event.id, name: event.name, status: 'running' })
    case 'tool-input': {
      const tool = findItem(state, 'tool', event.id)
      if (tool) return replaceItem(state, tool, { ...tool, name: event.name, input: event.input })
      return append(state, {
        kind: 'tool',
        id: event.id,
        name: event.name,
        input: event.input,
        status: 'running'
      })
    }
    case 'tool-result': {
      const tool = findItem(state, 'tool', event.id)
      if (!tool) return state
      const status = event.isError ? 'error' : 'done'
      return replaceItem(state, tool, { ...tool, status, output: event.output, diff: event.diff })
    }
    case 'turn-end': {
      if (event.outcome !== 'stopped') return state
      // Ferramentas que ficaram no meio do caminho não vão terminar.
      const items = state.items.map((item) =>
        item.kind === 'tool' && (item.status === 'running' || item.status === 'waiting')
          ? { ...item, status: 'stopped' as const }
          : item
      )
      return append({ ...state, items }, notice(items, 'info', 'Você parou a resposta.'))
    }
    case 'notice':
      return append(state, notice(state.items, event.level, event.text))
    case 'permission-request': {
      const { id, toolName, input, toolUseId } = event
      const tool = toolUseId ? findItem(state, 'tool', toolUseId) : undefined
      const waiting =
        tool && tool.status === 'running'
          ? replaceItem(state, tool, { ...tool, status: 'waiting' })
          : state
      return append(waiting, {
        kind: 'permission',
        id,
        toolName,
        input,
        toolUseId,
        status: 'pending'
      })
    }
    case 'permission-resolved': {
      const request = findItem(state, 'permission', event.id)
      if (!request) return state
      let next = replaceItem(state, request, {
        ...request,
        status: event.decision,
        answers: event.answers
      })
      // Liberada, a ferramenta volta a rodar; negada, o resultado de erro chega em seguida.
      const tool = request.toolUseId ? findItem(next, 'tool', request.toolUseId) : undefined
      if (
        tool?.status === 'waiting' &&
        (event.decision === 'allow' ||
          event.decision === 'allow-always' ||
          event.decision === 'answered')
      ) {
        next = replaceItem(next, tool, { ...tool, status: 'running' })
      }
      return next
    }
  }
}

function notice(items: Item[], level: NoticeLevel, text: string): Item {
  return { kind: 'notice', id: `notice-${items.length}`, level, text }
}

function append(state: ChatState, item: Item): ChatState {
  return { ...state, items: [...state.items, item] }
}

/**
 * Procura um item do turno atual, depois da última mensagem do usuário: texto, ferramentas e
 * pedidos de um turno nunca voltam num turno seguinte, e numa conversa reaberta do histórico os
 * ids antigos não se misturam com os da resposta nova.
 */
function findItem<K extends Item['kind']>(
  state: ChatState,
  kind: K,
  id: string
): Extract<Item, { kind: K }> | undefined {
  for (let i = state.items.length - 1; i >= 0; i--) {
    const item = state.items[i]
    if (item.kind === kind && item.id === id) return item as Extract<Item, { kind: K }>
    if (item.kind === 'user') break
  }
  return undefined
}

function replaceItem(state: ChatState, current: Item, next: Item): ChatState {
  return { ...state, items: state.items.map((item) => (item === current ? next : item)) }
}

/** Nome curto da ferramenta: "mcp__desktop__open_url" vira "open_url". */
export function toolLabel(name: string): string {
  return name.replace(/^mcp__[^_]+(?:_[^_]+)*__/, '')
}

/** O card de permissão (ou pergunta) esperando resposta, se houver. */
function pendingRequest(state: ChatState): Extract<Item, { kind: 'permission' }> | undefined {
  return state.items.find(
    (item): item is Extract<Item, { kind: 'permission' }> =>
      item.kind === 'permission' && item.status === 'pending'
  )
}

/** Algum card de permissão esperando resposta? */
export function awaitingPermission(state: ChatState): boolean {
  return pendingRequest(state) !== undefined
}

const field = (input: unknown, key: string): string => {
  const value = (input as Record<string, unknown> | null)?.[key]
  return typeof value === 'string' ? value : ''
}

/** O nome do arquivo no fim de um caminho. */
const fileName = (path: string): string => path.split('/').filter(Boolean).pop() ?? path

const quote = (text: string): string =>
  `“${text.length > 24 ? `${text.slice(0, 23).trimEnd()}…` : text}”`

/** O que uma ferramenta em andamento está fazendo, em português ("lendo package.json…"). */
export function toolActivity(name: string, input: unknown): string {
  const file = field(input, 'file_path')
  switch (name) {
    case 'Read':
      return file ? `lendo ${fileName(file)}…` : 'lendo um arquivo…'
    case 'Write':
      return file ? `escrevendo ${fileName(file)}…` : 'escrevendo um arquivo…'
    case 'Edit':
    case 'MultiEdit':
      return file ? `editando ${fileName(file)}…` : 'editando um arquivo…'
    case 'NotebookEdit':
      return 'editando um notebook…'
    case 'Glob':
      return 'procurando arquivos…'
    case 'Grep': {
      const pattern = field(input, 'pattern')
      return pattern ? `procurando ${quote(pattern)}…` : 'procurando nos arquivos…'
    }
    case 'Bash':
      return 'rodando um comando…'
    case 'WebSearch': {
      const query = field(input, 'query')
      return query ? `pesquisando ${quote(query)}…` : 'pesquisando na web…'
    }
    case 'WebFetch':
      try {
        return `lendo ${new URL(field(input, 'url')).host}…`
      } catch {
        return 'lendo uma página…'
      }
    case 'Task':
    case 'Agent':
      return 'delegando uma tarefa…'
    case 'TodoWrite':
      return 'organizando as tarefas…'
    case 'mcp__desktop__open_url':
      return 'abrindo o link…'
    case 'mcp__desktop__open_app':
      return 'abrindo um app…'
    case 'mcp__desktop__open_project':
      return 'abrindo o projeto…'
    case 'mcp__desktop__list_apps':
      return 'vendo os apps instalados…'
    case 'mcp__desktop__list_projects':
      return 'vendo seus projetos…'
    case 'mcp__desktop__notify':
      return 'mandando uma notificação…'
    default:
      return `usando ${toolLabel(name)}…`
  }
}

/** O que o cabeçalho mostra embaixo do nome. */
export function statusText(state: ChatState): string {
  if (!state.busy) return 'pronto'
  const pending = pendingRequest(state)
  if (pending) {
    return pending.toolName === 'AskUserQuestion'
      ? 'esperando sua resposta…'
      : 'esperando sua permissão…'
  }
  const last = state.items[state.items.length - 1]
  if (last?.kind === 'tool' && last.status === 'running') return toolActivity(last.name, last.input)
  if (last?.kind === 'text') return 'respondendo…'
  return 'pensando…'
}
