// Um Secret Service (org.freedesktop.secrets) de mentira, para os testes do chaveiro: guarda os
// itens na memória, começa trancado (ou não) e destranca pela "janela de senha" (o Prompt), que
// responde sozinha um pouco depois. Usado pelo test/secrets.test.ts e, montado pelo esbuild, como
// processo à parte nos testes de ponta a ponta (fake-secret-service.ts).
import { DBusConnection, Variant } from '../../src/main/dbus'

const P = 'org.freedesktop.Secret.'
export const COLLECTION = '/org/freedesktop/secrets/collection/login'
const PROMPT = '/org/freedesktop/secrets/prompt/1'

export interface SecretItem {
  attributes: Record<string, string>
  label: string
  value: Buffer
}

export interface SecretState {
  items: Map<string, SecretItem>
  locked: boolean
  /** Quantas vezes a janela de senha apareceu. */
  prompts: number
  /** O que a pessoa faz na janela de senha. */
  answer: 'ok' | 'dismiss'
  /** Chamado a cada mudança (o processo à parte grava o estado num arquivo). */
  changed?: () => void
}

const matches = (item: SecretItem, wanted: Record<string, string>): boolean =>
  Object.entries(wanted).every(([key, value]) => item.attributes[key] === value)

/** Responde como o Secret Service nesta conexão (que precisa ter o nome org.freedesktop.secrets). */
export function serveSecrets(bus: DBusConnection, state: SecretState): void {
  let seq = 0
  const changed = (): void => state.changed?.()
  bus.export('/org/freedesktop/secrets', `${P}Service`, {
    methods: {
      OpenSession: {
        in: 'sv',
        out: 'vo',
        handler: ([algorithm]) => {
          if (algorithm !== 'plain') throw new Error('só plain')
          return [new Variant('s', ''), '/org/freedesktop/secrets/session/1']
        }
      },
      SearchItems: {
        in: 'a{ss}',
        out: 'aoao',
        handler: ([wanted]) => {
          const paths = [...state.items]
            .filter(([, item]) => matches(item, wanted as Record<string, string>))
            .map(([path]) => path)
          return state.locked ? [[], paths] : [paths, []]
        }
      },
      Unlock: {
        in: 'ao',
        out: 'aoo',
        handler: () => (state.locked ? [[], PROMPT] : [[COLLECTION], '/'])
      },
      GetSecrets: {
        in: 'aoo',
        out: 'a{o(oayays)}',
        handler: ([paths, session]) => {
          if (state.locked) throw new Error('trancado')
          return [
            Object.fromEntries(
              (paths as string[]).map((path) => [
                path,
                [session, [], [...(state.items.get(path)?.value ?? [])], 'text/plain']
              ])
            )
          ]
        }
      },
      ReadAlias: {
        in: 's',
        out: 'o',
        handler: ([name]) => [name === 'default' ? COLLECTION : '/']
      }
    }
  })
  bus.export('/org/freedesktop/secrets/session/1', `${P}Session`, {
    methods: { Close: { handler: () => [] } }
  })
  bus.export(COLLECTION, `${P}Collection`, {
    properties: { Locked: { type: 'b', get: () => state.locked } },
    methods: {
      CreateItem: {
        in: 'a{sv}(oayays)b',
        out: 'oo',
        handler: ([props, secret, replace]) => {
          if (state.locked) throw new Error('trancado')
          const p = props as Record<string, Variant>
          const attributes = p[`${P}Item.Attributes`].value as Record<string, string>
          const existing = [...state.items].find(([, item]) => matches(item, attributes))
          const path = existing && replace ? existing[0] : `${COLLECTION}/${++seq}`
          const value = Buffer.from((secret as [string, number[], number[], string])[2])
          state.items.set(path, { attributes, label: p[`${P}Item.Label`].value as string, value })
          bus.export(path, `${P}Item`, {
            methods: {
              Delete: {
                out: 'o',
                handler: () => {
                  state.items.delete(path)
                  changed()
                  return ['/']
                }
              }
            }
          })
          changed()
          return [path, '/']
        }
      }
    }
  })
  bus.export(PROMPT, `${P}Prompt`, {
    methods: {
      Prompt: {
        in: 's',
        handler: () => {
          state.prompts++
          // A pessoa digita a senha (ou fecha a janela) um pouco depois.
          setTimeout(() => {
            const dismissed = state.answer === 'dismiss'
            if (!dismissed) state.locked = false
            bus.emitSignal(PROMPT, `${P}Prompt`, 'Completed', 'bv', [
              dismissed,
              new Variant('ao', dismissed ? [] : [COLLECTION])
            ])
            changed()
          }, 30)
          return []
        }
      }
    }
  })
}
