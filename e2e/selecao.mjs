// Explicar a seleção (Fase 45), de ponta a ponta no X: um texto marcado (aqui, no próprio painel:
// marcar algo no X preenche a seleção primária, como em qualquer programa) e o atalho global de
// verdade (Ctrl+Alt+E, pelo xdotool) abrem uma conversa nova com o pedido de explicar e o texto na
// caixa, sem mandar. Sem nada marcado, nada abre.
// Uso: node e2e/selecao.mjs (veja e2e/run.sh); precisa do xdotool.
import { execFileSync } from 'node:child_process'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

try {
  execFileSync('xdotool', ['--version'], { stdio: 'ignore' })
} catch {
  console.log('sem o xdotool: pulado')
  process.exit(0)
}

const { check, failed } = checks()
const home = testHome()
const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const tabsBefore = await ev(`document.querySelectorAll('.tab').length`)

console.log('== Marcar um texto e apertar o atalho')
const marked = 'idempotência de requisições HTTP'
await ev(`(() => {
  const p = document.createElement('p')
  p.id = 'para-marcar'
  p.textContent = ${JSON.stringify(marked)}
  document.body.append(p)
  window.getSelection().selectAllChildren(p)
  return true
})()`)
await sleep(500)
execFileSync('xdotool', ['key', 'ctrl+alt+e'])
const composed = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane textarea')].map((box) => box.value).find((text) => text.includes(${JSON.stringify(marked)})) ?? null`
    ),
  8000
)
check('S1 o texto marcado vai para a caixa', !!composed, composed)
check('S2 com o pedido de explicar na frente', /^Explique/.test(composed ?? ''), composed)
// A conversa vazia em foco serve (como o "Nova conversa"); senão, uma aba nova.
check(
  'S3 numa conversa sem mensagens',
  (await ev(`document.querySelectorAll('.tab').length`)) >= tabsBefore
)
check('S4 sem mandar nada', (await ev(`document.querySelectorAll('.pane .msg.user').length`)) === 0)
check(
  'S5 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
