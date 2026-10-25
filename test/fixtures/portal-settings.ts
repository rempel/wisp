// O portal de configurações de mentira (org.freedesktop.portal.Settings), com só a chave do "não
// perturbe" do GNOME: org.gnome.desktop.notifications show-banners. `old` faz o portal velho,
// sem o ReadOne (o Read devolve um Variant dentro do outro).
import { DBusError, Variant } from '../../src/main/dbus'
import type { DBusConnection } from '../../src/main/dbus'

const PATH = '/org/freedesktop/portal/desktop'
const IFACE = 'org.freedesktop.portal.Settings'
const NAMESPACE = 'org.gnome.desktop.notifications'
const KEY = 'show-banners'

export function servePortalSettings(
  bus: DBusConnection,
  state: { banners: boolean; old?: boolean }
): { setBanners(value: boolean): void } {
  const read = (namespace: unknown, key: unknown): boolean => {
    if (namespace !== NAMESPACE || key !== KEY) {
      throw new DBusError('org.freedesktop.portal.Error.NotFound', 'não existe')
    }
    return state.banners
  }
  bus.export(PATH, IFACE, {
    methods: {
      ...(state.old
        ? {}
        : {
            ReadOne: {
              in: 'ss',
              out: 'v',
              handler: ([namespace, key]) => [new Variant('b', read(namespace, key))]
            }
          }),
      Read: {
        in: 'ss',
        out: 'v',
        handler: ([namespace, key]) => [new Variant('v', new Variant('b', read(namespace, key)))]
      }
    },
    signals: { SettingChanged: 'ssv' }
  })
  return {
    setBanners: (value) => {
      state.banners = value
      bus.emitSignal(PATH, IFACE, 'SettingChanged', 'ssv', [
        NAMESPACE,
        KEY,
        new Variant('b', value)
      ])
    }
  }
}
