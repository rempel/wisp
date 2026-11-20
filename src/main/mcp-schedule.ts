// A agenda que o Claude marca (Fase 83): schedule_task, list_tasks e cancel_task no servidor
// `desktop`. Agendar sempre passa pelo card (a regra "ask" das configurações do Claude Code vale
// até no modo Automático): a tarefa só existe depois do seu OK, e roda sempre no modo Pedir.
// Cancelar também pede o card; listar é só leitura.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { describeSchedule, MAX_TASKS, nextRun } from '../shared/prompts'
import type { ScheduledTask } from '../shared/prompts'
import { taskFromInput } from '../shared/schedule-input'

export interface ScheduleToolsOptions {
  tasks: () => ScheduledTask[]
  /** Grava a lista nova (o config.json). */
  save: (tasks: ScheduledTask[]) => void
  now?: () => Date
}

const ALWAYS_LOAD = { 'anthropic/alwaysLoad': true }
type Result = { content: { type: 'text'; text: string }[]; isError?: boolean }
const text = (content: string): Result => ({ content: [{ type: 'text', text: content }] })
const failed = (content: string): Result => ({ ...text(content), isError: true })

/** Uma tarefa numa linha, para o Claude. */
export function describeTask(task: ScheduledTask, now: Date): string {
  const next = nextRun(task, now)
  const when =
    (task.trigger ?? 'time') === 'time'
      ? describeSchedule(task)
      : `quando acontece: ${task.trigger}`
  return (
    `- ${task.id}: "${task.name}" — ${when}` +
    (next ? ` — próxima: ${next.toLocaleString('pt-BR')}` : '') +
    (task.enabled ? '' : ' — desligada') +
    (task.by === 'claude' ? ' — criada pelo Claude' : '')
  )
}

export function registerScheduleTools(server: McpServer, options: ScheduleToolsOptions): void {
  const now = (): Date => options.now?.() ?? new Date()

  server.registerTool(
    'schedule_task',
    {
      title: 'Agendar uma tarefa',
      description:
        'Agenda um prompt para rodar sozinho, numa conversa nova, no modo Pedir (o que mexer na ' +
        'máquina espera o clique do usuário). O usuário vê um card com tudo e decide. O ' +
        'resultado vai para a conversa principal (a Wisp), a notificação, o Telegram e o ' +
        'mascote, ou só para os de `entregar` ("wisp", "notificacao", "telegram", "mascote"). ' +
        'Use para "toda segunda às 8h me manda os PRs parados" ou "daqui a 2 horas confere se o ' +
        'deploy passou"; para um aviso simples na hora ("me lembra de beber água"), use ' +
        'set_reminder. `repetir`: "uma-vez" (com `data` AAAA-MM-DD e `hora`, ou `daqui_minutos`), ' +
        '"semanal" (`hora` e `dias`, 0 é domingo; sem `dias`, todo dia), "a-cada" (`a_cada_horas`, ' +
        'de `hora` até `ate`, nos `dias`) ou "mensal" (`dia_do_mes` e `hora`). `prompt`: o pedido ' +
        'completo, que se entenda sozinho numa conversa nova. `pasta`: onde rodar (opcional). ' +
        'Para um aviso condicional ("me avisa se for chover amanhã", "se o site cair"), escreva o ' +
        'prompt para responder exatamente NADA quando não houver o que avisar: a resposta NADA não ' +
        'é entregue (fica só uma linha no diário).',
      inputSchema: {
        nome: z.string(),
        prompt: z.string(),
        repetir: z.enum(['uma-vez', 'semanal', 'a-cada', 'mensal']).optional(),
        data: z.string().optional(),
        daqui_minutos: z.number().optional(),
        hora: z.string().optional(),
        dias: z.array(z.number().int().min(0).max(6)).optional(),
        a_cada_horas: z.number().optional(),
        ate: z.string().optional(),
        dia_do_mes: z.number().int().optional(),
        pasta: z.string().optional(),
        entregar: z.array(z.enum(['wisp', 'notificacao', 'telegram', 'mascote'])).optional()
      },
      _meta: ALWAYS_LOAD
    },
    async (input) => {
      const draft = taskFromInput(input, now())
      if ('error' in draft) return failed(draft.error)
      const tasks = options.tasks()
      if (tasks.length >= MAX_TASKS) {
        return failed(`Já há ${MAX_TASKS} tarefas: o usuário precisa tirar alguma antes.`)
      }
      const task: ScheduledTask = { id: `c-${randomBytes(4).toString('hex')}`, ...draft }
      options.save([...tasks, task])
      return text(`Tarefa agendada:\n${describeTask(task, now())}`)
    }
  )

  server.registerTool(
    'list_tasks',
    {
      title: 'Listar as tarefas agendadas',
      description:
        'As tarefas agendadas do Wisp (as do usuário e as que você agendou), com o id, o horário ' +
        'e a próxima vez que rodam, e a hora de agora.',
      annotations: { readOnlyHint: true },
      _meta: ALWAYS_LOAD
    },
    async () => {
      const at = now()
      const tasks = options.tasks()
      return text(
        `Agora: ${at.toLocaleString('pt-BR')}.\n` +
          (tasks.length
            ? tasks.map((task) => describeTask(task, at)).join('\n')
            : 'Nenhuma tarefa agendada.')
      )
    }
  )

  server.registerTool(
    'cancel_task',
    {
      title: 'Cancelar uma tarefa agendada',
      description:
        'Tira uma tarefa agendada pelo id (veja list_tasks). O usuário confirma no card.',
      inputSchema: { id: z.string() },
      _meta: ALWAYS_LOAD
    },
    async ({ id }) => {
      const tasks = options.tasks()
      const task = tasks.find((item) => item.id === id)
      if (!task) return failed(`Não achei a tarefa "${id}". Use list_tasks.`)
      options.save(tasks.filter((item) => item.id !== id))
      return text(`Tirei a tarefa "${task.name}".`)
    }
  )
}
