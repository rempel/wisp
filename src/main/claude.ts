import { spawn } from 'child_process'
import type { ChildProcess, ChildProcessWithoutNullStreams } from 'child_process'
import { randomUUID } from 'crypto'
import { accessSync, constants, mkdirSync, readdirSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { delimiter, dirname, join } from 'path'
import { diffFromResult } from '../shared/diff'
import { formatReset } from '../shared/format'
import { PERMISSION_MODES } from '../shared/ipc'
import type { ChatEvent, NoticeLevel, PermissionMode, PlanUsage, UsageWindow } from '../shared/ipc'
import {
  ATTACHMENTS_DIR,
  copyAttachments,
  ensureAttachmentsDir,
  withAttachments
} from './attachments'
import type { CopiedAttachments } from './attachments'
import { INTERNAL_ENV } from './hooks/protocol'
import { expandHome } from './paths'

/** Ferramentas que o Claude usa sem pedir permissão (seção 5.4 da especificação). */
export const SAFE_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'mcp__desktop__open_url',
  'mcp__desktop__list_apps',
  'mcp__desktop__list_projects',
  'mcp__desktop__notify',
  // Lembretes: só mexem no próprio Wisp, como a notificação.
  'mcp__desktop__set_reminder',
  'mcp__desktop__list_reminders',
  'mcp__desktop__cancel_reminder',
  // Música: tocar, pausar e volume do player não mudam nada na máquina.
  'mcp__desktop__media_status',
  'mcp__desktop__media_control',
  'mcp__desktop__media_volume',
  // Fase 13: só leitura (os seus PRs, a agenda, o resumo da semana).
  'mcp__desktop__github_status',
  'mcp__desktop__list_events',
  'mcp__desktop__weekly_summary'
]

/** Ferramenta do servidor `desktop` que mostra o card de permissão (seção 5.4). */
export const PERMISSION_TOOL = 'mcp__desktop__approve'

/**
 * Arquivos de segredos (chaves, tokens, senhas de navegador). O Read continua liberado no
 * resto da máquina, mas ler estes pede aprovação: sem isso, um texto malicioso numa página
 * lida pelo WebFetch poderia levar o Claude a ler uma chave e mandá-la para fora sem ninguém ver.
 */
const SENSITIVE_PATHS = [
  '~/.ssh/**',
  '~/.gnupg/**',
  '~/.aws/**',
  '~/.azure/**',
  '~/.config/gcloud/**',
  '~/.kube/**',
  '~/.docker/config.json',
  '~/.netrc',
  '~/.pgpass',
  '~/.git-credentials',
  '~/.config/gh/**',
  '~/.claude/.credentials.json',
  '~/.local/share/keyrings/**',
  '~/.password-store/**',
  '~/.mozilla/**',
  '~/.config/google-chrome/**',
  '~/.config/chromium/**',
  '~/.config/BraveSoftware/**',
  '//**/.env',
  '//**/.env.*'
]

/** Variável com o arquivo do modo de permissão da conversa, que o hook do Bash lê. */
export const MODE_FILE_ENV = 'WISP_PERMISSION_MODE_FILE'

/**
 * Configurações extras da sessão (--settings):
 * - um hook que manda todo comando Bash para a aprovação. Sem ele o Claude Code roda sozinho
 *   comandos que considera só de leitura (ps, whoami, ls na pasta de trabalho, e também um `cat`
 *   de uma chave). No modo Automático ele fica quieto: quem decide é o classificador do Claude
 *   Code. O modo vem de um arquivo, porque muda no meio da conversa e o --settings não.
 * - as regras "ask" dos arquivos de segredos.
 */
const ASK_FOR_BASH = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'ask',
    permissionDecisionReason: 'O Wisp pede aprovação para todo comando.'
  }
})
const BASH_HOOK = `[ "$(cat "$${MODE_FILE_ENV}" 2>/dev/null)" = auto ] || printf %s '${ASK_FOR_BASH}'`
const SESSION_SETTINGS = JSON.stringify({
  permissions: { ask: SENSITIVE_PATHS.map((path) => `Read(${path})`) },
  hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: BASH_HOOK }] }]
  }
})

