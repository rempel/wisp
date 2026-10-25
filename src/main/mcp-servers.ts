// Os servidores MCP pelo Wisp (Fase 30): os do seu Claude Code (o mcpServers do ~/.claude.json)
// e os dos projetos (o .mcp.json de cada um, só para ver). Pôr ou tirar um dos seus mostra antes
// a mudança no arquivo (com os valores secretos escondidos), faz o backup datado ao lado dele e
// grava pelo próprio `claude mcp`, que cuida do arquivo como o resto do Claude Code.
//
// As conversas do Wisp rodam com --strict-mcp-config: entram o servidor do Wisp e só os seus que
// você ligou (enabledMcpServers); os dos projetos nunca. As ferramentas deles pedem permissão
// pelo card, como qualquer outra, até você liberar uma por uma.

import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { basename, isAbsolute, join } from 'path'
import { backupFile, stamp } from './backup'
import { MCP_SERVER_NAME } from './config'
import { tilde } from './folders'
import { DATA_DIR } from './paths'
import { compactHunks, lineDiff } from '../shared/diff'
import type {
  McpApplyResult,
  McpChange,
  McpPreview,
  McpServerInfo,
  McpServerInput,
  McpSnapshot
} from '../shared/ipc'
import { t } from '../shared/i18n'

/** Os nomes dos servidores do próprio Wisp: um seu com o mesmo nome não entra. */
export const RESERVED = new Set(['desktop', 'playwright'])
/** O que o Wisp lembra das ferramentas que cada servidor ofereceu na última conversa. */
export const CATALOG_FILE = join(DATA_DIR, 'mcp.json')
/** O valor de uma variável ou de um cabeçalho, na prévia e na lista. */
const HIDDEN = '•••'
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const HEADER_NAME = /^[A-Za-z0-9-]{1,100}$/

type Config = Record<string, unknown>

/** O arquivo do Claude Code com os seus servidores (respeita o CLAUDE_CONFIG_DIR). */
export function claudeJsonPath(env: NodeJS.ProcessEnv = process.env): string {
  const dir = env.CLAUDE_CONFIG_DIR
  return dir && isAbsolute(dir) ? join(dir, '.claude.json') : join(homedir(), '.claude.json')
}

const isObject = (value: unknown): value is Config =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/** O mcpServers de um arquivo JSON; vazio sem o arquivo. Um arquivo estragado é um erro. */
function serversIn(file: string): Record<string, Config> {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return {}
  }
  const json = JSON.parse(text) as unknown
  if (!isObject(json)) throw new Error(t('{file} não é um objeto JSON', { file: tilde(file) }))
  const servers = json.mcpServers
  const out: Record<string, Config> = {}
  if (isObject(servers)) {
    for (const [name, config] of Object.entries(servers)) if (isObject(config)) out[name] = config
  }
  return out
}

/** Os seus servidores, como estão no ~/.claude.json. */
export function userServers(file = claudeJsonPath()): Record<string, Config> {
  return serversIn(file)
}

function kindOf(config: Config): McpServerInfo['kind'] {
  const type = config.type
  if (typeof config.command === 'string' && (type === undefined || type === 'stdio')) {
    return 'command'
  }
  if (typeof config.url === 'string' && (type === 'http' || type === 'sse')) return 'url'
  return 'other'
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const record = (value: unknown): Record<string, string> =>
  isObject(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string'
        )
      )
    : {}

