// A agenda que o Claude marca (Fase 83): os horários novos (uma vez, a cada N horas, todo mês), o
// pedido da ferramenta virando tarefa (o mesmo que o card mostra), as ferramentas schedule_task,
// list_tasks e cancel_task (agendar e cancelar sempre com o card), o agendador rodando uma tarefa
// de uma vez só, e a entrega do resultado.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ALWAYS_ASK, SAFE_TOOLS, sessionSettings } from '../src/main/claude-settings'
import { channels, deliver, lastReply } from '../src/main/delivery'
import { startDesktopServer } from '../src/main/mcp-server'
import { TaskScheduler } from '../src/main/scheduler'
import { describeSchedule, lastDue, nextRun, runsOn } from '../src/shared/prompts'
import type { ScheduledTask } from '../src/shared/prompts'
import { taskFromInput } from '../src/shared/schedule-input'

const base: ScheduledTask = {
  id: 't1',
  name: 'Teste',
  prompt: 'Faça algo',
  time: '09:00',
  days: [1, 2, 3, 4, 5],
  folder: null,
  enabled: true
}
/** Quinta-feira, 19 de novembro de 2026, 10:00. */
const NOW = new Date(2026, 10, 19, 10, 0)

test('agenda: uma vez só, num dia e hora', () => {
  const once = { ...base, repeat: 'once' as const, date: '2026-11-20', time: '15:30', days: [] }
  assert.deepEqual(nextRun(once, NOW), new Date(2026, 10, 20, 15, 30))
  assert.equal(lastDue(once, NOW), null)
  assert.deepEqual(lastDue(once, new Date(2026, 10, 20, 16, 0)), new Date(2026, 10, 20, 15, 30))
  assert.equal(nextRun(once, new Date(2026, 10, 21)), null, 'depois do dia, nunca mais')
  // Daqui a meses ainda acha.
  const far = { ...once, date: '2027-06-01' }
  assert.deepEqual(nextRun(far, NOW), new Date(2027, 5, 1, 15, 30))
  assert.match(describeSchedule(once), /uma vez, em 20\/11\/2026 às 15:30/)
})

test('agenda: a cada N horas numa janela, nos dias', () => {
  const every = {
    ...base,
    repeat: 'every' as const,
    everyHours: 3,
    time: '08:00',
    until: '18:00',
    days: [4]
  }
  assert.deepEqual(
    runsOn(every, NOW).map((date) => date.getHours()),
    [8, 11, 14, 17]
  )
  assert.deepEqual(nextRun(every, NOW), new Date(2026, 10, 19, 11, 0))
  assert.deepEqual(lastDue(every, NOW), new Date(2026, 10, 19, 8, 0))
  // Depois da janela de quinta, só na quinta seguinte.
  assert.deepEqual(nextRun(every, new Date(2026, 10, 19, 18, 0)), new Date(2026, 10, 26, 8, 0))
  assert.match(describeSchedule(every), /a cada 3 h, das 08:00 às 18:00, quinta/)
})

test('agenda: todo mês num dia (no mês curto, o último)', () => {
  const monthly = { ...base, repeat: 'monthly' as const, dayOfMonth: 31, time: '07:00', days: [] }
  assert.deepEqual(nextRun(monthly, NOW), new Date(2026, 10, 30, 7, 0), 'novembro tem 30 dias')
  assert.deepEqual(nextRun(monthly, new Date(2026, 10, 30, 8)), new Date(2026, 11, 31, 7, 0))
  assert.match(describeSchedule(monthly), /todo mês, no dia 31, às 07:00/)
  assert.match(describeSchedule(base), /dias úteis, às 09:00/)
})

