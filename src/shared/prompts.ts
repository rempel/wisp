// Prompts salvos e tarefas agendadas (Fase 26). Um prompt salvo é um pedido pronto, chamado pelo
// menu da barra (/nome), com variáveis que o Wisp preenche na hora: a pasta da conversa, o que
// foi copiado, a data e a hora. Uma tarefa agendada é um prompt que roda sozinho num horário, numa
// aba nova e sempre no modo Pedir: o que muda a máquina espera o seu clique, como numa conversa.

import { getLocale, t } from './i18n'

export interface SavedPrompt {
  /** O nome no menu da barra (/nome): letras minúsculas, números e hífens. */
  name: string
  text: string
}

/**
 * O que faz uma tarefa rodar (Fase 44): o horário (o de sempre), uma revisão num PR seu, um CI
 * que falhou, um arquivo novo numa pasta (`watch`) ou a tela desbloqueada.
 */
export const TASK_TRIGGERS = ['time', 'pr-review', 'ci-failed', 'new-file', 'unlock'] as const
export type TaskTrigger = (typeof TASK_TRIGGERS)[number]

export interface ScheduledTask {
  id: string
  name: string
  prompt: string
  /** Sem ele, o horário (as tarefas de antes da Fase 44). */
  trigger?: TaskTrigger
  /** A pasta acompanhada, no gatilho de arquivo novo. */
  watch?: string | null
  /** A hora do dia, "HH:MM" (no fuso do computador). */
  time: string
  /** Os dias da semana em que roda: 0 é domingo, 6 é sábado. */
  days: number[]
  /** Como se repete (Fase 83); sem ele, toda semana nos `days`. */
  repeat?: TaskRepeat
  /** Uma vez só: o dia, "AAAA-MM-DD" (a hora é a `time`). */
  date?: string
  /** A cada N horas (1 a 24), da `time` até a `until`, nos `days`. */
  everyHours?: number
  until?: string
  /** Todo mês: o dia (num mês mais curto, o último dele). */
  dayOfMonth?: number
  /** Para onde vai o resultado (Fase 83); sem ele, para todos. */
  deliver?: TaskDelivery[]
  /** Quem criou: o Claude, pela schedule_task (Fase 83). */
  by?: 'claude'
  /** A pasta onde a conversa roda (como "Abrir uma pasta numa conversa"); null, a de sempre. */
  folder: string | null
  enabled: boolean
}

export const PROMPT_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/
/** Os nomes que o próprio Wisp atende no menu da barra. */
export const RESERVED_NAMES = ['compact', 'clear']
export const MAX_PROMPTS = 50
export const MAX_TASKS = 20
export const MAX_PROMPT_TEXT = 4000
/** O tamanho máximo do que foi copiado que entra num prompt. */
export const MAX_CLIPBOARD = 20_000
export const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

/** O que preenche as variáveis. */
export interface PromptValues {
  folder: string
  clipboard: string
  date: string
  time: string
  /** O que fez a tarefa rodar (Fase 44): o PR, os arquivos novos. Vazio fora das tarefas. */
  event?: string
}

/** Cada variável, com o nome em português e em inglês (os dois valem em qualquer idioma). */
const VARIABLES: Record<string, keyof PromptValues> = {
  pasta: 'folder',
  folder: 'folder',
  copiado: 'clipboard',
  clipboard: 'clipboard',
  data: 'date',
  date: 'date',
  hora: 'time',
  time: 'time',
  evento: 'event',
  event: 'event'
}

/** O texto com as variáveis trocadas; uma {palavra} que não é variável fica como está. */
export function expandPrompt(text: string, values: PromptValues): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const key = VARIABLES[name.toLowerCase()]
    return key ? (values[key] ?? '') : match
  })
}

/** O prompt usa o que foi copiado? (só então o Wisp lê a área de transferência) */
export function usesClipboard(text: string): boolean {
  return /\{(copiado|clipboard)\}/i.test(text)
}

/** Uma variável escrita no idioma da interface ({pasta} ou {folder}): as duas valem sempre. */
export const variable = (pt: string, en: string): string =>
  getLocale() === 'en' ? `{${en}}` : `{${pt}}`

/** Os prompts de quem ainda não mexeu na lista. */
export function defaultPrompts(): SavedPrompt[] {
  const folder = variable('pasta', 'folder')
  return [
    {
      name: 'diff',
      text: t(
        'Revise as mudanças ainda não commitadas em {v1} (git diff): aponte bugs, casos esquecidos e o que dá para simplificar. Não mude nada.',
        { v1: folder }
      )
    },
    {
      name: 'commit',
      text: t(
        'Escreva a mensagem de commit para as mudanças em {v1}, no estilo dos commits anteriores (git log). Só a mensagem: não faça o commit.',
        { v1: folder }
      )
    },
    {
      name: getLocale() === 'en' ? 'explain' : 'explica',
      text: t('Explique, em poucas linhas e sem jargão, o que é isto:\n\n{v1}', {
        v1: variable('copiado', 'clipboard')
      })
    }
  ]
}