/** O modo como o CLI o informa: "manual" é o nome novo do "default". */
export function modeOf(value: unknown): PermissionMode | null {
  if (value === 'manual') return 'default'
  return PERMISSION_MODES.includes(value as PermissionMode) ? (value as PermissionMode) : null
}

export interface ClaudeOptions {
  /** Comando ou caminho do CLI (config.claudePath). */
  claudePath: string
  /**
   * Prepara e devolve a pasta de trabalho do processo (o workspace do Wisp, com o CLAUDE.md da
   * persona). É chamada a cada vez que um processo sobe, então a pasta pode ser recriada.
   */
  workspace: () => string
  allowedTools: string[]
  appendSystemPrompt: string
  /**
   * O arquivo do --mcp-config com o servidor `desktop` desta conversa, pedido a cada processo
   * novo. Sem ele (o servidor não subiu), a conversa funciona sem as ferramentas de desktop, e o
   * que pediria permissão é negado.
   */
  mcpConfig?: () => string | undefined
  /** O modo de permissão com que a conversa começa. */
  permissionMode: PermissionMode
  /** Onde gravar o modo atual, para o hook do Bash ler (em $XDG_RUNTIME_DIR, só do usuário). */
  modeFile?: string
  /** Modelo inicial (config.model): um apelido ou nome que o --model aceita; null é o padrão. */
  model: string | null
  /** O session_id mudou (o CLI criou uma cópia com --fork-session, por exemplo). */
  onSessionId?: (id: string) => void
  /**
   * Miniatura (data URL) de uma imagem em base64 que uma ferramenta devolveu, para o card da
   * ferramenta mostrar o que o Claude viu (um print da tela, por exemplo).
   */
  thumbnail?: (base64: string) => string | undefined
  /** No modo demonstração: o Claude Code gravado e as gravações, no lugar do CLI. */
  demo?: () => DemoPlayer | null
}

/** O Claude Code gravado do modo demonstração (demo/player.ts), rodado pelo Electron em modo Node. */
export interface DemoPlayer {
  /** O script do reprodutor (out/main/wisp-demo.js). */
  player: string
  /** A pasta das gravações (resources/demo). */
  recordings: string
}

/** O "executável" do modo demonstração, no lugar do caminho do CLI. */
const DEMO = 'wisp-demo'

/** Como ver o Wisp funcionando antes de instalar o Claude Code ou de fazer login. */
const DEMO_HINT =
  'Para ver o Wisp funcionando antes, ligue o **Modo demonstração** no menu do mascote (clique ' +
  'com o botão direito nele).'

export const LOGIN_HINT =
  'Rode `claude` no terminal e faça login. Depois é só mandar a mensagem de novo. ' + DEMO_HINT
export const INSTALL_HINT =
  'Não encontrei o Claude Code (`claude`). Instale-o, rode `claude` no terminal para fazer ' +
  'login e depois mande a mensagem de novo. Se ele estiver num lugar fora do PATH, informe o ' +
  'caminho em `claudePath` no `~/.config/wisp/config.json`. ' +
  DEMO_HINT

/**
 * Ferramentas que não viram card de ferramenta: o ToolSearch só carrega outras ferramentas, as
 * perguntas (AskUserQuestion) já aparecem no card de pergunta e o plano (ExitPlanMode), no card
 * do plano.
 */
const HIDDEN_TOOLS = new Set(['ToolSearch', 'AskUserQuestion', 'ExitPlanMode'])

const MAX_TOOL_OUTPUT = 4000
/** Imagens de um resultado que viram miniatura no card. */
const MAX_TOOL_IMAGES = 4
const STDERR_TAIL = 2000
const KILL_TIMEOUT_MS = 3000
const AUTH_TIMEOUT_MS = 15000
/** Se o turno não acabar até lá depois do pedido de interrupção, o processo é encerrado. */
const INTERRUPT_TIMEOUT_MS = 4000

// ---------------------------------------------------------------------------
// Localização, ambiente e checagem do CLI

/**
 * Acha o executável do CLI. Um nome simples é procurado no PATH e nas pastas onde os
 * instaladores do Claude Code o colocam, porque quando o app é aberto pelo menu do sistema o
 * PATH pode não incluí-las.
 */
