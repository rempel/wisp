// Voltar, ramificar e a pergunta lateral (Fase 46): o histórico volta a qualquer turno (com
// `keep`) e acha o ponto para ramificar; as cópias de antes das edições ficam guardadas por turno
// e voltam os arquivos ao que eram antes daquele turno (a mais antiga de cada arquivo); e a
// pergunta lateral sobe o Claude Code (de mentira) sem ferramentas, com o que a sessão lembra.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ASIDE_DENIED, askAside, asideArgs, parseAside } from '../src/main/aside'
import { applyRewinds, forkPoint, pointBefore, turnStarts } from '../src/main/history'
import { TurnReviews, turnsDirOf } from '../src/main/turn-review'
import { snapshotFile } from '../src/main/turn-snapshot'
import { initialState, reducer, turnStartsOf } from '../src/renderer/chat/state'
import type { ChatEvent } from '../src/shared/ipc'
import { FIXTURES } from './helpers/paths'

const user = (text: string, inTurn = false): ChatEvent => ({
  type: 'user',
  text,
  attachments: [],
  ...(inTurn ? { inTurn } : {})
})
const end = (at?: string): ChatEvent => ({
  type: 'turn-end',
  outcome: 'done',
  ...(at ? { at } : {})
})
const text = (blockId: string, delta: string): ChatEvent => ({ type: 'text', blockId, delta })

const four = [
  user('a'),
  text('1', 'A'),
  end('u1'),
  user('b'),
  user('no meio', true),
  end('u2'),
  user('c'),
  end('u3'),
  user('d'),
  end('u4')
]

test('pontos: as mensagens que começam um turno', () => {
  assert.deepEqual(turnStarts(four), [0, 3, 6, 8])
})

test('pontos: voltar a um turno tira ele e o que veio depois', () => {
  assert.deepEqual(applyRewinds([...four, { type: 'rewind', keep: 1 }]), four.slice(0, 3))
  assert.deepEqual(applyRewinds([...four, { type: 'rewind', keep: 0 }]), [])
  // Um keep além do fim não muda nada; o sem keep continua tirando o último.
  assert.deepEqual(applyRewinds([...four, { type: 'rewind', keep: 9 }]), four)
  assert.deepEqual(applyRewinds([...four, { type: 'rewind' }]), four.slice(0, 8))
  // Voltar e seguir: a conversa nova cresce do ponto.
  const after = applyRewinds([...four, { type: 'rewind', keep: 2 }, user('c2'), end('u5')])
  assert.deepEqual(after, [...four.slice(0, 6), user('c2'), end('u5')])
})

test('pontos: para onde voltar no Claude Code', () => {
  assert.deepEqual(pointBefore(four, 0), { at: null, text: 'a', attachments: [] })
  assert.equal(pointBefore(four, 1)?.at, 'u1')
  assert.equal(pointBefore(four, 2)?.at, 'u2')
  assert.equal(pointBefore(four, 3)?.text, 'd')
  assert.equal(pointBefore(four, 4), undefined)
  // Sem o uuid da resposta de antes, não dá.
  assert.equal(pointBefore([user('a'), end(), user('b'), end('u2')], 1), undefined)
})

test('pontos: ramificar no fim de um turno', () => {
  const fork = forkPoint(four, 1)
  assert.equal(fork?.at, 'u2')
  assert.deepEqual(fork?.events, four.slice(0, 6))
  assert.equal(forkPoint(four, 3)?.events.length, four.length)
  // Um turno sem o fim guardado (parou antes de responder) não ramifica.
  assert.equal(forkPoint([user('a'), end('u1'), user('b')], 1), undefined)
  assert.equal(forkPoint(four, 7), undefined)
})

test('pontos: o painel tira as mensagens do turno pedido em diante', () => {
  const events: ChatEvent[] = [user('a'), end('u1'), user('b'), end('u2'), user('c'), end('u3')]
  const shown = reducer(initialState, { type: 'events', events })
  assert.equal(turnStartsOf(shown.items).length, 3)
  const back = reducer(shown, { type: 'events', events: [{ type: 'rewind', keep: 1 }] })
  assert.deepEqual(
    back.items
      .filter((item) => item.kind === 'user')
      .map((item) => item.kind === 'user' && item.text),
    ['a']
  )
})

const work = join(HOME, 'projeto-pontos')
mkdirSync(work, { recursive: true })
const snaps = join(HOME, 'copias-pontos')
const file = join(work, 'app.ts')

