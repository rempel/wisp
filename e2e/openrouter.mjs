// A OpenRouter (experimental), de ponta a ponta: a chave conferida e guardada no chaveiro (um
// Secret Service de mentira, num D-Bus só deste teste), nunca no config.json nem no registro; a
// aba trocada para a OpenRouter; um modelo escolhido na lista (de um servidor de mentira, com os
// preços); a conversa com o Claude Code de mentira, que recebe o endereço, a chave e a pasta
// própria no ambiente; a pílula de custo no lugar do uso do plano; e a volta para a assinatura.
// Uso: node e2e/openrouter.mjs (veja e2e/run.sh).
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { checks, connect, ROOT, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const KEY = 'sk-or-v1-e2e0123456789abcdef0123456789'
const home = testHome()
const secretsFile = join(home.home, 'secrets.json')
const config = () => JSON.parse(readFileSync(join(home.home, '.config/wisp/config.json'), 'utf8'))
const spawns = () =>
  readFileSync(join(home.home, '.fake-claude/spawns.log'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))

// A OpenRouter de mentira: a lista de modelos e a conferência da chave.
const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  if (req.url === '/api/v1/models') {
    return res.end(
      JSON.stringify({
        data: [
          {
            id: 'vendor/model-b',
            name: 'Vendor: Model B',
            pricing: { prompt: '0.000003', completion: '0.000015', input_cache_read: '0.0000003' }
          },
          {
            id: 'outra/rapido:free',
            name: 'Outra: Rápido',
            pricing: { prompt: '0', completion: '0' }
          }
        ]
      })
    )
  }
  if (req.url === '/api/v1/key') {
    if (req.headers.authorization !== `Bearer ${KEY}`) {
      res.statusCode = 401
      return res.end('{"error":{"code":401}}')
    }
    return res.end(JSON.stringify({ data: { label: 'chave do e2e' } }))
  }
  res.statusCode = 404
  res.end('{}')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/api`

// Um D-Bus só deste teste, com o chaveiro de mentira.
const [address, busPid] = execFileSync(
  'dbus-daemon',
  ['--session', '--fork', '--print-address=1', '--print-pid=1'],
  { env: { ...process.env, HOME: home.home } }
)
  .toString()
  .trim()
  .split('\n')
const bundle = join(home.home, 'fake-secret-service.mjs')
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
  join(ROOT, 'test/fixtures/fake-secret-service.ts'),
  '--bundle',
  '--platform=node',
  '--format=esm',
  `--outfile=${bundle}`,
  '--log-level=warning'
])
const keyring = spawn(process.execPath, [bundle], {
  env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: address, FAKE_SECRETS_FILE: secretsFile },
  stdio: ['ignore', 'pipe', 'inherit']
})
await new Promise((resolve) => keyring.stdout.once('data', resolve))
const secrets = () => JSON.parse(readFileSync(secretsFile, 'utf8'))

const mascot = await startApp(home, {
  DBUS_SESSION_BUS_ADDRESS: address,
  WISP_OPENROUTER_URL: url,
  // Uma chave da Anthropic herdada nunca vai para a OpenRouter.
  ANTHROPIC_API_KEY: 'sk-ant-herdada-nao-vai'
})
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const type = (selector, value) =>
  ev(
    `(() => { const input = document.querySelector(${JSON.stringify(selector)}); input.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })) })()`
  )
const keyMessage = () =>
  ev(
    `document.querySelector('.openrouter-key')?.parentElement.querySelector('[role="status"]')?.textContent ?? null`
  )
const saveKey = async (value) => {
  await type('.openrouter-key input', value)
  await ev(
    `[...document.querySelectorAll('.openrouter-key button')].find(b => b.textContent === 'Guardar').click()`
  )
  return waitFor(keyMessage, 8000)
}

console.log('== A chave, nas configurações')
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
await waitFor(() => ev(`!!document.querySelector('.openrouter-key')`), 5000)
const hint = await waitFor(
  () =>
    ev(
      `(() => { const t = document.querySelector('.openrouter-key').parentElement.querySelector('.settings-hint').textContent; return /chaveiro/.test(t) ? t : null })()`
    ),
  5000
)
check('O1 sem chave ainda', /Crie uma em openrouter\.ai\/keys/.test(hint), hint)
let message = await saveKey('nao-e-chave')
check('O2 o que não parece chave nem vai', /não parece uma chave/.test(message), message)
message = await saveKey('sk-or-v1-errada0000000000000000000')
check(
  'O3 a chave recusada pela OpenRouter não é guardada',
  /recusou essa chave/.test(message) && secrets().length === 0,
  message
)
message = await saveKey(KEY)
check(
  'O4 conferida e guardada',
  /Chave conferida e guardada \(chave do e2e\)/.test(message),
  message
)
const items = secrets()
check(
  'O5 no chaveiro, com o nome do Wisp',
  items.length === 1 &&
    items[0].value === KEY &&
    items[0].attributes.application === 'wisp' &&
    items[0].label === 'Wisp: chave da OpenRouter',
  JSON.stringify(items.map((i) => ({ ...i, value: i.value.slice(0, 8) })))
)
check(
  'O6 e nunca no config.json',
  !readFileSync(join(home.home, '.config/wisp/config.json'), 'utf8').includes('sk-or-')
)
const placeholder = await ev(`document.querySelector('.openrouter-key input').placeholder`)
check('O7 a tela sabe que há uma chave', /guardada no chaveiro/.test(placeholder), placeholder)

console.log('== A aba vai para a OpenRouter')
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
await waitFor(() => ev(`!!document.querySelector('.pane .provider-pill')`), 5000)
check(
  'O8 a aba começa pela assinatura',
  (await ev(`document.querySelector('.pane .provider-pill').textContent`)) === 'Assinatura'
)
await ev(`document.querySelector('.pane .provider-pill').click()`)
await ev(
  `[...document.querySelectorAll('.pane .provider .model-option')].find(b => b.textContent.startsWith('OpenRouter')).click()`
)
await waitFor(
  () => ev(`document.querySelector('.pane .provider-pill')?.textContent.startsWith('OpenRouter')`),
  3000
)
const modelPill = `.pane .composer-meta .model:not(.provider) .model-pill`
check(
  'O9 sem modelo, a pílula pede um',
  (await ev(`document.querySelector('${modelPill}').textContent`)) === 'Escolher modelo'
)
wisp(home, '--ask', 'oi')
const noModel = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane .notice')].map(n => n.innerText).find(t => /Escolha um modelo/.test(t)) ?? null`
    ),
  8000
)
check('O10 mandar sem modelo explica o que falta', !!noModel, noModel)