/** O comando com os argumentos (entre aspas os que têm espaço), ou o endereço. */
function summaryOf(config: Config): string {
  const kind = kindOf(config)
  if (kind === 'url') return String(config.url)
  if (kind !== 'command') return typeof config.type === 'string' ? config.type : '?'
  const quote = (part: string): string => (/[\s"']/.test(part) ? JSON.stringify(part) : part)
  return [String(config.command), ...strings(config.args)].map(quote).join(' ')
}

const secretsOf = (config: Config): string[] =>
  Object.keys(record(kindOf(config) === 'url' ? config.headers : config.env))

/** Só os campos que o Claude Code entende, para o --mcp-config de uma conversa. */
function cleanConfig(config: Config): Config | null {
  const kind = kindOf(config)
  if (kind === 'command') {
    const env = record(config.env)
    return {
      type: 'stdio',
      command: config.command,
      args: strings(config.args),
      ...(Object.keys(env).length ? { env } : {})
    }
  }
  if (kind === 'url') {
    const headers = record(config.headers)
    return {
      type: config.type,
      url: config.url,
      ...(Object.keys(headers).length ? { headers } : {})
    }
  }
  return null
}

/**
 * Os servidores que entram nas conversas do Wisp: os seus que estão ligados, menos os que têm o
 * nome de um do Wisp ou um formato que ele não conhece. Lidos a cada conversa nova.
 */
export function wispServers(enabled: string[], file = claudeJsonPath()): Record<string, Config> {
  if (!enabled.length) return {}
  let servers: Record<string, Config>
  try {
    servers = userServers(file)
  } catch (err) {
    console.warn(`[wisp] não consegui ler os servidores MCP: ${(err as Error).message}`)
    return {}
  }
  const out: Record<string, Config> = {}
  for (const name of enabled) {
    if (RESERVED.has(name) || !servers[name]) continue
    const config = cleanConfig(servers[name])
    if (config) out[name] = config
  }
  return out
}

/** As ferramentas e o estado de cada servidor, da última conversa em que ele entrou. */
interface Seen {
  status: string
  tools: string[]
  at: number
}

function readCatalog(file = CATALOG_FILE): Record<string, Seen> {
  try {
    const json = JSON.parse(readFileSync(file, 'utf8')) as unknown
    return isObject(json) ? (json as Record<string, Seen>) : {}
  } catch {
    return {}
  }
}

/**
 * O início de uma conversa (o init do Claude Code): os servidores que entraram, se conectaram, e
 * as ferramentas de cada um. Os do Wisp ficam de fora.
 */
export function recordMcpInit(servers: unknown, tools: unknown, file = CATALOG_FILE): void {
  if (!Array.isArray(servers)) return
  const names = strings(tools)
  const catalog = readCatalog(file)
  let changed = false
  for (const server of servers) {
    if (!isObject(server) || typeof server.name !== 'string') continue
    const name = server.name
    if (RESERVED.has(name) || !MCP_SERVER_NAME.test(name)) continue
    const prefix = `mcp__${name}__`
    const own = names
      .filter((tool) => tool.startsWith(prefix))
      .map((tool) => tool.slice(prefix.length))
      .sort()
      .slice(0, 200)
    const status = typeof server.status === 'string' ? server.status.slice(0, 40) : '?'
    const before = catalog[name]
    if (before?.status === status && JSON.stringify(before.tools) === JSON.stringify(own)) continue
    catalog[name] = { status, tools: own, at: Date.now() }
    changed = true
  }
  if (!changed) return
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    const temp = `${file}.tmp`
    writeFileSync(temp, JSON.stringify(catalog), { mode: 0o600 })
    renameSync(temp, file)
  } catch (err) {
    console.warn(`[wisp] não consegui guardar as ferramentas dos servidores MCP: ${err}`)
  }
}

/** Os seus servidores e os dos projetos, para as configurações. */
export function mcpSnapshot(
  enabled: string[],
  projects: { nome: string; caminho: string }[],
  file = claudeJsonPath(),
  catalogFile = CATALOG_FILE
): McpSnapshot {
  const catalog = readCatalog(catalogFile)
  const info = (name: string, config: Config, extra: Partial<McpServerInfo>): McpServerInfo => ({
    name,
    scope: 'user',
    kind: kindOf(config),
    summary: summaryOf(config),
    secrets: secretsOf(config),
    enabled: false,
    ...extra
  })
  const servers: McpServerInfo[] = []
  let problem: string | undefined
  try {
    for (const [name, config] of Object.entries(userServers(file))) {
      const seen = catalog[name]
      servers.push(
        info(name, config, {
          enabled: enabled.includes(name) && !RESERVED.has(name),
          ...(RESERVED.has(name) ? { reserved: true } : {}),
          ...(seen ? { status: seen.status, tools: seen.tools } : {})
        })
      )
    }
  } catch (err) {
    problem = (err as Error).message
  }
  for (const project of projects) {
    try {
      for (const [name, config] of Object.entries(serversIn(join(project.caminho, '.mcp.json')))) {
        servers.push(info(name, config, { scope: 'project', project: basename(project.caminho) }))
      }
    } catch {
      // Um .mcp.json estragado num projeto: fica de fora da lista.
    }
  }
  return { configPath: tilde(file), servers, ...(problem ? { problem } : {}) }
}

/** Um servidor novo vindo da página, conferido; uma string diz o que está errado. */
export function checkServerInput(value: unknown): McpServerInput | string {
  if (!isObject(value)) return t('pedido inválido')
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!MCP_SERVER_NAME.test(name)) {
    return t('O nome começa com uma letra ou um número e só tem letras, números, - e _.')
  }
  if (RESERVED.has(name))
    return t('"{name}" é o nome de um servidor do Wisp: escolha outro.', { name })
  if (value.kind === 'command') {
    const command = typeof value.command === 'string' ? value.command.trim() : ''
    if (!command || command.length > 500) return t('Diga o comando que sobe o servidor.')
    const args = strings(value.args)
    if (args.length > 50 || args.some((arg) => arg.length > 1000)) {
      return t('Argumentos demais ou longos demais.')
    }
    const env = record(value.env)
    if (Object.keys(env).some((key) => !ENV_NAME.test(key))) {
      return t('O nome de uma variável só tem letras, números e _ (e não começa com número).')
    }
    return { kind: 'command', name, command, args, env }
  }
  if (value.kind === 'url') {
    const url = typeof value.url === 'string' ? value.url.trim() : ''
    let parsed: URL | null = null
    try {
      parsed = new URL(url)
    } catch {
      // Fica null.
    }
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || url.length > 2000) {
      return t('O endereço começa com https:// (ou http://).')
    }
    const headers = record(value.headers)
    if (Object.keys(headers).some((key) => !HEADER_NAME.test(key))) {
      return t('O nome de um cabeçalho só tem letras, números e -.')
    }
    return { kind: 'url', name, url, headers }
  }
  return t('pedido inválido')
}

