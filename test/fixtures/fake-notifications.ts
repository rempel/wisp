// O servidor de notificações de mentira como processo à parte (os testes de ponta a ponta o
// montam com o esbuild): grava o que mostrou e fechou em $FAKE_NOTIFY_FILE e "clica" nos botões
// pedidos em $FAKE_NOTIFY_CLICK (uma linha JSON por clique: {"id": 1, "key": "allow-…"}). Uma
// linha {"lock": true} (ou false) faz as vezes da proteção de tela: o sinal ActiveChanged.
import { existsSync, readFileSync, watchFile, writeFileSync } from 'node:fs'
import { DBusConnection } from '../../src/main/dbus'
import { serveNotifications } from './notifications'
import type { NotifyState } from './notifications'

const file = process.env.FAKE_NOTIFY_FILE
const clicks = process.env.FAKE_NOTIFY_CLICK
const state: NotifyState = {
  actions: process.env.FAKE_NOTIFY_NO_ACTIONS !== '1',
  shown: [],
  closed: [],
  changed: () => {
    if (file) writeFileSync(file, JSON.stringify({ shown: state.shown, closed: state.closed }))
  }
}
const bus = await DBusConnection.session()
if (!bus || !(await bus.requestName('org.freedesktop.Notifications'))) {
  console.error('não consegui o nome org.freedesktop.Notifications')
  process.exit(1)
}
const server = serveNotifications(bus, state)
state.changed?.()
if (clicks) {
  writeFileSync(clicks, '')
  let done = 0
  watchFile(clicks, { interval: 100 }, () => {
    if (!existsSync(clicks)) return
    const lines = readFileSync(clicks, 'utf8').split('\n').filter(Boolean)
    for (const line of lines.slice(done)) {
      const command = JSON.parse(line) as { id?: number; key?: string; lock?: boolean }
      if (typeof command.lock === 'boolean') {
        bus.emitSignal(
          '/org/freedesktop/ScreenSaver',
          'org.freedesktop.ScreenSaver',
          'ActiveChanged',
          'b',
          [command.lock]
        )
      } else if (command.id !== undefined && command.key) server.click(command.id, command.key)
    }
    done = lines.length
  })
}
console.log('pronto')
