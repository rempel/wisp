// O que a ilha aberta mostra (Fase 37): as conversas do Wisp e as sessões do Claude Code no
// terminal que estão ativas (ou acabaram há pouco), com os últimos passos e o começo da resposta,
// e os pedidos que esperam resposta. Acompanha os eventos das conversas (como o humor do mascote);
// as sessões vêm prontas do rastreador dos hooks.

import { summarize } from './phone'
import { QUESTION_TOOL } from './questions'
import type {
  ChatEvent,
  ExternalSession,
  IslandAlert,
  IslandQuestion,
  IslandStep,
  IslandTask,
  IslandTaskState
} from '../shared/ipc'
import { clip, field, stepLabel, toolLabel } from '../shared/steps'
import { t } from '../shared/i18n'

const PLAN_TOOL = 'ExitPlanMode'
const TRUST_TOOL = 'wisp_trust_folder'
/** Quantos passos de cada conversa a ilha guarda (ela mostra os últimos). */
const MAX_STEPS = 6
/** Quantas conversas e sessões a ilha mostra. */
const MAX_TASKS = 6
/** Uma conversa ou sessão que acabou continua na ilha por este tempo (ms). */
const RECENT_MS = 30 * 60_000
/** O texto da resposta que a ilha guarda (o cartão mostra o começo). */
const MAX_REPLY = 600
/** Os botões de um pedido só valem depois disto (ms): o clique pode ter sido em outra coisa. */
export const ALERT_ARM_MS = 600

/** Um pedido de uma conversa, como o evento trouxe. */
interface Pending {
  id: string
  toolName: string
  input: unknown
  always?: 'site' | 'none'
  site?: string
  scope?: string
  at: number
}

interface Tracked {
  state: IslandTaskState
  busy: boolean
  steps: IslandStep[]
  /** O bloco de texto em andamento e o último completo. */
  block: string | null
  text: string
  reply?: string
  pending: Pending[]
  updatedAt: number
}

