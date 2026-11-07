// Conversar pelo celular na rede local (Fase 54), de ponta a ponta. A página é aberta numa janela
// separada (a da pré-visualização da Fase 47, noutra sessão, como o navegador do celular):
// - ligada nas configurações, a seção mostra o QR; sem o código, a página pede o pareamento;
// - com o código, ela pareia e mostra a conversa em foco no computador;
// - uma mensagem do celular aparece no painel, e a resposta, no celular;
// - continuar no PC: a mensagem e a resposta de lá aparecem no celular; uma aba nova no PC passa
//   a ser a do celular (ele acompanha o computador);
// - ler mais para cima: a página não pula, e um botão avisa das mensagens novas;
// - uma ferramenta aparece com o que faz e o resultado; com o Claude trabalhando, o Parar para;
// - o que o painel faz, pelo celular: Permitir um comando (o card some também do PC), aprovar um
//   plano, trocar o modo e o modelo (o PC acompanha), editar a última mensagem, mandar uma foto,
//   ver o histórico e abrir uma conversa nova;
// - esquecer os celulares derruba a chave.
// Uso: node e2e/celular-rede.mjs (veja e2e/run.sh).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
  () =>
    pe(
      `document.getElementById('text') && !document.getElementById('text').disabled && !document.getElementById('pills').hidden`
    ),
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

const idle = () => waitFor(() => pe(`document.getElementById('dot').className === 'dot'`), 15000)
const lastCard = () =>
  pe(
    `(() => { const c = [...document.querySelectorAll('#messages .card')].at(-1); return c ? c.textContent : null })()`
  )
const clickIn = (selector, label) =>
  pe(
    `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((b) => (b.querySelector('b') ?? b).textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true })()`
  )
const approvals = () => {
  try {
    return readFileSync(join(home.home, '.fake-claude/approvals.log'), 'utf8')
  } catch {
    return ''
  }
}

console.log('== Os cards pelo celular')
await idle()
await typeAndSend('[pede touch /tmp/wisp-celular]')
const card = await waitFor(
  async () => (((await lastCard()) ?? '').includes('touch /tmp/wisp-celular') ? lastCard() : null),
  15000
)
check('C14 o card do comando aparece no celular, com o comando', !!card, card)
check(
  'C15 e no PC',
  !!(await waitFor(() => ev(`!!document.querySelector('.pane.focused .permission-pending')`), 5000))
)
await clickIn('#messages .card.waiting .actions button', 'Permitir')
const allowed = await waitFor(async () => /Permitido/.test((await lastCard()) ?? ''), 10000)
check(
  'C16 Permitir pelo celular libera o comando, e o card sai do PC',
  !!allowed &&
    !!(await waitFor(
      () => ev(`!document.querySelector('.pane.focused .permission-pending')`),
      5000
    )) &&
    /allow/.test(approvals()),
  approvals()
)

console.log('== O modo e o modelo')
await idle()
await pe(`document.getElementById('more').click()`)
await waitFor(() => pe(`!document.getElementById('sheet').hidden`), 5000)
await clickIn('#sheet .choice', 'Planejar')
const planMode = await waitFor(
  () =>
    ev(
      `document.querySelector('.pane.focused .mode-pill')?.className.includes('mode-plan') || null`
    ),
  8000
)
check('C17 o modo trocado no celular muda no PC', !!planMode)
check(
  'C18 e a pílula do celular mostra o modo',
  !!(await waitFor(
    () => pe(`document.getElementById('pill-mode').textContent === 'Planejar'`),
    5000
  ))
)
await clickIn('#sheet .choice', 'Opus')
const opus = await waitFor(
  () =>
    ev(
      `/Opus/.test(document.querySelector('.pane.focused .composer-meta')?.innerText ?? '') || null`
    ),
  8000
)
check('C19 o modelo trocado no celular muda no PC', !!opus)
await clickIn('#sheet .choice', 'Pedir')
await waitFor(
  () =>
    ev(
      `document.querySelector('.pane.focused .mode-pill')?.className.includes('mode-default') || null`
    ),
  8000
)
await pe(`document.getElementById('sheet-close').click()`)

console.log('== O plano pelo celular')
await typeAndSend('[plano]')
const plan = await waitFor(
  () => pe(`document.querySelector('#messages .card.waiting .plan')?.textContent ?? null`),
  15000
)
check('C20 o plano aparece no celular, com os botões do PC', !!plan, plan)
await clickIn('#messages .card.waiting .actions button', 'Aprovar e aceitar edições')
const edits = await waitFor(
  () =>
    ev(
      `document.querySelector('.pane.focused .mode-pill')?.className.includes('mode-acceptEdits') || null`
    ),
  10000
)
check('C21 aprovar com as edições passa o PC para Aceitar edições', !!edits)
await idle()
await pe(`document.getElementById('more').click()`)
await waitFor(() => pe(`!document.getElementById('sheet').hidden`), 5000)
await clickIn('#sheet .choice', 'Pedir')
await pe(`document.getElementById('sheet-close').click()`)

