import { spawn } from 'child_process'
import type { ChildProcess, ChildProcessWithoutNullStreams } from 'child_process'
import { randomUUID } from 'crypto'
import { accessSync, constants, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { delimiter, dirname, join } from 'path'
import type { ChatEvent, NoticeLevel } from '../shared/ipc'
import {
  ATTACHMENTS_DIR,
  copyAttachments,
  ensureAttachmentsDir,
  withAttachments
} from './attachments'
import type { CopiedAttachments } from './attachments'
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
  'mcp__desktop__notify'
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

/**
 * Configurações extras da sessão (--settings):
 * - um hook que manda todo comando Bash para a aprovação. Sem ele o Claude Code roda sozinho
 *   comandos que considera só de leitura (ps, whoami, ls na pasta de trabalho).
 * - as regras "ask" dos arquivos de segredos.
 */
const ASK_FOR_BASH = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'ask',
    permissionDecisionReason: 'O Wisp pede aprovação para todo comando.'
  }
})
const SESSION_SETTINGS = JSON.stringify({
  permissions: { ask: SENSITIVE_PATHS.map((path) => `Read(${path})`) },
  hooks: {
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: `printf %s '${ASK_FOR_BASH}'` }] }
    ]
  }
})

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
   * Arquivo do --mcp-config com o servidor `desktop`. Sem ele (o servidor não subiu), a
   * conversa funciona sem as ferramentas de desktop, e o que pediria permissão é negado.
   */
  mcpConfigPath?: string
}

export const LOGIN_HINT =
  'Rode `claude` no terminal e faça login. Depois é só mandar a mensagem de novo.'
export const INSTALL_HINT =
  'Não encontrei o Claude Code (`claude`). Instale-o, rode `claude` no terminal para fazer ' +
  'login e depois mande a mensagem de novo. Se ele estiver num lugar fora do PATH, informe o ' +
  'caminho em `claudePath` no `~/.config/wisp/config.json`.'

/**
 * Ferramentas que não viram card de ferramenta: o ToolSearch só carrega outras ferramentas, e as
 * perguntas (AskUserQuestion) já aparecem no card de pergunta.
 */
const HIDDEN_TOOLS = new Set(['ToolSearch', 'AskUserQuestion'])

const MAX_TOOL_OUTPUT = 4000
const STDERR_TAIL = 2000
const KILL_TIMEOUT_MS = 3000
const AUTH_TIMEOUT_MS = 15000

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
 * Ambiente do CLI: o do app, sem ANTHROPIC_API_KEY. Com essa variável definida, o Claude Code
 * cobra o uso pela API em vez de usar a assinatura.
 */
function claudeEnv(bin: string): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY
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
}

interface CliEvent {
  type: string
  subtype?: string
  session_id?: string
  apiKeySource?: string
  permissionMode?: string
  mcp_servers?: { name: string; status: string }[]
  rate_limit_info?: { status?: string; resetsAt?: number }
  parent_tool_use_id?: string | null
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
const PLAN_LIMIT = /usage limit|limit reached|rate.?limit/i
const OVERLOADED = /overloaded|\b529\b/i
const NETWORK =
  /connection error|fetch failed|network|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i

/** Quando o limite libera, do jeito que se fala: "às 15:40" hoje, "em 12/10 às 09:00" depois. */
export function formatReset(resetsAt: number, now = new Date()): string {
  const date = new Date(resetsAt * 1000)
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return `às ${time}`
  const day = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `em ${day} às ${time}`
}

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

/**
 * Uma conversa com o Claude Code: um processo `claude -p` de longa duração, que recebe as
 * mensagens pelo stdin e responde em stream-json pelo stdout. Converte essa saída em ChatEvents.
 *
 * - O session_id é gerado aqui e passado com `--session-id`, para a pasta dos anexos da conversa
 *   existir antes de o CLI responder pela primeira vez.
 * - Parar encerra o processo; a próxima mensagem sobe outro com `--resume <session_id>`.
 * - Nova conversa encerra o processo e esquece o session_id.
 */
export class ClaudeSession {
  private proc: ChildProcessWithoutNullStreams | null = null
  private sessionId: string | null = null
  /** O CLI já registrou a sessão: os próximos processos a retomam com --resume. */
  private sessionSaved = false
  /** Caminho do CLI depois de uma checagem bem-sucedida; null força checar de novo. */
  private bin: string | null = null
  private busy = false
  private stopping = false
  /** Muda a cada envio, parada ou conversa nova; descarta envios que ficaram para trás. */
  private turn = 0
  private messageId = ''
  private fallbackBlocks = 0
  private readonly streamedMessages = new Set<string>()
  /** Chamadas de HIDDEN_TOOLS em andamento, para descartar os resultados delas também. */
  private readonly hiddenToolUses = new Set<string>()
  private warnedApiKey = false
  private warnedMcp = false
  private warnedMode = false
  /** O CLI avisou (rate_limit_event) que o limite do plano foi atingido; até quando, se disse. */
  private planLimit: { resetsAt: number | null } | null = null

  constructor(
    private readonly options: ClaudeOptions,
    private readonly emit: (event: ChatEvent) => void
  ) {}

