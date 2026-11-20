// O Início como painel de controle (Fases 92 a 97): a arrumação dos blocos (conferida, movida,
// redimensionada, escondida), as suas tarefas e os hábitos (no disco), as ferramentas todo_* do
// servidor `desktop`, o clima (desligado sem cidade, de meia em meia hora), o diário de hoje e a
// atividade por dia.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ROOT } from './helpers/paths'
import {
  BLOCKS,
  columnsFor,
  defaultLayout,
  moveBlock,
  resizeBlock,
  resolveLayout,
  setHidden,
  spanFor,
  stepBlock
} from '../src/renderer/chat/home/layout'
import { Habits, Todos } from '../src/main/home-store'
import { streak, dayKey } from '../src/shared/home-days'
import { describeDue, describeTodos, parseDue } from '../src/main/mcp-todos'
import { parseForecast, Weather, WEATHER_TTL_MS } from '../src/main/weather'
import { activityDays, feedLines } from '../src/main/home-ipc'
import type { ActivityLog } from '../src/main/activity'
import { SAFE_TOOLS } from '../src/main/claude-settings'
import { startDesktopServer } from '../src/main/mcp-server'
import { checkSettings } from '../src/main/config'

const ids = (layout: { id: string }[]): string[] => layout.map((item) => item.id)

