// Conversar pelo celular, na rede local (Fase 54): uma página servida pelo próprio Wisp, só para
// os endereços da rede de casa, com o que o painel do computador tem (a API fica no
// remote-api.ts; a página, no remote-page.ts e no remote-app.ts).
//
// As regras:
// - desligado por padrão (`phoneChat`); ligado, um servidor HTTP numa porta sorteada, que só
//   responde a endereços da rede local (10/8, 172.16/12, 192.168/16, 169.254/16, fc00::/7 e o
//   próprio computador) e só pelo endereço que o QR mostrou (o Host conferido: nada de um site de
//   fora chegar aqui pelo navegador, o "DNS rebinding");
// - o pareamento: o QR leva um código de uso único, que vale 10 minutos; a página troca o código
//   por uma chave só daquele celular, que vai em cada pedido. "Esquecer os celulares" apaga as
//   chaves (guardadas só como o hash, nos dados do Wisp);
// - o celular pareado faz o que o painel faz: conversa, troca o modelo e o modo, responde aos
//   cards e às perguntas, abre conversas. Por isso o pareamento é o que protege, e a
//   configuração diz para ligar só numa rede sua;
// - sem criptografia: é HTTP numa rede sua (o settings diz). Nada sai da rede local.

import { app, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { createServer } from 'http'
import type { IncomingMessage, Server, ServerResponse } from 'http'
import { networkInterfaces } from 'os'
import { join } from 'path'
import { getConfig, onConfigChange } from './config'
import { DATA_DIR } from './paths'
import { REMOTE_JS } from './remote-app'
import { REMOTE_CSS, REMOTE_HTML, REMOTE_ICON, remoteManifest, remoteTexts } from './remote-page'
import { RemoteApi } from './remote-api'
import type { RemoteContext } from './remote-api'
import { IPC } from '../shared/ipc'
import type { RemoteChatState } from '../shared/ipc'
import { t } from '../shared/i18n'

export const REMOTE_KEYS_FILE = join(DATA_DIR, 'celular-chaves.json')
/** A porta da página, a mesma de uma vez para a outra. */
export const REMOTE_PORT_FILE = join(DATA_DIR, 'celular-porta.txt')
/** Quanto o código do QR vale (ms). */
export const PAIRING_MS = 10 * 60_000
const MAX_BODY = 64 * 1024
/** Um anexo mandado pelo celular (uma foto da câmera passa fácil de 5 MB). */
const MAX_UPLOAD = 25 * 1024 * 1024
const MAX_DEVICES = 10

/** Um endereço da rede local (ou o próprio computador)? */
export function isLocalAddress(address: string | undefined): boolean {
  if (!address) return false
  const ip = address.replace(/^::ffff:/, '')
  if (ip === '127.0.0.1' || ip === '::1') return true
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    )
  }
  return /^f[cd][0-9a-f]{2}:/i.test(ip) || /^fe80:/i.test(ip)
}

/** O endereço deste computador na rede local (o primeiro IPv4 privado), ou null. */
export function lanAddress(
  interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces()
): string | null {
  for (const list of Object.values(interfaces)) {
    for (const item of list ?? []) {
      if (item.family === 'IPv4' && !item.internal && isLocalAddress(item.address))
        return item.address
    }
  }
  return null
}

const hash = (key: string): string => createHash('sha256').update(key).digest('hex')

const sameText = (a: string, b: string): boolean => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export interface RemoteChatOptions {
  /** O que a API do celular usa do resto do Wisp. */
  context: RemoteContext
  /** O estado mudou (o QR, os celulares): a tela de configurações acompanha. */
  changed(): void
  keysFile?: string
  /** Onde guardar a porta (os testes trocam). */
  portFile?: string
  /** O endereço da rede (os testes trocam). */
  address?: () => string | null
}

/** O servidor da página do celular. */
export class RemoteChat {
  private server: Server | null = null
  private port = 0
  private host: string | null = null
  private pairing: { code: string; until: number } | null = null
  private keys: string[]
  private readonly file: string
  private readonly api: RemoteApi

  constructor(private readonly options: RemoteChatOptions) {
    this.file = options.keysFile ?? REMOTE_KEYS_FILE
    this.keys = this.load()
    this.api = new RemoteApi(options.context)
  }

  get running(): boolean {
    return this.server !== null
  }

