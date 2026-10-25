// O estado de uma conversa com o Claude Code (a base do ClaudeSession): a sessão, o modo, o
// modelo, o provedor, o contexto, o custo e o fim de cada turno, sem o processo e sem o stream.

import type { ChildProcessWithoutNullStreams } from 'child_process'
import { randomUUID } from 'crypto'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type {
  ChatEvent,
  ContextUsage,
  ConversationCost,
  NoticeLevel,
  PermissionMode,
  Provider,
  TaskInfo
} from '../shared/ipc'
import { modeOf } from './claude-settings'
import type { ClaudeOptions } from './claude-settings'
import type { StatusInfo } from './hooks/status-line'
import { turnCost, turnTokens } from './openrouter'
import type { TurnUsage } from './openrouter'
import { t } from '../shared/i18n'

/** O tamanho da janela de contexto de cada modelo, como o CLI contou (vale para as próximas). */
export const CONTEXT_WINDOWS = new Map<string, number>()
/**
 * Depois do fim de um turno, quanto esperar o CLI pegar uma mensagem que ficou na fila (ele a
 * pega logo, como o turno seguinte).
 */
const QUEUE_GRACE_MS = 3000

/** Os campos e o que só mexe neles; o processo fica no ClaudeSession, a leitura no StreamReader. */
export abstract class SessionState {
  protected proc: ChildProcessWithoutNullStreams | null = null
  protected sessionId: string | null = null
  /** O CLI já registrou a sessão: os próximos processos a retomam com --resume. */
  protected sessionSaved = false
  /** A sessão veio do histórico e ainda não respondeu: pode não existir mais no Claude Code. */
  protected restored = false
  /** Pasta da sessão retomada de um terminal; null é o workspace do Wisp. */
  protected cwd: string | null = null
  /** Retomar como cópia (--fork-session): a sessão continua aberta no terminal. */
  protected fork = false
  /**
   * Retomar só até esta resposta (--resume-session-at), numa cópia: a última mensagem foi
   * editada (Fase 21). Vale para o próximo processo.
   */
  protected resumeAt: string | null = null
  /** A última resposta do turno atual (o uuid), para o fim do turno levar. */
  protected lastAssistant: string | null = null
  /** Caminho do CLI depois de uma checagem bem-sucedida; null força checar de novo. */
  protected bin: string | null = null
  protected busy = false
  /** Desde quando a conversa está parada (Fase 23: a aba parada há um tempo dorme). */
  protected idleSince = Date.now()
  /** O processo saiu porque a aba dormiu: a próxima mensagem o sobe de novo, pela sessão. */
  protected sleeping = false
  /** O texto do turno atual já foi escrito no processo (ainda não, enquanto copia os anexos). */
  protected sentText: string | null = null
  /**
   * O que foi escrito no processo e ele ainda não pegou, na ordem: o CLI devolve cada mensagem
   * (--replay-user-messages) quando a pega. `queued`: mandada com ele trabalhando.
   */
  protected echoes: { content: string; queued: boolean }[] = []
  /** Depois do fim de um turno, quanto esperar o CLI pegar o que ficou na fila. */
  protected queueTimer: NodeJS.Timeout | null = null
  /** Os comandos com barra que o CLI informou por último (para não repetir o evento). */
  protected commands = ''
  /** As tarefas rodando agora, pelo id. */
  protected readonly tasks = new Map<string, TaskInfo>()
  /** O turno atual já foi mandado de novo depois de o processo cair na largada. */
  protected retried = false
  protected stopping = false
  protected stopTimer: NodeJS.Timeout | null = null
  /** Muda a cada envio, parada ou conversa nova; descarta envios que ficaram para trás. */
  protected turn = 0
  protected messageId = ''
  protected fallbackBlocks = 0
  protected readonly streamedMessages = new Set<string>()
  /** Chamadas de HIDDEN_TOOLS em andamento, para descartar os resultados delas também. */
  protected readonly hiddenToolUses = new Set<string>()
  protected warnedApiKey = false
  protected warnedMcp = false
  /** O modo de permissão escolhido; o processo sobe com ele e recebe as trocas pelo stdin. */
  protected mode: PermissionMode
  /** Pedidos de troca de modo esperando resposta, com o modo de antes. */
  protected readonly modeRequests = new Map<string, PermissionMode>()
  /** O CLI avisou (rate_limit_event) que o limite do plano foi atingido; até quando, se disse. */
  protected planLimit: { resetsAt: number | null } | null = null
  /** Modelo escolhido na pílula; null é o padrão do Claude Code. */
  protected model: string | null
  /** O modelo com que o processo atual está (do --model ou do último set_model). */
  protected processModel: string | null = null
  /** O modelo que respondeu por último, como o CLI o chama ("claude-sonnet-5-5"). */
  protected activeModel: string | null = null
  /** Modelo que o CLI recusou; pedir o mesmo de novo (ao reabrir o painel) não adianta. */
  protected rejectedModel: string | null = null
  protected controlSeq = 0
  /** Por onde a conversa vai (assinatura ou OpenRouter). */
  protected provider: Provider
  /**
   * A pasta da conversa (um projeto aberto numa aba): vale para todo processo dela, mesmo
   * depois de uma conversa nova. null é o workspace do Wisp.
   */
  protected folder: string | null = null
  /** A chave da OpenRouter, lida do chaveiro na primeira mensagem. */
  protected secret: string | null = null
  /** O custo estimado da conversa pela OpenRouter (null até a primeira resposta). */
  protected cost: ConversationCost | null = null
  /** O contexto: tokens da última chamada ao modelo, a janela e se está compactando. */
  protected context: ContextUsage | null = null
  /** O custo de antes de o terminal subir (o do terminal soma a partir dele). */
  protected terminalCostBase: ConversationCost | null = null
  /** Pedidos de troca de modelo esperando resposta: o modelo pedido e o que havia antes. */
  protected readonly modelRequests = new Map<
    string,
    { requested: string | null; previous: string | null }
  >()