/** Uma mudança vinda da página, conferida; uma string diz o que está errado. */
export function checkChange(value: unknown): McpChange | string {
  if (!isObject(value)) return t('pedido inválido')
  if (value.action === 'remove') {
    const name = typeof value.name === 'string' ? value.name : ''
    return MCP_SERVER_NAME.test(name) ? { action: 'remove', name } : t('pedido inválido')
  }
  if (value.action !== 'add') return t('pedido inválido')
  const server = checkServerInput(value.server)
  return typeof server === 'string' ? server : { action: 'add', server }
}

/** O servidor como o Claude Code o grava. */
export function serverConfig(server: McpServerInput): Config {
  if (server.kind === 'command') {
    return {
      type: 'stdio',
      command: server.command,
      args: server.args,
      ...(Object.keys(server.env).length ? { env: server.env } : {})
    }
  }
  return {
    type: 'http',
    url: server.url,
    ...(Object.keys(server.headers).length ? { headers: server.headers } : {})
  }
}

/** Os valores das variáveis e dos cabeçalhos escondidos (a prévia não mostra segredo). */
function masked(servers: Record<string, Config>): Record<string, Config> {
  const hide = (value: unknown): unknown =>
    isObject(value) ? Object.fromEntries(Object.keys(value).map((key) => [key, HIDDEN])) : value
  return Object.fromEntries(
    Object.entries(servers).map(([name, config]) => [
      name,
      {
        ...config,
        ...('env' in config ? { env: hide(config.env) } : {}),
        ...('headers' in config ? { headers: hide(config.headers) } : {})
      }
    ])
  )
}