export function resolveCommand(command: string): string | null {
  const candidates = command.includes('/')
    ? [expandHome(command)]
    : [...(process.env.PATH ?? '').split(delimiter), ...installDirs()]
        .filter(Boolean)
        .map((dir) => join(dir, command))
  return candidates.find(isExecutableFile) ?? null
}

/**
 * Onde o instalador do Claude Code e os gerenciadores de Node deixam o `claude`. Um app aberto
 * pelo menu do sistema ou no login recebe um PATH curto, sem essas pastas.
 */
function installDirs(): string[] {
  const home = homedir()
  return [
    join(home, '.local/bin'),
    join(home, '.claude/local'),
    join(home, '.npm-global/bin'),
    join(home, '.volta/bin'),
    join(home, '.bun/bin'),
    join(home, '.local/share/pnpm'),
    join(home, '.yarn/bin'),
    join(home, '.asdf/shims'),
    join(home, '.local/share/mise/shims'),
    ...nodeVersionDirs(join(home, '.nvm/versions/node'), 'bin'),
    ...nodeVersionDirs(join(home, '.local/share/fnm/node-versions'), 'installation/bin')
  ]
}

/** A pasta bin de cada versão do Node instalada (nvm, fnm), da mais nova para a mais velha. */
function nodeVersionDirs(root: string, bin: string): string[] {
  let names: string[]
  try {
    names = readdirSync(root)
  } catch {
    return []
  }
  const parts = (name: string): number[] => name.replace(/^v/, '').split('.').map(Number)
  const newerFirst = (a: string, b: string): number => {
    const [x, y] = [parts(a), parts(b)]
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]
  }
  return names
    .filter((name) => /^v?\d+\.\d+\.\d+$/.test(name))
    .sort(newerFirst)
    .map((name) => join(root, name, bin))
}

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Ambiente do CLI: o do app, com alguns ajustes.
 * - Sem ANTHROPIC_API_KEY: com essa variável definida, o Claude Code cobra o uso pela API em vez
 *   de usar a assinatura.
 * - Sem a memória automática do Claude Code: ela grava arquivos em ~/.claude/projects/…/memory
 *   sem passar pelo card de permissão e os carrega em toda conversa, o que deixaria um texto
 *   malicioso (lido pelo WebFetch, por exemplo) plantar instruções que ficam para sempre.
 * - Sem as variáveis do npm e do Electron (CHROME_DESKTOP, ELECTRON_*): o que o CLI abre as
 *   herdaria. O navegador do Claude, por exemplo, se apresentaria como o Wisp na barra de
 *   tarefas.
 */
function claudeEnv(bin: string): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('npm_') || key.startsWith('ELECTRON_') || key === 'CHROME_DESKTOP') {
      delete env[key]
    }
  }
  delete env.ANTHROPIC_API_KEY
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1'
  // Marca os processos do Wisp: os hooks deles não viram sessões na aba Sessões.
  env[INTERNAL_ENV] = '1'
  // O `claude` instalado pelo npm é um script `#!/usr/bin/env node`: a pasta dele (onde, no nvm,
  // fica o node da mesma versão) vai na frente do PATH.
  const dir = dirname(bin)
  const path = (env.PATH ?? '').split(delimiter).filter(Boolean)
  if (!path.includes(dir)) env.PATH = [dir, ...path].join(delimiter)
  return env
}

type CheckResult = { ok: true; bin: string } | { ok: false; hint: string }

/** Confere se o CLI existe e está logado, com `claude auth status`. */
export async function checkClaude(command: string): Promise<CheckResult> {
  const bin = resolveCommand(command)
  if (!bin) return { ok: false, hint: INSTALL_HINT }

  const status = await new Promise<{ code: number | null; stdout: string; failed: boolean }>(
    (resolve) => {
      const child = spawn(bin, ['auth', 'status', '--json'], {
        env: claudeEnv(bin),
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: AUTH_TIMEOUT_MS
      })
      let stdout = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => (stdout += chunk))
      child.on('error', () => resolve({ code: null, stdout, failed: true }))
      child.on('close', (code) => resolve({ code, stdout, failed: false }))
    }
  )
  if (status.failed) return { ok: false, hint: INSTALL_HINT }

  try {
    const { loggedIn } = JSON.parse(status.stdout) as { loggedIn?: unknown }
    if (loggedIn === false) return { ok: false, hint: LOGIN_HINT }
  } catch {
    // Saída inesperada (versão antiga, timeout): segue em frente. Se faltar login, o próprio
    // stream acusa e o aviso aparece do mesmo jeito.
  }
  return { ok: true, bin }
}