  constructor(
    protected readonly options: ClaudeOptions,
    protected readonly emit: (event: ChatEvent) => void
  ) {
    this.model = options.model
    this.mode = options.permissionMode
    this.provider = options.provider ?? 'subscription'
  }

  /** A pasta onde os processos desta conversa rodam (null: o workspace do Wisp). */
  setFolder(folder: string | null): void {
    this.folder = folder
  }

  get currentFolder(): string | null {
    return this.cwd ?? this.folder
  }

  get currentProvider(): Provider {
    return this.provider
  }

  /** O provedor, como o evento que o chat recebe. */
  providerEvent(): Extract<ChatEvent, { type: 'provider' }> {
    return { type: 'provider', provider: this.provider }
  }

  /** O contexto até agora (null antes da primeira resposta). */
  contextEvent(): Extract<ChatEvent, { type: 'context' }> | null {
    return this.context ? { type: 'context', context: this.context } : null
  }

  protected setContext(patch: Partial<ContextUsage>): void {
    const next: ContextUsage = {
      used: 0,
      window: CONTEXT_WINDOWS.get(this.activeModel ?? '') ?? null,
      compacting: false,
      ...this.context,
      ...patch
    }
    const same =
      this.context &&
      this.context.used === next.used &&
      this.context.window === next.window &&
      this.context.compacting === next.compacting
    this.context = next
    if (!same) this.emit({ type: 'context', context: next })
  }

  /** O custo estimado até agora (só pela OpenRouter, depois da primeira resposta). */
  costEvent(): Extract<ChatEvent, { type: 'cost' }> | null {
    return this.cost ? { type: 'cost', cost: this.cost } : null
  }

  get permissionMode(): PermissionMode {
    return this.mode
  }

  /** O modo vai para o arquivo que o hook do Bash lê. */
  protected writeModeFile(): void {
    const file = this.options.modeFile
    if (!file) return
    try {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
      writeFileSync(file, this.mode, { mode: 0o600 })
    } catch (err) {
      console.warn('[wisp] não consegui gravar o modo de permissão:', err)
    }
  }

