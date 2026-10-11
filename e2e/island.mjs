// A ilha, de ponta a ponta: a cápsula recolhida no centro do topo (fora dela, o clique é de quem
// está atrás), abre com o cursor e volta a recolher, abre sozinha e pulsa com um pedido de
// permissão, abre o painel logo abaixo com um clique e sai de cena quando o modo é desligado. O
// cursor e o clique são de verdade (xdotool), porque o recorte da janela só vale no servidor X.
// Uso: node e2e/island.mjs (veja e2e/run.sh); precisa do xdotool.
import { execFileSync } from 'node:child_process'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
// Uma tela de 1600×900 (e2e/run.sh): a janela da ilha (340×110) fica em 630,4.
const home = testHome({ compact: true })
const xdo = (...args) => execFileSync('xdotool', args.map(String)).toString()
/** A janela X que está sob o cursor nesse ponto (o recorte da janela vale aqui). */
const windowAt = (x, y) => {
  xdo('mousemove', x, y)
  return /WINDOW=(\d+)/.exec(xdo('getmouselocation', '--shell'))[1]
}
const away = () => xdo('mousemove', 300, 600)

const mascot = await startApp(home)
const ev = (expression) => mascot.evaluate(expression)
const island = () =>
  ev(`(() => { const i = document.querySelector('.island'); return i ? {
    expanded: i.classList.contains('expanded'),
    tone: [...i.classList].find(c => c.startsWith('tone-'))?.slice(5) ?? null,
    title: i.querySelector('.island-text strong')?.textContent ?? '',
    x: window.screenX,
    y: window.screenY
  } : null })()`)
const expanded = (want, ms = 6000) => waitFor(async () => (await island())?.expanded === want, ms)

console.log('== Recolhida no centro do topo')
away()
let s = await waitFor(island, 5000)
check('I1 a janela no centro do topo', s?.x === 630 && s?.y === 4, JSON.stringify(s))
// Depois da saudação, que ela mostra aberta.
check('I2 sozinha, ela recolhe', await expanded(false, 10000))
s = await island()
check('I3 parada, só o nome', s.title === 'Wisp' && s.tone === 'calm', JSON.stringify(s))
await sleep(300)
// Primeiro fora da cápsula (o cursor nela faz ela abrir).
const outside = windowAt(650, 70)
const capsule = windowAt(800, 20)
check('I4 fora da cápsula, o clique é de quem está atrás', outside !== capsule)

console.log('== Abre com o cursor')
check('I5 o cursor na cápsula: ela abre', await expanded(true, 3000))
await sleep(400)
check('I6 e a cápsula aberta pega o cursor', windowAt(650, 70) === capsule)
away()
check('I7 o cursor sai: ela recolhe', await expanded(false, 4000))

console.log('== Um pedido de permissão')
wisp(home, '--show')
const chat = await connect('/chat/')
await waitFor(() => chat.evaluate(`!!document.querySelector('.pane .composer')`), 15000)
wisp(home, '--ask', '[pede ls -la]')
await waitFor(() => chat.evaluate(`!!document.querySelector('.pane .permission-pending')`), 8000)
wisp(home, '--toggle')
s = await waitFor(async () => {
  const value = await island()
  return value?.expanded && value.tone === 'alert' ? value : null
}, 5000)
check('I8 com o card esperando, ela abre e pulsa', !!s, JSON.stringify(await island()))
check('I9 e diz que espera você', s?.title === 'esperando você', JSON.stringify(s))
await sleep(1500)
check('I10 e continua aberta com o painel fechado', (await island()).expanded)

console.log('== Um clique abre o painel logo abaixo')
xdo('mousemove', 800, 30)
await sleep(300)
xdo('click', 1)
const panel = await waitFor(
  () =>
    chat.evaluate(
      `document.visibilityState === 'visible' ? { x: window.screenX, y: window.screenY, w: window.outerWidth } : null`
    ),
  5000
)
check(
  'I11 o painel abre abaixo da cápsula, centralizado',
  !!panel && panel.y >= 88 && Math.abs(panel.x + panel.w / 2 - 800) <= 2,
  JSON.stringify(panel)
)
await sleep(500)
await chat.evaluate(
  `[...document.querySelectorAll('.pane .permission-pending button')].find(b => b.textContent.trim() === 'Negar')?.click()`
)
await sleep(500)
wisp(home, '--toggle')
away()
check('I12 respondido e o painel fechado: ela recolhe', await expanded(false, 6000))
s = await waitFor(async () => {
  const value = await island()
  return value?.tone === 'calm' ? value : null
}, 5000)
check('I13 e se acalma', !!s, JSON.stringify(await island()))

console.log('== Desligada')
await chat.evaluate(`window.wisp.settings.set({ compact: false })`)
await waitFor(async () => (await island()) === null, 4000)
const floating = await ev(
  `({ x: window.screenX, y: window.screenY, w: innerWidth, h: innerHeight })`
)
check(
  'I14 sem a ilha, o mascote volta a flutuar',
  floating.w === 128 && floating.h === 128 && floating.y > 4,
  JSON.stringify(floating)
)
check(
  'I15 e a janela inteira pega o cursor de novo',
  windowAt(floating.x + 20, floating.y + 20) === windowAt(floating.x + 64, floating.y + 80)
)
check(
  'I16 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