test('agenda: o pedido da ferramenta vira a tarefa (o mesmo que o card mostra)', () => {
  const soon = taskFromInput(
    { nome: 'Deploy', prompt: 'Confere o deploy', daqui_minutos: 120 },
    NOW
  )
  assert.ok(!('error' in soon))
  assert.equal(soon.repeat, 'once')
  assert.equal(soon.date, '2026-11-19')
  assert.equal(soon.time, '12:00')
  assert.equal(soon.by, 'claude')
  assert.deepEqual(soon.deliver, ['main', 'notify', 'telegram', 'mascot'])
  const weekly = taskFromInput(
    {
      nome: 'PRs',
      prompt: 'Os PRs parados',
      repetir: 'semanal',
      hora: '08:00',
      dias: [1],
      entregar: ['wisp', 'telegram']
    },
    NOW
  )
  assert.ok(!('error' in weekly))
  assert.deepEqual(weekly.days, [1])
  assert.deepEqual(weekly.deliver, ['main', 'telegram'])
  const every = taskFromInput(
    { nome: 'Água', prompt: 'Lembre de beber água', repetir: 'a-cada', a_cada_horas: 2 },
    NOW
  )
  assert.ok(!('error' in every))
  assert.equal(every.time, '08:00')
  assert.equal(every.until, '22:00')
  assert.equal(every.days.length, 7, 'sem dias, todo dia')
  for (const [input, problem] of [
    [{ prompt: 'x' }, /nome/],
    [{ nome: 'x' }, /prompt/],
    [
      { nome: 'x', prompt: 'y', repetir: 'uma-vez', data: '2026-11-18', hora: '10:00' },
      /já passou/
    ],
    [
      { nome: 'x', prompt: 'y', repetir: 'uma-vez', data: '2026-02-30', hora: '10:00' },
      /não existe/
    ],
    [{ nome: 'x', prompt: 'y', repetir: 'semanal', hora: '25:00' }, /HH:MM/],
    [{ nome: 'x', prompt: 'y', repetir: 'mensal', hora: '10:00' }, /dia_do_mes/],
    [{ nome: 'x', prompt: 'y', repetir: 'a-cada', a_cada_horas: 30 }, /a_cada_horas/],
    [{ nome: 'x', prompt: 'y', repetir: 'semanal', hora: '10:00', dias: [] }, /dia da semana/]
  ] as const) {
    const result = taskFromInput(input, NOW)
    assert.ok('error' in result && problem.test(result.error), JSON.stringify(input))
  }
})

test('agenda: agendar e cancelar sempre pedem o card; listar é liberado', () => {
  assert.ok(ALWAYS_ASK.includes('mcp__desktop__schedule_task'))
  assert.ok(ALWAYS_ASK.includes('mcp__desktop__cancel_task'))
  assert.ok(SAFE_TOOLS.includes('mcp__desktop__list_tasks'))
  assert.ok(!SAFE_TOOLS.includes('mcp__desktop__schedule_task'))
  const ask = JSON.parse(sessionSettings()).permissions.ask as string[]
  assert.ok(ask.includes('mcp__desktop__schedule_task'))
  assert.ok(ask.some((rule) => rule.startsWith('Read(')))
})

test('agenda: as ferramentas gravam, listam e tiram', async () => {
  process.env.XDG_RUNTIME_DIR = join(HOME, 'run')
  let tasks: ScheduledTask[] = [{ ...base, id: 'sua', name: 'Sua tarefa' }]
  const server = await startDesktopServer({
    requestApproval: async () => ({ allow: false, message: 'não' }),
    notify: () => undefined,
    projectRoots: () => [],
    editorCommand: () => 'code',
    schedule: { tasks: () => tasks, save: (next) => (tasks = next), now: () => NOW }
  })
  try {
    const desktop = JSON.parse(readFileSync(server.configFor('c1'), 'utf8')).mcpServers.desktop
    const call = async (name: string, args: unknown) => {
      const res = await fetch(desktop.url, {
        method: 'POST',
        headers: {
          ...desktop.headers,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name, arguments: args }
        })
      })
      const body = await res.text()
      const line = body.split('\n').find((l) => l.startsWith('data:'))
      return JSON.parse(line ? line.slice(5) : body).result as {
        isError?: boolean
        content: { text: string }[]
      }
    }
    const added = await call('schedule_task', {
      nome: 'Resumo da sexta',
      prompt: 'Faça o resumo da semana',
      repetir: 'semanal',
      hora: '17:00',
      dias: [5]
    })
    assert.equal(added.isError, undefined)
    assert.equal(tasks.length, 2)
    const created = tasks[1]
    assert.match(created.id, /^c-[0-9a-f]{8}$/)
    assert.equal(created.by, 'claude')
    assert.match(added.content[0].text, /Resumo da sexta.*sexta, às 17:00.*próxima/)
    const bad = await call('schedule_task', { nome: 'x', prompt: 'y', repetir: 'mensal' })
    assert.equal(bad.isError, true)
    assert.equal(tasks.length, 2)
    const listed = await call('list_tasks', {})
    assert.match(listed.content[0].text, /Agora:/)
    assert.match(listed.content[0].text, /sua: "Sua tarefa"/)
    assert.match(listed.content[0].text, /criada pelo Claude/)
    const missing = await call('cancel_task', { id: 'nao' })
    assert.equal(missing.isError, true)
    const removed = await call('cancel_task', { id: created.id })
    assert.match(removed.content[0].text, /Tirei a tarefa "Resumo da sexta"/)
    assert.deepEqual(
      tasks.map((task) => task.id),
      ['sua']
    )
  } finally {
    server.close()
  }
})

