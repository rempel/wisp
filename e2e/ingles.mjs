// Os idiomas (Fase 25), de ponta a ponta. Num sistema em inglês (LANG=en_US.UTF-8) e sem nada
// no config.json: o painel, as configurações, o histórico, as sessões e o diagnóstico em inglês,
// sem sobra de português; o mascote também; o Claude Code recebe o pedido de responder em
// inglês. Nas configurações, trocar para português grava o config.json, oferece abrir o Wisp de
// novo e, aberto de novo, tudo vem em português, com as abas de antes.
// Uso: node e2e/ingles.mjs (veja e2e/run.sh).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  checks,
  connect,
  fakeLog,
  PORT,
  sleep,
  startApp,
  stopApp,
  testHome,
  waitFor,
  wisp
} from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const configFile = join(home.home, '.config/wisp/config.json')
const config = () => JSON.parse(readFileSync(configFile, 'utf8'))
const ENGLISH = { LANG: 'en_US.UTF-8' }

/** Palavras que só aparecem em português (com a forma e o acento delas). */
const PORTUGUESE =
  /\b(não|você|conversa|configurações|mensagem|pasta|sessão|sessões|está|são|também|então|ação|é|nenhum|nenhuma|abrir|fechar|enviar|permitir|negar|aqui|agora|ainda|sem|com|para|pelo|pela)\b/i
/** O texto à vista que parece português (o nome "Português" do seletor de idioma vale). */
const leftovers = (text) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && PORTUGUESE.test(line.replace(/Português/g, '')))

console.log('== Num sistema em inglês')
let mascot = await startApp(home, ENGLISH)
wisp(home, '--show')
let chat = await connect('/chat/')
let ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)

check('I1 a página diz que está em inglês', (await ev('document.documentElement.lang')) === 'en')
const placeholder = await ev(`document.querySelector('.pane .composer textarea')?.placeholder`)
check('I2 a caixa de texto em inglês', placeholder === 'Ask Wisp…', placeholder)
const hello = await ev(`document.querySelector('.pane .hello')?.textContent`)
check('I3 a saudação em inglês', hello === "Hi! I'm Wisp.", hello)
let text = await ev('document.body.innerText')
let rest = leftovers(text)
check('I4 nada em português no painel', rest.length === 0, rest.join(' | '))

console.log('== As outras telas do painel')
const header = (label) =>
  ev(
    `(() => { const b = document.querySelector('.header .icon-button[aria-label=${JSON.stringify(label)}]'); if (!b) return false; b.click(); return true })()`
  )
