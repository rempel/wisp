// O chaveiro do sistema (secrets.ts): guardar, ler, saber se existe (sem destrancar) e apagar um
// segredo, com um Secret Service de mentira num D-Bus de sessão só deste teste. O chaveiro começa
// trancado: ler ou guardar pede para destrancar (a janela de senha é o Prompt), e "existe?" não.
import './helpers/home'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { after, before, test } from 'node:test'
import { DBusConnection } from '../src/main/dbus'
import { deleteSecret, hasSecret, readSecret, SecretError, storeSecret } from '../src/main/secrets'
import { serveSecrets } from './fixtures/secret-service'
import type { SecretState } from './fixtures/secret-service'

let daemon: { address: string; pid: number } | null = null
try {
  const [address, pid] = execFileSync(
    'dbus-daemon',
    ['--session', '--fork', '--print-address=1', '--print-pid=1'],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  )
    .toString()
    .trim()
    .split('\n')
  daemon = { address, pid: Number(pid) }
} catch {
  // Sem o dbus-daemon, os testes daqui ficam de fora.
}
const env = { ...process.env, DBUS_SESSION_BUS_ADDRESS: daemon?.address ?? '' }
const skip = daemon ? false : 'sem o dbus-daemon'

const state: SecretState = { items: new Map(), locked: true, prompts: 0, answer: 'ok' }
const { items } = state
let service: DBusConnection | null = null

before(async () => {
  if (!daemon) return
  service = await DBusConnection.session(env)
  assert.ok(service && (await service.requestName('org.freedesktop.secrets')))
  serveSecrets(service, state)
})

after(() => {
  service?.close()
  if (daemon) process.kill(daemon.pid)
})

test('sem chaveiro no barramento: um motivo em português', { skip }, async () => {
  const empty = { ...env, DBUS_SESSION_BUS_ADDRESS: 'unix:path=/nao/existe' }
  await assert.rejects(readSecret('x', empty), (err) => err instanceof SecretError)
})

test('"existe?" com o chaveiro parado: não, sem acordá-lo', { skip }, async () => {
  const [address, pid] = execFileSync(
    'dbus-daemon',
    ['--session', '--fork', '--print-address=1', '--print-pid=1'],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  )
    .toString()
    .trim()
    .split('\n')
  try {
    assert.equal(
      await hasSecret('openrouter', { ...env, DBUS_SESSION_BUS_ADDRESS: address }),
      false
    )
  } finally {
    process.kill(Number(pid))
  }
})

test('trancado, recusar a senha não guarda nada', { skip }, async () => {
  state.answer = 'dismiss'
  await assert.rejects(
    storeSecret('openrouter', 'Wisp', 'sk-or-v1-segredo', env),
    /continua trancado/
  )
  assert.equal(items.size, 0)
  assert.equal(state.prompts, 1)
  state.answer = 'ok'
})

test('guardar destranca uma vez; ler, trocar e apagar', { skip }, async () => {
  await storeSecret('openrouter', 'Wisp: chave da OpenRouter', 'sk-or-v1-primeira', env)
  assert.equal(state.prompts, 2, 'a janela de senha apareceu')
  assert.equal(items.size, 1)
  const [item] = items.values()
  assert.deepEqual(item.attributes, {
    'xdg:schema': 'io.github.wisp.Secret',
    application: 'wisp',
    name: 'openrouter'
  })
  assert.equal(item.label, 'Wisp: chave da OpenRouter')
  assert.equal(await readSecret('openrouter', env), 'sk-or-v1-primeira')
  await storeSecret('openrouter', 'Wisp: chave da OpenRouter', 'sk-or-v1-segunda', env)
  assert.equal(items.size, 1, 'trocar não duplica')
  assert.equal(await readSecret('openrouter', env), 'sk-or-v1-segunda')
  assert.equal(await readSecret('outra', env), null)
  await deleteSecret('openrouter', env)
  assert.equal(items.size, 0)
  assert.equal(await readSecret('openrouter', env), null)
  await deleteSecret('openrouter', env)
})

test('"existe?" não destranca; ler, sim', { skip }, async () => {
  await storeSecret('openrouter', 'Wisp', 'sk-or-v1-terceira', env)
  state.locked = true
  const asked = state.prompts
  assert.equal(await hasSecret('openrouter', env), true)
  assert.equal(await hasSecret('outra', env), false)
  assert.equal(state.prompts, asked, 'sem janela de senha')
  assert.equal(await readSecret('openrouter', env), 'sk-or-v1-terceira')
  assert.equal(state.prompts, asked + 1)
})
