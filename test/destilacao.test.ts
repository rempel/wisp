// O diário e a faxina (Fase 81): destilar uma conversa parada (o trecho novo, uma vez só, com as
// regras da memória), o que fica de fora (anônima, pasta excluída, pouco texto, desligada), a
// faxina que espera o OK com o diff, o custo, e o Claude Code de uma vez só (o de mentira).
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { FIXTURES } from './helpers/paths'
import { askOnce, jsonOf, parseOnce } from '../src/main/claude-once'
import { CLEANUP_EVERY_MS, Distiller, IDLE_MS } from '../src/main/distill'
import type { Ask } from '../src/main/distill'
import { History } from '../src/main/history'
import { cleanupAction } from '../src/main/memory'
import { PersonalMemory } from '../src/main/personal-memory'

let n = 0
function setup(reply: (prompt: string) => string, options: { excluded?: string[] } = {}) {
  const root = join(HOME, `destila-${++n}`)
  const memory = new PersonalMemory(join(root, 'memoria'))
  const history = new History(join(root, 'conversas'))
  let now = new Date(2026, 10, 19, 10, 0).getTime()
  const prompts: string[] = []
  let enabled = true
  let ready = 0
  const ask: Ask = async (prompt) => {
    prompts.push(prompt)
    return { ok: true, text: reply(prompt), cost: 0.002 }
  }
  const distiller = new Distiller({
    memory,
    load: (id) => history.load(id),
    excluded: () => options.excluded ?? [],
    enabled: () => enabled,
    ask,
    file: join(root, 'memoria', 'destilacao.json'),
    now: () => now,
    cleanupReady: () => ready++
  })
  const converse = (
    texts: string[],
    meta: { anonymous?: boolean; cwd?: string; id?: string } = {}
  ): string => {
    history.anonymous = meta.anonymous ?? false
    history.cwd = meta.cwd ?? null
    if (meta.id) {
      const saved = history.load(meta.id)!
      history.continue(saved)
    }
    for (let i = 0; i < texts.length; i += 2) {
      history.user(meta.id ?? randomUUID(), texts[i], [], false)
      history.record({ type: 'text', blockId: `b${Math.random()}`, delta: texts[i + 1] ?? 'ok' })
    }
    history.flush()
    const id = history.currentId()!
    history.record({ type: 'reset' })
    return id
  }
  return {
    root,
    memory,
    distiller,
    converse,
    prompts,
    advance: (ms: number) => (now += ms),
    setEnabled: (value: boolean) => (enabled = value),
    ready: () => ready
  }
}

const LONG = 'Vamos planejar a viagem para Lisboa em dezembro, com a Ana e o Pedro, por dez dias.'

test('destilar: a conversa parada vira diário e fatos, uma vez só', async () => {
  const reply = (): string =>
    '```json\n' +
    JSON.stringify({
      diario: ['Planejou a viagem para Lisboa', 'Escolheu as datas', 'linha a mais'],
      eu: ['O Pedro é o cunhado dele'],
      memoria: ['A viagem para Lisboa é de 10 a 20 de dezembro', 'senha: batata123']
    }) +
    '\n```'
  const { memory, distiller, converse, prompts, advance } = setup(reply)
  const id = converse([LONG, 'Ótimo, de 10 a 20 de dezembro então.'])
  distiller.touch(id)
  await distiller.tick()
  assert.equal(prompts.length, 0, 'antes dos 15 minutos, espera')
  advance(IDLE_MS)
  await distiller.tick()
  assert.equal(prompts.length, 1)
  assert.match(prompts[0], /<conversa>\nUsuário: Vamos planejar a viagem/)
  assert.match(prompts[0], /Claude: Ótimo, de 10 a 20/)
  const diary = readFileSync(memory.path('diario'), 'utf8')
  assert.match(diary, /Planejou a viagem para Lisboa/)
  assert.match(diary, /Escolheu as datas/)
  assert.doesNotMatch(diary, /linha a mais/, 'no máximo duas linhas no diário')
  assert.match(readFileSync(memory.path('eu'), 'utf8'), /O Pedro é o cunhado dele/)
  const facts = readFileSync(memory.path('memoria'), 'utf8')
  assert.match(facts, /10 a 20 de dezembro/)
  assert.doesNotMatch(facts, /batata/, 'segredos não entram, nem pela destilação')
  const notes = memory.notes()
  assert.ok(notes.every((note) => note.auto && note.conversation === id))
  // Nada novo: não pergunta de novo.
  distiller.touch(id)
  advance(IDLE_MS)
  await distiller.tick()
  assert.equal(prompts.length, 1)
  // Só o trecho novo vai na próxima.
  converse(
    ['E reservei o hotel no Chiado para todas as noites da viagem, com café da manhã.', 'Anotado.'],
    { id }
  )
  distiller.touch(id)
  advance(IDLE_MS)
  await distiller.tick()
  assert.equal(prompts.length, 2)
  assert.doesNotMatch(prompts[1], /<conversa>\nUsuário: Vamos planejar/)
  assert.match(prompts[1], /hotel no Chiado/)
  assert.match(prompts[1], /<memoria>[\s\S]*10 a 20 de dezembro/, 'leva a memória de agora')
  assert.deepEqual(distiller.costs(), { runs: 2, cost: 0.004 })
})

