import { EventEmitter } from 'events'
import { DBusConnection } from './dbus'
import type { Signal } from './dbus'

// A tela bloqueada, para a escuta pausar. O Electron só avisa do bloqueio no macOS e no Windows;
// no Linux, o Wisp ouve duas fontes pelo D-Bus:
// - o logind (barramento do sistema): a propriedade LockedHint da sessão, que o GNOME, o KDE e
//   outros ligam quando a tela de bloqueio aparece;
// - a proteção de tela (barramento de sessão): o sinal ActiveChanged da org.freedesktop.ScreenSaver
//   e das equivalentes do GNOME, do MATE e do Cinnamon.
// Qualquer uma dizendo que está bloqueada basta.

const LOGIND = 'org.freedesktop.login1'
const LOGIND_SESSION = 'org.freedesktop.login1.Session'
const PROPERTIES = 'org.freedesktop.DBus.Properties'

/** As proteções de tela conhecidas: o nome no barramento, o caminho e a interface. */
const SAVERS = [
  ['org.freedesktop.ScreenSaver', '/org/freedesktop/ScreenSaver', 'org.freedesktop.ScreenSaver'],
  ['org.freedesktop.ScreenSaver', '/ScreenSaver', 'org.freedesktop.ScreenSaver'],
  ['org.gnome.ScreenSaver', '/org/gnome/ScreenSaver', 'org.gnome.ScreenSaver'],
  ['org.mate.ScreenSaver', '/org/mate/ScreenSaver', 'org.mate.ScreenSaver'],
  ['org.cinnamon.ScreenSaver', '/org/cinnamon/ScreenSaver', 'org.cinnamon.ScreenSaver']
] as const

/** Avisa 'change' (com o novo valor) quando a tela bloqueia ou desbloqueia. */
export class ScreenLock extends EventEmitter {
  /** O que cada fonte diz agora. */
  private readonly sources = new Map<string, boolean>()
  private readonly buses: DBusConnection[] = []

  get locked(): boolean {
    return [...this.sources.values()].some(Boolean)
  }

  /**
   * Começa a ouvir as duas fontes, cada uma por si: o 'change' vale assim que uma delas está
   * ouvindo (o barramento do sistema pode demorar a responder, e a proteção de tela não espera
   * por ele). Sem D-Bus, a tela nunca está bloqueada.
   */
  static watch(env: NodeJS.ProcessEnv = process.env): ScreenLock {
    const lock = new ScreenLock()
    void lock.watchSavers(env).catch(() => {})
    void lock.watchLogind(env).catch(() => {})
    return lock
  }

  dispose(): void {
    for (const bus of this.buses.splice(0)) bus.close()
  }

  private set(source: string, value: boolean): void {
    const before = this.locked
    if (this.sources.get(source) !== value) console.info(`[wisp] tela: ${source} = ${value}`)
    this.sources.set(source, value)
    if (this.locked !== before) this.emit('change', this.locked)
  }

  private async watchSavers(env: NodeJS.ProcessEnv): Promise<void> {
    const bus = await DBusConnection.session(env)
    if (!bus) return
    this.buses.push(bus)
    for (const iface of new Set(SAVERS.map(([, , name]) => name))) {
      await bus.subscribe({ interface: iface, member: 'ActiveChanged' }, (signal: Signal) => {
        this.set(`saver:${iface}`, signal.body[0] === true)
      })
    }
    // O estado de agora (uma proteção de tela que já estava ativa quando o Wisp abriu).
    await Promise.all(
      SAVERS.map(async ([name, path, iface]) => {
        try {
          const [active] = await bus.call({
            destination: name,
            path,
            interface: iface,
            member: 'GetActive',
            timeout: 2000
          })
          if (typeof active === 'boolean') this.set(`saver:${iface}`, active)
        } catch {
          // Esse desktop não tem essa proteção de tela.
        }
      })
    )
  }

  private async watchLogind(env: NodeJS.ProcessEnv): Promise<void> {
    const bus = await DBusConnection.system(env)
    if (!bus) return
    this.buses.push(bus)
    const session = await this.sessionPath(bus, env)
    if (!session) return
    await bus.subscribe(
      { sender: LOGIND, path: session, interface: PROPERTIES, member: 'PropertiesChanged' },
      (signal) => {
        const [iface, changed] = signal.body as [string, Record<string, unknown>]
        if (iface !== LOGIND_SESSION) return
        const hint = changed?.LockedHint as { value?: unknown } | undefined
        if (hint && typeof hint.value === 'boolean') this.set('logind', hint.value)
      }
    )
    // Lock e Unlock são pedidos para a tela de bloqueio; o LockedHint é que diz se ela apareceu.
    try {
      const hint = await bus.getProperty(LOGIND, session, LOGIND_SESSION, 'LockedHint')
      if (typeof hint === 'boolean') this.set('logind', hint)
    } catch {
      // logind antigo, sem LockedHint.
    }
  }

  /** O caminho da sessão do usuário no logind. */
  private async sessionPath(bus: DBusConnection, env: NodeJS.ProcessEnv): Promise<string | null> {
    const call = async (member: string, signature: string, body: unknown[]): Promise<unknown> => {
      const [path] = await bus.call({
        destination: LOGIND,
        path: '/org/freedesktop/login1',
        interface: 'org.freedesktop.login1.Manager',
        member,
        signature,
        body,
        timeout: 3000
      })
      return path
    }
    for (const attempt of [
      () => call('GetSessionByPID', 'u', [process.pid]),
      () => (env.XDG_SESSION_ID ? call('GetSession', 's', [env.XDG_SESSION_ID]) : null)
    ]) {
      try {
        const path = await attempt()
        if (typeof path === 'string' && path) return path
      } catch {
        // O Wisp pode rodar fora de uma sessão (um serviço do systemd): tenta a próxima.
      }
    }
    return null
  }
}
