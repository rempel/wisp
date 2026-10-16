// Aprovar pelo celular (phone.ts): o canal, o resumo do pedido, o ntfy (com um servidor de
// mentira) e as regras: um pedido por vez, a ficha de uso único, a expiração, só negar o que
// mexe com segredos e nada que não seja Permitir ou Negar.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import {
  confirmPairing,
  newChannel,
  normalizeServer,
  parseChannel,
  PhoneApprovals,
  publishBody,
  subscribeLink,
  summarize,
  webLink
} from '../src/main/phone'
import type { PhoneChannel, PhoneDecision } from '../src/main/phone'
import { checkSettings } from '../src/main/config'
import { startFakeNtfy } from './fixtures/fake-ntfy'
import type { FakeNtfy } from './fixtures/fake-ntfy'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const until = async (fn: () => boolean, ms = 3000): Promise<void> => {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error('não aconteceu a tempo')
    await sleep(10)
  }
}

let ntfy: FakeNtfy
before(async () => {
  ntfy = await startFakeNtfy()
})
after(() => ntfy.close())

test('phone: the server address and the channel', () => {
  assert.equal(normalizeServer('https://ntfy.sh/'), 'https://ntfy.sh')
  assert.equal(normalizeServer(' http://10.0.0.2:8080/ntfy// '), 'http://10.0.0.2:8080/ntfy')
  assert.equal(normalizeServer('ftp://ntfy.sh'), null)
  assert.equal(normalizeServer('https://user:senha@ntfy.sh'), null)
  assert.equal(normalizeServer('https://ntfy.sh/?x=1'), null)
  assert.equal(normalizeServer('ntfy.sh'), null)

  const channel = newChannel('https://ntfy.sh', null)
  assert.match(channel.requests, /^wisp-[a-f0-9]{32}$/)
  assert.match(channel.replies, /^wisp-[a-f0-9]{32}$/)
  assert.notEqual(channel.requests, channel.replies)
  assert.deepEqual(parseChannel(JSON.stringify(channel)), channel)
  assert.equal(parseChannel('não é json'), null)
  assert.equal(parseChannel(null), null)
  assert.equal(parseChannel(JSON.stringify({ ...channel, replies: channel.requests })), null)
  assert.equal(parseChannel(JSON.stringify({ ...channel, requests: 'a/b' })), null)
  assert.equal(parseChannel(JSON.stringify({ ...channel, server: 'javascript:x' })), null)

  assert.equal(subscribeLink(channel), `ntfy://ntfy.sh/${channel.requests}`)
  assert.equal(webLink(channel), `https://ntfy.sh/${channel.requests}`)
  const own = newChannel('http://casa.lan:8080/ntfy', 'tk_abc')
  assert.equal(subscribeLink(own), `ntfy://casa.lan:8080/ntfy/${own.requests}?secure=false`)
})

test('phone: the summary has the request and nothing of the conversation', () => {
  assert.deepEqual(summarize('Bash', { command: 'npm   test\n-- --watch', description: 'x' }), {
    title: 'O Claude quer rodar um comando',
    text: 'npm test -- --watch',
    denyOnly: false,
    plan: false
  })
  const long = summarize('Bash', { command: 'echo ' + 'a'.repeat(400) })!
  assert.equal(long.text.length, 160)
  assert.ok(long.text.endsWith('…'))
  const secret = summarize('Bash', { command: 'cat ~/.ssh/id_ed25519' })!
  assert.equal(secret.denyOnly, true)
  assert.doesNotMatch(secret.text, /id_ed25519/)
  assert.equal(
    summarize('Edit', { file_path: '/home/eu/projetos/app/src/main.ts' })!.text,
    'main.ts'
  )
  assert.equal(
    summarize('Write', { file_path: '/tmp/x.md' })!.title,
    'O Claude quer escrever um arquivo'
  )
  assert.equal(
    summarize('WebFetch', { url: 'https://docs.example.com/a?token=1' })!.text,
    'docs.example.com'
  )
  assert.equal(
    summarize('mcp__playwright__browser_navigate', { url: 'https://example.com/x' })!.text,
    'navigate: example.com'
  )
  assert.equal(summarize('mcp__desktop__open_app', { name: 'gimp' })!.text, 'open_app')
  const plan = summarize('ExitPlanMode', { plan: 'segredo do plano' })!
  assert.equal(plan.plan, true)
  assert.doesNotMatch(plan.text, /segredo/)
  // Perguntas e a confiança numa pasta esperam o computador.
  assert.equal(summarize('AskUserQuestion', { questions: [] }), null)
  assert.equal(summarize('wisp_trust_folder', { path: '/x' }), null)
})

