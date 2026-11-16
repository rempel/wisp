// O chat como o CLI (Fase 17), de ponta a ponta: mandar com o Claude trabalhando (a mensagem fica
// "na fila" e entra na próxima pausa), o menu dos comandos com barra (os do Claude Code e os do
// Wisp), os passos de um subagente dentro do card dele e uma tarefa em segundo plano.
// Uso: node e2e/fila.mjs (veja e2e/run.sh).
import {
  checks,
  connect,
  fakeLog,
  sleep,
  startApp,
  stopApp,
  testHome,
  waitFor,
  wisp
} from './lib.mjs'

const { check, failed } = checks()
// Sem os prompts salvos (Fase 26): o menu da barra fica só com os comandos.
const home = testHome({ prompts: [] })
const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
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
  await sleep(150)
}
const typeText = async (text) => {
  await ev(`document.querySelector('.pane .composer textarea').focus()`)
  await chat.send('Input.insertText', { text })
  await sleep(100)
}
const send = async (text) => {
  await typeText(text)
  await key('Enter', 'Enter', 13)
}
const busy = () =>
  ev(`document.querySelector('.header .status')?.classList.contains('busy') ?? false`)
const idle = () => waitFor(async () => !(await busy()), 15000)
const answers = () =>
  ev(`[...document.querySelectorAll('.pane .msg.assistant')].map(e => e.innerText)`)

console.log('== Mandar com o Claude trabalhando')
await send('arruma isso [demorado]')
await waitFor(busy, 5000)
await waitFor(() => ev(`!!document.querySelector('.pane .tool')`), 5000)
check(
  'F1 trabalhando, a caixa continua aberta',
  await ev(`!document.querySelector('.pane .composer textarea').disabled`)
)
await send('e também aquilo')
const badge = await waitFor(
  () => ev(`document.querySelector('.pane .queue-badge')?.textContent ?? null`),
  3000
)
check('F2 a mensagem aparece na fila', badge === 'na fila', badge)
const delivered = await waitFor(
  () => ev(`!document.querySelector('.pane .queue-badge') ? 'entregue' : null`),
  8000
)
check('F3 o Claude pega a mensagem na pausa e o selo sai', delivered === 'entregue')
await idle()
const seen = (await answers()).at(-1)
check(
  'F4 a mesma resposta leva em conta o que foi mandado no meio',
  /Vi no meio do caminho: e também aquilo/.test(seen ?? ''),
  seen
)
const tools = await ev(`document.querySelectorAll('.pane .tool').length`)
check('F5 as ferramentas do turno continuam no lugar', tools === 2, tools)

console.log('== Os comandos com barra')
await typeText('/')
const menu = await waitFor(
  () =>
    ev(
      `(() => { const o = [...document.querySelectorAll('.slash-option strong')].map(e => e.textContent); return o.length ? o : null })()`
    ),
  3000
)
check(
  'F6 a barra abre o menu: os do Wisp e os do Claude Code',
  JSON.stringify(menu) ===
    JSON.stringify(['/compact', '/clear', '/pr', '/revisa', '/review', '/init', '/deploy-rapido']),
  JSON.stringify(menu)
)
await chat.send('Input.insertText', { text: 'rev' })
await sleep(150)
const filtered = await ev(
  `[...document.querySelectorAll('.slash-option strong')].map(e => e.textContent)`
)
check(
  'F7 filtra pelo que se digita',
  filtered[0] === '/revisa' && filtered.includes('/review'),
  JSON.stringify(filtered)
)
await key('Tab', 'Tab', 9)
const completed = await ev(`document.querySelector('.pane .composer textarea').value`)
check('F8 o Tab completa o comando', completed === '/revisa ', JSON.stringify(completed))
await ev(
  `(() => { const t = document.querySelector('.pane .composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, '/'); t.dispatchEvent(new Event('input', { bubbles: true })) })()`
)
await sleep(150)
await key('Escape', 'Escape', 27)
const visible = await ev(
  `document.visibilityState === 'visible' && !document.querySelector('.slash-menu')`
)
check('F9 o Esc fecha o menu, sem esconder o painel', visible)
await ev(
  `(() => { const t = document.querySelector('.pane .composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, ''); t.dispatchEvent(new Event('input', { bubbles: true })) })()`
)
await send('/compact o que importa')
const compacted = await waitFor(() => fakeLog(home, 'compacts').length > 0, 8000)
check(
  'F10 /compact pela caixa compacta, com as instruções',
  compacted && JSON.parse(fakeLog(home, 'compacts')[0]).text === '/compact o que importa',
  fakeLog(home, 'compacts').join('\n')
)
await idle()

console.log('== Um subagente e uma tarefa em segundo plano')
await send('investiga [agente]')
const steps = await waitFor(
  () =>
    ev(
      `(() => { const s = [...document.querySelectorAll('.pane .subagent-step')].map(e => e.innerText.trim()); return s.length === 2 ? s : null })()`
    ),
  8000
)
check(
  'F11 os passos do subagente dentro do card do Agente',
  JSON.stringify(steps) === JSON.stringify(['Ler app.ts', 'Buscar “contador”']),
  JSON.stringify(steps)
)
check(
  'F12 nenhum passo do subagente vira card solto',
  (await ev(`[...document.querySelectorAll('.pane .tool-name')].map(e => e.textContent)`)).filter(
    (n) => n === 'Read'
  ).length === 0
)
await idle()
await send('sobe o servidor [tarefa]')
const bar = await waitFor(
  () => ev(`document.querySelector('.pane .task-bar')?.innerText ?? null`),
  5000
)
check('F13 a tarefa em segundo plano aparece', /Em segundo plano: npm run dev/.test(bar ?? ''), bar)
const ended = await waitFor(
  () => ev(`!document.querySelector('.pane .task-bar') ? 'saiu' : null`),
  8000
)
check('F14 e sai quando acaba', ended === 'saiu')
check(
  'F15 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
