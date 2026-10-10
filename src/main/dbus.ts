// Um cliente D-Bus pequeno, em Node puro: chamadas, sinais e objetos exportados. É o que o Wisp
// usa para falar com os portais do desktop (atalho global, print da tela), com os players de
// música (MPRIS) e com o KWin. Sem dependências: só o protocolo, como a especificação descreve.

import { EventEmitter } from 'events'
import { connect } from 'net'
import type { Socket } from 'net'

/** Um valor com o tipo junto (o "v" do D-Bus). */
export class Variant {
  constructor(
    readonly signature: string,
    readonly value: unknown
  ) {}
}

/** Erro devolvido por quem recebeu a chamada (org.freedesktop.DBus.Error.ServiceUnknown…). */
export class DBusError extends Error {
  constructor(
    readonly type: string,
    message: string
  ) {
    super(message || type)
    this.name = 'DBusError'
  }
}

/** Uma mensagem já lida: os campos do cabeçalho que interessam e o corpo. */
export interface DBusMessage {
  type: number
  flags: number
  serial: number
  path?: string
  interface?: string
  member?: string
  errorName?: string
  replySerial?: number
  destination?: string
  sender?: string
  signature: string
  body: unknown[]
}

const enum Type {
  Call = 1,
  Return = 2,
  Error = 3,
  Signal = 4
}

const NO_REPLY_EXPECTED = 0x1
const MAX_MESSAGE = 128 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 25_000

// ---------------------------------------------------------------------------
// Assinaturas

/** Onde termina o tipo completo que começa em `start` (índice depois dele). */
function typeEnd(signature: string, start: number): number {
  const c = signature[start]
  if (c === undefined) throw new Error(`assinatura incompleta: "${signature}"`)
  if (c === 'a') return typeEnd(signature, start + 1)
  if (c === '(' || c === '{') {
    const close = c === '(' ? ')' : '}'
    let i = start + 1
    while (signature[i] !== close) {
      if (i >= signature.length) throw new Error(`assinatura sem fechar: "${signature}"`)
      i = typeEnd(signature, i)
    }
    return i + 1
  }
  if ('ybnqiuxtdsogvh'.includes(c)) return start + 1
  throw new Error(`tipo desconhecido "${c}" em "${signature}"`)
}

/** Separa uma assinatura nos tipos completos: "sa{sv}u" → ["s", "a{sv}", "u"]. */
export function splitSignature(signature: string): string[] {
  const types: string[] = []
  for (let i = 0; i < signature.length;) {
    const end = typeEnd(signature, i)
    types.push(signature.slice(i, end))
    i = end
  }
  return types
}

function alignment(type: string): number {
  switch (type[0]) {
    case 'y':
    case 'g':
    case 'v':
      return 1
    case 'n':
    case 'q':
      return 2
    case 'x':
    case 't':
    case 'd':
    case '(':
    case '{':
      return 8
    default:
      return 4
  }
}

// ---------------------------------------------------------------------------
// Escrita (sempre little-endian)

class Writer {
  private buffer = Buffer.alloc(256)
  length = 0

  constructor(private readonly base = 0) {}

  private reserve(bytes: number): void {
    if (this.length + bytes <= this.buffer.length) return
    let size = this.buffer.length * 2
    while (size < this.length + bytes) size *= 2
    const next = Buffer.alloc(size)
    this.buffer.copy(next, 0, 0, this.length)
    this.buffer = next
  }

  align(to: number): void {
    const pad = (to - ((this.base + this.length) % to)) % to
    this.reserve(pad)
    this.buffer.fill(0, this.length, this.length + pad)
    this.length += pad
  }

  bytes(data: Buffer): void {
    this.reserve(data.length)
    data.copy(this.buffer, this.length)
    this.length += data.length
  }

  u8(value: number): void {
    this.reserve(1)
    this.buffer.writeUInt8(value, this.length)
    this.length += 1
  }

  u32At(position: number, value: number): void {
    this.buffer.writeUInt32LE(value, position)
  }

