// O pedido de uma tarefa pela ferramenta schedule_task (Fase 83), virando uma tarefa agendada.
// Fica aqui (e não no main) porque o card da permissão mostra o mesmo que vai ser gravado: o nome,
// o horário em palavras, o prompt, a pasta e para onde vai o resultado.

import { dayKey, MAX_PROMPT_TEXT, TASK_DELIVERIES, TIME } from './prompts'
import type { ScheduledTask, TaskDelivery, TaskRepeat } from './prompts'

export type TaskDraft = Omit<ScheduledTask, 'id'>

const REPEATS: Record<string, TaskRepeat> = {
  'uma-vez': 'once',
  semanal: 'weekly',
  'a-cada': 'every',
  mensal: 'monthly'
}

const DELIVERIES: Record<string, TaskDelivery> = {
  wisp: 'main',
  notificacao: 'notify',
  telegram: 'telegram',
  mascote: 'mascot'
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/**
 * A tarefa do pedido, ou o que está errado nele. `now` é a hora de agora (o "daqui a X minutos" e
 * o "já passou" saem dela).
 */
export function taskFromInput(input: unknown, now: Date): TaskDraft | { error: string } {
  const value = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const name = str(value.nome).replace(/\s+/g, ' ').slice(0, 80)
  const prompt = str(value.prompt)
  if (!name) return { error: 'Falta o nome da tarefa (nome).' }
  if (!prompt) return { error: 'Falta o que a tarefa pede ao Claude (prompt).' }
  if (prompt.length > MAX_PROMPT_TEXT) {
    return { error: `O prompt passou de ${MAX_PROMPT_TEXT} caracteres.` }
  }
  const minutes = num(value.daqui_minutos)
  const repeat: TaskRepeat =
    REPEATS[str(value.repetir)] ?? (minutes !== null || str(value.data) ? 'once' : 'weekly')
  const days = Array.isArray(value.dias)
    ? [
        ...new Set(
          value.dias.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
        )
      ]
    : ALL_DAYS
  const folder = str(value.pasta) || null
  const wanted = Array.isArray(value.entregar)
    ? value.entregar.flatMap((item) => (DELIVERIES[str(item)] ? [DELIVERIES[str(item)]] : []))
    : []
  const deliver = wanted.length ? [...new Set(wanted)] : [...TASK_DELIVERIES]
  const base = {
    name,
    prompt,
    folder,
    enabled: true,
    trigger: 'time' as const,
    by: 'claude' as const,
    deliver
  }

  if (repeat === 'once') {
    let date = str(value.data)
    let time = str(value.hora)
    if (minutes !== null) {
      if (minutes < 1 || minutes > 366 * 24 * 60) {
        return { error: 'daqui_minutos vai de 1 a um ano.' }
      }
      // Arredonda para o minuto seguinte: o agendador olha de minuto em minuto.
      const when = new Date(now.getTime() + minutes * 60_000)
      when.setSeconds(0, 0)
      if (when.getTime() <= now.getTime()) when.setMinutes(when.getMinutes() + 1)
      date = dayKey(when)
      time = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return { error: 'Uma vez só: diga a data (AAAA-MM-DD) ou daqui_minutos.' }
    if (!TIME.test(time)) return { error: 'Diga a hora no formato HH:MM.' }
    const [y, m, d] = date.split('-').map(Number)
    const [h, min] = time.split(':').map(Number)
    const when = new Date(y, m - 1, d, h, min)
    if (Number.isNaN(when.getTime()) || dayKey(when) !== date)
      return { error: 'Essa data não existe.' }
    if (when.getTime() <= now.getTime()) return { error: 'Esse horário já passou.' }
    return { ...base, repeat, date, time, days: [] }
  }
  if (repeat === 'monthly') {
    const day = num(value.dia_do_mes)
    const time = str(value.hora)
    if (day === null || !Number.isInteger(day) || day < 1 || day > 31) {
      return { error: 'Todo mês: diga o dia (dia_do_mes, de 1 a 31).' }
    }
    if (!TIME.test(time)) return { error: 'Diga a hora no formato HH:MM.' }
    return { ...base, repeat, dayOfMonth: day, time, days: [] }
  }
  if (!days.length) return { error: 'Diga ao menos um dia da semana (0 é domingo, 6 é sábado).' }
  if (repeat === 'every') {
    const hours = num(value.a_cada_horas)
    const from = str(value.hora) || '08:00'
    const until = str(value.ate) || '22:00'
    if (hours === null || hours < 1 || hours > 24)
      return { error: 'A cada quantas horas? (a_cada_horas, de 1 a 24)' }
    if (!TIME.test(from) || !TIME.test(until)) return { error: 'Diga a janela no formato HH:MM.' }
    if (until <= from) return { error: 'O fim da janela (ate) vem depois do começo (hora).' }
    return { ...base, repeat, everyHours: hours, time: from, until, days }
  }
  const time = str(value.hora)
  if (!TIME.test(time)) return { error: 'Diga a hora no formato HH:MM.' }
  return { ...base, repeat, time, days }
}
