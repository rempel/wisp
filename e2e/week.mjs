// O resumo da semana, de ponta a ponta: uma edição e um comando aprovado (com o Claude Code de
// mentira) aparecem no cartão do topo do histórico e na ferramenta weekly_summary, e o registro
// em ~/.local/share/wisp/atividade.jsonl só tem contagens e nomes, nada do que foi escrito.
// Uso: node e2e/week.mjs (veja e2e/run.sh).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const idle = () =>
  waitFor(() => ev(`!document.querySelector('.status')?.classList.contains('busy')`), 15000)

console.log('== Uma edição e um comando aprovado')
wisp(home, '--ask', '[edit] muda o b no app')
await sleep(500)
await idle()
wisp(home, '--ask', '[pede ls -la ~/segredos]')
await waitFor(() => ev(`!!document.querySelector('.pane .permission-pending')`), 8000)
await sleep(700)
await ev(
  `[...document.querySelectorAll('.pane .permission-pending button')].find(b => b.textContent.trim() === 'Permitir').click()`
)
await idle()

console.log('== O cartão da semana no histórico')
await ev(
  `document.querySelector('.header .icon-button[aria-label="Conversas anteriores"]').click()`
)
const card = await waitFor(
  () => ev(`document.querySelector('.week-card')?.innerText ?? null`),
  5000
)
check('W1 o cartão aparece no topo do histórico', !!card, card)
check('W2 uma conversa (+1 que a semana passada)', /^1\+1\s*conversa$/m.test(card ?? ''), card)
check('W3 as linhas da edição', /\+2\s+−1\s*linhas em 1 edição/.test(card ?? ''), card)
check('W4 o comando aprovado', /1\s*\/ 0\s*aprovadas \/ negadas/.test(card ?? ''), card)
check('W5 as ferramentas mais usadas', /Mais usadas: .*Edit \(1\)/.test(card ?? ''), card)
await ev(
  `[...document.querySelectorAll('.week-tabs button')].find(b => b.textContent === 'Semana passada').click()`
)
const past = await ev(`document.querySelector('.week-card').innerText`)
check('W6 a semana passada, vazia', /^0\s*conversas/m.test(past), past)

console.log('== A ferramenta e o registro')
const file = readdirSync(join(home.runtime, 'wisp')).find((name) => /^mcp-\d+-.+\.json$/.test(name))
const desktop = JSON.parse(readFileSync(join(home.runtime, 'wisp', file), 'utf8')).mcpServers
  .desktop
const response = await fetch(desktop.url, {
  method: 'POST',
  headers: {
    ...desktop.headers,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'weekly_summary', arguments: {} }
  })
})
const body = await response.text()
const data = body.split('\n').find((line) => line.startsWith('data:'))
const summary = JSON.parse(data ? data.slice(5) : body).result.content[0].text
check(
  'W7 weekly_summary: conversas, mensagens e linhas',
  /1 conversa \(\+1\), 2 mensagens/.test(summary) && /\+2 −1 linhas/.test(summary),
  summary
)
const log = readFileSync(join(home.home, '.local/share/wisp/atividade.jsonl'), 'utf8')
check(
  'W8 o registro não tem o que foi escrito nem o comando',
  !/muda o b|segredos|ls -la/.test(log),
  log
)
check(
  'W9 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
