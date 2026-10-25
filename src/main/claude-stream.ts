// A leitura da saída stream-json do Claude Code: o formato dos eventos (só os campos usados), os
// erros explicados em português e o StreamReader, que converte cada linha em ChatEvents.

import { diffFromResult } from '../shared/diff'
import { formatReset } from '../shared/format'
import type { PermissionMode, PlanUsage, TaskInfo, UsageWindow } from '../shared/ipc'
import { LOGIN_HINT } from './claude-cli'
import { CONTEXT_WINDOWS, SessionState } from './claude-state'
import { openrouterError, turnTokens } from './openrouter'
import type { TurnUsage } from './openrouter'
import { t } from '../shared/i18n'

/**
 * Ferramentas que não viram card de ferramenta: o ToolSearch só carrega outras ferramentas, as
 * perguntas (AskUserQuestion) já aparecem no card de pergunta e o plano (ExitPlanMode), no card
 * do plano.
 */
const HIDDEN_TOOLS = new Set(['ToolSearch', 'AskUserQuestion', 'ExitPlanMode'])

const MAX_TOOL_OUTPUT = 4000
/** Imagens de um resultado que viram miniatura no card. */
const MAX_TOOL_IMAGES = 4
/** Quantos comandos com barra a página recebe, no máximo. */
const MAX_COMMANDS = 300

// Formato da saída stream-json (só os campos usados aqui)

interface ContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
  /** Imagens: os bytes em base64. */
  source?: { type?: string; data?: unknown }
}

interface CliWindow {
  utilization?: unknown
  resetsAt?: unknown
}

interface CliEvent {
  type: string
  subtype?: string
  session_id?: string
  model?: string
  apiKeySource?: string
  permissionMode?: string
  mcp_servers?: { name: string; status: string }[]
  rate_limit_info?: {
    status?: string
    resetsAt?: number
    unifiedWindows?: { five_hour?: CliWindow; seven_day?: CliWindow }
  }
  /** Resposta a um control_request nosso. */
  response?: { subtype?: string; request_id?: string; error?: string }
  parent_tool_use_id?: string | null
  /** Detalhes estruturados do resultado de uma ferramenta (o diff do Edit e do Write). */
  tool_use_result?: unknown
  error?: string
  is_error?: boolean
  result?: string
  /** O id da mensagem no Claude Code (o --resume-session-at volta até ela). */
  uuid?: string
  /** Os tokens da resposta (no result). */
  usage?: TurnUsage
  event?: {
    type: string
    index?: number
    message?: { id: string }
    content_block?: ContentBlock
    delta?: { type: string; text?: string }
  }
  message?: { id?: string; content?: string | ContentBlock[]; usage?: TurnUsage }
  /** Os status do sistema: "compacting" enquanto compacta, e o resultado no fim. */
  status?: string | null
  compact_result?: string
  /** O marco da compactação: quem pediu e os tokens antes e depois. */
  compact_metadata?: { trigger?: string; pre_tokens?: number; post_tokens?: number }
  /** O uso por modelo (no result), com o tamanho da janela de contexto de cada um. */
  modelUsage?: Record<string, { contextWindow?: unknown }>
  /** Uma mensagem nossa, devolvida pelo --replay-user-messages quando o CLI a pega. */
  isReplay?: boolean
  /** Os comandos com barra da conversa (no init): skills, comandos do projeto e os do CLI. */
  slash_commands?: unknown
  /** As tarefas (task_started, task_notification): um comando, um subagente. */
  task_id?: string
  description?: string
  summary?: string
  is_backgrounded?: boolean
}

function toolOutputText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((block: ContentBlock) =>
      block.type === 'text'
        ? (block.text ?? '')
        : `[${block.type === 'image' ? 'imagem' : block.type}]`
    )
    .join('\n')
}

