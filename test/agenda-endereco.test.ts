// A agenda por endereço (Fase 40): o endereço conferido (só https; o webcal:// vira https), o
// nome padrão pelo serviço, o download com os limites (e sem o endereço nas mensagens), o que fica
// guardado entre uma leitura e outra (com o ETag) e a agenda lendo os endereços junto do resto.
import './helpers/home'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { Agenda } from '../src/main/agenda'
import {
  CalendarFeeds,
  defaultLinkName,
  downloadCalendar,
  LINK_REFRESH_MS,
  normalizeCalendarUrl
} from '../src/main/calendar-links'

const SECRET_URL =
  'https://calendar.google.com/calendar/ical/eu%40gmail.com/private-abc123/basic.ics'

const ics = (...events: string[][]): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    ...events.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']),
    'END:VCALENDAR'
  ].join('\r\n')

/** Um fetch de mentira: responde pela função e guarda cada pedido. */
function fakeFetch(answer: (url: string, headers: Record<string, string>) => Response | Error): {
  fetch: typeof fetch
  calls: { url: string; headers: Record<string, string> }[]
} {
  const calls: { url: string; headers: Record<string, string> }[] = []
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({ url, headers })
    const result = answer(url, headers)
    if (result instanceof Error) throw result
    return result
  }) as typeof fetch
  return { fetch: fetcher, calls }
}

/** Uma resposta com o endereço final (o Response criado à mão não tem url). */
function response(body: string | null, init: ResponseInit = {}, url = SECRET_URL): Response {
  const r = new Response(body, init)
  Object.defineProperty(r, 'url', { value: url })
  return r
}

test('o endereço: só https, o webcal:// vira https, sem usuário e senha', () => {
  assert.equal(normalizeCalendarUrl(`  ${SECRET_URL}  `), SECRET_URL)
  assert.equal(
    normalizeCalendarUrl('webcal://p42-caldav.icloud.com/published/2/abc'),
    'https://p42-caldav.icloud.com/published/2/abc'
  )
  assert.equal(
    normalizeCalendarUrl('webcals://outlook.office365.com/owa/calendar/x/reachcalendar.ics'),
    'https://outlook.office365.com/owa/calendar/x/reachcalendar.ics'
  )
  assert.equal(normalizeCalendarUrl('http://exemplo.com/a.ics'), null, 'sem cifra, não')
  assert.equal(normalizeCalendarUrl('file:///etc/passwd'), null)
  assert.equal(normalizeCalendarUrl('https://eu:senha@exemplo.com/a.ics'), null)
  assert.equal(normalizeCalendarUrl('não é endereço'), null)
  assert.equal(normalizeCalendarUrl(''), null)
  assert.equal(normalizeCalendarUrl(`https://exemplo.com/${'a'.repeat(2001)}`), null)
})

test('o nome padrão: o do serviço, pelo endereço', () => {
  assert.equal(defaultLinkName(SECRET_URL), 'Google')
  assert.equal(
    defaultLinkName('https://outlook.office365.com/owa/calendar/x/calendar.ics'),
    'Outlook'
  )
  assert.equal(defaultLinkName('https://outlook.live.com/owa/calendar/x/calendar.ics'), 'Outlook')
  assert.equal(defaultLinkName('https://p42-caldav.icloud.com/published/2/abc'), 'iCloud')
  assert.equal(defaultLinkName('https://www.feriados.example/br.ics'), 'feriados.example')
})

test('baixar: a agenda, o ETag, e cada erro sem o endereço', async () => {
  const text = ics(['UID:a', 'SUMMARY:Reunião', 'DTSTART:20261104T120000Z'])
  const ok = fakeFetch(() => response(`\uFEFF${text}`, { headers: { etag: '"v1"' } }))
  const got = await downloadCalendar(SECRET_URL, ok.fetch)
  assert.ok('text' in got && got.text.includes('Reunião'))
  assert.equal('etag' in got && got.etag, '"v1"')
  assert.equal(ok.calls[0].headers['If-None-Match'], undefined)

  const same = fakeFetch(() => response(null, { status: 304 }))
  assert.deepEqual(await downloadCalendar(SECRET_URL, same.fetch, '"v1"'), { notModified: true })
  assert.equal(same.calls[0].headers['If-None-Match'], '"v1"')

  const cases: [string, () => Response | Error][] = [
    ['recusou', () => response('nada', { status: 404 })],
    ['500', () => response('erro', { status: 500 })],
    ['iCal', () => response('<html>entre na sua conta</html>')],
    ['https', () => response(text, {}, 'http://exemplo.com/a.ics')],
    ['5 MB', () => response(text, { headers: { 'content-length': String(6 * 1024 * 1024) } })],
    ['5 MB', () => response(`BEGIN:VCALENDAR\r\n${'X'.repeat(5 * 1024 * 1024)}`)]
  ]
  for (const [expected, answer] of cases) {
    const result = await downloadCalendar(SECRET_URL, fakeFetch(answer).fetch)
    assert.ok('error' in result, expected)
    assert.match(result.error, new RegExp(expected), result.error)
    assert.ok(!result.error.includes('private-abc123'), 'o endereço é o segredo')
    assert.notEqual(result.offline, true)
  }
  const offline = await downloadCalendar(
    SECRET_URL,
    fakeFetch(() => new TypeError('fetch failed')).fetch
  )
  assert.ok('error' in offline && offline.offline === true)
  const slow = await downloadCalendar(
    SECRET_URL,
    fakeFetch(() => Object.assign(new Error('demorou'), { name: 'TimeoutError' })).fetch
  )
  assert.ok('error' in slow && slow.offline === true && /não respondeu/.test(slow.error))
})

