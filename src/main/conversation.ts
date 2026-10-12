import { randomUUID } from 'crypto'
import { homedir } from 'os'
import { BROWSER_PREFIX, BrowserPolicy } from './browser-policy'
import { ClaudeSession } from './claude'
import type { ClaudeOptions } from './claude'
import { History, titleOf } from './history'
import type { ConversationSeed, SavedConversation } from './history'
import type { Approval, ApprovalRequest } from './mcp-server'
import { folderRisks, isTrusted, tilde, trustFolder } from './folders'
import { expandHome } from './paths'
import { EDIT_TOOLS, editAllowed, editedPath, permissionScope } from './permission-scope'
import { checkAnswers, parseQuestions, QUESTION_TOOL } from './questions'
import type {
  AttachmentPreview,
  ChatEvent,
  OutgoingAttachment,
  PermissionDecision,
  PermissionMode,
  Provider
} from '../shared/ipc'

type PermissionRequestEvent = Extract<ChatEvent, { type: 'permission-request' }>

/** A ferramenta com que o Claude apresenta o plano, no modo Planejar. */
export const PLAN_TOOL = 'ExitPlanMode'
/** O card do Wisp para confiar numa pasta antes de o Claude Code rodar nela (Fase 15). */
export const TRUST_TOOL = 'wisp_trust_folder'

/** Para onde vão os eventos de uma conversa e o que ela pede ao painel. */
export interface ConversationHost {
  /**
   * Um evento da conversa. `live`: aconteceu agora (o mascote e os sons acompanham); senão, é a
   * reabertura de uma conversa guardada, que só vai para a página.
   */
  emit(conversation: Conversation, event: ChatEvent, live: boolean): void
  /** Chegou um card: o painel aparece, sem roubar o foco, com esta aba à vista. */
  attention(conversation: Conversation): void
  /** O título ou a pasta mudaram (a aba acompanha). */
  changed(conversation: Conversation): void
}

export interface ConversationOptions {
  id: string
  host: ConversationHost
  /** O que vale para todo processo do Claude Code: CLI, ferramentas liberadas, persona. */
  claude: Omit<ClaudeOptions, 'mcpConfig' | 'modeFile' | 'permissionMode' | 'model' | 'provider'>
  /** O --mcp-config desta conversa (o servidor desktop com o endereço dela). */
  mcpConfig?: () => string | undefined
  /** O arquivo do modo, que o hook do Bash lê. */
  modeFile?: string
  permissionMode: PermissionMode
  /** O modelo de cada provedor (o do config.json: model ou openrouterModel). */
  modelFor: (provider: Provider) => string | null
  /** Por onde a conversa começa. */
  provider: Provider
  /** A pasta onde a conversa roda (um projeto aberto numa aba); sem ela, o workspace do Wisp. */
  folder?: string | null
  /** Onde fica a lista das pastas confiáveis (os testes trocam). */
  trustFile?: string
  /** Pastas onde o Aceitar edições libera edições (as de projetos, do config.json). */
  projectRoots: () => string[]
  /** Pastas que valem mesmo sendo ocultas (o workspace do Wisp, os anexos). */
  trustedDirs: string[]
  /** Modo demonstração: as respostas são gravadas, e a conversa não vai para o histórico. */
  demo?: () => boolean
}

/** Uma prévia de anexo, para a conversa mostrar o que foi enviado. */
export type PreviewOf = (attachment: OutgoingAttachment) => AttachmentPreview

/**
 * Uma conversa do painel (uma aba): o processo do Claude Code, o histórico, os cards de
 * permissão esperando resposta, o que foi liberado "sempre" e o modo de permissão.
 */
