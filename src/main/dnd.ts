// O "não perturbe" do desktop (Fase 32): ligado, o Wisp não manda notificações nem toca sons; os
// cards esperam no painel (e vão para o celular, se ele estiver ligado). O estado vem de onde
// cada desktop o guarda, pelo D-Bus, e as mudanças chegam por sinal (nada de conferir de tempos
// em tempos):
//
// - KDE Plasma: a propriedade Inhibited do próprio servidor de notificações
//   (org.freedesktop.Notifications), com o PropertiesChanged;
// - GNOME: a chave show-banners de org.gnome.desktop.notifications (desligada é o "não
//   perturbe"), pelo portal de configurações (org.freedesktop.portal.Settings), com o
//   SettingChanged.
//
// Um desktop que não diz nada (null) nunca fica em "não perturbe".

import type { DBusConnection } from './dbus'
import { plain } from './dbus'

const NOTIFICATIONS = 'org.freedesktop.Notifications'
const NOTIFICATIONS_PATH = '/org/freedesktop/Notifications'
const PORTAL = 'org.freedesktop.portal.Desktop'
const PORTAL_PATH = '/org/freedesktop/portal/desktop'
const SETTINGS = 'org.freedesktop.portal.Settings'
const GNOME_NAMESPACE = 'org.gnome.desktop.notifications'
const GNOME_KEY = 'show-banners'

/** De onde vem o "não perturbe". */
export type DndSource = 'kde' | 'gnome'

/** Quem tem o nome agora (o nome único): só os sinais dele contam. */
async function ownerOf(bus: DBusConnection, name: string): Promise<string | null> {
  try {
    const [owner] = await bus.call({
      destination: 'org.freedesktop.DBus',
      path: '/org/freedesktop/DBus',
      interface: 'org.freedesktop.DBus',
      member: 'GetNameOwner',
      signature: 's',
      body: [name],
      timeout: 3000
    })
    return typeof owner === 'string' ? owner : null
  } catch {
    return null
  }
}

export class DoNotDisturb {
  private value: boolean | null = null
  private source: DndSource | null = null
  private readonly cleanups: (() => void)[] = []
  private readonly listeners = new Set<(active: boolean) => void>()

  /** O "não perturbe" está ligado agora. */
  active(): boolean {
    return this.value === true
  }

  /** Ligado, desligado, ou null se o desktop não diz. */
  state(): { active: boolean | null; source: DndSource | null } {
    return { active: this.value, source: this.source }
  }

  onChange(listener: (active: boolean) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Descobre de onde vem o estado e passa a acompanhar as mudanças. */
  async start(bus: DBusConnection): Promise<DndSource | null> {
    if (await this.startKde(bus)) return (this.source = 'kde')
    if (await this.startGnome(bus)) return (this.source = 'gnome')
    return null
  }

  dispose(): void {
    for (const cleanup of this.cleanups.splice(0)) cleanup()
  }

  private set(active: boolean): void {
    if (active === this.value) return
    const before = this.value
    this.value = active
    // A primeira leitura não é uma mudança.
    if (before === null && !active) return
    for (const listener of this.listeners) listener(active)
  }

  private async startKde(bus: DBusConnection): Promise<boolean> {
    let inhibited: unknown
    try {
      inhibited = await bus.getProperty(
        NOTIFICATIONS,
        NOTIFICATIONS_PATH,
        NOTIFICATIONS,
        'Inhibited'
      )
    } catch {
      return false
    }
    const sender = await ownerOf(bus, NOTIFICATIONS)
    if (typeof inhibited !== 'boolean' || !sender) return false
    this.cleanups.push(
      await bus.subscribe(
        {
          sender,
          path: NOTIFICATIONS_PATH,
          interface: 'org.freedesktop.DBus.Properties',
          member: 'PropertiesChanged'
        },
        (signal) => {
          const [iface, changed] = signal.body as [string, unknown]
          if (iface !== NOTIFICATIONS) return
          const value = (plain(changed) as Record<string, unknown> | null)?.Inhibited
          if (typeof value === 'boolean') this.set(value)
        }
      )
    )
    this.set(inhibited)
    return true
  }

  private async startGnome(bus: DBusConnection): Promise<boolean> {
    const read = async (member: 'ReadOne' | 'Read'): Promise<unknown> => {
      const [value] = await bus.call({
        destination: PORTAL,
        path: PORTAL_PATH,
        interface: SETTINGS,
        member,
        signature: 'ss',
        body: [GNOME_NAMESPACE, GNOME_KEY],
        timeout: 3000
      })
      // O Read antigo devolve um Variant dentro do outro; o plain tira os dois.
      return plain(value)
    }
    let banners: unknown
    try {
      banners = await read('ReadOne').catch(() => read('Read'))
    } catch {
      return false
    }
    const sender = await ownerOf(bus, PORTAL)
    if (typeof banners !== 'boolean' || !sender) return false
    this.cleanups.push(
      await bus.subscribe(
        { sender, path: PORTAL_PATH, interface: SETTINGS, member: 'SettingChanged' },
        (signal) => {
          const [namespace, key, value] = signal.body as [string, string, unknown]
          if (namespace !== GNOME_NAMESPACE || key !== GNOME_KEY) return
          const shown = plain(value)
          if (typeof shown === 'boolean') this.set(!shown)
        }
      )
    )
    this.set(!banners)
    return true
  }
}
