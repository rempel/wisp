// O mascote numa janela (Fase 48), de ponta a ponta no X virtual com um gerenciador de janelas
// (openbox) e um xterm: o atalho da janela da frente (Ctrl+Alt+J, pelo xdotool) põe o print do
// xterm como anexo e a linha com o título na caixa; arrastar o mascote com o Ctrl e soltar em
// cima do xterm faz o mesmo, e o mascote volta para onde estava; sem o Ctrl, ele só muda de lugar.
// Uso: node e2e/janela.mjs (veja e2e/run.sh); precisa do openbox, do xterm e do xdotool.
import { execFileSync, spawn } from 'node:child_process'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

try {
  for (const tool of ['openbox', 'xterm', 'xdotool'])
    execFileSync('which', [tool], { stdio: 'ignore' })
} catch {
  console.log('sem o openbox, o xterm ou o xdotool: pulado')
  process.exit(0)
}

const { check, failed } = checks()
const home = testHome()
const xdo = (...args) => execFileSync('xdotool', args.map(String)).toString().trim()
const wm = spawn('openbox', ['--sm-disable'], { stdio: 'ignore' })
await sleep(800)
const term = spawn(
  'xterm',
  [
    '-T',
    'Janela de teste',
    // Sem o shell (que troca o título) e com o título travado.
    '-xrm',
    'XTerm*allowTitleOps: false',
    '-geometry',
    '100x30+700+150',
    '-e',
    'sleep',
    '600'
  ],
  {
    stdio: 'ignore'
  }
)
await sleep(1200)

const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const attachments = () =>
  ev(
    `[...document.querySelectorAll('.pane .composer .attachments .attachment')].map((a) => a.title)`
  )
const box = () => ev(`document.querySelector('.pane .composer textarea').value`)
const clear = async () => {
  await ev(
    `document.querySelectorAll('.pane .composer .attachments .attachment-remove').forEach((b) => b.click())`
  )
  await ev(`(() => {
    const box = document.querySelector('.pane .composer textarea')
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(box, '')
    box.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await sleep(300)
}

console.log('== O atalho da janela da frente')
const xterm = xdo('search', '--name', 'Janela de teste').split('\n')[0]
xdo('windowactivate', '--sync', xterm)
await sleep(400)
xdo('key', 'ctrl+alt+j')
const shot = await waitFor(async () => {
  const list = await attachments()
  return list.some((name) => /janela-.*\.png/.test(name)) ? list : null
}, 10000)
check('J1 o print da janela vai como anexo', !!shot, JSON.stringify(shot))
const line = await waitFor(
  async () => ((await box()).includes('Janela de teste') ? box() : null),
  5000
)
check(
  'J2 a caixa diz qual janela (o título e o programa)',
  /"Janela de teste" \(XTerm\)/.test(line ?? ''),
  line
)

console.log('== Soltar o mascote com o Ctrl')
await clear()
const where = await mascot.evaluate(`(() => {
  const r = document.querySelector('.stage').getBoundingClientRect()
  return { x: Math.round(window.screenX + r.left + r.width / 2), y: Math.round(window.screenY + r.top + r.height / 2), sx: window.screenX, sy: window.screenY }
})()`)
xdo('mousemove', where.x, where.y)
await sleep(200)
xdo('keydown', 'ctrl')
xdo('mousedown', 1)
for (let step = 1; step <= 10; step++) {
  xdo(
    'mousemove',
    where.x + Math.round(((900 - where.x) * step) / 10),
    where.y + Math.round(((350 - where.y) * step) / 10)
  )
  await sleep(60)
}
await sleep(300)
xdo('mouseup', 1)
xdo('keyup', 'ctrl')
const dropped = await waitFor(async () => {
  const list = await attachments()
  return list.some((name) => /janela-.*\.png/.test(name)) ? list : null
}, 10000)
check('J3 soltar em cima do xterm anexa o print dele', !!dropped, JSON.stringify(dropped))
check('J4 com a linha na caixa', (await box()).includes('Janela de teste'), await box())
await sleep(500)
const back = await mascot.evaluate(`({ sx: window.screenX, sy: window.screenY })`)
check(
  'J5 o mascote volta para onde estava',
  Math.abs(back.sx - where.sx) < 4 && Math.abs(back.sy - where.sy) < 4,
  JSON.stringify({ where, back })
)

console.log('== Sem o Ctrl, só muda de lugar')
await clear()
xdo('mousemove', where.x, where.y)
xdo('mousedown', 1)
for (let step = 1; step <= 6; step++) {
  xdo('mousemove', where.x - step * 15, where.y + step * 10)
  await sleep(60)
}
xdo('mouseup', 1)
await sleep(800)
const moved = await mascot.evaluate(`({ sx: window.screenX, sy: window.screenY })`)
check('J6 o mascote mudou de lugar', Math.abs(moved.sx - where.sx) > 40, JSON.stringify(moved))
check('J7 sem anexo', (await attachments()).length === 0)
check(
  'J8 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
term.kill()
wm.kill()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
