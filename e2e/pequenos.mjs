// Os pequenos (Fase 52), de ponta a ponta: /todas manda a mesma mensagem às duas conversas da
// grade; a busca nas configurações deixa só as seções com o texto; as horas de silêncio vão para o
// config.json; e o resumo da semana vira um PNG.
// Uso: node e2e/pequenos.mjs (veja e2e/run.sh).
import { existsSync, readFileSync } from 'node:fs'
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
const png = join(home.home, 'semana.png')
const mascot = await startApp(home, { WISP_TEST_SAVE_FILE: png })
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const config = () => JSON.parse(readFileSync(join(configDir(home.home), 'config.json'), 'utf8'))

console.log('== /todas na grade')
await ev(`window.wisp.tabs.split('row')`)
await waitFor(() => ev(`document.querySelectorAll('.panes .pane').length === 2`), 5000)
await ev(`document.querySelector('.pane.focused .composer textarea').focus()`)
await chat.send('Input.insertText', { text: '/todas oi para as duas' })
await sleep(200)
await ev(`document.querySelector('.pane.focused .composer').requestSubmit()`)
const both = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.panes .pane')].every((pane) => [...pane.querySelectorAll('.msg.user')].some((m) => m.innerText === 'oi para as duas'))`
    ),
  10000
)
check('P1 a mensagem vai para as duas conversas', !!both)
const answered = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.panes .pane')].every((pane) => pane.querySelectorAll('.msg.assistant').length > 0)`
    ),
  15000
)
check('P2 e as duas respondem', !!answered)

console.log('== A busca nas configurações')
await ev(`document.querySelector('.header [aria-label="Configurações"]').click()`)
await waitFor(() => ev(`!!document.querySelector('.settings-search')`), 5000)
const total = await ev(`document.querySelectorAll('.settings-section:not([hidden])').length`)
await ev(`document.querySelector('.settings-search').focus()`)
await chat.send('Input.insertText', { text: 'silencio' })
await sleep(300)
const visible = await ev(
  `[...document.querySelectorAll('.settings-section:not([hidden]) h2')].map((h) => h.textContent)`
)
check(
  'P3 "silencio" (sem acento) deixa só a seção das horas de silêncio',
  visible.length >= 1 && visible.length < total,
  JSON.stringify({ total, visible })
)

console.log('== As horas de silêncio')
await ev(`document.querySelector('.quiet-hours input[type=checkbox]').click()`)
const saved = await waitFor(
  () => (config().quietHours?.from === '22:00' ? config().quietHours : null),
  5000
)
check('P4 ligar grava das 22:00 às 08:00', saved?.to === '08:00', JSON.stringify(saved))

console.log('== O resumo em imagem')
await ev(`document.querySelector('.header [aria-label="Conversas anteriores"]').click()`)
await waitFor(() => ev(`!!document.querySelector('.week-card')`), 5000)
await ev(
  `[...document.querySelectorAll('.week-card button')].find((b) => b.textContent === 'Salvar como imagem').click()`
)
const image = await waitFor(() => existsSync(png) && readFileSync(png).length > 1000, 8000)
check(
  'P5 o PNG sai',
  !!image && readFileSync(png).subarray(1, 4).toString() === 'PNG',
  existsSync(png) ? String(readFileSync(png).length) : 'sem arquivo'
)
check(
  'P6 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