  result(): Buffer {
    return this.buffer.subarray(0, this.length)
  }

  write(type: string, value: unknown): void {
    const at = (): number => this.length
    switch (type[0]) {
      case 'y':
        this.u8(Number(value) & 0xff)
        return
      case 'b':
        this.align(4)
        this.reserve(4)
        this.buffer.writeUInt32LE(value ? 1 : 0, at())
        this.length += 4
        return
      case 'n':
        this.align(2)
        this.reserve(2)
        this.buffer.writeInt16LE(Number(value), at())
        this.length += 2
        return
      case 'q':
        this.align(2)
        this.reserve(2)
        this.buffer.writeUInt16LE(Number(value), at())
        this.length += 2
        return
      case 'i':
        this.align(4)
        this.reserve(4)
        this.buffer.writeInt32LE(Number(value), at())
        this.length += 4
        return
      case 'u':
      case 'h':
        this.align(4)
        this.reserve(4)
        this.buffer.writeUInt32LE(Number(value), at())
        this.length += 4
        return
      case 'x':
        this.align(8)
        this.reserve(8)
        this.buffer.writeBigInt64LE(BigInt(value as number | bigint), at())
        this.length += 8
        return
      case 't':
        this.align(8)
        this.reserve(8)
        this.buffer.writeBigUInt64LE(BigInt(value as number | bigint), at())
        this.length += 8
        return
      case 'd':
        this.align(8)
        this.reserve(8)
        this.buffer.writeDoubleLE(Number(value), at())
        this.length += 8
        return
      case 's':
      case 'o': {
        const data = Buffer.from(String(value), 'utf8')
        this.align(4)
        this.reserve(4)
        this.buffer.writeUInt32LE(data.length, at())
        this.length += 4
        this.bytes(data)
        this.u8(0)
        return
      }
      case 'g': {
        const data = Buffer.from(String(value), 'latin1')
        this.u8(data.length)
        this.bytes(data)
        this.u8(0)
        return
      }
      case 'v': {
        if (!(value instanceof Variant)) throw new Error('um "v" precisa de um Variant')
        this.write('g', value.signature)
        this.write(value.signature, value.value)
        return
      }
      case '(': {
        const fields = splitSignature(type.slice(1, -1))
        const values = value as unknown[]
        if (!Array.isArray(values) || values.length !== fields.length) {
          throw new Error(`a estrutura ${type} precisa de ${fields.length} valores`)
        }
        this.align(8)
        fields.forEach((field, i) => this.write(field, values[i]))
        return
      }
      case 'a': {
        const element = type.slice(1)
        this.align(4)
        const lengthAt = this.length
        this.reserve(4)
        this.length += 4
        this.align(alignment(element))
        const start = this.length
        if (element[0] === '{') {
          const [keyType, valueType] = splitSignature(element.slice(1, -1))
          for (const [key, item] of entries(value)) {
            this.align(8)
            this.write(keyType, key)
            this.write(valueType, item)
          }
        } else {
          for (const item of value as unknown[]) this.write(element, item)
        }
        this.u32At(lengthAt, this.length - start)
        return
      }
      default:
        throw new Error(`não sei escrever o tipo "${type}"`)
    }
  }
}

/** Os pares de um dicionário: Map, objeto ou lista de pares. */
function entries(value: unknown): [unknown, unknown][] {
  if (value instanceof Map) return [...value.entries()]
  if (Array.isArray(value)) return value as [unknown, unknown][]
  return Object.entries((value ?? {}) as Record<string, unknown>)
}

/** Escreve os valores de uma assinatura, a partir de `base` (para o alinhamento). */
export function marshal(signature: string, values: unknown[], base = 0): Buffer {
  const writer = new Writer(base)
  const types = splitSignature(signature)
  if (types.length !== values.length) {
    throw new Error(
      `a assinatura "${signature}" pede ${types.length} valores, vieram ${values.length}`
    )
  }
  types.forEach((type, i) => writer.write(type, values[i]))
  return writer.result()
}