test('as agendas por endereço: guardadas por 15 minutos, o ETag, a última que veio e o chaveiro', async () => {
  let now = Date.parse('2026-11-03T12:00:00Z')
  let version = 1
  let down = false
  const net = fakeFetch((_url, headers) => {
    if (down) return new TypeError('fetch failed')
    if (headers['If-None-Match'] === `"v${version}"`) return response(null, { status: 304 })
    return response(
      ics([`UID:v${version}`, `SUMMARY:Versão ${version}`, 'DTSTART:20261104T120000Z']),
      {
        headers: { etag: `"v${version}"` }
      }
    )
  })
  const secrets = new Map([
    ['aaaaaaaa', SECRET_URL],
    ['bbbbbbbb', 'https://outlook.office365.com/owa/calendar/x/calendar.ics']
  ])
  let secretReads = 0
  const feeds = new CalendarFeeds({
    secret: async (id) => {
      secretReads++
      return secrets.get(id) ?? null
    },
    fetch: net.fetch,
    now: () => now
  })
  const links = [
    { id: 'aaaaaaaa', name: 'Pessoal' },
    { id: 'bbbbbbbb', name: 'Trabalho' }
  ]
  let read = await feeds.read(links)
  assert.deepEqual(
    read.map((item) => [item.calendar, item.texts.length, item.error]),
    [
      ['Pessoal', 1, undefined],
      ['Trabalho', 1, undefined]
    ]
  )
  assert.equal(net.calls.length, 2)
  // Antes dos 15 minutos, não baixa nem lê o chaveiro de novo.
  now += LINK_REFRESH_MS - 1000
  await feeds.read(links)
  assert.equal(net.calls.length, 2)
  assert.equal(secretReads, 2)
  // Depois, pergunta com o ETag: sem mudança, fica a mesma.
  now += 2000
  read = await feeds.read(links)
  assert.equal(net.calls.length, 4)
  assert.equal(net.calls[3].headers['If-None-Match'], '"v1"')
  assert.match(read[0].texts[0], /Versão 1/)
  // Mudou no servidor: vem a nova.
  version = 2
  now += LINK_REFRESH_MS + 1000
  read = await feeds.read(links)
  assert.match(read[0].texts[0], /Versão 2/)
  // Sem rede: a última que veio, com o aviso (sem o endereço).
  down = true
  now += LINK_REFRESH_MS + 1000
  read = await feeds.read(links)
  assert.match(read[0].texts[0], /Versão 2/)
  assert.match(read[0].error ?? '', /"Pessoal" não atualizou/)
  assert.ok(!(read[0].error ?? '').includes('private-abc123'))
  // Um endereço que sumiu do chaveiro (um config.json levado para outra máquina).
  secrets.delete('bbbbbbbb')
  down = false
  feeds.forget('bbbbbbbb')
  read = await feeds.read(links)
  assert.deepEqual(read[1].texts, [])
  assert.match(read[1].error ?? '', /não está no chaveiro/)
})

const agendas: Agenda[] = []
after(() => agendas.forEach((a) => a.stop()))

test('a agenda lê os endereços junto dos arquivos, e o problema de um aparece nos avisos', async () => {
  const now = Date.parse('2026-11-03T12:00:00Z')
  const agenda = new Agenda({
    eds: async () => null,
    files: () => [],
    links: async () => [
      {
        calendar: 'Google',
        texts: [ics(['UID:g', 'SUMMARY:Dentista', 'DTSTART:20261103T150000Z', 'DURATION:PT1H'])]
      },
      {
        calendar: 'Outlook',
        texts: [],
        error: 'A agenda "Outlook" não atualizou: o servidor não respondeu'
      }
    ],
    alertMinutes: () => 0,
    onAlert: () => undefined,
    now: () => now
  })
  agendas.push(agenda)
  agenda.start()
  await agenda.refresh()
  assert.equal(agenda.upcoming()?.title, 'Dentista')
  assert.equal(agenda.upcoming()?.calendar, 'Google')
  assert.deepEqual(agenda.problems, ['A agenda "Outlook" não atualizou: o servidor não respondeu'])
})
