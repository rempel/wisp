// Conversar pelo celular na rede local (Fase 54): só endereços da rede local, só pelo endereço do
// QR (o Host conferido), o código do QR de uso único trocado por uma chave, a chave em cada pedido,
// as conversas e as mensagens, mandar (menos numa conversa no Automático) e esquecer os celulares.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { request } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { isLocalAddress, lanAddress, RemoteChat } from '../src/main/remote-chat'
import { remoteView, viewVersion } from '../src/main/remote-view'
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
      [3, 'tool', 'Bash', 'npm test', 'done'],
      [6, 'tool', 'open_app', null, 'running'],
      [7, 'permission', 'Bash', 'git push', 'waiting'],
      [8, 'assistant', 'Feito.', null, null]
    ]
  )
  assert.deepEqual(view.items[0].attachments, ['print.png'])
  assert.equal(view.items[2].output, 'ok')
  // O que roda agora; o pedido respondido e o fim da resposta.
  assert.equal(view.activity, 'open_app')
  const later = remoteView([
    ...events,
    { type: 'permission-resolved', id: 'p1', decision: 'deny' },
    { type: 'turn-end', outcome: 'stopped' }
  ])
  assert.equal(later.items.find((item) => item.kind === 'permission')?.status, 'denied')
  assert.equal(later.items.find((item) => item.text === 'open_app')?.status, 'error')
  assert.equal(later.items.at(-1)?.kind, 'end')
  assert.equal(later.activity, null)
  // A marca muda com o que muda, e não muda à toa.
  assert.equal(viewVersion(view, true), viewVersion(remoteView(events), true))
  assert.notEqual(viewVersion(view, true), viewVersion(view, false))
  assert.notEqual(viewVersion(view, true), viewVersion(later, true))
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

test('rede local: parear, ler, mandar e esquecer', async () => {
  const sent: string[] = []
  const stopped: string[] = []
  const conversation = (id: string, mode: string) => ({
    id,
    title: `Conversa ${id}`,
    busy: false,
    mode,
    view: 'chat',
    folder: id === 'a' ? '/home/eu/loja' : null,
    pendingCount: () => (id === 'b' ? 1 : 0),
    stop: () => stopped.push(id),
    history: { events: (): ChatEvent[] => [{ type: 'user', text: `oi ${id}`, attachments: [] }] },
    showUser: () => undefined,
    send: (text: string) => {
      sent.push(`${id}:${text}`)
      return true
    }
  })
  const list = [conversation('a', 'default'), conversation('b', 'auto')]
  const tabs = {
    full: false,
    conversations: () => list,
    conversationById: (id: string) => list.find((c) => c.id === id),
    state: () => ({ panes: ['b'], focused: 0 }),
    addChat: () => {
      const fresh = conversation(`n${list.length}`, 'default')
      list.push(fresh)
      return fresh
    }
  } as unknown as ChatTabs
  const remote = new RemoteChat({
    tabs,
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

    // As conversas, com a do computador em foco, a pasta, o modo e quem espera você.
    const state = await call(port, '/api/state', { key })
    assert.equal(state.data.focused, 'b')
    assert.deepEqual(
      (
        state.data.conversations as {
          id: string
          readOnly: boolean
          waiting: boolean
          folder: string | null
        }[]
      ).map((c) => [c.id, c.readOnly, c.waiting, c.folder]),
      [
        ['a', false, false, 'loja'],
        ['b', true, true, null]
      ]
    )
    const messages = await call(port, '/api/messages?c=a', { key })
    assert.deepEqual(messages.data.items, [{ id: 0, kind: 'user', text: 'oi a' }])
    // Com a mesma marca, nada a redesenhar.
    const same = await call(
      port,
      `/api/messages?c=a&v=${encodeURIComponent(String(messages.data.v))}`,
      { key }
    )
    assert.deepEqual(same.data, { v: messages.data.v, same: true })
    assert.equal(
      (await call(port, '/api/send', { key, body: { c: 'a', text: 'pelo celular' } })).status,
      200
    )
    // No Automático, só ler.
    assert.equal(
      (await call(port, '/api/send', { key, body: { c: 'b', text: 'rm -rf' } })).status,
      403
    )
    assert.deepEqual(sent, ['a:pelo celular'])
    // Parar e uma conversa nova.
    assert.equal((await call(port, '/api/stop', { key, body: { c: 'a' } })).status, 200)
    assert.deepEqual(stopped, ['a'])
    const fresh = await call(port, '/api/new', { key, body: {} })
    assert.equal(fresh.data.c, 'n2')

    // A chave fica guardada (só o hash) e vale depois de abrir de novo; esquecer a desliga.
    const again = new RemoteChat({
      tabs,
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
    tabs,
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