// ---------------------------------------------------------------------------
// Leitura

class Reader {
  constructor(
    private readonly buffer: Buffer,
    public offset: number,
    private readonly little: boolean,
    private readonly base = 0
  ) {}

  private align(to: number): void {
    this.offset += (to - ((this.offset - this.base) % to)) % to
  }

  private need(bytes: number): void {
    if (this.offset + bytes > this.buffer.length) throw new Error('mensagem cortada')
  }

  read(type: string): unknown {
    const b = this.buffer
    switch (type[0]) {
      case 'y':
        this.need(1)
        return b.readUInt8(this.offset++)
      case 'b':
        return this.u32() !== 0
      case 'n': {
        this.align(2)
        this.need(2)
        const value = this.little ? b.readInt16LE(this.offset) : b.readInt16BE(this.offset)
        this.offset += 2
        return value
      }
      case 'q': {
        this.align(2)
        this.need(2)
        const value = this.little ? b.readUInt16LE(this.offset) : b.readUInt16BE(this.offset)
        this.offset += 2
        return value
      }
      case 'i': {
        this.align(4)
        this.need(4)
        const value = this.little ? b.readInt32LE(this.offset) : b.readInt32BE(this.offset)
        this.offset += 4
        return value
      }
      case 'u':
      case 'h':
        return this.u32()
      case 'x': {
        this.align(8)
        this.need(8)
        const value = this.little ? b.readBigInt64LE(this.offset) : b.readBigInt64BE(this.offset)
        this.offset += 8
        return value
      }
      case 't': {
        this.align(8)
        this.need(8)
        const value = this.little ? b.readBigUInt64LE(this.offset) : b.readBigUInt64BE(this.offset)
        this.offset += 8
        return value
      }
      case 'd': {
        this.align(8)
        this.need(8)
        const value = this.little ? b.readDoubleLE(this.offset) : b.readDoubleBE(this.offset)
        this.offset += 8
        return value
      }
      case 's':
      case 'o': {
        const length = this.u32()
        this.need(length + 1)
        const value = b.toString('utf8', this.offset, this.offset + length)
        this.offset += length + 1
        return value
      }
      case 'g': {
        this.need(1)
        const length = b.readUInt8(this.offset++)
        this.need(length + 1)
        const value = b.toString('latin1', this.offset, this.offset + length)
        this.offset += length + 1
        return value
      }
      case 'v': {
        const signature = this.read('g') as string
        return new Variant(signature, this.read(signature))
      }
      case '(': {
        this.align(8)
        return splitSignature(type.slice(1, -1)).map((field) => this.read(field))
      }
      case 'a': {
        const element = type.slice(1)
        const length = this.u32()
        if (length > MAX_MESSAGE) throw new Error('lista grande demais')
        this.align(alignment(element))
        const end = this.offset + length
        this.need(length)
        if (element[0] === '{') {
          const [keyType, valueType] = splitSignature(element.slice(1, -1))
          // Chaves de texto viram um objeto comum; as outras, um Map.
          const textKeys = 'sog'.includes(keyType)
          const map = new Map<unknown, unknown>()
          const object: Record<string, unknown> = {}
          while (this.offset < end) {
            this.align(8)
            const key = this.read(keyType)
            const value = this.read(valueType)
            if (textKeys) object[key as string] = value
            else map.set(key, value)
          }
          return textKeys ? object : map
        }
        const items: unknown[] = []
        while (this.offset < end) items.push(this.read(element))
        return items
      }
      default:
        throw new Error(`não sei ler o tipo "${type}"`)
    }
  }

  private u32(): number {
    this.align(4)
    this.need(4)
    const value = this.little
      ? this.buffer.readUInt32LE(this.offset)
      : this.buffer.readUInt32BE(this.offset)
    this.offset += 4
    return value
  }
}

/** Lê os valores de uma assinatura num buffer (para os testes e para o corpo das mensagens). */
export function unmarshal(signature: string, buffer: Buffer, little = true): unknown[] {
  const reader = new Reader(buffer, 0, little)
  return splitSignature(signature).map((type) => reader.read(type))
}

