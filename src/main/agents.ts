// Os subagentes do Claude Code pelo Wisp (Fase 50): listar, criar, editar e apagar os arquivos
// `.md` de `~/.claude/agents` (os pessoais) e de `<projeto>/.claude/agents` (os do projeto da
// conversa). Como em todo arquivo de configuração do usuário: a prévia mostra o diff antes, o
// arquivo velho ganha um backup ao lado (`<nome>.md.backup-wisp-<data>`, que o Claude Code não
// lê) e gravar só vale se o arquivo ainda estiver como na prévia. Apagar manda para a lixeira.

import { ipcMain, shell } from 'electron'
import type { WebContents } from 'electron'
import { createHash } from 'crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { backupFile, stamp } from './backup'
import { expandHome } from './paths'
import { claudeConfigDir, parseFrontmatter } from './skills'
import { wholeFileDiff } from '../shared/diff'
import { IPC } from '../shared/ipc'
import type { AgentInfo, AgentPreview, AgentResult, AgentScope, AgentSpec } from '../shared/ipc'
import { t } from '../shared/i18n'

/** O nome de um subagente: o que o Claude Code aceita (minúsculas, números e hífens). */
export const AGENT_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/
/** Os modelos do cabeçalho (sem um, o subagente usa o da conversa). */
export const AGENT_MODELS = ['sonnet', 'opus', 'haiku', 'fable', 'inherit'] as const
const MAX_PROMPT = 50_000
const MAX_DESCRIPTION = 1000
const TOOL_NAME = /^[A-Za-z_][\w*().:-]{0,80}$/

/** A pasta dos subagentes de cada lado (null: a conversa não está num projeto). */
export function agentsDir(
  scope: AgentScope,
  folder: string | null,
  configDir = claudeConfigDir()
): string | null {
  if (scope === 'personal') return join(configDir, 'agents')
  if (!folder) return null
  const root = expandHome(folder)
  try {
    if (!statSync(root).isDirectory()) return null
  } catch {
    return null
  }
  return join(root, '.claude', 'agents')
}

/** O texto depois do cabeçalho (o prompt do subagente). */
const bodyOf = (text: string): string => text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()

/** Os subagentes dos dois lados (os do projeto primeiro, que valem por cima dos pessoais). */
export function listAgents(folder: string | null, configDir = claudeConfigDir()): AgentInfo[] {
  const out: AgentInfo[] = []
  for (const scope of ['project', 'personal'] as const) {
    const dir = agentsDir(scope, folder, configDir)
    if (!dir) continue
    let names: string[]
    try {
      names = readdirSync(dir).filter((name) => name.endsWith('.md'))
    } catch {
      continue
    }
    for (const file of names.sort()) {
      const path = join(dir, file)
      try {
        const text = readFileSync(path, 'utf8')
        const head = parseFrontmatter(text)
        out.push({
          name: head.name || file.slice(0, -3),
          file: file.slice(0, -3),
          scope,
          path,
          description: head.description ?? '',
          ...(head.model ? { model: head.model } : {}),
          ...(head.tools ? { tools: head.tools } : {}),
          prompt: bodyOf(text)
        })
      } catch {
        // Um arquivo que não dá para ler fica de fora.
      }
    }
  }
  return out
}

/** Um valor do YAML numa linha só, entre aspas quando precisa. */
function yamlValue(value: string): string {
  const line = value.replace(/\s+/g, ' ').trim()
  if (/^[\w ,.()/-]*$/.test(line) && !/^[\s-]/.test(line)) return line
  // Entre aspas simples, que no YAML não têm escapes (a aspa simples de dentro vira duas).
  return `'${line.replace(/'/g, "''")}'`
}

/** Confere o que veio do formulário; devolve o motivo, se não vale. */
export function checkAgent(spec: AgentSpec): string | null {
  if (!AGENT_NAME.test(spec.name)) {
    return t('O nome: só minúsculas, números e hífens (ex.: revisor-de-codigo).')
  }
  if (!spec.description.trim()) return t('Diga quando o Claude deve usar este subagente.')
  if (spec.description.length > MAX_DESCRIPTION) return t('A descrição está longa demais.')
  if (!spec.prompt.trim()) return t('Escreva o prompt do subagente.')
  if (spec.prompt.length > MAX_PROMPT) return t('O prompt está longo demais.')
  if (spec.model && !(AGENT_MODELS as readonly string[]).includes(spec.model)) {
    return t('Modelo desconhecido.')
  }
  const tools = toolList(spec.tools)
  if (tools.some((tool) => !TOOL_NAME.test(tool)))
    return t('Uma das ferramentas tem um nome inválido.')
  return null
}

const toolList = (tools: string): string[] =>
  tools
    .split(',')
    .map((tool) => tool.trim())
    .filter(Boolean)

