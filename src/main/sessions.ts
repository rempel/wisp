import { randomUUID } from 'crypto'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import type {
  ExternalSession,
  ExternalState,
  ExternalStep,
  FileDiff,
  SessionAnswer
} from '../shared/ipc'
import type { RelayEvent, RelayReply } from './hooks/protocol'
import type { PendingReply } from './hooks/server'
import { DATA_DIR } from './paths'
import { permissionScope } from './permission-scope'
import type { Scope } from './permission-scope'
import { checkAnswers, parseQuestions, QUESTION_TOOL } from './questions'
import { t } from '../shared/i18n'

/** ~/.local/share/wisp/sessoes.json: as sessões recentes, para a lista sobreviver ao app fechar. */
const STORE = join(DATA_DIR, 'sessoes.json')
const MAX_SESSIONS = 30
const MAX_STEPS = 40
/** De quanto em quanto tempo o Wisp confere se um pedido foi respondido no terminal. */
const TRANSCRIPT_POLL_MS = 1000
/** Espera antes de medir o transcript: a mensagem com a chamada pode estar sendo gravada. */
const TRANSCRIPT_SETTLE_MS = 1500
/** De quanto em quanto tempo o Wisp confere se o processo do Claude Code ainda existe. */
const ALIVE_POLL_MS = 10_000
const SAVE_DELAY_MS = 1000

/** Por que o Wisp chama a atenção do usuário. */
export type Attention = 'request' | 'done' | 'error'

export interface SessionsOptions {
  /** Algo mudou na lista (a aba Sessões busca de novo). */
  onChange(): void
  onAttention(kind: Attention, session: ExternalSession): void
  store?: string
}

interface Request {
  id: string
  toolName: string
  input: unknown
  at: number
  inputHash: string | null
  /** Até onde o "Permitir sempre" vale (permission-scope.ts). */
  scope: Scope
  pending: PendingReply
  /** Tamanho do transcript depois de assentar; se crescer, o pedido foi respondido no terminal. */
  transcriptSize: number | null
}

interface Tracked {
  id: string
  cwd: string
  project: string
  state: ExternalState
  /** Hora do evento que definiu o estado; eventos mais velhos não mudam o estado. */
  stateAt: number
  startedAt: number
  updatedAt: number
  prompt?: string
  lastMessage?: string
  error?: string
  model?: string
  steps: ExternalStep[]
  requests: Request[]
  alive: boolean
  pid: number | null
  env: Record<string, string>
  transcript: string | null
  alwaysAllowed: Set<string>
}

/** O que fica gravado de uma sessão. */
type Stored = Pick<
  Tracked,
  | 'id'
  | 'cwd'
  | 'project'
  | 'state'
  | 'startedAt'
  | 'updatedAt'
  | 'prompt'
  | 'lastMessage'
  | 'error'
  | 'model'
>

const str = (value: unknown, max = 4000): string | undefined =>
  typeof value === 'string' && value ? value.slice(0, max) : undefined

/** Os campos da entrada que a lista de passos mostra; o resto (um arquivo inteiro) fica de fora. */
const STEP_FIELDS = [
  'file_path',
  'notebook_path',
  'command',
  'pattern',
  'query',
  'url',
  'description'
]

function stepInput(input: unknown): Record<string, string> {
  const fields = (input ?? {}) as Record<string, unknown>
  const kept: Record<string, string> = {}
  for (const key of STEP_FIELDS) {
    const value = str(fields[key], 300)
    if (value) kept[key] = value
  }
  return kept
}

function sizeOf(path: string | null): number | null {
  if (!path) return null
  try {
    return statSync(path).size
  } catch {
    return null
  }
}

/**
 * As sessões do Claude Code que rodam fora do Wisp, montadas a partir dos hooks: estado, passos,
 * pedidos de permissão esperando resposta.
 *
 * Os hooks em segundo plano podem chegar fora de ordem. Cada evento traz a hora em que o hook
 * disparou, e um evento mais velho que o último que mudou o estado não muda o estado de novo.
 */
export class ExternalSessions {
  private readonly sessions = new Map<string, Tracked>()
  private readonly store: string
  private readonly timers: NodeJS.Timeout[] = []
  private saveTimer: NodeJS.Timeout | null = null

  constructor(private readonly options: SessionsOptions) {
    this.store = options.store ?? STORE
    this.load()
    this.timers.push(
      setInterval(() => this.checkTranscripts(), TRANSCRIPT_POLL_MS),
      setInterval(() => this.checkAlive(), ALIVE_POLL_MS)
    )
  }

