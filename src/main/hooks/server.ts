import { chmodSync, lstatSync, mkdirSync, rmSync } from 'fs'
import { connect, createServer } from 'net'
import type { Socket } from 'net'
import { isPrivateDir, socketDir, socketPath, TAB_TOKEN } from './protocol'
import type { RelayEvent, RelayReply } from './protocol'

/** Maior mensagem aceita de um relay (o pedido de permissão leva a entrada da ferramenta). */
const MAX_MESSAGE = 4 * 1024 * 1024
/** Um relay que conecta e não manda nada em 5 s é descartado. */
const IDLE_MS = 5000

/** Um pedido de permissão esperando a decisão. */
export interface PendingReply {
  /** Manda a resposta ao relay e fecha a conexão. Só a primeira vale. */
  reply(answer: RelayReply): void
  /** Chamado se o relay for embora antes da resposta (o prazo do hook acabou, por exemplo). */
  onClose(listener: () => void): void
}

export interface HookServer {
  close(): void
}

export type HookServerStart = { ok: true; server: HookServer } | { ok: false; problem: string }

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/** Confere o formato de uma mensagem do relay. */
function parseEvent(line: string): RelayEvent | null {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return null
  }
  if (!isObject(value) || value.v !== 1) return null
  const { event, at, pid, env, input, diff, inputHash, tab } = value
  if (typeof event !== 'string' || !event || event.length > 64) return null
  if (typeof at !== 'number' || !Number.isFinite(at)) return null
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid < 1) return null
  if (!isObject(env) || !Object.values(env).every((v) => typeof v === 'string')) return null
  if (!isObject(input)) return null
  if (diff !== undefined && !(isObject(diff) && Array.isArray(diff.hunks))) return null
  if (inputHash !== undefined && typeof inputHash !== 'string') return null
  if (tab !== undefined && (typeof tab !== 'string' || !TAB_TOKEN.test(tab))) return null
  return value as unknown as RelayEvent
}

/** Alguém responde no socket? (outro Wisp aberto) */
function answers(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(path)
    const done = (alive: boolean): void => {
      socket.destroy()
      resolve(alive)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    setTimeout(() => done(false), 500)
  })
}

function handle(
  socket: Socket,
  onEvent: (event: RelayEvent, pending: PendingReply | null) => void
): void {
  let buffer = ''
  let received = false
  socket.setEncoding('utf8')
  socket.on('error', () => {})
  const idle = setTimeout(() => socket.destroy(), IDLE_MS)
  socket.on('data', (chunk: string) => {
    if (received) return
    buffer += chunk
    if (buffer.length > MAX_MESSAGE) {
      socket.destroy()
      return
    }
    const newline = buffer.indexOf('\n')
    if (newline < 0) return
    received = true
    clearTimeout(idle)
    const event = parseEvent(buffer.slice(0, newline))
    if (!event) {
      socket.destroy()
      return
    }
    if (event.event !== 'PermissionRequest') {
      socket.end()
      onEvent(event, null)
      return
    }
    let replied = false
    const closeListeners: (() => void)[] = []
    socket.on('close', () => {
      if (replied) return
      replied = true
      for (const listener of closeListeners) listener()
    })
    onEvent(event, {
      reply(answer) {
        if (replied) return
        replied = true
        socket.end(JSON.stringify(answer) + '\n')
      },
      onClose(listener) {
        closeListeners.push(listener)
      }
    })
  })
}

/**
 * Sobe o socket que recebe os hooks: $XDG_RUNTIME_DIR/wisp/hooks.sock, numa pasta só do usuário
 * (0700) e com o socket 0600. Se outro Wisp já estiver ouvindo, não toma o lugar dele.
 */
export async function startHookServer(
  onEvent: (event: RelayEvent, pending: PendingReply | null) => void
): Promise<HookServerStart> {
  const dir = socketDir()
  const path = socketPath()
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  } catch (err) {
    return { ok: false, problem: `não consegui criar ${dir} (${(err as Error).message})` }
  }
  if (!isPrivateDir(dir)) {
    return { ok: false, problem: `a pasta ${dir} não é só do seu usuário` }
  }
  if (await answers(path)) {
    return { ok: false, problem: 'outro Wisp aberto já está ouvindo as sessões' }
  }
  try {
    if (lstatSync(path).isSocket()) rmSync(path)
  } catch {
    // Não havia socket sobrando.
  }
  const server = createServer((socket) => handle(socket, onEvent))
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(path, () => resolve())
    })
    chmodSync(path, 0o600)
  } catch (err) {
    server.close()
    return { ok: false, problem: `não consegui abrir o socket (${(err as Error).message})` }
  }
  return {
    ok: true,
    server: {
      close() {
        server.close()
        try {
          rmSync(path)
        } catch {
          // Já tinha saído.
        }
      }
    }
  }
}
