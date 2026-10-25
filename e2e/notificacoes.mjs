// Notificações e cards (Fase 24), de ponta a ponta, com um servidor de notificações de mentira
// num D-Bus só deste teste: o card do Bash diz o que o comando faz; com o painel escondido, o
// card vira uma notificação com Permitir e Negar, e o botão dela libera o Claude; o painel que
// abre tira a notificação; e, com a tela bloqueada (a proteção de tela de mentira), o que
// aconteceu vira o resumo "Enquanto você estava fora" ao desbloquear.
// Uso: node e2e/notificacoes.mjs (veja e2e/run.sh).
import { appendFileSync, readFileSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { join } from 'node:path'
import { checks, connect, ROOT, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const notifyFile = join(home.home, 'notificacoes.json')
const clickFile = join(home.home, 'cliques.jsonl')

// Um D-Bus só deste teste, com o servidor de notificações de mentira.
const [address, busPid] = execFileSync(
  'dbus-daemon',
  ['--session', '--fork', '--print-address=1', '--print-pid=1'],
  { env: { ...process.env, HOME: home.home } }
)
  .toString()
  .trim()
  .split('\n')
const bundle = join(home.home, 'fake-notifications.mjs')
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
  join(ROOT, 'test/fixtures/fake-notifications.ts'),
  '--bundle',
  '--platform=node',
  '--format=esm',
  `--outfile=${bundle}`,
  '--log-level=warning'
])
const server = spawn(process.execPath, [bundle], {
  env: {
    ...process.env,
    DBUS_SESSION_BUS_ADDRESS: address,
    FAKE_NOTIFY_FILE: notifyFile,
    FAKE_NOTIFY_CLICK: clickFile,
    // O "não perturbe" do KDE, desligado até o fim.
    FAKE_NOTIFY_INHIBITED: '0'
  },
  stdio: ['ignore', 'pipe', 'inherit']
})
await new Promise((resolve) => server.stdout.once('data', resolve))
const notifications = () => JSON.parse(readFileSync(notifyFile, 'utf8'))
const command = (line) => appendFileSync(clickFile, JSON.stringify(line) + '\n')

const mascot = await startApp(home, { DBUS_SESSION_BUS_ADDRESS: address })
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const conversation = await ev(`document.querySelector('.pane').dataset.conversation`)
const ask = (text) =>
  ev(`window.wisp.chat.send(${JSON.stringify(conversation)}, ${JSON.stringify(text)}, [])`)
const approvals = () => {
  try {
    return readFileSync(join(home.home, '.fake-claude/approvals.log'), 'utf8')
  } catch {
    return ''
  }
}
const transcript = () => ev(`document.querySelector('.pane .messages').innerText`)
const idle = () =>
  waitFor(
    async () =>
      !(await ev(`document.querySelector('.header .status')?.classList.contains('busy')`)),
    10000
  )
/** A notificação de pedido mais recente (as que têm botões além do "Abrir o painel"). */
const lastRequest = () =>
  notifications()
    .shown.filter((n) => n.actions.includes('default'))
    .at(-1) ?? null
const keyOf = (n, label) => n.actions[n.actions.indexOf(label) - 1]

console.log('== O card diz o que o comando faz')
await ask('roda os testes [pede npm test]')
const explained = await waitFor(
  () =>
    ev(`document.querySelector('.permission-pending .permission-explain')?.textContent ?? null`),
  10000
)
check(
  'N1 o card do Bash diz o que o comando faz',
  explained === 'O que faz: Roda os testes do projeto.',
  explained
)
await sleep(600)
check('N2 com o painel à vista, nenhuma notificação', lastRequest() === null)

console.log('== Painel escondido: a notificação responde')
await ev(`window.wisp.chat.hide()`)
const shown = await waitFor(() => lastRequest(), 5000)
check(
  'N3 escondido, o card vira notificação com Permitir e Negar',
  shown?.summary === 'O Claude quer rodar um comando' &&
    shown.body === 'npm test\nRoda os testes do projeto.' &&
    JSON.stringify(shown.actions.filter((_, i) => i % 2)) ===
      JSON.stringify(['Abrir o painel', 'Permitir', 'Negar']),
  JSON.stringify(shown)
)
await sleep(800)
command({ id: shown.id, key: keyOf(shown, 'Permitir') })
const allowed = await waitFor(() => /npm test.*"allow"/.test(approvals()), 8000)
wisp(home, '--show')
await waitFor(() => ev(`document.visibilityState === 'visible'`), 5000)
check(
  'N4 o Permitir da notificação libera o Claude, e ela sai',
  !!allowed &&
    notifications().closed.includes(shown.id) &&
    /Permitido pela notificação\./.test(await transcript()),
  approvals()
)

