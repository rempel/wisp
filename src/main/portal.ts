import { randomBytes } from 'crypto'
import { DBusConnection, DBusError, plain, Variant } from './dbus'
import type { Signal } from './dbus'
import { APP_ID } from './launcher'

// Os portais do desktop (xdg-desktop-portal), pelo D-Bus: o atalho global e o print da tela.

export const PORTAL = 'org.freedesktop.portal.Desktop'
export const PORTAL_PATH = '/org/freedesktop/portal/desktop'

/** A resposta de um pedido a um portal: 0 deu certo, 1 o usuário cancelou, 2 outro motivo. */
export interface PortalResponse {
  response: number
  results: Record<string, unknown>
}

let shared: Promise<DBusConnection | null> | null = null

/**
 * A conexão com o barramento de sessão usada para os portais. Na primeira vez, o Wisp registra o
 * id dele (org.freedesktop.host.portal.Registry): os portais precisam saber de que app vem um
 * pedido, e um app fora do Flatpak não tem como dizer de outro jeito. O registro tem que vir antes
 * de qualquer outra chamada aos portais nesta conexão.
 */
export function portalBus(): Promise<DBusConnection | null> {
  shared ??= (async () => {
    const bus = await DBusConnection.session()
    if (!bus) return null
    bus.on('close', () => {
      shared = null
    })
    try {
      await bus.call({
        destination: PORTAL,
        path: PORTAL_PATH,
        interface: 'org.freedesktop.host.portal.Registry',
        member: 'Register',
        signature: 'sa{sv}',
        body: [APP_ID, {}],
        timeout: 5000
      })
    } catch {
      // Portais antigos (antes da versão 1.19) não têm o registro; o resto funciona sem ele.
    }
    return bus
  })()
  return shared
}

/** Um token novo para um pedido: vira o fim do caminho do objeto do pedido. */
export function token(): string {
  return `wisp_${randomBytes(6).toString('hex')}`
}

/** O caminho em que o portal cria o objeto de um pedido (ou de uma sessão) com este token. */
export function requestPath(bus: DBusConnection, handle: string, kind = 'request'): string {
  const sender = bus.name.replace(/^:/, '').replace(/\./g, '_')
  return `${PORTAL_PATH}/${kind}/${sender}/${handle}`
}

/**
 * Faz um pedido a um portal e espera a resposta, que vem por um sinal (Request.Response) no
 * objeto do pedido. O sinal é assinado antes da chamada, para não se perder.
 */
export async function portalRequest(
  bus: DBusConnection,
  call: { interface: string; member: string; signature: string; body: unknown[] },
  handleToken: string,
  timeoutMs = 5 * 60_000
): Promise<PortalResponse> {
  let resolveResponse: (response: PortalResponse) => void = () => {}
  const response = new Promise<PortalResponse>((resolve) => {
    resolveResponse = resolve
  })
  const onResponse = (signal: Signal): void => {
    const [code, results] = signal.body as [number, Record<string, unknown>]
    resolveResponse({ response: code, results: plain(results) as Record<string, unknown> })
  }
  let path = requestPath(bus, handleToken)
  let unsubscribe = await bus.subscribe(
    { path, interface: 'org.freedesktop.portal.Request', member: 'Response' },
    onResponse
  )
  try {
    const [handle] = await bus.call({ destination: PORTAL, path: PORTAL_PATH, ...call })
    // Portais antigos escolhem o caminho por conta própria.
    if (handle !== path) {
      unsubscribe()
      path = handle as string
      unsubscribe = await bus.subscribe(
        { path, interface: 'org.freedesktop.portal.Request', member: 'Response' },
        onResponse
      )
    }
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<PortalResponse>((resolve) => {
      timer = setTimeout(() => resolve({ response: 2, results: {} }), timeoutMs)
    })
    const result = await Promise.race([response, timeout])
    clearTimeout(timer)
    return result
  } finally {
    unsubscribe()
  }
}

/** A versão de uma interface de portal, ou null se o desktop não tem esse portal. */
export async function portalVersion(bus: DBusConnection, iface: string): Promise<number | null> {
  try {
    const version = await bus.getProperty(PORTAL, PORTAL_PATH, iface, 'version')
    return typeof version === 'number' ? version : null
  } catch (err) {
    if (err instanceof DBusError) return null
    throw err
  }
}

/** Um dicionário a{sv} com textos e booleanos (as opções dos pedidos). */
export function options(
  values: Record<string, string | boolean | number>
): Record<string, Variant> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      new Variant(typeof value === 'string' ? 's' : typeof value === 'boolean' ? 'b' : 'u', value)
    ])
  )
}