/** Tira os Variant de dentro de um valor lido (para usar os dados sem os tipos). */
export function plain(value: unknown): unknown {
  if (value instanceof Variant) return plain(value.value)
  if (Array.isArray(value)) return value.map(plain)
  if (value instanceof Map) return new Map([...value].map(([k, v]) => [k, plain(v)]))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]))
  }
  return value
}

// ---------------------------------------------------------------------------
// Mensagens

const HEADER_FIELDS: [number, keyof DBusMessage, string][] = [
  [1, 'path', 'o'],
  [2, 'interface', 's'],
  [3, 'member', 's'],
  [4, 'errorName', 's'],
  [5, 'replySerial', 'u'],
  [6, 'destination', 's'],
  [7, 'sender', 's'],
  [8, 'signature', 'g']
]

function encodeMessage(message: Omit<DBusMessage, 'body'> & { body: unknown[] }): Buffer {
  const body = message.signature ? marshal(message.signature, message.body) : Buffer.alloc(0)
  const fields: [number, Variant][] = []
  for (const [code, key, type] of HEADER_FIELDS) {
    const value = message[key]
    if (value !== undefined && value !== '') fields.push([code, new Variant(type, value)])
  }
  const header = marshal('yyyyuua(yv)', [
    'l'.charCodeAt(0),
    message.type,
    message.flags,
    1,
    body.length,
    message.serial,
    fields
  ])
  const pad = (8 - (header.length % 8)) % 8
  return Buffer.concat([header, Buffer.alloc(pad), body])
}

/** O tamanho da mensagem que começa no buffer, ou null se ainda não chegou o bastante. */
function messageLength(buffer: Buffer): number | null {
  if (buffer.length < 16) return null
  const little = buffer[0] === 0x6c
  const read = (at: number): number => (little ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at))
  const bodyLength = read(4)
  const fieldsLength = read(12)
  const headerEnd = 16 + fieldsLength
  const total = headerEnd + ((8 - (headerEnd % 8)) % 8) + bodyLength
  if (total > MAX_MESSAGE) throw new Error('mensagem grande demais')
  return total
}

function decodeMessage(buffer: Buffer): DBusMessage {
  const little = buffer[0] === 0x6c
  if (!little && buffer[0] !== 0x42) throw new Error('ordem de bytes desconhecida')
  const reader = new Reader(buffer, 0, little)
  const [, type, flags, , , serial, fields] = [
    reader.read('y'),
    reader.read('y'),
    reader.read('y'),
    reader.read('y'),
    reader.read('u'),
    reader.read('u'),
    reader.read('a(yv)')
  ] as [number, number, number, number, number, number, [number, Variant][]]
  const message: DBusMessage = { type, flags, serial, signature: '', body: [] }
  for (const [code, variant] of fields) {
    const field = HEADER_FIELDS.find(([c]) => c === code)
    if (field) (message as unknown as Record<string, unknown>)[field[1]] = variant.value
  }
  const bodyStart = reader.offset + ((8 - (reader.offset % 8)) % 8)
  if (message.signature) {
    const body = new Reader(buffer, bodyStart, little, bodyStart)
    message.body = splitSignature(message.signature).map((t) => body.read(t))
  }
  return message
}

// ---------------------------------------------------------------------------
// Conexão

/** Onde está o barramento de sessão: o DBUS_SESSION_BUS_ADDRESS, ou o padrão do systemd. */
export function sessionBusPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const address = env.DBUS_SESSION_BUS_ADDRESS
  const paths: string[] = []
  if (address) {
    for (const entry of address.split(';')) {
      const [transport, rest = ''] = entry.split(/:(.*)/s)
      if (transport !== 'unix') continue
      const options = new Map(
        rest
          .split(',')
          .map((pair) => pair.split(/=(.*)/s))
          .map(([key, value = '']) => [key, decodeURIComponent(value)])
      )
      const path = options.get('path')
      const abstract = options.get('abstract')
      if (path) paths.push(path)
      else if (abstract) paths.push(`\0${abstract}`)
    }
  } else if (env.XDG_RUNTIME_DIR) {
    paths.push(`${env.XDG_RUNTIME_DIR}/bus`)
  }
  return paths
}

