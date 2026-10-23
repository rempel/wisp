// Um servidor de notificações de mentira (org.freedesktop.Notifications) para os testes: guarda
// as notificações mostradas e as fechadas, e "clica" num botão emitindo o ActionInvoked, como o
// de verdade faz.
import type { DBusConnection } from '../../src/main/dbus'

const NAME = 'org.freedesktop.Notifications'
const PATH = '/org/freedesktop/Notifications'

export interface ShownEntry {
  id: number
  summary: string
  body: string
  actions: string[]
}

export interface NotifyState {
  /** O servidor tem botões (a capacidade "actions"). */
  actions: boolean
  shown: ShownEntry[]
  closed: number[]
  changed?(): void
}

export function serveNotifications(
  bus: DBusConnection,
  state: NotifyState
): { click(id: number, key: string): void; dismiss(id: number): void } {
  let seq = 0
  bus.export(PATH, NAME, {
    methods: {
      GetCapabilities: {
        out: 'as',
        handler: () => [state.actions ? ['body', 'actions'] : ['body']]
      },
      GetServerInformation: {
        out: 'ssss',
        handler: () => ['fake', 'wisp', '1', '1.2']
      },
      Notify: {
        in: 'susssasa{sv}i',
        out: 'u',
        handler: ([, replaces, , summary, body, actions]) => {
          const id = Number(replaces) || ++seq
          state.shown.push({
            id,
            summary: String(summary),
            body: String(body),
            actions: (actions as string[]).map(String)
          })
          state.changed?.()
          return [id]
        }
      },
      CloseNotification: {
        in: 'u',
        handler: ([id]) => {
          state.closed.push(Number(id))
          state.changed?.()
          bus.emitSignal(PATH, NAME, 'NotificationClosed', 'uu', [Number(id), 3])
        }
      }
    },
    signals: { ActionInvoked: 'us', NotificationClosed: 'uu' }
  })
  return {
    click: (id, key) => bus.emitSignal(PATH, NAME, 'ActionInvoked', 'us', [id, key]),
    dismiss: (id) => bus.emitSignal(PATH, NAME, 'NotificationClosed', 'uu', [id, 2])
  }
}