/** O começo de uma resposta: o primeiro parágrafo, numa linha. */
export function firstParagraph(text: string, max = 220): string {
  const paragraph = text.trim().split(/\n\s*\n/)[0] ?? ''
  const line = paragraph
    .replace(/[#*_`>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return clip(line, max)
}

/** As perguntas de um AskUserQuestion, com as opções; null se o formato não bate. */
export function islandQuestions(input: unknown): IslandQuestion[] | null {
  const list = (input as { questions?: unknown } | null)?.questions
  if (!Array.isArray(list) || !list.length) return null
  const questions: IslandQuestion[] = []
  for (const item of list.slice(0, 4)) {
    const entry = (item ?? {}) as Record<string, unknown>
    if (typeof entry.question !== 'string' || !entry.question) return null
    const options = Array.isArray(entry.options)
      ? entry.options
          .map((option) => (option ?? {}) as Record<string, unknown>)
          .filter((option) => typeof option.label === 'string' && option.label)
          .slice(0, 6)
          .map((option) => ({
            label: clip(option.label as string, 80),
            ...(typeof option.description === 'string' && option.description
              ? { description: clip(option.description, 200) }
              : {})
          }))
      : []
    // Sem opções, a resposta é escrita: isso fica para o painel.
    if (!options.length) return null
    questions.push({
      question: clip(entry.question, 300),
      ...(typeof entry.header === 'string' && entry.header
        ? { header: clip(entry.header, 40) }
        : {}),
      multiSelect: entry.multiSelect === true,
      options
    })
  }
  return questions
}

/** O que está em jogo num pedido, numa ou duas linhas: o comando, o arquivo, o site. */
export function alertDetail(toolName: string, input: unknown): string {
  switch (toolName) {
    case 'Bash':
      return clip(field(input, 'command').trim(), 400) || 'Bash'
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      return field(input, 'file_path') || toolName
    case 'NotebookEdit':
      return field(input, 'notebook_path') || toolName
    case 'WebFetch':
      return field(input, 'url') || toolName
    case 'WebSearch':
      return field(input, 'query') || toolName
    default: {
      const url = field(input, 'url')
      return url ? `${toolLabel(toolName)}: ${url}` : toolLabel(toolName)
    }
  }
}

/** O cartão de um pedido (de uma conversa ou de uma sessão do terminal). */
export function buildAlert(
  request: { id: string; toolName: string; input: unknown; at: number },
  owner: { task: string; who: string },
  always: string | undefined
): IslandAlert {
  const base = { id: request.id, task: owner.task, who: owner.who, armedAt: request.at }
  if (request.toolName === QUESTION_TOOL) {
    const questions = islandQuestions(request.input)
    return questions
      ? {
          ...base,
          armedAt: request.at + ALERT_ARM_MS,
          kind: 'question',
          title: t('O Claude tem uma pergunta'),
          detail: '',
          questions
        }
      : {
          ...base,
          kind: 'panel',
          title: t('O Claude tem uma pergunta'),
          detail: t('Responda no painel.')
        }
  }
  if (request.toolName === PLAN_TOOL || request.toolName === TRUST_TOOL) {
    return {
      ...base,
      kind: 'panel',
      title:
        request.toolName === PLAN_TOOL
          ? t('O Claude quer seguir com o plano')
          : t('O Claude quer trabalhar numa pasta nova'),
      detail: t('Veja no painel antes de responder.')
    }
  }
  const summary = summarize(request.toolName, request.input)
  return {
    ...base,
    armedAt: request.at + ALERT_ARM_MS,
    kind: 'permission',
    title: summary?.title ?? t('O Claude quer usar uma ferramenta'),
    detail: alertDetail(request.toolName, request.input),
    ...(always ? { always } : {})
  }
}

/** O "Sempre" de um pedido de conversa: o que ele libera, ou nada (quando não há). */
function alwaysOf(pending: Pending): string | undefined {
  if (pending.toolName === QUESTION_TOOL || pending.always === 'none') return undefined
  if (pending.always === 'site') return pending.site
  return pending.scope ?? toolLabel(pending.toolName)
}

/** O estado de uma sessão do terminal na ilha. */
function sessionState(session: ExternalSession): IslandTaskState {
  if (session.requests.length) return 'waiting'
  switch (session.state) {
    case 'working':
      return 'working'
    case 'waiting':
      return 'waiting'
    case 'error':
      return 'error'
    default:
      return session.lastMessage ? 'done' : 'idle'
  }
}

/** Os passos de uma sessão do terminal como a ilha mostra. */
export function sessionSteps(session: ExternalSession): IslandStep[] {
  return session.steps
    .filter((step) => !step.subagent)
    .slice(-MAX_STEPS)
    .map((step) => ({
      id: step.id,
      label: stepLabel(step.tool, step.input),
      status: step.status,
      ...(step.diff ? { added: step.diff.added, removed: step.diff.removed } : {})
    }))
}

export interface IslandFeedOptions {
  /** O título da aba de uma conversa. */
  title(conversation: string): string
  /** As sessões do terminal (as que pedem algo primeiro). */
  sessions(): ExternalSession[]
  now?(): number
}

/** Acompanha as conversas e junta o que a ilha mostra. */
export class IslandFeed {
  private readonly conversations = new Map<string, Tracked>()
  private readonly now: () => number

  constructor(private readonly options: IslandFeedOptions) {
    this.now = options.now ?? Date.now
  }

  /** Um evento de uma conversa (o mesmo que o painel recebe). */
  onEvent(event: ChatEvent, conversation: string): void {
    const now = this.now()
    let tracked = this.conversations.get(conversation)
    if (!tracked) {
      tracked = {
        state: 'idle',
        busy: false,
        steps: [],
        block: null,
        text: '',
        pending: [],
        updatedAt: now
      }
      this.conversations.set(conversation, tracked)
    }
    switch (event.type) {
      case 'user':
        // Um turno novo: os passos e a resposta de antes saem.
        tracked.steps = []
        tracked.text = ''
        tracked.block = null
        delete tracked.reply
        tracked.state = 'working'
        break
      case 'busy':
        tracked.busy = event.busy
        if (event.busy && tracked.state !== 'waiting') tracked.state = 'working'
        break
      case 'tool-input': {
        const label = stepLabel(event.name, event.input)
        const step = tracked.steps.find((item) => item.id === event.id)
        if (step) step.label = label
        else tracked.steps.push({ id: event.id, label, status: 'running' })
        tracked.steps = tracked.steps.slice(-MAX_STEPS)
        break
      }
      case 'tool-result': {
        const step = tracked.steps.find((item) => item.id === event.id)
        if (!step) return
        step.status = event.isError ? 'error' : 'done'
        if (event.diff) {
          step.added = event.diff.added
          step.removed = event.diff.removed
        }
        break
      }
      case 'text':
        if (tracked.block !== event.blockId) {
          tracked.block = event.blockId
          tracked.text = ''
        }
        if (tracked.text.length < MAX_REPLY) tracked.text += event.delta
        break
      case 'turn-end':
        tracked.busy = false
        tracked.pending = []
        tracked.state =
          event.outcome === 'error' ? 'error' : event.outcome === 'stopped' ? 'idle' : 'done'
        if (tracked.text.trim()) tracked.reply = firstParagraph(tracked.text)
        for (const step of tracked.steps) if (step.status === 'running') step.status = 'done'
        break
      case 'permission-request':
        if (tracked.pending.some((item) => item.id === event.id)) return
        tracked.pending.push({
          id: event.id,
          toolName: event.toolName,
          input: event.input,
          ...(event.always ? { always: event.always } : {}),
          ...(event.site ? { site: event.site } : {}),
          ...(event.scope ? { scope: event.scope } : {}),
          at: now
        })
        tracked.state = 'waiting'
        break
      case 'permission-resolved':
        tracked.pending = tracked.pending.filter((item) => item.id !== event.id)
        if (!tracked.pending.length && tracked.state === 'waiting') {
          tracked.state = tracked.busy ? 'working' : 'idle'
        }
        break
      case 'reset':
        this.conversations.delete(conversation)
        return
      default:
        return
    }
    tracked.updatedAt = now
  }

  /** A aba fechou. */
  forget(conversation: string): void {
    this.conversations.delete(conversation)
  }

  /** As conversas e sessões para as pílulas: as que esperam, as que trabalham, as que acabaram. */
  tasks(): IslandTask[] {
    const now = this.now()
    const tasks: IslandTask[] = []
    for (const [id, tracked] of this.conversations) {
      const active = tracked.state === 'working' || tracked.state === 'waiting'
      if (!active && (tracked.state === 'idle' || now - tracked.updatedAt > RECENT_MS)) continue
      tasks.push({
        id: `c:${id}`,
        kind: 'conversation',
        title: this.options.title(id) || t('Nova conversa'),
        state: tracked.state,
        steps: tracked.steps.map((step) => ({ ...step })),
        ...(tracked.reply ? { reply: tracked.reply } : {}),
        updatedAt: tracked.updatedAt
      })
    }
    for (const session of this.options.sessions()) {
      const state = sessionState(session)
      const active = state === 'working' || state === 'waiting'
      if (!session.alive && !active && now - session.updatedAt > RECENT_MS) continue
      if (session.state === 'ended' && now - session.updatedAt > RECENT_MS) continue
      if (!active && state === 'idle' && !session.alive) continue
      tasks.push({
        id: `s:${session.id}`,
        kind: 'session',
        title: session.project,
        state,
        steps: sessionSteps(session),
        ...(session.lastMessage && !active ? { reply: firstParagraph(session.lastMessage) } : {}),
        updatedAt: session.updatedAt
      })
    }
    const rank = (task: IslandTask): number =>
      task.state === 'waiting' ? 0 : task.state === 'working' ? 1 : 2
    return tasks.sort((a, b) => rank(a) - rank(b) || b.updatedAt - a.updatedAt).slice(0, MAX_TASKS)
  }

  /** Os pedidos que esperam, do mais antigo para o mais novo. */
  alerts(): IslandAlert[] {
    const alerts: [number, IslandAlert][] = []
    for (const [id, tracked] of this.conversations) {
      const who = this.options.title(id) || t('Nova conversa')
      for (const pending of tracked.pending) {
        alerts.push([pending.at, buildAlert(pending, { task: `c:${id}`, who }, alwaysOf(pending))])
      }
    }
    for (const session of this.options.sessions()) {
      for (const request of session.requests) {
        const always =
          request.toolName === QUESTION_TOOL
            ? undefined
            : (request.scope ?? toolLabel(request.toolName))
        alerts.push([
          request.at,
          buildAlert(request, { task: `s:${session.id}`, who: session.project }, always)
        ])
      }
    }
    return alerts.sort((a, b) => a[0] - b[0]).map(([, alert]) => alert)
  }

  /** A conversa ou sessão dona de um pedido ("c:…" ou "s:…"); null se ele não espera mais. */
  ownerOf(requestId: string): string | null {
    return this.alerts().find((alert) => alert.id === requestId)?.task ?? null
  }
}
