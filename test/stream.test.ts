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

// ---- Fase 14: pela OpenRouter ---------------------------------------------
interface ProviderSpawn extends Spawn {
  baseUrl?: string
  tokenTail?: string
  apiKeyValue?: string
  configDir?: string
  haiku?: string
  subagent?: string
  nonessential?: string
}
const PRICING = {
  id: 'vendor/m',
  name: 'M',
  prompt: 3,
  completion: 15,
  cacheRead: 0.3,
  cacheWrite: null,
  context: null
}

test('OpenRouter: sem modelo ou sem chave, um aviso e nada roda', async () => {
  let key: string | null = null
  const before = spawns().length
  const { claude, events } = session({
    provider: 'openrouter',
    openrouter: { key: async () => key, pricing: async () => PRICING }
  })
  let got = await turn(claude, events, 'oi')
  assert.equal(outcome(got), 'error')
  assert.match(notices(got).join('\n'), /Escolha um modelo da OpenRouter/)
  claude.setModel('vendor/m')
  got = await turn(claude, events, 'oi')
  assert.match(notices(got).join('\n'), /guarde a sua chave em \*\*Configurações → OpenRouter\*\*/)
  const locked = session({
    provider: 'openrouter',
    model: 'vendor/m',
    openrouter: {
      key: async () => {
        throw new Error('O chaveiro continua trancado: destranque-o para eu usar a chave.')
      },
      pricing: async () => null
    }
  })
  got = await turn(locked.claude, locked.events, 'oi')
  assert.match(notices(got).join('\n'), /chaveiro continua trancado/)
  assert.equal(spawns().length, before, 'nenhum processo subiu')
  key = 'x'
  claude.dispose()
  locked.claude.dispose()
})

test('OpenRouter: o ambiente, o modelo, o custo, a troca de modelo e a chave recusada', async () => {
  process.env.WISP_OPENROUTER_URL = 'http://127.0.0.1:1/api'
  let reads = 0
  const { claude, events } = session({
    provider: 'openrouter',
    model: 'vendor/m',
    openrouter: {
      key: async () => {
        reads++
        return 'sk-or-v1-abcdefghijklmnop1234'
      },
      pricing: async (model) => (model === 'vendor/m' ? PRICING : null)
    }
  })
  const before = spawns().length
  let got = await turn(claude, events, 'oi')
  assert.equal(outcome(got), 'done')
  const spawn = spawns()[before] as ProviderSpawn
  assert.equal(spawn.baseUrl, 'http://127.0.0.1:1/api')
  assert.equal(spawn.tokenTail, '1234', 'a chave vai no ambiente')
  assert.equal(spawn.apiKeyValue, '', 'a ANTHROPIC_API_KEY herdada vai vazia')
  assert.equal(spawn.configDir, join(HOME, '.local/share/wisp/openrouter-claude'))
  assert.equal(spawn.haiku, 'vendor/m')
  assert.equal(spawn.subagent, 'vendor/m')
  assert.equal(spawn.nonessential, '1')
  assert.ok(spawn.args.includes('--model=vendor/m'))
  assert.ok(!spawn.args.join(' ').includes('sk-or-'), 'a chave nunca vai nos argumentos')
  // O custo: 1000 de entrada, 50 de saída e 2000 lidos do cache, pelos preços da OpenRouter.
  let cost = await waitFor(() =>
    events.findLast((e): e is Extract<ChatEvent, { type: 'cost' }> => e.type === 'cost')
  )
  assert.deepEqual(cost.cost, {
    usd: (3000 + 750 + 600) / 1e6,
    inputTokens: 3000,
    outputTokens: 50,
    turns: 1
  })
  assert.deepEqual(claude.costEvent(), cost)

  // Trocar o modelo sobe outro processo (o modelo vai no ambiente), que retoma a conversa.
  claude.setModel('vendor/outro')
  got = await turn(claude, events, 'de novo')
  assert.equal(outcome(got), 'done')
  const second = spawns()[before + 1] as ProviderSpawn
  assert.ok(second.args.includes('--model=vendor/outro'))
  assert.equal(second.haiku, 'vendor/outro')
  assert.equal(flag(second.args, '--resume'), claude.ensureSessionId())
  cost = await waitFor(() =>
    events.findLast(
      (e): e is Extract<ChatEvent, { type: 'cost' }> => e.type === 'cost' && e.cost.turns === 2
    )
  )
  assert.equal(cost.cost.usd, null, 'sem o preço do modelo novo, o total fica sem preço')
  assert.equal(cost.cost.outputTokens, 100)

  // A chave recusada: o erro em português, e a chave é lida de novo na próxima mensagem.
  got = await turn(claude, events, '[chave ruim]')
  assert.equal(outcome(got), 'error')
  assert.match(notices(got).join('\n'), /A OpenRouter recusou a chave/)
  assert.doesNotMatch(notices(got).join('\n'), /claude \/login|faça login/i)
  assert.equal(reads, 1)
  await turn(claude, events, 'oi')
  assert.equal(reads, 2)

  // De volta à assinatura: a conversa recomeça, sem nada da OpenRouter no processo.
  const from = events.length
  claude.setProvider('subscription')
  claude.setModel(null)
  assert.deepEqual(events.slice(from, from + 2), [
    { type: 'reset' },
    { type: 'provider', provider: 'subscription' }
  ])
  assert.equal(claude.costEvent(), null)
  const count = spawns().length
  await turn(claude, events, 'oi')
  const third = spawns()[count] as ProviderSpawn
  assert.notEqual(third.baseUrl, 'http://127.0.0.1:1/api')
  assert.equal(third.tokenTail ?? '', '', 'nenhum token vai junto pela assinatura')
  assert.equal(third.configDir, undefined)
  assert.equal(third.apiKey, false)
  claude.dispose()
  delete process.env.WISP_OPENROUTER_URL
})