  /** Liga o servidor (numa porta sorteada) e sorteia um código de pareamento. */
  async start(): Promise<string | null> {
    if (this.server) return null
    const address = (this.options.address ?? lanAddress)()
    if (!address) return t('Não achei este computador numa rede local (Wi-Fi ou cabo).')
    const server = createServer((req, res) => void this.handle(req, res))
    const listen = (port: number): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '0.0.0.0', () => {
          server.off('error', reject)
          resolve()
        })
      })
    // A mesma porta de sempre: o endereço guardado no celular (e a chave dele, que o navegador
    // guarda por endereço) continua valendo depois de reiniciar. Ocupada, outra, guardada.
    const saved = this.savedPort()
    try {
      await listen(saved ?? 0)
    } catch (err) {
      if (saved === null) {
        throw new Error(
          t('Não consegui abrir a porta: {message}', { message: (err as Error).message }),
          { cause: err }
        )
      }
      await listen(0).catch((again: Error) => {
        throw new Error(t('Não consegui abrir a porta: {message}', { message: again.message }), {
          cause: again
        })
      })
    }
    const info = server.address()
    this.port = typeof info === 'object' && info ? info.port : 0
    if (this.port && this.port !== saved) this.savePort(this.port)
    this.host = address
    this.server = server
    this.newPairing()
    return null
  }

  stop(): void {
    this.server?.close()
    this.server?.closeAllConnections?.()
    this.server = null
    this.pairing = null
    this.options.changed()
  }

  /** O endereço com o código de pareamento (o que o QR mostra), ou null desligado. */
  pairingLink(now = Date.now()): string | null {
    if (!this.server || !this.host) return null
    if (!this.pairing || this.pairing.until < now) this.newPairing(now)
    return `${this.base()}/#p=${this.pairing?.code ?? ''}`
  }

  devices(): number {
    return this.keys.length
  }

  /** Esquece todos os celulares (as chaves deixam de valer na hora). */
  forget(): void {
    this.keys = []
    this.save()
    this.options.changed()
  }

  private base(): string {
    return `http://${this.host}:${this.port}`
  }

  private newPairing(now = Date.now()): void {
    this.pairing = { code: randomBytes(16).toString('base64url'), until: now + PAIRING_MS }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const send = (status: number, body: unknown, type = 'application/json'): void => {
      res.writeHead(status, {
        'Content-Type': `${type}; charset=utf-8`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        ...(type === 'text/html'
          ? {
              'Content-Security-Policy':
                "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
            }
          : {})
      })
      res.end(typeof body === 'string' ? body : JSON.stringify(body))
    }
    // Só da rede local, e só pelo endereço do QR (o Host de um site de fora não bate).
    if (
      !isLocalAddress(req.socket.remoteAddress) ||
      req.headers.host !== `${this.host}:${this.port}`
    ) {
      return send(403, { error: 'forbidden' })
    }
    const url = new URL(req.url ?? '/', this.base())
    if (req.method === 'GET' && url.pathname === '/') return send(200, REMOTE_HTML, 'text/html')
    if (req.method === 'GET' && url.pathname === '/app.js')
      return send(200, REMOTE_JS, 'text/javascript')
    if (req.method === 'GET' && url.pathname === '/app.css')
      return send(200, REMOTE_CSS, 'text/css')
    if (req.method === 'GET' && url.pathname === '/texts.json') return send(200, remoteTexts())
    // Para "Adicionar à tela inicial": o nome, as cores e o ícone.
    if (req.method === 'GET' && url.pathname === '/manifest.webmanifest') {
      return send(200, remoteManifest(), 'application/manifest+json')
    }
    if (req.method === 'GET' && url.pathname === '/icon.svg')
      return send(200, REMOTE_ICON, 'image/svg+xml')
    if (req.method === 'POST' && url.pathname === '/api/pair') {
      const body = await readJson(req)
      const code = typeof body?.code === 'string' ? body.code : ''
      const pairing = this.pairing
      if (!pairing || pairing.until < Date.now() || !sameText(code, pairing.code)) {
        return send(403, {
          error: t('O código venceu ou já foi usado: gere outro QR no computador.')
        })
      }
      // Uso único: o próximo celular precisa de outro QR.
      this.newPairing()
      const key = randomBytes(32).toString('base64url')
      this.keys = [...this.keys.slice(-(MAX_DEVICES - 1)), hash(key)]
      this.save()
      this.options.changed()
      return send(200, { key })
    }
    if (!url.pathname.startsWith('/api/')) return send(404, { error: 'not found' })
    if (!this.authorized(req)) return send(401, { error: t('Este celular não está pareado.') })
    if (req.method === 'GET') {
      const result = this.api.get(url.pathname, url.searchParams)
      return send(result.status, result.body)
    }
    if (req.method === 'POST' && url.pathname === '/api/upload') {
      const data = await readBody(req, MAX_UPLOAD)
      if (!data)
        return send(413, { error: t('O arquivo é grande demais para mandar pelo celular.') })
      const result = await this.api.upload(
        data,
        (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase(),
        url.searchParams.get('name') ?? ''
      )
      return send(result.status, result.body)
    }
    if (req.method === 'POST') {
      const result = this.api.post(url.pathname, await readJson(req))
      return send(result.status, result.body)
    }
    return send(404, { error: 'not found' })
  }

  private authorized(req: IncomingMessage): boolean {
    const header = req.headers.authorization ?? ''
    const key = /^Bearer ([A-Za-z0-9_-]{20,})$/.exec(header)?.[1]
    if (!key) return false
    const wanted = hash(key)
    return this.keys.some((stored) => sameText(stored, wanted))
  }

  private savedPort(): number | null {
    try {
      const port = Number(readFileSync(this.options.portFile ?? REMOTE_PORT_FILE, 'utf8').trim())
      return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : null
    } catch {
      return null
    }
  }

  private savePort(port: number): void {
    try {
      const file = this.options.portFile ?? REMOTE_PORT_FILE
      mkdirSync(join(file, '..'), { recursive: true, mode: 0o700 })
      writeFileSync(file, String(port), { mode: 0o600 })
    } catch {
      // Sem guardar: na próxima vez, outra porta (e o celular pareia de novo).
    }
  }

  private load(): string[] {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as unknown
      return Array.isArray(parsed)
        ? parsed.filter(
            (item): item is string => typeof item === 'string' && /^[0-9a-f]{64}$/.test(item)
          )
        : []
    } catch {
      return []
    }
  }

  private save(): void {
    try {
      mkdirSync(join(this.file, '..'), { recursive: true, mode: 0o700 })
      const temp = `${this.file}.tmp`
      writeFileSync(temp, JSON.stringify(this.keys), { mode: 0o600 })
      renameSync(temp, this.file)
    } catch (err) {
      console.warn('[wisp] não consegui gravar as chaves do celular:', err)
    }
  }
}