export class Conversation {
  readonly id: string
  readonly session: ClaudeSession
  readonly history = new History()
  /** O título da aba: a primeira mensagem, ou o da conversa reaberta. */
  title: string | null = null
  /** A pasta de uma sessão trazida do terminal (para a aba mostrar o projeto). */
  project: string | null = null
  /** Quando chegou o card mais recente (o "não" falado nega os da conversa mais recente). */
  lastRequestAt = 0
  private readonly approvals = new Map<
    string,
    { scope: string; resolve: (approval: Approval) => void; event: PermissionRequestEvent }
  >()
  private readonly alwaysAllowed = new Set<string>()
  /** O navegador do Claude: sites liberados e em que página ele está (browser-policy.ts). */
  private readonly browser = new BrowserPolicy()
  /** A aba fechou: o que ainda chegar do processo é ignorado. */
  private disposed = false
  /** A pasta da conversa (null: o workspace do Wisp). */
  private folderPath: string | null = null
  /** O card de confiança na pasta, enquanto espera resposta. */
  private trusting: Promise<boolean> | null = null

  constructor(private readonly options: ConversationOptions) {
    this.id = options.id
    this.session = new ClaudeSession(
      {
        ...options.claude,
        mcpConfig: options.mcpConfig,
        modeFile: options.modeFile,
        permissionMode: options.permissionMode,
        model: options.modelFor(options.provider),
        provider: options.provider,
        folderGate: () => this.checkFolder(),
        onSessionId: (sessionId) => this.history.setSession(sessionId)
      },
      (event) => this.deliver(event)
    )
    this.history.provider = options.provider
    if (options.folder) this.setFolder(options.folder)
  }

  /** A pasta da conversa (null: o workspace do Wisp). */
  get folder(): string | null {
    return this.folderPath
  }

  /** A conversa passa a rodar nesta pasta (a aba mostra o nome dela). */
  private setFolder(folder: string | null): void {
    this.folderPath = folder
    this.session.setFolder(folder)
    this.history.cwd = folder
    this.project = folder ? (folder.split('/').pop() ?? null) : null
    this.options.host.emit(this, { type: 'folder', folder: folder ? tilde(folder) : null }, false)
  }

  /**
   * A pasta pode rodar o Claude Code? Sem hooks, comandos, ferramentas liberadas ou variáveis no
   * .claude dela, sim; com algum, só depois do card "Confiar nesta pasta", que vale até esses
   * arquivos mudarem.
   */
  checkFolder(): Promise<boolean> {
    const folder = this.folderPath
    if (!folder) return Promise.resolve(true)
    if (this.trusting) return this.trusting
    const risks = folderRisks(folder)
    if (!risks.items.length || isTrusted(folder, risks.fingerprint, this.options.trustFile)) {
      return Promise.resolve(true)
    }
    this.trusting = this.requestApproval({
      toolName: TRUST_TOOL,
      input: { path: tilde(folder), items: risks.items },
      toolUseId: `confiar-${Date.now()}`
    }).then((approval) => {
      this.trusting = null
      if (approval.allow) {
        trustFolder(folder, risks.fingerprint, this.options.trustFile)
        return true
      }
      this.notice(
        'warning',
        `Não confiei em ${tilde(folder)}: o Claude Code não roda nela. Para continuar, mande a ` +
          'mensagem de novo e clique em **Confiar nesta pasta**, ou abra outra pasta.'
      )
      return false
    })
    return this.trusting
  }

  get provider(): Provider {
    return this.session.currentProvider
  }

  /**
   * Troca o provedor da aba: a conversa recomeça (a atual fica no histórico), com o modelo
   * escolhido para o outro lado.
   */
  setProvider(provider: Provider): void {
    if (provider === this.provider) return
    this.session.setProvider(provider)
    this.history.provider = provider
    this.session.setModel(this.options.modelFor(provider))
  }

  /** O modelo volta a ser o do config.json (ele pode ter sido editado à mão). */
  syncModel(): void {
    this.session.setModel(this.options.modelFor(this.provider))
  }

  get busy(): boolean {
    return this.session.isBusy()
  }

  get mode(): PermissionMode {
    return this.session.permissionMode
  }

  /** O id da conversa no histórico (null enquanto nada foi dito). */
  get historyId(): string | null {
    return this.history.currentId()
  }