test('phone: the buttons publish a one-time ticket to the replies topic', () => {
  const channel: PhoneChannel = { ...newChannel('https://ntfy.sh', 'tk_x') }
  const body = publishBody(channel, {
    title: 't',
    message: 'm',
    buttons: [{ label: 'Permitir', ticket: 'abc' }]
  })
  assert.equal(body.topic, channel.requests)
  assert.deepEqual(body.actions, [
    {
      action: 'http',
      label: 'Permitir',
      url: `https://ntfy.sh/${channel.replies}`,
      method: 'POST',
      headers: { authorization: 'Bearer tk_x' },
      body: 'abc',
      clear: true
    }
  ])
})

test('phone: the settings field', () => {
  assert.equal(checkSettings({ phoneAfterSeconds: 30 }).ok, true)
  assert.equal(checkSettings({ phoneAfterSeconds: 0 }).ok, true)
  assert.equal(checkSettings({ phoneAfterSeconds: -1 }).ok, false)
  assert.equal(checkSettings({ phoneAfterSeconds: 1.5 }).ok, false)
})

test('phone: pairing waits for the phone to tap Confirmar', async () => {
  const channel = newChannel(ntfy.url, null)
  const abort = new AbortController()
  const waiting = confirmPairing(channel, 3000, abort.signal)
  await until(() => ntfy.on(channel.requests).length === 1)
  const test = ntfy.on(channel.requests)[0]
  assert.equal(test.actions?.[0].label, 'Confirmar')
  // Uma ficha errada não confirma.
  await fetch(`${ntfy.url}/${channel.replies}`, { method: 'POST', body: 'outra coisa' })
  assert.equal(await ntfy.tap('Confirmar', test), 200)
  assert.equal(await waiting, true)
  await until(() => ntfy.streams.filter((s) => s.topic === channel.replies && s.open).length === 0)

  const silent = newChannel(ntfy.url, null)
  assert.equal(await confirmPairing(silent, 200, new AbortController().signal), false)
})

test('phone: a server that refuses says why', async () => {
  ntfy.requireToken = 'tk_certa'
  try {
    const channel = newChannel(ntfy.url, 'tk_errada')
    await assert.rejects(
      confirmPairing(channel, 500, new AbortController().signal),
      /recusou o acesso/
    )
    const ok = newChannel(ntfy.url, 'tk_certa')
    const waiting = confirmPairing(ok, 3000, new AbortController().signal)
    await until(() => ntfy.on(ok.requests).length === 1)
    assert.equal(ntfy.on(ok.requests)[0].auth, 'Bearer tk_certa')
    await ntfy.tap('Confirmar', ntfy.on(ok.requests)[0])
    assert.equal(await waiting, true)
  } finally {
    ntfy.requireToken = null
  }
})

/** O PhoneApprovals com os cards de mentira: answer resolve e avisa o resolved, como o app. */
function approvals(options: { afterMs?: number; expiryMs?: number; enabled?: boolean } = {}) {
  const channel = newChannel(ntfy.url, null)
  const answers: { id: string; decision: PhoneDecision; how: string }[] = []
  const open = new Set<string>()
  let enabled = options.enabled ?? true
  const phone: PhoneApprovals = new PhoneApprovals({
    enabled: () => enabled,
    afterMs: () => options.afterMs ?? 0,
    channel: () => channel,
    expiryMs: options.expiryMs ?? 5000,
    answer: (id, decision, how) => {
      if (!open.delete(id)) return false
      answers.push({ id, decision, how })
      queueMicrotask(() => phone.resolved(id))
      return true
    }
  })
  const card = (id: string, toolName = 'Bash', input: unknown = { command: `rodar ${id}` }) => {
    open.add(id)
    phone.request(id, toolName, input)
  }
  const sent = () => ntfy.on(channel.requests).filter((m) => m.actions?.length)
  return {
    phone,
    channel,
    answers,
    card,
    sent,
    setEnabled: (value: boolean) => (enabled = value),
    answerHere: (id: string) => {
      open.delete(id)
      phone.resolved(id)
    }
  }
}

test('phone: nothing goes with the screen unlocked and no delay', async () => {
  const t = approvals({ afterMs: 0 })
  t.card('a')
  await sleep(100)
  assert.equal(t.sent().length, 0)
  assert.equal(t.phone.current(), null)
  t.phone.reset()
})

test('phone: off, nothing goes', async () => {
  const t = approvals({ enabled: false })
  t.phone.setLocked(true)
  t.card('a')
  await sleep(100)
  assert.equal(t.sent().length, 0)
})

