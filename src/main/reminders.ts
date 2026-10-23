import { randomBytes } from 'crypto'
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { t, dateLocale } from '../shared/i18n'

/** Um lembrete marcado. */
export interface Reminder {
  id: string
  text: string
  /** Quando avisar (ms Unix). */
  at: number
  createdAt: number
}

export interface ReminderOutput {
  /** Chegou a hora (ou ela passou com o app fechado: `late`). */
  fire(reminder: Reminder, late: boolean): void
  /** Lembretes perdidos demais para avisar um por um: só a conta. */
  missed?(count: number): void
}

/** O mais longe que dá para marcar. */
const MAX_AHEAD_MS = 366 * 24 * 60 * 60_000
/** Quantos lembretes podem esperar ao mesmo tempo. */
const MAX_PENDING = 100
/** O texto de um lembrete. */
const MAX_TEXT = 500
/**
 * O temporizador nunca espera mais que isso: depois de suspender o computador ou de o relógio
 * mudar, o lembrete sai no máximo um minuto atrasado.
 */
const MAX_WAIT_MS = 60_000
/** Perdidos com o app fechado: até este tanto saem um por um; o resto vira um aviso só. */
const MAX_LATE_NOTICES = 5
/** Uma folga: o que vence em menos que isso sai junto. */
const EARLY_MS = 500

/**
 * Os lembretes do Wisp: gravados num arquivo (sobrevivem ao app fechar) e avisados na hora.
 * Um processo headless do Claude Code não consegue acordar sozinho depois; o app consegue.
 */
export class Reminders {
  private items: Reminder[] = []
  private timer: NodeJS.Timeout | null = null
  private started = false

  /** Lê o arquivo na hora: os lembretes marcados antes de `start` se juntam aos guardados. */
  constructor(
    private readonly file: string,
    private readonly output: ReminderOutput
  ) {
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as unknown
      if (Array.isArray(data)) this.items = data.filter(isReminder)
    } catch {
      // Sem arquivo (ou estragado): nenhum lembrete.
    }
  }

  /** Começa a avisar: o que venceu com o app fechado sai agora, o resto na hora dele. */
  start(): void {
    this.started = true
    this.tick()
  }

  list(): Reminder[] {
    return [...this.items].sort((a, b) => a.at - b.at)
  }

  /** Marca um lembrete. Devolve o lembrete, ou o motivo de não ter marcado. */
  add(text: string, at: number, now = Date.now()): Reminder | { error: string } {
    const clean = text.trim().replace(/\s+/g, ' ').slice(0, MAX_TEXT)
    if (!clean) return { error: t('O lembrete precisa de um texto.') }
    if (!Number.isFinite(at) || at <= now) return { error: t('Esse horário já passou.') }
    if (at - now > MAX_AHEAD_MS) return { error: t('Dá para marcar até um ano para a frente.') }
    if (this.items.length >= MAX_PENDING) {
      return {
        error: t('Já há {MAX_PENDING} lembretes marcados; cancele algum antes.', { MAX_PENDING })
      }
    }
    const reminder: Reminder = {
      id: randomBytes(3).toString('hex'),
      text: clean,
      at: Math.round(at),
      createdAt: now
    }
    this.items.push(reminder)
    this.save()
    this.schedule()
    return reminder
  }

  /** Cancela um lembrete pelo id; devolve o que foi cancelado. */
  cancel(id: string): Reminder | null {
    const index = this.items.findIndex((item) => item.id === id.trim())
    if (index < 0) return null
    const [removed] = this.items.splice(index, 1)
    this.save()
    this.schedule()
    return removed
  }

  /** O computador voltou da suspensão: confere na hora. */
  resume(): void {
    if (this.started) this.tick()
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private tick(): void {
    this.timer = null
    const now = Date.now()
    const due = this.items.filter((item) => item.at <= now + EARLY_MS).sort((a, b) => a.at - b.at)
    if (due.length) {
      this.items = this.items.filter((item) => !due.includes(item))
      this.save()
      const late = due.filter((item) => now - item.at > MAX_WAIT_MS + EARLY_MS)
      const onTime = due.filter((item) => !late.includes(item))
      for (const item of onTime) this.output.fire(item, false)
      for (const item of late.slice(-MAX_LATE_NOTICES)) this.output.fire(item, true)
      if (late.length > MAX_LATE_NOTICES) this.output.missed?.(late.length - MAX_LATE_NOTICES)
    }
    this.schedule()
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (!this.started || !this.items.length) return
    const next = Math.min(...this.items.map((item) => item.at))
    const wait = Math.min(Math.max(0, next - Date.now()), MAX_WAIT_MS)
    this.timer = setTimeout(() => this.tick(), wait)
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 })
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(this.items, null, 2) + '\n', { mode: 0o600 })
      chmodSync(tmp, 0o600)
      renameSync(tmp, this.file)
    } catch (err) {
      console.warn('[wisp] não consegui gravar os lembretes:', err)
    }
  }
}

