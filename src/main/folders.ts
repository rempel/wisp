// Conversas numa pasta (Fase 15): o Claude Code roda dentro dela, como no terminal, e lê o
// CLAUDE.md, o .claude/settings.json e as skills do projeto. Esses arquivos podem rodar comandos
// sozinhos (hooks, apiKeyHelper) ou liberar ferramentas sem card (permissions.allow, o
// allowed-tools de uma skill). No terminal, o Claude Code pergunta se você confia na pasta; no
// modo -p, não. Então o Wisp pergunta: lista o que a pasta faz por conta própria e só segue com
// um clique em "Confiar". A confiança vale até esses arquivos mudarem (um git pull, por exemplo).

import { createHash } from 'crypto'
import { mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { DATA_DIR } from './paths'
import { parseFrontmatter } from './skills'
import { t } from '../shared/i18n'

export const TRUST_FILE = join(DATA_DIR, 'pastas-confiaveis.json')

/** Comandos que o Claude Code roda sozinho, se estiverem no settings do projeto. */
const COMMAND_SETTINGS = [
  'apiKeyHelper',
  'awsAuthRefresh',
  'awsCredentialExport',
  'otelHeadersHelper'
]
const SETTINGS_FILES = ['.claude/settings.json', '.claude/settings.local.json']
const MAX_FILE = 256 * 1024
const MAX_ITEMS = 40

export interface FolderRisks {
  /** O que a pasta faz por conta própria, em português, uma linha por coisa. */
  items: string[]
  /** Muda quando qualquer um dos arquivos que contam muda. */
  fingerprint: string
}

/** "~/projetos/x" no lugar da pasta pessoal. */
export function tilde(path: string, home = homedir()): string {
  return path === home ? '~' : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
}

function readSmall(path: string): string | null {
  try {
    if (statSync(path).size > MAX_FILE) return null
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

const clip = (text: string, max = 160): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text

/** O que um settings.json do projeto faz por conta própria. */
export function settingsRisks(text: string, file: string): string[] {
  let settings: Record<string, unknown>
  try {
    settings = JSON.parse(text) as Record<string, unknown>
  } catch {
    return [t('{file}: não é um JSON válido (o Claude Code pode recusar ou ignorar)', { file })]
  }
  if (!settings || typeof settings !== 'object') return []
  const out: string[] = []
  const hooks = settings.hooks as Record<string, unknown> | undefined
  if (hooks && typeof hooks === 'object') {
    for (const [event, groups] of Object.entries(hooks)) {
      for (const group of Array.isArray(groups) ? groups : []) {
        const list = (group as { hooks?: unknown })?.hooks
        for (const hook of Array.isArray(list) ? list : []) {
          const command = (hook as { command?: unknown })?.command
          if (typeof command === 'string')
            out.push(t('hook {event} roda: {v2}', { event, v2: clip(command) }))
          else out.push(t('hook {event} ({v2})', { event, v2: clip(JSON.stringify(hook), 80) }))
        }
      }
    }
  }
  for (const key of COMMAND_SETTINGS) {
    if (typeof settings[key] === 'string') out.push(`${key} roda: ${clip(settings[key] as string)}`)
  }
  const allow = (settings.permissions as { allow?: unknown } | undefined)?.allow
  if (Array.isArray(allow) && allow.length) {
    out.push(t('libera sem card: {v1}', { v1: clip(allow.map(String).join(', ')) }))
  }
  const env = settings.env
  if (env && typeof env === 'object' && Object.keys(env).length) {
    out.push(t('muda o ambiente do Claude Code: {v1}', { v1: clip(Object.keys(env).join(', ')) }))
  }
  return out.map((line) => `${file}: ${line}`)
}

/**
 * O que a pasta faz por conta própria quando o Claude Code roda nela: hooks e comandos do
 * settings do projeto, ferramentas liberadas, variáveis de ambiente e skills com allowed-tools.
 */
export function folderRisks(dir: string): FolderRisks {
  const hash = createHash('sha256')
  const items: string[] = []
  for (const file of SETTINGS_FILES) {
    const text = readSmall(join(dir, file))
    if (text === null) continue
    hash.update(`${file}\0${text}\0`)
    items.push(...settingsRisks(text, file))
  }
  let skills: string[] = []
  try {
    skills = readdirSync(join(dir, '.claude/skills')).sort()
  } catch {
    // Sem skills no projeto.
  }
  for (const name of skills) {
    const text = readSmall(join(dir, '.claude/skills', name, 'SKILL.md'))
    if (text === null) continue
    const tools = parseFrontmatter(text)['allowed-tools']
    if (!tools) continue
    hash.update(`skill:${name}\0${text}\0`)
    items.push(t('skill {name} libera sem card: {v2}', { name, v2: clip(tools) }))
  }
  return {
    items: items.length > MAX_ITEMS ? [...items.slice(0, MAX_ITEMS), t('…e mais')] : items,
    fingerprint: hash.digest('hex')
  }
}

function readTrust(file: string): Record<string, string> {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8')) as unknown
    return value && typeof value === 'object' ? (value as Record<string, string>) : {}
  } catch {
    return {}
  }
}

const key = (dir: string): string => {
  try {
    return realpathSync(dir)
  } catch {
    return dir
  }
}

/** A pasta já foi confiada, com estes mesmos arquivos? */
export function isTrusted(dir: string, fingerprint: string, file = TRUST_FILE): boolean {
  return readTrust(file)[key(dir)] === fingerprint
}

/** Guarda que a pasta é confiável, enquanto os arquivos que contam não mudarem. */
export function trustFolder(dir: string, fingerprint: string, file = TRUST_FILE): void {
  const trusted = readTrust(file)
  trusted[key(dir)] = fingerprint
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(file, JSON.stringify(trusted, null, 2), { mode: 0o600 })
}

/** Uma pasta que dá para abrir numa conversa: existe, é pasta e não é a raiz. */
export function usableFolder(path: string): string | null {
  try {
    const real = realpathSync(path)
    return real !== '/' && statSync(real).isDirectory() ? real : null
  } catch {
    return null
  }
}
