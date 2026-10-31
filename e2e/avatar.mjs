// Os avatares (Fase 19; o fogo-fátuo e a geleca, Fase 39), de ponta a ponta: o fogo-fátuo por
// padrão; trocar para a geleca e para o fantasminha nas configurações muda o mascote na hora (o
// corpo, a luz de cima), o avatar do cabeçalho e o do painel vazio; os estados continuam pintando
// a geleca (o âmbar de um pedido); a ilha mostra o mesmo; ele continua o escolhido depois de
// fechar e abrir o Wisp; e quem usava a gotinha robô abre no fogo-fátuo, sem aviso.
// Uso: node e2e/avatar.mjs (veja e2e/run.sh). Com WISP_E2E_SHOTS, os prints de cada um.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome({ avatar: 'robo' })
const config = () => JSON.parse(readFileSync(join(home.home, '.config/wisp/config.json'), 'utf8'))
const SHOTS = process.env.WISP_E2E_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let mascot = await startApp(home)
let m = (expression) => mascot.evaluate(expression)
/** O mascote, recortado no quadro dele (com folga para a luz de cima e o brilho). */
const shoot = async (name) => {
  if (!SHOTS) return
  await sleep(700)
  const box = await m(
    `(() => { const r = document.querySelector('.stage').getBoundingClientRect(); return { x: r.left - 16, y: r.top - 8, width: r.width + 32, height: r.height + 16 } })()`
  )
  const { data } = await mascot.send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...box, scale: 1 }
  })
  if (data) writeFileSync(join(SHOTS, `avatar-${name}.png`), Buffer.from(data, 'base64'))
}
wisp(home, '--show')
let chat = await connect('/chat/')
let ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const body = () =>
  m(
    `(() => { const s = document.querySelector('.stage'); return JSON.stringify({ avatar: [...s.classList].find(c => c.startsWith('avatar-')), flame: !!s.querySelector('.body .flame-core'), jelly: !!s.querySelector('.body .jelly-puddle'), visor: !!s.querySelector('.body .visor'), arms: s.querySelectorAll('.body .ghost-arm').length, rod: !!s.querySelector('.antenna-rod'), led: !!s.querySelector('.antenna .led') }) })()`
  ).then(JSON.parse)
const headerAvatar = (name) =>
  ev(
    `document.querySelector('.header .avatar')?.classList.contains('avatar-${name}') && document.querySelector('.pane .empty .avatar')?.classList.contains('avatar-${name}')`
  )

console.log('== O fogo-fátuo, por padrão (e no lugar da gotinha)')
let now = await body()
check(
  'A1 quem usava a gotinha abre no fogo-fátuo: a chama com o miolo, a faísca em cima',
  now.avatar === 'avatar-fogo' && now.flame && !now.visor && !now.rod && now.led && now.arms === 0,
  JSON.stringify(now)
)
const settings = await ev(`window.wisp.settings.get()`)
check(
  'A2 sem o aviso de valor inválido, e o arquivo ainda não foi tocado',
  settings.values.avatar === 'fogo' && settings.problems.length === 0 && config().avatar === 'robo',
  JSON.stringify({
    avatar: settings.values.avatar,
    problems: settings.problems,
    file: config().avatar
  })
)
check(
  'A3 o avatar do cabeçalho é o fogo-fátuo',
  !!(await waitFor(() => headerAvatar('fogo'), 5000))
)
await shoot('fogo')

console.log('== Trocar nas configurações')
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
const select = `[...document.querySelectorAll('.settings-row')].find(r => r.querySelector('.settings-label')?.textContent === 'Avatar')?.querySelector('select')`
await waitFor(() => ev(`!!${select}`), 5000)
const options = await ev(`[...${select}.options].map(o => o.textContent)`)
check(
  'A4 a escolha nas configurações: o fogo-fátuo, a geleca e o fantasminha',
  JSON.stringify(options) === '["Fogo-fátuo","Geleca","Fantasminha"]',
  JSON.stringify(options)
)
const choose = (value) =>
  ev(
    `(() => { const s = ${select}; s.value = '${value}'; s.dispatchEvent(new Event('change', { bubbles: true })) })()`
  )
await choose('geleca')
now = await waitFor(async () => {
  const value = await body()
  return value.avatar === 'avatar-geleca' ? value : null
}, 5000)
check(
  'A5 o mascote vira a geleca na hora: o corpo com a pocinha, a bolha em cima',
  now && now.jelly && !now.flame && now.led && now.arms === 0,
  JSON.stringify(now)
)
check('A6 gravado no config.json', config().avatar === 'geleca', JSON.stringify(config().avatar))
await shoot('geleca')
await choose('fantasma')
now = await waitFor(async () => {
  const value = await body()
  return value.avatar === 'avatar-fantasma' ? value : null
}, 5000)
check(
  'A7 e o fantasminha, com os bracinhos',
  now && !now.jelly && !now.flame && now.led && now.arms === 2,
  JSON.stringify(now)
)
await shoot('fantasma')
await choose('geleca')
await waitFor(async () => ((await body()).avatar === 'avatar-geleca' ? true : null), 5000)
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
check(
  'A8 o avatar do cabeçalho e o do painel vazio acompanham',
  !!(await waitFor(() => headerAvatar('geleca'), 5000))
)

console.log('== Os estados pintam a geleca')
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
  'A9 pedindo permissão, a geleca fica âmbar como os outros',
  idleShell === '#5eead4' && amber === '#fcd34d',
  `${idleShell} → ${amber}`
)
await shoot('geleca-pedido')
await ev(
  `[...document.querySelectorAll('.pane .permission-pending button')].find(b => b.textContent.trim() === 'Negar').click()`
)

console.log('== A ilha')
await ev(`window.wisp.settings.set({ compact: true })`)
check(
  'A10 a ilha mostra a geleca',
  !!(await waitFor(() => m(`!!document.querySelector('.island .stage.avatar-geleca')`), 5000))
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
  return value.avatar === 'avatar-geleca' ? value : null
}, 8000)
check('A11 continua a geleca', !!now, JSON.stringify(await body()))
wisp(home, '--show')
chat = await connect('/chat/')
ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
check(
  'A12 e o cabeçalho também',
  !!(await waitFor(
    () => ev(`document.querySelector('.header .avatar')?.classList.contains('avatar-geleca')`),
    5000
  ))
)
check(
  'A13 sem erros nas páginas',
  logs.length === 0 && mascot.logs.length === 0 && chat.logs.length === 0,
  [...logs, ...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
