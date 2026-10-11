// A agenda (Fase 13): os próximos compromissos, só leitura, das agendas do GNOME (Evolution Data
// Server) e de arquivos .ics ou pastas com eles (vdirsyncer, o KOrganizer com um arquivo iCal).
// Opcional e desligada por padrão (config.calendar).
//
// De tempos em tempos (e quando a config muda), lê a janela de agora até alguns dias à frente;
// avisa alguns minutos antes de cada compromisso com hora marcada; diz ao painel qual é o
// próximo; e responde à ferramenta list_events ("o que eu tenho amanhã?").

import { readdirSync, readFileSync, statSync } from 'fs'
import { basename, join } from 'path'
import type { EdsCalendars } from './eds'
import { occurrences } from './ical'
import type { Occurrence } from './ical'
import { expandHome } from './paths'

/** De quanto em quanto tempo relê as agendas (ms). */
export const REFRESH_MS = 5 * 60_000
/** A janela guardada: de um dia atrás até tantos dias à frente. */
const AHEAD_DAYS = 8
/** O "próximo compromisso" do painel: só o que começa nas próximas tantas horas. */
const NEXT_HOURS = 24
/** Limites de leitura dos arquivos (uma pasta enorme não trava o app). */
const MAX_FILES = 3000
const MAX_FILE_BYTES = 5 * 1024 * 1024

export interface AgendaOptions {
  /** As agendas do GNOME (null: sem o EDS). Chamado a cada leitura; pode reconectar. */
  eds: () => Promise<Pick<EdsCalendars, 'events'> | null>
  /** Os arquivos e pastas do config.json (calendarFiles). */
  files: () => string[]
  /** Quantos minutos antes avisar (0: não avisa). */
  alertMinutes: () => number
  /** Hora de avisar este compromisso. `minutes`: quanto falta. */
  onAlert(occurrence: Occurrence, minutes: number): void
  /** O próximo compromisso mudou (para o painel); null: nenhum nas próximas horas. */
  onNext?(next: Occurrence | null): void
  now?: () => number
}

/** Uma ocorrência é a mesma se tiver o mesmo id e o mesmo início (vinda de duas fontes, conta uma). */
const keyOf = (o: Occurrence): string => `${o.uid || o.title}@${o.start}`

/** Os textos .ics de um arquivo, ou de uma pasta (e das pastas dentro dela, como no vdirsyncer). */
export function readIcsSources(
  paths: string[]
): { calendar: string; texts: string[]; error?: string }[] {
  const out: { calendar: string; texts: string[]; error?: string }[] = []
  let files = 0
  const read = (path: string): string | null => {
    if (files >= MAX_FILES) return null
    try {
      if (statSync(path).size > MAX_FILE_BYTES) return null
      files++
      return readFileSync(path, 'utf8')
    } catch {
      return null
    }
  }
  /** O nome de uma pasta do vdirsyncer está no arquivo "displayname" dela. */
  const nameOf = (dir: string): string => {
    try {
      return readFileSync(join(dir, 'displayname'), 'utf8').trim() || basename(dir)
    } catch {
      return basename(dir)
    }
  }
  const icsIn = (dir: string): string[] =>
    readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith('.ics'))
      .map((name) => join(dir, name))
  for (const configured of paths) {
    const path = expandHome(configured.trim())
    try {
      if (statSync(path).isDirectory()) {
        const own = icsIn(path)
          .map(read)
          .filter((t): t is string => t !== null)
        if (own.length) out.push({ calendar: nameOf(path), texts: own })
        for (const entry of readdirSync(path, { withFileTypes: true })) {
          if (!entry.isDirectory() || entry.name.startsWith('.')) continue
          const dir = join(path, entry.name)
          const texts = icsIn(dir)
            .map(read)
            .filter((t): t is string => t !== null)
          if (texts.length) out.push({ calendar: nameOf(dir), texts })
        }
      } else {
        const text = read(path)
        if (text !== null)
          out.push({ calendar: basename(path).replace(/\.ics$/i, ''), texts: [text] })
      }
    } catch {
      out.push({ calendar: basename(path), texts: [], error: `não achei ${configured}` })
    }
  }
  return out
}

export class Agenda {
  private cache: Occurrence[] = []
  private alerted = new Set<string>()
  private next: string | null = null
  private refreshTimer: NodeJS.Timeout | null = null
  private alertTimer: NodeJS.Timeout | null = null
  private running = false
  /** O que deu errado na última leitura (uma agenda que não abriu, um arquivo que sumiu). */
  problems: string[] = []

  constructor(private readonly options: AgendaOptions) {}

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  start(): void {
    if (this.running) return
    this.running = true
    void this.refresh()
  }

  stop(): void {
    this.running = false
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    if (this.alertTimer) clearTimeout(this.alertTimer)
    this.refreshTimer = this.alertTimer = null
    this.cache = []
    this.setNext(null)
  }

  get enabled(): boolean {
    return this.running
  }

