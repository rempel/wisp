// O relay dos hooks: o Claude Code o roda a cada evento (`wisp-hook <Evento>`), com o JSON do
// hook no stdin. Ele repassa o evento ao Wisp por um socket Unix e, num pedido de permissão,
// espera a decisão de quem clicou no card.
//
// Regra de ouro: o Claude Code nunca trava por causa do Wisp.
// - Sem o Wisp aberto (não há socket), sai na hora sem imprimir nada, e a sessão segue normal.
// - Tudo tem prazo: 300 ms para conectar, 2 s para mandar um evento, e o prazo do hook para uma
//   decisão. Estourou, sai sem decidir.
// - Sem decisão, não imprime nada: quem decide é o diálogo do próprio terminal, que o Claude
//   Code mostra junto. Nada é liberado sem um clique.
//
// Roda com o próprio Electron em modo Node (ELECTRON_RUN_AS_NODE=1): nada do Electron aqui. No
// Windows (Fase 35), é o próprio Wisp.exe com --wisp-hook (o boot.ts chama o runRelay), e o
// caminho até o Wisp é um pipe nomeado de nome sorteado, achado pelo arquivo do nome.

import { createHash } from 'crypto'
import { lstatSync, readFileSync } from 'fs'
import { connect } from 'net'
import { diffFromResult } from '../../shared/diff'
import { checkAnswers, parseQuestions, QUESTION_TOOL } from '../questions'
import {
  DECISION_TIMEOUT_S,
  INTERNAL_ENV,
  isPrivateDir,
  PIPE_NAME,
  pipeFile,
  socketDir,
  socketPath,
  STATUS_ARG,
  STATUS_EVENT,
  TAB_ARG,
  TAB_TOKEN,
  TERMINAL_ENV
} from './protocol'
import type { RelayEvent, RelayReply } from './protocol'
import { statusLine } from './status-line'

const CONNECT_TIMEOUT_MS = 300
/** De quanto em quanto tempo o relay que espera uma decisão confere se o pai ainda existe. */
const ORPHAN_CHECK_MS = 500
const SEND_BUDGET_MS = 2000
/** Um pouco menos que o prazo do hook, para sair antes de o Claude Code matar o relay. */
const DECISION_BUDGET_MS = (DECISION_TIMEOUT_S - 5) * 1000
const MAX_REPLY = 1024 * 1024
/** Maior texto repassado num campo. O pedido de permissão leva mais, para o card mostrar. */
const MAX_STRING = 4000
const MAX_STRING_REQUEST = 20_000
const MAX_ITEMS = 200
const MAX_DEPTH = 8
/** Campos que o Wisp não usa e que podem ser enormes (a saída inteira de uma ferramenta). */
const DROPPED = ['tool_response', 'scratchpad_dir', 'agent_transcript_path']

function exit(): never {
  process.exit(0)
}

/** Corta textos longos e listas compridas, em qualquer profundidade. */
function trim(value: unknown, max: number, depth = 0): unknown {
  if (typeof value === 'string') return value.length > max ? `${value.slice(0, max)}…` : value
  if (!value || typeof value !== 'object' || depth > MAX_DEPTH) return value
  if (Array.isArray(value))
    return value.slice(0, MAX_ITEMS).map((item) => trim(item, max, depth + 1))
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, trim(item, max, depth + 1)])
  )
}

const SHELLS = new Set(['sh', 'bash', 'dash', 'zsh', 'fish', 'ksh'])

/** O pai de um processo, pelo /proc. */
function parentOf(pid: number): number | null {
  try {
    // O nome do comando vem entre parênteses e pode ter espaços: o pai é o 2º campo depois dele.
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
    return Number.isInteger(ppid) && ppid > 1 ? ppid : null
  } catch {
    return null
  }
}

/** O processo do Claude Code: o pai do relay, pulando um shell no meio do caminho. */
function claudePid(): number {
  let pid = process.ppid
  for (let i = 0; i < 3; i++) {
    let name: string
    try {
      name = readFileSync(`/proc/${pid}/comm`, 'utf8').trim()
    } catch {
      break
    }
    const parent = SHELLS.has(name) ? parentOf(pid) : null
    if (!parent) break
    pid = parent
  }
  return pid
}

/** No Windows, o pipe do Wisp: o nome do arquivo do nome, se for um nome nosso. */
function trustedPipe(): string | null {
  try {
    const name = readFileSync(pipeFile(), 'utf8').trim()
    return PIPE_NAME.test(name) ? name : null
  } catch {
    return null
  }
}

/** O socket do Wisp, se ele estiver numa pasta só do usuário e for de fato um socket nosso. */
function trustedSocket(): string | null {
  if (process.platform === 'win32') return trustedPipe()
  if (!isPrivateDir(socketDir())) return null
  const path = socketPath()
  try {
    const info = lstatSync(path)
    return info.isSocket() && info.uid === process.getuid?.() ? path : null
  } catch {
    return null
  }
}