test('agenda: o agendador roda a tarefa de uma vez só na hora, uma vez', () => {
  let now = new Date(2026, 10, 19, 11, 58).getTime()
  const ran: string[] = []
  const once: ScheduledTask = {
    ...base,
    id: 'uma',
    repeat: 'once',
    date: '2026-11-19',
    time: '12:00',
    days: []
  }
  const scheduler = new TaskScheduler({
    tasks: () => [once],
    run: (task) => ran.push(task.id),
    file: join(HOME, 'tarefas-uma.json'),
    now: () => now
  })
  scheduler.start()
  assert.deepEqual(ran, [])
  now = new Date(2026, 10, 19, 12, 0, 30).getTime()
  scheduler.refresh()
  assert.deepEqual(ran, ['uma'])
  now += 60 * 60_000
  scheduler.refresh()
  assert.deepEqual(ran, ['uma'], 'não roda de novo')
  scheduler.dispose()
})

test('entrega: o resultado vai para os lugares pedidos e para o diário', () => {
  const got: string[] = []
  const deps = {
    postMain: (text: string) => got.push(`wisp:${text}`),
    notify: (title: string, body: string) => got.push(`aviso:${title}:${body}`),
    mascot: (title: string, text: string) => got.push(`mascote:${text}`),
    diary: (line: string) => got.push(`diario:${line}`)
  }
  const result = {
    title: 'PRs parados',
    text: '## Três PRs\n\n- #12 espera há 5 dias',
    outcome: 'done' as const
  }
  const telegram: string[] = []
  channels.telegram = (title, text) => telegram.push(`${title}|${text}`)
  try {
    assert.deepEqual(deliver(result, undefined, deps), ['main', 'notify', 'mascot', 'telegram'])
    assert.equal(got[0], 'wisp:**PRs parados**\n\n## Três PRs\n\n- #12 espera há 5 dias')
    assert.equal(got[1], 'aviso:PRs parados:Três PRs - #12 espera há 5 dias')
    assert.match(got[3], /^diario:PRs parados: Três PRs/)
    assert.equal(telegram.length, 1)
    got.length = 0
    assert.deepEqual(deliver(result, ['notify'], deps), ['notify'])
    assert.equal(got.length, 2, 'só a notificação, e o diário')
  } finally {
    delete channels.telegram
  }
  // Sem o Telegram ligado, ele não conta.
  assert.deepEqual(deliver(result, ['telegram'], deps), [])
  assert.equal(
    lastReply([
      { type: 'user', text: 'antes', attachments: [] },
      { type: 'text', blockId: 'a', delta: 'velha' },
      { type: 'user', text: 'agora', attachments: [] },
      { type: 'text', blockId: 'b', delta: 'Parte 1' },
      { type: 'text', blockId: 'c', delta: 'Parte 2' }
    ]),
    'Parte 1\n\nParte 2'
  )
})
