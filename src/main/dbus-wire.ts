// O formato das mensagens do D-Bus (Fase 9), como a especificação descreve: os tipos e as
// assinaturas, a escrita e a leitura dos valores (sempre little-endian na escrita) e o cabeçalho de
// cada mensagem. Funções puras; a conexão fica no dbus.ts.

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

export enum Type {
  Call = 1,
  Return = 2,
  Error = 3,
  Signal = 4
}

export const NO_REPLY_EXPECTED = 0x1
const MAX_MESSAGE = 128 * 1024 * 1024

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

export function encodeMessage(message: Omit<DBusMessage, 'body'> & { body: unknown[] }): Buffer {
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
export function messageLength(buffer: Buffer): number | null {
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

export function decodeMessage(buffer: Buffer): DBusMessage {
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