/** O que imprimir para o Claude Code, a partir da resposta do Wisp. null: nada. */
function hookOutput(reply: RelayReply, input: Record<string, unknown>): string | null {
  const decide = (decision: Record<string, unknown>): string =>
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } })
  switch (reply.decision) {
    case 'allow':
      return decide({
        behavior: 'allow',
        ...(reply.permissions?.length ? { updatedPermissions: reply.permissions } : {})
      })
    case 'deny':
      return decide({ behavior: 'deny', message: String(reply.message).slice(0, 500) })
    case 'answer': {
      // A pergunta volta liberada com as respostas, e nada mais da entrada muda.
      const toolInput = input.tool_input
      if (input.tool_name !== QUESTION_TOOL || !toolInput || typeof toolInput !== 'object') {
        return null
      }
      const questions = parseQuestions(toolInput)
      const answers = questions && checkAnswers(questions, reply.answers)
      if (!answers) return null
      return decide({ behavior: 'allow', updatedInput: { ...toolInput, answers } })
    }
    default:
      return null
  }
}

/** O relay: `argv` são os argumentos depois do programa (ou do --wisp-hook, no Windows). */
export function runRelay(argv: string[]): void {
  // O modo terminal de uma aba: `--tab <ficha> <Evento>` ou `--status <ficha>`.
  const status = argv[0] === STATUS_ARG
  const tab = status || argv[0] === TAB_ARG ? argv[1] : null
  if (tab !== null && !TAB_TOKEN.test(tab ?? '')) exit()
  // Os processos do Wisp não viram sessões na aba Sessões; os do modo terminal vão para a aba.
  if (!tab && process.env[INTERNAL_ENV]) exit()
  let input: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(readFileSync(0, 'utf8').replace(/^\uFEFF/, ''))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) exit()
    input = parsed as Record<string, unknown>
  } catch {
    exit()
  }
  // A linha de status sai na hora, com ou sem o Wisp: é o Claude Code que a mostra.
  if (status) process.stdout.write(statusLine(input))
  const name = status
    ? STATUS_EVENT
    : typeof input.hook_event_name === 'string' && input.hook_event_name
      ? input.hook_event_name
      : ((tab ? argv[2] : argv[0]) ?? '')
  const path = trustedSocket()
  if (!name || !path) exit()

  const waits = name === 'PermissionRequest'
  const forwarded = { ...input }
  for (const key of DROPPED) delete forwarded[key]
  const diff = name === 'PostToolUse' ? diffFromResult(input.tool_response) : null
  const env: Record<string, string> = {}
  for (const key of TERMINAL_ENV) {
    const value = process.env[key]
    if (value) env[key] = value.slice(0, 500)
  }
  const toolInput = input.tool_input
  const message: RelayEvent = {
    v: 1,
    ...(tab ? { tab } : {}),
    event: name,
    at: Math.round(performance.timeOrigin),
    pid: claudePid(),
    env,
    input: trim(forwarded, waits ? MAX_STRING_REQUEST : MAX_STRING) as Record<string, unknown>,
    ...(diff ? { diff } : {}),
    ...(toolInput !== undefined
      ? {
          inputHash: createHash('sha256')
            .update(`${String(input.tool_name)}\0${JSON.stringify(toolInput)}`)
            .digest('hex')
            .slice(0, 32)
        }
      : {})
  }

  setTimeout(exit, waits ? DECISION_BUDGET_MS : SEND_BUDGET_MS)
  const connectTimer = setTimeout(exit, CONNECT_TIMEOUT_MS)
  const socket = connect(path)
  socket.on('error', exit)
  socket.on('close', exit)
  socket.on('connect', () => {
    clearTimeout(connectTimer)
    socket.write(JSON.stringify(message) + '\n')
    if (!waits) socket.end()
  })
  if (!waits) return
  // Respondido no próprio terminal, o Claude Code encerra o hook; se ele encerrar só o shell no
  // meio do caminho, o relay fica órfão: sem o pai, sai (e o card do Wisp some).
  const parent = process.ppid
  setInterval(() => {
    if (process.ppid !== parent) exit()
  }, ORPHAN_CHECK_MS).unref()

  let pending = ''
  socket.setEncoding('utf8')
  socket.on('data', (chunk: string) => {
    pending += chunk
    if (pending.length > MAX_REPLY) exit()
    const newline = pending.indexOf('\n')
    if (newline < 0) return
    let reply: RelayReply
    try {
      reply = JSON.parse(pending.slice(0, newline)) as RelayReply
    } catch {
      exit()
    }
    const out = hookOutput(reply, input)
    if (!out) exit()
    // No Linux, escrever num pipe é síncrono: a saída está inteira antes de o processo sair (no
    // Windows, o callback do write espera ela sair).
    socket.removeAllListeners('close')
    process.stdout.write(out + '\n', exit)
  })
}
