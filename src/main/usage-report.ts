// O painel de uso (Fase 49): os tokens (entrada, saída e cache) e o custo estimado por dia, por
// projeto e por modelo, lidos dos .jsonl que o próprio Claude Code grava na sua máquina
// (~/.claude/projects e, pela OpenRouter, a pasta dele no Wisp). Sem rede: os preços são os da
// tabela abaixo (os da API da Anthropic, por milhão de tokens), e o custo é o que essas
// respostas custariam pela API: numa assinatura, você não paga por token. Só quando o painel
// pede; cada arquivo lido fica guardado pelo tamanho e pela data, e só os dos últimos dias entram.

import { createReadStream, readdirSync, statSync } from 'fs'
import { basename, join } from 'path'
import { createInterface } from 'readline'
import { app, ipcMain } from 'electron'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { writeFile } from 'fs/promises'
import { OPENROUTER_CONFIG_DIR } from './openrouter'
import { pickSaveFile } from './pick'
import { claudeConfigDir } from './skills'
import { tilde } from './folders'
import { IPC } from '../shared/ipc'
import type { ExportResult, UsageReport, UsageRow } from '../shared/ipc'
import { t } from '../shared/i18n'

/** Os preços de um modelo, em dólares por milhão de tokens (a escrita do cache sai da entrada). */
interface Price {
  input: number
  output: number
  cacheRead: number
}

/**
 * Os preços da API (novembro de 2026), do id mais específico para o mais geral: o primeiro
 * prefixo que bate vale (um id com data, "claude-sonnet-4-5-20250929", cai no "claude-sonnet-4-5").
 */