  /** Se há uma resposta em andamento (do envio até o fim do turno). */
  isBusy(): boolean {
    return this.busy
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
    this.setBusy(true)
    const bin = await this.check()
    if (turn !== this.turn) return
    if (!bin) return this.finishTurn('error')

    const sessionId = (this.sessionId ??= randomUUID())
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

    const proc = this.proc ?? this.start(bin)
    const message = {
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: content }] }
    }
    proc.stdin.write(JSON.stringify(message) + '\n')
  }

  /** Para a resposta em andamento. A conversa continua na próxima mensagem. */
  async stop(): Promise<void> {
    this.turn++
    if (!this.busy) return
    if (!this.proc) return this.finishTurn('stopped')
    this.stopping = true
    await killProcess(this.proc)
  }

  /** Começa uma conversa nova: encerra o processo atual e esquece a sessão. */
  async reset(): Promise<void> {
    this.turn++
    const proc = this.proc
    this.proc = null
    this.sessionId = null
    this.sessionSaved = false
    this.stopping = false
    this.streamedMessages.clear()
    this.hiddenToolUses.clear()
    this.setBusy(false)
    this.emit({ type: 'reset' })
    if (proc) await killProcess(proc)
  }

  /** Encerra o processo sem esperar (o app está fechando). */
  dispose(): void {
    this.turn++
    this.proc?.kill('SIGTERM')
    this.proc = null
  }

  private async check(): Promise<string | null> {
    if (this.bin) return this.bin
    const result = await checkClaude(this.options.claudePath)
    if (!result.ok) {
      this.notice('warning', result.hint)
      return null
    }
    this.bin = result.bin
    return this.bin
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
      // "auto", em que um classificador aprova sozinho o que parece pedido pelo usuário (abrir
      // apps e projetos passava sem o card), e o settings.json do usuário pode definir outro
      // defaultMode. Fixado aqui, tudo fora da lista segura passa pelo card.
      '--permission-mode',
      'default',
      '--append-system-prompt',
      this.options.appendSystemPrompt,
      '--settings',
      SESSION_SETTINGS
    ]
    if (this.options.mcpConfigPath) {
      args.push(
        '--mcp-config',
        this.options.mcpConfigPath,
        // Só o servidor do Wisp: os servidores MCP configurados no Claude Code do usuário ficam
        // de fora, para o Wisp não depender deles.
        '--strict-mcp-config',
        '--permission-prompt-tool',
        PERMISSION_TOOL
      )
    }
    if (this.sessionId) args.push(this.sessionSaved ? '--resume' : '--session-id', this.sessionId)

    ensureAttachmentsDir()
    const proc = spawn(bin, args, { cwd: this.options.workspace(), env: claudeEnv(bin) })
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
    proc.on('exit', (code, signal) => {
      if (!current()) return
      this.proc = null
      // Uma parada bem no começo do primeiro envio pode deixar o --session-id/--resume trocado
      // em relação ao que o CLI gravou; o erro diz qual, e a próxima mensagem usa o outro.
      if (/already in use/i.test(stderrTail)) this.sessionSaved = true
      else if (/no conversation found/i.test(stderrTail)) this.sessionSaved = false
      const stopped = this.stopping
      this.stopping = false
      if (!this.busy) return
      if (stopped) return this.finishTurn('stopped')
      const detail = stderrTail.trim()
      this.notice(
        'error',
        `O Claude Code encerrou no meio da resposta (${signal ?? `código ${code}`}).` +
          (detail ? `\n\n\`\`\`\n${detail}\n\`\`\`` : '')
      )
      this.finishTurn('error')
    })
    return proc
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
    }
  }

  private onRateLimit(event: CliEvent): void {
    const info = event.rate_limit_info
    if (!info) return
    this.planLimit =
      info.status === 'rejected'
        ? { resetsAt: typeof info.resetsAt === 'number' ? info.resetsAt : null }
        : null
  }

  private onSystem(event: CliEvent): void {
    if (event.subtype !== 'init') return
    if (event.session_id) {
      this.sessionId = event.session_id
      this.sessionSaved = true
    }
    const desktop = event.mcp_servers?.find((server) => server.name === 'desktop')
    if (this.options.mcpConfigPath && desktop?.status !== 'connected' && !this.warnedMcp) {
      this.warnedMcp = true
      this.notice(
        'warning',
        'As ferramentas do desktop não conectaram: abrir apps, links e projetos não vai ' +
          `funcionar nesta conversa (${desktop?.status ?? 'servidor ausente'}).`
      )
    }
    // Uma política gerenciada pode impor outro modo, mesmo com o --permission-mode.
    const mode = event.permissionMode
    if (mode && mode !== 'default' && mode !== 'manual' && !this.warnedMode) {
      this.warnedMode = true
      this.notice(
        'warning',
        `O Claude Code está no modo de permissão "${mode}": algumas ações podem rodar sem ` +
          'pedir a sua aprovação.'
      )
    }
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
    for (const block of content) {
      if (block.type !== 'tool_result' || !block.tool_use_id) continue
      if (this.hiddenToolUses.delete(block.tool_use_id)) continue
      this.emit({
        type: 'tool-result',
        id: block.tool_use_id,
        isError: block.is_error === true,
        output: truncate(toolOutputText(block.content), MAX_TOOL_OUTPUT)
      })
    }
  }

  private onResult(event: CliEvent): void {
    if (event.session_id) {
      this.sessionId = event.session_id
      this.sessionSaved = true
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
