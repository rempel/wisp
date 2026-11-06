// As skills do Claude Code (Fase 15): as pessoais (~/.claude/skills/<nome>/SKILL.md) e as dos
// plugins instalados (~/.claude/plugins/installed_plugins.json). O Wisp lista, instala uma de uma
// pasta (cópia, nunca por cima de outra) e manda uma para a lixeira. Quem carrega e usa as skills
// é o próprio Claude Code.

import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync
} from 'fs'
import { homedir } from 'os'
import { join, relative } from 'path'
import type { SkillInfo } from '../shared/ipc'
import { t } from '../shared/i18n'

/** A pasta de configuração do Claude Code da assinatura. */
export function claudeConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
}

/** O nome de uma skill: o que o Claude Code aceita como nome de pasta e no /comando. */
export const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/
const MAX_FILES = 300
const MAX_BYTES = 20 * 1024 * 1024

/**
 * O cabeçalho YAML de um SKILL.md, só o que interessa: chaves simples, com o valor na mesma linha
 * (com ou sem aspas) ou em linhas seguintes (`>` e `|`, ou recuadas).
 */
export function parseFrontmatter(text: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!match) return {}
  const out: Record<string, string> = {}
  const lines = match[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const field = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[i])
    if (!field) continue
    let value = field[2].trim()
    if (value === '' || value === '>' || value === '|' || value === '>-' || value === '|-') {
      const parts: string[] = []
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) parts.push(lines[++i].trim())
      // Uma lista ("- Bash") vira "Bash, Edit".
      value = parts
        .map((part) => part.replace(/^-\s+/, ''))
        .join(parts[0]?.startsWith('-') ? ', ' : ' ')
    }
    if (/^'.*'$/.test(value)) value = value.slice(1, -1).replace(/''/g, "'")
    else if (/^".*"$/.test(value)) value = value.slice(1, -1)
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((part) => part.trim().replace(/^["']|["']$/g, ''))
        .join(', ')
    }
    out[field[1]] = value
  }
  return out
}

/** Uma skill de uma pasta (com o SKILL.md); null se não for uma. */
export function readSkill(
  dir: string,
  origin: SkillInfo['origin'],
  plugin?: string
): SkillInfo | null {
  let text: string
  try {
    if (statSync(join(dir, 'SKILL.md')).size > 512 * 1024) return null
    text = readFileSync(join(dir, 'SKILL.md'), 'utf8')
  } catch {
    return null
  }
  const meta = parseFrontmatter(text)
  const name = meta.name || dir.split('/').pop() || ''
  if (!name) return null
  return {
    name: name.slice(0, 64),
    description: (meta.description ?? '').slice(0, 400),
    origin,
    ...(plugin ? { plugin } : {}),
    ...(meta['allowed-tools'] ? { allowedTools: meta['allowed-tools'].slice(0, 200) } : {}),
    path: dir
  }
}

function skillsIn(dir: string, origin: SkillInfo['origin'], plugin?: string): SkillInfo[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names
    .filter((name) => !name.startsWith('.'))
    .flatMap((name) => {
      const skill = readSkill(join(dir, name), origin, plugin)
      return skill ? [skill] : []
    })
}

/** As pastas dos plugins instalados (installed_plugins.json, nas versões 1 e 2). */
export function pluginDirs(configDir: string): { name: string; path: string }[] {
  let data: unknown
  try {
    data = JSON.parse(readFileSync(join(configDir, 'plugins', 'installed_plugins.json'), 'utf8'))
  } catch {
    return []
  }
  const plugins = (data as { plugins?: unknown } | null)?.plugins
  if (!plugins || typeof plugins !== 'object') return []
  const out: { name: string; path: string }[] = []
  for (const [id, entry] of Object.entries(plugins as Record<string, unknown>)) {
    for (const install of Array.isArray(entry) ? entry : [entry]) {
      const path = (install as { installPath?: unknown } | null)?.installPath
      if (typeof path === 'string' && path.startsWith('/'))
        out.push({ name: id.split('@')[0], path })
    }
  }
  return out
}

/** As skills que o Claude Code da assinatura enxerga: as pessoais e as dos plugins. */
export function listSkills(configDir = claudeConfigDir()): SkillInfo[] {
  const personal = skillsIn(join(configDir, 'skills'), 'personal')
  const plugins = pluginDirs(configDir).flatMap(({ name, path }) =>
    skillsIn(join(path, 'skills'), 'plugin', name)
  )
  return [...personal, ...plugins].sort(
    (a, b) => a.origin.localeCompare(b.origin) || a.name.localeCompare(b.name)
  )
}

/** Os arquivos de uma pasta de skill, conferidos: sem links, sem .git, dentro dos limites. */
function filesOf(dir: string): string[] {
  const out: string[] = []
  let bytes = 0
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      if (name === '.git' || name === 'node_modules') continue
      const path = join(current, name)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink())
        throw new Error(t('{v1} é um link; copie a pasta sem links', { v1: relative(dir, path) }))
      if (stat.isDirectory()) walk(path)
      else if (stat.isFile()) {
        out.push(path)
        bytes += stat.size
        if (out.length > MAX_FILES)
          throw new Error(t('a pasta tem mais de {MAX_FILES} arquivos', { MAX_FILES }))
        if (bytes > MAX_BYTES) throw new Error(t('a pasta passa de 20 MB'))
      }
    }
  }
  walk(dir)
  return out
}

/** O que seria instalado de uma pasta: a skill e quantos arquivos; lança o motivo se não der. */
export function inspectSkill(
  dir: string,
  configDir = claudeConfigDir()
): SkillInfo & { files: number } {
  const skill = readSkill(dir, 'personal')
  if (!skill) throw new Error(t('Essa pasta não tem um SKILL.md.'))
  if (!SKILL_NAME.test(skill.name)) {
    throw new Error(
      t('O nome "{name}" não serve: só letras minúsculas, números e hífen.', { name: skill.name })
    )
  }
  if (existsSync(join(configDir, 'skills', skill.name))) {
    throw new Error(t('Já existe uma skill "{name}". Remova a outra antes.', { name: skill.name }))
  }
  let files: string[]
  try {
    files = filesOf(dir)
  } catch (err) {
    throw new Error(t('Não dá para instalar: {message}.', { message: (err as Error).message }), {
      cause: err
    })
  }
  return { ...skill, files: files.length }
}

/** Copia a skill para ~/.claude/skills/<nome> (nunca por cima de outra). Devolve o destino. */
export function installSkill(dir: string, configDir = claudeConfigDir()): string {
  const skill = inspectSkill(dir, configDir)
  const target = join(configDir, 'skills', skill.name)
  mkdirSync(join(configDir, 'skills'), { recursive: true })
  for (const file of filesOf(dir)) {
    const to = join(target, relative(dir, file))
    mkdirSync(join(to, '..'), { recursive: true })
    copyFileSync(file, to)
  }
  return target
}
