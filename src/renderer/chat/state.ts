import { formatDate, formatTokens } from '../../shared/format'
import type {
  AttachmentPreview,
  ContextUsage,
  ConversationCost,
  ConversationView,
  ChatEvent,
  FileDiff,
  NoticeLevel,
  PermissionDecision,
  PermissionMode,
  PlanUsage,
  Provider,
  ReviewFile,
  TaskInfo,
  TerminalStatus
} from '../../shared/ipc'
import { t } from '../../shared/i18n'
import { field, fileName, quote, stepLabel, toolLabel } from '../../shared/steps'

export { stepLabel, toolLabel }

export type { AttachmentPreview }

/** "waiting": parada esperando o usuário responder o card de permissão. */
export type ToolStatus = 'running' | 'waiting' | 'done' | 'error' | 'stopped'

/** 'answered': uma pergunta do Claude respondida; 'deny' numa pergunta é "pulada". */
export type PermissionStatus = 'pending' | PermissionDecision | 'answered' | 'cancelled'

/** Um item da conversa, na ordem em que aparece. */
export type Item =
  | {
      kind: 'user'
      id: string
      text: string
      attachments: AttachmentPreview[]
      /** Foi falada (o atalho de voz, um comando rápido). */
      voice?: boolean
      /** Mandada com o Claude trabalhando: espera ele pegar (na fila). */
      queued?: boolean
      /** Ficou na fila e não chegou (a resposta parou). */
      dropped?: boolean
      /** Entrou no meio de um turno: os itens dele continuam depois dela. */
      midTurn?: boolean
    }
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
      /** Miniaturas das imagens que a ferramenta devolveu (um print da tela). */
      images?: string[]
      /** Os passos de um subagente (o card do Agente). */
      steps?: SubagentStep[]
    }
  | { kind: 'notice'; id: string; level: NoticeLevel; text: string }
  /**
   * O card do fim do turno (Fase 42): o que a resposta mudou nos arquivos. `stale`: outra
   * mensagem já começou um turno, e as cópias de antes não existem mais.
   */
  | { kind: 'review'; id: string; turn: number; files: ReviewFile[]; stale: boolean }
  | {
      kind: 'permission'
      id: string
      toolName: string
      input: unknown
      toolUseId?: string
      status: PermissionStatus
      /** Navegador: o site em jogo e até onde vai o "sempre" (veja o ChatEvent). */
      site?: string
      always?: 'site' | 'none'
      /** Bash: o que o "Permitir sempre" libera ("git status", "ls" ou o comando exato). */
      scope?: string
      exact?: boolean
      /** Respostas dadas, quando é uma pergunta do Claude. */
      answers?: Record<string, string>
    }

/** Uma ferramenta que um subagente chamou. */
export interface SubagentStep {
  id: string
  name: string
  input: unknown
  status: 'running' | 'done' | 'error'
}

export interface ChatState {
  items: Item[]
  busy: boolean
  /** O modelo escolhido e o que respondeu por último (null até o main contar). */
  model: { choice: string | null; active: string | null } | null
  /** O uso do plano (null até a primeira resposta). */
  usage: PlanUsage | null
  /** O modo de permissão da conversa. */
  mode: PermissionMode
  /** Por onde a conversa vai. */
  provider: Provider
  /** O custo estimado (pela OpenRouter; null até a primeira resposta). */
  cost: ConversationCost | null
  /** A pasta onde a conversa roda (com ~), ou null. */
  folder: string | null
  /** Quanto da janela de contexto a conversa ocupa (null até a primeira resposta). */
  context: ContextUsage | null
  /** As tarefas em segundo plano rodando agora. */
  tasks: TaskInfo[]
  /** Os comandos com barra que o Claude Code aceita (skills e comandos do projeto). */
  commands: string[]
  /** O que a aba mostra: o chat ou o terminal. */
  view: ConversationView
  /** O Claude Code do modo terminal. */
  terminal: TerminalStatus
  /** O rascunho da caixa guardado da última vez (Fase 21); null se não havia. */
  draft: string | null
}

export type Action =
  /** Eventos do main, aplicados em lote (no máximo um render por quadro). */
  | { type: 'events'; events: ChatEvent[] }
  | {
      type: 'user-message'
      text: string
      attachments: AttachmentPreview[]
      /** Troca a última mensagem (ela e o que veio depois saem antes). */
      replace?: boolean
    }