  /** Um evento vindo do relay. `pending` só vem nos pedidos de permissão. */
  handle(message: RelayEvent, pending: PendingReply | null): void {
    const input = message.input
    const id = str(input.session_id, 100)
    if (!id) {
      pending?.reply({ decision: null })
      return
    }
    const session = this.track(id, message)
    const at = message.at
    const subagent = typeof input.agent_id === 'string'
    switch (message.event) {
      case 'SessionStart':
        session.model = str(input.model, 100) ?? session.model
        this.setState(session, 'idle', at)
        break
      case 'UserPromptSubmit':
        session.prompt = str(input.prompt)
        session.error = undefined
        // Uma mensagem nova: o que estava pendente já não vale.
        this.cancelRequests(session)
        this.setState(session, 'working', at)
        break
      case 'PreToolUse':
        this.step(session, message, 'running', subagent)
        if (!subagent && !session.requests.length) this.setState(session, 'working', at)
        break
      case 'PostToolUse':
      case 'PostToolUseFailure':
        this.step(session, message, message.event === 'PostToolUse' ? 'done' : 'error', subagent)
        // A ferramenta rodou ou falhou: se havia um pedido dela, ele foi respondido no terminal.
        this.cancelRequests(session, message.inputHash ?? null)
        if (!subagent && !session.requests.length) this.setState(session, 'working', at)
        break
      case 'PermissionRequest':
        if (pending) this.request(session, message, pending)
        break
      case 'Stop':
        session.lastMessage = str(input.last_assistant_message) ?? session.lastMessage
        this.cancelRequests(session)
        this.closeSteps(session)
        if (this.setState(session, 'idle', at)) this.options.onAttention('done', this.view(session))
        this.save()
        break
      case 'StopFailure':
        session.error = str(input.error, 500) ?? 'erro'
        session.lastMessage = str(input.last_assistant_message) ?? session.lastMessage
        this.cancelRequests(session)
        this.closeSteps(session)
        if (this.setState(session, 'error', at))
          this.options.onAttention('error', this.view(session))
        this.save()
        break
      case 'SessionEnd':
        this.cancelRequests(session)
        this.closeSteps(session)
        this.setState(session, 'ended', at)
        this.save()
        break
    }
    if (message.event !== 'PermissionRequest') pending?.reply({ decision: null })
    this.options.onChange()
  }

  /** As sessões para a aba: as que pedem algo primeiro, depois as vivas, depois as encerradas. */
  list(): ExternalSession[] {
    const rank = (session: Tracked): number =>
      session.requests.length ? 0 : session.state === 'ended' ? 2 : 1
    return [...this.sessions.values()]
      .sort((a, b) => rank(a) - rank(b) || b.updatedAt - a.updatedAt)
      .map((session) => this.view(session))
  }

  /** Quantos pedidos esperam resposta, somando todas as sessões. */
  pendingCount(): number {
    let count = 0
    for (const session of this.sessions.values()) count += session.requests.length
    return count
  }

  /** A sessão como a aba a mostra. */
  get(id: string): ExternalSession | null {
    const session = this.sessions.get(id)
    return session ? this.view(session) : null
  }

  /** O que o Wisp sabe para achar o terminal e a pasta de uma sessão. */
  locate(
    id: string
  ): { pid: number | null; env: Record<string, string>; cwd: string; alive: boolean } | null {
    const session = this.sessions.get(id)
    return session
      ? { pid: session.pid, env: session.env, cwd: session.cwd, alive: session.alive }
      : null
  }

  /** Responde um pedido pelo card. false se o pedido já não existe ou a resposta não serve. */
  answer(sessionId: string, requestId: string, answer: SessionAnswer): boolean {
    const session = this.sessions.get(sessionId)
    const request = session?.requests.find((item) => item.id === requestId)
    if (!session || !request) return false
    const question = request.toolName === QUESTION_TOOL
    let reply: RelayReply
    if ('answers' in answer) {
      if (!question) return false
      if (answer.answers === null) {
        reply = { decision: 'deny', message: t('O usuário preferiu não responder.') }
      } else {
        const questions = parseQuestions(request.input)
        const checked = questions && checkAnswers(questions, answer.answers)
        if (!checked) return false
        reply = { decision: 'answer', answers: checked }
      }
    } else {
      // Uma pergunta só se responde com respostas (ou indo para o terminal).
      if (question && answer.decision !== 'terminal') return false
      switch (answer.decision) {
        case 'allow-always':
          session.alwaysAllowed.add(request.scope.key)
          reply = { decision: 'allow' }
          break
        case 'allow':
          reply = { decision: 'allow' }
          break
        case 'deny':
          reply = { decision: 'deny', message: t('O usuário negou pelo Wisp.') }
          break
        default:
          reply = { decision: null }
      }
    }
    this.removeRequest(session, request)
    request.pending.reply(reply)
    if (!session.requests.length && session.state === 'waiting') {
      this.setState(session, 'working', Date.now())
    }
    this.options.onChange()
    return true
  }

