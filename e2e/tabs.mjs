// Abas, painéis lado a lado, modos de permissão e "Permitir sempre" por programa, de ponta a
// ponta: o Wisp montado (out/), com o Claude Code de mentira, que pede aprovação pelo servidor
// MCP do Wisp como o de verdade. Também a sessão do terminal numa aba (pelo relay dos hooks) e as
// abas voltando depois de reabrir. Uso: node e2e/tabs.mjs (com X e D-Bus; veja e2e/run.sh).
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  checks,
  connect,
  fakeLog,
  relay,
  sleep,
  startApp,
  stopApp,
  testHome,
  waitFor,
  wisp
} from './lib.mjs'

const { check, failed } = checks()
const approvals = () =>
  fakeLog(home, 'approvals').map((line) => {
    const [pid, conv, tool, ...rest] = line.split(' ')
    return { pid, conv, tool, rest: rest.join(' ') }
  })
const spawns = () => fakeLog(home, 'spawns').map((line) => JSON.parse(line))
const controls = () => fakeLog(home, 'controls').map((line) => JSON.parse(line))

let chat
/** Abre o Wisp e o painel (pelo comando wisp --show). */
async function open() {
  const mascot = await startApp(home)
  mascot.close()
  await sleep(1500)
  wisp(home, '--show')
  chat = await connect('/chat/')
  await waitFor(() => chat.evaluate(`!!document.querySelector('.pane .composer')`), 15000)
  await sleep(500)
}
const ev = (expr) => chat.evaluate(expr)
const state = () =>
  ev(`JSON.stringify({
  tabs: [...document.querySelectorAll('.tab')].map(t => ({ title: t.querySelector('.tab-title').textContent, cls: t.className, session: !!t.querySelector('.tab-main svg') })),
  panes: [...document.querySelectorAll('.panes > .pane')].map(p => ({ conv: p.dataset.conversation ?? null, focused: p.classList.contains('focused'), head: p.querySelector('.pane-title')?.textContent ?? null, mode: p.querySelector('.mode-pill span')?.textContent ?? null, users: [...p.querySelectorAll('.msg.user')].map(e => e.innerText), answers: [...p.querySelectorAll('.msg.assistant')].map(e => e.innerText), cards: [...p.querySelectorAll('.permission')].map(e => ({ cls: e.className, text: e.innerText.replace(/\\n+/g, ' / ') })), session: !!p.querySelector('.session-pane') })),
  split: document.querySelector('.chat').classList.contains('split'),
  width: window.outerWidth,
  splitDisabled: document.querySelector('.tabs-split')?.disabled ?? null
})`).then(JSON.parse)
const key = async (k, code, vk, modifiers = 0) => {
  for (const type of ['keyDown', 'keyUp'])
    await chat.send('Input.dispatchKeyEvent', {
      type,
      key: k,
      code,
      windowsVirtualKeyCode: vk,
      modifiers
    })
  await sleep(250)
}
const ctrl = (k, code, vk) => key(k, code, vk, 2)
async function ask(pane, text) {
  await ev(
    `document.querySelectorAll('.panes > .pane')[${pane}].querySelector('.composer textarea').focus()`
  )
  await chat.send('Input.insertText', { text })
  await key('Enter', 'Enter', 13)
}
const answered = (pane, re, ms = 15000) =>
  waitFor(
    async () => {
      const p = (await state()).panes[pane]
      return p?.answers.some((a) => re.test(a)) ? p : null
    },
    ms,
    100
  )
const pendingCard = (pane, ms = 8000) =>
  waitFor(
    async () => (await state()).panes[pane]?.cards.find((c) => /permission-pending/.test(c.cls)),
    ms,
    100
  )
async function clickButton(pane, label) {
  await sleep(700) // os botões do card só valem depois de 600 ms
  return ev(
    `(() => { const b = [...document.querySelectorAll('.panes > .pane')[${pane}].querySelectorAll('.permission-pending button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true })()`
  )
}