console.log('== Editar a última mensagem')
await idle()
await typeAndSend('mensagem com erro')
await waitFor(async () => (await users()).at(-1) === 'mensagem com erro', 10000)
await idle()
const editShown = await waitFor(
  () =>
    pe(
      `!!document.querySelector('#messages .user-wrap:last-of-type .link, #messages .user-wrap .link')`
    ),
  8000
)
check('C22 a última mensagem tem o Editar', !!editShown)
await pe(`[...document.querySelectorAll('#messages .user-wrap .link')].at(-1).click()`)
await waitFor(() => pe(`!document.getElementById('editing').hidden`), 5000)
await typeAndSend('mensagem corrigida')
const edited = await waitFor(async () => {
  const list = await users()
  return list.at(-1) === 'mensagem corrigida' && !list.includes('mensagem com erro') ? list : null
}, 15000)
const pcEdited = await waitFor(
  () =>
    ev(
      `(() => { const l = [...document.querySelectorAll('.pane.focused .msg.user')].map((m) => m.innerText); return l.at(-1) === 'mensagem corrigida' && !l.includes('mensagem com erro') ? l : null })()`
    ),
  10000
)
check(
  'C23 editar troca a mensagem no celular e no PC',
  !!edited && !!pcEdited,
  JSON.stringify(await users())
)

console.log('== Uma foto pelo celular')
await idle()
const photo = join(project, 'foto.png')
writeFileSync(
  photo,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8DwnwEJMDEgARQOACwFAgHtgZbtAAAAAElFTkSuQmCC',
    'base64'
  )
)
const { root } = await phone.send('DOM.getDocument')
const { nodeId } = await phone.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#file' })
await phone.send('DOM.setFileInputFiles', { nodeId, files: [photo] })
const ready = await waitFor(() => pe(`!!document.querySelector('#files .file.ready img')`), 10000)
check('C24 a foto sobe, com a miniatura na caixa', !!ready)
await typeAndSend('veja a foto')
const thumb = await waitFor(
  () =>
    pe(
      `!!document.querySelectorAll('#messages .user-wrap')[document.querySelectorAll('#messages .user-wrap').length - 1]?.querySelector('img.thumb')`
    ),
  10000
)
const pcThumb = await waitFor(
  () => ev(`!![...document.querySelectorAll('.pane.focused .attachment.thumb')].length || null`),
  10000
)
check('C25 a mensagem vai com a foto, no celular e no PC', !!thumb && !!pcThumb)

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
  await pe(`document.getElementById('more').click()`)
  await sleep(500)
  const options = await phone.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(
    join(process.env.WISP_E2E_SHOTS, 'celular-opcoes.png'),
    Buffer.from(options.data, 'base64')
  )
  await pe(`document.getElementById('sheet-close').click()`)
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

console.log('== O histórico e uma conversa nova')
await idle()
await pe(`document.getElementById('menu').click()`)
await pe(`document.getElementById('history').click()`)
const saved = await waitFor(
  () => pe(`document.querySelectorAll('#sheet .history .choice').length || null`),
  8000
)
check('C26 o histórico lista as conversas guardadas', saved >= 2, saved)
await pe(`document.getElementById('sheet-close').click()`)
const tabsBefore = await ev(`document.querySelectorAll('.tab').length`)
await pe(`document.getElementById('menu').click()`)
await pe(`document.getElementById('new').click()`)
await waitFor(() => pe(`!document.getElementById('sheet').hidden`), 5000)
await clickIn('#sheet .choice', 'Sem pasta')
const opened = await waitFor(async () => {
  const count = await ev(`document.querySelectorAll('.tab').length`)
  const empty = await pe(`!document.getElementById('empty').hidden`)
  return count > tabsBefore && empty ? count : null
}, 8000)
check(
  'C27 uma conversa nova pelo celular abre uma aba no PC',
  !!opened,
  `${tabsBefore} → ${opened}`
)

console.log('== Parar pelo celular')
await idle()
await typeAndSend('[lento] conte devagar')
const stopShown = await waitFor(() => pe(`!document.getElementById('stop').hidden`), 8000)
check('C28 com o Claude trabalhando, o Parar aparece', !!stopShown)
await pe(`document.getElementById('stop').click()`)
const stopped = await waitFor(
  () =>
    pe(
      `document.getElementById('stop').hidden && /parada/i.test(document.getElementById('messages').textContent)`
    ),
  10000
)
check('C29 o Parar para a resposta', !!stopped)
check('C30 a página sem erros', phone.logs.length === 0, phone.logs.join(' | '))

console.log('== Esquecer')
const key = await pe(`localStorage.getItem('wisp-key')`)
await ev(`window.wisp.remoteChat.forget()`)
const status = await fetch(`${base}api/state`, {
  headers: { Authorization: `Bearer ${key}` }
}).then((r) => r.status)
check('C31 esquecidos, a chave do celular não vale mais', status === 401, status)
check(
  'C32 sem erros nas páginas do Wisp',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