export const PRICES: [string, Price][] = [
  ['claude-fable-5-1', { input: 10, output: 50, cacheRead: 0.25 }],
  ['claude-mythos-5-1', { input: 10, output: 50, cacheRead: 0.25 }],
  ['claude-fable-5', { input: 10, output: 50, cacheRead: 1 }],
  ['claude-mythos-5', { input: 10, output: 50, cacheRead: 1 }],
  ['claude-opus-5-5', { input: 4, output: 20, cacheRead: 0.2 }],
  ['claude-opus-5', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-8', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-7', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-6', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-5', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4', { input: 15, output: 75, cacheRead: 1.5 }],
  ['claude-sonnet-5-5', { input: 2, output: 10, cacheRead: 0.2 }],
  ['claude-sonnet-5', { input: 2, output: 10, cacheRead: 0.2 }],
  ['claude-sonnet-4', { input: 3, output: 15, cacheRead: 0.3 }],
  ['claude-3-7-sonnet', { input: 3, output: 15, cacheRead: 0.3 }],
  ['claude-haiku-5-5', { input: 0.1, output: 0.5, cacheRead: 0.01 }],
  ['claude-haiku-4-5', { input: 1, output: 5, cacheRead: 0.1 }],
  ['claude-3-5-haiku', { input: 0.8, output: 4, cacheRead: 0.08 }]
]

export function priceOf(model: string): Price | null {
  const id = model.toLowerCase()
  return PRICES.find(([prefix]) => id === prefix || id.startsWith(`${prefix}-`))?.[1] ?? null
}

/** Os tokens de uma resposta, como o Claude Code grava no `usage`. */
export interface Tokens {
  input: number
  output: number
  /** Escrita do cache: a de 5 minutos e a de 1 hora (cada uma com o seu preço). */
  cacheWrite5m: number
  cacheWrite1h: number
  cacheRead: number
}

/** O custo estimado, em dólares (null: modelo sem preço na tabela). */
export function costOf(model: string, tokens: Tokens): number | null {
  const price = priceOf(model)
  if (!price) return null
  return (
    (tokens.input * price.input +
      tokens.output * price.output +
      tokens.cacheWrite5m * price.input * 1.25 +
      tokens.cacheWrite1h * price.input * 2 +
      tokens.cacheRead * price.cacheRead) /
    1_000_000
  )
}

const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0

/** O dia local de um horário ISO (AAAA-MM-DD). */
export function localDay(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Uma resposta lida de uma linha do .jsonl (null: a linha não é de uma resposta com uso). */
export function parseUsageLine(
  line: string
): { key: string; day: string; project: string; model: string; tokens: Tokens } | null {
  if (!line.includes('"usage"')) return null
  let entry: Record<string, unknown>
  try {
    entry = JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
  const message = entry.message as Record<string, unknown> | undefined
  const usage = message?.usage as Record<string, unknown> | undefined
  const model = typeof message?.model === 'string' ? message.model : ''
  if (entry.type !== 'assistant' || !usage || !model || model === '<synthetic>') return null
  const day = typeof entry.timestamp === 'string' ? localDay(entry.timestamp) : null
  if (!day) return null
  const write = num(usage.cache_creation_input_tokens)
  const split = usage.cache_creation as Record<string, unknown> | undefined
  const write1h = Math.min(write, num(split?.ephemeral_1h_input_tokens))
  // O Claude Code grava uma linha por bloco da mesma resposta, com o mesmo uso: conta uma vez.
  const id = typeof message?.id === 'string' ? message.id : ''
  const request = typeof entry.requestId === 'string' ? entry.requestId : ''
  return {
    key: id || request ? `${id}:${request}` : `${day}:${Math.random()}`,
    day,
    project: typeof entry.cwd === 'string' && entry.cwd ? entry.cwd : '',
    model,
    tokens: {
      input: num(usage.input_tokens),
      output: num(usage.output_tokens),
      cacheWrite5m: write - write1h,
      cacheWrite1h: write1h,
      cacheRead: num(usage.cache_read_input_tokens)
    }
  }
}

type Parsed = NonNullable<ReturnType<typeof parseUsageLine>>

/** As respostas de um arquivo (guardadas pelo tamanho e pela data dele). */
const cache = new Map<string, { size: number; mtime: number; entries: Parsed[] }>()

async function readFileEntries(file: string, size: number, mtime: number): Promise<Parsed[]> {
  const known = cache.get(file)
  if (known && known.size === size && known.mtime === mtime) return known.entries
  const entries: Parsed[] = []
  const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      const parsed = parseUsageLine(line)
      if (parsed) entries.push(parsed)
    }
  } catch {
    // Um arquivo que sumiu no meio: o que já veio vale.
  }
  cache.set(file, { size, mtime, entries })
  return entries
}

/** Os .jsonl das pastas de projetos (e das de subagentes dentro delas), mudados desde `since`. */
function sessionFiles(
  roots: string[],
  since: number
): { file: string; size: number; mtime: number; dir: string }[] {
  const out: { file: string; size: number; mtime: number; dir: string }[] = []
  const walk = (dir: string, project: string, depth: number): void => {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const name of names) {
      const path = join(dir, name)
      let info
      try {
        info = statSync(path)
      } catch {
        continue
      }
      if (info.isDirectory() && depth < 3) walk(path, project, depth + 1)
      else if (info.isFile() && name.endsWith('.jsonl') && info.mtimeMs >= since) {
        out.push({ file: path, size: info.size, mtime: info.mtimeMs, dir: project })
      }
    }
  }
  for (const root of roots) {
    let projects: string[]
    try {
      projects = readdirSync(root)
    } catch {
      continue
    }
    for (const project of projects) walk(join(root, project), project, 0)
  }
  return out
}

/** O nome do projeto: a pasta dele (pelo cwd gravado; sem ele, o nome da pasta do Claude Code). */
const projectName = (cwd: string, dir: string): string =>
  cwd ? basename(cwd) || cwd : dir.replace(/^-/, '').split('-').pop() || dir

/** As pastas onde o Claude Code grava as sessões (a da assinatura e a da OpenRouter). */
export const usageRoots = (env: NodeJS.ProcessEnv = process.env): string[] => [
  join(claudeConfigDir(env), 'projects'),
  join(OPENROUTER_CONFIG_DIR, 'projects')
]

