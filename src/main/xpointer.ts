// Onde está o cursor, perguntado direto ao servidor X (QueryPointer).
//
// O screen.getCursorScreenPoint() do Electron 44 (Chromium 152) guarda a última posição que viu
// nos eventos das janelas do próprio app e só a atualiza quando o cursor passa por elas: com o
// cursor em outro lugar, ele devolve sempre o mesmo ponto. O Chromium mais novo já corrigiu isso
// (volta a perguntar ao servidor quando o cursor não está nas janelas dele). Até lá, o Wisp tem
// a sua própria conexão com o servidor X, só para essa pergunta.
//
// No Wayland, a conexão é com o XWayland, que também só sabe do cursor quando ele passa por
// janelas X11: ali a posição fica parada no último ponto conhecido, como a do Electron.

import { readFileSync } from 'fs'
import { connect } from 'net'
import type { Socket } from 'net'
import { homedir, hostname } from 'os'
import { join } from 'path'

/** Quanto esperar a resposta do servidor (ms) antes de desistir da conexão. */
const TIMEOUT_MS = 1000
const QUERY_POINTER = 38
/** Famílias de endereço do Xauthority: a máquina local e o curinga. */
const FAMILY_LOCAL = 256
const FAMILY_WILD = 65535
const COOKIE_NAME = 'MIT-MAGIC-COOKIE-1'

export interface XPoint {
  x: number
  y: number
}

/** Um display local (":0", ":1.0", "unix:0"); com host (encaminhamento por SSH), null. */
export function parseDisplay(display: string | undefined): { number: string } | null {
  const match = /^(?:unix)?:(\d+)(?:\.\d+)?$/.exec(display ?? '')
  return match ? { number: match[1] } : null
}

/**
 * O cookie MIT-MAGIC-COOKIE-1 do display, num arquivo Xauthority. Cada entrada tem a família, o
 * endereço (o nome da máquina, para conexões locais), o número do display, o nome do método e o
 * segredo, cada campo com o tamanho na frente (big-endian).
 */
export function readCookie(file: Buffer, displayNumber: string, host: string): Buffer | null {
  let offset = 0
  const read16 = (): number => {
    const value = file.readUInt16BE(offset)
    offset += 2
    return value
  }
  const readBytes = (): Buffer => {
    const length = read16()
    if (offset + length > file.length) throw new RangeError('entrada cortada')
    const bytes = file.subarray(offset, offset + length)
    offset += length
    return bytes
  }
  let fallback: Buffer | null = null
  try {
    while (offset < file.length) {
      const family = read16()
      const address = readBytes().toString('latin1')
      const number = readBytes().toString('latin1')
      const name = readBytes().toString('latin1')
      const data = readBytes()
      if (name !== COOKIE_NAME || (number !== '' && number !== displayNumber)) continue
      if (family === FAMILY_WILD || (family === FAMILY_LOCAL && address === host)) return data
      // O nome da máquina mudou depois do login: a entrada local ainda serve.
      if (family === FAMILY_LOCAL) fallback ??= data
    }
  } catch {
    // Arquivo cortado ou estragado: fica com o que achou até ali.
  }
  return fallback
}

const pad = (length: number): number => (4 - (length % 4)) % 4

/** O pedido de conexão (byte order "l": little-endian), com o cookie, se houver. */
export function setupRequest(cookie: Buffer | null): Buffer {
  const name = cookie ? Buffer.from(COOKIE_NAME, 'latin1') : Buffer.alloc(0)
  const data = cookie ?? Buffer.alloc(0)
  const request = Buffer.alloc(12 + name.length + pad(name.length) + data.length + pad(data.length))
  request.writeUInt8(0x6c, 0)
  request.writeUInt16LE(11, 2)
  request.writeUInt16LE(0, 4)
  request.writeUInt16LE(name.length, 6)
  request.writeUInt16LE(data.length, 8)
  name.copy(request, 12)
  data.copy(request, 12 + name.length + pad(name.length))
  return request
}

/** As teclas que o servidor usa (min-keycode e max-keycode), na resposta de conexão aceita. */
export function keycodesFromSetup(reply: Buffer): { min: number; max: number } {
  return { min: reply.readUInt8(34), max: reply.readUInt8(35) }
}

/** A janela raiz da primeira tela, na resposta de conexão aceita. */
export function rootFromSetup(reply: Buffer): number {
  const vendorLength = reply.readUInt16LE(24)
  const formats = reply.readUInt8(29)
  return reply.readUInt32LE(40 + vendorLength + pad(vendorLength) + 8 * formats)
}

/**
 * Uma conexão com o servidor X que só pergunta onde está o cursor. Qualquer erro fecha a
 * conexão; daí em diante `query` devolve null e quem chamou usa outro jeito.
 */
export class XPointer {
  private buffer = Buffer.alloc(0)
  private readonly waiting: ((point: XPoint | null) => void)[] = []
  private closed = false