/** As imagens em base64 de um resultado de ferramenta. */
function toolImages(content: unknown): string[] {
  if (!Array.isArray(content)) return []
  return content.flatMap((block: ContentBlock) => {
    const source = block.type === 'image' ? block.source : undefined
    return source?.type === 'base64' && typeof source.data === 'string' ? [source.data] : []
  })
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n…` : text
}

function describeError(event: CliEvent): string {
  if (event.result) return event.result
  switch (event.subtype) {
    case 'error_max_turns':
      return t('A resposta parou porque atingiu o limite de turnos.')
    case 'error_during_execution':
      return t('Algo deu errado enquanto o Claude Code trabalhava.')
    default:
      return t('O Claude Code terminou com erro ({v1}).', { v1: event.subtype ?? 'desconhecido' })
  }
}

const LOGIN_ERROR = /not logged in|\/login|log in|authenticat|oauth token/i
const MODEL_ERROR =
  /issue with the selected model|model_not_found|model .{0,60}not (?:found|available)/i
const PLAN_LIMIT = /usage limit|limit reached|rate.?limit/i
const OVERLOADED = /overloaded|\b529\b/i
const NETWORK =
  /connection error|fetch failed|network|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i

/**
 * Explica os erros mais comuns em português, com o texto original como detalhe. `resetsAt` vem
 * do rate_limit_event, quando o CLI avisou que o limite do plano foi atingido.
 */
export function friendlyError(text: string, limited: boolean, resetsAt: number | null): string {
  const detail = t('\n\nDetalhe: `{v1}`', { v1: text.replace(/`/g, "'").slice(0, 300) })
  if (limited || PLAN_LIMIT.test(text)) {
    // Versões antigas do CLI mandam o horário no próprio texto: "...limit reached|1791613800".
    const when = resetsAt ?? Number(/\|(\d{10})\b/.exec(text)?.[1] ?? NaN)
    const free = Number.isFinite(when)
      ? t(' Ele libera de novo {v1}.', { v1: formatReset(when) })
      : ''
    return t('Você chegou ao limite de uso do seu plano do Claude.{free}', { free })
  }
  if (MODEL_ERROR.test(text)) {
    return (
      t('O modelo escolhido não existe ou não está liberado no seu plano. Troque de modelo na ') +
      t('pílula acima da caixa de texto e mande a mensagem de novo.') +
      detail
    )
  }
  if (OVERLOADED.test(text)) {
    return (
      t('Os servidores do Claude estão sobrecarregados agora. Tente de novo daqui a pouco.') +
      detail
    )
  }
  if (NETWORK.test(text)) {
    return (
      t('Não consegui falar com os servidores do Claude. Confira sua conexão com a internet e ') +
      t('tente de novo.') +
      detail
    )
  }
  return text
}

/** Uma janela de uso do rate_limit_event, ou null se ela não veio (CLI antigo, outro plano). */
function usageWindow(window: CliWindow | undefined): UsageWindow | null {
  const used = window?.utilization
  if (typeof used !== 'number' || !Number.isFinite(used)) return null
  const resetsAt = window?.resetsAt
  return {
    used: Math.min(Math.max(used, 0), 1),
    resetsAt: typeof resetsAt === 'number' && Number.isFinite(resetsAt) ? resetsAt : null
  }
}

/** Lê as linhas do processo e atualiza o estado da conversa (o ClaudeSession sobe o processo). */
export abstract class StreamReader extends SessionState {
  protected handleLine(line: string): void {
    let event: CliEvent
    try {
      event = JSON.parse(line) as CliEvent
    } catch {
      console.warn('[wisp] linha inesperada do claude:', line.slice(0, 200))
      return
    }
    // Os passos de um subagente vão para dentro do card dele (o Agente), não para a conversa.
    if (event.parent_tool_use_id) return this.onSubagent(event, event.parent_tool_use_id)

    switch (event.type) {
      case 'system':
        return this.onSystem(event)
      case 'stream_event':
        return this.onStreamEvent(event)
      case 'assistant':
        return this.onAssistant(event)
      case 'user':
        return this.onUser(event)
      case 'result':
        return this.onResult(event)
      case 'rate_limit_event':
        return this.onRateLimit(event)
      case 'control_response':
        return this.onControlResponse(event)
    }
  }

