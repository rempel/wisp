// O contexto da conversa, de ponta a ponta: a pílula mostra quanto da janela de contexto a
// conversa ocupa (pelo uso que o Claude Code de mentira informa); o cartão mostra os tokens e
// compacta (o /compact, com as instruções do que manter); o botão espera a resposta terminar; a
// compactação automática avisa; e o aviso volta com a conversa depois de fechar e abrir o Wisp.
// Uso: node e2e/context.mjs (veja e2e/run.sh).
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
const home = testHome()

await startApp(home)
wisp(home, '--show')
let chat = await connect('/chat/')
let ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)

const pill = () => ev(`document.querySelector('.pane .context-pill')?.innerText.trim() ?? null`)
const idle = () =>
  waitFor(() => ev(`!document.querySelector('.status')?.classList.contains('busy')`), 15000)
const notices = () =>
  ev(`[...document.querySelectorAll('.pane .notice')].map(n => n.innerText.trim())`)
const openCard = async () => {
  if (!(await ev(`!!document.querySelector('.pane .context-card')`))) {
    await ev(`document.querySelector('.pane .context-pill').click()`)
  }
  return waitFor(() => ev(`document.querySelector('.pane .context-card')?.innerText ?? null`), 5000)
}
const typeInstructions = (value) =>
  ev(
    `(() => { const input = document.querySelector('.pane .context-instructions'); input.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })) })()`
  )

console.log('== A pílula do contexto')
check('C1 antes da primeira resposta, nenhuma pílula', (await pill()) === null)
wisp(home, '--ask', 'oi')
await sleep(400)
await idle()
// 3000 iniciais + 30000 da mensagem: 33000 de 200000.
const first = await waitFor(pill, 5000)
check('C2 depois da resposta, o percentual', first === '17%', first)
check(
  'C3 a cor de pouco uso',
  await ev(`document.querySelector('.pane .context-pill').classList.contains('context-low')`)
)
let card = await openCard()
check(
  'C4 o cartão mostra os tokens e a janela',
  /33 mil tokens de 200 mil \(17%\)/.test(card) && /Compactar agora/.test(card),
  card
)

console.log('== Compactar espera a resposta terminar')
await ev(`document.querySelector('.pane .context-pill').click()`)
wisp(home, '--ask', 'conta devagar [lento]')
await waitFor(() => ev(`!!document.querySelector('.status')?.classList.contains('busy')`), 5000)
await openCard()
const busyState = await ev(
  `JSON.stringify({ disabled: document.querySelector('.pane .context-compact')?.disabled, busy: document.querySelector('.status')?.className })`
)
check('C5 respondendo, o botão fica desligado', JSON.parse(busyState).disabled === true, busyState)
await ev(`document.querySelector('.pane .context-pill').click()`)
await idle()
const second = await pill()
check('C6 a pílula sobe a cada mensagem', second === '32%', second)

console.log('== Compactar agora, com instruções')
await openCard()
await typeInstructions('mantenha   as decisões  sobre o banco')
await ev(`document.querySelector('.pane .context-compact').click()`)
const compacting = await waitFor(
  () =>
    ev(
      `(() => { const t = document.querySelector('.pane .context-pill')?.innerText ?? ''; return /compactando/.test(t) ? t : null })()`
    ),
  5000,
  20
)
check('C7 compactando, a pílula avisa', /compactando…/.test(compacting ?? ''), compacting)
const notice = await waitFor(
  async () => (await notices()).find((n) => /Conversa compactada/.test(n)) ?? null,
  8000
)
check(
  'C8 o aviso com os tokens antes e depois',
  /Conversa compactada \(63 mil → 4 mil tokens\)/.test(notice ?? '') &&
    /o painel continua mostrando tudo/.test(notice ?? ''),
  notice
)
await idle()
const after = await waitFor(async () => ((await pill()) === '2%' ? '2%' : null), 5000)
check('C9 depois, a pílula cai', after === '2%', await pill())
const compacts = fakeLog(home, 'compacts').map((line) => JSON.parse(line))
check(
  'C10 o /compact vai com as instruções numa linha só',
  compacts.length === 1 &&
    compacts[0].text === '/compact mantenha as decisões sobre o banco' &&
    compacts[0].trigger === 'manual',
  JSON.stringify(compacts)
)
const bubbles = await ev(
  `[...document.querySelectorAll('.pane .message.user')].map(m => m.innerText.trim())`
)
check(
  'C11 nada de /compact nem do resumo como mensagem no painel',
  !bubbles.some((text) => /compact|Resumo/i.test(text)),
  JSON.stringify(bubbles)
)

console.log('== Perto do limite, o Claude Code compacta sozinho')
wisp(home, '--ask', 'mais uma [grande]')
await sleep(400)
await idle()
const mid = await pill()
check(
  'C12 a partir de 60%, a pílula fica âmbar',
  mid === '77%' &&
    (await ev(`document.querySelector('.pane .context-pill').classList.contains('context-mid')`)),
  mid
)
wisp(home, '--ask', 'e mais esta')
await sleep(400)
await idle()
const full = await pill()
check(
  'C13 perto do limite, vermelha',
  full === '92%' &&
    (await ev(`document.querySelector('.pane .context-pill').classList.contains('context-high')`)),
  full
)
wisp(home, '--ask', 'e agora [cheio]')
await sleep(400)
await idle()
const auto = await waitFor(
  async () => (await notices()).find((n) => /compactada sozinha/.test(n)) ?? null,
  8000
)
check('C14 a compactação automática avisa', !!auto, JSON.stringify(await notices()))

console.log('== Fechar e abrir o Wisp')
await stopApp()
const mascot = await startApp(home)
wisp(home, '--show')
chat = await connect('/chat/')
ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const kept = await waitFor(async () => {
  const list = await notices()
  return list.some((n) => /Conversa compactada/.test(n)) ? list : null
}, 8000)
check(
  'C15 os avisos de compactação voltam com a conversa',
  kept?.some((n) => /compactada sozinha/.test(n)),
  JSON.stringify(kept)
)
check(
  'C16 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
