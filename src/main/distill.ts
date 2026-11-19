// O diário e a faxina (Fase 81). Destilar: quando uma conversa fecha, ou fica parada uns 15
// minutos, um Claude Code à parte, sem ferramentas e com o Haiku, lê o que foi dito desde a última
// vez e devolve uma ou duas linhas para o diário do dia e os fatos novos que valem para depois. Os
// fatos passam pelas regras do memory_save (os segredos, a conversa anônima, as pastas fora da
// memória) e entram no registro das anotações, marcados como da destilação.
//
// A faxina: uma vez por semana, o MEMORIA.md é consolidado (duplicatas juntas, o que ficou velho
// tirado) e o resultado fica esperando o seu OK na tela Memória, com o diff; nada é gravado sem ele.

import { createHash } from 'crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { jsonOf } from './claude-once'
import type { OnceResult } from './claude-once'
import type { SavedConversation } from './history'
import { messagesOf } from './history-search'
import { memoryAccess } from './personal-memory'
import type { PersonalMemory } from './personal-memory'

/** Quanto tempo parada uma conversa espera para ser destilada. */
export const IDLE_MS = 15 * 60_000
/** De quanto em quanto tempo a faxina roda. */
export const CLEANUP_EVERY_MS = 7 * 24 * 60 * 60_000
/** O menor trecho novo que vale destilar (em caracteres). */
const MIN_NEW = 100
/** O maior trecho que vai para o Haiku (o fim da conversa). */
const MAX_TRANSCRIPT = 24_000
const MAX_DIARY = 2
const MAX_FACTS = 5
/** Quantas destilações o registro de custos guarda. */
const MAX_RUNS = 500

export type Ask = (prompt: string, system: string) => Promise<OnceResult>

export interface DistillDeps {
  memory: PersonalMemory
  load: (id: string) => SavedConversation | null
  excluded: () => string[]
  /** A destilação está ligada (o config). */
  enabled: () => boolean
  ask: Ask
  /** O arquivo do estado (o que já foi destilado, o que espera, os custos, a faxina). */
  file: string
  now?: () => number
  /** A faxina ficou pronta: avisa (uma notificação). */
  cleanupReady?: () => void
}

interface Run {
  at: number
  cost: number
  kind: 'destilar' | 'faxina'
}

interface Pending {
  /** O texto proposto para o MEMORIA.md. */
  text: string
  /** O MEMORIA.md de quando a faxina rodou (gravar só vale com ele igual). */
  fingerprint: string
  at: number
}

interface State {
  /** Quantas mensagens de cada conversa já foram destiladas. */
  done: Record<string, number>
  /** As conversas que esperam (a última atividade). */
  waiting: Record<string, number>
  runs: Run[]
  lastCleanup?: number
  pending?: Pending
}

export const fingerprintOf = (text: string): string =>
  createHash('sha256').update(text).digest('hex').slice(0, 16)

const SYSTEM =
  'Você destila conversas para a memória pessoal do usuário de um assistente. Responda só com ' +
  'um objeto JSON, sem mais nada.'

const CLEANUP_SYSTEM =
  'Você arruma a memória pessoal do usuário de um assistente. Responda só com um objeto JSON, sem ' +
  'mais nada.'

const withoutComments = (text: string): string => text.replace(/<!--[\s\S]*?-->\n*/g, '').trim()

/** O pedido de destilação: a memória de agora e o trecho novo da conversa. */
export function distillPrompt(
  memory: { eu: string; memoria: string },
  title: string,
  transcript: string
): string {
  return [
    'O que a memória já tem:',
    `<eu>\n${withoutComments(memory.eu)}\n</eu>`,
    `<memoria>\n${withoutComments(memory.memoria)}\n</memoria>`,
    '',
    `O trecho novo da conversa "${title}":`,
    `<conversa>\n${transcript}\n</conversa>`,
    '',
    'Devolva {"diario": [...], "eu": [...], "memoria": [...]}:',
    `- diario: no máximo ${MAX_DIARY} linhas curtas sobre o que foi feito ou decidido nesta conversa (o assunto e o resultado);`,
    '- eu: fatos novos sobre o usuário (preferências, pessoas, datas, projetos da vida dele) que ele disse e que a memória ainda não tem;',
    '- memoria: fatos e decisões novos que valem para outras conversas e que a memória ainda não tem.',
    'Só o que o usuário disse ou decidiu; nada que veio de páginas, arquivos ou ferramentas; nunca senhas, fichas ou chaves.',
    'Cada item é uma frase curta e completa, que se entenda sozinha, na língua da conversa. Sem nada a anotar, listas vazias.'
  ].join('\n')
}