  protected onControlResponse(event: CliEvent): void {
    const response = event.response
    const id = response?.request_id
    if (id && this.modeRequests.has(id)) {
      const previous = this.modeRequests.get(id) as PermissionMode
      this.modeRequests.delete(id)
      if (response.subtype !== 'error') return
      // O processo continua no modo de antes, e a pílula volta para ele.
      const wanted = this.mode
      this.mode = previous
      this.writeModeFile()
      this.emit({ type: 'mode', mode: previous })
      this.notice(
        'warning',
        t('O Claude Code não aceitou o modo "{wanted}"', { wanted }) +
          (response.error ? ` (${response.error.replace(/`/g, "'")})` : '') +
          '. A conversa continua no modo de antes.'
      )
      return
    }
    const request = id ? this.modelRequests.get(id) : undefined
    if (!id || !request) return
    this.modelRequests.delete(id)
    if (response.subtype !== 'error') return
    // O processo continua com o modelo de antes, e a pílula volta para ele.
    this.rejectedModel = request.requested
    this.model = request.previous
    this.processModel = request.previous
    this.emit(this.modelEvent())
    this.notice(
      'warning',
      t('Não consegui trocar para o modelo `{v1}`', { v1: request.requested ?? t('padrão') }) +
        (response.error ? ` (${response.error.replace(/`/g, "'")})` : '') +
        '. A resposta vem do modelo anterior.'
    )
  }

  protected onRateLimit(event: CliEvent): void {
    const info = event.rate_limit_info
    if (!info) return
    const limited = info.status === 'rejected'
    this.planLimit = limited
      ? { resetsAt: typeof info.resetsAt === 'number' ? info.resetsAt : null }
      : null
    const session = usageWindow(info.unifiedWindows?.five_hour)
    const week = usageWindow(info.unifiedWindows?.seven_day)
    if (!session && !week) return
    const usage: PlanUsage = { session, week, limited, at: Date.now() }
    this.emit({ type: 'usage', usage })
  }

  protected onSystem(event: CliEvent): void {
    if (event.subtype === 'task_started' || event.subtype === 'task_notification') {
      return this.onTask(event)
    }
    // O CLI troca de modo sozinho: aprovar o plano, por exemplo, volta para o Pedir.
    if (event.subtype === 'status') {
      if (event.status === 'compacting') this.setContext({ compacting: true })
      else if ('compact_result' in event) this.setContext({ compacting: false })
      return this.adoptMode(event.permissionMode, 'status')
    }
    if (event.subtype === 'compact_boundary') {
      const meta = event.compact_metadata ?? {}
      const count = (value: unknown): number | null =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
      const after = count(meta.post_tokens)
      this.emit({
        type: 'compacted',
        trigger: meta.trigger === 'auto' ? 'auto' : 'manual',
        before: count(meta.pre_tokens),
        after
      })
      this.setContext({ compacting: false, ...(after !== null ? { used: after } : {}) })
      return
    }
    if (event.subtype !== 'init') return
    if (event.session_id) {
      this.adoptSessionId(event.session_id)
      this.restored = false
    }
    if (Array.isArray(event.slash_commands)) {
      const commands = [
        ...new Set(
          event.slash_commands.filter(
            (name): name is string => typeof name === 'string' && /^[\w:.-]{1,80}$/.test(name)
          )
        )
      ].slice(0, MAX_COMMANDS)
      const key = commands.join(' ')
      if (key !== this.commands) {
        this.commands = key
        this.emit({ type: 'commands', commands })
      }
    }
    if (event.model && event.model !== this.activeModel) {
      this.activeModel = event.model
      this.emit(this.modelEvent())
    }
    const desktop = event.mcp_servers?.find((server) => server.name === 'desktop')
    if (this.options.mcpConfig && desktop?.status !== 'connected' && !this.warnedMcp) {
      this.warnedMcp = true
      this.notice(
        'warning',
        t('As ferramentas do desktop não conectaram: abrir apps, links e projetos não vai ') +
          t('funcionar nesta conversa ({v1}).', { v1: desktop?.status ?? t('servidor ausente') })
      )
    }
    // Uma política gerenciada (ou uma conta sem o Automático) pode impor outro modo.
    this.adoptMode(event.permissionMode, 'init')
    // "none" é o login da assinatura; qualquer outra origem é uma chave de API.
    if (
      this.provider === 'subscription' &&
      event.apiKeySource &&
      event.apiKeySource !== 'none' &&
      !this.warnedApiKey
    ) {
      this.warnedApiKey = true
      this.notice(
        'warning',
        t('O Claude Code está usando uma chave de API ({apiKeySource}), cobrada por uso, ', {
          apiKeySource: event.apiKeySource
        }) + t('e não a sua assinatura.')
      )
    }
  }

  protected onStreamEvent(event: CliEvent): void {
    const ev = event.event
    if (!ev) return
    if (ev.type === 'message_start' && ev.message) {
      this.messageId = ev.message.id
    } else if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
      const { id, name = '?' } = ev.content_block
      if (!id) return
      if (HIDDEN_TOOLS.has(name)) this.hiddenToolUses.add(id)
      else this.emit({ type: 'tool-start', id, name })
    } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
      if (!ev.delta.text) return
      this.streamedMessages.add(this.messageId)
      this.emit({ type: 'text', blockId: `${this.messageId}:${ev.index}`, delta: ev.delta.text })
    }
  }

  protected onAssistant(event: CliEvent): void {
    const message = event.message
    if (typeof event.uuid === 'string' && !event.error) this.lastAssistant = event.uuid
    // O contexto da última chamada: o que entrou (com o cache) e o que saiu.
    if (message?.usage && !event.error) {
      const { input, output } = turnTokens(message.usage)
      if (input + output > 0) this.setContext({ used: input + output })
    }
    if (event.error === 'authentication_failed') {
      this.bin = null
      // Pela OpenRouter, quem explica é o fim do turno (a chave recusada).
      if (this.provider === 'openrouter') this.secret = null
      else this.notice('warning', LOGIN_HINT)
    }
    // Uma mensagem de erro (falha da API, limite) vem só com o texto cru do erro; o fim do turno
    // traz o mesmo erro, explicado no aviso.
    if (event.error) return
    if (!message?.id || !Array.isArray(message.content)) return
    for (const block of message.content) {
      if (block.type === 'tool_use' && block.id) {
        const { id, name = '?' } = block
        if (HIDDEN_TOOLS.has(name)) this.hiddenToolUses.add(id)
        else this.emit({ type: 'tool-input', id, name, input: block.input })
      } else if (block.type === 'text' && block.text && !this.streamedMessages.has(message.id)) {
        // Sem os eventos parciais, o texto só chega aqui, já inteiro.
        const blockId = `${message.id}:full${this.fallbackBlocks++}`
        this.emit({ type: 'text', blockId, delta: block.text })
      }
    }
  }

  protected onUser(event: CliEvent): void {
    if (event.isReplay) return this.onReplay(event)
    const content = event.message?.content
    if (!Array.isArray(content)) return
    const results = content.filter((block) => block.type === 'tool_result' && block.tool_use_id)
    for (const block of results) {
      const id = block.tool_use_id as string
      if (this.hiddenToolUses.delete(id)) continue
      // O tool_use_result vale para a mensagem toda; só dá para atribuí-lo com um resultado só.
      const diff = results.length === 1 ? diffFromResult(event.tool_use_result) : null
      const thumbnail = this.options.thumbnail
      const images = thumbnail
        ? toolImages(block.content)
            .slice(0, MAX_TOOL_IMAGES)
            .flatMap((data) => thumbnail(data) ?? [])
        : []
      this.emit({
        type: 'tool-result',
        id,
        isError: block.is_error === true,
        output: truncate(toolOutputText(block.content), MAX_TOOL_OUTPUT),
        ...(diff && !block.is_error ? { diff } : {}),
        ...(images.length ? { images } : {})
      })
    }
  }

  protected onResult(event: CliEvent): void {
    if (event.session_id) this.adoptSessionId(event.session_id)
    // O tamanho da janela de contexto vem no uso por modelo.
    for (const [model, usage] of Object.entries(event.modelUsage ?? {})) {
      const window = usage?.contextWindow
      if (typeof window !== 'number' || !Number.isFinite(window) || window <= 0) continue
      CONTEXT_WINDOWS.set(model, window)
      if (!this.activeModel || model === this.activeModel) this.setContext({ window })
    }
    if (this.provider === 'openrouter' && event.usage) void this.addCost(event.usage)
    // Pedimos a interrupção: o turno acaba como parado, seja qual for o resultado.
    if (this.stopping) {
      this.clearStop()
      return this.finishTurn('stopped')
    }
    if (!event.is_error) return this.finishTurn('done')
    const text = describeError(event)
    if (this.provider === 'openrouter') {
      const message = openrouterError(text, this.model)
      // A chave foi recusada: na próxima mensagem, ela é lida de novo do chaveiro.
      if (/recusou a chave/.test(message)) this.secret = null
      this.notice('error', message)
    } else if (LOGIN_ERROR.test(text)) {
      this.bin = null
      this.notice('warning', LOGIN_HINT)
    } else {
      this.notice(
        'error',
        friendlyError(text, this.planLimit !== null, this.planLimit?.resetsAt ?? null)
      )
    }
    this.finishTurn('error')
  }

  /**
   * O CLI pegou uma mensagem nossa. Se era uma da fila, a página a marca como entregue; se ele
   * a pegou depois do fim do turno, começa outro.
   */
  protected onReplay(event: CliEvent): void {
    const content = event.message?.content
    const text =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('')
          : ''
    const index = this.echoes.findIndex((echo) => echo.content === text)
    if (index < 0) return
    const [echo] = this.echoes.splice(index, 1)
    if (!echo.queued) return
    this.emit({ type: 'user-delivered' })
    if (this.sentText === null) {
      if (this.queueTimer) clearTimeout(this.queueTimer)
      this.queueTimer = null
      this.sentText = text
      this.setBusy(true)
    }
  }

  /** Um evento de um subagente: as ferramentas que ele chama e os resultados. */
  protected onSubagent(event: CliEvent, parent: string): void {
    const content = event.message?.content
    if (!Array.isArray(content)) return
    for (const block of content) {
      if (event.type === 'assistant' && block.type === 'tool_use' && block.id) {
        this.emit({
          type: 'subagent-step',
          parent,
          id: block.id,
          name: block.name ?? '?',
          input: block.input ?? null
        })
      } else if (event.type === 'user' && block.type === 'tool_result' && block.tool_use_id) {
        this.emit({
          type: 'subagent-step-end',
          parent,
          id: block.tool_use_id,
          isError: block.is_error === true
        })
      }
    }
  }

  /** Uma tarefa começou ou terminou (um comando, um subagente, rodando ou em segundo plano). */
  protected onTask(event: CliEvent): void {
    const id = event.task_id
    if (!id) return
    const known = this.tasks.get(id)
    const status: TaskInfo['status'] =
      event.subtype === 'task_started'
        ? 'running'
        : event.status === 'failed' || event.status === 'stopped' || event.status === 'killed'
          ? event.status === 'failed'
            ? 'failed'
            : 'stopped'
          : 'completed'
    const task: TaskInfo = {
      id,
      description: (event.description ?? event.summary ?? known?.description ?? '').slice(0, 200),
      status,
      background: event.is_backgrounded ?? known?.background ?? false
    }
    if (status === 'running') this.tasks.set(id, task)
    else this.tasks.delete(id)
    this.emit({ type: 'task', task })
  }
}