/** O corpo de um pedido, até `max` bytes; null se passar disso ou der erro. */
function readBody(req: IncomingMessage, max: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > max) {
        req.destroy()
        resolve(null)
      } else chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', () => resolve(null))
  })
}

/** O corpo JSON de um pedido (até 64 KB); null se não for um objeto. */
async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const data = await readBody(req, MAX_BODY)
  if (!data) return null
  try {
    const parsed = JSON.parse(data.toString('utf8')) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Liga a página do celular conforme o config (`phoneChat`) e responde à tela de configurações. */
export function setupRemoteChat(
  fromChat: (event: IpcMainInvokeEvent) => boolean,
  context: RemoteContext
): RemoteChat {
  let error: string | null = null
  // Nos testes de ponta a ponta, sem uma rede local de verdade, o endereço vem do ambiente.
  const testAddress = process.env.WISP_TEST_LAN_ADDRESS
  const remote = new RemoteChat({
    context,
    changed: () => undefined,
    ...(testAddress ? { address: () => testAddress } : {})
  })
  const sync = async (): Promise<void> => {
    const wanted = getConfig().phoneChat
    if (wanted && !remote.running) {
      try {
        error = await remote.start()
      } catch (err) {
        error = (err as Error).message
      }
    } else if (!wanted && remote.running) {
      remote.stop()
      error = null
    }
  }
  void sync()
  onConfigChange(() => void sync())
  const state = (): RemoteChatState => ({
    running: remote.running,
    link: remote.pairingLink(),
    devices: remote.devices(),
    error: getConfig().phoneChat ? error : null
  })
  ipcMain.handle(IPC.remoteChatState, async (event) => {
    if (!fromChat(event)) return null
    await sync()
    return state()
  })
  ipcMain.handle(IPC.remoteChatForget, (event) => {
    if (!fromChat(event)) return null
    remote.forget()
    return state()
  })
  app.on('before-quit', () => remote.stop())
  return remote
}
