// Conversar pelo celular na rede local (Fase 54), de ponta a ponta: ligada nas configurações, a
// seção mostra o QR; a página aberta num navegador separado (a janela da pré-visualização da Fase
// 47, noutra sessão, como o navegador do celular) pelo endereço do QR se pareia, lista a conversa, manda uma mensagem que aparece no painel e
// mostra a resposta do Claude; o mesmo endereço sem o código não lê nada; esquecer os celulares
// derruba a chave.
// Uso: node e2e/celular-rede.mjs (veja e2e/run.sh).
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome({ phoneChat: true })
const mascot = await startApp(home, { WISP_TEST_LAN_ADDRESS: '127.0.0.1' })
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)

console.log('== O QR nas configurações')
await ev(`document.querySelector('.header [aria-label="Configurações"]').click()`)
const link = await waitFor(
  () => ev(`window.wisp.remoteChat.state().then((s) => s?.link ?? null)`),
  10000
)
check(
  'C1 ligada, a página tem um endereço com o código',
  /^http:\/\/127\.0\.0\.1:\d+\/#p=/.test(link ?? ''),
  link
)
const qr = await waitFor(() => ev(`!!document.querySelector('.remote-chat-pair svg')`), 5000)
check('C2 o QR aparece', !!qr)

console.log('== O celular')
await ev(`document.querySelector('.header [aria-label="Voltar para a conversa"]')?.click()`)
const base = (link ?? '').replace(/#.*/, '')
/** Abre um endereço na janela da pré-visualização (o "navegador do celular"). */
const open = async (url) => {
  await ev(`document.querySelector('.pane .composer textarea').focus()`)
  await chat.send('Input.insertText', { text: `/preview ${url}` })
  await sleep(200)
  await ev(`document.querySelector('.pane .composer').requestSubmit()`)
}
// Sem o código, não pareia e não lê nada.
await open(base)
let phone = await connect('127.0.0.1:', 10000)
const blocked = await waitFor(
  () => phone.evaluate(`/Pareie/.test(document.getElementById('status')?.textContent ?? '')`),
  8000
)
check('C3 sem o código, a página pede o pareamento', !!blocked)
await open(link)
await sleep(800)
phone = await connect('127.0.0.1:', 10000)
const listed = await waitFor(
  () => phone.evaluate(`document.querySelectorAll('#conversation option').length > 0`),
  8000
)
check('C4 com o código, a conversa aberta aparece', !!listed)
await phone.evaluate(`(() => {
  document.getElementById('text').value = 'oi pelo celular'
  document.getElementById('composer').requestSubmit()
})()`)
const inPanel = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane .msg.user')].some((m) => m.innerText === 'oi pelo celular')`
    ),
  10000
)
check('C5 a mensagem aparece no painel', !!inPanel)
const answered = await waitFor(
  () => phone.evaluate(`document.querySelectorAll('#messages .assistant').length > 0`),
  15000
)
check('C6 a resposta do Claude aparece no celular', !!answered)
check('C7 a página sem erros', phone.logs.length === 0, phone.logs.join(' | '))

console.log('== Esquecer')
const key = await phone.evaluate(`localStorage.getItem('wisp-key')`)
await ev(`window.wisp.remoteChat.forget()`)
const status = await fetch(`${base}api/conversations`, {
  headers: { Authorization: `Bearer ${key}` }
}).then((r) => r.status)
check('C8 esquecidos, a chave do celular não vale mais', status === 401, status)
check(
  'C9 sem erros nas páginas do Wisp',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