// ---------------------------------------------------------------------------
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
  event?: {
    type: string
    index?: number
    message?: { id: string }
    content_block?: ContentBlock
    delta?: { type: string; text?: string }
  }
  message?: { id?: string; content?: string | ContentBlock[] }
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
      return 'A resposta parou porque atingiu o limite de turnos.'
    case 'error_during_execution':
      return 'Algo deu errado enquanto o Claude Code trabalhava.'
    default:
      return `O Claude Code terminou com erro (${event.subtype ?? 'desconhecido'}).`
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
  const detail = `\n\nDetalhe: \`${text.replace(/`/g, "'").slice(0, 300)}\``
  if (limited || PLAN_LIMIT.test(text)) {
    // Versões antigas do CLI mandam o horário no próprio texto: "...limit reached|1791613800".
    const when = resetsAt ?? Number(/\|(\d{10})\b/.exec(text)?.[1] ?? NaN)
    const free = Number.isFinite(when) ? ` Ele libera de novo ${formatReset(when)}.` : ''
    return `Você chegou ao limite de uso do seu plano do Claude.${free}`
  }
  if (MODEL_ERROR.test(text)) {
    return (
      'O modelo escolhido não existe ou não está liberado no seu plano. Troque de modelo na ' +
      'pílula acima da caixa de texto e mande a mensagem de novo.' +
      detail
    )
  }
  if (OVERLOADED.test(text)) {
    return (
      'Os servidores do Claude estão sobrecarregados agora. Tente de novo daqui a pouco.' + detail
    )
  }
  if (NETWORK.test(text)) {
    return (
      'Não consegui falar com os servidores do Claude. Confira sua conexão com a internet e ' +
      'tente de novo.' +
      detail
    )
  }
  return text
}

// ---------------------------------------------------------------------------
// Sessão

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

/** A mensagem do usuário no formato do --input-format stream-json. */
function userMessage(text: string): string {
  return JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] }
  })
}

/**
 * Uma conversa com o Claude Code: um processo `claude -p` de longa duração, que recebe as
 * mensagens pelo stdin e responde em stream-json pelo stdout. Converte essa saída em ChatEvents.
 *
 * - O session_id é gerado aqui e passado com `--session-id`, para a pasta dos anexos da conversa
 *   existir antes de o CLI responder pela primeira vez.
 * - Parar pede ao CLI, pelo stdin, que interrompa o turno; o processo continua vivo. Se ele não
 *   obedecer a tempo, é encerrado, e a próxima mensagem sobe outro com `--resume <session_id>`.
 * - Trocar o modelo também vai pelo stdin, antes da próxima mensagem; o contexto continua.
 * - Nova conversa encerra o processo e esquece o session_id.
 */