  /** Um evento novo: os cards, o "sempre", o navegador e o histórico acompanham. */
  deliver(event: ChatEvent): void {
    if (this.disposed) return
    // Turno encerrado (parado, com erro) ou conversa nova: nenhum pedido aberto vai ser usado.
    if (event.type === 'turn-end' || event.type === 'reset') this.cancelApprovals()
    if (event.type === 'reset') {
      this.alwaysAllowed.clear()
      if (this.title) {
        this.title = null
        // Numa pasta, a aba continua com o nome do projeto.
        this.project = this.folderPath ? (this.folderPath.split('/').pop() ?? null) : null
        this.options.host.changed(this)
      }
    }
    this.browser.track(event)
    this.history.record(event)
    this.options.host.emit(this, event, true)
  }

  /** Um aviso na conversa (fora do histórico, que só guarda o que o Claude Code disse). */
  notice(level: Extract<ChatEvent, { type: 'notice' }>['level'], text: string): void {
    this.options.host.emit(this, { type: 'notice', level, text }, true)
  }

  /**
   * Manda uma mensagem (a página já a mostra: a caixa na hora, o --ask e a voz pelo showUser).
   * Devolve false se a conversa está ocupada.
   */
  send(text: string, files: OutgoingAttachment[], preview: PreviewOf, voice = false): boolean {
    if (this.session.isBusy()) return false
    if (!text.trim() && !files.length) return false
    const previews = files.map(preview)
    if (!this.title) {
      this.title = titleOf(text, previews)
      this.options.host.changed(this)
    }
    // Uma conversa da demonstração não vai para o histórico: não há o que retomar depois.
    if (!this.options.demo?.()) {
      this.history.user(this.session.ensureSessionId(), text, previews, voice)
    } else {
      this.session.ensureSessionId()
    }
    void this.session.send(
      text,
      files.map((file) => file.path)
    )
    return true
  }

  /** Mostra na página uma mensagem que não veio da caixa (o --ask, a voz). */
  showUser(text: string, voice: boolean): void {
    this.options.host.emit(
      this,
      { type: 'user', text, attachments: [], ...(voice ? { voice } : {}) },
      false
    )
  }

  stop(): void {
    this.session.stop()
  }

  /** Recomeça a conversa da aba (Ctrl+K); o modo e o modelo continuam. */
  reset(): void {
    this.session.reset()
  }

  /** Compacta a conversa (o /compact do Claude Code). */
  compact(instructions?: string): void {
    if (!this.session.compact(instructions)) {
      this.notice(
        'info',
        this.session.isBusy()
          ? 'Espere a resposta terminar para compactar.'
          : 'Ainda não há o que compactar nesta conversa.'
      )
    }
  }

  setModel(model: string | null): void {
    this.session.setModel(model)
  }

  setMode(mode: PermissionMode): void {
    this.session.setPermissionMode(mode)
  }

  /** Reabre uma conversa do histórico: o que ela mostrava volta à página, e a próxima mensagem a retoma. */
  restore(saved: SavedConversation): ChatEvent[] {
    // Cada provedor tem as suas sessões no Claude Code: retoma pelo mesmo lado.
    this.setProvider(saved.provider ?? 'subscription')
    // A pasta da conversa vale também para uma conversa nova nesta aba (Ctrl+K).
    this.setFolder(saved.cwd ?? null)
    this.session.resume(saved.sessionId, { cwd: saved.cwd })
    this.history.continue(saved)
    this.title = saved.title
    this.options.host.changed(this)
    return [...saved.events, { type: 'restored', createdAt: saved.createdAt }]
  }

  /** Continua aqui uma sessão do terminal. */
  continueSession(
    seed: ConversationSeed & { sessionId: string; alive: boolean; project: string }
  ): void {
    // As sessões do terminal são do Claude Code da assinatura.
    this.setProvider('subscription')
    this.setFolder(seed.cwd)
    this.session.resume(seed.sessionId, { cwd: seed.cwd, fork: seed.alive })
    this.history.prepare({ cwd: seed.cwd, preface: seed.preface })
    this.title = seed.project
    this.project = seed.project
    this.options.host.changed(this)
  }