export const initialState: ChatState = {
  items: [],
  busy: false,
  model: null,
  usage: null,
  mode: 'default',
  provider: 'subscription',
  cost: null,
  folder: null,
  context: null,
  tasks: [],
  commands: [],
  view: 'chat',
  terminal: { state: 'idle' },
  draft: null
}

function userItem(
  items: Item[],
  text: string,
  attachments: AttachmentPreview[],
  voice = false,
  queued = false,
  inTurn = false
): Item {
  return {
    kind: 'user',
    id: `user-${items.length}`,
    text,
    attachments,
    ...(voice ? { voice } : {}),
    ...(queued ? { queued, midTurn: true } : inTurn ? { midTurn: true } : {})
  }
}

/** A mensagem que começou o último turno (a que dá para editar); -1 se não há. */
export function lastTurnStart(items: Item[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind === 'user' && !item.midTurn) return i
  }
  return -1
}

/** As posições das mensagens que começam um turno (Fase 46: dá para voltar a cada uma). */
export function turnStartsOf(items: Item[]): number[] {
  const starts: number[] = []
  items.forEach((item, i) => {
    if (item.kind === 'user' && !item.midTurn) starts.push(i)
  })
  return starts
}

/**
 * Tira a última mensagem e o que veio depois dela (ela foi editada); com `keep` (Fase 46), tudo
 * a partir do turno `keep`.
 */
function rewound(state: ChatState, keep?: number): ChatState {
  const start =
    keep === undefined ? lastTurnStart(state.items) : (turnStartsOf(state.items)[keep] ?? -1)
  return start < 0 ? state : { ...state, items: state.items.slice(0, start) }
}

export function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case 'user-message': {
      // Fica ocupado na hora, sem esperar o main. Com o Claude trabalhando, a mensagem entra na
      // fila: ele a pega na próxima pausa.
      const base = action.replace ? rewound(state) : state
      // Editar só vale com a conversa parada (o main confere): a nova nunca vai para a fila, mesmo
      // se o fim do turno ainda não chegou à página (os eventos entram uma vez por quadro).
      const queued = !action.replace && base.busy
      return {
        ...append(base, userItem(base.items, action.text, action.attachments, false, queued)),
        busy: true
      }
    }
    case 'events':
      return action.events.reduce(applyEvent, state)
  }
}