/** A primeira linha do texto, curta, para o menu. */
export function promptPreview(text: string, max = 70): string {
  const line = text.trim().split('\n')[0] ?? ''
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

// ---- Os horários das tarefas -------------------------------------------------

/**
 * Como a tarefa se repete (Fase 83): toda semana nos dias dela (o de sempre), uma vez só (num dia),
 * a cada N horas numa janela do dia (nos dias dela) ou todo mês num dia.
 */
export const TASK_REPEATS = ['weekly', 'once', 'every', 'monthly'] as const
export type TaskRepeat = (typeof TASK_REPEATS)[number]

/** Para onde vai o resultado de uma tarefa (Fase 83). */
export const TASK_DELIVERIES = ['main', 'notify', 'telegram', 'mascot'] as const
export type TaskDelivery = (typeof TASK_DELIVERIES)[number]

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function at(day: Date, time: string): Date | null {
  const match = TIME.exec(time)
  if (!match) return null
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Number(match[1]),
    Number(match[2])
  )
}

const minutesOf = (time: string): number | null => {
  const match = TIME.exec(time)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/** "2026-11-19" de uma data, no fuso do computador. */
export function dayKey(date: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
}

/** As vezes que a tarefa roda num dia, em ordem. */
export function runsOn(task: ScheduledTask, day: Date): Date[] {
  const repeat = task.repeat ?? 'weekly'
  if (repeat === 'once') {
    const when = task.date && dayKey(day) === task.date ? at(day, task.time) : null
    return when ? [when] : []
  }
  if (repeat === 'monthly') {
    const last = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate()
    const wanted = Math.min(Math.max(1, task.dayOfMonth ?? 1), last)
    const when = day.getDate() === wanted ? at(day, task.time) : null
    return when ? [when] : []
  }
  if (!task.days.includes(day.getDay())) return []
  if (repeat === 'every') {
    const start = minutesOf(task.time)
    const end = minutesOf(task.until ?? '23:59') ?? 23 * 60 + 59
    const step = Math.round(Math.min(24, Math.max(1, task.everyHours ?? 1)) * 60)
    if (start === null) return []
    const out: Date[] = []
    for (let minute = start; minute <= end; minute += step) {
      out.push(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minute))
    }
    return out
  }
  const when = at(day, task.time)
  return when ? [when] : []
}

/** Quantos dias para a frente (e para trás) procurar a próxima vez. */
function horizon(task: ScheduledTask): number {
  const repeat = task.repeat ?? 'weekly'
  return repeat === 'once' ? 400 : repeat === 'monthly' ? 62 : 8
}

const timed = (task: ScheduledTask): boolean => {
  if (!task.enabled || (task.trigger ?? 'time') !== 'time') return false
  const repeat = task.repeat ?? 'weekly'
  if (repeat === 'once') return !!task.date && DAY_RE.test(task.date)
  if (repeat === 'monthly') return true
  return task.days.length > 0
}

/** A próxima vez que a tarefa roda, depois de `after`; null se ela não tem quando ou está desligada. */
export function nextRun(task: ScheduledTask, after: Date): Date | null {
  if (!timed(task)) return null
  for (let offset = 0; offset <= horizon(task); offset++) {
    const day = new Date(after.getFullYear(), after.getMonth(), after.getDate() + offset)
    const next = runsOn(task, day).find((when) => when.getTime() > after.getTime())
    if (next) return next
  }
  return null
}

/** A última vez que a tarefa devia ter rodado, até `now` (no máximo uma semana atrás). */
export function lastDue(task: ScheduledTask, now: Date): Date | null {
  if (!timed(task)) return null
  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    const due = runsOn(task, day)
      .filter((when) => when.getTime() <= now.getTime())
      .pop()
    if (due) return due
  }
  return null
}

/** O que muda o horário de uma tarefa: mexer nele recomeça a contagem dela. */
export const scheduleSignature = (task: ScheduledTask): string =>
  [
    task.enabled ? 1 : 0,
    task.time,
    [...task.days].sort().join(','),
    task.repeat ?? 'weekly',
    task.date ?? '',
    task.everyHours ?? '',
    task.until ?? '',
    task.dayOfMonth ?? ''
  ].join('|')

const WEEKDAYS = (): string[] => [
  t('domingo'),
  t('segunda'),
  t('terça'),
  t('quarta'),
  t('quinta'),
  t('sexta'),
  t('sábado')
]

/** Os dias da semana em palavras: "todo dia", "dias úteis", "segunda e quarta". */
export function describeDays(days: number[]): string {
  const sorted = [...new Set(days)].sort()
  if (sorted.length === 7) return t('todo dia')
  if (sorted.join(',') === '1,2,3,4,5') return t('dias úteis')
  if (sorted.join(',') === '0,6') return t('fins de semana')
  const names = sorted.map((day) => WEEKDAYS()[day])
  return names.length > 1
    ? `${names.slice(0, -1).join(', ')} ${t('e')} ${names[names.length - 1]}`
    : (names[0] ?? '')
}

/** O horário de uma tarefa em palavras (Fase 83), para o card, as configurações e o Claude. */
export function describeSchedule(task: Omit<ScheduledTask, 'id'>): string {
  const repeat = task.repeat ?? 'weekly'
  if (repeat === 'once') {
    const match = DAY_RE.exec(task.date ?? '')
    const date = match ? `${match[3]}/${match[2]}/${match[1]}` : (task.date ?? '?')
    return t('uma vez, em {date} às {time}', { date, time: task.time })
  }
  if (repeat === 'monthly') {
    return t('todo mês, no dia {day}, às {time}', { day: task.dayOfMonth ?? 1, time: task.time })
  }
  if (repeat === 'every') {
    return t('a cada {hours} h, das {from} às {until}, {days}', {
      hours: task.everyHours ?? 1,
      from: task.time,
      until: task.until ?? '23:59',
      days: describeDays(task.days)
    })
  }
  return t('{days}, às {time}', { days: describeDays(task.days), time: task.time })
}