  private constructor(
    private readonly socket: Socket,
    private readonly root: number
  ) {
    socket.on('data', (chunk: Buffer) => this.onData(chunk))
    socket.on('error', () => this.close())
    socket.on('close', () => this.close())
  }

  /** Abre a conexão com o display de DISPLAY; null se não for X11 local ou se não der. */
  static async open(env: NodeJS.ProcessEnv = process.env): Promise<XPointer | null> {
    const opened = await openDisplay(env)
    return opened && new XPointer(opened.socket, opened.root)
  }

  get alive(): boolean {
    return !this.closed
  }

  /** Onde está o cursor agora, em pixels da tela; null se a conexão caiu. */
  query(): Promise<XPoint | null> {
    if (this.closed) return Promise.resolve(null)
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.close(), TIMEOUT_MS)
      this.waiting.push((point) => {
        clearTimeout(timer)
        resolve(point)
      })
      const request = Buffer.alloc(8)
      request.writeUInt8(QUERY_POINTER, 0)
      request.writeUInt16LE(2, 2)
      request.writeUInt32LE(this.root, 4)
      this.socket.write(request)
    })
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.socket.destroy()
    for (const resolve of this.waiting.splice(0)) resolve(null)
  }

  /** Respostas e erros têm 32 bytes (mais o que o campo de tamanho disser, nas respostas). */
  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 32) {
      const kind = this.buffer.readUInt8(0)
      const extra = kind === 1 || kind === 35 ? this.buffer.readUInt32LE(4) * 4 : 0
      if (this.buffer.length < 32 + extra) return
      const message = this.buffer.subarray(0, 32 + extra)
      this.buffer = this.buffer.subarray(32 + extra)
      // 1: resposta; 0: erro (de um pedido nosso). Eventos (o resto) não interessam.
      if (kind === 1) {
        this.waiting.shift()?.({ x: message.readInt16LE(16), y: message.readInt16LE(18) })
      } else if (kind === 0) {
        this.waiting.shift()?.(null)
      }
    }
  }
}

/**
 * Conecta no display de DISPLAY (local, pelo socket Unix) e faz o aperto de mão, com o cookie do
 * Xauthority; devolve o socket e a janela raiz, ou null se não for X11 local ou se não der.
 */
export async function openDisplay(
  env: NodeJS.ProcessEnv = process.env
): Promise<{ socket: Socket; root: number; keycodes: { min: number; max: number } } | null> {
  const display = parseDisplay(env.DISPLAY)
  if (!display) return null
  let cookie: Buffer | null = null
  try {
    const file = readFileSync(env.XAUTHORITY || join(homedir(), '.Xauthority'))
    cookie = readCookie(file, display.number, hostname())
  } catch {
    // Sem Xauthority: o servidor pode aceitar a conexão local mesmo assim.
  }
  const path = `/tmp/.X11-unix/X${display.number}`
  // O caminho no disco; se não existir, o do namespace abstrato do Linux.
  const socket = (await connectTo(path)) ?? (await connectTo(`\0${path}`))
  if (!socket) return null
  const setup = await handshake(socket, cookie)
  if (setup === null) {
    socket.destroy()
    return null
  }
  return { socket, ...setup }
}

function connectTo(path: string): Promise<Socket | null> {
  return new Promise((resolve) => {
    const socket = connect(path)
    socket.once('connect', () => {
      socket.removeAllListeners('error')
      resolve(socket)
    })
    socket.once('error', () => resolve(null))
  })
}

/**
 * Manda o pedido de conexão e espera a resposta; devolve a janela raiz e as teclas, ou null se
 * recusado.
 */
function handshake(
  socket: Socket,
  cookie: Buffer | null
): Promise<{ root: number; keycodes: { min: number; max: number } } | null> {
  return new Promise((resolve) => {
    let buffer = Buffer.alloc(0)
    const done = (setup: { root: number; keycodes: { min: number; max: number } } | null): void => {
      clearTimeout(timer)
      socket.off('data', onData)
      socket.off('error', onFail)
      socket.off('close', onFail)
      resolve(setup)
    }
    const onFail = (): void => done(null)
    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk])
      if (buffer.length < 8) return
      const total = 8 + buffer.readUInt16LE(6) * 4
      if (buffer.length < total) return
      // 1: aceita. 0 (recusada) e 2 (pede outra autenticação): sem cursor por aqui.
      if (buffer.readUInt8(0) !== 1) return done(null)
      try {
        done({ root: rootFromSetup(buffer), keycodes: keycodesFromSetup(buffer) })
      } catch {
        done(null)
      }
    }
    const timer = setTimeout(onFail, TIMEOUT_MS)
    socket.on('data', onData)
    socket.on('error', onFail)
    socket.on('close', onFail)
    socket.write(setupRequest(cookie))
  })
}
