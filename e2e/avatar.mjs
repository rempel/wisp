// Os avatares (Fase 19), de ponta a ponta: o robô por padrão; trocar para o fantasminha nas
// configurações muda o mascote na hora (o corpo, sem a haste da luz), o avatar do cabeçalho e o
// do painel vazio; os estados continuam pintando o fantasminha (o âmbar de um pedido); a ilha
// mostra o mesmo; e ele continua fantasminha depois de fechar e abrir o Wisp.
// Uso: node e2e/avatar.mjs (veja e2e/run.sh).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const config = () => JSON.parse(readFileSync(join(home.home, '.config/wisp/config.json'), 'utf8'))

let mascot = await startApp(home)
let m = (expression) => mascot.evaluate(expression)
wisp(home, '--show')
let chat = await connect('/chat/')
let ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const body = () =>
  m(
    `(() => { const s = document.querySelector('.stage'); return JSON.stringify({ avatar: [...s.classList].find(c => c.startsWith('avatar-')), visor: !!s.querySelector('.body .visor'), arms: s.querySelectorAll('.body .ghost-arm').length, rod: !!s.querySelector('.antenna-rod'), led: !!s.querySelector('.antenna .led') }) })()`
  ).then(JSON.parse)

console.log('== O robô, por padrão')
let now = await body()
check(
  'A1 o robô: a gota com o visor e a antena',
  now.avatar === 'avatar-robo' && now.visor && now.rod && now.arms === 0,
  JSON.stringify(now)
)
check(
  'A2 o avatar do cabeçalho é o robô',
  await ev(`!document.querySelector('.header .avatar').classList.contains('avatar-ghost')`)
)

console.log('== Trocar nas configurações')
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
const select = `[...document.querySelectorAll('.settings-row')].find(r => r.querySelector('.settings-label')?.textContent === 'Avatar')?.querySelector('select')`
await waitFor(() => ev(`!!${select}`), 5000)
const options = await ev(`[...${select}.options].map(o => o.textContent)`)
check(
  'A3 a escolha nas configurações',
  JSON.stringify(options) === '["Robô (a gotinha)","Fantasminha"]',
  JSON.stringify(options)
)
await ev(
  `(() => { const s = ${select}; s.value = 'fantasma'; s.dispatchEvent(new Event('change', { bubbles: true })) })()`
)
now = await waitFor(async () => {
  const value = await body()
  return value.avatar === 'avatar-fantasma' ? value : null
}, 5000)
check(
  'A4 o mascote vira o fantasminha na hora: sem visor e sem a haste, com a luz em cima',
  now && !now.visor && !now.rod && now.led && now.arms === 2,
  JSON.stringify(now)
)
check('A5 gravado no config.json', config().avatar === 'fantasma', JSON.stringify(config().avatar))
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
check(
  'A6 o avatar do cabeçalho e o do painel vazio acompanham',
  await waitFor(
    () =>
      ev(
        `document.querySelector('.header .avatar')?.classList.contains('avatar-ghost') && document.querySelector('.pane .empty .avatar')?.classList.contains('avatar-ghost')`
      ),
    5000
  )
)

console.log('== Os estados pintam o fantasminha')
const idleShell = await m(
  `getComputedStyle(document.querySelector('.stage')).getPropertyValue('--shell-1').trim()`
)
wisp(home, '--ask', 'roda [pede ls]')
const amber = await waitFor(async () => {
  const value = await m(
    `(() => { const s = document.querySelector('.stage'); return s.classList.contains('state-permission') ? getComputedStyle(s).getPropertyValue('--shell-1').trim() : null })()`
  )
  return value
}, 8000)
check(
  'A7 pedindo permissão, o fantasminha fica âmbar como o robô',
  idleShell === '#f8f7ff' && amber === '#fcd34d',
  `${idleShell} → ${amber}`
)
await ev(
  `[...document.querySelectorAll('.pane .permission-pending button')].find(b => b.textContent.trim() === 'Negar').click()`
)

console.log('== A ilha')
await ev(`window.wisp.settings.set({ compact: true })`)
check(
  'A8 a ilha mostra o fantasminha',
  await waitFor(() => m(`!!document.querySelector('.island .stage.avatar-fantasma')`), 5000)
)
await ev(`window.wisp.settings.set({ compact: false })`)
await waitFor(() => m(`!document.querySelector('.island')`), 5000)

console.log('== Fechar e abrir o Wisp')
const logs = [...mascot.logs, ...chat.logs]
await stopApp()
mascot = await startApp(home)
m = (expression) => mascot.evaluate(expression)
now = await waitFor(async () => {
  const value = await body()
  return value.avatar === 'avatar-fantasma' ? value : null
}, 8000)
check('A9 continua fantasminha', !!now, JSON.stringify(await body()))
wisp(home, '--show')
chat = await connect('/chat/')
ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
check(
  'A10 e o cabeçalho também',
  await waitFor(
    () => ev(`document.querySelector('.header .avatar')?.classList.contains('avatar-ghost')`),
    5000
  )
)
check(
  'A11 sem erros nas páginas',
  logs.length === 0 && mascot.logs.length === 0 && chat.logs.length === 0,
  [...logs, ...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