/** O relatório dos últimos `days` dias: uma linha por dia, projeto e modelo. */
export async function usageReport(
  days: number,
  roots: string[] = usageRoots(),
  now = new Date()
): Promise<UsageReport> {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  const since = localDay(start.toISOString()) as string
  const files = sessionFiles(roots, start.getTime())
  const seen = new Set<string>()
  const rows = new Map<string, UsageRow>()
  const unknown = new Set<string>()
  for (const { file, size, mtime, dir } of files) {
    for (const entry of await readFileEntries(file, size, mtime)) {
      if (entry.day < since || seen.has(entry.key)) continue
      seen.add(entry.key)
      const project = projectName(entry.project, dir)
      const key = `${entry.day}\u0000${project}\u0000${entry.model}`
      const row = rows.get(key) ?? {
        day: entry.day,
        project,
        model: entry.model,
        input: 0,
        output: 0,
        cacheWrite: 0,
        cacheRead: 0,
        cost: 0
      }
      row.input += entry.tokens.input
      row.output += entry.tokens.output
      row.cacheWrite += entry.tokens.cacheWrite5m + entry.tokens.cacheWrite1h
      row.cacheRead += entry.tokens.cacheRead
      const cost = costOf(entry.model, entry.tokens)
      if (cost === null) {
        unknown.add(entry.model)
        row.cost = null
      } else if (row.cost !== null) row.cost += cost
      rows.set(key, row)
    }
  }
  return {
    since,
    days,
    rows: [...rows.values()].sort(
      (a, b) =>
        b.day.localeCompare(a.day) ||
        a.project.localeCompare(b.project) ||
        a.model.localeCompare(b.model)
    ),
    unknownModels: [...unknown].sort(),
    files: files.length
  }
}

const csvField = (value: string | number | null): string => {
  const text = value === null ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** O relatório em CSV (uma linha por dia, projeto e modelo). */
export function usageCsv(report: UsageReport): string {
  const header = [
    'dia',
    'projeto',
    'modelo',
    'entrada',
    'saida',
    'cache_escrita',
    'cache_leitura',
    'custo_usd'
  ]
  const lines = report.rows.map((row) =>
    [
      row.day,
      row.project,
      row.model,
      row.input,
      row.output,
      row.cacheWrite,
      row.cacheRead,
      row.cost === null ? null : row.cost.toFixed(4)
    ]
      .map(csvField)
      .join(',')
  )
  return [header.join(','), ...lines].join('\n') + '\n'
}

/** O IPC do painel de uso: o relatório e a exportação em CSV. */
export function setupUsageReport(
  fromChat: (event: IpcMainInvokeEvent) => boolean,
  window: () => BrowserWindow | null
): void {
  const valid = (days: unknown): number =>
    typeof days === 'number' && Number.isInteger(days) && days >= 1 && days <= 366 ? days : 30
  ipcMain.handle(IPC.usageReport, async (event, days: unknown): Promise<UsageReport | null> =>
    fromChat(event) ? usageReport(valid(days)) : null
  )
  ipcMain.handle(IPC.usageExport, async (event, days: unknown): Promise<ExportResult> => {
    if (!fromChat(event)) return { ok: false, message: t('pedido inválido') }
    const report = await usageReport(valid(days))
    const file = await pickSaveFile(
      t('Exportar o uso'),
      join(app.getPath('documents'), `wisp-uso-${report.since}.csv`),
      [{ name: 'CSV', extensions: ['csv'] }],
      window()
    )
    if (!file) return null
    try {
      await writeFile(file, usageCsv(report))
    } catch (err) {
      return {
        ok: false,
        message: t('Não consegui gravar o arquivo: {message}', { message: (err as Error).message })
      }
    }
    return { ok: true, path: tilde(file) }
  })
}
