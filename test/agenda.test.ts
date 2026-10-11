// A agenda: as fontes do EDS (só as agendas ligadas e visíveis), os arquivos e as pastas .ics
// (com o nome do vdirsyncer), o aviso alguns minutos antes (uma vez só, e na hora se o app abriu
// em cima), o "próximo" do painel e o texto da ferramenta list_events.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { Agenda, describeAgenda, readIcsSources } from '../src/main/agenda'
import { calendarSources, parseKeyFile } from '../src/main/eds'
import type { Occurrence } from '../src/main/ical'

const ics = (...events: string[][]): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    ...events.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']),
    'END:VCALENDAR'
  ].join('\r\n')
const utc = (ms: number): string =>
  new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z')

test('as fontes do EDS: só as agendas ligadas e visíveis, pelo nome', () => {
  const data = (lines: string[]): string => ['', ...lines, ''].join('\n')
  const objects = {
    '/s/1': {
      'org.gnome.evolution.dataserver.Source': {
        UID: 'system-calendar',
        Data: data([
          '[Data Source]',
          'DisplayName=Personal',
          'DisplayName[pt_BR]=Pessoal',
          'Enabled=true',
          '[Calendar]',
          'BackendName=local',
          'Selected=true'
        ])
      }
    },
    '/s/2': {
      'org.gnome.evolution.dataserver.Source': {
        UID: 'hidden',
        Data: data(['[Data Source]', 'DisplayName=Escondida', '[Calendar]', 'Selected=false'])
      }
    },
    '/s/3': {
      'org.gnome.evolution.dataserver.Source': {
        UID: 'off',
        Data: data(['[Data Source]', 'DisplayName=Desligada', 'Enabled=false', '[Calendar]'])
      }
    },
    '/s/4': {
      'org.gnome.evolution.dataserver.Source': {
        UID: 'contacts',
        Data: data(['[Data Source]', 'DisplayName=Contatos', '[Address Book]'])
      }
    },
    '/s/5': {
      'org.gnome.evolution.dataserver.Source': {
        UID: 'google',
        Data: data(['[Data Source]', 'DisplayName=Trabalho', '[Calendar]', 'BackendName=caldav'])
      }
    }
  }
  assert.deepEqual(calendarSources(objects), [
    { uid: 'system-calendar', name: 'Personal' },
    { uid: 'google', name: 'Trabalho' }
  ])
  assert.deepEqual(parseKeyFile('# x\n[A]\nk=v=w\n[B]\n'), { A: { k: 'v=w' }, B: {} })
})

test('arquivos e pastas .ics: o nome do arquivo, ou o "displayname" da pasta do vdirsyncer', () => {
  const vdir = join(HOME, 'calendars')
  mkdirSync(join(vdir, 'trabalho'), { recursive: true })
  mkdirSync(join(vdir, 'casa'), { recursive: true })
  writeFileSync(join(vdir, 'trabalho', 'displayname'), 'Trabalho\n')
  writeFileSync(
    join(vdir, 'trabalho', 'a.ics'),
    ics(['UID:a', 'DTSTART:20261012T120000Z', 'SUMMARY:A'])
  )
  writeFileSync(
    join(vdir, 'trabalho', 'b.ics'),
    ics(['UID:b', 'DTSTART:20261012T130000Z', 'SUMMARY:B'])
  )
  writeFileSync(
    join(vdir, 'casa', 'c.ics'),
    ics(['UID:c', 'DTSTART:20261012T140000Z', 'SUMMARY:C'])
  )
  writeFileSync(join(vdir, 'casa', 'notas.txt'), 'não é agenda')
  writeFileSync(
    join(HOME, 'feriados.ics'),
    ics(['UID:f', 'DTSTART;VALUE=DATE:20261012', 'SUMMARY:F'])
  )
  const sources = readIcsSources(['~/calendars', '~/feriados.ics', '~/nao-existe.ics'])
  assert.deepEqual(
    sources.map((s) => [s.calendar, s.texts.length, s.error ?? null]).sort(),
    [
      ['Trabalho', 2, null],
      ['casa', 1, null],
      ['feriados', 1, null],
      ['nao-existe.ics', 0, 'não achei ~/nao-existe.ics']
    ].sort()
  )
})

const agendas: Agenda[] = []
after(() => agendas.forEach((a) => a.stop()))

