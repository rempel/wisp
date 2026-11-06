// Conversar pelo celular na rede local (Fase 54): só endereços da rede local, só pelo endereço do
// QR (o Host conferido), o código do QR de uso único trocado por uma chave, a chave em cada pedido,
// as conversas e as mensagens, mandar (menos numa conversa no Automático) e esquecer os celulares.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { request } from 'node:http'
import { join } from 'node:path'
import { test } from 'node:test'
import { isLocalAddress, lanAddress, RemoteChat, remoteItems } from '../src/main/remote-chat'
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
    { type: 'user', text: 'oi', attachments: [] },
    { type: 'text', blockId: 'b1', delta: 'Olá' },
    { type: 'text', blockId: 'b1', delta: ', tudo bem?' },
    { type: 'tool-start', id: 't1', name: 'Bash' },
    { type: 'turn-end', outcome: 'done' }
  ]
  assert.deepEqual(remoteItems(events), [
    { kind: 'user', text: 'oi' },
    { kind: 'assistant', text: 'Olá, tudo bem?' },
    { kind: 'tool', text: 'Bash' }
  ])
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
  const conversation = (id: string, mode: string) => ({
    id,
    title: `Conversa ${id}`,
    busy: false,
    mode,
    view: 'chat',
    history: { events: (): ChatEvent[] => [{ type: 'user', text: `oi ${id}`, attachments: [] }] },
    showUser: () => undefined,
    send: (text: string) => {
      sent.push(`${id}:${text}`)
      return true
    }
  })
  const list = [conversation('a', 'default'), conversation('b', 'auto')]
  const tabs = {
    conversations: () => list,
    conversationById: (id: string) => list.find((c) => c.id === id)
  } as unknown as ChatTabs
  const remote = new RemoteChat({
    tabs,
    changed: () => undefined,
    keysFile: join(HOME, 'chaves.json'),
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
    assert.equal((await call(port, '/api/conversations')).status, 401)
    assert.equal((await call(port, '/api/pair', { body: { code: 'errado' } })).status, 403)
    const paired = await call(port, '/api/pair', { body: { code } })
    assert.equal(paired.status, 200)
    const key = String(paired.data.key)
    // O código vale uma vez.
    assert.equal((await call(port, '/api/pair', { body: { code } })).status, 403)
    assert.equal(remote.devices(), 1)

    const conversations = await call(port, '/api/conversations', { key })
    assert.deepEqual(
      (conversations.data.conversations as { id: string; readOnly: boolean }[]).map((c) => [
        c.id,
        c.readOnly
      ]),
      [
        ['a', false],
        ['b', true]
      ]
    )
    const messages = await call(port, '/api/messages?c=a', { key })
    assert.deepEqual(messages.data.items, [{ kind: 'user', text: 'oi a' }])
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

    // A chave fica guardada (só o hash) e vale depois de abrir de novo; esquecer a desliga.
    const again = new RemoteChat({
      tabs,
      changed: () => undefined,
      keysFile: join(HOME, 'chaves.json')
    })
    assert.equal(again.devices(), 1)
    remote.forget()
    assert.equal((await call(port, '/api/conversations', { key })).status, 401)
  } finally {
    remote.stop()
  }
})
