// Os prompts salvos e as tarefas agendadas (Fase 26): as variáveis, os horários (os próximos e os
// que passaram), o agendador (que não roda o passado de uma tarefa nova, recupera a hora perdida
// com o Wisp fechado só até 2 horas depois e nunca roda duas vezes), o config.json e o menu da
// barra.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { CONFIG_PATH, checkSettings, loadConfig } from '../src/main/config'
import { CATCH_UP_MS, TaskScheduler } from '../src/main/scheduler'
import { SETTINGS_KEYS } from '../src/shared/ipc'
import {
  defaultPrompts,
  expandPrompt,
  lastDue,
  nextRun,
  promptPreview,
  usesClipboard
} from '../src/shared/prompts'
import type { ScheduledTask } from '../src/shared/prompts'
import { matchCommands } from '../src/renderer/chat/slash'

const VALUES = {
  folder: '/home/ana/site',
  clipboard: 'TypeError: x is undefined',
  date: 'hoje',
  time: '09:00'
}

test('prompts: as variáveis em português e em inglês, e o resto como está', () => {
  assert.equal(
    expandPrompt('Revise {pasta} e {folder}; erro: {copiado} / {clipboard}', VALUES),
    'Revise /home/ana/site e /home/ana/site; erro: TypeError: x is undefined / TypeError: x is undefined'
  )
  assert.equal(
    expandPrompt('{data} às {hora} ({Date}, {TIME})', VALUES),
    'hoje às 09:00 (hoje, 09:00)'
  )
  assert.equal(expandPrompt('{outra} e {pasta', VALUES), '{outra} e {pasta')
  assert.equal(usesClipboard('o que é {copiado}?'), true)
  assert.equal(usesClipboard('o que é {CLIPBOARD}?'), true)
  assert.equal(usesClipboard('o diff de {pasta}'), false)
  assert.equal(promptPreview('primeira linha\nsegunda'), 'primeira linha')
  assert.equal(promptPreview('x'.repeat(100), 10), 'xxxxxxxxx…')
})

const task = (patch: Partial<ScheduledTask> = {}): ScheduledTask => ({
  id: 'resumo',
  name: 'Resumo dos PRs',
  prompt: 'Resuma os meus PRs abertos',
  time: '09:00',
  days: [1, 2, 3, 4, 5],
  folder: null,
  enabled: true,
  ...patch
})
// 2026-10-19 é uma segunda-feira.
const at = (day: number, hour: number, minute = 0): Date => new Date(2026, 9, day, hour, minute)

test('tarefas: a próxima vez e a última que devia ter rodado', () => {
  // Segunda às 8h: hoje às 9h. Às 9h em ponto: amanhã.
  assert.deepEqual(nextRun(task(), at(19, 8)), at(19, 9))
  assert.deepEqual(nextRun(task(), at(19, 9)), at(20, 9))
  // Sexta depois das 9h: a segunda seguinte (sábado e domingo ficam de fora).
  assert.deepEqual(nextRun(task(), at(23, 10)), at(26, 9))
  assert.deepEqual(nextRun(task({ days: [0] }), at(23, 10)), at(25, 9))
  assert.equal(nextRun(task({ enabled: false }), at(19, 8)), null)
  assert.equal(nextRun(task({ days: [] }), at(19, 8)), null)
  // A última: na segunda às 8h, a sexta anterior; às 9h05, a de hoje.
  assert.deepEqual(lastDue(task(), at(19, 8)), at(16, 9))
  assert.deepEqual(lastDue(task(), at(19, 9, 5)), at(19, 9))
  assert.deepEqual(lastDue(task(), at(19, 9)), at(19, 9))
  assert.equal(lastDue(task({ enabled: false }), at(19, 9, 5)), null)
})

function scheduler(tasks: () => ScheduledTask[], file: string, clock: { now: Date }) {
  const ran: { id: string; late: boolean; at: number }[] = []
  const s = new TaskScheduler({
    tasks,
    run: (item, late) => ran.push({ id: item.id, late, at: clock.now.getTime() }),
    file,
    now: () => clock.now.getTime()
  })
  return { s, ran }
}

test('tarefas: uma nova não roda o passado, e cada hora roda uma vez só', () => {
  const file = join(HOME, 'tarefas-1.json')
  const clock = { now: at(19, 10) }
  let list = [task()]
  const { s, ran } = scheduler(() => list, file, clock)
  s.start()
  assert.deepEqual(ran, [], 'criada às 10h, a das 9h de hoje não roda')
  clock.now = at(20, 9)
  s.refresh()
  assert.deepEqual(ran, [{ id: 'resumo', late: false, at: at(20, 9).getTime() }])
  clock.now = at(20, 9, 0)
  s.refresh()
  clock.now = new Date(at(20, 9).getTime() + 30_000)
  s.refresh()
  assert.equal(ran.length, 1, 'a mesma hora não roda de novo')
  assert.deepEqual(s.runs(), { resumo: at(20, 9).getTime() })
  // Mexer no horário recomeça a contagem: a nova hora, já passada hoje, não roda agora.
  clock.now = at(20, 11)
  list = [task({ time: '10:30' })]
  s.refresh()
  assert.equal(ran.length, 1)
  clock.now = at(21, 10, 30)
  s.refresh()
  assert.equal(ran.length, 2)
  // Tirada da lista, sai do arquivo.
  list = []
  s.refresh()
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {})
  s.dispose()
})