  /** O que a página precisa para mostrar esta conversa de novo (ela recarregou). */
  replay(): ChatEvent[] {
    const id = this.history.currentId()
    this.history.flush()
    const saved = id ? this.history.load(id) : null
    const events: ChatEvent[] = saved
      ? [...saved.events]
      : [...this.approvals.values()].map((approval) => approval.event)
    events.push(...this.initialEvents())
    if (this.session.isBusy()) events.push({ type: 'busy', busy: true })
    return events
  }

  /** O que a página recebe ao abrir: o provedor, o modelo, o modo e o custo de agora. */
  initialEvents(): ChatEvent[] {
    const cost = this.session.costEvent()
    const context = this.session.contextEvent()
    return [
      this.session.providerEvent(),
      { type: 'folder', folder: this.folderPath ? tilde(this.folderPath) : null },
      this.session.modelEvent(),
      { type: 'mode', mode: this.mode },
      ...(cost ? [cost] : []),
      ...(context ? [context] : [])
    ]
  }

  /** Quantos cards de permissão (não perguntas) esperam resposta. */
  pendingCount(): number {
    let count = 0
    for (const approval of this.approvals.values()) {
      if (approval.event.toolName !== QUESTION_TOOL) count++
    }
    return count
  }

  /** Tem este card? */
  owns(requestId: string): boolean {
    return this.approvals.has(requestId)
  }

  /** Nega os cards de permissão que esperam resposta (o "não" falado). */
  denyPending(): void {
    for (const [id, approval] of this.approvals) {
      if (approval.event.toolName === QUESTION_TOOL) continue
      this.approvals.delete(id)
      approval.resolve({ allow: false, message: 'Usuário negou' })
      this.deliver({ type: 'permission-resolved', id, decision: 'deny' })
    }
  }

  /** O Claude quer usar uma ferramenta que precisa de aprovação: decide pelo modo ou mostra o card. */
  requestApproval(request: ApprovalRequest): Promise<Approval> {
    if (request.signal?.aborted) {
      return Promise.resolve({ allow: false, message: 'O pedido foi cancelado.' })
    }
    const scope = permissionScope(request.toolName, request.input)
    let extra: Pick<PermissionRequestEvent, 'site' | 'always' | 'scope' | 'exact'> = {}
    if (request.toolName.startsWith(BROWSER_PREFIX)) {
      const verdict = this.browser.check(request.toolName, request.input)
      if (verdict.allow) return Promise.resolve({ allow: true })
      extra = {
        ...(verdict.site ? { site: verdict.site } : {}),
        always: verdict.always ? 'site' : 'none'
      }
    } else if (request.toolName === PLAN_TOOL || request.toolName === TRUST_TOOL) {
      // O plano tem os seus botões (aprovar e em que modo seguir); não há "sempre".
      extra = { always: 'none' }
    } else if (request.toolName !== QUESTION_TOOL && this.alwaysAllowed.has(scope.key)) {
      return Promise.resolve({ allow: true })
    } else if (this.acceptsEdit(request)) {
      return Promise.resolve({ allow: true })
    } else if (scope.label) {
      extra = { scope: scope.label, ...(scope.exact ? { exact: true } : {}) }
    }
    const id = randomUUID()
    return new Promise<Approval>((resolve) => {
      const event: PermissionRequestEvent = {
        type: 'permission-request',
        id,
        toolName: request.toolName,
        input: request.input,
        toolUseId: request.toolUseId,
        ...extra
      }
      this.approvals.set(id, { scope: scope.key, resolve, event })
      this.lastRequestAt = Date.now()
      // O Claude Code desistiu (Parar, turno encerrado, conexão fechada): o card some.
      request.signal?.addEventListener(
        'abort',
        () => {
          if (!this.approvals.delete(id)) return
          resolve({ allow: false, message: 'O pedido foi cancelado.' })
          this.deliver({ type: 'permission-resolved', id, decision: 'cancelled' })
        },
        { once: true }
      )
      // O painel aparece antes do evento, para o mascote já olhar para o lado certo.
      this.options.host.attention(this)
      this.deliver(event)
    })
  }

