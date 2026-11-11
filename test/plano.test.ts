// O plano à vista (Fase 76): a lista de passos mais recente (o TodoWrite) e o plano apresentado
// (o ExitPlanMode), tirados dos itens da conversa.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { latestPlan, latestTodos, planProgress } from '../src/shared/plan'

const todo = (todos: unknown): { kind: string; name: string; input: unknown } => ({
  kind: 'tool',
  name: 'TodoWrite',
  input: { todos }
})

test('os passos: a lista mais recente, com a frase do que está em andamento', () => {
  const items = [
    todo([{ content: 'Ler o código', status: 'in_progress', activeForm: 'Lendo o código' }]),
    { kind: 'text', text: 'ok' },
    todo([
      { content: 'Ler o código', status: 'completed', activeForm: 'Lendo o código' },
      { content: 'Rodar os testes', status: 'in_progress', activeForm: 'Rodando os testes' },
      { content: 'Escrever o resumo', status: 'pending' },
      { content: '', status: 'pending' },
      { content: 'Estado estranho', status: 'talvez' },
      'solto'
    ])
  ]
  const todos = latestTodos(items)
  assert.deepEqual(todos, [
    { text: 'Ler o código', status: 'completed' },
    { text: 'Rodando os testes', status: 'in_progress' },
    { text: 'Escrever o resumo', status: 'pending' },
    { text: 'Estado estranho', status: 'pending' }
  ])
  assert.deepEqual(planProgress(todos), { done: 1, total: 4 })
  assert.deepEqual(latestTodos([{ kind: 'text' }]), [])
  assert.deepEqual(latestTodos([{ kind: 'tool', name: 'TodoWrite', input: { todos: 'x' } }]), [])
})

test('o plano: o último apresentado, e o que você respondeu', () => {
  const plan = (text: unknown, status: string): Record<string, unknown> => ({
    kind: 'permission',
    toolName: 'ExitPlanMode',
    input: { plan: text },
    status
  })
  assert.equal(latestPlan([{ kind: 'text' }]), null)
  assert.deepEqual(latestPlan([plan('# Plano A', 'deny'), plan('# Plano B', 'pending')] as never), {
    text: '# Plano B',
    status: 'waiting'
  })
  assert.equal(latestPlan([plan('x', 'allow-edits')] as never)?.status, 'accepted')
  assert.equal(latestPlan([plan('x', 'allow')] as never)?.status, 'accepted')
  assert.equal(latestPlan([plan('x', 'deny')] as never)?.status, 'refused')
  assert.equal(latestPlan([plan('x', 'cancelled')] as never)?.status, 'refused')
  // Um pedido de outra ferramenta, ou um plano vazio, não é um plano.
  assert.equal(latestPlan([{ kind: 'permission', toolName: 'Bash', input: { plan: 'x' } }]), null)
  assert.equal(latestPlan([plan('  ', 'pending')] as never), null)
})
