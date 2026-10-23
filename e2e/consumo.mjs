// Desempenho e consumo (Fase 23), de ponta a ponta. Dez abas com o Claude Code (de mentira)
// rodando: mede a memória (PSS, somada em todos os processos do Wisp) e a CPU parado; liga o
// "abas paradas dormem": os processos saem, a memória cai para menos da metade, e a próxima
// mensagem acorda a aba na mesma sessão. Uma conversa longa abre leve (só o fim na página) e o
// histórico grande mostra 50 por vez. Os números vão para out/consumo.json (o CI guarda).
// Uso: node e2e/consumo.mjs (veja e2e/run.sh).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  appPid,
  checks,
  connect,
  ROOT,
  sleep,
  startApp,
  stopApp,
  testHome,
  waitFor,
  wisp
} from './lib.mjs'

const { check, failed } = checks()
// As abas só dormem quando o teste ligar (tabSleepMinutes); aí, depois de 2 s paradas. O mascote
// cochila depois de 6 s sem nada (parado, para o Wisp, é com ele cochilando). Cada Claude Code de
// mentira segura 120 MB, o que o de verdade usa parado.
const home = testHome({ tabSleepMinutes: 0, sleepAfterMinutes: 0.1 })
const env = { WISP_TEST_TAB_SLEEP_MS: '2000', FAKE_CLAUDE_HOLD_MB: '120' }
const TABS = 10

// ---- Os processos do Wisp, pelo /proc ----------------------------------------------------

const stat = (pid) => {
  try {
    const text = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const fields = text.slice(text.lastIndexOf(')') + 2).split(' ')
    // Depois do nome: estado, ppid, …, utime (14º campo do arquivo) e stime (15º).
    return { ppid: Number(fields[1]), cpu: Number(fields[11]) + Number(fields[12]) }
  } catch {
    return null
  }
}
/** O processo principal e todos os descendentes dele. */
const tree = () => {
  const root = appPid()
  const parents = new Map()
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue
    const info = stat(name)
    if (info) parents.set(Number(name), info.ppid)
  }
  const inside = new Set([root])
  let grew = true
  while (grew) {
    grew = false
    for (const [pid, ppid] of parents) {
      if (!inside.has(pid) && inside.has(ppid)) {
        inside.add(pid)
        grew = true
      }
    }
  }
  return [...inside]
}
/** A memória de cada processo pelo PSS (as páginas divididas contam uma vez só), em MB. */
const pss = (pid) => {
  try {
    const kb = /^Pss:\s+(\d+)/m.exec(readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8'))
    return kb ? Number(kb[1]) / 1024 : 0
  } catch {
    return 0
  }
}
const isClaude = (pid) => {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('fake-claude')
  } catch {
    return false
  }
}
const memory = () => {
  const pids = tree()
  const claude = pids.filter(isClaude)
  const total = pids.reduce((sum, pid) => sum + pss(pid), 0)
  const claudeMb = claude.reduce((sum, pid) => sum + pss(pid), 0)
  return { total: Math.round(total), claude: Math.round(claudeMb), processes: claude.length }
}
/** A CPU de todos os processos juntos, em % de um núcleo, durante `ms`. */
const cpu = async (ms) => {
  const ticks = () => tree().reduce((sum, pid) => sum + (stat(pid)?.cpu ?? 0), 0)
  const start = ticks()
  await sleep(ms)
  // O relógio do /proc conta em centésimos de segundo.
  return Math.round(((ticks() - start) / (ms / 10)) * 1000) / 10
}

// ---- O app ---------------------------------------------------------------------------------

let mascot = await startApp(home, env)
wisp(home, '--show')
let chat = await connect('/chat/')
let ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)

const key = async (k, code, vk, modifiers = 0) => {
  for (const type of ['keyDown', 'keyUp'])
    await chat.send('Input.dispatchKeyEvent', {
      type,
      key: k,
      code,
      windowsVirtualKeyCode: vk,
      modifiers
    })
  await sleep(120)
}
const busy = () =>
  ev(`document.querySelector('.header .status')?.classList.contains('busy') ?? false`)
const send = async (text) => {
  await ev(`document.querySelector('.pane.focused .composer textarea').focus()`)
  await chat.send('Input.insertText', { text })
  await key('Enter', 'Enter', 13)
  await sleep(300)
  await waitFor(async () => !(await busy()), 15000)
}

console.log('== Dez abas com o Claude Code rodando')
await send('primeira')
for (let i = 1; i < TABS; i++) {
  await key('t', 'KeyT', 84, 2)
  await waitFor(() => ev(`document.querySelectorAll('.tab').length === ${i + 1}`), 5000)
  await send(`aba ${i + 1}`)
}
await sleep(1500)
const awake = memory()
check(
  'C1 dez processos do Claude Code, um por aba',
  awake.processes === TABS,
  JSON.stringify(awake)
)
await ev(`window.wisp.chat.hide()`)
// Cochilando, e depois do minuto dos "z" (as animações param todas).
const napping = await waitFor(
  () =>
    mascot.evaluate(
      `!!document.querySelector('.stage.state-sleeping') && document.getAnimations().every(a => a.playState !== 'running')`
    ),
  100000,
  1000
)
await sleep(1000)
const idleCpu = await cpu(5000)
check(
  'C2 parado (o mascote cochilando), com dez abas, a CPU fica baixa',
  !!napping && idleCpu < 3,
  `${idleCpu}%`
)

