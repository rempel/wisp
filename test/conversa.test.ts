// A conversa mais fluida (Fase 21): editar a última mensagem (as edições no histórico, o ponto
// para onde voltar e o Claude Code de mentira voltando de verdade, numa cópia da sessão), as
// conversas fixadas e a exportação em Markdown.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { ClaudeSession } from '../src/main/claude'
import { exportFileName, exportMarkdown, toolSummary } from '../src/main/export'
import { applyRewinds, History, readPins, rewindPoint, setPinned } from '../src/main/history'
import type { ChatEvent } from '../src/shared/ipc'
import { FIXTURES } from './helpers/paths'

const CLI = join(FIXTURES, 'fake-claude')
const WORK = join(HOME, 'workspace')
mkdirSync(WORK, { recursive: true })

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

test('edições: o rewind tira a última mensagem e o que veio depois', () => {
  const events = [user('a'), text('1', 'A'), end('u1'), user('b'), text('2', 'B'), end('u2')]
  assert.deepEqual(applyRewinds([...events, { type: 'rewind' }]), events.slice(0, 3))
  // Uma mensagem mandada no meio de um turno não começa um: sai junto com ele.
  const middle = [user('a'), end('u1'), user('b'), user('no meio', true), text('2', 'B'), end('u2')]
  assert.deepEqual(applyRewinds([...middle, { type: 'rewind' }]), middle.slice(0, 2))
  // Duas edições seguidas.
  const twice = [
    ...events,
    { type: 'rewind' } as ChatEvent,
    user('b2'),
    end('u3'),
    { type: 'rewind' } as ChatEvent
  ]
  assert.deepEqual(applyRewinds(twice), events.slice(0, 3))
})

test('edições: para onde voltar no Claude Code', () => {
  // A primeira mensagem: recomeça numa sessão nova.
  assert.deepEqual(rewindPoint([user('a'), text('1', 'A'), end('u1')]), {
    at: null,
    text: 'a',
    attachments: []
  })
  // Depois: até a última resposta do turno anterior.
  assert.equal(rewindPoint([user('a'), end('u1'), user('b'), end('u2')])?.at, 'u1')
  // Depois de uma edição, o ponto continua o mesmo (os uuids passam para a cópia).
  assert.equal(
    rewindPoint([
      user('a'),
      end('u1'),
      user('b'),
      end('u2'),
      { type: 'rewind' },
      user('b2'),
      end('u3')
    ])?.at,
    'u1'
  )
  // Sem o ponto (uma conversa de antes desta versão), não dá.
  assert.equal(rewindPoint([user('a'), end(), user('b'), end('u2')]), undefined)
  assert.equal(rewindPoint([]), undefined)
})

test('edições: o histórico grava a edição e a mensagem do meio do turno', () => {
  const history = new History(join(HOME, 'conversas-edicao'))
  history.user('33333333-3333-4333-8333-333333333333', 'primeira', [])
  history.record(end('u1'))
  history.user('33333333-3333-4333-8333-333333333333', 'segunda', [])
  history.user('33333333-3333-4333-8333-333333333333', 'no meio', [], false, true)
  history.record(end('u2'))
  assert.equal(rewindPoint(history.events())?.at, 'u1')
  history.record({ type: 'rewind' })
  history.user('44444444-4444-4444-8444-444444444444', 'segunda de novo', [])
  history.record(end('u3'))
  const saved = history.load(history.currentId()!)!
  assert.ok(saved.events.some((event) => event.type === 'rewind'))
  assert.deepEqual(
    history.events().flatMap((event) => (event.type === 'user' ? [event.text] : [])),
    ['primeira', 'segunda de novo']
  )
})

test('fixadas: no topo do histórico, e saem quando a conversa é apagada', () => {
  const dir = join(HOME, 'conversas-fixadas')
  const history = new History(dir)
  history.user('11111111-1111-4111-8111-111111111111', 'velha', [])
  const old = history.currentId()!
  history.record({ type: 'reset' })
  history.user('22222222-2222-4222-8222-222222222222', 'nova', [])
  const recent = history.currentId()!
  history.flush()
  assert.equal(history.list()[0].id, recent)
  assert.equal(setPinned(old, true), true)
  assert.deepEqual(readPins(), new Set([old]))
  const list = history.list()
  assert.equal(list[0].id, old)
  assert.equal(list[0].pinned, true)
  assert.equal(list[1].pinned, undefined)
  assert.equal(setPinned('nao-e-id', true), false)
  history.remove(old)
  assert.deepEqual(readPins(), new Set())
})