/** O arquivo do subagente: o cabeçalho que o Claude Code lê e o prompt. */
export function renderAgent(spec: AgentSpec): string {
  const tools = toolList(spec.tools)
  const lines = [
    '---',
    `name: ${spec.name}`,
    `description: ${yamlValue(spec.description)}`,
    ...(tools.length ? [`tools: ${tools.join(', ')}`] : []),
    ...(spec.model ? [`model: ${spec.model}`] : []),
    '---',
    '',
    spec.prompt.trim(),
    ''
  ]
  return lines.join('\n')
}

const fingerprintOf = (text: string | null): string =>
  text === null ? 'novo' : createHash('sha256').update(text).digest('hex').slice(0, 16)

function current(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/** O que gravar o subagente muda (o diff do arquivo), antes de gravar. */
export function previewAgent(
  spec: AgentSpec,
  folder: string | null,
  configDir = claudeConfigDir()
): AgentPreview | { error: string } {
  const problem = checkAgent(spec)
  if (problem) return { error: problem }
  const dir = agentsDir(spec.scope, folder, configDir)
  if (!dir) return { error: t('Esta conversa não está numa pasta de projeto.') }
  const path = join(dir, `${spec.name}.md`)
  const before = current(path)
  const after = renderAgent(spec)
  return {
    path,
    exists: before !== null,
    diff: wholeFileDiff(before ?? '', after),
    fingerprint: fingerprintOf(before),
    unchanged: before === after
  }
}

/** Grava o subagente, se o arquivo ainda estiver como na prévia (com o backup do velho). */
export function saveAgent(
  spec: AgentSpec,
  folder: string | null,
  fingerprint: string,
  configDir = claudeConfigDir()
): AgentResult {
  const preview = previewAgent(spec, folder, configDir)
  if ('error' in preview) return { ok: false, message: preview.error }
  if (preview.fingerprint !== fingerprint) {
    return { ok: false, message: t('O arquivo mudou depois da prévia: veja o que muda de novo.') }
  }
  try {
    mkdirSync(join(preview.path, '..'), { recursive: true })
    const backup = existsSync(preview.path)
      ? backupFile(preview.path, `${preview.path}.backup-wisp-${stamp()}`)
      : null
    const temp = `${preview.path}.wisp-tmp`
    writeFileSync(temp, renderAgent(spec), { mode: 0o644 })
    renameSync(temp, preview.path)
    return {
      ok: true,
      message: backup
        ? t('Gravado. O arquivo de antes ficou em {backup}.', { backup })
        : t('Criado. O Claude Code o usa nas conversas novas (Ctrl+K).')
    }
  } catch (err) {
    return {
      ok: false,
      message: t('Não consegui gravar: {message}', { message: (err as Error).message })
    }
  }
}

const validSpec = (value: unknown): value is AgentSpec => {
  if (!value || typeof value !== 'object') return false
  const spec = value as Record<string, unknown>
  return (
    (spec.scope === 'personal' || spec.scope === 'project') &&
    ['name', 'description', 'prompt', 'tools', 'model'].every(
      (key) => typeof spec[key] === 'string'
    )
  )
}

const folderOf = (folder: unknown): string | null =>
  typeof folder === 'string' && folder ? folder : null

/** O IPC dos subagentes: só o painel pede. */
export function setupAgentsIpc(isSender: (sender: WebContents) => boolean): void {
  ipcMain.handle(IPC.agentsList, (event, folder: unknown): AgentInfo[] =>
    isSender(event.sender) ? listAgents(folderOf(folder)) : []
  )
  ipcMain.handle(IPC.agentsPreview, (event, spec: unknown, folder: unknown) => {
    if (!isSender(event.sender) || !validSpec(spec)) return { error: t('pedido inválido') }
    return previewAgent(spec, folderOf(folder))
  })
  ipcMain.handle(
    IPC.agentsSave,
    (event, spec: unknown, folder: unknown, fingerprint: unknown): AgentResult => {
      if (!isSender(event.sender) || !validSpec(spec) || typeof fingerprint !== 'string') {
        return { ok: false, message: t('pedido inválido') }
      }
      return saveAgent(spec, folderOf(folder), fingerprint)
    }
  )
  ipcMain.handle(
    IPC.agentsRemove,
    async (event, scope: unknown, file: unknown, folder: unknown): Promise<AgentResult> => {
      if (!isSender(event.sender) || (scope !== 'personal' && scope !== 'project')) {
        return { ok: false, message: t('pedido inválido') }
      }
      if (typeof file !== 'string' || !AGENT_NAME.test(file)) {
        return { ok: false, message: t('pedido inválido') }
      }
      const agent = listAgents(folderOf(folder)).find(
        (item) => item.scope === scope && item.file === file
      )
      if (!agent) return { ok: false, message: t('Esse subagente não existe mais.') }
      try {
        await shell.trashItem(agent.path)
      } catch (err) {
        return {
          ok: false,
          message: t('Não consegui mandar para a lixeira: {message}', {
            message: (err as Error).message
          })
        }
      }
      return { ok: true, message: t('"{name}" foi para a lixeira.', { name: agent.name }) }
    }
  )
}