  /** A resposta a um card de permissão. Devolve false se o card não é desta conversa. */
  answer(id: string, decision: PermissionDecision): boolean {
    const approval = this.approvals.get(id)
    // Perguntas se respondem pelo answerQuestion: liberadas sem respostas, o Claude entenderia que
    // o usuário não respondeu.
    if (!approval || approval.event.toolName === QUESTION_TOOL) return false
    const plan = approval.event.toolName === PLAN_TOOL
    // Os botões do plano só valem no card do plano, e o "sempre" só fora dele.
    if (plan && decision === 'allow-always') return false
    if (!plan && (decision === 'allow-edits' || decision === 'allow-auto')) return false
    // A confiança numa pasta é só sim ou não.
    if (approval.event.toolName === TRUST_TOOL && decision !== 'allow' && decision !== 'deny') {
      return false
    }
    this.approvals.delete(id)
    if (decision === 'allow-always') {
      // No navegador, o "sempre" vale para o site; código na página e arquivos não têm "sempre".
      const { always, site } = approval.event
      if (always === 'site' && site) this.browser.allowSite(site)
      else if (!always) this.alwaysAllowed.add(approval.scope)
    }
    if (decision === 'deny') {
      approval.resolve({
        allow: false,
        message: plan
          ? 'O usuário quer continuar planejando. Pergunte o que ajustar no plano.'
          : 'Usuário negou'
      })
    } else if (decision === 'allow-edits' || decision === 'allow-auto') {
      // Aprovado o plano, o Claude Code passa para o modo escolhido (sem isso, volta ao Pedir).
      const mode: PermissionMode = decision === 'allow-edits' ? 'acceptEdits' : 'auto'
      approval.resolve({
        allow: true,
        updatedPermissions: [{ type: 'setMode', mode, destination: 'session' }]
      })
    } else {
      approval.resolve({ allow: true })
    }
    this.deliver({ type: 'permission-resolved', id, decision })
    return true
  }

  /** As respostas a uma pergunta do Claude (null pula). Devolve false se não é desta conversa. */
  answerQuestion(id: string, answers: unknown): boolean {
    const approval = this.approvals.get(id)
    if (!approval || approval.event.toolName !== QUESTION_TOOL) return false
    const input = approval.event.input as Record<string, unknown>
    if (answers === null) {
      this.approvals.delete(id)
      approval.resolve({ allow: false, message: 'O usuário preferiu não responder.' })
      this.deliver({ type: 'permission-resolved', id, decision: 'deny' })
      return true
    }
    const questions = parseQuestions(input)
    const checked = questions && checkAnswers(questions, answers)
    if (!checked) return true
    this.approvals.delete(id)
    approval.resolve({ allow: true, updatedInput: { ...input, answers: checked } })
    this.deliver({ type: 'permission-resolved', id, decision: 'answered', answers: checked })
    return true
  }

  /** A aba fechou ou o app está fechando: o processo do Claude Code vai embora. */
  dispose(): void {
    this.cancelApprovals()
    this.history.flush()
    this.session.dispose()
    this.disposed = true
  }

  /**
   * No modo Aceitar edições, o Wisp libera as edições de arquivos na pasta pessoal e nas pastas
   * de projetos, menos os ocultos (o Claude Code só libera sozinho a pasta de trabalho).
   */
  private acceptsEdit(request: ApprovalRequest): boolean {
    if (this.mode !== 'acceptEdits' || !EDIT_TOOLS.has(request.toolName)) return false
    const path = editedPath(request.input)
    const roots = [
      ...this.options.projectRoots().map(expandHome),
      ...(this.folderPath ? [this.folderPath] : [])
    ]
    return path !== null && editAllowed(path, roots, this.options.trustedDirs, homedir())
  }

  private cancelApprovals(): void {
    for (const [id, approval] of this.approvals) {
      approval.resolve({ allow: false, message: 'O usuário parou a resposta.' })
      this.approvals.delete(id)
      this.deliver({ type: 'permission-resolved', id, decision: 'cancelled' })
    }
  }
}