/** Uma regra de sinal: só os campos que importam. */
export interface SignalMatch {
  sender?: string
  path?: string
  interface?: string
  member?: string
}

export interface Signal {
  sender: string
  path: string
  interface: string
  member: string
  body: unknown[]
}

/** Um método exportado: assinaturas de entrada e saída e o que ele faz. */
export interface ExportedMethod {
  in?: string
  out?: string
  handler(args: unknown[], message: DBusMessage): unknown[] | Promise<unknown[]> | void
}

export interface ExportedProperty {
  type: string
  get(): unknown
  set?(value: unknown): void
}

export interface ExportedInterface {
  methods?: Record<string, ExportedMethod>
  properties?: Record<string, ExportedProperty>
  signals?: Record<string, string>
}

function matchRule(match: SignalMatch): string {
  const parts = ["type='signal'"]
  for (const key of ['sender', 'path', 'interface', 'member'] as const) {
    const value = match[key]
    if (value === undefined) continue
    if (/[',\\]/.test(value)) throw new Error(`valor inválido na regra: ${value}`)
    parts.push(`${key}='${value}'`)
  }
  return parts.join(',')
}

const escapeXml = (text: string): string =>
  text.replace(/[<>&"]/g, (c) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', '"': 'quot' }[c]};`)

/**
 * Uma conexão com o barramento de sessão. Chamadas devolvem o corpo da resposta; sinais chegam
 * aos assinantes; objetos exportados respondem chamadas de fora.
 */
export class DBusConnection extends EventEmitter {
  /** O nome único desta conexão (":1.42"). */
  name = ''
  private serial = 0
  private buffer: Buffer = Buffer.alloc(0)
  private closed = false
  private readonly pending = new Map<
    number,
    { resolve(body: unknown[]): void; reject(error: Error): void; timer: NodeJS.Timeout }
  >()
  private readonly subscriptions: { match: SignalMatch; handler(signal: Signal): void }[] = []
  private readonly objects = new Map<string, Map<string, ExportedInterface>>()

  private constructor(private readonly socket: Socket) {
    super()
    socket.on('data', (chunk: Buffer) => this.onData(chunk))
    socket.on('error', () => this.close())
    socket.on('close', () => this.close())
  }

  /** Conecta no barramento de sessão; null se não houver um (ou se ele recusar). */
  static async session(env: NodeJS.ProcessEnv = process.env): Promise<DBusConnection | null> {
    for (const path of sessionBusPaths(env)) {
      const socket = await openSocket(path)
      if (!socket) continue
      if (!(await authenticate(socket))) {
        socket.destroy()
        continue
      }
      const connection = new DBusConnection(socket)
      try {
        const [name] = await connection.call({
          destination: 'org.freedesktop.DBus',
          path: '/org/freedesktop/DBus',
          interface: 'org.freedesktop.DBus',
          member: 'Hello'
        })
        connection.name = name as string
        return connection
      } catch {
        connection.close()
      }
    }
    return null
  }

  get alive(): boolean {
    return !this.closed
  }

  /** Chama um método e espera a resposta (o corpo dela). */
  call(options: {
    destination: string
    path: string
    interface?: string
    member: string
    signature?: string
    body?: unknown[]
    timeout?: number
  }): Promise<unknown[]> {
    if (this.closed) return Promise.reject(new Error('a conexão D-Bus está fechada'))
    const serial = ++this.serial
    const data = encodeMessage({
      type: Type.Call,
      flags: 0,
      serial,
      path: options.path,
      interface: options.interface,
      member: options.member,
      destination: options.destination,
      signature: options.signature ?? '',
      body: options.body ?? []
    })
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(serial)
        reject(
          new DBusError('org.freedesktop.DBus.Error.Timeout', `${options.member}: sem resposta`)
        )
      }, options.timeout ?? DEFAULT_TIMEOUT_MS)
      this.pending.set(serial, { resolve, reject, timer })
      this.socket.write(data)
    })
  }

  /** Lê uma propriedade (org.freedesktop.DBus.Properties.Get), já sem o Variant. */
  async getProperty(
    destination: string,
    path: string,
    iface: string,
    name: string
  ): Promise<unknown> {
    const [value] = await this.call({
      destination,
      path,
      interface: 'org.freedesktop.DBus.Properties',
      member: 'Get',
      signature: 'ss',
      body: [iface, name]
    })
    return plain(value)
  }

  /** Todas as propriedades de uma interface, sem os Variant. */
  async getAllProperties(
    destination: string,
    path: string,
    iface: string
  ): Promise<Record<string, unknown>> {
    const [values] = await this.call({
      destination,
      path,
      interface: 'org.freedesktop.DBus.Properties',
      member: 'GetAll',
      signature: 's',
      body: [iface]
    })
    return plain(values) as Record<string, unknown>
  }

  /**
   * Passa a receber os sinais que batem com a regra. Devolve a função que cancela. A regra vai
   * para o barramento (AddMatch) e é conferida de novo aqui, porque chegam os sinais de todas as
   * regras da conexão.
   */
  async subscribe(match: SignalMatch, handler: (signal: Signal) => void): Promise<() => void> {
    const rule = matchRule(match)
    const entry = { match, handler }
    this.subscriptions.push(entry)
    try {
      await this.callBus('AddMatch', 's', [rule])
    } catch (err) {
      this.subscriptions.splice(this.subscriptions.indexOf(entry), 1)
      throw err
    }
    return () => {
      const index = this.subscriptions.indexOf(entry)
      if (index < 0) return
      this.subscriptions.splice(index, 1)
      if (!this.closed) this.callBus('RemoveMatch', 's', [rule]).catch(() => {})
    }
  }

  /** Pede um nome conhecido no barramento. Devolve true se ficou com ele. */
  async requestName(name: string): Promise<boolean> {
    // Flag 4: não esperar na fila se outro já tiver o nome.
    const [result] = await this.callBus('RequestName', 'su', [name, 4])
    return result === 1 || result === 4
  }

  /** Exporta uma interface num caminho; devolve a função que retira. */
  export(path: string, name: string, iface: ExportedInterface): () => void {
    let interfaces = this.objects.get(path)
    if (!interfaces) this.objects.set(path, (interfaces = new Map()))
    interfaces.set(name, iface)
    return () => {
      interfaces?.delete(name)
      if (interfaces?.size === 0) this.objects.delete(path)
    }
  }

  /** Emite um sinal. */
  emitSignal(
    path: string,
    iface: string,
    member: string,
    signature = '',
    body: unknown[] = []
  ): void {
    if (this.closed) return
    this.socket.write(
      encodeMessage({
        type: Type.Signal,
        flags: NO_REPLY_EXPECTED,
        serial: ++this.serial,
        path,
        interface: iface,
        member,
        signature,
        body
      })
    )
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.socket.destroy()
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer)
      reject(new Error('a conexão D-Bus caiu'))
    }
    this.pending.clear()
    this.emit('close')
  }

  private callBus(member: string, signature: string, body: unknown[]): Promise<unknown[]> {
    return this.call({
      destination: 'org.freedesktop.DBus',
      path: '/org/freedesktop/DBus',
      interface: 'org.freedesktop.DBus',
      member,
      signature,
      body
    })
  }

  private onData(chunk: Buffer): void {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk
    try {
      for (;;) {
        const length = messageLength(this.buffer)
        if (length === null || this.buffer.length < length) return
        const message = decodeMessage(this.buffer.subarray(0, length))
        this.buffer = this.buffer.subarray(length)
        this.dispatch(message)
      }
    } catch (err) {
      console.warn('[wisp] mensagem D-Bus ilegível; fechando a conexão:', err)
      this.close()
    }
  }

  private dispatch(message: DBusMessage): void {
    switch (message.type) {
      case Type.Return:
      case Type.Error: {
        const waiting = message.replySerial ? this.pending.get(message.replySerial) : undefined
        if (!waiting) return
        this.pending.delete(message.replySerial!)
        clearTimeout(waiting.timer)
        if (message.type === Type.Return) waiting.resolve(message.body)
        else {
          const text = typeof message.body[0] === 'string' ? message.body[0] : ''
          waiting.reject(
            new DBusError(message.errorName ?? 'org.freedesktop.DBus.Error.Failed', text)
          )
        }
        return
      }
      case Type.Signal: {
        const signal: Signal = {
          sender: message.sender ?? '',
          path: message.path ?? '',
          interface: message.interface ?? '',
          member: message.member ?? '',
          body: message.body
        }
        for (const { match, handler } of [...this.subscriptions]) {
          // O remetente de um sinal é sempre o nome único; regras com nome conhecido ficam a cargo
          // do barramento.
          if (match.sender?.startsWith(':') && match.sender !== signal.sender) continue
          if (match.path !== undefined && match.path !== signal.path) continue
          if (match.interface !== undefined && match.interface !== signal.interface) continue
          if (match.member !== undefined && match.member !== signal.member) continue
          try {
            handler(signal)
          } catch (err) {
            console.warn('[wisp] erro tratando um sinal D-Bus:', err)
          }
        }
        return
      }
      case Type.Call:
        void this.answer(message)
        return
    }
  }

  /** Responde uma chamada de fora, a um objeto exportado. */
  private async answer(message: DBusMessage): Promise<void> {
    const reply = (signature: string, body: unknown[]): void => {
      if (message.flags & NO_REPLY_EXPECTED || this.closed) return
      this.socket.write(
        encodeMessage({
          type: Type.Return,
          flags: NO_REPLY_EXPECTED,
          serial: ++this.serial,
          replySerial: message.serial,
          destination: message.sender,
          signature,
          body
        })
      )
    }
    const fail = (errorName: string, text: string): void => {
      if (message.flags & NO_REPLY_EXPECTED || this.closed) return
      this.socket.write(
        encodeMessage({
          type: Type.Error,
          flags: NO_REPLY_EXPECTED,
          serial: ++this.serial,
          replySerial: message.serial,
          destination: message.sender,
          errorName,
          signature: 's',
          body: [text]
        })
      )
    }
    const interfaces = this.objects.get(message.path ?? '')
    const iface = message.interface ?? ''
    try {
      if (iface === 'org.freedesktop.DBus.Peer' && message.member === 'Ping') return reply('', [])
      if (iface === 'org.freedesktop.DBus.Introspectable' && message.member === 'Introspect') {
        return reply('s', [this.introspect(message.path ?? '/')])
      }
      if (!interfaces) {
        return fail('org.freedesktop.DBus.Error.UnknownObject', `Nada em ${message.path}`)
      }
      if (iface === 'org.freedesktop.DBus.Properties') {
        const [target, name, value] = message.body as [string, string?, Variant?]
        const props = interfaces.get(target)?.properties ?? {}
        if (message.member === 'GetAll') {
          return reply('a{sv}', [
            Object.fromEntries(
              Object.entries(props).map(([k, p]) => [k, new Variant(p.type, p.get())])
            )
          ])
        }
        const prop = name ? props[name] : undefined
        if (!prop)
          return fail('org.freedesktop.DBus.Error.UnknownProperty', `Sem ${target}.${name}`)
        if (message.member === 'Get') return reply('v', [new Variant(prop.type, prop.get())])
        if (message.member === 'Set') {
          if (!prop.set)
            return fail('org.freedesktop.DBus.Error.PropertyReadOnly', `${name} é só leitura`)
          prop.set(value instanceof Variant ? value.value : value)
          return reply('', [])
        }
      }
      // Sem interface na chamada, vale a primeira que tiver o método.
      const candidates = iface ? [interfaces.get(iface)] : [...interfaces.values()]
      const method = candidates.map((c) => c?.methods?.[message.member ?? '']).find(Boolean)
      if (!method) {
        return fail('org.freedesktop.DBus.Error.UnknownMethod', `Sem ${iface}.${message.member}`)
      }
      if ((method.in ?? '') !== message.signature) {
        return fail(
          'org.freedesktop.DBus.Error.InvalidArgs',
          `${message.member} espera "${method.in ?? ''}", veio "${message.signature}"`
        )
      }
      const result = await method.handler(message.body, message)
      reply(method.out ?? '', result ?? [])
    } catch (err) {
      if (err instanceof DBusError) fail(err.type, err.message)
      else fail('org.freedesktop.DBus.Error.Failed', (err as Error).message)
    }
  }

  private introspect(path: string): string {
    const lines = [
      '<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN"',
      ' "http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">',
      '<node>'
    ]
    for (const [name, iface] of this.objects.get(path) ?? []) {
      lines.push(`  <interface name="${escapeXml(name)}">`)
      for (const [method, spec] of Object.entries(iface.methods ?? {})) {
        lines.push(`    <method name="${escapeXml(method)}">`)
        for (const type of splitSignature(spec.in ?? '')) {
          lines.push(`      <arg type="${escapeXml(type)}" direction="in"/>`)
        }
        for (const type of splitSignature(spec.out ?? '')) {
          lines.push(`      <arg type="${escapeXml(type)}" direction="out"/>`)
        }
        lines.push('    </method>')
      }
      for (const [signal, signature] of Object.entries(iface.signals ?? {})) {
        lines.push(`    <signal name="${escapeXml(signal)}">`)
        for (const type of splitSignature(signature)) {
          lines.push(`      <arg type="${escapeXml(type)}"/>`)
        }
        lines.push('    </signal>')
      }
      for (const [prop, spec] of Object.entries(iface.properties ?? {})) {
        const access = spec.set ? 'readwrite' : 'read'
        lines.push(
          `    <property name="${escapeXml(prop)}" type="${escapeXml(spec.type)}" access="${access}"/>`
        )
      }
      lines.push('  </interface>')
    }
    // Os filhos diretos, para quem navega a árvore.
    const prefix = path === '/' ? '/' : `${path}/`
    const children = new Set<string>()
    for (const other of this.objects.keys()) {
      if (other.startsWith(prefix) && other !== path)
        children.add(other.slice(prefix.length).split('/')[0])
    }
    for (const child of children) lines.push(`  <node name="${escapeXml(child)}"/>`)
    lines.push('</node>')
    return lines.join('\n')
  }
}