function applyEvent(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case 'reset':
      // O modelo, o uso do plano, o modo e o provedor não são da conversa: continuam.
      return {
        ...initialState,
        model: state.model,
        usage: state.usage,
        mode: state.mode,
        provider: state.provider,
        folder: state.folder,
        commands: state.commands,
        view: state.view,
        terminal: state.terminal
      }
    case 'folder':
      return { ...state, folder: event.folder }
    case 'rewind':
      return rewound(state, event.keep)
    case 'draft':
      return { ...state, draft: event.text }
    case 'context':
      return { ...state, context: event.context }
    case 'compacted': {
      const tokens =
        event.before !== null && event.after !== null
          ? t(' ({v1} → {v2} tokens)', {
              v1: formatTokens(event.before),
              v2: formatTokens(event.after)
            })
          : ''
      const text =
        (event.trigger === 'auto'
          ? t('A conversa chegou perto do limite e foi compactada sozinha')
          : t('Conversa compactada')) +
        `${tokens}. O Claude segue com um resumo do que veio antes; o painel continua mostrando tudo.`
      return append(state, notice(state.items, 'info', text))
    }
    case 'provider':
      return { ...state, provider: event.provider }
    case 'cost':
      return { ...state, cost: event.cost }
    case 'mode':
      return { ...state, mode: event.mode }
    case 'model':
      return { ...state, model: { choice: event.choice, active: event.active } }
    case 'usage':
      return { ...state, usage: event.usage }
    case 'turn-review':
      return append(state, {
        kind: 'review',
        id: `review-${event.turn}-${state.items.length}`,
        turn: event.turn,
        files: event.files,
        stale: false
      })
    case 'user':
      return append(
        state,
        userItem(
          state.items,
          event.text,
          event.attachments,
          event.voice,
          event.queued,
          event.inTurn
        )
      )
    case 'user-delivered': {
      const first = state.items.find(
        (item): item is Extract<Item, { kind: 'user' }> => item.kind === 'user' && !!item.queued
      )
      return first ? replaceItem(state, first, { ...first, queued: false }) : state
    }
    case 'queue-dropped':
      return {
        ...state,
        items: state.items.map((item) =>
          item.kind === 'user' && item.queued ? { ...item, queued: false, dropped: true } : item
        )
      }
    case 'subagent-step': {
      const parent = findItem(state, 'tool', event.parent)
      if (!parent || parent.steps?.some((step) => step.id === event.id)) return state
      const step: SubagentStep = {
        id: event.id,
        name: event.name,
        input: event.input,
        status: 'running'
      }
      return replaceItem(state, parent, { ...parent, steps: [...(parent.steps ?? []), step] })
    }
    case 'subagent-step-end': {
      const parent = findItem(state, 'tool', event.parent)
      if (!parent?.steps) return state
      const steps = parent.steps.map((step) =>
        step.id === event.id
          ? { ...step, status: event.isError ? ('error' as const) : ('done' as const) }
          : step
      )
      return replaceItem(state, parent, { ...parent, steps })
    }
    case 'task': {
      const others = state.tasks.filter((task) => task.id !== event.task.id)
      const keep = event.task.background && event.task.status === 'running'
      return { ...state, tasks: keep ? [...others, event.task] : others }
    }
    case 'commands':
      return { ...state, commands: event.commands }
    case 'view':
      return { ...state, view: event.view }
    case 'terminal':
      return { ...state, terminal: event.terminal }
    case 'jump':
      // Vai para a busca na conversa (Chat.tsx), não para o estado.
      return state
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
      const text = t('Conversa de {v1}. O Claude continua de onde parou.', {
        v1: formatDate(event.createdAt)
      })
      return append({ ...state, items }, notice(items, 'info', text))
    }
    case 'busy':
      // O Claude começando um turno novo: os cards de revisão de antes não desfazem mais (Fase 42).
      return { ...(event.busy && !state.busy ? staleReviews(state) : state), busy: event.busy }
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
      return replaceItem(state, tool, {
        ...tool,
        status,
        output: event.output,
        diff: event.diff,
        images: event.images
      })
    }
    case 'turn-end': {
      if (event.outcome !== 'stopped') return state
      // Ferramentas que ficaram no meio do caminho não vão terminar.
      const items = state.items.map((item) =>
        item.kind === 'tool' && (item.status === 'running' || item.status === 'waiting')
          ? { ...item, status: 'stopped' as const }
          : item
      )
      return append({ ...state, items }, notice(items, 'info', t('Você parou a resposta.')))
    }
    case 'notice':
      return append(state, notice(state.items, event.level, event.text))
    case 'permission-request': {
      const { id, toolName, input, toolUseId, site, always, scope, exact } = event
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
        status: 'pending',
        ...(site ? { site } : {}),
        ...(always ? { always } : {}),
        ...(scope ? { scope } : {}),
        ...(exact ? { exact } : {})
      })
    }
    case 'permission-resolved': {
      // Os pedidos têm ids únicos: vale procurar na conversa inteira (no modo terminal, a
      // mensagem pode chegar depois do pedido que ela causou).
      const request = state.items.find(
        (item): item is Extract<Item, { kind: 'permission' }> =>
          item.kind === 'permission' && item.id === event.id
      )
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
        event.decision !== 'deny' &&
        event.decision !== 'cancelled'
      ) {
        next = replaceItem(next, tool, { ...tool, status: 'running' })
      }
      return next
    }
  }
}

function staleReviews(state: ChatState): ChatState {
  if (!state.items.some((item) => item.kind === 'review' && !item.stale)) return state
  return {
    ...state,
    items: state.items.map((item) =>
      item.kind === 'review' && !item.stale ? { ...item, stale: true } : item
    )
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
    // Uma mensagem mandada no meio do turno não o encerra.
    if (item.kind === 'user' && !item.midTurn) break
  }
  return undefined
}