console.log('== Um modelo da lista')
await ev(`document.querySelector('${modelPill}').click()`)
const listed = await waitFor(
  () =>
    ev(
      `(() => { const o = [...document.querySelectorAll('.openrouter-list .model-option')]; return o.length ? o.map(e => e.innerText.replace(/\\n/g, ' | ')) : null })()`
    ),
  8000
)
check(
  'O11 a lista da OpenRouter, com os preços',
  listed?.length === 2 &&
    listed.some((t) => /Vendor: Model B \| vendor\/model-b · US\$ 3 \/ 15/.test(t)) &&
    listed.some((t) => /grátis/.test(t)),
  JSON.stringify(listed)
)
await type('.openrouter-search', 'model b')
await sleep(200)
check(
  'O12 a busca filtra',
  (await ev(`document.querySelectorAll('.openrouter-list .model-option').length`)) === 1
)
await ev(`document.querySelector('.openrouter-list .model-option').click()`)
await waitFor(() => ev(`document.querySelector('${modelPill}').textContent === 'model-b'`), 3000)
check(
  'O13 o modelo escolhido vale para as próximas',
  config().openrouterModel === 'vendor/model-b',
  config().openrouterModel
)

console.log('== A conversa pela OpenRouter')
wisp(home, '--ask', 'oi de novo')
const answered = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane .msg.assistant')].map(e => e.innerText).find(t => /Oi!/.test(t)) ?? null`
    ),
  10000
)
check('O14 a resposta chega', !!answered, answered)
const spawn1 = spawns().at(-1)
check(
  'O15 o Claude Code recebe o endereço, a chave, a pasta própria e o modelo',
  spawn1.baseUrl === url &&
    spawn1.tokenTail === KEY.slice(-4) &&
    spawn1.apiKeyValue === '' &&
    spawn1.configDir === join(home.home, '.local/share/wisp/openrouter-claude') &&
    spawn1.haiku === 'vendor/model-b' &&
    spawn1.args.includes('--model=vendor/model-b') &&
    !spawn1.args.join(' ').includes('sk-or-'),
  JSON.stringify({ ...spawn1, args: spawn1.args.filter((a) => a.startsWith('--model')) })
)
const cost = await waitFor(
  () =>
    ev(
      `(() => { const t = document.querySelector('.header .cost-pill')?.textContent; return t && t !== 'US$ 0' ? t : null })()`
    ),
  8000
)
check('O16 a pílula de custo no cabeçalho', /^US\$ 0,004\d$/.test(cost ?? ''), cost)
await ev(`document.querySelector('.header .cost-pill').click()`)
const card = await ev(`document.querySelector('.usage-card')?.innerText ?? ''`)
check(
  'O17 o cartão do custo: tokens e respostas',
  /Tokens de entrada\s*3 mil/.test(card) && /Respostas\s*1/.test(card),
  card
)
await ev(`document.querySelector('.header .cost-pill').click()`)

console.log('== De volta à assinatura')
await ev(`document.querySelector('.pane .provider-pill').click()`)
await ev(
  `[...document.querySelectorAll('.pane .provider .model-option')].find(b => b.textContent.startsWith('Assinatura')).click()`
)
await waitFor(
  () => ev(`document.querySelector('.pane .provider-pill')?.textContent === 'Assinatura'`),
  3000
)
check(
  'O18 a conversa recomeça e a pílula de custo sai',
  (await ev(`document.querySelectorAll('.pane .msg.assistant').length`)) === 0 &&
    !(await ev(`!!document.querySelector('.header .cost-pill')`))
)
await ev(
  `document.querySelector('.header .icon-button[aria-label="Conversas anteriores"]').click()`
)
const saved = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.history-item, .history li, [class*="history"] button')].map(e => e.innerText).find(t => /oi de novo|oi/.test(t)) ?? null`
    ),
  5000
)
check('O19 a conversa da OpenRouter ficou no histórico', !!saved, saved)

await stopApp()
const log = readFileSync(join(home.home, '.local/state/wisp/wisp.log'), 'utf8')
check(
  'O20 a chave nunca vai para o registro',
  !log.includes(KEY) && !log.includes('sk-ant-herdada')
)
check(
  'O21 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

keyring.kill()
process.kill(Number(busPid))
server.close()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