// ---------------------------------------------------------------------------
console.log('== Uma aba ao abrir, título pela primeira mensagem')
const home = testHome()
await open()
let s = await state()
check(
  'T1 abre com uma aba "Nova conversa" e um painel',
  s.tabs.length === 1 && s.tabs[0].title === 'Nova conversa' && s.panes.length === 1 && !s.split,
  JSON.stringify(s)
)
check('T2 a pílula do modo começa em Pedir', s.panes[0].mode === 'Pedir', s.panes[0].mode)
await ask(0, 'Oi, tudo bem?')
await answered(0, /Tudo certo/)
s = await state()
check(
  'T3 a aba ganha o título da primeira mensagem',
  s.tabs[0].title === 'Oi, tudo bem?',
  s.tabs[0].title
)
const firstConv = s.panes[0].conv

console.log('== Ctrl+T abre outra aba; a resposta de uma aba escondida ganha o pontinho')
await ctrl('t', 'KeyT', 84)
s = await state()
check(
  'T4 Ctrl+T: duas abas, a nova à vista e vazia',
  s.tabs.length === 2 &&
    s.panes[0].conv !== firstConv &&
    s.panes[0].users.length === 0 &&
    /active/.test(s.tabs[1].cls),
  JSON.stringify(s.tabs)
)
const secondConv = s.panes[0].conv
await ask(0, '[lento] conta devagar')
await waitFor(async () => (await state()).panes[0].answers.length > 0, 8000, 100)
await ctrl('1', 'Digit1', 49)
s = await state()
check(
  'T5 Ctrl+1 volta para a primeira aba, com a conversa dela',
  s.panes[0].conv === firstConv && s.panes[0].answers.some((a) => /Tudo certo/.test(a)),
  JSON.stringify(s.panes[0])
)
check(
  'T6 a segunda aba trabalhando, fora da vista',
  /tab-working/.test(s.tabs[1].cls),
  s.tabs[1].cls
)
const done = await waitFor(async () => /tab-done/.test((await state()).tabs[1].cls), 30000, 200)
check('T7 terminou fora da vista: pontinho de resposta nova', !!done)
await ctrl('Tab', 'Tab', 9)
s = await state()
check(
  'T8 Ctrl+Tab vai para ela, e o pontinho some',
  s.panes[0].conv === secondConv &&
    !/tab-done/.test(s.tabs[1].cls) &&
    s.panes[0].answers.some((a) => /devagar/.test(a)),
  JSON.stringify(s.tabs)
)
const procs = new Set(
  spawns()
    .filter((s) => s.args.includes('--session-id') || s.args.includes('--resume'))
    .map((s) => s.pid)
)
check('T9 um processo do Claude Code por conversa', procs.size === 2, [...procs].join(','))

console.log('== Dividir: dois painéis lado a lado, cada um com a sua conversa')
const width1 = s.width
await ctrl('\\', 'Backslash', 220)
s = await state()
check(
  'T10 Ctrl+\\ divide: dois painéis, o novo em foco',
  s.split &&
    s.panes.length === 2 &&
    s.panes[1].focused &&
    s.panes[0].conv === secondConv &&
    s.panes[1].conv === firstConv,
  JSON.stringify(s.panes.map((p) => [p.conv, p.focused]))
)
check('T11 a janela alarga para os dois', s.width >= width1 * 1.8, `${width1} → ${s.width}`)
check(
  'T12 cada painel com o título da sua aba',
  s.panes[0].head === '[lento] conta devagar' && s.panes[1].head === 'Oi, tudo bem?',
  JSON.stringify(s.panes.map((p) => p.head))
)
await ctrl('\\', 'Backslash', 220)
s = await state()
check(
  'T13 o terceiro painel abre uma conversa nova',
  s.panes.length === 3 &&
    s.tabs.length === 3 &&
    s.panes[2].users.length === 0 &&
    s.splitDisabled === true,
  JSON.stringify({ n: s.panes.length, tabs: s.tabs.length, dis: s.splitDisabled })
)
await ctrl('\\', 'Backslash', 220)
check('T14 no máximo três painéis', (await state()).panes.length === 3)
// Tira o terceiro painel (a aba continua).
await ev(`document.querySelectorAll('.panes > .pane')[2].querySelector('.pane-close').click()`)
await sleep(300)
s = await state()
check(
  'T15 tirar um painel: a aba continua aberta',
  s.panes.length === 2 && s.tabs.length === 3,
  JSON.stringify({ n: s.panes.length, tabs: s.tabs.length })
)

console.log('== Cards de permissão: cada conversa recebe os seus; "sempre" vale pelo programa')
await ask(0, '[pede ls -la]')
await ask(1, '[pede git status]')
const c0 = await pendingCard(0),
  c1 = await pendingCard(1)