export class ClaudeSession {
  private proc: ChildProcessWithoutNullStreams | null = null
  private sessionId: string | null = null
  /** O CLI já registrou a sessão: os próximos processos a retomam com --resume. */
  private sessionSaved = false
  /** A sessão veio do histórico e ainda não respondeu: pode não existir mais no Claude Code. */
  private restored = false
  /** Pasta da sessão retomada de um terminal; null é o workspace do Wisp. */
  private cwd: string | null = null
  /** Retomar como cópia (--fork-session): a sessão continua aberta no terminal. */
  private fork = false
  /** Caminho do CLI depois de uma checagem bem-sucedida; null força checar de novo. */
  private bin: string | null = null
  private busy = false
  /** O texto do turno atual já foi escrito no processo (ainda não, enquanto copia os anexos). */
  private sentText: string | null = null
  /** O turno atual já foi mandado de novo depois de o processo cair na largada. */
  private retried = false
  private stopping = false
  private stopTimer: NodeJS.Timeout | null = null
  /** Muda a cada envio, parada ou conversa nova; descarta envios que ficaram para trás. */
  private turn = 0
  private messageId = ''
  private fallbackBlocks = 0
  private readonly streamedMessages = new Set<string>()
  /** Chamadas de HIDDEN_TOOLS em andamento, para descartar os resultados delas também. */
  private readonly hiddenToolUses = new Set<string>()
  private warnedApiKey = false
  private warnedMcp = false
  /** O modo de permissão escolhido; o processo sobe com ele e recebe as trocas pelo stdin. */
  private mode: PermissionMode
  /** Pedidos de troca de modo esperando resposta, com o modo de antes. */
  private readonly modeRequests = new Map<string, PermissionMode>()
  /** O CLI avisou (rate_limit_event) que o limite do plano foi atingido; até quando, se disse. */
  private planLimit: { resetsAt: number | null } | null = null
  /** Modelo escolhido na pílula; null é o padrão do Claude Code. */
  private model: string | null
  /** O modelo com que o processo atual está (do --model ou do último set_model). */
  private processModel: string | null = null
  /** O modelo que respondeu por último, como o CLI o chama ("claude-sonnet-5-5"). */
  private activeModel: string | null = null
  /** Modelo que o CLI recusou; pedir o mesmo de novo (ao reabrir o painel) não adianta. */
  private rejectedModel: string | null = null
  private controlSeq = 0
  /** Pedidos de troca de modelo esperando resposta: o modelo pedido e o que havia antes. */
  private readonly modelRequests = new Map<
    string,
    { requested: string | null; previous: string | null }
  >()

  constructor(
    private readonly options: ClaudeOptions,
    private readonly emit: (event: ChatEvent) => void
  ) {
    this.model = options.model
    this.mode = options.permissionMode
  }

  get permissionMode(): PermissionMode {
    return this.mode
  }

  /**
   * Troca o modo de permissão. Com o processo vivo, vale na hora (control_request
   * set_permission_mode); senão, o próximo processo já sobe com ele.
   */
  setPermissionMode(mode: PermissionMode): void {
    if (mode === this.mode) return
    const previous = this.mode
    this.mode = mode
    this.writeModeFile()
    if (this.proc) {
      this.modeRequests.set(
        this.control(this.proc, { subtype: 'set_permission_mode', mode }),
        previous
      )
    }
    this.emit({ type: 'mode', mode })
  }

