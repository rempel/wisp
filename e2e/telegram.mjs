// O Wisp no Telegram (Fase 85), de ponta a ponta, com uma Bot API de mentira (aqui mesmo) e o
// chaveiro de mentira num D-Bus só deste teste: a ficha vai para o chaveiro (nunca para o
// config.json), o código pareia o seu usuário, a mensagem cai na Wisp e a resposta volta, um card
// chega com Permitir uma vez e é liberado de lá, e esquecer tira tudo.
// Uso: node e2e/telegram.mjs (veja e2e/run.sh).
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, ROOT, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const secretsFile = join(home.home, 'secrets.json')
const configText = () => readFileSync(join(home.home, '.config/wisp/config.json'), 'utf8')
const config = () => JSON.parse(configText())
const TOKEN = '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ0123456789ab'
const ME = { id: 42, first_name: 'Gabriel', username: 'gabriel' }

// A Bot API de mentira.
const sent = []
const updates = []
let nextUpdate = 1
let messageId = 500
const api = createServer((req, res) => {
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', async () => {
    const url = req.url ?? ''
    const reply = (result) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, result }))
    }
    if (!url.startsWith(`/bot${TOKEN}/`)) {
      res.writeHead(401).end(JSON.stringify({ ok: false, description: 'Unauthorized' }))
      return
    }
    const method = url.split('/').pop()
    let body = {}
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      // multipart (sendVoice)
    }
    if (method === 'getUpdates') {
      // O long polling: espera um pouco por algo novo.
      for (let i = 0; i < 20 && !updates.length; i++) await sleep(50)
      reply(updates.splice(0))
      return
    }
    sent.push({ method, body })
    if (method === 'getMe') reply({ id: 1, first_name: 'Wisp', username: 'meu_wisp_bot' })
    else if (method === 'sendMessage') reply({ message_id: ++messageId })
    else reply(true)
  })
})
await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${api.address().port}`
const push = (fields) =>
  updates.push({
    update_id: nextUpdate++,
    message: {
      message_id: nextUpdate,
      date: Math.floor(Date.now() / 1000),
      from: ME,
      chat: { id: ME.id },
      ...fields
    }
  })
const messages = () => sent.filter((item) => item.method === 'sendMessage')
const said = (re, ms = 10000) =>
  waitFor(() => messages().find((item) => re.test(String(item.body.text))) ?? null, ms)

// Um D-Bus só deste teste, com o chaveiro de mentira.
const esbuild = (entry, outfile) =>
  execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
    join(ROOT, entry),
    '--bundle',
    '--platform=node',
    '--format=esm',
    `--outfile=${outfile}`,
    '--log-level=warning'
  ])
const [address, busPid] = execFileSync(
  'dbus-daemon',
  ['--session', '--fork', '--print-address=1', '--print-pid=1'],
  { env: { ...process.env, HOME: home.home } }
)
  .toString()
  .trim()
  .split('\n')
const keyringBundle = join(home.home, 'fake-secret-service.mjs')
esbuild('test/fixtures/fake-secret-service.ts', keyringBundle)
const keyring = spawn(process.execPath, [keyringBundle], {
  env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: address, FAKE_SECRETS_FILE: secretsFile },
  stdio: ['ignore', 'pipe', 'inherit']
})
await new Promise((resolve) => keyring.stdout.once('data', resolve))
const secrets = () => JSON.parse(readFileSync(secretsFile, 'utf8'))

const mascot = await startApp(home, { DBUS_SESSION_BUS_ADDRESS: address, WISP_TELEGRAM_API: base })
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)

console.log('== A ficha e o pareamento')
const wrong = await ev(`window.wisp.telegram.token('isso não é uma ficha')`)
check('T1 uma ficha que não parece de bot é recusada', wrong?.ok === false, JSON.stringify(wrong))
const saved = await ev(`window.wisp.telegram.token(${JSON.stringify(TOKEN)})`)
check(
  'T2 a ficha certa é conferida no Telegram',
  saved?.ok === true && /@meu_wisp_bot/.test(saved.message),
  JSON.stringify(saved)
)
check(
  'T3 ela vai para o chaveiro, e nunca para o config.json',
  JSON.stringify(secrets()).includes(TOKEN) && !configText().includes(TOKEN)
)
const code = await ev(`window.wisp.telegram.pair()`)
check('T4 o pareamento dá um código de 6 números', /^\d{6}$/.test(code ?? ''), code)
push({ text: `/start ${code}` })
const paired = await said(/^Pareado com o Wisp/)
check('T5 o código manda de volta o "pareado"', !!paired)
check(
  'T6 o usuário fica guardado, e o Telegram ligado',
  config().telegramUser === 42 && config().telegram === true,
  configText()
)

console.log('== Conversar')
push({ text: 'Oi do Telegram' })
const answer = await waitFor(
  () => messages().find((item) => !/^Pareado/.test(String(item.body.text))) ?? null,
  15000
)
const shown = await ev(
  `[...document.querySelectorAll('.pane .msg.assistant')].map(e => e.innerText.trim()).pop() ?? null`
)
check(
  'T7 a resposta da Wisp volta pelo Telegram',
  !!answer && !!shown && String(answer.body.text).trim() === shown,
  `${answer?.body.text} | ${shown}`
)
const inPanel = await ev(
  `[...document.querySelectorAll('.pane .msg.user')].some(e => /Oi do Telegram/.test(e.innerText))`
)
check('T8 a mensagem aparece na Wisp, no computador', inPanel)

console.log('== Um card')
push({ text: 'roda [pede ls -la]' })
const card = await said(/O Claude quer rodar um comando/)
const buttons = card?.body.reply_markup?.inline_keyboard?.[0] ?? []
check(
  'T9 o card chega com Permitir uma vez e Negar',
  /ls -la/.test(String(card?.body.text)) &&
    JSON.stringify(buttons.map((b) => b.text)) === '["Permitir uma vez","Negar"]',
  JSON.stringify(card?.body)
)
updates.push({
  update_id: nextUpdate++,
  callback_query: {
    id: 'q1',
    from: ME,
    data: buttons[0]?.callback_data,
    message: { message_id: 1, chat: { id: 42 } }
  }
})
const ran = await said(/Rodei ls -la/, 15000)
check('T10 permitido pelo Telegram, o comando roda e a resposta volta', !!ran)
check(
  'T11 a mensagem do card diz como foi',
  sent.some(
    (item) => item.method === 'editMessageText' && item.body.text === 'Permitido (uma vez).'
  )
)

console.log('== Esquecer')
await ev(`window.wisp.telegram.forget()`)
await sleep(300)
check(
  'T12 esquecer tira a ficha do chaveiro e desliga',
  !JSON.stringify(secrets()).includes(TOKEN) &&
    config().telegram === false &&
    config().telegramUser === null
)

check(
  'T13 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
keyring.kill()
try {
  process.kill(Number(busPid))
} catch {
  // Já saiu.
}
api.close()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
