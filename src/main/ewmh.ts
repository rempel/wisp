// As janelas abertas no X11, pelo EWMH (as propriedades que os gerenciadores de janelas publicam
// na janela raiz), numa conexão própria com o servidor X: listar e trazer para a frente sem
// depender do xdotool ou do wmctrl.

import type { Socket } from 'net'
import { openDisplay } from './xpointer'

const TIMEOUT_MS = 2000
const INTERN_ATOM = 16
const GET_PROPERTY = 20
const SEND_EVENT = 25
const GET_INPUT_FOCUS = 43
const CLIENT_MESSAGE = 33
/** SubstructureNotify | SubstructureRedirect: como o EWMH pede para mensagens à janela raiz. */
const ROOT_EVENT_MASK = 0x180000
/** Uma janela em todas as áreas de trabalho. */
const ALL_DESKTOPS = 0xffffffff

/** Uma janela de app, como o gerenciador de janelas a anuncia. */
export interface XWindow {
  id: number
  /** A classe do WM_CLASS ("firefox", "konsole"). */
  app: string
  title: string
  pid?: number
  desktop?: number
  minimized: boolean
  active: boolean
}

const pad = (length: number): number => (4 - (length % 4)) % 4

interface Pending {
  resolve: (reply: Buffer | null) => void
}

/** Uma conexão com o servidor X para o EWMH. Pedidos com número de sequência, um de cada vez. */
export class XClient {
  private buffer = Buffer.alloc(0)
  private sequence = 0
  private readonly pending = new Map<number, Pending>()
  /** Sequências de pedidos sem resposta que deram erro (o SendEvent). */
  private readonly failed = new Set<number>()
  private readonly atoms = new Map<string, number>()
  private closed = false

  private constructor(
    private readonly socket: Socket,
    readonly root: number
  ) {
    socket.on('data', (chunk: Buffer) => this.onData(chunk))
    socket.on('error', () => this.close())
    socket.on('close', () => this.close())
  }

  static async open(env: NodeJS.ProcessEnv = process.env): Promise<XClient | null> {
    const opened = await openDisplay(env)
    return opened && new XClient(opened.socket, opened.root)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.socket.destroy()
    for (const waiting of this.pending.values()) waiting.resolve(null)
    this.pending.clear()
  }

  /** Manda um pedido; com `reply`, espera a resposta (null se der erro ou a conexão cair). */
  private request(data: Buffer, reply: boolean): Promise<Buffer | null> {
    if (this.closed) return Promise.resolve(null)
    this.sequence = (this.sequence + 1) & 0xffff
    const sequence = this.sequence
    this.socket.write(data)
    if (!reply) return Promise.resolve(null)
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.close(), TIMEOUT_MS)
      this.pending.set(sequence, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        }
      })
    })
  }

  async atom(name: string): Promise<number> {
    const known = this.atoms.get(name)
    if (known !== undefined) return known
    const bytes = Buffer.from(name, 'latin1')
    const data = Buffer.alloc(8 + bytes.length + pad(bytes.length))
    data.writeUInt8(INTERN_ATOM, 0)
    data.writeUInt8(0, 1)
    data.writeUInt16LE(data.length / 4, 2)
    data.writeUInt16LE(bytes.length, 4)
    bytes.copy(data, 8)
    const reply = await this.request(data, true)
    const atom = reply ? reply.readUInt32LE(8) : 0
    if (atom) this.atoms.set(name, atom)
    return atom
  }

  /** O valor cru de uma propriedade (até 1 MB), ou null se ela não existir. */
  async property(
    window: number,
    name: string
  ): Promise<{ type: number; format: number; data: Buffer } | null> {
    const property = await this.atom(name)
    if (!property) return null
    const data = Buffer.alloc(24)
    data.writeUInt8(GET_PROPERTY, 0)
    data.writeUInt8(0, 1)
    data.writeUInt16LE(6, 2)
    data.writeUInt32LE(window, 4)
    data.writeUInt32LE(property, 8)
    data.writeUInt32LE(0, 12)
    data.writeUInt32LE(0, 16)
    data.writeUInt32LE(256 * 1024, 20)
    const reply = await this.request(data, true)
    if (!reply) return null
    const format = reply.readUInt8(1)
    const type = reply.readUInt32LE(8)
    if (!type || !format) return null
    const length = reply.readUInt32LE(16) * (format / 8)
    return { type, format, data: reply.subarray(32, 32 + length) }
  }

  /** Uma propriedade de números de 32 bits (janelas, átomos, cardinais). */
  async numbers(window: number, name: string): Promise<number[]> {
    const value = await this.property(window, name)
    if (!value || value.format !== 32) return []
    const out: number[] = []
    for (let offset = 0; offset + 4 <= value.data.length; offset += 4) {
      out.push(value.data.readUInt32LE(offset))
    }
    return out
  }

  async text(window: number, name: string): Promise<string | null> {
    const value = await this.property(window, name)
    if (!value || value.format !== 8) return null
    const utf8 = await this.atom('UTF8_STRING')
    return value.data.toString(value.type === utf8 ? 'utf8' : 'latin1')
  }

  /** Uma mensagem EWMH para o gerenciador de janelas. Devolve false se o servidor recusar. */
  async message(window: number, type: string, values: number[]): Promise<boolean> {
    const atom = await this.atom(type)
    if (!atom) return false
    const data = Buffer.alloc(44)
    data.writeUInt8(SEND_EVENT, 0)
    data.writeUInt8(0, 1)
    data.writeUInt16LE(11, 2)
    data.writeUInt32LE(this.root, 4)
    data.writeUInt32LE(ROOT_EVENT_MASK, 8)
    // O evento ClientMessage, formato 32.
    data.writeUInt8(CLIENT_MESSAGE, 12)
    data.writeUInt8(32, 13)
    data.writeUInt32LE(window, 16)
    data.writeUInt32LE(atom, 20)
    values.slice(0, 5).forEach((value, index) => data.writeUInt32LE(value >>> 0, 24 + index * 4))
    await this.request(data, false)
    const sent = this.sequence
    // Um pedido com resposta depois: quando ela chega, um erro do SendEvent já teria chegado.
    const sync = Buffer.alloc(4)
    sync.writeUInt8(GET_INPUT_FOCUS, 0)
    sync.writeUInt16LE(1, 2)
    const synced = await this.request(sync, true)
    return synced !== null && !this.failed.delete(sent)
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 32) {
      const kind = this.buffer.readUInt8(0)
      const extra = kind === 1 || kind === 35 ? this.buffer.readUInt32LE(4) * 4 : 0
      if (this.buffer.length < 32 + extra) return
      const message = this.buffer.subarray(0, 32 + extra)
      this.buffer = this.buffer.subarray(32 + extra)
      // 1: resposta; 0: erro. Os dois trazem a sequência do pedido. O resto são eventos.
      if (kind !== 0 && kind !== 1) continue
      const sequence = message.readUInt16LE(2)
      const waiting = this.pending.get(sequence)
      if (waiting) {
        this.pending.delete(sequence)
        waiting.resolve(kind === 1 ? Buffer.from(message) : null)
      } else if (kind === 0) {
        this.failed.add(sequence)
      }
    }
  }
}

