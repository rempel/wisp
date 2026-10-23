// Os primeiros passos e o diagnóstico (Fase 20), de ponta a ponta. Numa máquina sem o Claude
// Code: na primeira vez, o painel abre sozinho nos primeiros passos, diz o que falta e como
// instalar, e oferece a demonstração; na segunda vez, não aparece mais. Com o Claude Code (de
// mentira) sem login e o aviso de versão ligado (um GitHub de mentira): o diagnóstico mostra o
// login que falta e a versão nova, e o relatório não leva nada pessoal.
// Uso: node e2e/primeiros-passos.mjs (veja e2e/run.sh).
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { hostname, userInfo } from 'node:os'
import { join } from 'node:path'
import {
  checks,
  connect,
  FAKE_CLAUDE,
  sleep,
  startApp,
  stopApp,
  testHome,
  waitFor,
  wisp
} from './lib.mjs'

const { check, failed } = checks()
const home = testHome({ claudePath: '/nao/existe/claude' })
const welcomeFile = join(home.home, '.local/share/wisp/boas-vindas.json')
rmSync(welcomeFile)
const configFile = join(home.home, '.config/wisp/config.json')
const config = () => JSON.parse(readFileSync(configFile, 'utf8'))

// O GitHub de mentira, com uma versão nova.
const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  res.end(
    JSON.stringify({
      tag_name: 'v9.9.9',
      html_url: 'https://github.com/rempel/wisp/releases/tag/v9.9.9'
    })
  )
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const releases = `http://127.0.0.1:${server.address().port}/latest`

console.log('== A primeira vez, sem o Claude Code')
let mascot = await startApp(home)
// Sem --show: o painel abre sozinho.
let chat = await connect('/chat/')
let ev = (expression) => chat.evaluate(expression)
const title = () => ev(`document.querySelector('.header .title strong')?.textContent ?? null`)
const welcome = await waitFor(
  async () => ((await title()) === 'Primeiros passos' ? 'sim' : null),
  10000
)
check('P1 o painel abre sozinho nos primeiros passos', welcome === 'sim', await title())
const click = (label) =>
  ev(
    `(() => { const b = [...document.querySelectorAll('.welcome button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!b || b.disabled) return false; b.click(); return true })()`
  )
const step = () =>
  ev(
    `(() => { const s = document.querySelector('.welcome-step'); return s ? { check: s.dataset.check ?? null, text: s.innerText } : null })()`
  )
check('P2 a apresentação', /Oi! Eu sou o Wisp/.test((await step())?.text ?? ''))
await waitFor(() => click('Começar'), 8000)
let now = await waitFor(async () => {
  const value = await step()
  return value?.check === 'claude' ? value : null
}, 5000)
check(
  'P3 o Claude Code falta, com como instalar e a demonstração',
  /Falta/.test(now?.text ?? '') &&
    /claude\.ai\/install\.sh/.test(now?.text ?? '') &&
    /npm install -g @anthropic-ai\/claude-code/.test(now?.text ?? '') &&
    /Ligar a demonstração/.test(now?.text ?? ''),
  now?.text
)
await click('Próximo')
now = await step()
check(
  'P4 o login fica para depois',
  now?.check === 'login' && /Desligado/.test(now.text),
  now?.text
)
// O atalho, a bandeja, o chaveiro e a voz (opcionais), e o fim.
for (let i = 0; i < 5; i++) await click('Próximo')
now = await step()
check(
  'P5 no fim, quase lá: falta o Claude Code',
  /Quase lá/.test(now?.text ?? '') && /modo demonstração/.test(now?.text ?? ''),
  now?.text
)
await click('Ligar a demonstração')
const closed = await waitFor(async () => ((await title()) === 'Wisp' ? 'chat' : null), 5000)
check(
  'P6 a demonstração liga, e os primeiros passos acabam',
  closed === 'chat' && config().demo === true && existsSync(welcomeFile),
  JSON.stringify({ closed, demo: config().demo })
)
const logs = [...mascot.logs, ...chat.logs]
await stopApp()

console.log('== A segunda vez')
mascot = await startApp(home)
await sleep(2500)
let opened = true
try {
  chat = await connect('/chat/', 1500)
} catch {
  opened = false
}
check('P7 não aparece de novo (o painel nem abre)', !opened)
logs.push(...mascot.logs)
await stopApp()

console.log('== O diagnóstico, com o Claude Code sem login e uma versão nova')
writeFileSync(
  configFile,
  JSON.stringify({ ...config(), claudePath: FAKE_CLAUDE, demo: false, updateCheck: true })
)
mascot = await startApp(home, {
  FAKE_CLAUDE_LOGGED_OUT: '1',
  WISP_RELEASES_URL: releases,
  WISP_TEST_UPDATE_FIRST_MS: '300'
})
wisp(home, '--show')
chat = await connect('/chat/')
ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
await sleep(1200)
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
await waitFor(
  () =>
    ev(
      `(() => { const b = [...document.querySelectorAll('.diag-links button')].find(b => b.textContent === 'Diagnóstico'); if (!b) return false; b.click(); return true })()`
    ),
  5000
)
const items = await waitFor(
  () =>
    ev(
      `(() => { const l = [...document.querySelectorAll('.diag-item')]; return l.length ? l.map(i => ({ id: i.dataset.check, text: i.innerText })) : null })()`
    ),
  15000
)
const item = (id) => items?.find((i) => i.id === id)?.text ?? ''
check(
  'P8 o Claude Code de mentira, com a versão',
  /Claude Code 2\.1\.296/.test(item('claude')),
  item('claude')
)
check(
  'P9 o login que falta, com o terminal',
  /Falta/.test(item('login')) && /Abrir um terminal/.test(item('login')),
  item('login')
)
check(
  'P10 a versão nova, com o botão',
  /9\.9\.9/.test(item('update')) && /Ver a versão nova/.test(item('update')),
  item('update')
)
const report = await ev(`document.querySelector('.diag-report pre')?.textContent ?? ''`)
check(
  'P11 o relatório: versões e resultados, nada pessoal',
  /Diagnóstico do Wisp/.test(report) &&
    /Claude Code:\*\* 2\.1\.296, sem login/.test(report) &&
    /aviso de versão/.test(report) &&
    !report.includes(home.home) &&
    !report.includes('/nao/existe') &&
    !(userInfo().username.length > 3 && report.includes(userInfo().username)) &&
    !report.includes(hostname()),
  report
)
await ev(`document.querySelector('.diag-copy').click()`)
check(
  'P12 copiar o relatório',
  (await waitFor(
    () => ev(`document.querySelector('.diag-copy').textContent === 'Copiado'`),
    2000
  )) === true
)
const state = JSON.parse(readFileSync(join(home.home, '.local/share/wisp/versao.json'), 'utf8'))
check(
  'P13 a versão nova avisada uma vez, guardada',
  state.notified === '9.9.9',
  JSON.stringify(state)
)
check(
  'P14 sem erros nas páginas',
  logs.length === 0 && mascot.logs.length === 0 && chat.logs.length === 0,
  [...logs, ...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
server.close()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
