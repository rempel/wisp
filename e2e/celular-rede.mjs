// Conversar pelo celular na rede local (Fase 54), de ponta a ponta. A página é aberta numa janela
// separada (a da pré-visualização da Fase 47, noutra sessão, como o navegador do celular):
// - ligada nas configurações, a seção mostra o QR; sem o código, a página pede o pareamento;
// - com o código, ela pareia e mostra a conversa em foco no computador;
// - uma mensagem do celular aparece no painel, e a resposta, no celular;
// - continuar no PC: a mensagem e a resposta de lá aparecem no celular; uma aba nova no PC passa
//   a ser a do celular (ele acompanha o computador);
// - ler mais para cima: a página não pula, e um botão avisa das mensagens novas;
// - uma ferramenta aparece com o que faz e o resultado; com o Claude trabalhando, o Parar para;
// - esquecer os celulares derruba a chave.
// Uso: node e2e/celular-rede.mjs (veja e2e/run.sh).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome({ phoneChat: true })
const project = join(home.home, 'projeto')
mkdirSync(project, { recursive: true })
const file = join(project, 'app.ts')
writeFileSync(file, 'const a = 1\nconst b = 2\nconst d = 5\n')
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
check(
  'C2 o QR aparece',
  !!(await waitFor(() => ev(`!!document.querySelector('.remote-chat-pair svg')`), 5000))
)
await ev(`document.querySelector('.header [aria-label="Voltar para a conversa"]')?.click()`)

console.log('== Parear')
const base = (link ?? '').replace(/#.*/, '')
/** Abre um endereço na janela da pré-visualização (o "navegador do celular"). */
const open = async (url) => {
  await ev(
    `document.querySelector('.pane.focused .composer textarea, .pane .composer textarea').focus()`
  )
  await chat.send('Input.insertText', { text: `/preview ${url}` })
  await sleep(200)
  await ev(
    `(document.querySelector('.pane.focused .composer') ?? document.querySelector('.pane .composer')).requestSubmit()`
  )
}
await open(base)
let phone = await connect('127.0.0.1:', 10000)
const pe = (expression) => phone.evaluate(expression)
const blocked = await waitFor(
  () => pe(`/Pareie/.test(document.getElementById('banner')?.textContent ?? '')`),
  8000
)
check('C3 sem o código, a página pede o pareamento', !!blocked)
await open(link)
await sleep(800)
phone = await connect('127.0.0.1:', 10000)
const paired = await waitFor(
  () => pe(`document.getElementById('send') && !document.getElementById('send').disabled`),
  8000
)
check('C4 com o código, a página abre a conversa do computador, pronta para escrever', !!paired)

const users = () =>
  pe(`[...document.querySelectorAll('#messages .user')].map((m) => m.textContent)`)
const answers = () => pe(`document.querySelectorAll('#messages .assistant').length`)
const typeAndSend = (text) =>
  pe(`(() => {
    document.getElementById('text').value = ${JSON.stringify(text)}
    document.getElementById('composer').requestSubmit()
  })()`)

console.log('== Do celular para o PC')
await typeAndSend('oi pelo celular')
const inPanel = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane .msg.user')].some((m) => m.innerText === 'oi pelo celular')`
    ),
  10000
)
check('C5 a mensagem do celular aparece no painel', !!inPanel)
check(
  'C6 a resposta aparece no celular',
  !!(await waitFor(async () => (await answers()) >= 1, 15000))
)

console.log('== Continuar no PC')
wisp(home, '--ask', 'agora pelo pc')
const followed = await waitFor(async () => {
  const list = await users()
  return list.includes('agora pelo pc') && (await answers()) >= 2 ? list : null
}, 15000)
check(
  'C7 a mensagem e a resposta do PC aparecem no celular',
  !!followed,
  JSON.stringify(await users())
)
await ev(`window.wisp.tabs.create()`)
await sleep(800)
wisp(home, '--ask', 'na aba nova do pc')
const moved = await waitFor(async () => {
  const list = await users()
  return list.length === 1 && list[0] === 'na aba nova do pc' ? list : null
}, 15000)
check('C8 uma aba nova no PC passa a ser a do celular', !!moved, JSON.stringify(await users()))
const title = await waitFor(
  () => pe(`document.getElementById('title').textContent === 'na aba nova do pc'`),
  8000
)
check('C9 com o título da conversa', !!title)

