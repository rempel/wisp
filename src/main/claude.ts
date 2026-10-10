import { spawn } from 'child_process'
import type { ChildProcess, ChildProcessWithoutNullStreams } from 'child_process'
import { accessSync, constants, statSync } from 'fs'
import { homedir } from 'os'
import { delimiter, join } from 'path'
import type { ChatEvent, NoticeLevel } from '../shared/ipc'
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
}

export const LOGIN_HINT =
  'Rode `claude` no terminal e faça login. Depois é só mandar a mensagem de novo.'
export const INSTALL_HINT =
  'Não encontrei o Claude Code (`claude`). Instale-o, rode `claude` no terminal para fazer ' +
  'login e depois mande a mensagem de novo. Se ele estiver num lugar fora do PATH, informe o ' +
  'caminho em `claudePath` no `~/.config/wisp/config.json`.'

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
    : [
        ...(process.env.PATH ?? '').split(delimiter),
        join(homedir(), '.local/bin'),
        join(homedir(), '.claude/local')
      ]
        .filter(Boolean)
        .map((dir) => join(dir, command))
  return candidates.find(isExecutableFile) ?? null
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
function claudeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY
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
        env: claudeEnv(),
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

// ---------------------------------------------------------------------------
// Sessão

/**
 * Uma conversa com o Claude Code: um processo `claude -p` de longa duração, que recebe as
 * mensagens pelo stdin e responde em stream-json pelo stdout. Converte essa saída em ChatEvents.
 *
 * - Parar encerra o processo; a próxima mensagem sobe outro com `--resume <session_id>`.
 * - Nova conversa encerra o processo e esquece o session_id.
 */
export class ClaudeSession {
  private proc: ChildProcessWithoutNullStreams | null = null
  private sessionId: string | null = null
  /** Caminho do CLI depois de uma checagem bem-sucedida; null força checar de novo. */
  private bin: string | null = null
  private busy = false
  private stopping = false
  /** Muda a cada envio, parada ou conversa nova; descarta envios que ficaram para trás. */
  private turn = 0
  private messageId = ''
  private fallbackBlocks = 0
  private readonly streamedMessages = new Set<string>()
  private warnedApiKey = false

  constructor(
    private readonly options: ClaudeOptions,
    private readonly emit: (event: ChatEvent) => void
  ) {}

  /** Checa o CLI de antemão (ao abrir o chat) e avisa na conversa se faltar algo. */
  async preflight(): Promise<void> {
    await this.check()
  }

  async send(text: string): Promise<void> {
    if (this.busy) return
    const turn = ++this.turn
    this.setBusy(true)
    const bin = await this.check()
    if (turn !== this.turn) return
    if (!bin) return this.finishTurn('error')

    const proc = this.proc ?? this.start(bin)
    const message = { type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }
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
    this.stopping = false
    this.streamedMessages.clear()
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
      '--append-system-prompt',
      this.options.appendSystemPrompt
    ]
    if (this.sessionId) args.push('--resume', this.sessionId)

    const proc = spawn(bin, args, { cwd: this.options.workspace(), env: claudeEnv() })
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
    }
  }

  private onSystem(event: CliEvent): void {
    if (event.subtype !== 'init') return
    if (event.session_id) this.sessionId = event.session_id
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
      const { id, name } = ev.content_block
      if (id) this.emit({ type: 'tool-start', id, name: name ?? '?' })
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
    if (!message?.id || !Array.isArray(message.content)) return
    for (const block of message.content) {
      if (block.type === 'tool_use' && block.id) {
        this.emit({ type: 'tool-input', id: block.id, name: block.name ?? '?', input: block.input })
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
      this.emit({
        type: 'tool-result',
        id: block.tool_use_id,
        isError: block.is_error === true,
        output: truncate(toolOutputText(block.content), MAX_TOOL_OUTPUT)
      })
    }
  }

  private onResult(event: CliEvent): void {
    if (event.session_id) this.sessionId = event.session_id
    if (!event.is_error) return this.finishTurn('done')
    const text = describeError(event)
    if (LOGIN_ERROR.test(text)) {
      this.bin = null
      this.notice('warning', LOGIN_HINT)
    } else {
      this.notice('error', text)
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
