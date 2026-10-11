// A agenda, de ponta a ponta, com o Evolution Data Server de verdade: uma agenda pessoal do GNOME
// (no HOME de teste) e um arquivo .ics. O compromisso daqui a poucos minutos avisa na hora (o
// sininho do mascote), o painel vazio mostra o próximo, e a ferramenta list_events (chamada no
// servidor MCP do Wisp, como o Claude Code chama) traz tudo: com hora, de dia inteiro, que se
// repete e do arquivo. Sem o EDS instalado, o roteiro é pulado.
// Uso: node e2e/agenda.mjs (veja e2e/run.sh).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

// As horas do roteiro no mesmo fuso do app (o appEnv usa o de São Paulo).
process.env.TZ = 'America/Sao_Paulo'

if (
  ![
    '/usr/libexec/evolution-calendar-factory',
    '/usr/lib/evolution/evolution-calendar-factory'
  ].some(existsSync)
) {
  console.log('skip: sem o Evolution Data Server')
  process.exit(0)
}

const { check, failed } = checks()
const home = testHome({
  calendar: true,
  calendarFiles: ['~/agenda-extra.ics'],
  calendarAlertMinutes: 10
})
const pad = (n) => String(n).padStart(2, '0')
/** Uma data de parede local no formato do iCalendar. */
const local = (date) =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`
const day = (date) => `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
const now = new Date()
const soon = new Date(now.getTime() + 3 * 60_000)
const soonEnd = new Date(soon.getTime() + 30 * 60_000)
const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0)
const tomorrowLate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 15, 0)
const event = (lines) => ['BEGIN:VEVENT', 'DTSTAMP:20260101T000000Z', ...lines, 'END:VEVENT']
const calendar = (...events) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//wisp//e2e//PT',
    ...events.flat(),
    'END:VCALENDAR',
    ''
  ].join('\r\n')

// A agenda "Personal" do GNOME (o backend local do EDS lê este arquivo).
const personal = join(home.home, '.local/share/evolution/calendar/system')
mkdirSync(personal, { recursive: true })
writeFileSync(
  join(personal, 'calendar.ics'),
  calendar(
    event([
      'UID:soon@e2e',
      'SUMMARY:Reunião de teste',
      `DTSTART:${local(soon)}`,
      `DTEND:${local(soonEnd)}`,
      'LOCATION:Sala 3'
    ]),
    event(['UID:allday@e2e', 'SUMMARY:Feriado de teste', `DTSTART;VALUE=DATE:${day(now)}`]),
    event([
      'UID:weekly@e2e',
      'SUMMARY:Daily do time',
      `DTSTART:${local(tomorrow)}`,
      'DURATION:PT15M',
      'RRULE:FREQ=WEEKLY;COUNT=3'
    ])
  )
)
writeFileSync(
  join(home.home, 'agenda-extra.ics'),
  calendar(
    event([
      'UID:dentist@e2e',
      'SUMMARY:Dentista',
      `DTSTART:${local(tomorrowLate)}`,
      'DURATION:PT1H'
    ])
  )
)

// Um D-Bus só deste roteiro, com o HOME de teste: o EDS, ativado por ele, lê a agenda daqui.
const env = { ...process.env, HOME: home.home }
for (const name of ['XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME']) delete env[name]
const [address, pid] = execFileSync(
  'dbus-daemon',
  ['--session', '--fork', '--print-address=1', '--print-pid=1'],
  { env }
)
  .toString()
  .trim()
  .split('\n')

const mascot = await startApp(home, { DBUS_SESSION_BUS_ADDRESS: address })
console.log('== O aviso, o painel e a ferramenta')
check(
  'A1 o compromisso daqui a 3 minutos avisa na hora: o sininho',
  await waitFor(
    () => mascot.evaluate(`document.querySelector('.stage').classList.contains('react-remind')`),
    20000,
    100
  )
)
wisp(home, '--show')
const chat = await connect('/chat/')
const next = await waitFor(
  () => chat.evaluate(`document.querySelector('.pane .next-event')?.innerText ?? null`),
  8000
)
check(
  'A2 o painel vazio mostra o próximo, com o local',
  /Reunião de teste/.test(next ?? '') &&
    /em [23] min/.test(next ?? '') &&
    /Sala 3/.test(next ?? ''),
  JSON.stringify(next)
)

// Uma conversa sobe o Claude Code de mentira, e o --mcp-config dela tem o endereço e o token.
wisp(home, '--ask', 'oi')
const file = await waitFor(
  () => readdirSync(join(home.runtime, 'wisp')).find((name) => /^mcp-\d+-.+\.json$/.test(name)),
  10000
)
const desktop = JSON.parse(readFileSync(join(home.runtime, 'wisp', file), 'utf8')).mcpServers
  .desktop
const call = async (name, args) => {
  const response = await fetch(desktop.url, {
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
  const body = await response.text()
  const data = body.split('\n').find((line) => line.startsWith('data:'))
  return JSON.parse(data ? data.slice(5) : body).result.content[0].text
}
const listed = await call('list_events', { dias: 2 })
check(
  'A3 list_events: o de hoje com hora e local',
  /Hoje \(.+\):[\s\S]*Reunião de teste \(Personal\) · Sala 3/.test(listed),
  listed
)
check('A4 o de dia inteiro', /dia inteiro Feriado de teste/.test(listed), listed)
check(
  'A5 o que se repete (amanhã) e o do arquivo .ics',
  /Amanhã \(.+\):[\s\S]*10:00–10:15 Daily do time[\s\S]*15:00–16:00 Dentista \(agenda-extra\)/.test(
    listed
  ),
  listed
)
const week = await call('list_events', { dias: 16 })
check(
  'A6 a repetição semanal (COUNT=3) aparece três vezes',
  (week.match(/Daily do time/g) ?? []).length === 3,
  week
)

console.log('== Desligada')
await chat.evaluate(`window.wisp.settings.set({ calendar: false })`)
check(
  'A7 o painel tira o próximo compromisso',
  await waitFor(
    async () => !(await chat.evaluate(`!!document.querySelector('.pane .next-event')`)),
    5000
  )
)
check(
  'A8 e a ferramenta diz que a agenda está desligada',
  /desligada/.test(await call('list_events', {}))
)
check(
  'A9 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
try {
  process.kill(Number(pid))
} catch {
  // Já saiu.
}
await sleep(300)
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