test('destilar: fechar a aba destila na hora; o que fica de fora', async () => {
  const clients = join(HOME, 'clientes-destila')
  mkdirSync(clients, { recursive: true })
  const reply = (): string => JSON.stringify({ diario: ['Algo'], eu: [], memoria: ['Um fato'] })
  const { distiller, converse, prompts, setEnabled } = setup(reply, { excluded: [clients] })
  const id = converse([LONG, 'Combinado.'])
  distiller.touch(id)
  await distiller.closed(id)
  assert.equal(prompts.length, 1)
  for (const meta of [{ anonymous: true }, { cwd: clients }]) {
    const other = converse([LONG, 'Combinado.'], meta)
    distiller.touch(other)
    await distiller.closed(other)
  }
  const short = converse(['oi', 'olá'])
  distiller.touch(short)
  await distiller.closed(short)
  assert.equal(prompts.length, 1, 'anônima, pasta excluída e pouco texto não vão')
  assert.equal(distiller.waiting(), 0)
  setEnabled(false)
  const off = converse([LONG, 'Combinado.'])
  distiller.touch(off)
  await distiller.closed(off)
  assert.equal(prompts.length, 1, 'desligada, não roda')
  assert.equal(distiller.waiting(), 1, 'e a conversa continua esperando')
  // Uma conversa que não está aberta numa aba não é destilada ao fechar.
  await distiller.closed('nao-existe')
})

test('destilar: uma resposta que não é JSON não anota nada e tenta depois', async () => {
  const { memory, distiller, converse, prompts, advance } = setup(() => 'Desculpe, não entendi.')
  const id = converse([LONG, 'Certo.'])
  distiller.touch(id)
  advance(IDLE_MS)
  await distiller.tick()
  assert.equal(prompts.length, 1)
  assert.equal(memory.notes().length, 0)
  assert.equal(distiller.waiting(), 1)
})

