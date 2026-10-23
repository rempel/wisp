// Os segredos do Wisp (a chave da OpenRouter, na Fase 14) no chaveiro do sistema, pelo Secret
// Service do D-Bus (org.freedesktop.secrets): o GNOME Keyring, o KWallet 6, o KeePassXC. Nada vai
// para o config.json nem para o registro. O chaveiro trancado pede a senha na janela dele.
//
// A sessão do Secret Service é a "plain": o segredo passa sem cifra pelo barramento da sessão,
// que é só do usuário (é o que o secret-tool faz por padrão em vários desktops).

import { DBusConnection, DBusError, Variant } from './dbus'
import { t } from '../shared/i18n'

const SERVICE = 'org.freedesktop.secrets'
const ROOT = '/org/freedesktop/secrets'
const PREFIX = 'org.freedesktop.Secret.'
const SCHEMA = 'io.github.wisp.Secret'
/** Quanto esperar a pessoa destrancar o chaveiro (ms). */
const PROMPT_TIMEOUT_MS = 120_000

/** Por que o segredo não foi lido ou guardado, em português. */
export class SecretError extends Error {}

const NO_SERVICE =
  t('Não achei um chaveiro do sistema (Secret Service). Instale e abra o GNOME Keyring, o ') +
  t('KWallet ou o KeePassXC com a integração do Secret Service ligada.')

type Secret = [string, number[], number[], string]

async function open(env: NodeJS.ProcessEnv): Promise<{ bus: DBusConnection; session: string }> {
  const bus = await DBusConnection.session(env)
  if (!bus) throw new SecretError(NO_SERVICE)
  try {
    const [, session] = await bus.call({
      destination: SERVICE,
      path: ROOT,
      interface: `${PREFIX}Service`,
      member: 'OpenSession',
      signature: 'sv',
      body: ['plain', new Variant('s', '')]
    })
    return { bus, session: session as string }
  } catch (err) {
    bus.close()
    if (err instanceof DBusError && /ServiceUnknown|NameHasNoOwner/.test(err.type)) {
      throw new SecretError(NO_SERVICE)
    }
    throw new SecretError(
      t('O chaveiro do sistema não respondeu ({message}).', { message: (err as Error).message })
    )
  }
}

/** Espera a janela do chaveiro (a senha para destrancar); false se a pessoa desistiu. */
async function prompt(bus: DBusConnection, path: string): Promise<boolean> {
  if (!path || path === '/') return true
  return new Promise<boolean>((resolve, reject) => {
    let done = false
    let unsubscribe: (() => void) | null = null
    const finish = (value: boolean | Error): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      unsubscribe?.()
      if (value instanceof Error) reject(value)
      else resolve(value)
    }
    const timer = setTimeout(
      () => finish(new SecretError(t('O chaveiro não foi destrancado a tempo.'))),
      PROMPT_TIMEOUT_MS
    )
    void bus
      .subscribe({ path, interface: `${PREFIX}Prompt`, member: 'Completed' }, (signal) =>
        finish(!signal.body[0])
      )
      .then((off) => {
        unsubscribe = off
        if (done) off()
        return bus.call({
          destination: SERVICE,
          path,
          interface: `${PREFIX}Prompt`,
          member: 'Prompt',
          signature: 's',
          body: ['']
        })
      })
      .catch((err: Error) => finish(err))
  })
}

/** Destranca o que estiver trancado (o chaveiro pergunta a senha). */
async function unlock(bus: DBusConnection, paths: string[]): Promise<void> {
  if (!paths.length) return
  const [, promptPath] = await bus.call({
    destination: SERVICE,
    path: ROOT,
    interface: `${PREFIX}Service`,
    member: 'Unlock',
    signature: 'ao',
    body: [paths]
  })
  if (!(await prompt(bus, promptPath as string))) {
    throw new SecretError(t('O chaveiro continua trancado: destranque-o para eu usar a chave.'))
  }
}

const attributes = (name: string): Record<string, string> => ({
  'xdg:schema': SCHEMA,
  application: 'wisp',
  name
})

async function search(bus: DBusConnection, name: string): Promise<string[]> {
  const [unlocked, locked] = (await bus.call({
    destination: SERVICE,
    path: ROOT,
    interface: `${PREFIX}Service`,
    member: 'SearchItems',
    signature: 'a{ss}',
    body: [attributes(name)]
  })) as [string[], string[]]
  await unlock(bus, locked)
  return [...unlocked, ...locked]
}