/** Tipos de janela que não são de app (painéis, a área de trabalho, menus, avisos). */
const NOT_APP_TYPES = [
  '_NET_WM_WINDOW_TYPE_DESKTOP',
  '_NET_WM_WINDOW_TYPE_DOCK',
  '_NET_WM_WINDOW_TYPE_TOOLBAR',
  '_NET_WM_WINDOW_TYPE_MENU',
  '_NET_WM_WINDOW_TYPE_SPLASH',
  '_NET_WM_WINDOW_TYPE_NOTIFICATION',
  '_NET_WM_WINDOW_TYPE_UTILITY'
]

/**
 * As janelas de apps, da que está mais à frente para a mais atrás. Ficam de fora as do próprio
 * Wisp (`ownPid`) e as que não aparecem na barra de tarefas. null se não há gerenciador EWMH.
 */
export async function listXWindows(client: XClient, ownPid: number): Promise<XWindow[] | null> {
  const root = client.root
  const stacking = await client.numbers(root, '_NET_CLIENT_LIST_STACKING')
  const ids = stacking.length ? stacking.reverse() : await client.numbers(root, '_NET_CLIENT_LIST')
  if (!ids.length) return null
  const [active] = await client.numbers(root, '_NET_ACTIVE_WINDOW')
  const notApp = new Set(await Promise.all(NOT_APP_TYPES.map((name) => client.atom(name))))
  const [hidden, skipTaskbar] = await Promise.all([
    client.atom('_NET_WM_STATE_HIDDEN'),
    client.atom('_NET_WM_STATE_SKIP_TASKBAR')
  ])
  const windows: XWindow[] = []
  for (const id of ids) {
    const [types, states, [pid], [desktop]] = await Promise.all([
      client.numbers(id, '_NET_WM_WINDOW_TYPE'),
      client.numbers(id, '_NET_WM_STATE'),
      client.numbers(id, '_NET_WM_PID'),
      client.numbers(id, '_NET_WM_DESKTOP')
    ])
    if (pid === ownPid || types.some((type) => notApp.has(type))) continue
    if (states.includes(skipTaskbar)) continue
    const [title, wmClass] = await Promise.all([
      client.text(id, '_NET_WM_NAME').then((name) => name || client.text(id, 'WM_NAME')),
      client.text(id, 'WM_CLASS')
    ])
    // WM_CLASS: "instância\0Classe\0".
    const [instance = '', klass = ''] = (wmClass ?? '').split('\0')
    windows.push({
      id,
      app: klass || instance,
      title: title ?? '',
      ...(pid ? { pid } : {}),
      ...(desktop !== undefined ? { desktop } : {}),
      minimized: states.includes(hidden),
      active: id === active
    })
  }
  return windows
}

/**
 * Traz uma janela para a frente como um pager faz (_NET_ACTIVE_WINDOW, origem 2): o gerenciador
 * troca de área de trabalho e tira a janela do minimizado, se preciso.
 */
export async function activateXWindow(client: XClient, window: XWindow): Promise<boolean> {
  const [current] = await client.numbers(client.root, '_NET_CURRENT_DESKTOP')
  if (
    window.desktop !== undefined &&
    window.desktop !== ALL_DESKTOPS &&
    current !== undefined &&
    window.desktop !== current
  ) {
    await client.message(client.root, '_NET_CURRENT_DESKTOP', [window.desktop, 0])
  }
  return client.message(window.id, '_NET_ACTIVE_WINDOW', [2, 0, 0])
}
