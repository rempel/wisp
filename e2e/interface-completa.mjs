// A interface completa (Fases 87 a 91), de ponta a ponta: o botão troca o painel compacto pela
// janela completa (e o Wisp lembra, até depois de fechar e abrir); o primeiro abrir do dia mostra
// o Início; a sidebar busca pelo que foi dito e reabre a conversa; as configurações abrem uma
// categoria por vez, e a busca delas acha em qualquer uma; no compacto, a sidebar abre por cima.
// Uso: node e2e/interface-completa.mjs (veja e2e/run.sh).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  checks,
  configDir,
  connect,
  sleep,
  startApp,
  stopApp,
  testHome,
  waitFor,
  wisp
} from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const config = () => JSON.parse(readFileSync(join(configDir(home.home), 'config.json'), 'utf8'))

await startApp(home)
wisp(home, '--show')
let chat = await connect('/chat/')
let ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)

const say = async (text) => {
  const before = await ev(`document.querySelectorAll('.pane.focused .msg.assistant').length`)
  await ev(`document.querySelector('.pane.focused .composer textarea').focus()`)
  await chat.send('Input.insertText', { text })
  await sleep(200)
  await ev(`document.querySelector('.pane.focused .composer').requestSubmit()`)
  await waitFor(
    () => ev(`document.querySelectorAll('.pane.focused .msg.assistant').length > ${before}`),
    15000
  )
}
const item = (label) =>
  ev(
    `[...document.querySelectorAll('.sidebar-item')].find(b => b.getAttribute('aria-label') === ${JSON.stringify(label)})?.click() ?? false`
  )

console.log('== O compacto')
check(
  'I1 começa compacto, sem a sidebar fixa',
  !(await ev(`!!document.querySelector('.sidebar-host')`))
)
await say('Vamos falar do deploy da loja na sexta')
check('I2 a conversa vai normal', (await ev(`innerWidth`)) < 700)

console.log('== A janela completa')
await ev(`document.querySelector('.window-mode').click()`)
const wide = await waitFor(() => ev(`innerWidth >= 1000 ? innerWidth : null`), 8000)
check('I3 o botão abre a janela completa', !!wide, String(wide))
check(
  'I4 com a sidebar fixa, e o modo guardado',
  (await ev(`!!document.querySelector('.sidebar-host .sidebar')`)) && config().windowMode === 'full'
)
const homeShown = await waitFor(() => ev(`!!document.querySelector('.home-grid')`), 5000)
check('I5 o primeiro abrir do dia no modo completo mostra o Início', !!homeShown)
const cards = await ev(
  `[...document.querySelectorAll('.home-block')].map(b => b.getAttribute('aria-label'))`
)
check(
  'I6 o Início tem os blocos do dia',
  ['Agenda de hoje', 'Minhas tarefas', 'Agendado e lembretes', 'Uso do plano', 'Conversas'].every(
    (title) => cards.includes(title)
  ),
  JSON.stringify(cards)
)

console.log('== A busca da sidebar')
// A sidebar começa como o trilho de ícones (Fase 92): o botão do topo abre a completa.
await ev(`document.querySelector('.sidebar-collapse').click()`)
await waitFor(() => ev(`!!document.querySelector('.sidebar-search input')`), 3000)
await ev(`document.querySelector('.sidebar-search input').focus()`)
await chat.send('Input.insertText', { text: 'deploy' })
const found = await waitFor(
  () => ev(`document.querySelector('.sidebar-section mark')?.textContent ?? null`),
  8000
)
check('I7 a busca acha pelo que foi dito, com o trecho', /deploy/i.test(found ?? ''), found)
await ev(`document.querySelector('.sidebar-section .sidebar-row').click()`)
const opened = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane.focused .msg.user')].some(e => /deploy da loja/.test(e.innerText)) ? true : null`
    ),
  8000
)
check('I8 o clique reabre a conversa', !!opened)

console.log('== As configurações em categorias')
await item('Configurações')
await waitFor(() => ev(`!!document.querySelector('.settings-categories')`), 5000)
const visible = () =>
  ev(
    `[...document.querySelectorAll('.settings-section')].filter(s => !s.hidden).map(s => s.querySelector('h2').textContent)`
  )
await ev(
  `[...document.querySelectorAll('.settings-category')].find(b => b.textContent === 'Voz').click()`
)
await sleep(300)
check(
  'I9 a categoria Voz mostra só a voz',
  JSON.stringify(await visible()) === '["Voz"]',
  JSON.stringify(await visible())
)
await ev(`document.querySelector('.settings-nav .settings-search').focus()`)
await chat.send('Input.insertText', { text: 'telegram' })
await sleep(400)
check(
  'I10 a busca acha em qualquer categoria',
  (await visible()).includes('Telegram') && !(await visible()).includes('Voz'),
  JSON.stringify(await visible())
)

console.log('== Recolher e lembrar')
await ev(`document.querySelector('.sidebar-collapse').click()`)
const narrow = await waitFor(
  () => ev(`document.querySelector('.sidebar').getBoundingClientRect().width < 80 ? true : null`),
  3000
)
check('I11 a sidebar recolhe em ícones', !!narrow)
await ev(`document.querySelector('.sidebar-collapse').click()`)
await stopApp()
const mascot = await startApp(home)
wisp(home, '--show')
chat = await connect('/chat/')
ev = (expression) => chat.evaluate(expression)
await waitFor(
  () => ev(`!!document.querySelector('.pane .composer') || !!document.querySelector('.home')`),
  15000
)
const again = await waitFor(() => ev(`innerWidth >= 1000 ? innerWidth : null`), 8000)
check('I12 fechar e abrir volta na janela completa', !!again, String(again))

console.log('== De volta ao compacto')
await ev(`document.querySelector('.window-mode').click()`)
const compact = await waitFor(() => ev(`innerWidth < 700 ? innerWidth : null`), 8000)
check(
  'I13 o botão volta ao painel compacto',
  !!compact && config().windowMode === 'compact',
  String(compact)
)
await ev(`document.querySelector('.header-nav .icon-button').click()`)
const drawer = await waitFor(() => ev(`!!document.querySelector('.sidebar-drawer .sidebar')`), 3000)
check('I14 no compacto, a sidebar abre por cima', !!drawer)
await item('Início')
const closed = await waitFor(
  () =>
    ev(
      `!document.querySelector('.sidebar-drawer') && !!document.querySelector('.home') ? true : null`
    ),
  3000
)
check('I15 escolher fecha a sidebar e abre a tela', !!closed)

check(
  'I16 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)
await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
