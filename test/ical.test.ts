// A leitura de iCalendar da agenda: linhas dobradas e parâmetros, datas com fuso (inclusive o
// horário de verão de outros países), dia inteiro, repetições (semanal, mensal, anual, com
// COUNT, UNTIL, BYDAY, BYMONTHDAY, BYSETPOS), datas excluídas, ocorrências alteradas ou
// canceladas. Os testes rodam no fuso de São Paulo (scripts/test.mjs).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  occurrences,
  parseDuration,
  parseLine,
  resolveZone,
  unescapeText,
  unfold
} from '../src/main/ical'

const cal = (...events: string[]): string =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n')
const event = (lines: string[]): string =>
  ['BEGIN:VEVENT', 'DTSTAMP:20260101T000000Z', ...lines, 'END:VEVENT'].join('\r\n')
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z')
const T = (text: string): number => Date.parse(text)
const all = (
  text: string,
  from = '2026-01-01T00:00:00Z',
  to = '2027-12-31T00:00:00Z'
): { start: string; end: string; title: string }[] =>
  occurrences([text], T(from), T(to), 'Teste').map((o) => ({
    start: iso(o.start),
    end: iso(o.end),
    title: o.title
  }))

test('linhas dobradas, parâmetros entre aspas e texto com escapes', () => {
  assert.deepEqual(unfold('SUMMARY:Reuni\r\n ão longa\r\nX:1\r\n'), [
    'SUMMARY:Reunião longa',
    'X:1'
  ])
  assert.deepEqual(parseLine('ATTENDEE;CN="Silva: Ana";ROLE=REQ:mailto:ana@x.y'), {
    name: 'ATTENDEE',
    params: { CN: 'Silva: Ana', ROLE: 'REQ' },
    value: 'mailto:ana@x.y'
  })
  assert.equal(
    unescapeText('Sala 3\\, prédio B\\nlevar\\; café\\\\'),
    'Sala 3, prédio B\nlevar; café\\'
  )
  assert.equal(parseDuration('PT1H30M'), 5400000)
  assert.equal(parseDuration('P1W'), 7 * 86400000)
  assert.equal(parseDuration('-PT15M'), -900000)
})

test('fusos: o do banco de fusos, os prefixos do libical e os nomes do Windows', () => {
  assert.equal(resolveZone('America/Sao_Paulo'), 'America/Sao_Paulo')
  assert.equal(
    resolveZone('/freeassociation.sourceforge.net/Tzfile/Europe/Berlin'),
    'Europe/Berlin'
  )
  assert.equal(resolveZone('/freeassociation.sourceforge.net/America/New_York'), 'America/New_York')
  assert.equal(resolveZone('E. South America Standard Time'), 'America/Sao_Paulo')
  assert.equal(resolveZone('Fuso Inventado'), null)
})

test('um evento com hora: no fuso dele, em UTC ou no fuso de quem usa', () => {
  const text = cal(
    event([
      'UID:a',
      'SUMMARY:SP',
      'DTSTART;TZID=America/Sao_Paulo:20261012T140000',
      'DTEND;TZID=America/Sao_Paulo:20261012T150000'
    ]),
    event([
      'UID:b',
      'SUMMARY:Berlim',
      'DTSTART;TZID=/freeassociation.sourceforge.net/Tzfile/Europe/Berlin:20261012T140000',
      'DURATION:PT30M'
    ]),
    event(['UID:c', 'SUMMARY:UTC', 'DTSTART:20261012T140000Z', 'DTEND:20261012T141500Z']),
    event(['UID:d', 'SUMMARY:Solto', 'DTSTART:20261012T080000']),
    event(['UID:e', 'SUMMARY:Fuso desconhecido', 'DTSTART;TZID=Lugar Nenhum:20261012T090000'])
  )
  assert.deepEqual(all(text), [
    { start: '2026-10-12T11:00:00Z', end: '2026-10-12T11:00:00Z', title: 'Solto' },
    { start: '2026-10-12T12:00:00Z', end: '2026-10-12T12:30:00Z', title: 'Berlim' },
    { start: '2026-10-12T12:00:00Z', end: '2026-10-12T12:00:00Z', title: 'Fuso desconhecido' },
    { start: '2026-10-12T14:00:00Z', end: '2026-10-12T14:15:00Z', title: 'UTC' },
    { start: '2026-10-12T17:00:00Z', end: '2026-10-12T18:00:00Z', title: 'SP' }
  ])
})

test('dia inteiro: da meia-noite local à do dia seguinte (ou de vários dias)', () => {
  const text = cal(
    event(['UID:f', 'SUMMARY:Feriado', 'DTSTART;VALUE=DATE:20261012', 'DTEND;VALUE=DATE:20261013']),
    event(['UID:g', 'SUMMARY:Viagem', 'DTSTART;VALUE=DATE:20261020', 'DTEND;VALUE=DATE:20261023'])
  )
  const [holiday, trip] = occurrences(
    [text],
    T('2026-10-01T00:00:00Z'),
    T('2026-11-01T00:00:00Z'),
    'x'
  )
  assert.equal(holiday.allDay, true)
  assert.equal(iso(holiday.start), '2026-10-12T03:00:00Z')
  assert.equal(iso(holiday.end), '2026-10-13T03:00:00Z')
  assert.equal((trip.end - trip.start) / 86400000, 3)
})

