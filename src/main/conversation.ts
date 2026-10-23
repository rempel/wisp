import { createHash, randomUUID } from 'crypto'
import { homedir } from 'os'
import { BROWSER_PREFIX, BrowserPolicy } from './browser-policy'
import { ClaudeSession } from './claude'
import type { ClaudeOptions } from './claude'
import { History, rewindPoint, titleOf } from './history'
import type { ConversationSeed, SavedConversation } from './history'
import type { Approval, ApprovalRequest } from './mcp-server'
import { folderRisks, isTrusted, tilde, trustFolder } from './folders'
import { expandHome } from './paths'
import { EDIT_TOOLS, editAllowed, editedPath, permissionScope } from './permission-scope'
import { copyAttachments, withAttachments } from './attachments'
import type { PendingReply } from './hooks/server'
import type { RelayEvent, RelayReply } from './hooks/protocol'
import { STATUS_EVENT } from './hooks/protocol'
import { readStatus } from './hooks/status-line'
import { checkAnswers, parseQuestions, QUESTION_TOOL } from './questions'
import { TerminalProcess } from './tui'
import type {
  AttachmentPreview,
  ChatEvent,
  ConversationView,
  OutgoingAttachment,
  PermissionDecision,
  PermissionMode,
  Provider
} from '../shared/ipc'

type PermissionRequestEvent = Extract<ChatEvent, { type: 'permission-request' }>

