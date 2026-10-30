// As notificações do Windows com botões (Fase 35), num Windows de verdade: com o painel
// escondido, o card vira uma notificação com Permitir e Negar; o clique num botão volta como o
// endereço wisp:// dele, que o Windows entrega ao Wisp aberto (a segunda instância). O roteiro lê
// o endereço do registro de teste (WISP_TEST_TOAST_LOG, só rodando do código) e o abre.
// Fora do Windows, não há o que testar.
// Uso: node e2e/toast.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  checks,
  connect,
  IS_WINDOWS,
  sleep,
  startApp,
  stopApp,
  testHome,
  waitFor,
  wisp
} from './lib.mjs'

if (!IS_WINDOWS) {
  console.log('só no Windows')
  process.exit(0)
}

const { check, failed } = checks()
const home = testHome()
const toastLog = join(home.home, 'notificacoes.xml')
const toasts = () => {
  try {
    return readFileSync(toastLog, 'utf8').trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}
const approvals = () => {
  try {
    return readFileSync(join(home.home, '.fake-claude/approvals.log'), 'utf8')
  } catch {
    return ''
  }
}

const mascot = await startApp(home, { WISP_TEST_TOAST_LOG: toastLog })
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 20000)
const conversation = await ev(`document.querySelector('.pane').dataset.conversation`)

console.log('== O card vira notificação')
await ev(`window.wisp.chat.hide()`)
await sleep(300)
await ev(`window.wisp.chat.send(${JSON.stringify(conversation)}, 'testa [pede npm test]', [])`)
const toast = await waitFor(() => toasts().at(-1) ?? null, 15000)
const allow = /arguments="(wisp:\/\/notificacao\/\d+\/allow-[a-f0-9]{16})"/.exec(toast ?? '')?.[1]
check(
  'W1 escondido, o card vira notificação do Windows com Permitir e Negar',
  /O Claude quer rodar um comando/.test(toast ?? '') &&
    /npm test/.test(toast ?? '') &&
    !!allow &&
    /content="Negar"/.test(toast ?? ''),
  toast
)

console.log('== O botão Permitir')
// Um endereço inventado não responde nada.
wisp(home, 'wisp://notificacao/1/allow-0000000000000000')
await sleep(800)
check('W2 um endereço inventado não libera nada', !/npm test.*"allow"/.test(approvals()))
wisp(home, allow)
const allowed = await waitFor(() => /npm test.*"allow"/.test(approvals()), 10000)
check('W3 o Permitir da notificação libera o Claude', !!allowed, approvals())
wisp(home, '--show')
const transcript = await waitFor(async () => {
  const text = await ev(`document.querySelector('.pane .messages')?.innerText ?? ''`)
  return /Permitido pela notificação\./.test(text) ? text : null
}, 10000)
check('W4 o card diz que foi pela notificação', !!transcript)
check(
  'W5 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
