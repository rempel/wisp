// O Claude Code gravado do modo demonstração: fala stream-json pelo stdin e pelo stdout como o
// `claude -p` de verdade, mas as respostas vêm de gravações (resources/demo/*.jsonl). Serve para
// quem ainda não instalou o Claude Code ou não fez login ver o Wisp funcionando, e as mesmas
// gravações servem de teste de interface.
//
// Roda com o próprio Electron em modo Node (ELECTRON_RUN_AS_NODE=1), como o relay dos hooks.
// Nada aqui mexe na máquina: os pedidos de permissão passam pelo card do Wisp (a ferramenta
// approve do servidor MCP dele, como no Claude Code de verdade), mas a ferramenta nunca roda.
//
// Uma gravação é um arquivo JSONL com eventos do stream-json, mais três linhas especiais:
// - {"wait": ms}: uma pausa (o texto chega aos poucos, como de verdade);
// - {"say": "texto"}: um bloco de texto, mandado palavra por palavra;
// - {"approve": {"tool": nome, "input": {...}}, "allow": [linhas], "deny": [linhas]}: pede ao
//   Wisp e segue pelas linhas da decisão.
// O resources/demo/index.json diz qual gravação responde a quais palavras.

import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { pickRecording } from './recordings'
import type { RecordingIndex } from './recordings'

type Line = Record<string, unknown>

const args = process.argv.slice(2)
const flag = (name: string): string | null => {
  const eq = args.find((arg) => arg.startsWith(`${name}=`))
  if (eq) return eq.slice(name.length + 1)
  const i = args.indexOf(name)
  return i >= 0 ? (args[i + 1] ?? null) : null
}

if (args[0] === 'auth') {
  process.stdout.write(JSON.stringify({ loggedIn: true, authMethod: 'demonstração' }) + '\n')
  process.exit(0)
}

const DIR = process.env.WISP_DEMO_DIR ?? join(__dirname, '../../resources/demo')
const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')) as RecordingIndex
const sessionId = flag('--session-id') ?? flag('--resume') ?? randomUUID()
let model = flag('--model') ?? 'demonstração'
let mode = flag('--permission-mode') ?? 'default'
const mcpConfig = flag('--mcp-config')

const out = (event: Line): void => {
  process.stdout.write(JSON.stringify({ ...event, session_id: sessionId }) + '\n')
}
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

let turnCount = 0
let current: { aborted: boolean } | null = null
let blocks = 0

async function say(text: string, turn: string): Promise<void> {
  const id = `${turn}-${++blocks}`
  out({ type: 'stream_event', event: { type: 'message_start', message: { id } } })
  let sent = ''
  for (const word of text.split(/(?<= )/)) {
    if (current?.aborted) break
    out({
      type: 'stream_event',
      event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: word } }
    })
    sent += word
    await sleep(35)
  }
  out({ type: 'assistant', message: { id, model, content: [{ type: 'text', text: sent }] } })
}

/** Pede ao Wisp, pelo servidor MCP dele, como o --permission-prompt-tool faz. */
async function approve(tool: string, input: unknown, toolUseId: string): Promise<boolean> {
  if (!mcpConfig) return false
  try {
    const servers = JSON.parse(readFileSync(mcpConfig, 'utf8')) as {
      mcpServers: { desktop: { url: string; headers: Record<string, string> } }
    }
    const desktop = servers.mcpServers.desktop
    const response = await fetch(desktop.url, {
      method: 'POST',
      headers: {
        ...desktop.headers,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'approve',
          arguments: { tool_name: tool, input, tool_use_id: toolUseId }
        }
      })
    })
    const body = await response.text()
    const data = body.split('\n').find((line) => line.startsWith('data:'))
    const message = JSON.parse(data ? data.slice(5) : body) as {
      result: { content: { text: string }[] }
    }
    return (JSON.parse(message.result.content[0].text) as { behavior: string }).behavior === 'allow'
  } catch {
    return false
  }
}

async function play(lines: Line[], turn: string): Promise<void> {
  for (const line of lines) {
    if (current?.aborted) return
    if (typeof line.wait === 'number') {
      await sleep(line.wait)
    } else if (typeof line.say === 'string') {
      await say(line.say, turn)
    } else if (line.approve) {
      const { tool, input } = line.approve as { tool: string; input: unknown }
      const toolUseId = `toolu_${turn}_${++blocks}`
      const messageId = `${turn}-${blocks}`
      out({ type: 'stream_event', event: { type: 'message_start', message: { id: messageId } } })
      out({
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: toolUseId, name: tool, input: {} }
        }
      })
      out({
        type: 'assistant',
        message: {
          id: messageId,
          model,
          content: [{ type: 'tool_use', id: toolUseId, name: tool, input }]
        }
      })
      const allowed = await approve(tool, input, toolUseId)
      const next = ((allowed ? line.allow : line.deny) ?? []) as Line[]
      // As linhas da decisão começam pelo resultado da ferramenta: o id é o deste pedido.
      await play(
        next.map((item) => withToolUseId(item, toolUseId)),
        turn
      )
    } else {
      out(withTurn(line, turn))
    }
  }
}

/** Os ids das mensagens e das ferramentas da gravação ganham o número do turno (não se repetem). */
function withTurn(line: Line, turn: string): Line {
  return JSON.parse(
    JSON.stringify(line)
      .replace(/"(msg_[\w-]+)"/g, `"$1-${turn}"`)
      .replace(/"(toolu_[\w-]+)"/g, `"$1-${turn}"`)
  ) as Line
}

function withToolUseId(line: Line, id: string): Line {
  return JSON.parse(JSON.stringify(line).replace(/"TOOL_USE_ID"/g, `"${id}"`)) as Line
}

async function turn(text: string): Promise<void> {
  current = { aborted: false }
  const turnId = `t${++turnCount}`
  out({
    type: 'system',
    subtype: 'init',
    model,
    permissionMode: mode,
    apiKeySource: 'none',
    mcp_servers: mcpConfig ? [{ name: 'desktop', status: 'connected' }] : []
  })
  const file = pickRecording(text, index)
  const lines = readFileSync(join(DIR, file), 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Line)
  await play(lines, turnId)
  if (current.aborted) {
    out({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] }
    })
    out({ type: 'result', subtype: 'error_during_execution', is_error: true })
  } else {
    out({ type: 'result', subtype: 'success', is_error: false, result: '' })
  }
  current = null
}

function control(message: Line): void {
  const id = message.request_id
  const request = message.request as Line
  if (request.subtype === 'interrupt' && current) current.aborted = true
  if (request.subtype === 'set_model')
    model = (request.model as string | undefined) ?? 'demonstração'
  out({ type: 'control_response', response: { subtype: 'success', request_id: id } })
  if (request.subtype === 'set_permission_mode') {
    mode = String(request.mode)
    out({ type: 'system', subtype: 'status', status: null, permissionMode: mode })
  }
}

let queue = Promise.resolve()
let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk: string) => {
  buffer += chunk
  let newline: number
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline)
    buffer = buffer.slice(newline + 1)
    if (!line.trim()) continue
    let message: Line
    try {
      message = JSON.parse(line) as Line
    } catch {
      continue
    }
    if (message.type === 'control_request') {
      control(message)
      continue
    }
    if (message.type !== 'user') continue
    const content = (message.message as { content?: { text?: string }[] } | undefined)?.content
    const text = (content ?? []).map((block) => block.text ?? '').join('')
    queue = queue.then(() => turn(text))
  }
})
process.stdin.on('end', () => void queue.then(() => process.exit(0)))