console.log('== As abas dormem')
await ev(`window.wisp.settings.set({ tabSleepMinutes: 1 })`)
const gone = await waitFor(() => memory().processes === 0, 20000, 500)
await sleep(1500)
const asleep = memory()
check('C3 paradas, as abas dormem: nenhum processo do Claude Code', !!gone, JSON.stringify(asleep))
check(
  'C4 com as dez abas dormindo, menos da metade da memória',
  asleep.total < awake.total / 2,
  JSON.stringify({ awake, asleep })
)
const before = readFileSync(join(home.home, '.fake-claude/spawns.log'), 'utf8').trim().split('\n')
wisp(home, '--show')
await waitFor(() => ev(`document.visibilityState === 'visible'`), 5000)
await send('e agora? [memória]')
const after = readFileSync(join(home.home, '.fake-claude/spawns.log'), 'utf8').trim().split('\n')
const woke = JSON.parse(after.at(-1)).args
const reply = await ev(
  `[...document.querySelectorAll('.pane.focused .msg.assistant')].at(-1)?.innerText ?? ''`
)
check(
  'C5 a próxima mensagem acorda a aba, na mesma conversa',
  after.length === before.length + 1 &&
    woke.includes('--resume') &&
    /Lembro de: aba 10 \| e agora\? \[memória\]/.test(reply),
  JSON.stringify({ woke, reply })
)

console.log('== Conversa longa e histórico grande')
const dir = join(home.home, '.local/share/wisp/conversas')
mkdirSync(dir, { recursive: true })
const writeConversation = (title, turns, createdAt) => {
  const id = randomUUID()
  const lines = [{ type: 'conversa', v: 1, id, createdAt, title }]
  for (let i = 0; i < turns; i++) {
    lines.push({ type: 'user', text: `pergunta ${i + 1}`, attachments: [] })
    lines.push({ type: 'text', blockId: `b${i}`, delta: `resposta ${i + 1}, com algum texto.` })
    lines.push({ type: 'turn-end', outcome: 'done' })
  }
  writeFileSync(join(dir, `${id}.jsonl`), lines.map((line) => JSON.stringify(line)).join('\n'))
  return id
}
const now = Date.now()
for (let i = 0; i < 120; i++) writeConversation(`curta ${i + 1}`, 1, now - (i + 10) * 60_000)
writeConversation('Uma conversa bem longa', 1000, now)

await ev(
  `document.querySelector('.header .icon-button[aria-label="Conversas anteriores"]').click()`
)
await waitFor(() => ev(`document.querySelectorAll('.history-item').length > 0`), 5000)
const listed = await ev(
  `({ items: document.querySelectorAll('.history-item').length, more: document.querySelector('.history-more')?.textContent ?? '' })`
)
check(
  'C6 o histórico mostra 50 por vez, com o resto num clique',
  listed.items === 50 && /Mostrar mais \(\d+\)/.test(listed.more),
  JSON.stringify(listed)
)
await ev(`document.querySelector('.history-more').click()`)
await sleep(200)
check('C7 mais 50', (await ev(`document.querySelectorAll('.history-item').length`)) === 100)
const opened = Date.now()
await ev(
  `[...document.querySelectorAll('.history-open')].find(b => b.title === 'Uma conversa bem longa').click()`
)
await waitFor(
  () => ev(`/pergunta 1000/.test(document.querySelector('.pane.focused .messages')?.innerText)`),
  10000
)
const openMs = Date.now() - opened
const rendered = () =>
  ev(
    `document.querySelectorAll('.pane.focused .messages .msg, .pane.focused .messages .notice').length`
  )
const firstShown = await rendered()
const earlier = await ev(`document.querySelector('.pane.focused .load-earlier')?.textContent ?? ''`)
check(
  'C8 a conversa longa abre leve: só o fim na página',
  firstShown <= 150 &&
    Number(/Mostrar anteriores \((\d+)\)/.exec(earlier)?.[1]) >= 1800 &&
    openMs < 5000,
  JSON.stringify({ firstShown, earlier, openMs })
)
// O que estava no topo continua no mesmo lugar depois de mostrar os anteriores.
const topBefore = await ev(
  `(() => { const m = document.querySelector('.pane.focused .messages'); m.scrollTop = 0; const el = m.querySelector('.msg'); return { text: el.innerText, top: el.getBoundingClientRect().top } })()`
)
await ev(`document.querySelector('.pane.focused .load-earlier').click()`)
await sleep(300)
const topAfter = await ev(
  `(() => { const el = [...document.querySelectorAll('.pane.focused .messages .msg')].find(e => e.innerText === ${JSON.stringify(topBefore.text)}); return el ? el.getBoundingClientRect().top : null })()`
)
check(
  'C9 Mostrar anteriores traz mais, sem a conversa pular',
  (await rendered()) > firstShown && topAfter !== null && Math.abs(topAfter - topBefore.top) < 4,
  JSON.stringify({ topBefore, topAfter, now: await rendered() })
)
await key('f', 'KeyF', 70, 2)
await chat.send('Input.insertText', { text: 'resposta 1,' })
await sleep(500)
const findAll = await ev(
  `document.querySelector('.pane.focused .load-earlier') === null && document.querySelector('.pane.focused .find-count')?.textContent`
)
check('C10 buscando (Ctrl+F), a conversa inteira entra na busca', findAll === '1 de 1', findAll)
await key('Escape', 'Escape', 27)

const logs = [...mascot.logs, ...chat.logs]
check('C11 sem erros nas páginas', logs.length === 0, logs.join('\n'))

const numbers = { awake, asleep, idleCpu, openMs, firstShown }
mkdirSync(join(ROOT, 'out'), { recursive: true })
writeFileSync(join(ROOT, 'out/consumo.json'), JSON.stringify(numbers, null, 2) + '\n')
console.log('números:', JSON.stringify(numbers))

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
