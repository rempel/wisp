// O Wisp na busca do desktop (Fase 72): digitar "wisp " e uma pergunta na busca do KDE (o
// KRunner) ou do GNOME (a visão geral) oferece "Perguntar ao Wisp", que manda a pergunta para a
// conversa. Os dois falam D-Bus com o app aberto: o Wisp exporta a interface do KRunner
// (org.kde.krunner1) e a dos provedores de busca do GNOME (org.gnome.Shell.SearchProvider2). No
// KDE, um arquivo do Wisp na sua pasta apresenta o serviço; no GNOME, o arquivo vem no pacote
// (.deb e Flatpak), porque o GNOME só lê os provedores das pastas do sistema. Só o que começa com
// "wisp " vira pergunta: o resto do que você digita na busca não passa pelo Wisp.

import { join } from 'path'
import { homedir } from 'os'
import { DBusConnection, Variant } from './dbus'
import { APP_ID, MARKER, removeOwnFile, writeOwnFile } from './launcher'
import { t } from '../shared/i18n'

export const RUNNER_NAME = `${APP_ID}.Runner`
export const RUNNER_PATH = '/runner'
export const SEARCH_NAME = `${APP_ID}.SearchProvider`
export const SEARCH_PATH = '/io/github/rempel/Wisp/SearchProvider'
/** O maior texto de uma pergunta vinda da busca. */
const MAX_QUERY = 2000

/**
 * A pergunta de uma busca: o que vem depois de "wisp " (com pelo menos 2 letras). null: a busca
 * não é para o Wisp.
 */
export function questionOf(query: string): string | null {
  const match = /^\s*wisp[\s:,]+(.+)$/i.exec(query)
  const question = match?.[1].trim().slice(0, MAX_QUERY)
  return question && question.length >= 2 ? question : null
}

/** O arquivo que apresenta o Wisp ao KRunner (um plugin D-Bus, na pasta do usuário). */
export function krunnerFile(home = homedir()): { path: string; content: string } {
  const data = process.env.XDG_DATA_HOME || join(home, '.local', 'share')
  return {
    path: join(data, 'krunner', 'dbusplugins', 'wisp.desktop'),
    content: [
      '[Desktop Entry]',
      'Name=Wisp',
      `Comment=${t('Perguntar ao Wisp')}`,
      'X-KDE-ServiceTypes=Plasma/Runner',
      'Type=Service',
      `Icon=${APP_ID}`,
      'X-Plasma-API=DBus',
      `X-Plasma-DBusRunner-Service=${RUNNER_NAME}`,
      `X-Plasma-DBusRunner-Path=${RUNNER_PATH}`,
      MARKER,
      ''
    ].join('\n')
  }
}

export interface SearchProvider {
  dispose(): void
}

/**
 * Liga o Wisp à busca do desktop: exporta as duas interfaces e grava o arquivo do KRunner.
 * `ask`: manda a pergunta para a conversa. null: sem D-Bus de sessão.
 */
export async function startSearchProvider(
  ask: (question: string) => void,
  env: NodeJS.ProcessEnv = process.env
): Promise<SearchProvider | null> {
  const bus = await DBusConnection.session(env)
  if (!bus) return null
  const label = (question: string): string => t('Perguntar ao Wisp: {question}', { question })
  const run = (id: unknown): void => {
    const question = typeof id === 'string' ? questionOf(`wisp ${id}`) : null
    if (question) ask(question)
  }

  const unexportRunner = bus.export(RUNNER_PATH, 'org.kde.krunner1', {
    methods: {
      // (id, texto, ícone, tipo, relevância, propriedades); 100 é uma resposta exata.
      Match: {
        in: 's',
        out: 'a(sssida{sv})',
        handler: ([query]) => {
          const question = questionOf(String(query ?? ''))
          return [question ? [[question, label(question), APP_ID, 100, 1, {}]] : []]
        }
      },
      Actions: { in: '', out: 'a(sss)', handler: () => [[]] },
      Run: { in: 'ss', out: '', handler: ([id]) => run(id) }
    }
  })
  const result = (terms: unknown): string[] => {
    const words = Array.isArray(terms) ? terms.map(String) : []
    const question = questionOf(words.join(' '))
    return question ? [question] : []
  }
  const unexportSearch = bus.export(SEARCH_PATH, 'org.gnome.Shell.SearchProvider2', {
    methods: {
      GetInitialResultSet: { in: 'as', out: 'as', handler: ([terms]) => [result(terms)] },
      GetSubsearchResultSet: { in: 'asas', out: 'as', handler: ([, terms]) => [result(terms)] },
      GetResultMetas: {
        in: 'as',
        out: 'aa{sv}',
        handler: ([ids]) => [
          (Array.isArray(ids) ? ids.map(String) : []).map((id) => ({
            id: new Variant('s', id),
            name: new Variant('s', label(id)),
            description: new Variant('s', t('Manda a pergunta para a conversa do Wisp')),
            gicon: new Variant('s', APP_ID)
          }))
        ]
      },
      ActivateResult: { in: 'sasu', out: '', handler: ([id]) => run(id) },
      LaunchSearch: { in: 'asu', out: '', handler: ([terms]) => run(result(terms)[0]) }
    }
  })
  const [runner, search] = await Promise.all([
    bus.requestName(RUNNER_NAME).catch(() => false),
    bus.requestName(SEARCH_NAME).catch(() => false)
  ])
  if (!runner && !search) console.warn('[wisp] a busca do desktop: os nomes já têm dono')
  try {
    const file = krunnerFile()
    writeOwnFile(file.path, file.content)
  } catch (err) {
    console.warn('[wisp] não consegui gravar o arquivo do KRunner:', err)
  }
  return {
    dispose() {
      unexportRunner()
      unexportSearch()
      bus.close()
    }
  }
}

/** Desligada: o arquivo do KRunner sai (o que é do Wisp). */
export function removeSearchFiles(): void {
  try {
    removeOwnFile(krunnerFile().path)
  } catch {
    // Não era dele, ou não deu: fica como está.
  }
}
