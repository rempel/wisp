// A ilha, parte 2 (Fase 38), de ponta a ponta: as pílulas novas (a versão nova do Wisp, por um
// GitHub de mentira; os PRs, pelo gh de mentira; a agenda, por um .ics; o uso do plano, pela
// resposta do Claude Code de mentira), o Perguntar (no Linux, sem o teclado na ilha: a mensagem vai
// pela ação da página, como a caixa do Windows manda), um arquivo solto na ilha indo junto, a
// resposta aparecendo nela sem abrir o painel, o diff de um passo e o atalho global da ilha.
// Uso: node e2e/ilha2.mjs (veja e2e/run.sh); precisa do xdotool.
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import {
  checks,
  connect,
  IS_WINDOWS,
  ROOT,
  sleep,
  startApp,
  stopApp,
  testHome,
  waitFor,
  wisp
} from './lib.mjs'

if (IS_WINDOWS) {
  console.log('no Windows, o e2e/ilha-win.mjs')
  process.exit(0)
}

const { check, failed } = checks()
const home = testHome({
  compact: true,
  github: true,
  calendar: true,
  calendarFiles: ['~/agenda.ics'],
  updateCheck: true
})

// A agenda: um compromisso daqui a duas horas.
const pad = (n) => String(n).padStart(2, '0')
const local = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
const start = new Date(Date.now() + 2 * 3600_000)
const end = new Date(start.getTime() + 30 * 60_000)
writeFileSync(
  join(home.home, 'agenda.ics'),
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//wisp//e2e//PT',
    'BEGIN:VEVENT',
    'UID:ilha@e2e',
    'DTSTAMP:20260101T000000Z',
    'SUMMARY:Revisão do Wisp',
    `DTSTART:${local(start)}`,
    `DTEND:${local(end)}`,
    'LOCATION:Sala 2',
    'END:VEVENT',
    'END:VCALENDAR',
    ''
  ].join('\r\n')
)

// O gh de mentira: um PR seu com o CI falhando e uma revisão pedida.
const bin = join(home.home, 'bin')
mkdirSync(bin)
symlinkSync(join(ROOT, 'test/fixtures/fake-gh'), join(bin, 'gh'))
chmodSync(join(ROOT, 'test/fixtures/fake-gh'), 0o755)
const ghResponse = join(home.home, 'gh.json')
writeFileSync(
  ghResponse,
  JSON.stringify({
    data: {
      viewer: {
        login: 'eu',
        pullRequests: {
          nodes: [
            {
              number: 7,
              title: 'A ilha que abre',
              url: 'https://github.com/eu/app/pull/7',
              isDraft: false,
              reviewDecision: null,
              repository: { nameWithOwner: 'eu/app' },
              commits: {
                nodes: [{ commit: { oid: 'a1', statusCheckRollup: { state: 'FAILURE' } } }]
              },
              latestReviews: { nodes: [] }
            }
          ]
        }
      },
      search: {
        nodes: [
          {
            number: 9,
            title: 'Arrumar o README',
            url: 'https://github.com/time/api/pull/9',
            repository: { nameWithOwner: 'time/api' },
            author: { login: 'ana' }
          }
        ]
      }
    }
  })
)

// O GitHub de mentira dos releases: uma versão nova.
const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  res.end(
    JSON.stringify({
      tag_name: 'v9.9.9',
      html_url: 'https://github.com/rempel/wisp/releases/tag/v9.9.9',
      assets: []
    })
  )
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