  /** O CLI mudou de modo sozinho (o plano aprovado volta para o Pedir) ou não aceitou o pedido. */
  protected adoptMode(value: unknown, source: 'init' | 'status'): void {
    const mode = modeOf(value)
    if (!mode || mode === this.mode) return
    // Uma troca pedida ainda não chegou ao CLI: o modo velho no init é só atraso.
    if (source === 'init' && this.modeRequests.size) return
    const requested = this.mode
    this.mode = mode
    this.writeModeFile()
    this.emit({ type: 'mode', mode })
    // Na largada, um modo diferente do pedido vem de uma política da empresa ou de um modo que a
    // conta não tem (o Automático, por exemplo).
    if (source === 'init') {
      this.notice(
        'warning',
        t('O Claude Code começou no modo "{mode}", e não no "{requested}" que você escolheu.', {
          mode,
          requested
        })
      )
    }
  }

  /** Se há uma resposta em andamento (do envio até o fim do turno). */
  isBusy(): boolean {
    return this.busy
  }

  /** Há quanto tempo a conversa está parada, com o processo vivo (0: trabalhando ou sem processo). */
  idleFor(now = Date.now()): number {
    if (this.busy || !this.proc) return 0
    return now - this.idleSince
  }

  /** A aba dormiu e o processo saiu (a próxima mensagem retoma a sessão). */
  get asleep(): boolean {
    return this.sleeping
  }

  /** O modelo escolhido e o que respondeu por último, como o evento que o chat recebe. */
  modelEvent(): Extract<ChatEvent, { type: 'model' }> {
    return { type: 'model', choice: this.model, active: this.activeModel }
  }

  /** O id da conversa no Claude Code; gerado aqui na primeira vez. */
  ensureSessionId(): string {
    return (this.sessionId ??= randomUUID())
  }

  /**
   * Troca o modelo. Vale a partir da próxima mensagem: com o processo vivo, o pedido vai pelo
   * stdin logo antes dela; senão, o próximo processo já sobe com o --model.
   */
  setModel(model: string | null): void {
    if (model === this.model || model === this.rejectedModel) return
    this.rejectedModel = null
    this.model = model
    // Quem vai responder agora só se sabe na próxima mensagem.
    this.activeModel = null
    this.emit(this.modelEvent())
  }

  /**
   * O Claude Code do terminal começou uma resposta (ou terminou): a sessão existe a partir daí, e
   * os próximos processos a retomam. O id pode mudar (uma cópia, com --fork-session).
   */
  terminalTurn(busy: boolean, sessionId: unknown): void {
    if (typeof sessionId === 'string' && /^[\w-]{8,80}$/.test(sessionId)) {
      this.adoptSessionId(sessionId)
    } else if (busy && this.sessionId) {
      this.sessionSaved = true
    }
    this.restored = false
    this.setBusy(busy)
  }

  /** O Claude Code do terminal mudou de modo (o Shift+Tab de lá). */
  terminalMode(value: unknown): void {
    const mode = modeOf(value)
    if (!mode || mode === this.mode) return
    this.mode = mode
    this.writeModeFile()
    this.emit({ type: 'mode', mode })
  }

  /** O que a linha de status do terminal informou: o modelo, o contexto e os tokens. */
  terminalStatus(status: StatusInfo): void {
    if (status.model && status.model !== this.activeModel) {
      this.activeModel = status.model
      this.emit(this.modelEvent())
    }
    if (status.model && status.window) CONTEXT_WINDOWS.set(status.model, status.window)
    if (status.used !== null) {
      this.setContext({ used: status.used, ...(status.window ? { window: status.window } : {}) })
    }
    if (
      this.provider === 'openrouter' &&
      status.inputTokens !== null &&
      status.outputTokens !== null
    ) {
      void this.terminalCost(status.inputTokens, status.outputTokens)
    }
  }