console.log('== O painel que abre tira a notificação')
await idle()
await ev(`window.wisp.chat.hide()`)
await sleep(300)
await ask('apaga [pede rm velho.txt]')
const second = await waitFor(() => {
  const n = lastRequest()
  return n && n.id !== shown.id ? n : null
}, 8000)
check(
  'N5 o rm diz que apaga sem lixeira',
  /rm velho\.txt\nApaga arquivos, sem passar pela lixeira\./.test(second?.body ?? ''),
  second?.body
)
wisp(home, '--show')
const gone = await waitFor(() => notifications().closed.includes(second?.id), 5000)
check(
  'N6 o painel abriu: a notificação sai, e o card continua esperando',
  !!gone && (await ev(`document.querySelectorAll('.permission-pending').length`)) === 1
)
// Como sempre no card: um clique logo que o painel aparece não vale.
await sleep(800)
await ev(
  `[...document.querySelectorAll('.permission-pending button')].find(b => b.textContent.trim() === 'Negar').click()`
)
check(
  'N7 negado no painel, o Claude segue',
  !!(await waitFor(
    async () => !(await ev(`document.querySelector('.permission-pending') !== null`)),
    5000
  ))
)

console.log('== Enquanto você estava fora')
await idle()
await ev(`window.wisp.chat.hide()`)
command({ lock: true })
await sleep(500)
const replies = () => ev(`document.querySelectorAll('.pane .msg.assistant').length`)
const repliesBefore = await replies()
await ask('resume o dia')
await waitFor(async () => (await replies()) > repliesBefore, 10000)
await idle()
await ask('lista [pede ls -la]')
await waitFor(() => {
  const n = lastRequest()
  return n && /ls -la/.test(n.body) ? n : null
}, 8000)
const before = notifications().shown.length
command({ lock: false })
const summary = await waitFor(
  () =>
    notifications()
      .shown.slice(before)
      .find((n) => n.summary === 'Enquanto você estava fora') ?? null,
  5000
)
check(
  'N8 ao desbloquear, o resumo: o que ficou pronto e o que espera',
  /1 resposta pronta: “roda os testes \[pede npm test\]”\./.test(summary?.body ?? '') &&
    /1 pedido espera você no painel\./.test(summary?.body ?? ''),
  // Sem o resumo, o que dá para ver do lado de fora: as notificações e a conversa.
  JSON.stringify({
    summary,
    shown: notifications().shown.map((n) => [n.summary, n.body.slice(0, 80)]),
    transcript: (await transcript()).slice(-400),
    // O que o app anotou sobre a tela (bloqueada ou não), de cada fonte.
    log: readFileSync(join(home.home, 'wisp.log'), 'utf8')
      .split('\n')
      .filter((line) => /tela/.test(line))
      .slice(-10)
  })
)
console.log('== Não perturbe')
// O pedido do ls continua esperando: negado no painel.
wisp(home, '--show')
await waitFor(() => ev(`document.visibilityState === 'visible'`), 5000)
await sleep(800)
await ev(
  `[...document.querySelectorAll('.permission-pending button')].find(b => b.textContent.trim() === 'Negar')?.click()`
)
await idle()
const dndNow = () => ev(`window.wisp.settings.get().then((s) => s.dnd)`)
check('N10 o desktop diz que o "não perturbe" está desligado', (await dndNow()) === false)
command({ inhibit: true })
check(
  'N11 ligado no desktop, o Wisp sabe na hora (pelo sinal)',
  (await waitFor(async () => ((await dndNow()) === true ? true : null), 5000)) === true
)
await ev(`window.wisp.chat.hide()`)
await sleep(300)
const quietBefore = notifications().shown.length
await ask('status [pede git status]')
await waitFor(() => ev(`document.querySelector('.permission-pending') !== null`), 8000)
await sleep(1500)
check(
  'N12 com o "não perturbe", o card espera no painel e não vira notificação',
  notifications().shown.length === quietBefore,
  JSON.stringify(notifications().shown.slice(quietBefore))
)
command({ inhibit: false })
await waitFor(async () => ((await dndNow()) === false ? true : null), 5000)
wisp(home, '--show')
await waitFor(() => ev(`document.visibilityState === 'visible'`), 5000)
await sleep(800)
await ev(
  `[...document.querySelectorAll('.permission-pending button')].find(b => b.textContent.trim() === 'Negar')?.click()`
)
await idle()
await ev(`window.wisp.chat.hide()`)
await sleep(300)
await ask('onde [pede pwd]')
const loud = await waitFor(() => {
  const n = lastRequest()
  return n && /^pwd/.test(n.body) ? n : null
}, 8000)
check('N13 desligado, o card volta a virar notificação', !!loud, JSON.stringify(loud))

check(
  'N14 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
server.kill()
process.kill(Number(busPid))
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
