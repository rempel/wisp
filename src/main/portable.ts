// Levar o Wisp junto (Fase 31): um arquivo com as configurações, os prompts salvos, as tarefas e,
// se você quiser, o histórico das conversas. Sem segredos: a chave da OpenRouter e os tópicos do
// celular ficam no chaveiro do sistema e nunca estiveram no config.json. Importar mostra antes o
// que muda e não apaga nada: as conversas que já estão aqui ficam, e os prompts e as tarefas se
// juntam aos de agora (um com o mesmo nome, ou a mesma tarefa, é trocado).

import { createHash } from 'crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { checkSettings } from './config'
import type { WispConfig } from './config'
import { CONVERSATION_ID, HISTORY_DIR, PINS_FILE, readPins, setPinned } from './history'
import { SETTINGS_KEYS } from '../shared/ipc'
import type { PortablePreview, Settings } from '../shared/ipc'
import type { SavedPrompt, ScheduledTask } from '../shared/prompts'
import { t } from '../shared/i18n'

export const PORTABLE_KIND = 'wisp-levar'
/** Mais que isso não é um arquivo do Wisp que valha abrir (o histórico pode ser grande). */
export const MAX_PORTABLE_BYTES = 512 * 1024 * 1024

/** Os campos que mudam o que o Wisp roda ou lê na sua máquina: a prévia avisa. */
const SENSITIVE = new Set<keyof Settings>([
  'projectRoots',
  'editorCommand',
  'terminalCommand',
  'extraAllowedTools',
  'enabledMcpServers',
  'browserAutomation',
  'calendarFiles'
])

export interface PortableFile {
  tipo: typeof PORTABLE_KIND
  v: 1
  /** A versão do Wisp que exportou. */
  versao: string
  /** Quando (ISO). */
  em: string
  configuracoes: Partial<Settings>
  /** O histórico (só se você pediu): cada conversa, linha a linha, como no disco. */
  conversas?: { id: string; linhas: string[] }[]
  /** As conversas fixadas no topo. */
  fixadas?: string[]
}

/** O arquivo para levar: as configurações e, se pedido, o histórico. */
export function buildExport(
  config: WispConfig,
  version: string,
  withHistory: boolean,
  dir = HISTORY_DIR,
  pinsFile = PINS_FILE
): PortableFile {
  const configuracoes: Record<string, unknown> = {}
  for (const key of SETTINGS_KEYS) configuracoes[key] = config[key]
  const file: PortableFile = {
    tipo: PORTABLE_KIND,
    v: 1,
    versao: version,
    em: new Date().toISOString(),
    configuracoes: configuracoes as Partial<Settings>
  }
  if (!withHistory) return file
  let names: string[] = []
  try {
    names = readdirSync(dir)
  } catch {
    // Sem histórico ainda.
  }
  file.conversas = []
  for (const name of names.sort()) {
    const id = name.slice(0, -'.jsonl'.length)
    if (!name.endsWith('.jsonl') || !CONVERSATION_ID.test(id)) continue
    try {
      const linhas = readFileSync(join(dir, name), 'utf8')
        .split('\n')
        .filter((line) => line.trim())
      file.conversas.push({ id, linhas })
    } catch {
      // Sumiu ou não dá para ler: fica de fora.
    }
  }
  file.fixadas = [...readPins(pinsFile)]
  return file
}

/** A primeira linha de uma conversa é o cabeçalho dela, com o mesmo id. */
function validConversation(value: unknown): value is { id: string; linhas: string[] } {
  if (!value || typeof value !== 'object') return false
  const { id, linhas } = value as Record<string, unknown>
  if (typeof id !== 'string' || !CONVERSATION_ID.test(id)) return false
  if (!Array.isArray(linhas) || !linhas.length || !linhas.every((l) => typeof l === 'string')) {
    return false
  }
  try {
    const header = JSON.parse(linhas[0]) as Record<string, unknown>
    return header.type === 'conversa' && header.id === id && typeof header.title === 'string'
  } catch {
    return false
  }
}

/**
 * Lê e confere um arquivo exportado; uma string diz o que está errado. Campos que esta versão não
 * conhece (de uma versão mais nova) ficam de fora, e a prévia diz quais.
 */
