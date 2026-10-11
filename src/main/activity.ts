// O resumo da semana (Fase 13), tudo local: um registro de atividade só com contagens e nomes
// (de ferramentas, de apps, de pastas de projetos), nunca o conteúdo, em
// ~/.local/share/wisp/atividade.jsonl (0600). Guarda 9 semanas; dá para desligar
// (config.weeklySummary), e aí nada é registrado.

import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { ChatEvent, WeekSummary } from '../shared/ipc'

export type ActivityEntry =
  /** Uma conversa nova (a primeira mensagem dela). */
  | { t: number; k: 'conversa' }
  /** Um turno do Claude (da mensagem à resposta), com quanto durou e como acabou. */
  | { t: number; k: 'turno'; ms: number; fim: 'done' | 'error' | 'stopped' }
  | { t: number; k: 'ferramenta'; nome: string }
  /** Uma edição de arquivo, com as linhas a mais e a menos. */
  | { t: number; k: 'edicao'; mais: number; menos: number }
  /** Um pedido de permissão respondido. */
  | { t: number; k: 'permissao'; ok: boolean; nome: string }
  /** Um app aberto pelo Claude (o id do .desktop). */
  | { t: number; k: 'app'; nome: string }
  /** Uma mensagem numa sessão do Claude Code no terminal, com a pasta do projeto. */
  | { t: number; k: 'terminal'; projeto: string }
  | { t: number; k: 'lembrete' }

export type ActivityRecord = ActivityEntry extends infer E
  ? E extends { t: number }
    ? Omit<E, 't'>
    : never
  : never

/** Quanto guardar. */
const KEEP_MS = 9 * 7 * 86_400_000
/** Passando disto, o arquivo é podado na hora. */
const MAX_BYTES = 2 * 1024 * 1024

/** O nome de uma ferramenta, curto: "open_app" em vez de "mcp__desktop__open_app". */
export function toolName(name: string): string {
  if (name.startsWith('mcp__playwright__')) return 'navegador'
  const mcp = /^mcp__[^_]+(?:_[^_]+)*?__(.+)$/.exec(name)
  return (mcp ? mcp[1] : name).slice(0, 60)
}

/** A segunda-feira (0h, no fuso local) da semana desse instante. */
export function weekStart(ms: number): number {
  const date = new Date(ms)
  const back = (date.getDay() + 6) % 7
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - back).getTime()
}

/** A segunda-feira seguinte (as semanas com mudança de horário têm 167 ou 169 horas). */
export function nextWeek(start: number): number {
  const date = new Date(start)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7).getTime()
}

export class ActivityLog {
  private readonly started = new Set<string>()
  private readonly turns = new Map<string, number>()
  private readonly asked = new Map<string, string>()
  private readonly apps = new Map<string, string>()

  constructor(
    private readonly path: string,
    private readonly options: { enabled: () => boolean; now?: () => number }
  ) {}

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  record(entry: ActivityRecord): void {
    if (!this.options.enabled()) return
    try {
      mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
      appendFileSync(this.path, JSON.stringify({ t: this.now(), ...entry }) + '\n', { mode: 0o600 })
      if (statSync(this.path).size > MAX_BYTES) this.prune()
    } catch (err) {
      console.warn('[wisp] não consegui gravar a atividade da semana:', err)
    }
  }

  /** Conta o que interessa nos eventos das conversas (ao vivo; o histórico reaberto não conta). */
  onChatEvent(event: ChatEvent, conversation: string): void {
    switch (event.type) {
      case 'busy':
        if (!event.busy) return
        if (!this.started.has(conversation)) {
          this.started.add(conversation)
          this.record({ k: 'conversa' })
        }
        this.turns.set(conversation, this.now())
        return
      case 'turn-end': {
        const started = this.turns.get(conversation)
        this.turns.delete(conversation)
        if (started !== undefined) {
          this.record({ k: 'turno', ms: Math.max(0, this.now() - started), fim: event.outcome })
        }
        return
      }
      case 'reset':
        this.started.delete(conversation)
        this.turns.delete(conversation)
        return
      case 'tool-start':
        this.record({ k: 'ferramenta', nome: toolName(event.name) })
        return
      case 'tool-input': {
        const id = (event.input as { id?: unknown } | null)?.id
        if (toolName(event.name) === 'open_app' && typeof id === 'string') {
          this.apps.set(event.id, id.slice(0, 100))
        }
        return
      }
      case 'tool-result': {
        if (event.diff) {
          this.record({ k: 'edicao', mais: event.diff.added, menos: event.diff.removed })
        }
        const app = this.apps.get(event.id)
        this.apps.delete(event.id)
        if (app && !event.isError) this.record({ k: 'app', nome: app })
        return
      }
      case 'permission-request':
        this.asked.set(event.id, toolName(event.toolName))
        return
      case 'permission-resolved': {
        const name = this.asked.get(event.id)
        this.asked.delete(event.id)
        if (!name || event.decision === 'answered' || event.decision === 'cancelled') return
        this.record({ k: 'permissao', ok: event.decision !== 'deny', nome: name })
        return
      }
    }
  }

