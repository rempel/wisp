// Pequenos ajustes da interface: a pergunta pela ilha abre uma conversa nova (não a Wisp), e a
// seguinte, logo depois, segue nela; "Tarefas agendadas" na sidebar abre as configurações já
// nessa seção; no trilho, um risco só acima do rodapé, que fica no fim; e a aba da Wisp, sem o X,
// respira à direita como à esquerda.
// Uso: node e2e/ajustes.mjs (veja e2e/run.sh).
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome({ windowMode: 'full', compact: true })
const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
const me = (expression) => mascot.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.sidebar')`), 15000)
const nav = (label) =>
  ev(
    `[...document.querySelectorAll('.sidebar-item')].find(b => b.getAttribute('aria-label') === ${JSON.stringify(label)}).click()`
  )
const tabTitles = () =>
  ev(`[...document.querySelectorAll('.tabs .tab')].map(t => t.textContent.trim())`)

console.log('== A pergunta pela ilha')
await nav('Wisp')
await waitFor(() => ev(`!!document.querySelector('.tabs .tab') || null`), 5000)
const before = (await tabTitles()).length
await me(`window.wisp.mascot.island({ type: 'ask', text: 'primeira pela ilha' })`)
const opened = await waitFor(async () => {
  const titles = await tabTitles()
  return titles.length === before + 1 && titles.some((title) => /primeira pela ilha/.test(title))
    ? titles
    : null
}, 8000)
check('A1 a pergunta pela ilha abre uma conversa nova', !!opened, JSON.stringify(opened))
// Você lê a resposta e pergunta de novo: a pergunta segue na mesma conversa.
await waitFor(
  async () => (await tabTitles()).some((title) => /resposta nova/.test(title)) || null,
  8000
)
await me(`window.wisp.mascot.island({ type: 'ask', text: 'segunda pela ilha' })`)
await sleep(2000)
const after = await tabTitles()
check(
  'A2 a pergunta seguinte, logo depois, segue na mesma conversa',
  after.length === before + 1,
  JSON.stringify(after)
)
await nav('Wisp')
await sleep(800)
check(
  'A3 a Wisp não recebe as perguntas da ilha',
  !(await ev(
    `/pela ilha/.test(document.querySelector('.pane.focused .messages')?.innerText ?? '')`
  ))
)

console.log('== A aba da Wisp e o trilho')
const padding = await ev(
  `(() => { const tab = [...document.querySelectorAll('.tabs .tab-main')].find(b => /Wisp/.test(b.textContent)); const style = getComputedStyle(tab); return [style.paddingLeft, style.paddingRight] })()`
)
check(
  'A4 a aba da Wisp (sem o X) respira dos dois lados igual',
  padding[0] === padding[1],
  JSON.stringify(padding)
)
const rail = await ev(
  `(() => { const side = document.querySelector('.sidebar').getBoundingClientRect(); const foot = document.querySelector('.sidebar-foot').getBoundingClientRect(); return { nav: getComputedStyle(document.querySelector('.sidebar-nav')).borderBottomWidth, gap: Math.round(side.bottom - foot.bottom) } })()`
)
check(
  'A5 no trilho, um risco só acima do rodapé, e o rodapé no fim',
  rail.nav === '0px' && rail.gap < 30,
  JSON.stringify(rail)
)

console.log('== Tarefas agendadas')
await nav('Tarefas agendadas')
const section = await waitFor(
  () =>
    ev(
      `(() => { const title = [...document.querySelectorAll('.settings-section h2')].find(h => h.textContent === 'Tarefas agendadas'); if (!title) return null; const box = title.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight && title.parentElement.classList.contains('settings-section-flash') ? true : null })()`
    ),
  4000
)
check('A6 "Tarefas agendadas" abre as configurações já nessa seção, acesa', !!section)

check(
  'A7 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)
await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