test('tarefas: com o Wisp fechado, recupera até 2 horas depois', () => {
  const file = join(HOME, 'tarefas-2.json')
  const clock = { now: at(19, 8) }
  const list = [task()]
  let first = scheduler(() => list, file, clock)
  first.s.start()
  first.s.dispose()
  // O Wisp fechou às 8h e abriu às 10h30: a das 9h roda, atrasada.
  clock.now = at(19, 10, 30)
  const second = scheduler(() => list, file, clock)
  second.s.start()
  assert.deepEqual(second.ran, [{ id: 'resumo', late: true, at: at(19, 10, 30).getTime() }])
  second.s.dispose()
  // No dia seguinte, abriu só às 11h01 (mais de 2 horas depois): fica para a próxima.
  clock.now = new Date(at(20, 9).getTime() + CATCH_UP_MS + 60_000)
  first = scheduler(() => list, file, clock)
  first.s.start()
  assert.deepEqual(first.ran, [])
  clock.now = at(21, 9)
  first.s.refresh()
  assert.equal(first.ran.length, 1)
  first.s.dispose()
})

test('tarefas: rodar agora, ligada ou não, e um arquivo estragado', () => {
  const file = join(HOME, 'tarefas-3.json')
  writeFileSync(file, 'isto não é json')
  const clock = { now: at(19, 12) }
  const list = [task({ enabled: false })]
  const { s, ran } = scheduler(() => list, file, clock)
  s.start()
  assert.equal(s.runNow('resumo'), true)
  assert.equal(s.runNow('nao-existe'), false)
  assert.deepEqual(ran, [{ id: 'resumo', late: false, at: at(19, 12).getTime() }])
  assert.deepEqual(s.runs(), { resumo: at(19, 12).getTime() })
  s.dispose()
})

test('config: os prompts e as tarefas, com os padrões e o que é recusado', () => {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, '{}')
  const config = loadConfig()
  assert.deepEqual(
    config.prompts.map((prompt) => prompt.name),
    defaultPrompts().map((prompt) => prompt.name)
  )
  assert.ok(
    config.prompts.some((prompt) => prompt.name === 'diff' && /\{pasta\}/.test(prompt.text))
  )
  assert.deepEqual(config.scheduledTasks, [])
  assert.ok((SETTINGS_KEYS as readonly string[]).includes('prompts'))
  assert.ok((SETTINGS_KEYS as readonly string[]).includes('scheduledTasks'))
  const ok = (patch: unknown): boolean => checkSettings(patch).ok
  assert.equal(ok({ prompts: [{ name: 'revisar', text: 'Revise {pasta}' }] }), true)
  assert.equal(ok({ prompts: [{ name: 'compact', text: 'x' }] }), false, 'nome do Wisp')
  assert.equal(ok({ prompts: [{ name: 'Revisar', text: 'x' }] }), false, 'maiúscula')
  assert.equal(ok({ prompts: [{ name: 'a b', text: 'x' }] }), false, 'espaço')
  assert.equal(ok({ prompts: [{ name: 'a', text: '   ' }] }), false, 'sem texto')
  assert.equal(
    ok({
      prompts: [
        { name: 'a', text: 'x' },
        { name: 'a', text: 'y' }
      ]
    }),
    false,
    'repetido'
  )
  assert.equal(ok({ scheduledTasks: [task()] }), true)
  assert.equal(ok({ scheduledTasks: [task({ time: '9:00' })] }), false)
  assert.equal(ok({ scheduledTasks: [task({ time: '24:00' })] }), false)
  assert.equal(ok({ scheduledTasks: [task({ days: [7] })] }), false)
  assert.equal(ok({ scheduledTasks: [task({ prompt: '' })] }), false)
  assert.equal(ok({ scheduledTasks: [task(), task()] }), false, 'id repetido')
  // No arquivo, uma lista estragada cai no padrão, sem levar o resto junto.
  writeFileSync(
    CONFIG_PATH,
    JSON.stringify({ prompts: 'x', scheduledTasks: [task()], sound: false })
  )
  const mixed = loadConfig()
  assert.equal(mixed.prompts.length, defaultPrompts().length)
  assert.equal(mixed.scheduledTasks.length, 1)
  assert.equal(mixed.sound, false)
})

test('menu da barra: os prompts salvos depois dos do Wisp, na frente do Claude Code', () => {
  const prompts = [
    { name: 'review', text: 'A minha revisão\ncom detalhes' },
    { name: 'commit', text: 'A mensagem de commit' },
    { name: 'clear', text: 'não entra: é do Wisp' }
  ]
  const all = matchCommands('', ['review', 'init', 'cost'], prompts)
  assert.deepEqual(
    all.map((command) => command.name),
    ['compact', 'clear', 'review', 'commit', 'init', 'cost']
  )
  const review = all.find((command) => command.name === 'review')
  assert.equal(review?.prompt, true)
  assert.equal(review?.description, 'A minha revisão')
  assert.equal(all.find((command) => command.name === 'clear')?.prompt, undefined)
  assert.deepEqual(
    matchCommands('com', [], prompts).map((command) => command.name),
    ['compact', 'commit']
  )
})
