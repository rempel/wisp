// Conversar pelo celular na rede local (Fase 54): só endereços da rede local, só pelo endereço do
// QR (o Host conferido), o código do QR de uso único trocado por uma chave, a chave em cada pedido,
// as conversas e as mensagens (com os cards, as perguntas e o texto ainda sendo escrito), o que o
// painel faz (mandar com anexos, editar, o modelo, o modo, responder aos cards) e esquecer.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { request } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { isLocalAddress, lanAddress, RemoteChat } from '../src/main/remote-chat'
import { remoteView, viewVersion } from '../src/main/remote-view'
import type { RemoteContext } from '../src/main/remote-api'
import type { ChatTabs } from '../src/main/chat-tabs'
import type { ChatEvent } from '../src/shared/ipc'

test('rede local: quais endereços valem', () => {
  for (const ip of [
    '192.168.0.10',
    '10.1.2.3',
    '172.20.0.5',
    '127.0.0.1',
    '::1',
    '::ffff:192.168.1.2',
    'fd12::1'
  ]) {
    assert.equal(isLocalAddress(ip), true, ip)
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '100.64.0.1', '2001:db8::1', undefined]) {
    assert.equal(isLocalAddress(ip), false, String(ip))
  }
  assert.equal(
    lanAddress({
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as never],
      wlan0: [
        { address: 'fe80::1', family: 'IPv6', internal: false } as never,
        { address: '192.168.1.20', family: 'IPv4', internal: false } as never
      ]
    }),
    '192.168.1.20'
  )
  assert.equal(
    lanAddress({ eth0: [{ address: '8.8.4.4', family: 'IPv4', internal: false } as never] }),
    null
  )
})

test('rede local: a conversa como a página mostra', () => {
  const events: ChatEvent[] = [
    { type: 'user', text: 'oi', attachments: [{ name: 'print.png', size: 10 }] },
    { type: 'text', blockId: 'b1', delta: 'Olá' },
    { type: 'text', blockId: 'b1', delta: ', tudo bem?' },
    { type: 'tool-start', id: 't1', name: 'Bash' },
    { type: 'tool-input', id: 't1', name: 'Bash', input: { command: 'npm test' } },
    { type: 'tool-result', id: 't1', isError: false, output: 'ok' },
    { type: 'tool-start', id: 't2', name: 'mcp__desktop__open_app' },
    { type: 'permission-request', id: 'p1', toolName: 'Bash', input: { command: 'git push' } },
    { type: 'text', blockId: 'b2', delta: 'Feito.' }
  ]
  const view = remoteView(events)
  assert.deepEqual(
    view.items.map((item) => [
      item.id,
      item.kind,
      item.text,
      item.detail ?? null,
      item.status ?? null
    ]),
    [
      [0, 'user', 'oi', null, null],
      [1, 'assistant', 'Olá, tudo bem?', null, null],
      [3, 'tool', 'Rodar npm test', 'npm test', 'done'],
      [6, 'tool', 'open_app', null, 'running'],
      [7, 'permission', 'O Claude quer rodar um comando', 'Bash', 'waiting'],
      [8, 'assistant', 'Feito.', null, null]
    ]
  )
  assert.deepEqual(view.items[0].attachments, [{ name: 'print.png' }])
  assert.equal(view.items[2].output, 'ok')
  // O card tem o que é preciso para responder pelo celular.
  const card = view.items[4]
  assert.equal(card.request, 'p1')
  assert.equal(card.body, 'git push')
  assert.equal(card.always, 'Permitir este comando sempre nesta conversa')
  // O que roda agora; o pedido respondido e o fim da resposta.
  assert.equal(view.activity, 'open_app')
  const later = remoteView([
    ...events,
    { type: 'permission-resolved', id: 'p1', decision: 'deny' },
    { type: 'turn-end', outcome: 'stopped' }
  ])
  assert.equal(later.items.find((item) => item.kind === 'permission')?.status, 'denied')
  assert.equal(later.items.find((item) => item.kind === 'permission')?.result, 'Negado')
  assert.equal(later.items.find((item) => item.text === 'open_app')?.status, 'error')
  assert.equal(later.items.at(-1)?.kind, 'end')
  assert.equal(later.activity, null)
  // A marca muda com o que muda, e não muda à toa.
  assert.equal(viewVersion(view, true), viewVersion(remoteView(events), true))
  assert.notEqual(viewVersion(view, true), viewVersion(view, false))
  assert.notEqual(viewVersion(view, true), viewVersion(later, true))
})