  /** Lê as agendas numa janela: as do GNOME e os arquivos, sem repetir o mesmo compromisso. */
  async load(from: number, to: number): Promise<Occurrence[]> {
    const problems: string[] = []
    const found: Occurrence[] = []
    try {
      const eds = await this.options.eds()
      for (const item of (await eds?.events(from, to)) ?? []) {
        if (item.error) problems.push(`A agenda "${item.source.name}" não abriu: ${item.error}`)
        found.push(...occurrences(item.texts, from, to, item.source.name))
      }
    } catch (err) {
      problems.push(`As agendas do GNOME não responderam: ${(err as Error).message}`)
    }
    for (const item of readIcsSources(this.options.files())) {
      if (item.error) problems.push(item.error)
      found.push(...occurrences(item.texts, from, to, item.calendar))
    }
    this.problems = problems
    const seen = new Set<string>()
    return found
      .filter((o) => {
        const key = keyOf(o)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => a.start - b.start || a.title.localeCompare(b.title))
  }

  /** Relê a janela guardada, avisa o painel e marca o próximo aviso. */
  async refresh(): Promise<void> {
    if (!this.running) return
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    const now = this.now()
    try {
      this.cache = await this.load(now - 86_400_000, now + AHEAD_DAYS * 86_400_000)
    } finally {
      if (this.running) {
        this.schedule()
        // Duas leituras ao mesmo tempo (o início e uma mudança na config): só um timer fica.
        if (this.refreshTimer) clearTimeout(this.refreshTimer)
        this.refreshTimer = setTimeout(() => void this.refresh(), REFRESH_MS)
      }
    }
  }

  /** Os compromissos de uma janela (da guardada, se couber; senão, lidos na hora). */
  async between(from: number, to: number): Promise<Occurrence[]> {
    const now = this.now()
    const cached = from >= now - 86_400_000 && to <= now + AHEAD_DAYS * 86_400_000
    const list = cached && this.cache.length ? this.cache : await this.load(from, to)
    return list.filter((o) =>
      o.end > o.start ? o.start < to && o.end > from : o.start >= from && o.start < to
    )
  }

  /** O próximo compromisso com hora marcada (ou acontecendo agora), nas próximas horas. */
  upcoming(): Occurrence | null {
    const now = this.now()
    return (
      this.cache.find(
        (o) =>
          !o.allDay && (o.end > now || o.start >= now) && o.start < now + NEXT_HOURS * 3_600_000
      ) ?? null
    )
  }

  /** Avisa o que já está na hora e marca o próximo aviso (ou a troca do "próximo"). */
  private schedule(): void {
    if (this.alertTimer) clearTimeout(this.alertTimer)
    this.alertTimer = null
    const now = this.now()
    const minutes = Math.max(0, this.options.alertMinutes())
    let wake = Infinity
    if (minutes > 0) {
      for (const o of this.cache) {
        if (o.allDay || o.start <= now || this.alerted.has(keyOf(o))) continue
        const at = o.start - minutes * 60_000
        if (at <= now) {
          this.alerted.add(keyOf(o))
          this.options.onAlert(o, Math.max(1, Math.round((o.start - now) / 60_000)))
        } else {
          wake = Math.min(wake, at)
        }
      }
    }
    const next = this.upcoming()
    this.setNext(next)
    // O "próximo" muda quando ele termina (ou começa, se não tiver duração).
    if (next) wake = Math.min(wake, next.end > next.start ? next.end : next.start + 60_000)
    if (wake < Infinity) {
      // Um timer longo demais derrapa com a suspensão; a releitura de 5 em 5 minutos corrige.
      this.alertTimer = setTimeout(() => this.schedule(), Math.min(wake - now + 50, REFRESH_MS))
    }
  }

  private setNext(next: Occurrence | null): void {
    const key = next ? keyOf(next) : null
    if (key === this.next) return
    this.next = key
    this.options.onNext?.(next)
  }
}

const DAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
const CLOCK = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Os compromissos em texto, por dia, para a ferramenta list_events. */
export function describeAgenda(
  list: Occurrence[],
  from: number,
  to: number,
  now = Date.now()
): string {
  const startOfDay = (ms: number): number => {
    const d = new Date(ms)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  }
  const label = (ms: number): string => {
    const days = Math.round((startOfDay(ms) - startOfDay(now)) / 86_400_000)
    const date = DAY.format(ms).replace('.', '')
    return days === 0
      ? `Hoje (${date})`
      : days === 1
        ? `Amanhã (${date})`
        : date[0].toUpperCase() + date.slice(1)
  }
  const lines = [`Agora: ${DAY.format(now).replace('.', '')}, ${CLOCK.format(now)}.`]
  if (!list.length) {
    lines.push(
      `Nenhum compromisso de ${DAY.format(from).replace('.', '')} a ${DAY.format(to - 1).replace('.', '')}.`
    )
    return lines.join('\n')
  }
  let day = ''
  for (const o of list) {
    const heading = label(Math.max(o.start, from))
    if (heading !== day) {
      day = heading
      lines.push(`${heading}:`)
    }
    const when = o.allDay
      ? 'dia inteiro'
      : o.end > o.start
        ? `${CLOCK.format(o.start)}–${CLOCK.format(o.end)}`
        : CLOCK.format(o.start)
    const where = o.location ? ` · ${o.location}` : ''
    lines.push(`- ${when} ${o.title} (${o.calendar})${where}`)
  }
  return lines.join('\n')
}
