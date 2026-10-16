// Um ntfy de mentira, para os testes da aprovação pelo celular (Fase 18): publicar em JSON (o
// POST na raiz) ou em texto (o POST no tópico), e o stream em JSON de um tópico (GET
// /<tópico>/json, com ?since=). `tap` faz o que o app do ntfy faz ao tocar num botão "http":
// manda o corpo dele para o endereço dele.
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface NtfyAction {
  action: string
  label: string
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  clear?: boolean
}

export interface NtfyMessage {
  id: string
  time: number
  topic: string
  title?: string
  message: string
  priority?: number
  tags?: string[]
  actions?: NtfyAction[]
  /** O Authorization de quem publicou. */
  auth?: string
}

export interface FakeNtfy {
  url: string
  messages: NtfyMessage[]
  /** Os GET de stream (o tópico e o Authorization). */
  streams: { topic: string; auth?: string; open: boolean }[]
  /** A ficha que o servidor exige (null: aberto, como o ntfy.sh). */
  requireToken: string | null
  /** As mensagens de um tópico. */
  on(topic: string): NtfyMessage[]
  /** Toca no botão de uma mensagem (a mais recente com ele, se não disser qual). */
  tap(label: string, message?: NtfyMessage): Promise<number>
  close(): Promise<void>
}

const read = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => (body += chunk))
    req.on('end', () => resolve(body))
  })

export async function startFakeNtfy(): Promise<FakeNtfy> {
  const messages: NtfyMessage[] = []
  const streams: FakeNtfy['streams'] = []
  const listeners = new Map<string, Set<ServerResponse>>()
  let next = 0

  const deliver = (message: NtfyMessage): void => {
    messages.push(message)
    for (const res of listeners.get(message.topic) ?? []) {
      res.write(`${JSON.stringify({ event: 'message', ...message, auth: undefined })}\n`)
    }
  }

  const fake: FakeNtfy = {
    url: '',
    messages,
    streams,
    requireToken: null,
    on: (topic) => messages.filter((message) => message.topic === topic),
    async tap(label, message) {
      const target =
        message ??
        [...messages].reverse().find((item) => item.actions?.some((a) => a.label === label))
      const action = target?.actions?.find((a) => a.label === label)
      if (!action) throw new Error(`nenhuma mensagem com o botão ${label}`)
      const response = await fetch(action.url, {
        method: action.method ?? 'POST',
        headers: action.headers ?? {},
        body: action.body ?? ''
      })
      return response.status
    },
    close: () =>
      new Promise((resolve) => {
        for (const set of listeners.values()) for (const res of set) res.end()
        server.closeAllConnections()
        server.close(() => resolve())
      })
  }

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const auth = req.headers.authorization
      if (fake.requireToken && auth !== `Bearer ${fake.requireToken}`) {
        res.statusCode = 403
        return res.end('{"code":40301,"error":"forbidden"}')
      }
      const parts = url.pathname.split('/').filter(Boolean)
      if (req.method === 'POST' && parts.length === 0) {
        const body = JSON.parse(await read(req)) as Omit<NtfyMessage, 'id' | 'time'>
        const message: NtfyMessage = {
          ...body,
          id: `m${++next}`,
          time: Math.floor(Date.now() / 1000),
          auth
        }
        deliver(message)
        res.setHeader('content-type', 'application/json')
        return res.end(JSON.stringify({ id: message.id, event: 'message', topic: message.topic }))
      }
      if (req.method === 'POST' && parts.length === 1) {
        const message: NtfyMessage = {
          id: `m${++next}`,
          time: Math.floor(Date.now() / 1000),
          topic: parts[0],
          message: await read(req),
          auth
        }
        deliver(message)
        return res.end(JSON.stringify({ id: message.id }))
      }
      if (req.method === 'GET' && parts.length === 2 && parts[1] === 'json') {
        const topic = parts[0]
        const since = Number(url.searchParams.get('since') ?? 'NaN')
        const stream = { topic, auth, open: true }
        streams.push(stream)
        res.setHeader('content-type', 'application/x-ndjson')
        res.write(`${JSON.stringify({ event: 'open', topic })}\n`)
        if (Number.isFinite(since)) {
          for (const message of messages) {
            if (message.topic === topic && message.time >= since) {
              res.write(`${JSON.stringify({ event: 'message', ...message, auth: undefined })}\n`)
            }
          }
        }
        let set = listeners.get(topic)
        if (!set) listeners.set(topic, (set = new Set()))
        set.add(res)
        req.on('close', () => {
          stream.open = false
          set.delete(res)
        })
        return
      }
      res.statusCode = 404
      res.end('{}')
    })()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return fake
}