check(
  'T16 cada painel com o seu card',
  /ls -la/.test(c0?.text) &&
    /git status/.test(c1?.text) &&
    !/git status/.test(c0?.text) &&
    !/ls -la/.test(c1?.text),
  JSON.stringify([c0, c1])
)
check(
  'T17 o "sempre" do ls vale para o programa',
  /Permitir “ls” sempre nesta conversa/.test(c0?.text),
  c0?.text
)
check(
  'T18 o do git, para o subcomando',
  /Permitir “git status” sempre nesta conversa/.test(c1?.text),
  c1?.text
)
check(
  'T19 o mascote pede atenção, a aba de cada card também',
  (await state()).tabs.filter((t) => /tab-waiting/.test(t.cls)).length === 2,
  JSON.stringify((await state()).tabs.map((t) => t.cls))
)
check('T20 Permitir “ls” sempre', await clickButton(0, 'Permitir “ls” sempre nesta conversa'))
check('T21 Negar o git status', await clickButton(1, 'Negar'))
await answered(0, /Rodei ls -la/)
await answered(1, /Não rodei git status/)
let log = approvals()
check(
  'T22 cada decisão foi para o processo certo',
  log.length === 2 &&
    log.find((a) => /ls -la/.test(a.rest))?.conv === secondConv &&
    /"allow"/.test(log.find((a) => /ls -la/.test(a.rest)).rest) &&
    log.find((a) => /git status/.test(a.rest))?.conv === firstConv &&
    /"deny"/.test(log.find((a) => /git status/.test(a.rest)).rest),
  JSON.stringify(log)
)
await ask(0, '[pede ls src]')
await answered(0, /Rodei ls src/)
s = await state()
check(
  'T23 "ls src" passa sem card (o "sempre" vale com outros argumentos)',
  s.panes[0].cards.length === 1,
  JSON.stringify(s.panes[0].cards)
)
await ask(1, '[pede ls src]')
const other = await pendingCard(1)
check('T24 na outra conversa, o ls ainda pede', /ls src/.test(other?.text), JSON.stringify(other))
await clickButton(1, 'Permitir')
await answered(1, /Rodei ls src/)
await ask(0, '[pede ls; rm -rf x]')
const compound = await pendingCard(0)
check(
  'T25 comando composto pede de novo, com "sempre" só do mesmo comando',
  /Permitir este comando sempre/.test(compound?.text),
  compound?.text
)
await clickButton(0, 'Negar')
await answered(0, /Não rodei ls; rm/)