function agenda(
  text: () => string,
  now: () => number,
  minutes = 10
): {
  agenda: Agenda
  alerts: [string, number][]
  next: (string | null)[]
} {
  const alerts: [string, number][] = []
  const next: (string | null)[] = []
  const created = new Agenda({
    eds: async () => ({
      events: async () => [{ source: { uid: 's', name: 'Personal' }, texts: [text()] }]
    }),
    files: () => [],
    alertMinutes: () => minutes,
    onAlert: (o, m) => alerts.push([o.title, m]),
    onNext: (o) => next.push(o?.title ?? null),
    now
  })
  agendas.push(created)
  return { agenda: created, alerts, next }
}

test('avisa alguns minutos antes, uma vez só; aberto em cima da hora, avisa já', async () => {
  let now = Date.parse('2026-10-12T12:00:00Z')
  const start = Date.parse('2026-10-12T12:30:00Z')
  const text = (): string =>
    ics(
      ['UID:r', 'SUMMARY:Reunião', `DTSTART:${utc(start)}`, 'DURATION:PT30M'],
      ['UID:d', 'SUMMARY:Feriado', 'DTSTART;VALUE=DATE:20261012'],
      ['UID:o', 'SUMMARY:Já foi', `DTSTART:${utc(now - 3600_000)}`, 'DURATION:PT30M']
    )
  const { agenda: a, alerts, next } = agenda(text, () => now)
  a.start()
  await a.refresh()
  assert.deepEqual(alerts, [], 'ainda falta meia hora')
  assert.equal(
    a.upcoming()?.title,
    'Reunião',
    'o próximo é o com hora (o de dia inteiro não conta)'
  )
  assert.equal(next.at(-1), 'Reunião')
  now = start - 8 * 60_000
  await a.refresh()
  assert.deepEqual(alerts, [['Reunião', 8]], 'aberto 8 minutos antes: avisa já')
  await a.refresh()
  assert.equal(alerts.length, 1, 'uma vez só')
  now = start + 31 * 60_000
  await a.refresh()
  assert.equal(a.upcoming(), null, 'acabou: nenhum próximo')
  assert.equal(next.at(-1), null)
})

test('com 0 minutos, não avisa; desligada, o painel fica sem o próximo', async () => {
  const now = Date.parse('2026-10-12T12:00:00Z')
  const text = (): string => ics(['UID:r', 'SUMMARY:Reunião', `DTSTART:${utc(now + 5 * 60_000)}`])
  const { agenda: a, alerts, next } = agenda(text, () => now, 0)
  a.start()
  await a.refresh()
  assert.deepEqual(alerts, [])
  assert.equal(next.at(-1), 'Reunião')
  a.stop()
  assert.equal(next.at(-1), null)
})

test('o texto da ferramenta: por dia, com a hora, a agenda e o local', () => {
  const now = new Date(2026, 9, 12, 9, 0).getTime()
  const at = (d: number, h: number, m = 0): number => new Date(2026, 9, d, h, m).getTime()
  const list: Occurrence[] = [
    {
      uid: '1',
      title: 'Feriado',
      start: at(12, 0),
      end: at(13, 0),
      allDay: true,
      location: '',
      calendar: 'Feriados'
    },
    {
      uid: '2',
      title: 'Reunião',
      start: at(12, 14),
      end: at(12, 15),
      allDay: false,
      location: 'Sala 3',
      calendar: 'Trabalho'
    },
    {
      uid: '3',
      title: 'Dentista',
      start: at(13, 15, 30),
      end: at(13, 16, 30),
      allDay: false,
      location: '',
      calendar: 'Casa'
    },
    {
      uid: '4',
      title: 'Lembrete',
      start: at(15, 8),
      end: at(15, 8),
      allDay: false,
      location: '',
      calendar: 'Casa'
    }
  ]
  const text = describeAgenda(list, at(12, 0), at(16, 0), now)
  assert.equal(
    text,
    [
      'Agora: seg, 12/10, 09:00.',
      'Hoje (seg, 12/10):',
      '- dia inteiro Feriado (Feriados)',
      '- 14:00–15:00 Reunião (Trabalho) · Sala 3',
      'Amanhã (ter, 13/10):',
      '- 15:30–16:30 Dentista (Casa)',
      'Qui, 15/10:',
      '- 08:00 Lembrete (Casa)'
    ].join('\n')
  )
  assert.match(
    describeAgenda([], at(12, 0), at(14, 0), now),
    /Nenhum compromisso de seg, 12\/10 a ter, 13\/10\./
  )
})