const nameOf = (change: McpChange): string =>
  change.action === 'add' ? change.server.name : change.name

/** A impressão do servidor da mudança como ele está agora (null: não existe). */
const fingerprintOf = (servers: Record<string, Config>, name: string): string =>
  createHash('sha256')
    .update(JSON.stringify(servers[name] ?? null))
    .digest('hex')

/**
 * O que a mudança faz no mcpServers do arquivo: o diff (com os segredos escondidos), o backup que
 * vai ser feito e a impressão do servidor, para gravar só o que você viu.
 */
export function previewMcp(
  change: McpChange,
  file = claudeJsonPath()
): McpPreview | { error: string } {
  let servers: Record<string, Config>
  try {
    servers = userServers(file)
  } catch (err) {
    return { error: (err as Error).message }
  }
  const name = nameOf(change)
  if (change.action === 'add' && servers[name]) {
    return {
      error: t(
        'Já existe um servidor "{name}" no seu Claude Code: tire esse antes ou use outro nome.',
        {
          name
        }
      )
    }
  }
  if (change.action === 'remove' && !servers[name]) {
    return { error: t('O servidor "{name}" não está mais no seu Claude Code.', { name }) }
  }
  const after = { ...servers }
  if (change.action === 'add') after[name] = serverConfig(change.server)
  else delete after[name]
  const show = (value: Record<string, Config>): string =>
    JSON.stringify({ mcpServers: masked(value) }, null, 2) + '\n'
  return {
    change,
    configPath: tilde(file),
    backupPath: existsSync(file) ? tilde(`${file}.backup-wisp-${stamp()}`) : null,
    diff: compactHunks(lineDiff(show(servers), show(after))),
    fingerprint: fingerprintOf(servers, name)
  }
}

/** Roda o `claude` com esses argumentos: deu certo, e o que ele disse. */
export type ClaudeRunner = (args: string[]) => Promise<{ ok: boolean; output: string }>

/**
 * Grava a mudança que você viu: confere que o servidor continua como na prévia, faz o backup do
 * arquivo e pede ao `claude mcp` (escopo do usuário); depois confere que o arquivo mudou.
 */
export async function applyMcp(
  change: McpChange,
  fingerprint: string,
  run: ClaudeRunner,
  file = claudeJsonPath()
): Promise<McpApplyResult> {
  const name = nameOf(change)
  let backup: string | null = null
  try {
    if (fingerprintOf(userServers(file), name) !== fingerprint) {
      return {
        ok: false,
        message: t('O servidor "{name}" mudou desde a prévia: veja a mudança de novo.', { name })
      }
    }
    if (existsSync(file)) backup = backupFile(file, `${file}.backup-wisp-${stamp()}`)
  } catch (err) {
    return { ok: false, message: (err as Error).message }
  }
  const args =
    change.action === 'add'
      ? ['mcp', 'add-json', '--scope', 'user', name, JSON.stringify(serverConfig(change.server))]
      : ['mcp', 'remove', '--scope', 'user', name]
  const result = await run(args)
  let present: boolean
  try {
    present = !!userServers(file)[name]
  } catch (err) {
    return { ok: false, message: (err as Error).message }
  }
  if (result.ok && present === (change.action === 'add')) {
    return { ok: true, backupPath: backup && tilde(backup) }
  }
  const said = result.output.trim().split('\n').at(-1)?.slice(0, 300)
  return {
    ok: false,
    message: said
      ? t('O Claude Code não gravou a mudança: {said}', { said })
      : t('O Claude Code não gravou a mudança.')
  }
}