const screens = [
  ['Settings', '.settings', 'I5'],
  ['Previous conversations', '.history', 'I6'],
  ['Terminal sessions', '.sessions', 'I7']
]
for (const [label, selector, id] of screens) {
  const opened = await header(label)
  await waitFor(() => ev(`!!document.querySelector(${JSON.stringify(selector)})`), 5000)
  await sleep(300)
  text = await ev(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? ''`)
  rest = leftovers(text)
  check(
    `${id} ${label}: o botão em inglês e nada em português`,
    opened && text.length > 0 && rest.length === 0,
    opened ? rest.slice(0, 8).join(' | ') : 'o botão não apareceu'
  )
  await header('Back to the conversation')
  await sleep(200)
}

// O diagnóstico: pelo botão das configurações.
await header('Settings')
await waitFor(() => ev(`!!document.querySelector('.settings')`), 5000)
const diagnostics = await ev(
  `(() => { const b = [...document.querySelectorAll('.diag-links button')].find(b => b.textContent.trim() === 'Diagnostics'); if (!b) return false; b.click(); return true })()`
)
const diag = await waitFor(async () => {
  const t = await ev(`document.querySelector('.diagnostics')?.innerText ?? ''`)
  return t.includes('Claude Code') && !t.includes('Checking…') ? t : null
}, 15000)
rest = leftovers(diag ?? '')
check(
  'I8 o diagnóstico em inglês',
  diagnostics && !!diag && rest.length === 0,
  rest.slice(0, 8).join(' | ')
)
await header('Back to the conversation')
await sleep(200)

console.log('== O mascote e o Claude Code')
const bubble = await mascot.evaluate(`document.querySelector('.bubble')?.textContent?.trim()`)
check('I9 o mascote em inglês', bubble === 'hi!', bubble)
check(
  'I10 o mascote diz que está em inglês',
  (await mascot.evaluate('document.documentElement.lang')) === 'en'
)

await ev(
  `(() => { const box = document.querySelector('.pane .composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(box, 'hello'); box.dispatchEvent(new Event('input', { bubbles: true })) })()`
)
await ev(`document.querySelector('.pane .composer .send').click()`)
await waitFor(() => fakeLog(home, 'spawns').length > 0, 10000)
const spawn = JSON.parse(fakeLog(home, 'spawns').at(-1))
check('I11 o Claude Code recebe o pedido de responder em inglês', spawn.replyIn === 'en', spawn)
await waitFor(() => ev(`document.querySelectorAll('.pane .msg.assistant').length > 0`), 10000)

// Os painéis à vista, para comparar depois de abrir de novo.
const before = await ev(`document.querySelectorAll('.pane').length`)

console.log('== Trocar para português nas configurações')
await header('Settings')
await waitFor(() => ev(`!!document.querySelector('.settings')`), 5000)
const select = `[...document.querySelectorAll('.settings .settings-row')].find(r => r.querySelector('label, .settings-label')?.textContent.trim().startsWith('Language'))?.querySelector('select')`
const options = await ev(`[...(${select})?.options ?? []].map(o => o.textContent)`)
check(
  'I12 o seletor tem o do sistema e cada idioma no próprio nome',
  JSON.stringify(options) === JSON.stringify(["The system's", 'Português', 'English']),
  options
)
check('I13 nada de botão para reabrir enquanto o idioma não muda', !(await relaunchButton()))
await ev(
  `(() => { const s = ${select}; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'pt'); s.dispatchEvent(new Event('change', { bubbles: true })) })()`
)
await waitFor(() => config().language === 'pt', 5000)
check('I14 o config.json grava o idioma', config().language === 'pt', config())
const button = await waitFor(relaunchButton, 5000)
check('I15 o painel oferece abrir o Wisp de novo', !!button)

async function relaunchButton() {
  return ev(
    `[...document.querySelectorAll('.settings button')].some(b => b.textContent.trim() === 'Open Wisp again now')`
  )
}

// O Wisp sai e abre de novo, com os mesmos argumentos (a porta de depuração junto).
await ev(
  `[...document.querySelectorAll('.settings button')].find(b => b.textContent.trim() === 'Open Wisp again now').click()`
)
await sleep(1500)
mascot = await connect('/mascot/', 30000)
await waitFor(() => mascot.evaluate(`!!document.querySelector('.stage')`), 15000)
const reopened = await mascot.evaluate('document.documentElement.lang')
check('I16 aberto de novo, em português', reopened === 'pt-BR', reopened)
wisp(home, '--show')
chat = await connect('/chat/')
ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const placeholderPt = await ev(`document.querySelector('.pane .composer textarea')?.placeholder`)
check(
  'I17 o painel em português',
  placeholderPt === 'Continuar a conversa…' || placeholderPt === 'Pergunte ao Wisp…',
  placeholderPt
)
const after = await ev(`document.querySelectorAll('.pane').length`)
check('I18 as abas de antes voltam', after === before, `${before} → ${after}`)
const said = await waitFor(
  () => ev(`document.querySelector('.pane .msg.user')?.innerText.trim() || null`),
  10000
)
check('I19 a conversa de antes também', /hello/.test(said ?? ''), said)

// O Wisp aberto de novo não é filho do startApp: sai pela porta de depuração dele.
try {
  execFileSync('pkill', ['-f', `remote-debugging-port=${PORT}`])
} catch {
  // Já saiu.
}
await sleep(1000)
await stopApp()
home.remove()
process.exit(failed() ? 1 : 0)
