// O plano à vista (Fase 76): o plano que o Claude apresentou no modo Planejar (o ExitPlanMode)
// e a lista de passos dele (o TodoWrite), tirados dos itens da conversa. Puro: a aba Plano da
// bancada desenha.

/** Um passo da lista do Claude. */
export interface PlanTodo {
  text: string
  status: 'pending' | 'in_progress' | 'completed'
}

/** O plano apresentado e o que você respondeu. */
export interface PlanText {
  text: string
  status: 'waiting' | 'accepted' | 'refused'
}

/** O mínimo que estas funções olham de um item da conversa. */
interface PlanItem {
  kind: string
  name?: string
  toolName?: string
  input?: unknown
  status?: string
}

const STATUSES = ['pending', 'in_progress', 'completed']

/** A lista de passos mais recente (o último TodoWrite da conversa); vazia sem uma. */
export function latestTodos(items: readonly PlanItem[]): PlanTodo[] {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind !== 'tool' || item.name !== 'TodoWrite') continue
    const todos = (item.input as { todos?: unknown } | null)?.todos
    if (!Array.isArray(todos)) continue
    return (todos as Record<string, unknown>[]).flatMap((todo) => {
      if (!todo || typeof todo.content !== 'string' || !todo.content.trim()) return []
      const status = STATUSES.includes(todo.status as string) ? todo.status : 'pending'
      // Em andamento, o Claude dá a frase no gerúndio ("Rodando os testes").
      const text =
        status === 'in_progress' && typeof todo.activeForm === 'string' && todo.activeForm.trim()
          ? todo.activeForm
          : todo.content
      return [{ text: text.trim().slice(0, 300), status: status as PlanTodo['status'] }]
    })
  }
  return []
}

/** O plano mais recente (o último ExitPlanMode) e em que pé ficou; null sem um. */
export function latestPlan(items: readonly PlanItem[]): PlanText | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind !== 'permission' || item.toolName !== 'ExitPlanMode') continue
    const plan = (item.input as { plan?: unknown } | null)?.plan
    if (typeof plan !== 'string' || !plan.trim()) continue
    const status =
      item.status === 'pending'
        ? 'waiting'
        : item.status?.startsWith('allow')
          ? 'accepted'
          : 'refused'
    return { text: plan.slice(0, 50_000), status }
  }
  return null
}

/** Quantos passos já foram, e quantos são. */
export function planProgress(todos: readonly PlanTodo[]): { done: number; total: number } {
  return { done: todos.filter((todo) => todo.status === 'completed').length, total: todos.length }
}