console.log('== Ler mais para cima sem a página pular')
for (let i = 0; i < 6; i++) {
  wisp(home, '--ask', `mensagem ${i} ${'texto longo para encher a tela '.repeat(12)}`)
  await waitFor(async () => (await users()).length >= i + 2, 10000)
  await sleep(400)
}
await waitFor(() => pe(`document.getElementById('dot').className === 'dot'`), 15000)
await pe(`document.getElementById('messages').scrollTop = 120`)
await sleep(3500)
const stayed = await pe(`document.getElementById('messages').scrollTop`)
check('C10 a página não pula enquanto você lê lá em cima', Math.abs(stayed - 120) <= 2, stayed)
wisp(home, '--ask', `[edit ${file}]`)
const jump = await waitFor(() => pe(`!document.getElementById('jump').hidden`), 10000)
check('C11 o botão avisa das mensagens novas', !!jump)
check(
  'C12 e a rolagem continua onde você deixou',
  Math.abs((await pe(`document.getElementById('messages').scrollTop`)) - 120) <= 2
)
const tool = await waitFor(
  () =>
    pe(
      `(() => { const t = [...document.querySelectorAll('#messages .tool')].at(-1); return t && t.querySelector('.mark.done') ? t.textContent : null })()`
    ),
  10000
)
check(
  'C13 a ferramenta aparece com o arquivo e o resultado',
  /Edit/.test(tool ?? '') && /app\.ts/.test(tool ?? ''),
  tool
)

if (process.env.WISP_E2E_SHOTS) {
  await phone.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 780,
    deviceScaleFactor: 2,
    mobile: true
  })
  await pe(
    `document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight`
  )
  await sleep(500)
  const shot = await phone.send('Page.captureScreenshot', { format: 'png' })
  mkdirSync(process.env.WISP_E2E_SHOTS, { recursive: true })
  writeFileSync(join(process.env.WISP_E2E_SHOTS, 'celular.png'), Buffer.from(shot.data, 'base64'))
  await pe(`document.getElementById('menu').click()`)
  await sleep(500)
  const list = await phone.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(
    join(process.env.WISP_E2E_SHOTS, 'celular-conversas.png'),
    Buffer.from(list.data, 'base64')
  )
  await pe(`document.getElementById('close').click()`)
  await sleep(300)
  await phone.send('Emulation.clearDeviceMetricsOverride')
}

console.log('== Parar pelo celular')
await waitFor(() => pe(`document.getElementById('dot').className === 'dot'`), 15000)
await typeAndSend('[lento] conte devagar')
const stopShown = await waitFor(() => pe(`!document.getElementById('stop').hidden`), 8000)
check('C14 com o Claude trabalhando, o Parar aparece', !!stopShown)
await pe(`document.getElementById('stop').click()`)
const stopped = await waitFor(
  () =>
    pe(
      `document.getElementById('stop').hidden && /parada/i.test(document.getElementById('messages').textContent)`
    ),
  10000
)
check('C15 o Parar para a resposta', !!stopped)
check('C16 a página sem erros', phone.logs.length === 0, phone.logs.join(' | '))

console.log('== Esquecer')
const key = await pe(`localStorage.getItem('wisp-key')`)
await ev(`window.wisp.remoteChat.forget()`)
const status = await fetch(`${base}api/state`, {
  headers: { Authorization: `Bearer ${key}` }
}).then((r) => r.status)
check('C17 esquecidos, a chave do celular não vale mais', status === 401, status)
check(
  'C18 sem erros nas páginas do Wisp',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