function replaceItem(state: ChatState, current: Item, next: Item): ChatState {
  return { ...state, items: state.items.map((item) => (item === current ? next : item)) }
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

/** O que uma ferramenta em andamento está fazendo, em português ("lendo package.json…"). */
export function toolActivity(name: string, input: unknown): string {
  const file = field(input, 'file_path')
  switch (name) {
    case 'Read':
      return file ? t('lendo {v1}…', { v1: fileName(file) }) : t('lendo um arquivo…')
    case 'Write':
      return file ? t('escrevendo {v1}…', { v1: fileName(file) }) : t('escrevendo um arquivo…')
    case 'Edit':
    case 'MultiEdit':
      return file ? t('editando {v1}…', { v1: fileName(file) }) : t('editando um arquivo…')
    case 'NotebookEdit':
      return t('editando um notebook…')
    case 'Glob':
      return t('procurando arquivos…')
    case 'Grep': {
      const pattern = field(input, 'pattern')
      return pattern ? t('procurando {v1}…', { v1: quote(pattern) }) : t('procurando nos arquivos…')
    }
    case 'Bash':
      return t('rodando um comando…')
    case 'WebSearch': {
      const query = field(input, 'query')
      return query ? t('pesquisando {v1}…', { v1: quote(query) }) : t('pesquisando na web…')
    }
    case 'WebFetch':
      try {
        return t('lendo {host}…', { host: new URL(field(input, 'url')).host })
      } catch {
        return t('lendo uma página…')
      }
    case 'Task':
    case 'Agent':
      return t('delegando uma tarefa…')
    case 'TodoWrite':
      return t('organizando as tarefas…')
    case 'Skill': {
      const skill = field(input, 'skill')
      return skill ? t('usando a skill {v1}…', { v1: quote(skill) }) : t('usando uma skill…')
    }
    case 'mcp__desktop__open_url':
      return t('abrindo o link…')
    case 'mcp__desktop__open_app':
      return t('abrindo um app…')
    case 'mcp__desktop__open_project':
      return t('abrindo o projeto…')
    case 'mcp__desktop__list_apps':
      return t('vendo os apps instalados…')
    case 'mcp__desktop__list_projects':
      return t('vendo seus projetos…')
    case 'mcp__desktop__notify':
      return t('mandando uma notificação…')
    case 'mcp__desktop__screenshot':
      return t('tirando um print da tela…')
    case 'mcp__desktop__open_terminal':
      return t('abrindo o terminal…')
    case 'mcp__desktop__list_windows':
      return t('vendo as janelas abertas…')
    case 'mcp__desktop__focus_window':
      return t('trazendo a janela para a frente…')
    case 'mcp__playwright__browser_navigate':
      try {
        return t('abrindo {host}…', { host: new URL(field(input, 'url')).host })
      } catch {
        return t('abrindo uma página…')
      }
    case 'mcp__playwright__browser_snapshot':
    case 'mcp__playwright__browser_find':
      return t('lendo a página…')
    case 'mcp__playwright__browser_take_screenshot':
      return t('olhando a página…')
    case 'mcp__playwright__browser_click':
      return t('clicando na página…')
    case 'mcp__playwright__browser_type':
    case 'mcp__playwright__browser_fill_form':
      return t('preenchendo a página…')
    case 'mcp__desktop__set_reminder':
      return t('marcando o lembrete…')
    case 'mcp__desktop__list_reminders':
      return t('vendo os lembretes…')
    case 'mcp__desktop__cancel_reminder':
      return t('cancelando o lembrete…')
    case 'mcp__desktop__media_status':
      return t('vendo o que está tocando…')
    case 'mcp__desktop__media_control':
      return t('mexendo na música…')
    case 'mcp__desktop__media_volume':
      return t('mudando o volume…')
    case 'mcp__desktop__express':
      return t('mostrando uma emoção no mascote…')
    default:
      return name.startsWith('mcp__playwright__')
        ? t('usando o navegador…')
        : t('usando {v1}…', { v1: toolLabel(name) })
  }
}

/** O que o cabeçalho mostra embaixo do nome. */
export function statusText(state: ChatState): string {
  if (!state.busy) return t('pronto')
  const pending = pendingRequest(state)
  if (pending) {
    return pending.toolName === 'AskUserQuestion'
      ? t('esperando sua resposta…')
      : t('esperando sua permissão…')
  }
  const last = state.items[state.items.length - 1]
  if (last?.kind === 'tool' && last.status === 'running') return toolActivity(last.name, last.input)
  if (last?.kind === 'text') return 'respondendo…'
  return 'pensando…'
}
