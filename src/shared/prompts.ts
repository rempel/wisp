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

/** A próxima vez que a tarefa roda, depois de `after`; null se ela não tem dia ou está desligada. */
export function nextRun(task: ScheduledTask, after: Date): Date | null {
  if (!task.enabled || !task.days.length || (task.trigger ?? 'time') !== 'time') return null
  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(after.getFullYear(), after.getMonth(), after.getDate() + offset)
    if (!task.days.includes(day.getDay())) continue
    const when = at(day, task.time)
    if (when && when.getTime() > after.getTime()) return when
  }
  return null
}

/** A última vez que a tarefa devia ter rodado, até `now` (no máximo uma semana atrás). */
export function lastDue(task: ScheduledTask, now: Date): Date | null {
  if (!task.enabled || !task.days.length || (task.trigger ?? 'time') !== 'time') return null
  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    if (!task.days.includes(day.getDay())) continue
    const when = at(day, task.time)
    if (when && when.getTime() <= now.getTime()) return when
  }
  return null
}

/** O que muda o horário de uma tarefa: mexer nele recomeça a contagem dela. */
export const scheduleSignature = (task: ScheduledTask): string =>
  `${task.enabled ? 1 : 0}|${task.time}|${[...task.days].sort().join(',')}`