const mascot = await startApp(home, {
  PATH: `${bin}:${process.env.PATH}`,
  FAKE_GH_RESPONSE: ghResponse,
  WISP_RELEASES_URL: `http://127.0.0.1:${server.address().port}/latest`,
  WISP_TEST_UPDATE_FIRST_MS: '300'
})
const ev = (expression) => mascot.evaluate(expression)
// Os prints da ilha (com WISP_E2E_SHOTS): só a cápsula, no tamanho dela.
const SHOTS = process.env.WISP_E2E_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const shoot = async (name) => {
  if (!SHOTS) return
  await sleep(400)
  const box = await ev(
    `(() => { const r = document.querySelector('.island').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height } })()`
  )
  const { data } = await mascot.send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...box, scale: 2 }
  })
  if (data) writeFileSync(join(SHOTS, `ilha-${name}.png`), Buffer.from(data, 'base64'))
}
const act = (action) => ev(`window.wisp.mascot.island(${JSON.stringify(action)})`)
const text = (selector) =>
  ev(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? null`)
const mode = () =>
  ev(
    `[...(document.querySelector('.island')?.classList ?? [])].find(c => c.startsWith('mode-'))?.slice(5) ?? null`
  )
const pill = (id) =>
  ev(`document.querySelector('.island-pills [data-pill="${id}"]')?.click() ?? false`)
const xdo = (...args) => execFileSync('xdotool', args.map(String)).toString()
xdo('mousemove', 300, 600)

console.log('== As pílulas novas')
await waitFor(() => ev(`!!document.querySelector('.island')`), 10000)
await waitFor(async () => (await mode()) === 'compact', 10000)
await act({ type: 'open' })
const pills = await waitFor(async () => {
  const ids = await ev(
    `[...document.querySelectorAll('.island-pills [data-pill]')].map(p => p.dataset.pill).join(',')`
  )
  return ['update', 'github', 'agenda'].every((id) => ids?.includes(id)) ? ids : null
}, 20000)
check('N1 a versão nova, o GitHub e a agenda viram pílulas', !!pills, pills)
await pill('github')
const github = await waitFor(() => text('.island-card.github'), 3000)
check(
  'N2 o GitHub: o seu PR com o CI falhando e a revisão pedida',
  /eu\/app#7 A ilha que abre/.test(github ?? '') &&
    /×/.test(github ?? '') &&
    /time\/api#9 Arrumar o README/.test(github ?? '') &&
    /ana/.test(github ?? ''),
  github
)
await shoot('github')
await pill('agenda')
const agenda = await waitFor(() => text('.island-card.agenda'), 3000)
check(
  'N3 a agenda: o compromisso das próximas horas, com a hora e o lugar',
  /Revisão do Wisp/.test(agenda ?? '') &&
    /Sala 2/.test(agenda ?? '') &&
    agenda.includes(`${pad(start.getHours())}:${pad(start.getMinutes())}`),
  agenda
)
await pill('update')
const update = await waitFor(() => text('.island-card.update'), 3000)
check(
  'N4 a versão nova: o Wisp 9.9.9 saiu (rodando do código, só o link do release)',
  /O Wisp 9\.9\.9 saiu/.test(update ?? '') && /Ver a versão nova/.test(update ?? ''),
  update
)

console.log('== Perguntar pela ilha')
await act({ type: 'tab', tab: 'ask' })
const ask = await waitFor(() => text('.island-card.ask-card'), 3000)
check(
  'Q1 no Linux, a ilha não recebe o teclado: falar ou escrever no painel',
  /não recebe o teclado/.test(ask ?? '') &&
    /Falar/.test(ask ?? '') &&
    /Escrever no painel/.test(ask ?? '') &&
    !(await ev(`!!document.querySelector('.island-card.ask-card textarea')`)),
  ask
)
const file = join(home.home, 'notas.txt')
writeFileSync(file, 'uma nota\n')
await shoot('perguntar-linux')
await act({ type: 'tab', tab: 'home' })
await ev(
  `window.wisp.mascot.drop({ files: [{ path: ${JSON.stringify(file)}, name: 'notas.txt', size: 9 }], problems: [] })`
)
const chip = await waitFor(() => text('.island-card.ask-card .chips'), 3000)
check(
  'Q2 o arquivo solto na ilha abre o Perguntar, com o arquivo junto',
  /notas\.txt/.test(chip ?? ''),
  chip
)
await act({ type: 'ask', text: '[uso] [edit] arruma o app' })
const answered = await waitFor(async () => {
  const value = await text('.island-card.ask-card')
  return /Tudo certo por aqui/.test(value ?? '') ? value : null
}, 15000)
check(
  'Q3 a resposta aparece na ilha, com o passo da edição',
  !!answered && /Editar app\.ts/.test(answered) && /\+2/.test(answered),
  answered ?? (await text('.island-card.ask-card'))
)
await shoot('perguntar')
check(
  'Q4 e o arquivo foi junto (a caixa ficou vazia)',
  !(await ev(`!!document.querySelector('.island-card.ask-card .chips')`))
)

console.log('== O uso do plano')
await act({ type: 'tab', tab: 'home' })
await waitFor(() => ev(`!!document.querySelector('.island-pills [data-pill="usage"]')`), 5000)
await pill('usage')
const usage = await waitFor(() => text('.island-card.usage'), 3000)
check(
  'U1 o uso do plano: 42% nas 5 horas e 12% na semana',
  /5 horas[\s\S]*42%/.test(usage ?? '') && /Semana[\s\S]*12%/.test(usage ?? ''),
  usage
)

await shoot('plano')
console.log('== O diff de um passo')
await ev(`document.querySelector('.island-pills .pill[data-task^="c:"]')?.click()`)
await waitFor(() => ev(`!!document.querySelector('.island-card.task .diff-link')`), 3000)
await ev(`document.querySelector('.island-card.task .diff-link').click()`)
const diff = await waitFor(() => text('.island-card.diff'), 3000)
check(
  'D1 o clique no passo abre o diff na ilha',
  /Editar app\.ts/.test(diff ?? '') &&
    /- const b = 2/.test(diff ?? '') &&
    /\+ const b = 3/.test(diff ?? '') &&
    /\+ const c = 4/.test(diff ?? ''),
  diff
)
await shoot('diff')
await ev(`document.querySelector('.island-card.diff button[aria-label="Voltar"]').click()`)
check(
  'D2 o ‹ volta para a conversa',
  !!(await waitFor(() => ev(`!!document.querySelector('.island-card.task')`), 3000))
)

console.log('== O painel não abriu; a conversa está lá')
wisp(home, '--show')
const chat = await connect('/chat/')
const transcript = await waitFor(async () => {
  const value = await chat.evaluate(`document.querySelector('.pane .messages')?.innerText ?? ''`)
  return /arruma o app/.test(value) && /notas\.txt/.test(value) ? value : null
}, 8000)
check('C1 a pergunta da ilha, com o arquivo, está na conversa do painel', !!transcript)
wisp(home, '--toggle')
await sleep(500)

console.log('== Escrever no painel, com o arquivo solto na ilha')
const other = join(home.home, 'outra.txt')
writeFileSync(other, 'outra\n')
await act({ type: 'open' })
await waitFor(async () => ((await mode()) === 'open' ? true : null), 4000)
await ev(
  `window.wisp.mascot.drop({ files: [{ path: ${JSON.stringify(other)}, name: 'outra.txt', size: 6 }], problems: [] })`
)
await waitFor(() => text('.island-card.ask-card .chips'), 3000)
await ev(
  `[...document.querySelectorAll('.island-card.ask-card button')].find(b => b.textContent.includes('Escrever no painel'))?.click()`
)
const carried = await waitFor(
  () =>
    chat.evaluate(
      `[...document.querySelectorAll('.pane .attachment-name')].map(e => e.textContent).find(n => n === 'outra.txt') ?? null`
    ),
  5000
)
check('C2 "Escrever no painel" leva o arquivo solto para a caixa do painel', !!carried)
wisp(home, '--toggle')

console.log('== O atalho global')
await act({ type: 'close' })
await waitFor(async () => (await mode()) !== 'open', 4000)
await sleep(800)
xdo('key', 'ctrl+alt+k')
const opened = await waitFor(async () => {
  const value = await mode()
  const tab = await ev(
    `document.querySelector('.island-tab[aria-selected="true"]')?.textContent?.trim() ?? null`
  )
  return value === 'open' && tab === 'Perguntar' ? true : null
}, 5000)
check('K1 Ctrl+Alt+K abre a ilha no Perguntar', !!opened)
xdo('key', 'ctrl+alt+k')
check(
  'K2 e de novo, recolhe',
  !!(await waitFor(async () => ((await mode()) !== 'open' ? true : null), 4000))
)
check(
  'K3 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
server.close()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