console.log('== Modos de permissão')
await ev(`document.querySelectorAll('.panes > .pane')[0].querySelector('.mode-pill').click()`)
await sleep(200)
const options = await ev(
  `[...document.querySelectorAll('.panes > .pane')[0].querySelectorAll('.mode-option strong')].map(e => e.textContent)`
)
check(
  'T26 o menu tem os quatro modos (sem o "pular permissões")',
  JSON.stringify(options) ===
    JSON.stringify(['Pedir', 'Aceitar edições', 'Planejar', 'Automático']),
  JSON.stringify(options)
)
await ev(
  `[...document.querySelectorAll('.panes > .pane')[0].querySelectorAll('.mode-option')].find(b => /Automático/.test(b.textContent)).click()`
)
await sleep(500)
s = await state()
check(
  'T27 Automático só nesta conversa',
  s.panes[0].mode === 'Automático' && s.panes[1].mode === 'Pedir',
  JSON.stringify(s.panes.map((p) => p.mode))
)
check(
  'T28 o pedido foi para o processo da conversa (set_permission_mode)',
  controls().some((c) => c.subtype === 'set_permission_mode' && c.mode === 'auto'),
  JSON.stringify(controls().slice(-3))
)
const modeFiles = readdirSync(join(home.runtime, 'wisp')).filter((f) => f.startsWith('modo-'))
const autoFile = modeFiles.find((f) => f.endsWith(secondConv))
check(
  'T29 o arquivo do modo (o hook do Bash lê) diz auto',
  autoFile &&
    readFileSync(join(home.runtime, 'wisp', autoFile), 'utf8') === 'auto' &&
    modeFiles.length >= 2,
  JSON.stringify(modeFiles)
)
await ask(0, '[modo]')
await answered(0, /Modo: auto/)
check('T30 o Claude Code está no modo auto', true)
// Shift+Tab na caixa do painel 2.
await ev(
  `document.querySelectorAll('.panes > .pane')[1].querySelector('.composer textarea').focus()`
)
await key('Tab', 'Tab', 9, 8)
s = await state()
check(
  'T31 Shift+Tab: Pedir → Aceitar edições',
  s.panes[1].mode === 'Aceitar edições',
  s.panes[1].mode
)
await key('Tab', 'Tab', 9, 8)
check('T32 Shift+Tab de novo: Planejar', (await state()).panes[1].mode === 'Planejar')
await ask(1, '[plano] faça a mudança')
const plan = await pendingCard(1)
check(
  'T33 o card do plano, com o texto e os botões dele',
  /O plano está pronto/.test(plan?.text) &&
    /Ler o código/.test(plan?.text) &&
    /Aprovar e aceitar edições/.test(plan?.text) &&
    /Continuar planejando/.test(plan?.text) &&
    !/sempre/.test(plan?.text),
  plan?.text
)
check(
  'T34 o texto do plano vem formatado (Markdown)',
  await ev(
    `!!document.querySelectorAll('.panes > .pane')[1].querySelector('.permission-plan h1, .permission-plan strong')`
  )
)
await clickButton(1, 'Aprovar e aceitar edições')
await answered(1, /Plano aprovado; modo acceptEdits/)
await sleep(300)
s = await state()
check(
  'T35 aprovado com "aceitar edições": a pílula acompanha o Claude Code',
  s.panes[1].mode === 'Aceitar edições',
  s.panes[1].mode
)
check(
  'T36 o card diz como foi aprovado',
  s.panes[1].cards.some(
    (c) => /Plano aprovado, com as edições liberadas/.test(c.text) && !/pending/.test(c.cls)
  ),
  JSON.stringify(s.panes[1].cards.slice(-1))
)

console.log('== Sessão do terminal numa aba, com o pedido dela')
const hook = (event, input, stdio) =>
  relay(
    home,
    event,
    {
      session_id: 'e2e-sessao',
      transcript_path: '/tmp/e2e.jsonl',
      cwd: '/tmp/projeto-x',
      ...input
    },
    stdio
  )
// Os hooks entram no ~/.claude/settings.json de teste, pelo fluxo da aba Sessões.
await ev(`document.querySelector('.badge-host').click()`)
await sleep(500)
const clickText = (text) =>
  ev(
    `(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true })()`
  )
await clickText('Ver o que muda')
await sleep(800)
check(
  'T37a hooks instalados pela aba Sessões',
  (await clickText('Instalar')) &&
    !!(await waitFor(() => existsSync(join(home.home, '.claude/settings.json')), 5000))
)
hook('SessionStart', { source: 'startup' })
hook('UserPromptSubmit', { prompt: 'arruma o build' })
await waitFor(() => ev(`!!document.querySelector('.session')`), 8000)
const openTab = await ev(
  `(() => { const b = [...document.querySelectorAll('button')].find(b => /Abrir em aba/.test(b.textContent) || /Abrir em aba/.test(b.title)); if (!b) return false; b.click(); return true })()`
)
await sleep(500)
s = await state()
const sessionPane = s.panes.findIndex((p) => p.session)
check(
  'T37 "Abrir em aba" põe a sessão numa aba, no painel em foco',
  openTab && sessionPane >= 0 && s.tabs.some((t) => t.session && t.title === 'projeto-x'),
  JSON.stringify({ openTab, tabs: s.tabs })
)
let out = ''
const asking = hook(
  'PermissionRequest',
  { tool_name: 'Bash', tool_input: { command: 'npm run build' } },
  ['pipe', 'pipe', 'ignore']
)
asking.stdout.on('data', (d) => {
  out += d
})
const sessionCard = await waitFor(
  async () =>
    (await state()).panes[sessionPane]?.cards.find((c) => /permission-pending/.test(c.cls)),
  8000,
  100
)
check(
  'T38 o pedido da sessão aparece no painel dela',
  /npm run build/.test(sessionCard?.text) &&
    /Permitir “npm run” sempre nesta sessão/.test(sessionCard?.text),
  sessionCard?.text
)
await clickButton(sessionPane, 'Permitir')
await waitFor(() => /allow/.test(out), 5000)
check('T39 Permitir responde ao terminal', /"behavior":"allow"/.test(out), out)