test('phone: locked, one request at a time, and Permitir answers the exact card', async () => {
  const t = approvals()
  t.phone.setLocked(true)
  t.card('a')
  t.card('b')
  await until(() => t.sent().length === 1)
  const first = t.sent()[0]
  assert.match(first.title ?? '', /rodar um comando/)
  assert.match(first.message, /^rodar a\n/)
  assert.deepEqual(
    first.actions?.map((a) => a.label),
    ['Permitir', 'Negar']
  )
  assert.equal(first.priority, 4)
  // Só o primeiro foi; o segundo espera.
  await sleep(100)
  assert.equal(t.sent().length, 1)
  // Uma ficha inventada não vale.
  await fetch(`${ntfy.url}/${t.channel.replies}`, { method: 'POST', body: 'ficha-falsa' })
  await sleep(100)
  assert.equal(t.answers.length, 0)
  await ntfy.tap('Permitir', first)
  await until(() => t.answers.length === 1)
  assert.deepEqual(t.answers[0], { id: 'a', decision: 'allow', how: 'phone' })
  // Agora vai o segundo; a ficha do primeiro não vale para ele.
  await until(() => t.sent().length === 2)
  await ntfy.tap('Permitir', first)
  await sleep(150)
  assert.equal(t.answers.length, 1)
  await ntfy.tap('Negar', t.sent()[1])
  await until(() => t.answers.length === 2)
  assert.deepEqual(t.answers[1], { id: 'b', decision: 'deny', how: 'phone' })
  // Um aviso baixinho de como cada um acabou.
  await until(() => ntfy.on(t.channel.requests).filter((m) => m.priority === 2).length === 2)
  assert.deepEqual(
    ntfy
      .on(t.channel.requests)
      .filter((m) => m.priority === 2)
      .map((m) => m.message),
    ['Permitido.', 'Negado.']
  )
  // Sem pedido no celular, a escuta fecha.
  await until(
    () => ntfy.streams.filter((s) => s.topic === t.channel.replies && s.open).length === 0
  )
  t.phone.reset()
})

test('phone: the waiting card goes after the delay, and answered here it leaves', async () => {
  const t = approvals({ afterMs: 150 })
  t.card('a')
  await sleep(50)
  assert.equal(t.sent().length, 0)
  await until(() => t.sent().length === 1)
  t.answerHere('a')
  await until(() =>
    ntfy.on(t.channel.requests).some((m) => m.message === 'Respondido no computador.')
  )
  assert.equal(t.phone.current(), null)
  // Respondido antes do tempo, nem vai.
  t.card('b')
  t.answerHere('b')
  await sleep(250)
  assert.equal(t.sent().length, 1)
  t.phone.reset()
})

test('phone: no answer, the card is denied when it expires', async () => {
  const t = approvals({ expiryMs: 200 })
  t.phone.setLocked(true)
  t.card('a')
  await until(() => t.sent().length === 1)
  await until(() => t.answers.length === 1, 2000)
  assert.deepEqual(t.answers[0], { id: 'a', decision: 'deny', how: 'expired' })
  await until(() => ntfy.on(t.channel.requests).some((m) => m.message === 'Expirou: ficou negado.'))
  // Depois de expirar, tocar não muda nada.
  await ntfy.tap('Permitir', t.sent()[0])
  await sleep(100)
  assert.equal(t.answers.length, 1)
})

test('phone: a command touching secrets can only be denied; the plan has its buttons', async () => {
  const t = approvals()
  t.phone.setLocked(true)
  t.card('s', 'Bash', { command: 'cat .env' })
  await until(() => t.sent().length === 1)
  assert.deepEqual(
    t.sent()[0].actions?.map((a) => a.label),
    ['Negar']
  )
  assert.doesNotMatch(t.sent()[0].message, /\.env/)
  await ntfy.tap('Negar', t.sent()[0])
  await until(() => t.answers.length === 1)
  t.card('p', 'ExitPlanMode', { plan: 'o plano' })
  await until(() => t.sent().length === 2)
  assert.deepEqual(
    t.sent()[1].actions?.map((a) => a.label),
    ['Aprovar', 'Continuar planejando']
  )
  await ntfy.tap('Aprovar', t.sent()[1])
  await until(() => t.answers.length === 2)
  assert.deepEqual(t.answers[1], { id: 'p', decision: 'allow', how: 'phone' })
  // Pergunta não vai.
  t.card('q', 'AskUserQuestion', { questions: [] })
  await sleep(100)
  assert.equal(t.sent().length, 2)
  t.phone.reset()
})

test('phone: turned off, what was on the phone stops counting', async () => {
  const t = approvals()
  t.phone.setLocked(true)
  t.card('a')
  await until(() => t.sent().length === 1)
  t.setEnabled(false)
  t.phone.reset()
  await ntfy.tap('Permitir', t.sent()[0])
  await sleep(150)
  assert.equal(t.answers.length, 0)
  await until(
    () => ntfy.streams.filter((s) => s.topic === t.channel.replies && s.open).length === 0
  )
})

test('phone: a server that does not answer leaves the card on the computer', async () => {
  const channel = newChannel('http://127.0.0.1:9', null)
  const phone = new PhoneApprovals({
    enabled: () => true,
    afterMs: () => 0,
    channel: () => channel,
    answer: () => true,
    log: () => {}
  })
  phone.setLocked(true)
  phone.request('a', 'Bash', { command: 'ls' })
  await until(() => phone.current() === null, 5000)
  phone.reset()
})