function isReminder(value: unknown): value is Reminder {
  const item = value as Partial<Reminder> | null
  return (
    typeof item?.id === 'string' &&
    typeof item.text === 'string' &&
    typeof item.at === 'number' &&
    Number.isFinite(item.at) &&
    typeof item.createdAt === 'number'
  )
}

/**
 * Quando avisar, a partir do que o Claude mandou: `minutos` a partir de agora, ou um `horario`
 * no fuso do usuário ("15:30", que vira amanhã se já passou; "2026-12-24 09:00"; ou um ISO
 * completo, com fuso).
 */
export function parseWhen(
  input: { minutos?: number; horario?: string },
  now = new Date()
): number | { error: string } {
  const { minutos, horario } = input
  if (minutos !== undefined && horario !== undefined) {
    return { error: t('Use minutos ou horario, não os dois.') }
  }
  if (minutos !== undefined) {
    if (!Number.isFinite(minutos) || minutos <= 0)
      return { error: t('minutos precisa ser positivo.') }
    return now.getTime() + minutos * 60_000
  }
  const text = horario?.trim()
  if (!text) return { error: t('Diga quando: minutos ou horario.') }
  const clock = /^(\d{1,2})[:h](\d{2})$/.exec(text)
  if (clock) {
    const [hours, minutes] = [Number(clock[1]), Number(clock[2])]
    if (hours > 23 || minutes > 59) return { error: t('"{text}" não é um horário.', { text }) }
    const at = new Date(now)
    at.setHours(hours, minutes, 0, 0)
    if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1)
    return at.getTime()
  }
  const local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text)
  if (local) {
    const [y, mo, d, h, mi, s] = local.slice(1).map((part) => Number(part ?? 0))
    const at = new Date(y, mo - 1, d, h, mi, s || 0)
    if (at.getMonth() !== mo - 1 || at.getDate() !== d)
      return { error: t('"{text}" não é uma data.', { text }) }
    return at.getTime()
  }
  const parsed = Date.parse(text)
  return Number.isNaN(parsed) ? { error: t('Não entendi o horário "{text}".', { text }) } : parsed
}

const clockFormat = new Intl.DateTimeFormat(dateLocale(), { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat(dateLocale(), { day: '2-digit', month: '2-digit' })

/** "hoje às 15:30", "amanhã às 08:00" ou "em 24/12 às 09:00". */
export function describeWhen(at: number, now = new Date()): string {
  const date = new Date(at)
  const startOfDay = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000)
  const clock = clockFormat.format(date)
  if (days === 0) return t('hoje às {clock}', { clock })
  if (days === 1) return t('amanhã às {clock}', { clock })
  if (days === -1) return t('ontem às {clock}', { clock })
  return t('em {v1} às {clock}', { v1: dayFormat.format(date), clock })
}

/** "daqui a 5 minutos", "daqui a 2 horas e 10 minutos". */
export function describeIn(at: number, now = Date.now()): string {
  const minutes = Math.max(1, Math.round((at - now) / 60_000))
  if (minutes < 60)
    return t('daqui a {minutes} {v2}', { minutes, v2: minutes === 1 ? t('minuto') : t('minutos') })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours >= 48) return t('daqui a {v1} dias', { v1: Math.round(hours / 24) })
  const h = `${hours} ${hours === 1 ? t('hora') : t('horas')}`
  return rest
    ? t('daqui a {h} e {rest} {v3}', { h, rest, v3: rest === 1 ? t('minuto') : t('minutos') })
    : t('daqui a {h}', { h })
}
