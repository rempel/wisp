// Aprovar pelo celular (Fase 18), de ponta a ponta, com um ntfy de mentira e o chaveiro de
// mentira num D-Bus só deste teste: o pareamento pela tela de configurações (o QR code, os
// tópicos no chaveiro e nunca no config.json, o teste com o Confirmar), um card indo para o
// "celular" e liberado por ele, um pedido por vez, a expiração que nega, o card respondido no
// computador, desligar e desparear. Tocar num botão é o que o app do ntfy faz: mandar o corpo
// dele para o endereço dele.
// Uso: node e2e/celular.mjs (veja e2e/run.sh).
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, ROOT, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const secretsFile = join(home.home, 'secrets.json')
const configText = () => readFileSync(join(home.home, '.config/wisp/config.json'), 'utf8')
const config = () => JSON.parse(configText())
const esbuild = (entry, outfile) =>
  execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
    join(ROOT, entry),
    '--bundle',
    '--platform=node',
    '--format=esm',
    `--outfile=${outfile}`,
    '--log-level=warning'
  ])

// O ntfy de mentira, aqui mesmo.
const ntfyBundle = join(home.home, 'fake-ntfy.mjs')
esbuild('test/fixtures/fake-ntfy.ts', ntfyBundle)
const { startFakeNtfy } = await import(ntfyBundle)
const ntfy = await startFakeNtfy()

// Um D-Bus só deste teste, com o chaveiro de mentira.
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

const mascot = await startApp(home, {
  DBUS_SESSION_BUS_ADDRESS: address,
  WISP_TEST_PHONE_EXPIRY_MS: '4000'
})
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)

const section = `[...document.querySelectorAll('.settings-section')].find(s => s.querySelector('h2')?.textContent === 'Celular')`
const inSection = (expression) => ev(`(() => { const s = ${section}; return ${expression} })()`)
const click = (label) =>
  inSection(
    `(() => { const b = [...s.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true })()`
  )
const toggle = () => inSection(`s.querySelector('.switch').getAttribute('aria-checked')`)
const phoneMessage = () => inSection(`s.querySelector('.phone-message')?.textContent ?? null`)
const settingsButton = `document.querySelector('.header .icon-button[aria-label="Configurações"]')`
const card = (re) =>
  ev(
    `[...document.querySelectorAll('.permission-pending')].map(c => c.innerText).find(t => ${re}.test(t)) ?? null`
  )
const cardButton = (re, label) =>
  ev(
    `(() => { const c = [...document.querySelectorAll('.permission-pending')].find(c => ${re}.test(c.innerText)); const b = c && [...c.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true })()`
  )
const transcript = () =>
  ev(`[...document.querySelectorAll('.pane .messages')].map(m => m.innerText).join('\\n')`)
const says = (re, ms = 8000) =>
  waitFor(async () => {
    const text = await transcript()
    return re.test(text) ? text : null
  }, ms)