test('semanal com BYDAY e COUNT, diário com UNTIL e EXDATE', () => {
  const weekly = cal(
    event([
      'UID:w',
      'SUMMARY:Daily',
      'DTSTART;TZID=America/Sao_Paulo:20261012T100000',
      'DTEND;TZID=America/Sao_Paulo:20261012T101500',
      'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4'
    ])
  )
  assert.deepEqual(
    all(weekly).map((o) => o.start),
    ['2026-10-12T13:00:00Z', '2026-10-14T13:00:00Z', '2026-10-19T13:00:00Z', '2026-10-21T13:00:00Z']
  )
  const daily = cal(
    event([
      'UID:d',
      'SUMMARY:Remédio',
      'DTSTART;TZID=America/Sao_Paulo:20261001T080000',
      'RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261009T110000Z',
      'EXDATE;TZID=America/Sao_Paulo:20261005T080000'
    ])
  )
  assert.deepEqual(
    all(daily).map((o) => o.start.slice(0, 10)),
    ['2026-10-01', '2026-10-03', '2026-10-07', '2026-10-09']
  )
})

test('mensal: a última sexta, o dia 31 (pulando os meses curtos) e o último dia útil', () => {
  const lastFriday = cal(
    event([
      'UID:m1',
      'SUMMARY:Retro',
      'DTSTART;TZID=America/Sao_Paulo:20261030T160000',
      'RRULE:FREQ=MONTHLY;BYDAY=-1FR;COUNT=3'
    ])
  )
  assert.deepEqual(
    all(lastFriday).map((o) => o.start.slice(0, 10)),
    ['2026-10-30', '2026-11-27', '2026-12-25']
  )
  const day31 = cal(
    event([
      'UID:m2',
      'SUMMARY:Fechamento',
      'DTSTART:20261031T120000Z',
      'RRULE:FREQ=MONTHLY;COUNT=3'
    ])
  )
  assert.deepEqual(
    all(day31).map((o) => o.start.slice(0, 10)),
    ['2026-10-31', '2026-12-31', '2027-01-31']
  )
  const lastWorkday = cal(
    event([
      'UID:m3',
      'SUMMARY:Folha',
      'DTSTART:20261030T120000Z',
      'RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=3'
    ])
  )
  assert.deepEqual(
    all(lastWorkday).map((o) => o.start.slice(0, 10)),
    ['2026-10-30', '2026-11-30', '2026-12-31']
  )
})

test('anual: o aniversário de dia inteiro aparece só no ano da janela', () => {
  const birthday = cal(
    event([
      'UID:y',
      'SUMMARY:Aniversário da Ana',
      'DTSTART;VALUE=DATE:19900315',
      'RRULE:FREQ=YEARLY'
    ])
  )
  const found = all(birthday, '2027-03-01T00:00:00Z', '2027-04-01T00:00:00Z')
  assert.deepEqual(found, [
    { start: '2027-03-15T03:00:00Z', end: '2027-03-16T03:00:00Z', title: 'Aniversário da Ana' }
  ])
})

test('o horário de verão de outro país: a hora de parede fica, o instante muda', () => {
  const ny = cal(
    event([
      'UID:ny',
      'SUMMARY:Standup NY',
      'DTSTART;TZID=America/New_York:20261026T090000',
      'RRULE:FREQ=WEEKLY;COUNT=2'
    ])
  )
  // Nova York sai do horário de verão em 1º de novembro de 2026.
  assert.deepEqual(
    all(ny).map((o) => o.start),
    ['2026-10-26T13:00:00Z', '2026-11-02T14:00:00Z']
  )
})

test('uma ocorrência mudada de hora e outra cancelada; o evento cancelado inteiro some', () => {
  const text = cal(
    event([
      'UID:r',
      'SUMMARY:1:1',
      'DTSTART;TZID=America/Sao_Paulo:20261013T150000',
      'DURATION:PT30M',
      'RRULE:FREQ=WEEKLY;COUNT=3'
    ]),
    event([
      'UID:r',
      'SUMMARY:1:1 (mudou)',
      'RECURRENCE-ID;TZID=America/Sao_Paulo:20261020T150000',
      'DTSTART;TZID=America/Sao_Paulo:20261021T170000',
      'DURATION:PT30M'
    ]),
    event([
      'UID:r',
      'SUMMARY:1:1',
      'RECURRENCE-ID;TZID=America/Sao_Paulo:20261027T150000',
      'DTSTART;TZID=America/Sao_Paulo:20261027T150000',
      'STATUS:CANCELLED'
    ]),
    event(['UID:x', 'SUMMARY:Cancelada', 'DTSTART:20261013T120000Z', 'STATUS:CANCELLED'])
  )
  assert.deepEqual(all(text), [
    { start: '2026-10-13T18:00:00Z', end: '2026-10-13T18:30:00Z', title: '1:1' },
    { start: '2026-10-21T20:00:00Z', end: '2026-10-21T20:30:00Z', title: '1:1 (mudou)' }
  ])
})

test('só o que toca a janela; uma repetição antiga e sem fim não demora', () => {
  const text = cal(
    event([
      'UID:old',
      'SUMMARY:Todo dia desde 2010',
      'DTSTART:20100101T120000Z',
      'RRULE:FREQ=DAILY'
    ]),
    event(['UID:long', 'SUMMARY:Conferência', 'DTSTART:20261010T120000Z', 'DTEND:20261014T120000Z'])
  )
  const started = Date.now()
  const found = all(text, '2026-10-12T00:00:00Z', '2026-10-13T00:00:00Z')
  assert.ok(Date.now() - started < 500, 'rápido')
  assert.deepEqual(
    found.map((o) => o.title),
    ['Conferência', 'Todo dia desde 2010']
  )
})