test('faxina: uma semana depois, a proposta espera o OK com o diff; gravar faz o backup', async () => {
  let cleaned = ''
  const { root, memory, distiller, advance, ready, prompts } = setup((prompt) =>
    /arruma|Junte/.test(prompt) ? JSON.stringify({ memoria: cleaned }) : '{}'
  )
  memory.save('memoria', 'Gosta de café')
  memory.save('memoria', 'Gosta muito de café')
  memory.save('memoria', 'A reunião com o banco é dia 3 de outubro')
  const before = readFileSync(memory.path('memoria'), 'utf8')
  cleaned = before.replace('- Gosta de café\n', '').replace(/- A reunião.*\n/, '')
  await distiller.tick()
  assert.equal(prompts.length, 0, 'a primeira vez só começa a contar')
  advance(CLEANUP_EVERY_MS)
  await distiller.tick()
  assert.equal(prompts.length, 1)
  assert.match(prompts[0], /Gosta muito de café/)
  assert.equal(ready(), 1, 'avisa que a faxina está pronta')
  assert.equal(readFileSync(memory.path('memoria'), 'utf8'), before, 'nada gravado sem o OK')
  const data = join(root)
  const info = await cleanupAction('status', distiller, join(root, 'claude'), data)
  assert.ok(info.pending)
  assert.equal(info.pending.stale, false)
  assert.ok(info.pending.preview.diff.hunks.length > 0)
  const saved = await cleanupAction('accept', distiller, join(root, 'claude'), data)
  assert.equal(saved.pending, undefined)
  const after = readFileSync(memory.path('memoria'), 'utf8')
  assert.doesNotMatch(after, /- Gosta de café\n/)
  assert.match(after, /Gosta muito de café/)
  assert.match(saved.message ?? '', /backup/)
})

test('faxina: mudar o arquivo depois a deixa velha; vazia ou destrutiva não vira proposta', async () => {
  let answer = ''
  const { root, memory, distiller } = setup(() => answer)
  for (let i = 0; i < 6; i++) memory.save('memoria', `Fato número ${i} para guardar`)
  answer = JSON.stringify({ memoria: '# Memória\n\n- Fato número 1 para guardar\n' })
  assert.equal((await distiller.cleanup()).message, 'invalid', 'jogar fora quase tudo não vale')
  answer = 'não sei'
  assert.equal((await distiller.cleanup()).ok, false)
  const text = readFileSync(memory.path('memoria'), 'utf8')
  answer = JSON.stringify({ memoria: text })
  assert.equal((await distiller.cleanup()).message, 'unchanged')
  answer = JSON.stringify({ memoria: text.replace('- Fato número 0 para guardar\n', '') })
  assert.equal((await distiller.cleanup()).message, 'pending')
  memory.save('memoria', 'Um fato novo depois da faxina')
  const info = await cleanupAction('accept', distiller, join(root, 'claude'), root)
  assert.ok(info.pending?.stale)
  assert.match(info.message ?? '', /mudou depois da faxina/)
  assert.match(readFileSync(memory.path('memoria'), 'utf8'), /Fato número 0/)
  const dropped = await cleanupAction('discard', distiller, join(root, 'claude'), root)
  assert.equal(dropped.pending, undefined)
})

test('o Claude Code de uma vez só: sem ferramentas, com o Haiku, o custo e o JSON', async () => {
  assert.deepEqual(jsonOf('```json\n{"a": 1}\n```'), { a: 1 })
  assert.deepEqual(jsonOf('Aqui: {"b": [2]} pronto'), { b: [2] })
  assert.equal(jsonOf('nada'), null)
  assert.deepEqual(parseOnce('aviso\n{"type":"result","result":"oi","total_cost_usd":0.5}'), {
    ok: true,
    text: 'oi',
    cost: 0.5
  })
  process.env.FAKE_JSON_REPLY = '{"diario": ["x"]}'
  try {
    const cwd = join(HOME, 'once')
    mkdirSync(cwd, { recursive: true })
    const result = await askOnce({
      claudePath: join(FIXTURES, 'fake-claude'),
      cwd,
      prompt: 'destile isto',
      system: 'sistema'
    })
    assert.deepEqual(result, { ok: true, text: '{"diario": ["x"]}', cost: 0.0021 })
    const log = readFileSync(join(HOME, '.fake-claude', 'once.log'), 'utf8')
      .trim()
      .split('\n')
    const last = JSON.parse(log[log.length - 1])
    assert.equal(last.model, 'haiku')
    assert.equal(last.input, 'destile isto')
  } finally {
    delete process.env.FAKE_JSON_REPLY
  }
  const missing = await askOnce({
    claudePath: join(HOME, 'nao-existe'),
    cwd: HOME,
    prompt: 'x',
    system: 'y'
  })
  assert.equal(missing.ok, false)
  writeFileSync(join(HOME, 'vazio.txt'), '')
})
