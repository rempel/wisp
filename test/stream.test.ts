// O leitor do stream do Claude Code (claude.ts), com um CLI de mentira (test/fixtures/fake-claude):
// texto em pedaços, ferramentas com o diff, Parar, o processo reaproveitado, conversa nova, troca
// de modelo e de modo, CLI ausente, sem login, limite do plano e queda do processo.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { ClaudeSession, INSTALL_HINT, LOGIN_HINT } from '../src/main/claude'
import type { ClaudeOptions } from '../src/main/claude'
import type { ChatEvent } from '../src/shared/ipc'
import { FIXTURES } from './helpers/paths'

const CLI = join(FIXTURES, 'fake-claude')
const WORK = join(HOME, 'workspace')
mkdirSync(WORK, { recursive: true })
// O Wisp nunca passa a chave da API adiante: o Claude Code cobraria por uso.
process.env.ANTHROPIC_API_KEY = 'sk-de-mentira'

interface Spawn {
  pid: number
  args: string[]
  apiKey: boolean
  memory?: string
  internal?: string
}
const spawns = (): Spawn[] => {
  try {
    return readFileSync(join(HOME, '.fake-claude/spawns.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Spawn)
  } catch {
    return []
  }
}
const flag = (args: string[], name: string): string | undefined => args[args.indexOf(name) + 1]

// Todas as sessões são encerradas no fim, mesmo se um teste falhar no meio.
const opened: ClaudeSession[] = []
after(() => {
  for (const claude of opened) claude.dispose()
})

function session(options: Partial<ClaudeOptions> = {}): {
  claude: ClaudeSession
  events: ChatEvent[]
} {
  const events: ChatEvent[] = []
  const claude = new ClaudeSession(
    {
      claudePath: CLI,
      workspace: () => WORK,
      allowedTools: ['Read'],
      appendSystemPrompt: 'persona',
      permissionMode: 'default',
      model: null,
      ...options
    },
    (event) => events.push(event)
  )
  opened.push(claude)
  return { claude, events }
}

async function waitFor<T>(fn: () => T | undefined | null | false, ms = 8000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const value = fn()
    if (value) return value
    if (Date.now() - start > ms) throw new Error('o tempo acabou')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

/** Manda uma mensagem e espera o fim do turno; devolve os eventos do turno. */
async function turn(
  claude: ClaudeSession,
  events: ChatEvent[],
  text: string
): Promise<ChatEvent[]> {
  const from = events.length
  await claude.send(text)
  await waitFor(() => events.slice(from).some((event) => event.type === 'turn-end'))
  // O busy:false vem logo depois do fim do turno.
  await waitFor(() => events.slice(from).some((event) => event.type === 'busy' && !event.busy))
  return events.slice(from)
}
const textOf = (events: ChatEvent[]): string =>
  events.map((event) => (event.type === 'text' ? event.delta : '')).join('')
const outcome = (events: ChatEvent[]): string | undefined =>
  events.find(
    (event): event is Extract<ChatEvent, { type: 'turn-end' }> => event.type === 'turn-end'
  )?.outcome
const notices = (events: ChatEvent[]): string[] =>
  events.flatMap((event) => (event.type === 'notice' ? [event.text] : []))

test('uma resposta: o texto em pedaços, o fim do turno e o processo com as opções certas', async () => {
  const { claude, events } = session()
  const got = await turn(claude, events, 'oi')
  assert.equal(textOf(got), 'Oi! Tudo certo por aqui.')
  assert.equal(outcome(got), 'done')
  assert.deepEqual(
    got.filter((event) => event.type === 'busy'),
    [
      { type: 'busy', busy: true },
      { type: 'busy', busy: false }
    ]
  )
  const [spawn] = spawns()
  assert.equal(spawn.apiKey, false, 'a ANTHROPIC_API_KEY não chega ao CLI')
  assert.equal(spawn.memory, '1', 'a memória automática fica desligada')
  assert.equal(spawn.internal, '1', 'o processo é marcado como do Wisp')
  assert.equal(flag(spawn.args, '--permission-mode'), 'default')
  assert.equal(flag(spawn.args, '--input-format'), 'stream-json')
  assert.equal(flag(spawn.args, '--session-id'), claude.ensureSessionId())
  assert.ok(spawn.args.includes('-p'))
  claude.dispose()
})

test('edição: o card da ferramenta com os argumentos e o diff', async () => {
  const { claude, events } = session()
  const got = await turn(claude, events, '[edit] muda o b')
  const start = got.find((event) => event.type === 'tool-start')
  const input = got.find((event) => event.type === 'tool-input')
  const result = got.find((event) => event.type === 'tool-result')
  assert.ok(start && start.type === 'tool-start' && start.name === 'Edit')
  assert.ok(input && input.type === 'tool-input')
  assert.equal((input.input as { file_path: string }).file_path, '/home/u/projeto/src/app.ts')
  assert.ok(result && result.type === 'tool-result' && !result.isError)
  assert.equal(result.diff?.added, 2)
  assert.equal(result.diff?.removed, 1)
  claude.dispose()
})

test('Parar no meio: o turno acaba como parado, e o processo continua para a próxima', async () => {
  const { claude, events } = session()
  const from = events.length
  await claude.send('[lento] conta devagar')
  await waitFor(() => textOf(events.slice(from)).length > 0)
  claude.stop()
  await waitFor(() => outcome(events.slice(from)))
  assert.equal(outcome(events.slice(from)), 'stopped')
  const before = spawns().length
  const next = await turn(claude, events, 'oi de novo')
  assert.equal(outcome(next), 'done')
  assert.equal(spawns().length, before, 'o mesmo processo')
  claude.dispose()
})

test('conversa nova: outro processo, com outro id de sessão', async () => {
  const { claude, events } = session()
  await turn(claude, events, 'primeira')
  const first = claude.ensureSessionId()
  claude.reset()
  assert.ok(events.some((event) => event.type === 'reset'))
  await turn(claude, events, 'segunda')
  const second = claude.ensureSessionId()
  assert.notEqual(first, second)
  assert.equal(flag(spawns().at(-1)!.args, '--session-id'), second)
  claude.dispose()
})

test('modelo: troca pelo stdin; um modelo recusado avisa e a pílula volta', async () => {
  const { claude, events } = session({ model: 'sonnet' })
  await turn(claude, events, 'oi')
  claude.setModel('opus')
  const ok = await turn(claude, events, '[modelo]')
  assert.equal(textOf(ok), 'Modelo: claude-opus-5-5')
  claude.setModel('claude-naoexiste-9')
  const refused = await turn(claude, events, '[modelo]')
  assert.match(
    notices(refused).join('\n'),
    /Não consegui trocar para o modelo `claude-naoexiste-9`/
  )
  assert.equal(textOf(refused), 'Modelo: claude-opus-5-5')
  assert.equal(claude.modelEvent().choice, 'opus')
  claude.dispose()
})

test('modo de permissão: vale na hora, e o arquivo que o hook do Bash lê acompanha', async () => {
  const modeFile = join(HOME, 'run', 'modo')
  const { claude, events } = session({ modeFile })
  await turn(claude, events, 'oi')
  assert.equal(readFileSync(modeFile, 'utf8'), 'default')
  claude.setPermissionMode('auto')
  assert.equal(claude.permissionMode, 'auto')
  assert.equal(readFileSync(modeFile, 'utf8'), 'auto')
  assert.deepEqual(events.at(-1), { type: 'mode', mode: 'auto' })
  const got = await turn(claude, events, '[modo]')
  assert.equal(textOf(got), 'Modo: auto')
  claude.dispose()
  // Sem processo, o próximo já sobe com o modo.
  const fresh = session({ permissionMode: 'plan' })
  await turn(fresh.claude, fresh.events, 'oi')
  assert.equal(flag(spawns().at(-1)!.args, '--permission-mode'), 'plan')
  fresh.claude.dispose()
})

test('sem o Claude Code: o aviso de instalar, e o turno acaba com erro', async () => {
  const { claude, events } = session({ claudePath: join(HOME, 'nao-existe', 'claude') })
  const got = await turn(claude, events, 'oi')
  assert.equal(outcome(got), 'error')
  assert.deepEqual(notices(got), [INSTALL_HINT])
})

test('sem login: o aviso de fazer login', async () => {
  process.env.FAKE_CLAUDE_LOGGED_OUT = '1'
  try {
    const { claude, events } = session()
    const got = await turn(claude, events, 'oi')
    assert.equal(outcome(got), 'error')
    assert.deepEqual(notices(got), [LOGIN_HINT])
  } finally {
    delete process.env.FAKE_CLAUDE_LOGGED_OUT
  }
})

test('limite do plano e erro de rede: avisos em português', async () => {
  const { claude, events } = session()
  const limit = await turn(claude, events, '[limite]')
  assert.equal(outcome(limit), 'error')
  assert.match(notices(limit).join('\n'), /limite/i)
  const network = await turn(claude, events, '[rede]')
  assert.equal(outcome(network), 'error')
  assert.match(notices(network).join('\n'), /conex|rede|internet/i)
  claude.dispose()
})

test('o processo caiu no meio: aviso de erro, e a próxima mensagem sobe outro', async () => {
  const { claude, events } = session()
  const crashed = await turn(claude, events, '[queda]')
  assert.equal(outcome(crashed), 'error')
  assert.ok(notices(crashed).length > 0)
  const before = spawns().length
  const next = await turn(claude, events, 'oi')
  assert.equal(outcome(next), 'done')
  assert.equal(spawns().length, before + 1)
  claude.dispose()
})

process.on('exit', () => rmSync(WORK, { recursive: true, force: true }))