function openSocket(path: string): Promise<Socket | null> {
  return new Promise((resolve) => {
    const socket = connect(path)
    socket.once('connect', () => {
      socket.removeAllListeners('error')
      resolve(socket)
    })
    socket.once('error', () => resolve(null))
  })
}

/** Autenticação EXTERNAL: o servidor confere o usuário pelo socket. */
function authenticate(socket: Socket): Promise<boolean> {
  return new Promise((resolve) => {
    let text = ''
    const done = (ok: boolean): void => {
      clearTimeout(timer)
      socket.off('data', onData)
      socket.off('close', onFail)
      resolve(ok)
    }
    const onFail = (): void => done(false)
    const onData = (chunk: Buffer): void => {
      text += chunk.toString('latin1')
      if (!text.includes('\r\n')) return
      if (text.startsWith('OK ')) {
        socket.write('BEGIN\r\n')
        done(true)
      } else {
        done(false)
      }
    }
    const timer = setTimeout(onFail, 2000)
    socket.on('data', onData)
    socket.on('close', onFail)
    const uid = Buffer.from(String(process.getuid?.() ?? 0)).toString('hex')
    socket.write(Buffer.concat([Buffer.from([0]), Buffer.from(`AUTH EXTERNAL ${uid}\r\n`)]))
  })
}