test('pontos: as cópias por turno voltam os arquivos ao que eram antes daquele turno', () => {
  let turns = 0
  const reviews = new TurnReviews(
    (id) => join(snaps, id),
    () => true,
    () => turns
  )
  const id = 'conversa'
  const busy = (): void => {
    turns++
    reviews.onEvent(id, { type: 'busy', busy: true })
  }
  const done = (): void => {
    reviews.onEvent(id, { type: 'turn-end', outcome: 'done' })
  }
  writeFileSync(file, 'v0\n')
  // Turno 0: v0 → v1. Turno 1: nada. Turno 2: v1 → v2, e um arquivo novo.
  busy()
  snapshotFile(join(snaps, id), file)
  writeFileSync(file, 'v1\n')
  done()
  busy()
  done()
  busy()
  snapshotFile(join(snaps, id), file)
  writeFileSync(file, 'v2\n')
  const created = join(work, 'novo.ts')
  snapshotFile(join(snaps, id), created)
  writeFileSync(created, 'novo\n')
  done()
  assert.ok(existsSync(join(turnsDirOf(join(snaps, id)), '0')))

  // Voltar ao turno 2: só o que ele mudou.
  const two = reviews.preview(id, 2)
  assert.equal(two.partial, false)
  assert.deepEqual(
    two.files.map((f) => [f.path, f.status]),
    [
      [file, 'modified'],
      [created, 'created']
    ]
  )
  // Voltar ao turno 0: o app.ts volta ao v0 (a cópia mais antiga), o novo some.
  const zero = reviews.preview(id, 0)
  assert.equal(zero.files.length, 2)
  const result = reviews.restore(
    id,
    0,
    zero.files.map(({ path, hash }) => ({ path, hash }))
  )
  assert.deepEqual(result.problems, [])
  assert.equal(readFileSync(file, 'utf8'), 'v0\n')
  assert.equal(existsSync(created), false)
  // O 'rewind' leva as cópias dos turnos que saíram; o próximo turno começa do ponto.
  reviews.onEvent(id, { type: 'rewind', keep: 0 })
  assert.equal(existsSync(join(turnsDirOf(join(snaps, id)), '0')), false)
  assert.deepEqual(reviews.preview(id, 0).files, [])
})

test('pontos: um arquivo mudado depois da prévia fica como está', () => {
  let turns = 0
  const reviews = new TurnReviews(
    (id) => join(snaps, id),
    () => true,
    () => turns
  )
  writeFileSync(file, 'antes\n')
  turns = 1
  reviews.onEvent('outra', { type: 'busy', busy: true })
  snapshotFile(join(snaps, 'outra'), file)
  writeFileSync(file, 'depois\n')
  reviews.onEvent('outra', { type: 'turn-end', outcome: 'done' })
  const preview = reviews.preview('outra', 0)
  writeFileSync(file, 'mexido à mão\n')
  const result = reviews.restore(
    'outra',
    0,
    preview.files.map(({ path, hash }) => ({ path, hash }))
  )
  assert.equal(result.undone.length, 0)
  assert.equal(result.problems.length, 1)
  assert.equal(readFileSync(file, 'utf8'), 'mexido à mão\n')
})

test('pontos: turnos de antes de o Wisp abrir não têm cópias (a prévia avisa)', () => {
  const reviews = new TurnReviews(
    (id) => join(snaps, id),
    () => true,
    () => 5
  )
  reviews.onEvent('reaberta', { type: 'busy', busy: true })
  reviews.onEvent('reaberta', { type: 'turn-end', outcome: 'done' })
  assert.equal(reviews.preview('reaberta', 4).partial, false)
  assert.equal(reviews.preview('reaberta', 2).partial, true)
  // Sem nenhum turno ao vivo, tudo é de antes.
  assert.equal(reviews.preview('nunca', 0).partial, true)
})

test('pergunta lateral: sem ferramentas, sem gravar, numa cópia da sessão', () => {
  const args = asideArgs({ bin: 'claude', env: {}, cwd: '/', sessionId: 'abc', model: 'opus' })
  assert.ok(args.includes('--no-session-persistence'))
  assert.equal(args[args.indexOf('--max-turns') + 1], '1')
  for (const tool of ['Bash', 'Edit', 'Write', 'Read']) assert.ok(ASIDE_DENIED.includes(tool))
  assert.deepEqual(args.slice(-3), ['--resume', 'abc', '--fork-session'])
  assert.ok(args.includes('--model=opus'))
  // Sem sessão ainda, a pergunta vai sozinha; a pergunta nunca vai na linha de comando.
  const alone = asideArgs({ bin: 'claude', env: {}, cwd: '/', sessionId: null, model: null })
  assert.equal(alone.includes('--resume'), false)
})

test('pergunta lateral: lê o resultado do json', () => {
  assert.deepEqual(parseAside('aviso\n{"type":"result","result":" oi ","is_error":false}\n'), {
    ok: true,
    text: 'oi'
  })
  assert.equal(parseAside('{"type":"result","result":"x","is_error":true}')?.ok, false)
  assert.equal(parseAside('nada'), null)
})

test('pergunta lateral: o Claude Code de mentira responde com o que a sessão lembra', async () => {
  const sessions = join(HOME, '.fake-claude', 'sessions')
  mkdirSync(sessions, { recursive: true })
  const id = '44444444-4444-4444-8444-444444444444'
  writeFileSync(
    join(sessions, `${id}.json`),
    JSON.stringify({ turns: [{ user: 'o projeto usa Vite', at: 'u1' }] })
  )
  const result = await askAside(
    {
      bin: join(FIXTURES, 'fake-claude'),
      env: { ...process.env, HOME },
      cwd: work,
      sessionId: id,
      model: null
    },
    'qual o bundler?'
  )
  assert.equal(result.ok, true, result.text)
  assert.match(result.text, /qual o bundler\?/)
  assert.match(result.text, /lembro de: o projeto usa Vite/)
  const empty = await askAside(
    {
      bin: join(FIXTURES, 'fake-claude'),
      env: process.env,
      cwd: work,
      sessionId: null,
      model: null
    },
    '   '
  )
  assert.equal(empty.ok, false)
})
