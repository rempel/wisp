// Lembretes: os horários pedidos pelo Claude, marcar, avisar na hora, o app fechado no meio, os
// que venceram com ele fechado e o arquivo estragado.
import { HOME } from './helpers/home'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { Reminders, describeIn, describeWhen, parseWhen } from '../src/main/reminders'
import { checker } from './helpers/checks'

test('lembretes', async () => {
  const { check, done } = checker()
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const FILE = path.join(HOME, 'data', 'lembretes.json')
  fs.mkdirSync(path.dirname(FILE), { recursive: true })

  // 1. Horários (TZ=America/Sao_Paulo).
  const now = new Date(2026, 9, 10, 15, 0, 0) // sexta, 10/10/2026 15:00
  const at = (input) => parseWhen(input, now)
  check('1a minutos', at({ minutos: 1 }) === now.getTime() + 60000)
  check('1b 15:30 hoje', at({ horario: '15:30' }) === new Date(2026, 9, 10, 15, 30).getTime())
  check(
    '1c 14:00 já passou: amanhã',
    at({ horario: '14:00' }) === new Date(2026, 9, 11, 14, 0).getTime()
  )
  check('1d 9h05', at({ horario: '9h05' }) === new Date(2026, 9, 11, 9, 5).getTime())
  check(
    '1e data local',
    at({ horario: '2026-12-24 09:00' }) === new Date(2026, 11, 24, 9, 0).getTime()
  )
  check(
    '1f ISO com fuso',
    at({ horario: '2026-10-10T18:30:00Z' }) === Date.parse('2026-10-10T18:30:00Z')
  )
  check('1g os dois: erro', typeof at({ minutos: 1, horario: '15:00' }) === 'object')
  check('1h nenhum: erro', typeof at({}) === 'object')
  check(
    '1i minutos inválidos',
    typeof at({ minutos: -3 }) === 'object' && typeof at({ minutos: NaN }) === 'object'
  )
  check(
    '1j horário impossível',
    typeof at({ horario: '25:00' }) === 'object' &&
      typeof at({ horario: '2026-02-30 10:00' }) === 'object' &&
      typeof at({ horario: 'amanhã cedo' }) === 'object'
  )
  check(
    '1k descrições',
    describeWhen(new Date(2026, 9, 10, 15, 2).getTime(), now) === 'hoje às 15:02' &&
      describeWhen(new Date(2026, 9, 11, 8, 0).getTime(), now) === 'amanhã às 08:00' &&
      describeWhen(new Date(2026, 11, 24, 9, 0).getTime(), now) === 'em 24/12 às 09:00',
    describeWhen(new Date(2026, 9, 10, 15, 2).getTime(), now)
  )
  check(
    '1l daqui a',
    describeIn(now.getTime() + 60000, now.getTime()) === 'daqui a 1 minuto' &&
      describeIn(now.getTime() + 130 * 60000, now.getTime()) === 'daqui a 2 horas e 10 minutos' &&
      describeIn(now.getTime() + 5 * 86400000, now.getTime()) === 'daqui a 5 dias'
  )

  // 2. Marcar, listar, cancelar, gravar.
  const fired = []
  let r = new Reminders(FILE, {
    fire: (item, late) => fired.push({ text: item.text, late, delay: Date.now() - item.at })
  })
  r.start()
  const a = r.add('  Beber\n água  ', Date.now() + 700)
  const b = r.add('Ligar para a Ana', Date.now() + 60 * 60000)
  check('2a marca, com o texto limpo', a.text === 'Beber água' && /^[0-9a-f]{6}$/.test(a.id))
  check(
    '2b lista em ordem',
    r
      .list()
      .map((x) => x.text)
      .join() === 'Beber água,Ligar para a Ana'
  )
  const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  check(
    '2c gravado no arquivo, só do usuário',
    saved.length === 2 && (fs.statSync(FILE).mode & 0o777) === 0o600
  )
  check('2d passado: erro', 'error' in r.add('x', Date.now() - 1000))
  check('2e longe demais: erro', 'error' in r.add('x', Date.now() + 400 * 86400000))
  check('2f sem texto: erro', 'error' in r.add('   ', Date.now() + 1000))
  await sleep(1000)
  check(
    '2g avisa na hora',
    fired.length === 1 && fired[0].text === 'Beber água' && !fired[0].late && fired[0].delay < 200,
    JSON.stringify(fired)
  )
  check(
    '2h e sai da lista e do arquivo',
    r.list().length === 1 && JSON.parse(fs.readFileSync(FILE, 'utf8')).length === 1
  )
  check(
    '2i cancela',
    r.cancel(b.id)?.text === 'Ligar para a Ana' &&
      r.list().length === 0 &&
      r.cancel('nada') === null
  )
  r.dispose()

  // 3. App fechado no meio: o lembrete sai na hora certa depois de reabrir.
  r = new Reminders(FILE, {
    fire: (item, late) => fired.push({ text: item.text, late, delay: Date.now() - item.at })
  })
  r.start()
  r.add('Reunião', Date.now() + 1500)
  r.dispose() // "fechou o app"
  await sleep(300)
  r = new Reminders(FILE, {
    fire: (item, late) => fired.push({ text: item.text, late, delay: Date.now() - item.at })
  })
  r.start() // "abriu de novo", antes da hora
  await sleep(1600)
  const meeting = fired.find((f) => f.text === 'Reunião')
  check(
    '3a reaberto antes da hora: avisa na hora certa',
    meeting && !meeting.late && meeting.delay < 300,
    JSON.stringify(meeting)
  )
  r.dispose()

  // 4. Venceu com o app fechado: avisa atrasado ao abrir; muitos viram um aviso só.
  const old = (text, minutesAgo) => ({
    id: Math.random().toString(16).slice(2, 8),
    text,
    at: Date.now() - minutesAgo * 60000,
    createdAt: Date.now() - 999999
  })
  fs.writeFileSync(
    FILE,
    JSON.stringify([
      old('Remédio', 30),
      ...Array.from({ length: 7 }, (_, i) => old(`Velho ${i}`, 120 + i))
    ])
  )
  const late = []
  let missed = 0
  r = new Reminders(FILE, {
    fire: (item, isLate) => late.push({ text: item.text, isLate }),
    missed: (n) => {
      missed = n
    }
  })
  check('4a antes de start, nada sai', late.length === 0)
  r.start()
  check(
    '4b atrasados: até 5 avisos, o resto numa conta',
    late.length === 5 && late.every((l) => l.isLate) && missed === 3,
    `${late.length} ${missed}`
  )
  check(
    '4c o mais recente está entre os avisados',
    late.some((l) => l.text === 'Remédio')
  )
  check('4d e tudo sai do arquivo', JSON.parse(fs.readFileSync(FILE, 'utf8')).length === 0)
  r.dispose()

  // 5. Marcado antes de start (o app ainda abrindo) não apaga os guardados.
  fs.writeFileSync(FILE, JSON.stringify([old('Guardado', -60)]))
  r = new Reminders(FILE, { fire: () => {} })
  r.add('Novo', Date.now() + 120000)
  check(
    '5a os dois ficam',
    r
      .list()
      .map((x) => x.text)
      .sort()
      .join() === 'Guardado,Novo' && JSON.parse(fs.readFileSync(FILE, 'utf8')).length === 2
  )
  r.dispose()

  // 6. Arquivo estragado: começa vazio, sem erro.
  fs.writeFileSync(FILE, '{ estragado')
  r = new Reminders(FILE, { fire: () => {} })
  check('6a arquivo estragado: vazio', r.list().length === 0)
  fs.writeFileSync(
    FILE,
    JSON.stringify([{ id: 1 }, { id: 'x', text: 'ok', at: Date.now() + 1e6, createdAt: 1 }])
  )
  r = new Reminders(FILE, { fire: () => {} })
  check('6b entradas inválidas ficam de fora', r.list().length === 1)
  done()
})