  /**
   * O custo pela OpenRouter no terminal: o que a conversa já tinha mais os tokens do processo do
   * terminal, pelos preços da OpenRouter (sem o desconto do cache, que o terminal não detalha).
   */
  protected async terminalCost(input: number, output: number): Promise<void> {
    const model = this.model
    const session = this.sessionId
    const pricing = model ? await this.options.openrouter?.pricing(model).catch(() => null) : null
    if (session !== this.sessionId || this.provider !== 'openrouter') return
    const usd = turnCost({ input_tokens: input, output_tokens: output }, pricing ?? null)
    const base = this.terminalCostBase ?? { usd: 0, inputTokens: 0, outputTokens: 0, turns: 0 }
    this.cost = {
      usd: base.usd === null || usd === null ? null : base.usd + usd,
      inputTokens: base.inputTokens + input,
      outputTokens: base.outputTokens + output,
      turns: base.turns + 1
    }
    this.emit({ type: 'cost', cost: this.cost })
  }

  protected clearStop(): void {
    this.stopping = false
    if (this.stopTimer) clearTimeout(this.stopTimer)
    this.stopTimer = null
  }

  /** Soma o custo de uma resposta pela OpenRouter, pelos preços que ela publica. */
  protected async addCost(usage: TurnUsage): Promise<void> {
    const model = this.model
    const session = this.sessionId
    const pricing = model ? await this.options.openrouter?.pricing(model).catch(() => null) : null
    // A conversa recomeçou (ou trocou de provedor) enquanto os preços chegavam.
    if (session !== this.sessionId || this.provider !== 'openrouter') return
    const usd = turnCost(usage, pricing ?? null)
    const tokens = turnTokens(usage)
    const before = this.cost ?? { usd: 0, inputTokens: 0, outputTokens: 0, turns: 0 }
    this.cost = {
      usd: before.usd === null || usd === null ? null : before.usd + usd,
      inputTokens: before.inputTokens + tokens.input,
      outputTokens: before.outputTokens + tokens.output,
      turns: before.turns + 1
    }
    this.emit({ type: 'cost', cost: this.cost })
  }

  /**
   * O id que o CLI informou passa a ser o da conversa. Depois de uma cópia (--fork-session), é o
   * da cópia, e os próximos processos a retomam sem copiar de novo.
   */
  protected adoptSessionId(id: string): void {
    const changed = id !== this.sessionId
    this.sessionId = id
    this.sessionSaved = true
    if (!changed) return
    this.fork = false
    this.options.onSessionId?.(id)
  }

  protected notice(level: NoticeLevel, text: string): void {
    this.emit({ type: 'notice', level, text })
  }

  protected setBusy(busy: boolean): void {
    if (this.busy === busy) return
    this.busy = busy
    this.idleSince = Date.now()
    if (busy) this.sleeping = false
    this.emit({ type: 'busy', busy })
  }

  protected finishTurn(outcome: 'done' | 'error' | 'stopped'): void {
    if (!this.busy) return
    this.sentText = null
    const at = this.lastAssistant
    this.emit({ type: 'turn-end', outcome, ...(at ? { at } : {}) })
    // Mensagens mandadas no meio que o CLI ainda não pegou: num fim normal, ele as responde em
    // seguida, como um turno novo, e a conversa continua ocupada. Se ele não as pegar logo (a
    // resposta parou, deu erro), elas não chegam.
    if (this.echoes.some((echo) => echo.queued)) {
      if (!this.proc) this.dropQueue()
      else {
        this.armQueueTimer()
        if (outcome === 'done') return
      }
    }
    this.setBusy(false)
  }

  protected armQueueTimer(): void {
    if (this.queueTimer) clearTimeout(this.queueTimer)
    this.queueTimer = setTimeout(() => {
      this.queueTimer = null
      if (!this.echoes.some((echo) => echo.queued) || this.sentText !== null) return
      this.dropQueue()
      this.setBusy(false)
    }, QUEUE_GRACE_MS)
  }

  /** As mensagens da fila não vão chegar (a página as marca como não entregues). */
  protected dropQueue(): void {
    if (this.queueTimer) clearTimeout(this.queueTimer)
    this.queueTimer = null
    const had = this.echoes.some((echo) => echo.queued)
    this.echoes = []
    if (had) this.emit({ type: 'queue-dropped' })
  }
}
