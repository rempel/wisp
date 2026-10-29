// Um cliente D-Bus pequeno, em Node puro: chamadas, sinais e objetos exportados. É o que o Wisp
// usa para falar com os portais do desktop (atalho global, print da tela), com os players de
// música (MPRIS) e com o KWin. Sem dependências: só o protocolo, como a especificação descreve. O
// formato das mensagens fica no dbus-wire.ts.

import { EventEmitter } from 'events'
import { connect } from 'net'
import type { Socket } from 'net'
import {
  DBusError,
  decodeMessage,
  encodeMessage,
  messageLength,
  NO_REPLY_EXPECTED,
  plain,
  splitSignature,
  Type,
  Variant
} from './dbus-wire'
import type { DBusMessage } from './dbus-wire'
import { IS_WINDOWS } from './platform'

export { DBusError, marshal, plain, splitSignature, unmarshal, Variant } from './dbus-wire'
export type { DBusMessage } from './dbus-wire'

const DEFAULT_TIMEOUT_MS = 25_000

// ---------------------------------------------------------------------------
// Conexão

/** Os sockets unix de um endereço D-Bus ("unix:path=/run/user/1000/bus;…"). */
function addressPaths(address: string): string[] {
  const paths: string[] = []
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
  return paths
}

/** Onde está o barramento do sistema: o DBUS_SYSTEM_BUS_ADDRESS, ou o lugar padrão. */
export function systemBusPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const address = env.DBUS_SYSTEM_BUS_ADDRESS
  return address ? addressPaths(address) : ['/run/dbus/system_bus_socket']
}

/** Onde está o barramento de sessão: o DBUS_SESSION_BUS_ADDRESS, ou o padrão do systemd. */
export function sessionBusPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const address = env.DBUS_SESSION_BUS_ADDRESS
  const paths: string[] = []
  if (address) {
    paths.push(...addressPaths(address))
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
  static session(env: NodeJS.ProcessEnv = process.env): Promise<DBusConnection | null> {
    return DBusConnection.open(sessionBusPaths(env))
  }

  /** Conecta no barramento do sistema (o do logind); null se não houver um. */
  static system(env: NodeJS.ProcessEnv = process.env): Promise<DBusConnection | null> {
    return DBusConnection.open(systemBusPaths(env))
  }

  private static async open(paths: string[]): Promise<DBusConnection | null> {
    // No Windows não há D-Bus: o que depende dele fica desligado, sem erro.
    if (IS_WINDOWS) return null
    for (const path of paths) {
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