  /** O modo vai para o arquivo que o hook do Bash lê. */
  private writeModeFile(): void {
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
  private adoptMode(value: unknown, source: 'init' | 'status'): void {
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
        `O Claude Code começou no modo "${mode}", e não no "${requested}" que você escolheu.`
      )
    }
  }

  /** Se há uma resposta em andamento (do envio até o fim do turno). */
  isBusy(): boolean {
    return this.busy
  }

  /** O modelo escolhido e o que respondeu por último, como o evento que o chat recebe. */
  modelEvent(): Extract<ChatEvent, { type: 'model' }> {
    return { type: 'model', choice: this.model, active: this.activeModel }
  }

  /** O id da conversa no Claude Code; gerado aqui na primeira vez. */
  ensureSessionId(): string {
    return (this.sessionId ??= randomUUID())
  }

  /** Checa o CLI de antemão (ao abrir o chat) e avisa na conversa se faltar algo. */
  async preflight(): Promise<void> {
    await this.check()
  }

  /**
   * Manda uma mensagem. `attachments` são caminhos de arquivos: viram cópias na pasta da
   * conversa, listadas no fim da mensagem para o Claude ler com o Read.
   */
  async send(text: string, attachments: string[] = []): Promise<void> {
    if (this.busy) return
    const turn = ++this.turn
    this.retried = false
    this.setBusy(true)
    const bin = await this.check()
    if (turn !== this.turn) return
    if (!bin) return this.finishTurn('error')

    const sessionId = this.ensureSessionId()
    // O aviso de limite vale para o turno em que chegou; cada turno traz o seu.
    this.planLimit = null
    let content = text
    if (attachments.length) {
      let copied: CopiedAttachments
      try {
        copied = await copyAttachments(attachments, sessionId)
      } catch (err) {
        if (turn !== this.turn) return
        this.notice('error', `Não consegui preparar os anexos: ${(err as Error).message}`)
        return this.finishTurn('error')
      }
      if (turn !== this.turn) return
      for (const problem of copied.problems) this.notice('warning', problem)
      content = withAttachments(text, copied.paths)
    }
    // Só anexos, e nenhum deu certo: não há o que mandar (os avisos já explicam).
    if (!content.trim()) return this.finishTurn('error')

    this.write(this.proc ?? this.start(bin), content)
  }

  /**
   * Para a resposta em andamento: pede ao CLI que interrompa o turno, e o processo continua
   * vivo para a próxima mensagem. A conversa continua.
   */
  stop(): void {
    this.turn++
    if (!this.busy) return
    const proc = this.proc
    // A mensagem ainda nem chegou ao CLI (checando o CLI, copiando anexos): basta encerrar.
    if (!proc || this.sentText === null) return this.finishTurn('stopped')
    if (this.stopping) return
    this.stopping = true
    this.control(proc, { subtype: 'interrupt' })
    // Se o CLI não encerrar o turno a tempo, o processo vai embora; a conversa continua com
    // --resume na próxima mensagem.
    this.stopTimer = setTimeout(() => {
      this.stopTimer = null
      if (this.stopping && proc === this.proc) void killProcess(proc)
    }, INTERRUPT_TIMEOUT_MS)
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

  /** Começa uma conversa nova: encerra o processo atual e esquece a sessão. */
  reset(): void {
    this.clear()
    this.emit({ type: 'reset' })
  }

  /**
   * Volta a uma conversa do histórico: encerra o processo atual, e a próxima mensagem sobe
   * outro com `--resume <sessionId>`.
   */
  resume(sessionId: string, options: { cwd?: string; fork?: boolean } = {}): void {
    this.clear()
    this.sessionId = sessionId
    this.sessionSaved = true
    this.restored = true
    this.cwd = options.cwd ?? null
    this.fork = options.fork ?? false
    this.emit({ type: 'reset' })
  }

  /** Encerra o processo sem esperar (o app está fechando). */
  dispose(): void {
    this.turn++
    this.clearStop()
    this.proc?.kill('SIGTERM')
    this.proc = null
  }

  private clear(): void {
    this.turn++
    const proc = this.proc
    this.proc = null
    this.sessionId = null
    this.sessionSaved = false
    this.restored = false
    this.cwd = null
    this.fork = false
    this.sentText = null
    this.clearStop()
    this.streamedMessages.clear()
    this.hiddenToolUses.clear()
    this.modelRequests.clear()
    this.modeRequests.clear()
    this.setBusy(false)
    if (proc) void killProcess(proc)
  }

  private clearStop(): void {
    this.stopping = false
    if (this.stopTimer) clearTimeout(this.stopTimer)
    this.stopTimer = null
  }

  private async check(): Promise<string | null> {
    // Na demonstração, não há CLI para conferir.
    if (this.options.demo?.()) return DEMO
    if (this.bin) return this.bin
    const result = await checkClaude(this.options.claudePath)
    if (!result.ok) {
      this.notice('warning', result.hint)
      return null
    }
    this.bin = result.bin
    return this.bin
  }

  /** Escreve a mensagem do turno no processo, trocando antes o modelo se ele mudou. */
  private write(proc: ChildProcessWithoutNullStreams, text: string): void {
    if (this.processModel !== this.model) {
      // Sem `model`, o CLI volta ao padrão (é o que o SDK manda).
      const request = this.model
        ? { subtype: 'set_model', model: this.model }
        : { subtype: 'set_model' }
      const previous = this.processModel
      this.modelRequests.set(this.control(proc, request), { requested: this.model, previous })
      this.processModel = this.model
    }
    this.sentText = text
    proc.stdin.write(userMessage(text) + '\n')
  }

  /** Manda um pedido de controle ao CLI pelo stdin. Devolve o id do pedido. */
  private control(proc: ChildProcessWithoutNullStreams, request: Record<string, unknown>): string {
    const id = `wisp-${++this.controlSeq}`
    proc.stdin.write(JSON.stringify({ type: 'control_request', request_id: id, request }) + '\n')
    return id
  }

  private start(bin: string): ChildProcessWithoutNullStreams {
    const args = [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--allowedTools',
      this.options.allowedTools.join(','),
      // Os anexos ficam fora do workspace; a pasta deles entra no espaço de trabalho do Claude.
      '--add-dir',
      ATTACHMENTS_DIR,
      // O modo padrão do CLI nem sempre é o "default": numa instalação nova ele pode começar no
      // "auto", e o settings.json do usuário pode definir outro defaultMode. Aqui vale sempre o
      // modo escolhido na conversa (Pedir, se ninguém escolheu outro).
      '--permission-mode',
      this.mode,
      '--append-system-prompt',
      this.options.appendSystemPrompt,
      '--settings',
      SESSION_SETTINGS
    ]
    const mcpConfig = this.options.mcpConfig?.()
    if (mcpConfig) {
      args.push(
        '--mcp-config',
        mcpConfig,
        // Só o servidor do Wisp: os servidores MCP configurados no Claude Code do usuário ficam
        // de fora, para o Wisp não depender deles.
        '--strict-mcp-config',
        '--permission-prompt-tool',
        PERMISSION_TOOL
      )
    }
    // Com "=", o valor nunca vira outra opção, mesmo se começar com "-".
    if (this.model) args.push(`--model=${this.model}`)
    this.processModel = this.model
    if (this.sessionId) args.push(this.sessionSaved ? '--resume' : '--session-id', this.sessionId)
    // A sessão do terminal continua aberta: o Wisp segue numa cópia, para as duas não se misturarem.
    if (this.sessionId && this.sessionSaved && this.fork) args.push('--fork-session')

    ensureAttachmentsDir()
    this.writeModeFile()
    // Na demonstração, o Claude Code gravado roda com o próprio Electron em modo Node.
    const demo = bin === DEMO ? this.options.demo?.() : null
    const command = demo ? process.execPath : bin
    const env = claudeEnv(command)
    if (this.options.modeFile) env[MODE_FILE_ENV] = this.options.modeFile
    if (demo) {
      env.ELECTRON_RUN_AS_NODE = '1'
      env.WISP_DEMO_DIR = demo.recordings
    }
    const proc = spawn(command, demo ? [demo.player, ...args] : args, {
      cwd: this.cwd ?? this.options.workspace(),
      env
    })
    this.proc = proc

    // Eventos de um processo que já foi substituído (conversa nova) são ignorados.
    const current = (): boolean => proc === this.proc
    let pending = ''
    let stderrTail = ''
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => {
      pending += chunk
      let newline: number
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline).trim()
        pending = pending.slice(newline + 1)
        if (line && current()) this.handleLine(line)
      }
    })
    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL)
    })
    // EPIPE ao escrever num processo que morreu: o 'exit' já trata.
    proc.stdin.on('error', () => {})
    proc.on('error', (err: Error) => {
      if (!current()) return
      this.proc = null
      this.bin = null
      const missing = (err as NodeJS.ErrnoException).code === 'ENOENT'
      this.notice(
        'error',
        missing ? INSTALL_HINT : `Não consegui iniciar o Claude Code: ${err.message}`
      )
      this.finishTurn('error')
    })
    proc.on('exit', (code, signal) => this.onExit(proc, code, signal, stderrTail))
    return proc
  }

  private onExit(
    proc: ChildProcessWithoutNullStreams,
    code: number | null,
    signal: NodeJS.Signals | null,
    stderrTail: string
  ): void {
    if (proc !== this.proc) return
    this.proc = null
    // O --session-id/--resume não bateu com o que o CLI tem gravado: uma parada bem no começo
    // do primeiro envio, ou uma conversa do histórico que o Claude Code já apagou. O erro diz
    // qual, e o próximo processo usa o outro.
    const inUse = /already in use/i.test(stderrTail)
    const notFound = /no conversation found/i.test(stderrTail)
    if (inUse) this.sessionSaved = true
    else if (notFound) this.sessionSaved = false
    const stopped = this.stopping
    this.clearStop()
    if (!this.busy) return
    if (stopped) return this.finishTurn('stopped')

    // Caiu na largada por causa disso: manda a mesma mensagem de novo, uma vez.
    const text = this.sentText
    if ((inUse || notFound) && text !== null && this.bin && !this.retried) {
      this.retried = true
      if (notFound && this.restored) {
        this.notice(
          'warning',
          'O Claude Code não tem mais esta conversa (ele apaga as antigas depois de um tempo). ' +
            'Continuei numa sessão nova: o Claude não lembra do que foi dito antes.'
        )
      }
      this.restored = false
      this.write(this.start(this.bin), text)
      return
    }

    const detail = stderrTail.trim()
    this.notice(
      'error',
      `O Claude Code encerrou no meio da resposta (${signal ?? `código ${code}`}).` +
        (detail ? `\n\n\`\`\`\n${detail}\n\`\`\`` : '')
    )
    this.finishTurn('error')
  }

  private handleLine(line: string): void {
    let event: CliEvent
    try {
      event = JSON.parse(line) as CliEvent
    } catch {
      console.warn('[wisp] linha inesperada do claude:', line.slice(0, 200))
      return
    }
    // Saída de subagentes (Task) não entra na conversa; o card da ferramenta já a representa.
    if (event.parent_tool_use_id) return

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

  private onControlResponse(event: CliEvent): void {
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
        `O Claude Code não aceitou o modo "${wanted}"` +
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
      `Não consegui trocar para o modelo \`${request.requested ?? 'padrão'}\`` +
        (response.error ? ` (${response.error.replace(/`/g, "'")})` : '') +
        '. A resposta vem do modelo anterior.'
    )
  }

  private onRateLimit(event: CliEvent): void {
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

  private onSystem(event: CliEvent): void {
    // O CLI troca de modo sozinho: aprovar o plano, por exemplo, volta para o Pedir.
    if (event.subtype === 'status') return this.adoptMode(event.permissionMode, 'status')
    if (event.subtype !== 'init') return
    if (event.session_id) {
      this.adoptSessionId(event.session_id)
      this.restored = false
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
        'As ferramentas do desktop não conectaram: abrir apps, links e projetos não vai ' +
          `funcionar nesta conversa (${desktop?.status ?? 'servidor ausente'}).`
      )
    }
    // Uma política gerenciada (ou uma conta sem o Automático) pode impor outro modo.
    this.adoptMode(event.permissionMode, 'init')
    // "none" é o login da assinatura; qualquer outra origem é uma chave de API.
    if (event.apiKeySource && event.apiKeySource !== 'none' && !this.warnedApiKey) {
      this.warnedApiKey = true
      this.notice(
        'warning',
        `O Claude Code está usando uma chave de API (${event.apiKeySource}), cobrada por uso, ` +
          'e não a sua assinatura.'
      )
    }
  }

  private onStreamEvent(event: CliEvent): void {
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

  private onAssistant(event: CliEvent): void {
    const message = event.message
    if (event.error === 'authentication_failed') {
      this.bin = null
      this.notice('warning', LOGIN_HINT)
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

  private onUser(event: CliEvent): void {
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

  private onResult(event: CliEvent): void {
    if (event.session_id) this.adoptSessionId(event.session_id)
    // Pedimos a interrupção: o turno acaba como parado, seja qual for o resultado.
    if (this.stopping) {
      this.clearStop()
      return this.finishTurn('stopped')
    }
    if (!event.is_error) return this.finishTurn('done')
    const text = describeError(event)
    if (LOGIN_ERROR.test(text)) {
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
   * O id que o CLI informou passa a ser o da conversa. Depois de uma cópia (--fork-session), é o
   * da cópia, e os próximos processos a retomam sem copiar de novo.
   */
  private adoptSessionId(id: string): void {
    const changed = id !== this.sessionId
    this.sessionId = id
    this.sessionSaved = true
    if (!changed) return
    this.fork = false
    this.options.onSessionId?.(id)
  }

  private notice(level: NoticeLevel, text: string): void {
    this.emit({ type: 'notice', level, text })
  }

  private setBusy(busy: boolean): void {
    if (this.busy === busy) return
    this.busy = busy
    this.emit({ type: 'busy', busy })
  }

  private finishTurn(outcome: 'done' | 'error' | 'stopped'): void {
    if (!this.busy) return
    this.sentText = null
    this.emit({ type: 'turn-end', outcome })
    this.setBusy(false)
  }
}

/** Manda SIGTERM e, se o processo não sair a tempo, SIGKILL. Resolve quando ele sai. */
function killProcess(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) return resolve()
    const timer = setTimeout(() => proc.kill('SIGKILL'), KILL_TIMEOUT_MS)
    proc.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    proc.kill('SIGTERM')
  })
}