// ---- Fase 15: numa pasta ---------------------------------------------------
test('numa pasta: o processo roda nela, inclusive depois de uma conversa nova; sem confiança, não sobe', async () => {
  const folder = join(HOME, 'projetos', 'meu-app')
  mkdirSync(folder, { recursive: true })
  let trusted = false
  let asked = 0
  const { claude, events } = session({
    folderGate: async () => {
      asked++
      return trusted
    }
  })
  claude.setFolder(folder)
  assert.equal(claude.currentFolder, folder)
  const before = spawns().length
  let got = await turn(claude, events, 'oi')
  assert.equal(outcome(got), 'error')
  assert.equal(spawns().length, before, 'sem confiar, nada sobe')
  trusted = true
  got = await turn(claude, events, 'oi')
  assert.equal(outcome(got), 'done')
  assert.equal((spawns().at(-1) as Spawn & { cwd: string }).cwd, folder)
  // O mesmo processo responde a próxima: a pasta não é conferida de novo.
  const checks = asked
  await turn(claude, events, 'de novo')
  assert.equal(asked, checks)
  claude.reset()
  await turn(claude, events, 'conversa nova')
  assert.equal((spawns().at(-1) as Spawn & { cwd: string }).cwd, folder, 'Ctrl+K continua na pasta')
  claude.dispose()
})

// ---- O contexto e a compactação --------------------------------------------
test('o contexto: o que a última chamada ocupou, a janela do modelo e o /compact', async () => {
  const { claude, events } = session()
  assert.equal(claude.compact(), false, 'sem conversa, nada a compactar')
  await turn(claude, events, 'oi')
  const contexts = (): Extract<ChatEvent, { type: 'context' }>[] =>
    events.filter((e): e is Extract<ChatEvent, { type: 'context' }> => e.type === 'context')
  assert.deepEqual(contexts().at(-1)?.context, { used: 33000, window: 200000, compacting: false })
  assert.deepEqual(claude.contextEvent(), contexts().at(-1))

  // Compactar: o /compact (com as instruções numa linha só), o "compactando" e o marco.
  const from = events.length
  assert.equal(claude.compact('mantenha\n as decisões'), true)
  assert.equal(claude.compact(), false, 'respondendo, não compacta de novo')
  await waitFor(() => events.slice(from).some((e) => e.type === 'turn-end'))
  const got = events.slice(from)
  assert.ok(got.some((e) => e.type === 'context' && e.context.compacting))
  assert.deepEqual(
    got.find((e) => e.type === 'compacted'),
    { type: 'compacted', trigger: 'manual', before: 33000, after: 4000 }
  )
  assert.deepEqual(contexts().at(-1)?.context, { used: 4000, window: 200000, compacting: false })
  assert.equal(outcome(got), 'done')
  assert.ok(!got.some((e) => e.type === 'text'), 'o resumo não aparece como resposta')
  const log = readFileSync(join(HOME, '.fake-claude/compacts.log'), 'utf8').trim().split('\n')
  assert.deepEqual(JSON.parse(log.at(-1) as string), {
    text: '/compact mantenha as decisões',
    trigger: 'manual'
  })

  // Perto do limite, o Claude Code compacta sozinho: o marco diz que foi automático.
  const before = events.length
  await turn(claude, events, '[cheio] continua')
  assert.equal(
    (events.slice(before).find((e) => e.type === 'compacted') as { trigger?: string })?.trigger,
    'auto'
  )
  claude.reset()
  assert.equal(claude.contextEvent(), null, 'conversa nova, contexto novo')
  claude.dispose()
})