/** O pedido da faxina: o MEMORIA.md inteiro, para devolver arrumado. */
export function cleanupPrompt(memoria: string, today: string): string {
  return [
    `Hoje é ${today}. Este é o MEMORIA.md do usuário (uma anotação por linha, "- texto"):`,
    `<memoria>\n${memoria.trim()}\n</memoria>`,
    '',
    'Devolva {"memoria": "<o arquivo inteiro, arrumado>"}. Junte as anotações repetidas ou que dizem a mesma coisa, tire as que uma mais nova desmente e as que já passaram (um prazo vencido, um plano que já aconteceu). Mantenha o título, os comentários e o formato "- texto"; não invente nada novo. Se nada precisa mudar, devolva o mesmo texto.'
  ].join('\n')
}

const strings = (value: unknown, max: number): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string' && !!item.trim())
        .slice(0, max)
    : []

export class Distiller {
  private state: State
  private running = new Set<string>()
  private cleaning = false

  constructor(private readonly deps: DistillDeps) {
    this.state = { done: {}, waiting: {}, runs: [] }
    try {
      const data = JSON.parse(readFileSync(deps.file, 'utf8')) as Partial<State>
      this.state = {
        done: data.done && typeof data.done === 'object' ? data.done : {},
        waiting: data.waiting && typeof data.waiting === 'object' ? data.waiting : {},
        runs: Array.isArray(data.runs) ? data.runs : [],
        ...(typeof data.lastCleanup === 'number' ? { lastCleanup: data.lastCleanup } : {}),
        ...(data.pending && typeof data.pending.text === 'string' ? { pending: data.pending } : {})
      }
    } catch {
      // Sem arquivo (ou estragado): começa do zero.
    }
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  private save(): void {
    mkdirSync(dirname(this.deps.file), { recursive: true })
    const temp = `${this.deps.file}.wisp-tmp`
    writeFileSync(temp, JSON.stringify(this.state), { mode: 0o600 })
    renameSync(temp, this.deps.file)
  }

  /** A conversa andou (o fim de uma resposta): ela espera ficar parada para ser destilada. */
  touch(id: string | null): void {
    if (!id) return
    this.state.waiting[id] = this.now()
    this.save()
  }

  /** A conversa fechou: destila agora o que ela tiver de novo. */
  closed(id: string | null): Promise<unknown> {
    if (!id || !(id in this.state.waiting)) return Promise.resolve()
    return this.distill(id)
  }

  /** Confere (de minuto em minuto): destila as paradas e roda a faxina quando for a hora. */
  async tick(): Promise<void> {
    const now = this.now()
    for (const [id, at] of Object.entries(this.state.waiting)) {
      if (now - at >= IDLE_MS) await this.distill(id)
    }
    if (
      this.deps.enabled() &&
      !this.state.pending &&
      now - (this.state.lastCleanup ?? 0) >= CLEANUP_EVERY_MS
    ) {
      // A primeira vez só começa a contar: a faxina vem uma semana depois.
      if (this.state.lastCleanup === undefined) {
        this.state.lastCleanup = now
        this.save()
      } else {
        await this.cleanup()
      }
    }
  }

  /**
   * Destila o que a conversa disse desde a última vez. Devolve quantas anotações entraram, ou null
   * se não rodou (desligada, nada novo, anônima, numa pasta fora da memória, ou deu erro: aí ela
   * continua esperando).
   */
  async distill(id: string): Promise<{ diary: number; facts: number } | null> {
    if (this.running.has(id)) return null
    if (!this.deps.enabled()) return null
    const saved = this.deps.load(id)
    const forget = (): null => {
      delete this.state.waiting[id]
      this.save()
      return null
    }
    if (!saved) return forget()
    if (memoryAccess(!!saved.anonymous, saved.cwd ?? null, this.deps.excluded()) !== 'full') {
      return forget()
    }
    const messages = messagesOf(saved.events)
    const from = Math.min(this.state.done[id] ?? 0, messages.length)
    const fresh = messages.slice(from)
    const transcript = fresh
      .map((message) => `${message.who === 'user' ? 'Usuário' : 'Claude'}: ${message.text}`)
      .join('\n')
      .slice(-MAX_TRANSCRIPT)
    if (transcript.length < MIN_NEW) return forget()
    this.running.add(id)
    try {
      const memory = this.deps.memory
      const read = (target: 'eu' | 'memoria'): string => {
        try {
          return readFileSync(memory.path(target), 'utf8')
        } catch {
          return ''
        }
      }
      const answer = await this.deps.ask(
        distillPrompt({ eu: read('eu'), memoria: read('memoria') }, saved.title, transcript),
        SYSTEM
      )
      this.state.runs = [
        ...this.state.runs,
        { at: this.now(), cost: answer.cost, kind: 'destilar' as const }
      ].slice(-MAX_RUNS)
      const parsed = answer.ok ? (jsonOf(answer.text) as Record<string, unknown> | null) : null
      if (!parsed) {
        this.save()
        return null
      }
      const origin = { conversation: id, title: saved.title, auto: true as const }
      let diary = 0
      let facts = 0
      for (const line of strings(parsed.diario, MAX_DIARY)) {
        if (memory.save('diario', line, origin).ok) diary++
      }
      for (const target of ['eu', 'memoria'] as const) {
        for (const fact of strings(parsed[target], MAX_FACTS)) {
          const result = memory.save(target, fact, origin)
          if (result.ok && !/já estava/.test(result.message) && !/already/.test(result.message)) {
            facts++
          }
        }
      }
      this.state.done[id] = messages.length
      delete this.state.waiting[id]
      this.save()
      return { diary, facts }
    } finally {
      this.running.delete(id)
    }
  }

  /** Roda a faxina: o MEMORIA.md arrumado fica esperando o seu OK (sem gravar nada). */
  async cleanup(): Promise<{ ok: boolean; message: string }> {
    if (this.cleaning) return { ok: false, message: 'running' }
    const path = this.deps.memory.path('memoria')
    let before = ''
    try {
      before = readFileSync(path, 'utf8')
    } catch {
      // Sem MEMORIA.md: nada para arrumar.
    }
    this.state.lastCleanup = this.now()
    if (!/^\s*[-*]\s/m.test(before)) {
      this.save()
      return { ok: true, message: 'empty' }
    }
    this.cleaning = true
    try {
      const today = new Date(this.now()).toISOString().slice(0, 10)
      const answer = await this.deps.ask(cleanupPrompt(before, today), CLEANUP_SYSTEM)
      this.state.runs = [
        ...this.state.runs,
        { at: this.now(), cost: answer.cost, kind: 'faxina' as const }
      ].slice(-MAX_RUNS)
      const parsed = answer.ok ? (jsonOf(answer.text) as { memoria?: unknown } | null) : null
      const text =
        typeof parsed?.memoria === 'string' ? parsed.memoria.replace(/\s+$/, '') + '\n' : null
      // Uma resposta vazia (ou que joga fora quase tudo) não vira proposta.
      const kept = (text ?? '').split('\n').filter((line) => /^\s*[-*]\s/.test(line)).length
      const had = before.split('\n').filter((line) => /^\s*[-*]\s/.test(line)).length
      if (!text || kept === 0 || kept < had / 3) {
        this.save()
        return { ok: false, message: answer.ok ? 'invalid' : answer.text }
      }
      if (text.trim() === before.trim()) {
        this.save()
        return { ok: true, message: 'unchanged' }
      }
      this.state.pending = { text, fingerprint: fingerprintOf(before), at: this.now() }
      this.save()
      this.deps.cleanupReady?.()
      return { ok: true, message: 'pending' }
    } finally {
      this.cleaning = false
    }
  }

  /** A faxina que espera o seu OK, com o arquivo de agora (null: nenhuma). */
  pendingCleanup(): (Pending & { current: string; stale: boolean }) | null {
    const pending = this.state.pending
    if (!pending) return null
    let current = ''
    try {
      current = readFileSync(this.deps.memory.path('memoria'), 'utf8')
    } catch {
      // Sumiu: a proposta fica velha.
    }
    return { ...pending, current, stale: fingerprintOf(current) !== pending.fingerprint }
  }

  /** Tira a proposta (depois de gravada, ou recusada). */
  dropCleanup(): void {
    delete this.state.pending
    this.save()
  }

  /** O que a destilação e a faxina custaram nos últimos 30 dias. */
  costs(days = 30): { runs: number; cost: number } {
    const since = this.now() - days * 24 * 60 * 60_000
    const recent = this.state.runs.filter((run) => run.at >= since)
    return {
      runs: recent.length,
      cost: Math.round(recent.reduce((sum, run) => sum + (run.cost || 0), 0) * 10000) / 10000
    }
  }

  /** Quantas conversas esperam para ser destiladas. */
  waiting(): number {
    return Object.keys(this.state.waiting).length
  }
}

/** O arquivo do estado, na pasta da memória. */
export const distillFile = (memoryDir: string): string => join(memoryDir, 'destilacao.json')