/** A ferramenta com que o Claude apresenta o plano, no modo Planejar. */
/** O tamanho máximo de um rascunho guardado (caracteres). */
const MAX_DRAFT = 20_000
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
  /** Saída do terminal do modo terminal, para a página (o xterm.js). */
  terminalData(conversation: Conversation, chunk: string): void
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
  /** O rascunho da caixa de texto (Fase 21): volta com a aba, ao abrir o Wisp de novo. */
  draft = ''
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
  /** O que a aba mostra: o chat ou o Claude Code de verdade, num terminal (Fase 17). */
  private viewMode: ConversationView = 'chat'
  /** O Claude Code do modo terminal (null: não está rodando). */
  private terminal: TerminalProcess | null = null
  /** Subindo o terminal (conferindo o CLI, a pasta, a chave). */
  private starting: Promise<void> | null = null
  /** O tamanho do terminal na página, para o próximo processo já nascer certo. */
  private terminalSize = { cols: 100, rows: 30 }
  /** Uma troca (modelo, modo) espera a resposta acabar para reiniciar o terminal. */
  private restartPending = false
  /** O id da ferramenta de cada entrada (pelo hash dela): liga o pedido de permissão ao card. */
  private readonly terminalTools = new Map<string, string>()
  /** Os pedidos de permissão do terminal esperando o card, pelo hash da entrada. */
  private readonly terminalWaiting = new Map<string, AbortController>()
  /** Quantas respostas do terminal já vieram (para os ids dos blocos de texto). */
  private terminalReplies = 0
  /** O Esc no terminal com uma resposta no meio: se nenhum hook chegar, ela parou. */
  private escTimer: NodeJS.Timeout | null = null

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
    this.restartTerminal()
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
   * Com o Claude trabalhando, ela vai para a fila: ele a recebe na próxima pausa, como no
   * terminal. Devolve false se não deu para mandar agora.
   */
  send(text: string, files: OutgoingAttachment[], preview: PreviewOf, voice = false): boolean {
    if (!text.trim() && !files.length) return false
    // No modo terminal, o texto vai colado no Claude Code (o hook dele registra a mensagem).
    if (this.viewMode === 'terminal') {
      void this.sendToTerminal(
        text,
        files.map((file) => file.path)
      )
      return true
    }
    if (this.session.isBusy()) {
      if (!this.session.canQueue()) return false
      if (!this.options.demo?.()) {
        this.history.user(this.session.ensureSessionId(), text, files.map(preview), voice, true)
      }
      void this.session.queue(
        text,
        files.map((file) => file.path)
      )
      return true
    }
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

  /** Guarda o rascunho da caixa (cortado em MAX_DRAFT). */
  setDraft(text: string): void {
    this.draft = text.slice(0, MAX_DRAFT)
  }

  /**
   * Troca a última mensagem por outra (Fase 21): a conversa volta, no Claude Code, para antes
   * dela (a resposta dela e o que veio depois saem do contexto) e a nova vai no lugar. A página
   * já tirou a velha e mostrou a nova. Devolve false (com um aviso) se não deu.
   */
  editLast(text: string, files: OutgoingAttachment[], preview: PreviewOf): boolean {
    if (!text.trim() && !files.length) return false
    if (this.viewMode === 'terminal' || this.session.isBusy()) return false
    const point = rewindPoint(this.history.events())
    if (!point) {
      this.notice(
        'warning',
        'Não deu para editar a última mensagem desta conversa: ela é de antes de o Wisp guardar ' +
          'onde voltar, ou veio do terminal. Mande a mensagem como uma nova.'
      )
      return false
    }
    if (!this.session.rewind(point.at)) return false
    this.history.record({ type: 'rewind' })
    if (point.at === null) {
      this.title = titleOf(text, files.map(preview))
      this.options.host.changed(this)
    }
    return this.send(text, files, preview)
  }

  /** Mostra na página uma mensagem que não veio da caixa (o --ask, a voz). */
  showUser(text: string, voice: boolean): void {
    // No terminal, a mensagem aparece nele, e o hook dela a leva ao histórico.
    if (this.viewMode === 'terminal') return
    const queued = this.session.isBusy()
    this.options.host.emit(
      this,
      {
        type: 'user',
        text,
        attachments: [],
        ...(voice ? { voice } : {}),
        ...(queued ? { queued } : {})
      },
      false
    )
  }

  /** Dá para mandar uma mensagem agora (parada, ou trabalhando e pronta para a fila)? */
  get canSend(): boolean {
    return !this.session.isBusy() || this.session.canQueue()
  }

  stop(): void {
    if (this.viewMode === 'terminal') {
      if (this.session.isBusy()) this.terminalInput('\x1b')
      return
    }
    this.session.stop()
  }

  /** Recomeça a conversa da aba (Ctrl+K); o modo e o modelo continuam. */
  reset(): void {
    this.session.reset()
    this.restartTerminal(true)
  }

  /** Compacta a conversa (o /compact do Claude Code). */
  compact(instructions?: string): void {
    if (this.viewMode === 'terminal') {
      if (this.session.isBusy()) {
        this.notice('info', 'Espere a resposta terminar para compactar.')
        return
      }
      const extra = (instructions ?? '').replace(/\s+/g, ' ').trim().slice(0, 500)
      this.terminal?.paste(extra ? `/compact ${extra}` : '/compact', true)
      return
    }
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
    this.restartTerminal()
  }

  setMode(mode: PermissionMode): void {
    if (mode === this.mode) return
    this.session.setPermissionMode(mode)
    this.restartTerminal()
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
    this.restartTerminal(true)
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
    this.restartTerminal(true)
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
      ...(context ? [context] : []),
      { type: 'view', view: this.viewMode },
      { type: 'terminal', terminal: this.terminalStatus() },
      ...(this.draft ? [{ type: 'draft' as const, text: this.draft }] : [])
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

  /**
   * A resposta a um card de permissão (`denial` troca o motivo da negação, para o Claude).
   * Devolve false se o card não é desta conversa.
   */
  answer(id: string, decision: PermissionDecision, denial?: string): boolean {
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
        message:
          denial ??
          (plan
            ? 'O usuário quer continuar planejando. Pergunte o que ajustar no plano.'
            : 'Usuário negou')
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
    if (this.escTimer) clearTimeout(this.escTimer)
    void this.terminal?.kill()
    this.terminal = null
    this.disposed = true
  }

  // ---- Modo terminal (Fase 17) ---------------------------------------------------------------

  get view(): ConversationView {
    return this.viewMode
  }

  /** A aba volta no modo terminal (ao abrir o Wisp): o processo sobe quando a aba aparecer. */
  presetView(view: ConversationView): void {
    this.viewMode = view
    this.options.host.emit(this, { type: 'view', view }, false)
  }

  /** A ficha do processo do terminal agora (os hooks dele trazem a mesma). */
  get terminalToken(): string | null {
    return this.terminal?.token ?? null
  }

  private terminalStatus(): Extract<ChatEvent, { type: 'terminal' }>['terminal'] {
    return this.terminal ? { state: 'running' } : { state: 'idle' }
  }

  private emitTerminal(terminal: Extract<ChatEvent, { type: 'terminal' }>['terminal']): void {
    this.options.host.emit(this, { type: 'terminal', terminal }, false)
  }

  /**
   * Troca entre o chat e o terminal. A conversa é a mesma (o Claude Code retoma a sessão), então
   * só dá com ela parada.
   */
  async setView(view: ConversationView): Promise<void> {
    if (view === this.viewMode || this.disposed) return
    if (this.session.isBusy()) {
      this.notice('info', 'Espere a resposta terminar para trocar entre o chat e o terminal.')
      return
    }
    this.viewMode = view
    this.options.host.emit(this, { type: 'view', view }, false)
    this.options.host.changed(this)
    if (view === 'terminal') await this.startTerminal()
    else await this.stopTerminal()
  }

  /**
   * A página abriu o terminal da aba: o que ele já mostrou, para repor a tela. Sobe o processo se
   * ele ainda não estiver rodando (uma aba que voltou no modo terminal sobe só quando aparece).
   */
  attachTerminal(): string {
    if (this.viewMode === 'terminal' && !this.terminal) void this.startTerminal()
    return this.terminal?.snapshot() ?? ''
  }

  /** O que a pessoa digitou no terminal. */
  terminalInput(data: string): void {
    const terminal = this.terminal
    if (!terminal) return
    terminal.write(data)
    // Esc (ou Ctrl+C) com uma resposta no meio a interrompe, e nenhum hook avisa: se nada
    // chegar logo, a resposta parou.
    if ((data === '\x1b' || data === '\x03') && this.session.isBusy()) {
      if (this.escTimer) clearTimeout(this.escTimer)
      this.escTimer = setTimeout(() => {
        this.escTimer = null
        if (!this.session.isBusy() || this.terminal !== terminal) return
        this.cancelApprovals()
        this.deliver({ type: 'turn-end', outcome: 'stopped' })
        this.session.terminalTurn(false, null)
        this.afterTerminalTurn()
      }, 600)
    }
  }

  resizeTerminal(cols: number, rows: number): void {
    this.terminalSize = { cols, rows }
    this.terminal?.resize(cols, rows)
  }

  private startTerminal(): Promise<void> {
    if (this.terminal || this.disposed) return Promise.resolve()
    if (this.starting) return this.starting
    this.starting = (async () => {
      const terminal = new TerminalProcess(
        {
          data: (chunk) => {
            if (this.terminal === terminal) this.options.host.terminalData(this, chunk)
          },
          exit: (code) => {
            if (this.terminal !== terminal) return
            this.terminal = null
            if (this.session.isBusy()) {
              this.cancelApprovals()
              this.deliver({ type: 'turn-end', outcome: 'error' })
              this.session.terminalTurn(false, null)
            }
            this.options.host.terminalData(
              this,
              `\r\n\x1b[2m[O Claude Code saiu${code ? ` com o código ${code}` : ''}. ` +
                'Mande uma mensagem ou troque de modo para abrir de novo.]\x1b[0m\r\n'
            )
            this.emitTerminal({ state: 'exited', code })
          }
        },
        this.terminalSize.cols,
        this.terminalSize.rows
      )
      const launch = await this.session.terminalLaunch(terminal.token)
      if (!launch || this.disposed || this.viewMode !== 'terminal') {
        // Não deu (o aviso explica): a aba volta para o chat, onde o aviso aparece.
        if (!launch && this.viewMode === 'terminal' && !this.disposed) {
          this.viewMode = 'chat'
          this.options.host.emit(this, { type: 'view', view: 'chat' }, false)
          this.options.host.changed(this)
        }
        return
      }
      this.terminalTools.clear()
      this.terminal = terminal
      // A tela começa limpa (o processo anterior, se houve, já saiu).
      this.options.host.terminalData(this, '\x1bc')
      try {
        terminal.start(launch)
      } catch (err) {
        this.terminal = null
        this.notice('error', `Não consegui abrir o terminal: ${(err as Error).message}`)
        this.viewMode = 'chat'
        this.options.host.emit(this, { type: 'view', view: 'chat' }, false)
        return
      }
      this.emitTerminal({ state: 'running' })
    })().finally(() => {
      this.starting = null
    })
    return this.starting
  }

  private async stopTerminal(): Promise<void> {
    if (this.starting) await this.starting
    const terminal = this.terminal
    this.terminal = null
    if (this.escTimer) clearTimeout(this.escTimer)
    this.escTimer = null
    this.cancelApprovals()
    if (terminal) await terminal.kill()
    this.emitTerminal({ state: 'idle' })
  }

  /**
   * O terminal recomeça com o que mudou (o modelo, o modo, o provedor, outra conversa), na mesma
   * sessão. Com uma resposta no meio, espera ela acabar. `now`: a conversa mudou, recomeça já.
   */
  private restartTerminal(now = false): void {
    if (this.viewMode !== 'terminal' || this.disposed) return
    if (this.session.isBusy() && !now) {
      this.restartPending = true
      this.notice(
        'info',
        'A troca vale quando esta resposta terminar: o terminal recomeça na mesma conversa.'
      )
      return
    }
    this.restartPending = false
    void this.stopTerminal().then(() => this.startTerminal())
  }

  /** Uma resposta do terminal acabou: uma troca que esperava por isso acontece agora. */
  private afterTerminalTurn(): void {
    if (this.restartPending) this.restartTerminal()
  }

  /** O pedido desta entrada foi respondido no terminal: o card dele some. */
  private terminalAnswered(inputHash: string): void {
    this.terminalWaiting.get(inputHash)?.abort()
    this.terminalWaiting.delete(inputHash)
  }

  /** Manda uma mensagem ao Claude Code do terminal (colada, com os anexos como caminhos). */
  private async sendToTerminal(text: string, files: string[]): Promise<void> {
    if (!this.terminal) await this.startTerminal()
    if (!this.terminal) return
    let content = text
    if (files.length) {
      try {
        const copied = await copyAttachments(files, this.session.ensureSessionId())
        for (const problem of copied.problems) this.notice('warning', problem)
        content = withAttachments(text, copied.paths)
      } catch (err) {
        this.notice('error', `Não consegui preparar os anexos: ${(err as Error).message}`)
      }
    }
    // Só arquivos (o + e o print): entram na caixa do Claude Code, sem enviar, para você
    // escrever o que fazer com eles.
    if (content.trim()) this.terminal?.paste(content, text.trim() !== '')
  }

  /** Um evento dos hooks do Claude Code do terminal desta aba. */
  terminalEvent(event: RelayEvent, pending: PendingReply | null): void {
    if (this.disposed || event.tab !== this.terminal?.token) {
      pending?.reply({ decision: null })
      return
    }
    const input = event.input
    if (this.escTimer && event.event !== STATUS_EVENT) {
      clearTimeout(this.escTimer)
      this.escTimer = null
    }
    if (event.event !== STATUS_EVENT) this.session.terminalMode(input.permission_mode)
    switch (event.event) {
      case STATUS_EVENT:
        this.session.terminalStatus(readStatus(input))
        return
      case 'UserPromptSubmit': {
        const prompt = typeof input.prompt === 'string' ? input.prompt : ''
        if (!this.title && prompt.trim()) {
          this.title = titleOf(prompt, [])
          this.options.host.changed(this)
        }
        const queued = this.session.isBusy()
        this.session.terminalTurn(true, input.session_id)
        if (prompt) {
          if (!this.options.demo?.()) {
            this.history.user(this.session.ensureSessionId(), prompt, [], false)
          }
          // Mandada no meio de uma resposta: na página, os itens da resposta continuam depois.
          this.options.host.emit(
            this,
            { type: 'user', text: prompt, attachments: [], ...(queued ? { queued } : {}) },
            true
          )
          if (queued) this.options.host.emit(this, { type: 'user-delivered' }, true)
        }
        return
      }
      case 'PreToolUse': {
        const id = typeof input.tool_use_id === 'string' ? input.tool_use_id : null
        const name = typeof input.tool_name === 'string' ? input.tool_name : '?'
        if (!id) return
        if (event.inputHash) this.terminalTools.set(event.inputHash, id)
        this.deliver({ type: 'tool-input', id, name, input: input.tool_input })
        return
      }
      case 'PostToolUse':
      case 'PostToolUseFailure': {
        const id = typeof input.tool_use_id === 'string' ? input.tool_use_id : null
        // A ferramenta rodou: um card dela que ainda esperava foi respondido no terminal.
        if (event.inputHash) this.terminalAnswered(event.inputHash)
        if (!id) return
        const failed = event.event === 'PostToolUseFailure'
        const error = typeof input.error === 'string' ? input.error : ''
        this.deliver({
          type: 'tool-result',
          id,
          isError: failed,
          output: failed ? error.slice(0, 4000) : '',
          ...(event.diff && !failed ? { diff: event.diff } : {})
        })
        return
      }
      case 'PermissionRequest':
        if (pending) this.terminalPermission(event, pending)
        return
      case 'Stop': {
        // A resposta acabou: nenhum card dela vai ser usado (foram respondidos no terminal).
        this.cancelApprovals()
        const text =
          typeof input.last_assistant_message === 'string' ? input.last_assistant_message : ''
        if (text)
          this.deliver({ type: 'text', blockId: `terminal-${++this.terminalReplies}`, delta: text })
        this.deliver({ type: 'turn-end', outcome: 'done' })
        this.session.terminalTurn(false, input.session_id)
        this.afterTerminalTurn()
        return
      }
      case 'StopFailure': {
        this.cancelApprovals()
        const error = typeof input.error === 'string' ? input.error : 'a resposta falhou'
        this.notice('error', `O Claude Code parou com um erro: ${error.slice(0, 500)}`)
        this.deliver({ type: 'turn-end', outcome: 'error' })
        this.session.terminalTurn(false, input.session_id)
        this.afterTerminalTurn()
        return
      }
    }
  }

  /**
   * Um pedido de permissão do terminal: o card do Wisp aparece junto com o diálogo do próprio
   * Claude Code, e vale o que for respondido primeiro. Respondido no terminal, o Claude Code
   * encerra o relay, e o card some.
   */
  private terminalPermission(event: RelayEvent, pending: PendingReply): void {
    const input = event.input
    const toolName = typeof input.tool_name === 'string' ? input.tool_name : '?'
    const toolInput = input.tool_input ?? {}
    const controller = new AbortController()
    pending.onClose(() => controller.abort())
    if (event.inputHash) this.terminalWaiting.set(event.inputHash, controller)
    controller.signal.addEventListener('abort', () => {
      if (event.inputHash && this.terminalWaiting.get(event.inputHash) === controller) {
        this.terminalWaiting.delete(event.inputHash)
      }
    })
    const toolUseId =
      (event.inputHash ? this.terminalTools.get(event.inputHash) : undefined) ??
      `terminal-${createHash('sha256').update(JSON.stringify(toolInput)).digest('hex').slice(0, 12)}`
    void this.requestApproval({
      toolName,
      input: toolInput,
      toolUseId,
      signal: controller.signal
    }).then((approval) => {
      let reply: RelayReply
      if (!approval.allow) reply = { decision: 'deny', message: approval.message }
      else if (toolName === QUESTION_TOOL) {
        const answers = approval.updatedInput?.answers
        reply =
          answers && typeof answers === 'object'
            ? { decision: 'answer', answers: answers as Record<string, string> }
            : { decision: null }
      } else {
        reply = {
          decision: 'allow',
          ...(approval.updatedPermissions ? { permissions: approval.updatedPermissions } : {})
        }
      }
      pending.reply(reply)
    })
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