async function withService<T>(
  env: NodeJS.ProcessEnv,
  work: (bus: DBusConnection, session: string) => Promise<T>
): Promise<T> {
  const { bus, session } = await open(env)
  try {
    return await work(bus, session)
  } catch (err) {
    if (err instanceof SecretError) throw err
    throw new SecretError(
      t('O chaveiro do sistema recusou o pedido ({message}).', { message: (err as Error).message })
    )
  } finally {
    bus
      .call({ destination: SERVICE, path: session, interface: `${PREFIX}Session`, member: 'Close' })
      .catch(() => {})
      .finally(() => bus.close())
  }
}

/**
 * Há um segredo com esse nome? Não destranca nada (não pede senha) e não acorda o chaveiro: se
 * ele não estiver rodando, a resposta é "não" (a tela de configurações só quer mostrar o estado,
 * e quem nunca usou a OpenRouter não tem por que ter o chaveiro aberto pelo Wisp).
 */
export async function hasSecret(name: string, env = process.env): Promise<boolean> {
  const bus = await DBusConnection.session(env)
  if (!bus) return false
  try {
    const [running] = await bus.call({
      destination: 'org.freedesktop.DBus',
      path: '/org/freedesktop/DBus',
      interface: 'org.freedesktop.DBus',
      member: 'NameHasOwner',
      signature: 's',
      body: [SERVICE]
    })
    if (!running) return false
  } finally {
    bus.close()
  }
  return withService(env, async (bus) => {
    const [unlocked, locked] = (await bus.call({
      destination: SERVICE,
      path: ROOT,
      interface: `${PREFIX}Service`,
      member: 'SearchItems',
      signature: 'a{ss}',
      body: [attributes(name)]
    })) as [string[], string[]]
    return unlocked.length + locked.length > 0
  })
}

/** Lê um segredo do Wisp; null se não houver. */
export function readSecret(name: string, env = process.env): Promise<string | null> {
  return withService(env, async (bus, session) => {
    const items = await search(bus, name)
    if (!items.length) return null
    const [secrets] = (await bus.call({
      destination: SERVICE,
      path: ROOT,
      interface: `${PREFIX}Service`,
      member: 'GetSecrets',
      signature: 'aoo',
      body: [items.slice(0, 1), session]
    })) as [Record<string, Secret>]
    const secret = secrets[items[0]]
    return secret ? Buffer.from(secret[2]).toString('utf8') : null
  })
}

/** A coleção padrão do chaveiro (o "login"), destrancada. */
async function defaultCollection(bus: DBusConnection): Promise<string> {
  const [path] = await bus.call({
    destination: SERVICE,
    path: ROOT,
    interface: `${PREFIX}Service`,
    member: 'ReadAlias',
    signature: 's',
    body: ['default']
  })
  if (!path || path === '/') {
    throw new SecretError(
      t(
        'O chaveiro do sistema não tem uma coleção padrão. Crie uma (no GNOME, pelo app Senhas e '
      ) + t('Chaves) e tente de novo.')
    )
  }
  const locked = await bus.getProperty(SERVICE, path as string, `${PREFIX}Collection`, 'Locked')
  if (locked) await unlock(bus, [path as string])
  return path as string
}

/** Guarda (ou troca) um segredo do Wisp no chaveiro. */
export function storeSecret(
  name: string,
  label: string,
  value: string,
  env = process.env
): Promise<void> {
  return withService(env, async (bus, session) => {
    const collection = await defaultCollection(bus)
    const secret: Secret = [session, [], [...Buffer.from(value, 'utf8')], 'text/plain']
    const [, promptPath] = await bus.call({
      destination: SERVICE,
      path: collection,
      interface: `${PREFIX}Collection`,
      member: 'CreateItem',
      signature: 'a{sv}(oayays)b',
      body: [
        {
          [`${PREFIX}Item.Label`]: new Variant('s', label),
          [`${PREFIX}Item.Attributes`]: new Variant('a{ss}', attributes(name))
        },
        secret,
        true
      ]
    })
    if (!(await prompt(bus, promptPath as string))) {
      throw new SecretError(
        t('A chave não foi guardada: o chaveiro pediu confirmação e ela não veio.')
      )
    }
  })
}

/** Apaga um segredo do Wisp do chaveiro (não ter o que apagar não é erro). */
export function deleteSecret(name: string, env = process.env): Promise<void> {
  return withService(env, async (bus) => {
    for (const item of await search(bus, name)) {
      const [promptPath] = await bus.call({
        destination: SERVICE,
        path: item,
        interface: `${PREFIX}Item`,
        member: 'Delete'
      })
      await prompt(bus, promptPath as string)
    }
  })
}
