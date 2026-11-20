// A sua lista de tarefas no servidor `desktop` (Fase 95): o Claude põe, lista e marca como feita
// sem pedir permissão, porque só mexem na lista do próprio Wisp (tarefas.json), à vista no bloco
// Minhas tarefas do Início, onde dá para desfazer.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Todos } from './home-store'
import type { Todo } from '../shared/ipc'

export interface TodoToolsOptions {
  todos: () => Todos
  now?: () => number
}

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean }
const text = (content: string): Result => ({ content: [{ type: 'text', text: content }] })
const failed = (content: string): Result => ({ ...text(content), isError: true })

/** "2026-11-27" ou "2026-11-27 18:00" → o instante, no fuso do computador; null se inválido. */
export function parseDue(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(value.trim())
  if (!match) return null
  const [, y, m, d, hh, mm] = match
  const date = new Date(+y, +m - 1, +d, hh ? +hh : 0, mm ? +mm : 0)
  return Number.isNaN(date.getTime()) || date.getMonth() !== +m - 1 ? null : date.getTime()
}

/** O prazo em texto: "2026-11-27", ou "2026-11-27 18:00" se tem hora. */
export function describeDue(due: number): string {
  const date = new Date(due)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0
  return hasTime ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day
}

/** A lista em texto para o Claude. */
export function describeTodos(list: Todo[], now: number): string {
  const open = list.filter((todo) => todo.doneAt === null)
  const done = list.filter((todo) => todo.doneAt !== null).slice(0, 5)
  if (!open.length && !done.length) return 'A lista de tarefas do usuário está vazia.'
  const line = (todo: Todo): string => {
    const parts = [todo.text]
    if (todo.star) parts.push('importante')
    if (todo.due !== null) {
      parts.push(
        `prazo ${describeDue(todo.due)}${todo.due < now && !todo.doneAt ? ' (atrasada)' : ''}`
      )
    }
    return `- [${todo.id.slice(0, 8)}] ${parts.join(' · ')}`
  }
  const out = [`Abertas (${open.length}):`, ...open.map(line)]
  if (done.length) out.push('', 'Feitas há pouco:', ...done.map(line))
  return out.join('\n')
}

export function registerTodoTools(server: McpServer, options: TodoToolsOptions): void {
  const now = (): number => options.now?.() ?? Date.now()

  server.registerTool(
    'todo_add',
    {
      title: 'Pôr na lista de tarefas',
      description:
        'Põe uma tarefa na lista pessoal do usuário (o bloco "Minhas tarefas" do Início do ' +
        'Wisp). Use quando ele pedir para anotar algo a fazer ("põe na minha lista…", "tenho que…' +
        ' até sexta"). `texto`: curto, no infinitivo ("Renovar o domínio"). `prazo`: AAAA-MM-DD ' +
        'ou "AAAA-MM-DD HH:MM", se ele disser. `importante`: só se ele disser que é. Para avisar ' +
        'numa hora, use set_reminder; para o Claude fazer algo sozinho, schedule_task.',
      inputSchema: {
        texto: z.string(),
        prazo: z.string().optional(),
        importante: z.boolean().optional()
      }
    },
    async ({ texto, prazo, importante }) => {
      const due = prazo ? parseDue(prazo) : null
      if (prazo && due === null)
        return failed('O prazo precisa ser AAAA-MM-DD ou AAAA-MM-DD HH:MM.')
      const result = options
        .todos()
        .change({ kind: 'add', text: texto, due, star: importante }, 'wisp')
      if (!result || 'error' in result) return failed(`Não pus na lista: ${result?.error ?? ''}`)
      return text(`Na lista: ${result.text}${due !== null ? ` (prazo ${describeDue(due)})` : ''}.`)
    }
  )

  server.registerTool(
    'todo_list',
    {
      title: 'Ver a lista de tarefas',
      description:
        'A lista pessoal de tarefas do usuário: as abertas (com prazo, importantes e atrasadas) ' +
        'e as feitas há pouco. Só leitura.',
      inputSchema: {}
    },
    async () => text(describeTodos(options.todos().list(), now()))
  )

  server.registerTool(
    'todo_done',
    {
      title: 'Marcar tarefa como feita',
      description:
        'Marca como feita (ou, com `feita: false`, reabre) uma tarefa da lista pessoal. ' +
        '`tarefa`: o id curto que todo_list mostra, ou um pedaço do texto. Com mais de uma ' +
        'parecida, nada muda e a resposta lista as opções.',
      inputSchema: { tarefa: z.string(), feita: z.boolean().optional() }
    },
    async ({ tarefa, feita }) => {
      const list = options.todos().list()
      const byId = list.filter((todo) => todo.id.startsWith(tarefa.trim()))
      const found = byId.length === 1 ? byId : options.todos().find(tarefa)
      if (!found.length) return failed('Nenhuma tarefa com esse texto na lista.')
      if (found.length > 1) {
        return failed(
          `Mais de uma parecida; diga qual pelo id:\n${found
            .map((todo) => `- [${todo.id.slice(0, 8)}] ${todo.text}`)
            .join('\n')}`
        )
      }
      const result = options
        .todos()
        .change({ kind: 'done', id: found[0].id, done: feita ?? true }, 'wisp')
      if (!result || 'error' in result) return failed(result?.error ?? 'não deu')
      return text(`${feita === false ? 'Reaberta' : 'Feita'}: ${result.text}.`)
    }
  )
}
