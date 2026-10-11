// O modo demonstração: as gravações (resources/demo) são válidas, cada sugestão do painel tem a
// sua, e o Claude Code gravado conversa pelo stream-json como o de verdade, no lugar do CLI, sem
// rodar nada (sem o servidor MCP do Wisp, todo pedido de permissão é negado).
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { ClaudeSession } from '../src/main/claude'
import { pickRecording } from '../src/main/demo/recordings'
import type { RecordingIndex } from '../src/main/demo/recordings'
import type { ChatEvent } from '../src/shared/ipc'
import { ROOT } from './helpers/paths'

const RECORDINGS = join(ROOT, 'resources/demo')
const PLAYER = join(__dirname, 'wisp-demo.cjs')
const index = JSON.parse(readFileSync(join(RECORDINGS, 'index.json'), 'utf8')) as RecordingIndex
const WORK = join(HOME, 'workspace')
mkdirSync(WORK, { recursive: true })

type Line = Record<string, unknown>
const lines = (file: string): Line[] =>
  readFileSync(join(RECORDINGS, file), 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Line)

test('as gravações: o índice aponta arquivos que existem, e cada linha é um JSON válido', () => {
  const files = readdirSync(RECORDINGS).filter((name) => name.endsWith('.jsonl'))
  const named = [index.fallback, ...index.recordings.map((item) => item.file)]
  assert.deepEqual([...named].sort(), [...files].sort(), 'toda gravação está no índice')
  for (const file of files) {
    const all = lines(file)
    assert.ok(all.length > 0, file)
    for (const line of all.flatMap((line) => [
      line,
      ...((line.allow as Line[]) ?? []),
      ...((line.deny as Line[]) ?? [])
    ])) {
      if (line.approve) {
        const approve = line.approve as { tool?: unknown }
        assert.equal(typeof approve.tool, 'string', `${file}: approve sem a ferramenta`)
        assert.ok(Array.isArray(line.allow) && Array.isArray(line.deny), `${file}: allow e deny`)
      } else {
        assert.ok(
          typeof line.wait === 'number' || typeof line.say === 'string' || 'type' in line,
          `${file}: linha sem tipo: ${JSON.stringify(line)}`
        )
      }
    }
  }
})

test('as sugestões do painel caem cada uma na sua gravação; o resto, na de ajuda', () => {
  assert.equal(pickRecording('O que você faz?', index), 'ajuda.jsonl')
  assert.equal(pickRecording('Abre o Firefox', index), 'app.jsonl')
  assert.equal(pickRecording('Arruma o bug do contador', index), 'edit.jsonl')
  assert.equal(pickRecording('Pesquisa a previsão do tempo', index), 'web.jsonl')
  assert.equal(pickRecording('Me lembra de beber água', index), 'lembrete.jsonl')
  assert.equal(pickRecording('QUANTO É 2^32?', index), 'conta.jsonl')
  assert.equal(pickRecording('bom dia', index), 'ajuda.jsonl')
})

test('o login da demonstração: "auth status" responde logado', () => {
  const result = spawnSync(process.execPath, [PLAYER, 'auth', 'status', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, WISP_DEMO_DIR: RECORDINGS }
  })
  assert.equal(result.status, 0)
  assert.equal((JSON.parse(result.stdout) as { loggedIn: boolean }).loggedIn, true)
})

const opened: ClaudeSession[] = []
after(() => {
  for (const claude of opened) claude.dispose()
})

function session(): { claude: ClaudeSession; events: ChatEvent[] } {
  const events: ChatEvent[] = []
  const claude = new ClaudeSession(
    {
      // O CLI de verdade não existe: na demonstração, ele nem é procurado.
      claudePath: '/nao/existe/claude',
      workspace: () => WORK,
      allowedTools: [],
      appendSystemPrompt: 'persona',
      permissionMode: 'default',
      model: null,
      demo: () => ({ player: PLAYER, recordings: RECORDINGS })
    },
    (event) => events.push(event)
  )
  opened.push(claude)
  return { claude, events }
}

async function waitFor<T>(fn: () => T | undefined | null | false, ms = 15000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const value = fn()
    if (value) return value
    if (Date.now() - start > ms) throw new Error('o tempo acabou')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

async function turn(
  claude: ClaudeSession,
  events: ChatEvent[],
  text: string
): Promise<ChatEvent[]> {
  const from = events.length
  await claude.send(text)
  await waitFor(() => events.slice(from).some((event) => event.type === 'turn-end'))
  await waitFor(() => events.slice(from).some((event) => event.type === 'busy' && !event.busy))
  return events.slice(from)
}
const textOf = (events: ChatEvent[]): string =>
  events.map((event) => (event.type === 'text' ? event.delta : '')).join('')

test('uma conversa gravada: o texto chega aos poucos, e o turno acaba como de verdade', async () => {
  const { claude, events } = session()
  const got = await turn(claude, events, 'quanto é 2^32?')
  assert.match(textOf(got), /4\.294\.967\.296/)
  assert.ok(got.filter((event) => event.type === 'text').length > 3, 'em pedaços')
  assert.equal(
    got.find((event) => event.type === 'turn-end' && event.outcome === 'done')?.type,
    'turn-end'
  )
  assert.ok(!got.some((event) => event.type === 'notice'), 'sem o aviso de instalar')
  // O processo continua para a próxima mensagem, como o CLI de verdade.
  const next = await turn(claude, events, 'bom dia')
  assert.match(textOf(next), /demonstração/i)
  claude.dispose()
})

test('um pedido de permissão sem o servidor do Wisp: negado, e a gravação segue pelo "não"', async () => {
  const { claude, events } = session()
  const got = await turn(claude, events, 'abre o firefox')
  const tools = got.flatMap((event) => (event.type === 'tool-start' ? [event.name] : []))
  assert.ok(
    tools.some((name) => /open_app/.test(name)),
    JSON.stringify(tools)
  )
  const result = got.find(
    (event): event is Extract<ChatEvent, { type: 'tool-result' }> =>
      event.type === 'tool-result' && event.isError
  )
  assert.ok(result, 'o resultado da ferramenta é o da recusa')
  assert.match(textOf(got), /não abro/)
  claude.dispose()
})
