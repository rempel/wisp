import type { ChatEvent, NoticeLevel } from '../../shared/ipc'

export type ToolStatus = 'running' | 'done' | 'error' | 'stopped'

/** Um item da conversa, na ordem em que aparece. */
export type Item =
  | { kind: 'user'; id: string; text: string }
  /** Bloco de texto da resposta (Markdown), que cresce enquanto chega. */
  | { kind: 'text'; id: string; text: string }
  | { kind: 'tool'; id: string; name: string; input?: unknown; status: ToolStatus; output?: string }
  | { kind: 'notice'; id: string; level: NoticeLevel; text: string }

export interface ChatState {
  items: Item[]
  busy: boolean
}

export type Action =
  /** Eventos do main, aplicados em lote (no máximo um render por quadro). */
  { type: 'events'; events: ChatEvent[] } | { type: 'user-message'; text: string }

export const initialState: ChatState = { items: [], busy: false }

export function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case 'user-message':
      // Fica ocupado na hora, sem esperar o main, para um segundo Enter não mandar outra.
      return {
        items: [
          ...state.items,
          { kind: 'user', id: `user-${state.items.length}`, text: action.text }
        ],
        busy: true
      }
    case 'events':
      return action.events.reduce(applyEvent, state)
  }
}

function applyEvent(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case 'reset':
      return initialState
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
      return replaceItem(state, tool, { ...tool, status, output: event.output })
    }
    case 'turn-end': {
      if (event.outcome !== 'stopped') return state
      // Ferramentas que ficaram no meio do caminho não vão terminar.
      const items = state.items.map((item) =>
        item.kind === 'tool' && item.status === 'running'
          ? { ...item, status: 'stopped' as const }
          : item
      )
      return append({ ...state, items }, notice(items, 'info', 'Você parou a resposta.'))
    }
    case 'notice':
      return append(state, notice(state.items, event.level, event.text))
  }
}

function notice(items: Item[], level: NoticeLevel, text: string): Item {
  return { kind: 'notice', id: `notice-${items.length}`, level, text }
}

function append(state: ChatState, item: Item): ChatState {
  return { ...state, items: [...state.items, item] }
}

function findItem<K extends Item['kind']>(
  state: ChatState,
  kind: K,
  id: string
): Extract<Item, { kind: K }> | undefined {
  // O item procurado quase sempre é um dos últimos.
  for (let i = state.items.length - 1; i >= 0; i--) {
    const item = state.items[i]
    if (item.kind === kind && item.id === id) return item as Extract<Item, { kind: K }>
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

/** O que o cabeçalho mostra embaixo do nome. */
export function statusText(state: ChatState): string {
  if (!state.busy) return 'pronto'
  const last = state.items[state.items.length - 1]
  if (last?.kind === 'tool' && last.status === 'running') return `usando ${toolLabel(last.name)}…`
  if (last?.kind === 'text') return 'respondendo…'
  return 'pensando…'
}