  /** As entradas de uma janela de tempo. */
  entries(from: number, to: number): ActivityEntry[] {
    let text: string
    try {
      text = readFileSync(this.path, 'utf8')
    } catch {
      return []
    }
    const out: ActivityEntry[] = []
    for (const line of text.split('\n')) {
      if (!line) continue
      try {
        const entry = JSON.parse(line) as ActivityEntry
        if (typeof entry.t === 'number' && entry.t >= from && entry.t < to) out.push(entry)
      } catch {
        // Uma linha estragada não estraga o resto.
      }
    }
    return out
  }

  /** Tira o que tem mais de 9 semanas (ao abrir o app, e quando o arquivo cresce demais). */
  prune(): void {
    const keep = this.entries(this.now() - KEEP_MS, Infinity)
    try {
      const temp = `${this.path}.tmp`
      writeFileSync(temp, keep.map((e) => JSON.stringify(e) + '\n').join(''), { mode: 0o600 })
      renameSync(temp, this.path)
    } catch {
      // Sem o arquivo, nada para podar.
    }
  }
}

const top = (counts: Map<string, number>, n: number): [string, number][] =>
  [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n)

const bump = (counts: Map<string, number>, key: string): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

export function summarize(entries: ActivityEntry[], from: number, to: number): WeekSummary {
  const summary: WeekSummary = {
    from,
    to,
    conversations: 0,
    turns: 0,
    claudeMinutes: 0,
    stopped: 0,
    errors: 0,
    edits: 0,
    added: 0,
    removed: 0,
    approved: 0,
    denied: 0,
    tools: [],
    apps: [],
    terminal: 0,
    projects: [],
    reminders: 0
  }
  const tools = new Map<string, number>()
  const apps = new Map<string, number>()
  const projects = new Map<string, number>()
  let ms = 0
  for (const e of entries) {
    if (e.t < from || e.t >= to) continue
    switch (e.k) {
      case 'conversa':
        summary.conversations++
        break
      case 'turno':
        summary.turns++
        ms += e.ms
        if (e.fim === 'stopped') summary.stopped++
        if (e.fim === 'error') summary.errors++
        break
      case 'ferramenta':
        bump(tools, e.nome)
        break
      case 'edicao':
        summary.edits++
        summary.added += e.mais
        summary.removed += e.menos
        break
      case 'permissao':
        if (e.ok) summary.approved++
        else summary.denied++
        break
      case 'app':
        bump(apps, e.nome)
        break
      case 'terminal':
        summary.terminal++
        bump(projects, e.projeto)
        break
      case 'lembrete':
        summary.reminders++
        break
    }
  }
  summary.claudeMinutes = Math.round(ms / 60_000)
  summary.tools = top(tools, 5)
  summary.apps = top(apps, 5)
  summary.projects = top(projects, 5)
  return summary
}

/** Teve alguma coisa na semana? */
export function isEmpty(s: WeekSummary): boolean {
  return !s.conversations && !s.turns && !s.terminal && !s.reminders && !s.apps.length
}

/** "1 h 20 min", "45 min", "menos de 1 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 1) return 'menos de 1 min'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** "(+3)", "(−2)", "(igual)" — a diferença para a semana anterior. */
function delta(now: number, before: number): string {
  if (now === before) return ' (igual)'
  return now > before ? ` (+${now - before})` : ` (−${before - now})`
}

const DAY = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })

/** O resumo em texto, comparado com a semana anterior (a ferramenta e a notificação). */
export function describeWeek(current: WeekSummary, previous: WeekSummary | null): string {
  const p = previous
  const lines = [
    `Semana de ${DAY.format(current.from)} a ${DAY.format(current.to - 1)}:`,
    `- ${current.conversations} conversas${p ? delta(current.conversations, p.conversations) : ''}, ` +
      `${current.turns} mensagens; o Claude trabalhou ${formatMinutes(current.claudeMinutes)}` +
      (p ? ` (antes: ${formatMinutes(p.claudeMinutes)})` : ''),
    `- Edições: ${current.edits} (+${current.added} −${current.removed} linhas)`,
    `- Permissões: ${current.approved} aprovadas, ${current.denied} negadas`
  ]
  if (current.tools.length) {
    lines.push(
      `- Ferramentas mais usadas: ${current.tools.map(([n, c]) => `${n} (${c})`).join(', ')}`
    )
  }
  if (current.apps.length) {
    lines.push(`- Apps abertos: ${current.apps.map(([n, c]) => `${n} (${c})`).join(', ')}`)
  }
  if (current.terminal) {
    lines.push(
      `- Terminal: ${current.terminal} mensagens no Claude Code` +
        (current.projects.length
          ? `, em ${current.projects.map(([n, c]) => `${n} (${c})`).join(', ')}`
          : '')
    )
  }
  if (current.reminders) lines.push(`- Lembretes que tocaram: ${current.reminders}`)
  if (current.stopped || current.errors) {
    lines.push(`- Paradas no meio: ${current.stopped}; com erro: ${current.errors}`)
  }
  return lines.join('\n')
}