test('rede local: o plano, as perguntas, o diff e o texto ainda sendo escrito', () => {
  const view = remoteView(
    [
      {
        type: 'permission-request',
        id: 'plan',
        toolName: 'ExitPlanMode',
        input: { plan: '1. Ler\n2. Mudar' }
      },
      {
        type: 'permission-request',
        id: 'q',
        toolName: 'AskUserQuestion',
        input: {
          questions: [
            {
              question: 'Qual cor?',
              header: 'Cor',
              multiSelect: false,
              options: [{ label: 'Azul', description: 'a de sempre' }, { label: 'Verde' }]
            }
          ]
        }
      },
      {
        type: 'permission-resolved',
        id: 'q',
        decision: 'answered',
        answers: { 'Qual cor?': 'Azul' }
      },
      { type: 'tool-start', id: 'e', name: 'Edit' },
      { type: 'tool-input', id: 'e', name: 'Edit', input: { file_path: '/p/app.ts' } },
      {
        type: 'tool-result',
        id: 'e',
        isError: false,
        output: 'ok',
        diff: {
          added: 1,
          removed: 1,
          truncated: false,
          hunks: [{ oldStart: 1, newStart: 1, lines: ['-a', '+b'] }]
        }
      }
    ],
    { blockId: 'b9', delta: 'escrevendo…' }
  )
  const [plan, question, edit, live] = view.items
  assert.equal(plan.variant, 'plan')
  assert.equal(plan.body, '1. Ler\n2. Mudar')
  assert.equal(plan.always, undefined)
  assert.equal(question.kind, 'question')
  assert.equal(question.status, 'allowed')
  assert.deepEqual(question.answers, { 'Qual cor?': 'Azul' })
  assert.deepEqual(question.questions?.[0].options, [
    { label: 'Azul', description: 'a de sempre' },
    { label: 'Verde' }
  ])
  assert.equal(edit.text, 'Editar app.ts')
  assert.deepEqual(edit.diff, ['-a', '+b'])
  assert.match(edit.detail ?? '', /\(\+1 −1\)/)
  assert.deepEqual([live.kind, live.text], ['assistant', 'escrevendo…'])
})