  /** Tira uma sessão da lista (se ela não estiver rodando). */
  forget(id: string): void {
    const session = this.sessions.get(id)
    if (!session || (session.alive && session.state !== 'ended')) return
    this.cancelRequests(session)
    this.sessions.delete(id)
    this.save()
    this.options.onChange()
  }

  /** O app está fechando: os pedidos pendentes voltam para o terminal. */
  dispose(): void {
    for (const timer of this.timers) clearInterval(timer)
    for (const session of this.sessions.values()) this.cancelRequests(session)
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.writeStore()
    }
  }

  private track(id: string, message: RelayEvent): Tracked {
    const input = message.input
    let session = this.sessions.get(id)
    const cwd = str(input.cwd, 1000) ?? session?.cwd ?? ''
    if (!session) {
      session = {
        id,
        cwd,
        project: basename(cwd) || cwd || t('sessão'),
        state: 'idle',
        stateAt: 0,
        startedAt: message.at,
        updatedAt: message.at,
        steps: [],
        requests: [],
        alive: true,
        pid: null,
        env: {},
        transcript: null,
        alwaysAllowed: new Set()
      }
      this.sessions.set(id, session)
      this.trim()
    }
    // Um processo novo (retomada da mesma sessão, ou o Wisp reabriu) traz a sessão de volta.
    if (message.pid !== session.pid) session.alwaysAllowed.clear()
    session.pid = message.pid
    session.alive = true
    session.env = message.env
    session.cwd = cwd
    session.project = basename(cwd) || session.project
    session.transcript = str(input.transcript_path, 2000) ?? session.transcript
    session.updatedAt = Math.max(session.updatedAt, message.at)
    return session
  }

  /** Muda o estado se o evento não for mais velho que o último que o mudou. */
  private setState(session: Tracked, state: ExternalState, at: number): boolean {
    if (at < session.stateAt) return false
    const changed = session.state !== state
    session.state = state
    session.stateAt = at
    return changed
  }

  private step(
    session: Tracked,
    message: RelayEvent,
    status: ExternalStep['status'],
    subagent: boolean
  ): void {
    const input = message.input
    const tool = str(input.tool_name, 200) ?? '?'
    const id = str(input.tool_use_id, 200) ?? `${tool}-${message.at}`
    const diff: FileDiff | undefined = message.diff
    const existing = session.steps.find((item) => item.id === id)
    if (existing) {
      // Não volta atrás: o "começou" que chega depois do resultado não muda nada.
      if (status === 'running' && existing.status !== 'running') return
      existing.status = status
      if (diff) existing.diff = diff
      return
    }
    const step: ExternalStep = {
      id,
      tool,
      input: stepInput(input.tool_input),
      status,
      at: message.at,
      ...(diff ? { diff } : {}),
      ...(subagent ? { subagent } : {})
    }
    // Na ordem em que os hooks dispararam.
    const index = session.steps.findIndex((item) => item.at > step.at)
    if (index < 0) session.steps.push(step)
    else session.steps.splice(index, 0, step)
    if (session.steps.length > MAX_STEPS) session.steps.splice(0, session.steps.length - MAX_STEPS)
  }

  /** O turno acabou: um passo que não terminou não vai terminar. */
  private closeSteps(session: Tracked): void {
    for (const step of session.steps) if (step.status === 'running') step.status = 'error'
  }

  private request(session: Tracked, message: RelayEvent, pending: PendingReply): void {
    const input = message.input
    const toolName = str(input.tool_name, 200) ?? '?'
    const scope = permissionScope(toolName, input.tool_input)
    if (toolName !== QUESTION_TOOL && session.alwaysAllowed.has(scope.key)) {
      pending.reply({ decision: 'allow' })
      return
    }
    const request: Request = {
      id: randomUUID(),
      toolName,
      input: input.tool_input,
      at: message.at,
      inputHash: message.inputHash ?? null,
      scope,
      pending,
      transcriptSize: null
    }
    session.requests.push(request)
    pending.onClose(() => {
      if (this.removeRequest(session, request)) this.options.onChange()
    })
    // A medida do transcript sai depois de assentar (veja checkTranscripts).
    setTimeout(() => {
      if (session.requests.includes(request)) request.transcriptSize = sizeOf(session.transcript)
    }, TRANSCRIPT_SETTLE_MS)
    this.setState(session, 'waiting', message.at)
    this.options.onAttention('request', this.view(session))
  }

  private removeRequest(session: Tracked, request: Request): boolean {
    const index = session.requests.indexOf(request)
    if (index < 0) return false
    session.requests.splice(index, 1)
    return true
  }

  /**
   * Devolve ao terminal os pedidos da sessão (todos, ou só o da chamada com este hash): o relay
   * sai sem decidir e o card some.
   */
  private cancelRequests(session: Tracked, inputHash?: string | null): void {
    for (const request of [...session.requests]) {
      if (inputHash !== undefined && (inputHash === null || request.inputHash !== inputHash)) {
        continue
      }
      this.removeRequest(session, request)
      request.pending.reply({ decision: null })
    }
    if (!session.requests.length && session.state === 'waiting') {
      this.setState(session, 'working', Date.now())
    }
  }

  /**
   * Um pedido respondido no terminal não avisa o hook. Mas o Claude Code grava a resposta no
   * transcript da sessão, que fica parado enquanto o diálogo espera: se ele cresceu, o pedido
   * foi respondido lá.
   */
  private checkTranscripts(): void {
    let changed = false
    for (const session of this.sessions.values()) {
      for (const request of [...session.requests]) {
        if (request.transcriptSize === null) continue
        const size = sizeOf(session.transcript)
        if (size !== null && size > request.transcriptSize) {
          this.removeRequest(session, request)
          request.pending.reply({ decision: null })
          changed = true
        }
      }
      if (changed && !session.requests.length && session.state === 'waiting') {
        this.setState(session, 'working', Date.now())
      }
    }
    if (changed) this.options.onChange()
  }

  /** Um Claude Code fechado sem o SessionEnd (terminal fechado, kill) vira sessão encerrada. */
  private checkAlive(): void {
    let changed = false
    for (const session of this.sessions.values()) {
      if (!session.alive || !session.pid) continue
      try {
        process.kill(session.pid, 0)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ESRCH') continue
        session.alive = false
        this.cancelRequests(session)
        this.closeSteps(session)
        if (session.state !== 'ended') this.setState(session, 'ended', Date.now())
        changed = true
      }
    }
    if (changed) {
      this.save()
      this.options.onChange()
    }
  }

  private view(session: Tracked): ExternalSession {
    return {
      id: session.id,
      cwd: session.cwd,
      project: session.project,
      state: session.state,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      prompt: session.prompt,
      lastMessage: session.lastMessage,
      error: session.error,
      model: session.model,
      steps: session.steps,
      requests: session.requests.map(({ id, toolName, input, at, scope }) => ({
        id,
        toolName,
        input,
        at,
        ...(scope.label ? { scope: scope.label } : {}),
        ...(scope.exact ? { exact: true } : {})
      })),
      alive: session.alive && session.state !== 'ended'
    }
  }

  /** Fica com as MAX_SESSIONS mais recentes (as que pedem algo nunca saem). */
  private trim(): void {
    const old = [...this.sessions.values()]
      .filter((session) => !session.requests.length)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(MAX_SESSIONS)
    for (const session of old) this.sessions.delete(session.id)
  }

  private load(): void {
    let stored: unknown
    try {
      stored = JSON.parse(readFileSync(this.store, 'utf8'))
    } catch {
      return
    }
    if (!Array.isArray(stored)) return
    for (const item of stored.slice(0, MAX_SESSIONS) as Partial<Stored>[]) {
      if (typeof item?.id !== 'string' || typeof item.cwd !== 'string') continue
      // Até um hook dela chegar, não dá para saber se ainda roda: fica como encerrada.
      this.sessions.set(item.id, {
        id: item.id,
        cwd: item.cwd,
        project: typeof item.project === 'string' ? item.project : basename(item.cwd),
        state: item.state === 'error' ? 'error' : 'ended',
        stateAt: 0,
        startedAt: Number(item.startedAt) || 0,
        updatedAt: Number(item.updatedAt) || 0,
        prompt: str(item.prompt),
        lastMessage: str(item.lastMessage),
        error: str(item.error, 500),
        model: str(item.model, 100),
        steps: [],
        requests: [],
        alive: false,
        pid: null,
        env: {},
        transcript: null,
        alwaysAllowed: new Set()
      })
    }
  }

  private save(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.writeStore()
    }, SAVE_DELAY_MS)
  }

  private writeStore(): void {
    const stored: Stored[] = [...this.sessions.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SESSIONS)
      .map(
        ({ id, cwd, project, state, startedAt, updatedAt, prompt, lastMessage, error, model }) => ({
          id,
          cwd,
          project,
          state,
          startedAt,
          updatedAt,
          prompt,
          lastMessage,
          error,
          model
        })
      )
    try {
      mkdirSync(dirname(this.store), { recursive: true, mode: 0o700 })
      const tmp = `${this.store}.tmp`
      writeFileSync(tmp, JSON.stringify(stored), { mode: 0o600 })
      renameSync(tmp, this.store)
    } catch (err) {
      console.warn('[wisp] não consegui gravar as sessões recentes:', err)
    }
  }
}
