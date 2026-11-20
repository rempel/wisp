// O batimento (Fase 84): o CHECKLIST.md (criado com o de sempre), o pedido (só olhar, NADA sem
// nada), a resposta quieta, as tarefas internas (uma por horário, nos dias) e o agendador
// rodando a de um horário perdido ao abrir, se ainda der.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  checklist,
  heartbeatPrompt,
  heartbeatTasks,
  isHeartbeat,
  isQuiet
} from '../src/main/heartbeat'
import { TaskScheduler } from '../src/main/scheduler'
import { nextRun } from '../src/shared/prompts'

const memoryDir = join(HOME, 'memoria-batimento')

test('batimento: o checklist nasce com o de sempre e vale o que você escrever', () => {
  const first = checklist(memoryDir)
  assert.equal(first.path, join(memoryDir, 'CHECKLIST.md'))
  assert.match(first.text, /A agenda de hoje/)
  assert.match(first.text, /O GitHub/)
  assert.match(first.text, /O e-mail/)
  assert.equal(readFileSync(first.path, 'utf8'), first.text)
  writeFileSync(first.path, '# Checklist\n\n- Só a agenda.\n')
  assert.equal(checklist(memoryDir).text, '# Checklist\n\n- Só a agenda.\n')
})

test('batimento: o pedido diz o que olhar, que é só olhar e quando ficar quieto', () => {
  const prompt = heartbeatPrompt('# Checklist\n\n<!-- ajuda -->\n\n- A agenda.\n', '08:00')
  assert.match(prompt, /^Batimento do Wisp das 08:00/)
  assert.match(prompt, /list_events.*github_status.*list_reminders e list_tasks.*memory_search/s)
  assert.match(prompt, /Só olhe/)
  assert.match(prompt, /responda só NADA/)
  assert.match(prompt, /<checklist>[\s\S]*- A agenda\.[\s\S]*<\/checklist>/)
  assert.doesNotMatch(prompt, /ajuda/, 'o comentário de ajuda não vai')
  for (const quiet of ['NADA', 'nada.', '  NADA  ', '**NADA**', '']) {
    assert.equal(isQuiet(quiet), true, JSON.stringify(quiet))
  }
  for (const loud of ['Reunião às 9h', 'NADA de novo, mas o CI quebrou']) {
    assert.equal(isQuiet(loud), false, loud)
  }
})

test('batimento: uma tarefa interna por horário, nos dias; desligado, nenhuma', () => {
  const config = {
    heartbeat: true,
    heartbeatTimes: ['08:00', '13:00'],
    heartbeatDays: [1, 2, 3, 4, 5]
  }
  const tasks = heartbeatTasks(config, memoryDir)
  assert.deepEqual(
    tasks.map((task) => [task.id, task.time, task.name]),
    [
      ['batimento-08:00', '08:00', 'Batimento das 08:00'],
      ['batimento-13:00', '13:00', 'Batimento das 13:00']
    ]
  )
  assert.ok(tasks.every(isHeartbeat))
  assert.equal(isHeartbeat({ id: 'c-123' }), false)
  // Sábado de manhã: o próximo é segunda às 8h.
  assert.deepEqual(nextRun(tasks[0], new Date(2026, 10, 21, 9)), new Date(2026, 10, 23, 8, 0))
  assert.deepEqual(heartbeatTasks({ ...config, heartbeat: false }, memoryDir), [])
})

test('batimento: um horário perdido com o Wisp fechado roda ao abrir, até duas horas depois', () => {
  const config = { heartbeat: true, heartbeatTimes: ['08:00'], heartbeatDays: [4] }
  const file = join(HOME, 'tarefas-batimento.json')
  const ran: string[] = []
  // Primeiro uso, na quarta: começa a contar.
  let now = new Date(2026, 10, 18, 20, 0).getTime()
  const make = (): TaskScheduler =>
    new TaskScheduler({
      tasks: () => heartbeatTasks(config, memoryDir),
      run: (task, late) => ran.push(`${task.id}${late ? ' (atrasado)' : ''}`),
      file,
      now: () => now
    })
  let scheduler = make()
  scheduler.start()
  scheduler.dispose()
  // Quinta, 9h30: o das 8h passou com o Wisp fechado, e ainda dá.
  now = new Date(2026, 10, 19, 9, 30).getTime()
  scheduler = make()
  scheduler.start()
  assert.deepEqual(ran, ['batimento-08:00 (atrasado)'])
  scheduler.dispose()
})