/** Um pedido HTTP ao servidor (com o Host que quisermos). */
function call(
  port: number,
  path: string,
  options: { method?: string; key?: string; body?: unknown; host?: string } = {}
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : undefined
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: options.method ?? (body ? 'POST' : 'GET'),
        headers: {
          Host: options.host ?? `127.0.0.1:${port}`,
          ...(options.key ? { Authorization: `Bearer ${options.key}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {})
        }
      },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => (text += chunk))
        res.on('end', () => {
          let data: Record<string, unknown>
          try {
            data = JSON.parse(text) as Record<string, unknown>
          } catch {
            data = { text }
          }
          resolve({ status: res.statusCode ?? 0, data })
        })
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

test('rede local: parear, ler, fazer o que o painel faz e esquecer', async () => {
  const log: string[] = []
  const conversation = (id: string, mode: string) => ({
    id,
    title: `Conversa ${id}`,
    busy: false,
    mode,
    provider: 'subscription',
    view: 'chat',
    canSend: true,
    folder: id === 'a' ? '/home/eu/loja' : null,
    session: {
      modelEvent: () => ({ type: 'model', choice: null, active: 'claude-opus-5-5' }),
      contextEvent: () => ({
        type: 'context',
        context: { used: 50, window: 200, compacting: false }
      })
    },
    pendingCount: () => (id === 'b' ? 1 : 0),
    owns: (request: string) => id === 'b' && request === 'p1',
    answer: (request: string, decision: string) =>
      log.push(`${id}:answer:${request}:${decision}`) > 0,
    stop: () => log.push(`${id}:stop`),
    setMode: (value: string) => log.push(`${id}:mode:${value}`),
    setModel: (value: string | null) => log.push(`${id}:model:${value}`),
    compact: (value: string) => log.push(`${id}:compact:${value}`),
    history: {
      events: (): ChatEvent[] => [{ type: 'user', text: `oi ${id}`, attachments: [] }],
      pendingText: () => null
    },
    showUser: () => undefined,
    send: (text: string, files: { path: string }[]) =>
      log.push(`${id}:send:${text}:${files.length}`) > 0,
    editLast: (text: string) => log.push(`${id}:edit:${text}`) > 0
  })
  const list = [conversation('a', 'default'), conversation('b', 'auto')]
  const tabs = {
    full: false,
    conversations: () => list,
    conversationById: (id: string) => list.find((c) => c.id === id),
    state: () => ({ panes: ['b'], focused: 0 }),
    emptyFocused: () => null
  } as unknown as ChatTabs
  const context: RemoteContext = {
    tabs,
    store: { list: () => [] },
    search: (_query, found) => found,
    projects: () => [{ name: 'loja', display: '~/loja', path: '/home/eu/loja' }],
    openFolder: (folder) => {
      const fresh = conversation(`n${list.length}`, 'default')
      log.push(`new:${folder}`)
      list.push(fresh)
      return fresh as never
    },
    openSaved: () => null,
    toPage: (id, event) => log.push(`page:${id}:${event.type}`),
    promptText: (name) => (name === 'revisar' ? 'Revise ~/loja' : null)
  }
  const remote = new RemoteChat({
    context,
    changed: () => undefined,
    keysFile: join(HOME, 'chaves.json'),
    portFile: join(HOME, 'porta.txt'),
    address: () => '127.0.0.1'
  })
  assert.equal(await remote.start(), null)
  try {
    const link = remote.pairingLink() ?? ''
    const port = Number(/:(\d+)\//.exec(link)?.[1])
    const code = /#p=(.+)$/.exec(link)?.[1] ?? ''
    // A página, com o CSP; um Host de fora não passa (o "DNS rebinding").
    const page = await call(port, '/')
    assert.equal(page.status, 200)
    assert.equal((await call(port, '/', { host: 'evil.example:80' })).status, 403)
    // Sem chave, nada; um código errado também não.
    assert.equal((await call(port, '/api/state')).status, 401)
    assert.equal((await call(port, '/api/pair', { body: { code: 'errado' } })).status, 403)
    const paired = await call(port, '/api/pair', { body: { code } })
    assert.equal(paired.status, 200)
    const key = String(paired.data.key)
    // O código vale uma vez.
    assert.equal((await call(port, '/api/pair', { body: { code } })).status, 403)
    assert.equal(remote.devices(), 1)

    // As conversas, com a do computador em foco, a pasta, o modo, o modelo e quem espera você.
    const state = await call(port, '/api/state', { key })
    assert.equal(state.data.focused, 'b')
    assert.deepEqual(
      (
        state.data.conversations as {
          id: string
          mode: string
          waiting: boolean
          folder: string | null
          activeModel: string
          context: number
        }[]
      ).map((c) => [c.id, c.mode, c.waiting, c.folder, c.activeModel, c.context]),
      [
        ['a', 'default', false, 'loja', 'claude-opus-5-5', 25],
        ['b', 'auto', true, null, 'claude-opus-5-5', 25]
      ]
    )
    assert.deepEqual(state.data.projects, [
      { name: 'loja', display: '~/loja', path: '/home/eu/loja' }
    ])
    const messages = await call(port, '/api/messages?c=a', { key })
    assert.deepEqual(messages.data.items, [{ id: 0, kind: 'user', text: 'oi a' }])
    // Com a mesma marca, nada a redesenhar.
    const same = await call(
      port,
      `/api/messages?c=a&v=${encodeURIComponent(String(messages.data.v))}`,
      { key }
    )
    assert.deepEqual(same.data, { v: messages.data.v, same: true })
    const post = async (path: string, body: unknown): Promise<number> =>
      (await call(port, path, { key, body })).status
    assert.equal(await post('/api/send', { c: 'a', text: 'pelo celular' }), 200)
    // Um anexo que não veio do celular não vai junto.
    assert.equal(await post('/api/send', { c: 'b', text: 'e este', files: [{ token: 'x' }] }), 200)
    // O /compact é do painel, não vai como mensagem.
    assert.equal(await post('/api/send', { c: 'a', text: '/compact só o plano' }), 200)
    assert.equal(await post('/api/edit', { c: 'a', text: 'corrigido' }), 200)
    // O modelo, o modo e o card (de qualquer conversa, pelo id do pedido).
    assert.equal(await post('/api/model', { c: 'a', model: 'gpt-5' }), 400)
    assert.equal(await post('/api/mode', { c: 'a', mode: 'bypassPermissions' }), 400)
    assert.equal(await post('/api/mode', { c: 'a', mode: 'plan' }), 200)
    assert.equal(await post('/api/permission', { id: 'p1', decision: 'yolo' }), 400)
    assert.equal(await post('/api/permission', { id: 'p1', decision: 'allow-always' }), 200)
    assert.equal(await post('/api/permission', { id: 'outro', decision: 'allow' }), 410)
    assert.equal(await post('/api/stop', { c: 'a' }), 200)
    // Uma conversa nova só numa pasta da lista de projetos.
    assert.equal(await post('/api/new', { folder: '/etc' }), 403)
    const fresh = await call(port, '/api/new', { key, body: { folder: '/home/eu/loja' } })
    assert.equal(fresh.data.c, 'n2')
    assert.deepEqual((await call(port, '/api/prompt', { key, body: { name: 'revisar' } })).data, {
      text: 'Revise ~/loja'
    })
    assert.deepEqual(log, [
      'a:send:pelo celular:0',
      'b:send:e este:0',
      'a:compact:só o plano',
      'a:edit:corrigido',
      'page:a:rewind',
      'a:mode:plan',
      'b:answer:p1:allow-always',
      'a:stop',
      'new:/home/eu/loja'
    ])

    // A chave fica guardada (só o hash) e vale depois de abrir de novo; esquecer a desliga.
    const again = new RemoteChat({
      context,
      changed: () => undefined,
      keysFile: join(HOME, 'chaves.json')
    })
    assert.equal(again.devices(), 1)
    remote.forget()
    assert.equal((await call(port, '/api/state', { key })).status, 401)
  } finally {
    remote.stop()
  }
  // Abrir de novo usa a mesma porta (o endereço do celular continua valendo).
  const reopened = new RemoteChat({
    context,
    changed: () => undefined,
    keysFile: join(HOME, 'chaves.json'),
    portFile: join(HOME, 'porta.txt'),
    address: () => '127.0.0.1'
  })
  const before = Number(readFileSync(join(HOME, 'porta.txt'), 'utf8'))
  await reopened.start()
  try {
    assert.match(reopened.pairingLink() ?? '', new RegExp(`:${before}/`))
  } finally {
    reopened.stop()
  }
})