console.log('== O pareamento, nas configurações')
await ev(`${settingsButton}.click()`)
await waitFor(() => inSection(`!!s`), 5000)
const hint = await inSection(`s.querySelector('.settings-toggle .settings-hint').textContent`)
check('C1 desligado por padrão', (await toggle()) === 'false' && /Pareie/.test(hint), hint)
await inSection(
  `(() => { const i = s.querySelector('input[aria-label="Servidor do ntfy"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(ntfy.url)}); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
)
await click('Parear um celular')
const topic = await waitFor(
  () => inSection(`s.querySelector('.phone-topic')?.textContent ?? null`),
  8000
)
const stored = secrets()
const channel = stored.length === 1 ? JSON.parse(stored[0].value) : null
check(
  'C2 o QR code e o tópico na tela',
  (await inSection(`!!s.querySelector('svg.qr-code path')?.getAttribute('d')`)) &&
    channel &&
    topic === `${ntfy.url}/${channel.requests}`,
  topic
)
check(
  'C3 os tópicos no chaveiro, com o nome do Wisp, e nunca no config.json',
  stored[0]?.label === 'Wisp: celular (ntfy)' &&
    channel.replies !== channel.requests &&
    !configText().includes(channel.requests) &&
    !configText().includes(channel.replies) &&
    config().phoneServer === ntfy.url &&
    config().phoneApprovals === false,
  JSON.stringify(stored.map((s) => s.label))
)

await click('Mandar o teste')
await waitFor(() => inSection(`/Esperando o celular/.test(s.innerText)`), 3000)
const test = await waitFor(() => ntfy.on(channel.requests).find((m) => m.actions?.length), 5000)
check(
  'C4 o teste chega ao celular com o botão Confirmar',
  test?.actions?.[0]?.label === 'Confirmar' && (await toggle()) === 'false',
  JSON.stringify(test)
)
await ntfy.tap('Confirmar', test)
const confirmed = await waitFor(phoneMessage, 5000)
check(
  'C5 o celular confirmou: a função liga',
  /O celular respondeu/.test(confirmed ?? '') &&
    (await waitFor(async () => (await toggle()) === 'true', 3000)) &&
    config().phoneApprovals === true,
  confirmed
)
await ev(`window.wisp.settings.set({ phoneAfterSeconds: 1 })`)
await ev(`${settingsButton}.click()`)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 5000)

console.log('== Um card vai para o celular')
const requests = () => ntfy.on(channel.requests).filter((m) => m.actions?.length && m !== test)
wisp(home, '--ask', 'roda [pede npm test]')
await waitFor(() => card(/npm test/), 8000)
await sleep(300)
check('C6 com você aqui, o card espera antes de ir', requests().length === 0)
const sent = await waitFor(() => requests()[0], 5000)
check(
  'C7 depois do tempo, vai: o comando, Permitir e Negar, e nada da conversa',
  sent?.title === 'Wisp: O Claude quer rodar um comando' &&
    sent.message.startsWith('npm test\n') &&
    !sent.message.includes('roda') &&
    JSON.stringify(sent.actions.map((a) => a.label)) === '["Permitir","Negar"]' &&
    sent.actions.every((a) => a.url === `${ntfy.url}/${channel.replies}`),
  JSON.stringify(sent)
)
await ntfy.tap('Permitir', sent)
const allowed = await says(/Rodei npm test\./)
check(
  'C8 tocar em Permitir libera o card do computador',
  !!allowed && /Permitido pelo celular/.test(allowed) && !(await card(/npm test/)),
  allowed
)

console.log('== Um pedido por vez, e o que expira fica negado')
wisp(home, '--ask', 'apaga [pede rm velho.txt]')
await waitFor(() => card(/rm velho\.txt/), 8000)
wisp(home, '--ask', 'apaga [pede rm outro.txt]')
await waitFor(() => card(/rm outro\.txt/), 8000)
await waitFor(() => requests().length === 2, 5000)
await sleep(1500)
check(
  'C9 com dois cards, só o primeiro está no celular',
  requests().length === 2 && requests()[1].message.startsWith('rm velho.txt'),
  JSON.stringify(requests().map((m) => m.message))
)
// O primeiro está na outra aba (o segundo --ask abriu uma nova, com a primeira ocupada).
const tab = (n) => ev(`document.querySelectorAll('.tab .tab-main')[${n}]?.click()`)
await tab(0)
const expired = await says(/Não rodei rm velho\.txt\./, 8000)
check(
  'C10 sem resposta, expira e fica negado',
  !!expired && /ninguém respondeu/.test(expired),
  expired
)
const second = await waitFor(() => requests()[2], 5000)
check(
  'C11 aí vai o segundo, e a ficha do primeiro não vale para ele',
  second?.message.startsWith('rm outro.txt'),
  JSON.stringify(second)
)
await tab(1)
await ntfy.tap('Permitir', requests()[1])
await sleep(500)
check('C12 (a ficha velha não liberou nada)', !!(await card(/rm outro\.txt/)))
await ntfy.tap('Negar', second)
const denied = await says(/Não rodei rm outro\.txt\./)
check('C13 Negar pelo celular nega', !!denied && /Negado pelo celular/.test(denied), denied)

console.log('== Respondido no computador')
wisp(home, '--ask', 'lista [pede ls -la]')
await waitFor(() => card(/ls -la/), 8000)
await waitFor(() => requests().length === 4, 5000)
await cardButton(/ls -la/, 'Permitir')
await says(/Rodei ls -la\./)
const note = await waitFor(
  () => ntfy.on(channel.requests).find((m) => m.message === 'Respondido no computador.'),
  5000
)
check('C14 o celular fica sabendo que foi respondido no computador', !!note)

console.log('== Desligar e desparear')
await ev(`${settingsButton}.click()`)
await waitFor(() => inSection(`!!s`), 5000)
await inSection(`s.querySelector('.switch').click()`)
await waitFor(async () => (await toggle()) === 'false', 3000)
check('C15 desligado pela tela', config().phoneApprovals === false)
await ev(`${settingsButton}.click()`)
wisp(home, '--ask', 'onde [pede pwd]')
await waitFor(() => card(/pwd/), 8000)
await sleep(1800)
check('C16 desligado, nada vai', requests().length === 4)
await cardButton(/pwd/, 'Negar')
await ev(`${settingsButton}.click()`)
await waitFor(() => inSection(`!!s`), 5000)
await click('Desparear')
await waitFor(() => inSection(`!!s.querySelector('input[aria-label="Servidor do ntfy"]')`), 5000)
check('C17 desparear apaga os tópicos do chaveiro', secrets().length === 0)
check(
  'C18 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
await ntfy.close()
keyring.kill()
try {
  process.kill(Number(busPid))
} catch {
  // Já saiu.
}
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