console.log('== Fechar e reabrir: as abas voltam')
// Fecha a aba da sessão (Ctrl+W no painel dela).
await ev(
  `document.querySelectorAll('.panes > .pane')[${sessionPane}].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`
)
await sleep(300)
const before = (await state()).tabs.length
await ctrl('w', 'KeyW', 87)
s = await state()
check(
  'T40 Ctrl+W fecha a aba em foco',
  s.tabs.length === before - 1 && !s.tabs.some((t) => t.session),
  JSON.stringify(s.tabs)
)
// A terceira aba (vazia) também fecha, pelo x.
await ev(
  `[...document.querySelectorAll('.tab')].find(t => t.querySelector('.tab-title').textContent === 'Nova conversa')?.querySelector('.tab-close').click()`
)
await sleep(800)
s = await state()
const layout = { tabs: s.tabs.map((t) => t.title), panes: s.panes.map((p) => [p.head, p.mode]) }
check(
  'T41 sobram duas abas, lado a lado',
  s.tabs.length === 2 && s.panes.length === 2,
  JSON.stringify(layout)
)
await sleep(800)
await open()
s = await state()
const after = { tabs: s.tabs.map((t) => t.title), panes: s.panes.map((p) => [p.head, p.mode]) }
check(
  'T42 reabrindo o Wisp, as abas e os painéis voltam como estavam',
  JSON.stringify(after) === JSON.stringify(layout),
  `${JSON.stringify(layout)} → ${JSON.stringify(after)}`
)
check(
  'T43 com as conversas',
  s.panes.every((p) => p.users.length > 0 && p.answers.length > 0),
  JSON.stringify(s.panes.map((p) => p.users.length))
)
const spawnsBefore = spawns().length
await sleep(1500)
check('T45 parado, nenhum processo novo', spawns().length === spawnsBefore)
const answersBefore = (await state()).panes[0].answers.length
await ask(0, '[modo]')
await waitFor(
  async () => {
    const a = (await state()).panes[0].answers
    return (
      a.length > answersBefore &&
      /^Modo: \w+$/.test(a.at(-1)) &&
      (await ev(`document.querySelector('.status').textContent`)) === 'pronto'
    )
  },
  15000,
  100
)
const modeNow = (await state()).panes[0].answers.at(-1)
check(
  'T46 a conversa continua, no modo que tinha',
  modeNow ===
    `Modo: ${{ Pedir: 'default', 'Aceitar edições': 'acceptEdits', Planejar: 'plan', Automático: 'auto' }[layout.panes[0][1]]}`,
  `${modeNow} (${layout.panes[0][1]})`
)
console.log('== --ask com a aba da frente ocupada: vai numa aba nova')
const tabsBefore = (await state()).tabs.length
await ev(
  `document.querySelectorAll('.panes > .pane')[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`
)
await sleep(300)
await ask(0, '[lento] uma resposta comprida')
await waitFor(
  async () =>
    (await state()).panes[0].answers.length > 0 &&
    (await ev(`document.querySelector('.status').classList.contains('busy')`)),
  8000,
  100
)
const slowConv = (await state()).panes[0].conv
wisp(home, '--ask', 'oi pelo terminal')
const asked2 = await waitFor(
  async () => {
    const t = await state()
    return t.tabs.length === tabsBefore + 1 &&
      t.panes[0].conv !== slowConv &&
      t.panes[0].answers.some((a) => /Tudo certo/.test(a))
      ? t
      : null
  },
  15000,
  200
)
check(
  'T48 --ask com a aba ocupada abre outra aba e responde lá',
  !!asked2 && asked2.panes[0].users.join() === 'oi pelo terminal',
  JSON.stringify(asked2?.panes[0] ?? (await state()).panes[0])
)
const slowDone = await waitFor(
  async () => (await state()).tabs.some((t) => /tab-done/.test(t.cls)),
  40000,
  300
)
check(
  'T49 e a ocupada continua, fora da vista, até a resposta nova',
  !!slowDone,
  JSON.stringify((await state()).tabs)
)
check(
  'T47 sem erros no painel',
  chat.logs.filter((l) => !/Autofill|DevTools|Electron Security/.test(l)).length === 0,
  chat.logs.join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