test('exportar: as mensagens, as respostas, as ferramentas resumidas e os pedidos', () => {
  const markdown = exportMarkdown(
    {
      id: 'x',
      title: 'Arruma o contador',
      sessionId: 's',
      createdAt: Date.UTC(2026, 9, 23, 13, 0),
      events: [
        user('arruma o contador'),
        text('1', 'Vou ler '),
        text('1', 'o código.'),
        { type: 'tool-input', id: 't1', name: 'Read', input: { file_path: '/p/app.ts' } },
        { type: 'tool-result', id: 't1', isError: false, output: 'conteúdo' },
        { type: 'permission-request', id: 'p1', toolName: 'Bash', input: { command: 'npm test' } },
        { type: 'permission-resolved', id: 'p1', decision: 'allow' },
        { type: 'tool-input', id: 't2', name: 'Bash', input: { command: 'npm test' } },
        { type: 'tool-result', id: 't2', isError: true, output: 'falhou' },
        text('2', 'Pronto.'),
        end('u1'),
        user('outra coisa'),
        end('u2'),
        { type: 'rewind' }
      ]
    },
    new Date(Date.UTC(2026, 9, 24, 9, 0))
  )
  assert.match(markdown, /^# Arruma o contador\n/)
  assert.match(markdown, /## Você\n\narruma o contador/)
  assert.match(markdown, /## Claude\n\nVou ler o código\./)
  assert.match(markdown, /> 🔧 \*\*Read\*\* `\/p\/app\.ts`/)
  assert.match(markdown, /> Pedido: \*\*Bash\*\* `npm test` — permitido/)
  assert.match(markdown, /> 🔧 \*\*Bash\*\* `npm test` — erro/)
  assert.match(markdown, /Pronto\./)
  // A mensagem editada não entra.
  assert.doesNotMatch(markdown, /outra coisa/)
  assert.equal(
    toolSummary('Agent', { description: 'procura onde X é usado' }),
    '**Agent** · procura onde X é usado'
  )
  assert.equal(toolSummary('X', {}), '**X**')
  assert.equal(exportFileName('a/b: c?'), 'a b c.md')
  assert.equal(exportFileName(''), 'Conversa.md')
})

// Com o Claude Code de mentira: a edição volta a sessão de verdade, numa cópia.
const opened: ClaudeSession[] = []
after(() => {
  for (const claude of opened) claude.dispose()
})

function session(): { claude: ClaudeSession; events: ChatEvent[] } {
  const events: ChatEvent[] = []
  const claude = new ClaudeSession(
    {
      claudePath: CLI,
      workspace: () => WORK,
      allowedTools: ['Read'],
      appendSystemPrompt: 'persona',
      permissionMode: 'default',
      model: null
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

async function turn(claude: ClaudeSession, events: ChatEvent[], message: string) {
  const from = events.length
  await claude.send(message)
  await waitFor(() => events.slice(from).some((event) => event.type === 'turn-end'))
  await waitFor(() => events.slice(from).some((event) => event.type === 'busy' && !event.busy))
  const got = events.slice(from)
  return {
    text: got.map((event) => (event.type === 'text' ? event.delta : '')).join(''),
    end: got.find(
      (event): event is Extract<ChatEvent, { type: 'turn-end' }> => event.type === 'turn-end'
    )!,
    notices: got.flatMap((event) => (event.type === 'notice' ? [event.text] : []))
  }
}

const spawns = (): string[][] =>
  readFileSync(join(HOME, '.fake-claude/spawns.log'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => (JSON.parse(line) as { args: string[] }).args)

test('editar a última mensagem: o Claude Code volta para antes dela, numa cópia', async () => {
  const { claude, events } = session()
  const first = await turn(claude, events, 'primeira')
  assert.match(first.end.at ?? '', /^[0-9a-f-]{36}$/)
  await turn(claude, events, 'segunda')
  assert.equal(claude.rewind(first.end.at!), true)
  const edited = await turn(claude, events, 'segunda editada [memória]')
  // O "Claude" lembra só da primeira e da editada: a segunda saiu do contexto.
  assert.match(edited.text, /Lembro de: primeira \| segunda editada \[memória\]/)
  const args = spawns().at(-1)!
  assert.equal(args[args.indexOf('--resume-session-at') + 1], first.end.at)
  assert.ok(args.includes('--fork-session'))
  // A sessão mudou (a cópia), e a próxima mensagem continua nela, no mesmo processo.
  const count = spawns().length
  const third = await turn(claude, events, 'terceira [memória]')
  assert.equal(spawns().length, count, 'o mesmo processo continua')
  assert.match(third.text, /Lembro de: primeira \| segunda editada \[memória\] \| terceira/)
  // Uma segunda edição seguida volta ao mesmo ponto (o uuid passou para a cópia).
  assert.equal(claude.rewind(first.end.at!), true)
  const again = await turn(claude, events, 'segunda, de novo [memória]')
  assert.match(again.text, /Lembro de: primeira \| segunda, de novo \[memória\]$/)
})

test('editar a primeira mensagem: uma sessão nova', async () => {
  const { claude, events } = session()
  await turn(claude, events, 'primeira')
  assert.equal(claude.rewind(null), true)
  const edited = await turn(claude, events, 'outra primeira [memória]')
  assert.match(edited.text, /Lembro de: outra primeira \[memória\]$/)
  const args = spawns().at(-1)!
  assert.ok(args.includes('--session-id'))
  assert.ok(!args.includes('--resume-session-at'))
})

test('editar: com o Claude trabalhando não dá, e um ponto que sumiu avisa', async () => {
  const { claude, events } = session()
  await turn(claude, events, 'primeira')
  void claude.send('demora [lento]')
  await waitFor(() => claude.isBusy())
  assert.equal(claude.rewind('x'), false)
  claude.stop()
  await waitFor(() => !claude.isBusy())
  assert.equal(claude.rewind('00000000-0000-4000-8000-000000000000'), true)
  const lost = await turn(claude, events, 'editada')
  assert.equal(lost.end.outcome, 'error')
  assert.match(lost.notices.join('\n'), /Não consegui voltar a conversa/)
})