export function parsePortable(text: string): { file: PortableFile; ignored: string[] } | string {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return t('Este arquivo não é um JSON.')
  }
  const value = json as Record<string, unknown> | null
  if (!value || typeof value !== 'object' || value.tipo !== PORTABLE_KIND) {
    return t('Este arquivo não foi exportado pelo Wisp.')
  }
  if (value.v !== 1) return t('Este arquivo é de uma versão do Wisp que esta não sabe ler.')
  const raw = value.configuracoes
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return t('O arquivo não tem as configurações.')
  }
  const known: Record<string, unknown> = {}
  const ignored: string[] = []
  for (const [key, field] of Object.entries(raw)) {
    if ((SETTINGS_KEYS as readonly string[]).includes(key)) known[key] = field
    else ignored.push(key)
  }
  const checked = checkSettings(known)
  if (!checked.ok) {
    return t('O campo {field} do arquivo não vale: {message}', {
      field: checked.field,
      message: checked.message
    })
  }
  const file: PortableFile = {
    tipo: PORTABLE_KIND,
    v: 1,
    versao: typeof value.versao === 'string' ? value.versao.slice(0, 40) : '?',
    em: typeof value.em === 'string' ? value.em.slice(0, 40) : '',
    configuracoes: checked.patch as Partial<Settings>
  }
  if (value.conversas !== undefined) {
    if (!Array.isArray(value.conversas) || !value.conversas.every(validConversation)) {
      return t('O histórico do arquivo está estragado.')
    }
    file.conversas = value.conversas
  }
  if (Array.isArray(value.fixadas)) {
    file.fixadas = value.fixadas.filter(
      (id): id is string => typeof id === 'string' && CONVERSATION_ID.test(id)
    )
  }
  return { file, ignored }
}

/** Os prompts de agora com os do arquivo: o do mesmo nome é trocado, o resto entra. */
function mergeBy<T>(current: T[], incoming: T[], key: (item: T) => string): T[] {
  const out = new Map(current.map((item) => [key(item), item]))
  for (const item of incoming) out.set(key(item), item)
  return [...out.values()]
}

/** O valor de um campo, curto, para a prévia. */
function shown(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? t('ligado') : t('desligado')
  const text = Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(', ') ||
      '—'
    : typeof value === 'string'
      ? value
      : JSON.stringify(value)
  return text.length > 120 ? `${text.slice(0, 119)}…` : text
}

/** O que importar muda: os campos, os prompts, as tarefas e as conversas. */
export function previewPortable(
  file: PortableFile,
  current: WispConfig,
  ignored: string[],
  dir = HISTORY_DIR
): Omit<PortablePreview, 'file' | 'fingerprint'> {
  const changes: PortablePreview['changes'] = []
  for (const [key, value] of Object.entries(file.configuracoes)) {
    const field = key as keyof Settings
    if (field === 'prompts' || field === 'scheduledTasks') continue
    if (JSON.stringify(current[field]) === JSON.stringify(value)) continue
    changes.push({
      key: field,
      before: shown(current[field]),
      after: shown(value),
      sensitive: SENSITIVE.has(field)
    })
  }
  const count = <T>(
    now: T[],
    incoming: T[] | undefined,
    key: (item: T) => string
  ): { added: number; replaced: number } => {
    const names = new Set(now.map(key))
    const list = incoming ?? []
    return {
      added: list.filter((item) => !names.has(key(item))).length,
      replaced: list.filter((item) => names.has(key(item))).length
    }
  }
  const conversations = file.conversas ?? []
  const present = conversations.filter((c) => existsSync(join(dir, `${c.id}.jsonl`))).length
  return {
    versao: file.versao,
    em: file.em,
    changes,
    prompts: count<SavedPrompt>(current.prompts, file.configuracoes.prompts, (p) => p.name),
    tasks: count<ScheduledTask>(
      current.scheduledTasks,
      file.configuracoes.scheduledTasks,
      (s) => s.id
    ),
    conversations: { added: conversations.length - present, present },
    ignored
  }
}

/**
 * Aplica o arquivo: grava as conversas novas (as que já estão aqui ficam como estão) e as
 * fixadas, e devolve a mudança do config.json (quem chama faz o backup e grava).
 */
export function applyPortable(
  file: PortableFile,
  current: WispConfig,
  dir = HISTORY_DIR,
  pinsFile = PINS_FILE
): { patch: Partial<WispConfig>; conversations: number } {
  const patch: Partial<WispConfig> = { ...(file.configuracoes as Partial<WispConfig>) }
  if (file.configuracoes.prompts) {
    patch.prompts = mergeBy(current.prompts, file.configuracoes.prompts, (p) => p.name)
  }
  if (file.configuracoes.scheduledTasks) {
    patch.scheduledTasks = mergeBy(
      current.scheduledTasks,
      file.configuracoes.scheduledTasks,
      (task) => task.id
    )
  }
  let written = 0
  if (file.conversas?.length) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    for (const { id, linhas } of file.conversas) {
      const target = join(dir, `${id}.jsonl`)
      if (existsSync(target)) continue
      // Só o usuário lê: as conversas podem ter qualquer coisa que passou pelo chat.
      writeFileSync(target, linhas.join('\n') + '\n', { mode: 0o600, flag: 'wx' })
      written++
    }
  }
  for (const id of file.fixadas ?? []) {
    if (existsSync(join(dir, `${id}.jsonl`))) setPinned(id, true, pinsFile)
  }
  return { patch, conversations: written }
}

/** A impressão do arquivo lido na prévia: só ele é importado com ela. */
export const fingerprintOf = (text: string): string =>
  createHash('sha256').update(text).digest('hex')