test('painel: todo bloco do catálogo tem conteúdo no Início, e nenhum sobra', () => {
  const text = readFileSync(join(ROOT, 'src/renderer/chat/HomeView.tsx'), 'utf8')
  const catalog = text.slice(text.indexOf('function catalog'), text.indexOf('/** O relógio'))
  const registered = [...catalog.matchAll(/^\s+'?([a-z-]+)'?: block\(/gm)].map((m) => m[1])
  assert.deepEqual([...registered].sort(), ids(BLOCKS).sort())
  // E o padrão é o modelo C: dez blocos à vista, o resto na lista.
  assert.equal(defaultLayout().filter((item) => !item.hidden).length, 10)
})

test('painel: a arrumação guardada é conferida e ganha os blocos novos no fim', () => {
  const layout = resolveLayout([
    { id: 'tarefas', w: 99, h: 0, hidden: false },
    { id: 'tarefas', w: 4, h: 4, hidden: false },
    { id: 'nao-existe', w: 4, h: 4, hidden: false },
    { id: 'clima', w: 3, h: 4, hidden: false }
  ])
  assert.deepEqual(layout.slice(0, 2), [
    { id: 'tarefas', w: 12, h: 3, hidden: false },
    { id: 'clima', w: 3, h: 4, hidden: false }
  ])
  assert.equal(layout.length, BLOCKS.length)
  assert.deepEqual(resolveLayout(null), defaultLayout())
  assert.deepEqual(resolveLayout([]), defaultLayout())
})

test('painel: mover, redimensionar e esconder', () => {
  const start = defaultLayout()
  const moved = moveBlock(start, 'agenda', 'precisa', false)
  assert.deepEqual(ids(moved).slice(0, 2), ['agenda', 'precisa'])
  assert.deepEqual(ids(moveBlock(start, 'precisa', 'calendario', true)).slice(0, 2), [
    'calendario',
    'precisa'
  ])
  assert.equal(moveBlock(start, 'agenda', 'agenda', true), start)
  // Pelo teclado: passa o vizinho à vista (os escondidos não contam).
  const step = stepBlock(start, 'semana-wisp', 1)
  assert.deepEqual(step, start, 'o último à vista não tem para onde ir')
  assert.deepEqual(ids(stepBlock(start, 'calendario', -1)).slice(0, 2), ['calendario', 'precisa'])
  // O tamanho fica entre o mínimo e o máximo do bloco.
  const big = resizeBlock(start, 'calendario', 40, 1)
  assert.deepEqual(
    big.find((item) => item.id === 'calendario'),
    { id: 'calendario', w: 12, h: 4, hidden: false }
  )
  const hidden = setHidden(start, 'uso', true)
  assert.equal(hidden.find((item) => item.id === 'uso')?.hidden, true)
  const back = setHidden(hidden, 'uso', false)
  assert.equal(back[back.length - 1].id, 'uso', 'o que volta aparece no fim')
})

test('painel: numa janela estreita, os blocos se ajustam às colunas que cabem', () => {
  assert.equal(columnsFor(1300), 12)
  assert.equal(columnsFor(700), 6)
  assert.equal(columnsFor(400), 2)
  assert.equal(spanFor(5, 12), 5)
  assert.equal(spanFor(5, 6), 3)
  assert.equal(spanFor(12, 2), 2)
  assert.equal(spanFor(3, 2), 1)
})

test('painel: o config.json aceita a arrumação e o clima, e recusa o que não é', () => {
  assert.equal(
    checkSettings({ homeLayout: [{ id: 'agenda', w: 4, h: 5, hidden: false }] }).ok,
    true
  )
  assert.equal(
    checkSettings({ homeLayout: [{ id: 'Agenda!', w: 4, h: 5, hidden: false }] }).ok,
    false
  )
  assert.equal(checkSettings({ homeLayout: null }).ok, true)
})

test('tarefas: pôr, marcar, a estrela na frente, e o arquivo só do usuário', () => {
  let now = new Date(2026, 10, 20, 10).getTime()
  const file = join(HOME, 'tarefas-teste.json')
  const todos = new Todos(file, () => now)
  const a = todos.change({ kind: 'add', text: '  Comprar   café ' })
  const b = todos.change({ kind: 'add', text: 'Renovar o domínio', star: true, due: now })
  assert.ok(a && !('error' in a) && b && !('error' in b))
  assert.equal(a.text, 'Comprar café')
  assert.deepEqual(
    todos.list().map((todo) => todo.text),
    ['Renovar o domínio', 'Comprar café']
  )
  assert.deepEqual(todos.change({ kind: 'add', text: '   ' }), { error: 'a tarefa está vazia' })
  todos.change({ kind: 'done', id: b.id, done: true })
  assert.deepEqual(
    todos.list().map((todo) => [todo.text, todo.doneAt !== null]),
    [
      ['Comprar café', false],
      ['Renovar o domínio', true]
    ]
  )
  // Volta igual do disco, e as feitas há mais de 30 dias saem.
  assert.equal(new Todos(file, () => now).list().length, 2)
  now += 31 * 24 * 60 * 60_000
  assert.deepEqual(
    new Todos(file, () => now).list().map((todo) => todo.text),
    ['Comprar café']
  )
  assert.equal(todos.find('CAFE').length, 1)
  if (process.platform !== 'win32') {
    assert.equal(statSync(file).mode & 0o777, 0o600)
  }
})

test('hábitos: marcar e desmarcar o dia, e os dias seguidos', () => {
  const habits = new Habits(join(HOME, 'habitos-teste.json'))
  const [habit] = habits.change({ kind: 'add', name: 'Exercício' })
  const now = new Date(2026, 10, 20, 12).getTime()
  const day = (back: number): string => dayKey(now - back * 24 * 60 * 60_000)
  for (const back of [0, 1, 2, 4]) habits.change({ kind: 'toggle', id: habit.id, day: day(back) })
  assert.equal(streak(habits.list()[0].days, now), 3)
  habits.change({ kind: 'toggle', id: habit.id, day: day(0) })
  // Hoje ainda não: conta até ontem.
  assert.equal(streak(habits.list()[0].days, now), 2)
  habits.change({ kind: 'toggle', id: habit.id, day: 'ontem' })
  assert.equal(habits.list()[0].days.length, 3, 'um dia fora do formato não entra')
  assert.equal(habits.change({ kind: 'remove', id: habit.id }).length, 0)
})

test('tarefas: o prazo das ferramentas, e a lista em texto para o Claude', () => {
  const due = parseDue('2026-11-27 18:00')
  assert.equal(due, new Date(2026, 10, 27, 18).getTime())
  assert.equal(parseDue('2026-02-30'), null)
  assert.equal(parseDue('sexta'), null)
  assert.equal(describeDue(new Date(2026, 10, 27).getTime()), '2026-11-27')
  const now = new Date(2026, 10, 28).getTime()
  const text = describeTodos(
    [
      {
        id: 'abcdef1234',
        text: 'Renovar o domínio',
        due,
        star: true,
        doneAt: null,
        createdAt: 0,
        by: 'voce'
      }
    ],
    now
  )
  assert.match(
    text,
    /\[abcdef12\] Renovar o domínio · importante · prazo 2026-11-27 18:00 \(atrasada\)/
  )
  assert.ok(
    ['todo_add', 'todo_list', 'todo_done'].every((name) =>
      SAFE_TOOLS.includes(`mcp__desktop__${name}`)
    )
  )
})

test('tarefas: o Claude põe, lista e marca pelo servidor desktop', async () => {
  process.env.XDG_RUNTIME_DIR = join(HOME, 'run')
  const todos = new Todos(join(HOME, 'tarefas-mcp.json'))
  const server = await startDesktopServer({
    requestApproval: async () => ({ allow: false, message: 'não' }),
    notify: () => undefined,
    projectRoots: () => [],
    editorCommand: () => 'code',
    todos: { todos: () => todos }
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
    const added = await call('todo_add', { texto: 'Comprar café', prazo: '2026-11-21' })
    assert.equal(added.isError, undefined)
    assert.match(added.content[0].text, /Na lista: Comprar café \(prazo 2026-11-21\)/)
    assert.equal(todos.list()[0].by, 'wisp')
    assert.equal((await call('todo_add', { texto: 'x', prazo: 'amanhã' })).isError, true)
    assert.match((await call('todo_list', {})).content[0].text, /Comprar café/)
    const done = await call('todo_done', { tarefa: 'café' })
    assert.match(done.content[0].text, /Feita: Comprar café/)
    assert.notEqual(todos.list()[0].doneAt, null)
    assert.equal((await call('todo_done', { tarefa: 'nada disso' })).isError, true)
  } finally {
    server.close()
  }
})

test('clima: desligado sem cidade, sem consultar nada; com ela, de meia em meia hora', async () => {
  const urls: string[] = []
  let place: { place: string; lat: number; lon: number } | null = null
  let now = 1_000_000
  const body = {
    current: { temperature_2m: 24.4, weather_code: 2 },
    daily: {
      time: ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'],
      weather_code: [2, 61, 3, 0],
      temperature_2m_max: [28.2, 25, 26, 30],
      temperature_2m_min: [18, 17.6, 16, 19]
    }
  }
  const weather = new Weather(
    () => place,
    async (url) => {
      urls.push(url)
      return { ok: true, status: 200, json: async () => body }
    },
    () => now
  )
  assert.deepEqual(await weather.get(), { state: 'off' })
  assert.equal(urls.length, 0)
  place = { place: 'Recife', lat: -8.05, lon: -34.9 }
  const first = await weather.get()
  assert.equal(first.state, 'ok')
  if (first.state === 'ok') {
    assert.equal(first.report.now, 24)
    assert.equal(first.report.max, 28)
    assert.equal(first.report.days.length, 3)
  }
  now += WEATHER_TTL_MS - 1
  await weather.get()
  assert.equal(urls.length, 1)
  now += 2
  await weather.get()
  assert.equal(urls.length, 2)
  assert.match(urls[0], /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=-8\.05/)
  assert.throws(() => parseForecast('x', {}, 0), /incompleta/)
})

test('painel: o diário de hoje vira o "Hoje no Wisp", e a atividade conta por dia', () => {
  assert.deepEqual(
    feedLines('# Diário\n\n- 08:00 Tarefa rodou\n- texto solto\n- 14:30 Batimento: nada\n'),
    [
      { time: '08:00', text: 'Tarefa rodou' },
      { time: '14:30', text: 'Batimento: nada' }
    ]
  )
  const now = new Date(2026, 10, 20, 15).getTime()
  const today = new Date(2026, 10, 20).getTime()
  const yesterday = new Date(2026, 10, 19).getTime()
  const log = {
    entries: () => [
      { t: today + 1000, k: 'conversa' },
      { t: today + 2000, k: 'turno', ms: 10, fim: 'done' },
      { t: yesterday + 5000, k: 'turno', ms: 10, fim: 'done' },
      { t: yesterday + 6000, k: 'edicao', mais: 1, menos: 0 }
    ]
  } as unknown as ActivityLog
  const days = activityDays(log, 3, now)
  assert.equal(days.length, 3)
  assert.deepEqual(days[2], { day: today, conversations: 1, turns: 1, edits: 0, reminders: 0 })
  assert.deepEqual(days[1], { day: yesterday, conversations: 0, turns: 1, edits: 1, reminders: 0 })
  assert.equal(activityDays(null, 999, now).length, 63)
})

test('painel: nenhum arquivo do Início passa de 1000 linhas', () => {
  const dir = join(ROOT, 'src/renderer/chat/home')
  for (const name of readdirSync(dir)) {
    const lines = readFileSync(join(dir, name), 'utf8').split('\n').length
    assert.ok(lines <= 1000, `${name} tem ${lines} linhas`)
  }
})
