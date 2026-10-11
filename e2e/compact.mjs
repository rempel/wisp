// O modo compacto, de ponta a ponta: o mascote se guarda na borda da tela (só a aba pega o
// cursor), espia quando o cursor passa, com o painel aberto e com um pedido de permissão, volta
// para a borda depois, encosta na outra borda quando arrastado para lá e sai dela quando o modo é
// desligado. O cursor e o arraste são de verdade (xdotool), porque o recorte da janela só vale no
// servidor X. Uso: node e2e/compact.mjs (veja e2e/run.sh); precisa do xdotool.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
// Uma tela de 1600×900 (e2e/run.sh); o mascote começa perto da borda direita.
const home = testHome({ compact: true, mascotPosition: { x: 1400, y: 500 } })
const config = () => JSON.parse(readFileSync(join(home.home, '.config/wisp/config.json'), 'utf8'))
const xdo = (...args) => execFileSync('xdotool', args.map(String)).toString()
/** A janela X que está sob o cursor nesse ponto (o recorte da janela vale aqui). */
const windowAt = (x, y) => {
  xdo('mousemove', x, y)
  return /WINDOW=(\d+)/.exec(xdo('getmouselocation', '--shell'))[1]
}

const mascot = await startApp(home)
const ev = (expression) => mascot.evaluate(expression)
const stage = () =>
  ev(`(() => { const s = document.querySelector('.stage'); return {
    docked: s.classList.contains('docked'),
    edge: s.classList.contains('dock-left') ? 'left' : s.classList.contains('dock-right') ? 'right' : null,
    tucked: s.classList.contains('tucked'),
    x: window.screenX,
    y: window.screenY
  } })()`)
const tucked = (want, ms = 6000) => waitFor(async () => (await stage()).tucked === want, ms)

console.log('== Encostado na borda e guardado')
let s = await waitFor(async () => {
  const value = await stage()
  return value.docked ? value : null
}, 5000)
s ??= await stage()
check(
  'C1 encostado na borda direita',
  s.docked && s.edge === 'right' && s.x === 1600 - 128,
  JSON.stringify(s)
)
// Depois da saudação, que ele dá inteiro.
check('C2 sozinho, ele se guarda', await tucked(true, 10000))
await sleep(500)
const tab = { x: 1600 - 12, y: s.y + 60 }
const behind = { x: 1600 - 90, y: s.y + 60 }
// Primeiro atrás da aba (pôr o cursor na aba faz ele espiar).
const behindWindow = windowAt(behind.x, behind.y)
const mascotWindow = windowAt(tab.x, tab.y)
check('C3 fora da aba, a borda é de quem está atrás', behindWindow !== mascotWindow)

console.log('== Espia com o cursor')
check('C4 o cursor na aba: ele sai inteiro', await tucked(false, 3000))
await sleep(400)
check('C5 e a janela inteira pega o cursor', windowAt(behind.x, behind.y) === mascotWindow)
xdo('mousemove', 700, 400)
check('C6 o cursor sai: ele volta para a borda', await tucked(true, 4000))

console.log('== O painel aberto o segura fora da borda')
wisp(home, '--show')
const chat = await connect('/chat/')
check('C7 painel aberto: ele espia', await tucked(false, 4000))
await sleep(2500)
check('C8 e continua fora enquanto o painel está aberto', !(await stage()).tucked)
wisp(home, '--toggle')
check('C9 painel fechado: volta para a borda', await tucked(true, 4000))

console.log('== Um pedido de permissão também')
wisp(home, '--ask', '[pede ls -la]')
check('C10 com o card esperando, ele espia', await tucked(false, 8000))
await waitFor(() => chat.evaluate(`!!document.querySelector('.pane .permission-pending')`), 8000)
wisp(home, '--toggle')
await sleep(2000)
check('C11 mesmo com o painel fechado, o pedido o segura fora', !(await stage()).tucked)
wisp(home, '--show')
await sleep(700)
await chat.evaluate(
  `[...document.querySelectorAll('.pane .permission-pending button')].find(b => b.textContent.trim() === 'Negar')?.click()`
)
await sleep(500)
wisp(home, '--toggle')
check('C12 respondido e o painel fechado: volta para a borda', await tucked(true, 5000))

console.log('== Arrastado para a outra borda')
await sleep(400)
s = await stage()
xdo('mousemove', tab.x, tab.y)
await tucked(false, 3000)
await sleep(400)
xdo('mousemove', 1600 - 64, s.y + 70)
xdo('mousedown', 1)
for (const x of [1400, 1000, 600, 300, 200]) {
  xdo('mousemove', x, s.y + 40)
  await sleep(60)
}
xdo('mouseup', 1)
xdo('mousemove', 700, 300)
await sleep(600)
s = await stage()
check(
  'C13 solto do lado esquerdo: encosta na borda esquerda',
  s.edge === 'left' && s.x === 0,
  JSON.stringify(s)
)
check('C14 e a posição vai para o config.json', config().mascotPosition?.x === 0)
check('C15 e se guarda do lado esquerdo', await tucked(true, 4000))

console.log('== Desligado')
await chat.evaluate(`window.wisp.settings.set({ compact: false })`)
await waitFor(async () => !(await stage()).docked, 4000)
s = await stage()
check('C16 sai da borda e volta a flutuar', !s.docked && !s.tucked && s.x === 16, JSON.stringify(s))
check(
  'C17 e a janela inteira pega o cursor de novo',
  windowAt(s.x + 30, s.y + 60) === windowAt(s.x + 64, s.y + 80)
)
check(
  'C18 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
