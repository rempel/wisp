// O Secret Service de mentira como processo à parte (os testes de ponta a ponta o montam com o
// esbuild): entra no D-Bus da sessão, destrancado, e grava os itens em $FAKE_SECRETS_FILE a cada
// mudança (com o valor, para o teste conferir que a chave foi para o chaveiro).
import { writeFileSync } from 'node:fs'
import { DBusConnection } from '../../src/main/dbus'
import { serveSecrets } from './secret-service'
import type { SecretState } from './secret-service'

const file = process.env.FAKE_SECRETS_FILE
const state: SecretState = {
  items: new Map(),
  locked: false,
  prompts: 0,
  answer: 'ok',
  changed: () => {
    if (!file) return
    const items = [...state.items.values()].map((item) => ({
      attributes: item.attributes,
      label: item.label,
      value: item.value.toString('utf8')
    }))
    writeFileSync(file, JSON.stringify(items))
  }
}
const bus = await DBusConnection.session()
if (!bus || !(await bus.requestName('org.freedesktop.secrets'))) {
  console.error('não consegui o nome org.freedesktop.secrets')
  process.exit(1)
}
serveSecrets(bus, state)
state.changed?.()
console.log('pronto')
