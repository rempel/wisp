// Revisar no fim do turno (Fase 42), de ponta a ponta: o Claude Code (o de mentira roda os hooks
// PreToolUse do --settings, como o de verdade) edita um arquivo; o hook do Wisp guarda a cópia de
// antes; no fim da resposta, o card mostra o arquivo com +N −M e o diff; Desfazer volta o arquivo
// ao que era. Uma mensagem nova deixa o card velho sem o desfazer.
// Uso: node e2e/revisar.mjs (veja e2e/run.sh).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const project = join(home.home, 'projeto')
mkdirSync(project, { recursive: true })
const file = join(project, 'app.ts')
const before = 'const a = 1\nconst b = 2\nconst d = 5\n'
writeFileSync(file, before)

const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const idle = () =>
  waitFor(() => ev(`!document.querySelector('.status')?.classList.contains('busy')`), 15000)

console.log('== Uma edição e o card do fim da resposta')
wisp(home, '--ask', `[edit ${file}]`)
const card = await waitFor(
  () => ev(`document.querySelector('.pane .review-card')?.innerText ?? null`),
  15000
)
check('R1 o card aparece no fim da resposta', !!card, card)
check(
  'R2 com o arquivo e o +2 −1',
  /app\.ts/.test(card ?? '') && /\+2/.test(card ?? '') && /−1/.test(card ?? ''),
  card
)
check('R3 o arquivo mudou mesmo', readFileSync(file, 'utf8').includes('const c = 4'))
let hooks = ''
try {
  hooks = readFileSync(join(home.home, '.fake-claude', 'hooks.log'), 'utf8')
} catch {
  // Nenhum hook rodou.
}
check(
  'R4 o hook da cópia rodou antes da edição, sem erro',
  /"tool":"Edit","status":0/.test(hooks),
  hooks
)
await ev(`document.querySelector('.pane .review-toggle').click()`)
const diff = await waitFor(
  () => ev(`!!document.querySelector('.pane .review-card .code-diff')`),
  5000
)
check('R5 o clique no arquivo abre o diff', !!diff)

console.log('== Desfazer')
await ev(
  `[...document.querySelectorAll('.pane .review-card button')].find((b) => b.textContent.trim() === 'Desfazer').click()`
)
const reverted = await waitFor(() => readFileSync(file, 'utf8') === before, 5000)
check('R6 Desfazer volta o arquivo ao que era', !!reverted, readFileSync(file, 'utf8'))
const status = await waitFor(
  () => ev(`document.querySelector('.pane .review-card li.reverted')?.innerText ?? null`),
  3000
)
check('R7 o card marca o arquivo como desfeito', /desfeito/.test(status ?? ''), status)

console.log('== Uma resposta nova')
await idle()
wisp(home, '--ask', `[edit ${file}]`)
await waitFor(() => ev(`document.querySelectorAll('.pane .review-card').length === 2`), 15000)
await idle()
wisp(home, '--ask', 'oi')
await sleep(1500)
await idle()
const old = await ev(`(() => {
  const cards = document.querySelectorAll('.pane .review-card')
  const button = [...cards[1].querySelectorAll('button')].find((b) => b.textContent.trim() === 'Desfazer')
  return { disabled: button?.disabled ?? null, hint: cards[1].innerText }
})()`)
check(
  'R8 a mensagem seguinte deixa o card sem o desfazer',
  old?.disabled === true,
  JSON.stringify(old)
)
check('R9 e ele diz por quê', /só para a última resposta/.test(old?.hint ?? ''), old?.hint)
check(
  'R10 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
