// Atualizar com um clique no Windows (Fase 36), num Windows de verdade, com um GitHub de mentira e
// um instalador de mentira (um .exe compilado aqui, que anota os argumentos com que rodou): a
// versão nova aparece no diagnóstico; com a assinatura errada, nada fica; com a certa, o instalador
// fica na pasta, e "Reiniciar o Wisp" o roda em silêncio (--updated /S --force-run) e fecha o Wisp.
// Fora do Windows, não há o que testar.
// Uso: node e2e/atualizar-win.mjs
import { spawnSync } from 'node:child_process'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import {
  appPid,
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
const home = testHome({ updateCheck: true })
const marker = join(home.home, 'instalou.txt')

// O instalador de mentira: um programa de console que grava os argumentos em WISP_MARCA.
const installerSource = join(home.home, 'instalador.exe')
const built = spawnSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    'Add-Type -OutputType ConsoleApplication -OutputAssembly $env:WISP_SAIDA -TypeDefinition \'public static class Instalador { public static void Main(string[] a) { System.IO.File.WriteAllText(System.Environment.GetEnvironmentVariable("WISP_MARCA"), string.Join(" ", a)); } }\''
  ],
  { encoding: 'utf8', env: { ...process.env, WISP_SAIDA: installerSource }, timeout: 60000 }
)
if (!existsSync(installerSource)) {
  console.log(built.stdout, built.stderr)
  throw new Error('não deu para montar o instalador de mentira')
}
const fresh = readFileSync(installerSource)

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const name = 'Wisp-9.9.9-Setup-x64.exe'
const signature = (bytes) =>
  sign(
    null,
    Buffer.from(`wisp-release\n${name}\n${createHash('sha256').update(bytes).digest('hex')}\n`),
    privateKey
  ).toString('base64')
let served = signature(Buffer.from('outra coisa'))
const downloads = []
const server = createServer((req, res) => {
  if (req.url === '/latest') {
    res.setHeader('content-type', 'application/json')
    const base = 'https://github.com/rempel/wisp/releases/download/v9.9.9'
    return res.end(
      JSON.stringify({
        tag_name: 'v9.9.9',
        html_url: 'https://github.com/rempel/wisp/releases/tag/v9.9.9',
        assets: [
          { name, browser_download_url: `${base}/${name}`, size: fresh.length },
          { name: `${name}.sig`, browser_download_url: `${base}/${name}.sig`, size: 89 }
        ]
      })
    )
  }
  downloads.push(req.url)
  if (req.url === `/rempel/wisp/releases/download/v9.9.9/${name}`) return res.end(fresh)
  if (req.url === `/rempel/wisp/releases/download/v9.9.9/${name}.sig`) return res.end(served)
  res.statusCode = 404
  res.end()
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const folder = join(home.home, 'atualizacao')
mkdirSync(folder)
await startApp(home, {
  WISP_RELEASES_URL: `http://127.0.0.1:${port}/latest`,
  WISP_TEST_UPDATE_FIRST_MS: '300',
  WISP_TEST_INSTALLER_DIR: folder,
  WISP_TEST_RELEASE_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  WISP_TEST_DOWNLOAD_BASE: `http://127.0.0.1:${port}`,
  WISP_MARCA: marker
})
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 20000)
const button = (scope, text) =>
  ev(
    `[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(b => b.textContent.trim() === ${JSON.stringify(text)} && !b.disabled)?.click() ?? false`
  )
const status = (scope) => ev(`document.querySelector('${scope} [role="status"]')?.innerText ?? ''`)
const update = () => ev(`document.querySelector('[data-check="update"]')?.innerText ?? ''`)

console.log('== A versão nova')
await sleep(1200)
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
await waitFor(
  () =>
    ev(
      `(() => { const b = [...document.querySelectorAll('.diag-links button')].find(b => b.textContent === 'Diagnóstico'); if (!b) return false; b.click(); return true })()`
    ),
  10000
)
const offered = await waitFor(async () => {
  const text = await update()
  if (/Atualizar/.test(text)) return text
  await button('.diagnostics .diag-buttons', 'Conferir de novo')
  await sleep(500)
  return null
}, 20000)
check(
  'A1 a versão nova com o botão Atualizar, que baixa o instalador',
  /O Wisp 9\.9\.9 saiu/.test(offered ?? '') &&
    /instalador novo/.test(offered) &&
    downloads.length === 0,
  `${offered}\n${downloads}`
)

console.log('== Atualizar')
await button('[data-check="update"]', 'Atualizar')
const refused = await waitFor(async () => {
  const text = await status('[data-check="update"]')
  return /assinatura não confere/.test(text) ? text : null
}, 20000)
check(
  'A2 a assinatura errada: nada fica na pasta',
  !!refused && readdirSync(folder).length === 0,
  `${refused}\n${readdirSync(folder)}`
)
served = signature(fresh)
await waitFor(() => button('[data-check="update"]', 'Atualizar'), 5000)
const done = await waitFor(async () => {
  const text = await status('[data-check="update"]')
  return /Pronto/.test(text) ? text : null
}, 20000)
check(
  'A3 a assinatura certa: o instalador baixado e conferido, na pasta',
  /instalador do Wisp 9\.9\.9 foi baixado e conferido/.test(done ?? '') &&
    readdirSync(folder).join(',') === name &&
    readFileSync(join(folder, name)).equals(fresh),
  `${done}\n${readdirSync(folder)}`
)
const restart = await waitFor(async () => {
  const text = await update()
  return /Reiniciar o Wisp/.test(text) ? text : null
}, 5000)
check('A4 depois, falta reiniciar para instalar', /instala por cima/.test(restart ?? ''), restart)

console.log('== Reiniciar')
const pid = appPid()
// O clique fecha o app: ele vai depois da resposta, para o DevTools não ficar sem ela.
await ev(
  `setTimeout(() => [...document.querySelectorAll('[data-check="update"] button')].find(b => b.textContent.trim() === 'Reiniciar o Wisp')?.click(), 100)`
)
const ran = await waitFor(() => (existsSync(marker) ? readFileSync(marker, 'utf8') : null), 20000)
check(
  'A5 reiniciar roda o instalador em silêncio, para abrir o Wisp novo depois',
  ran === '--updated /S --force-run',
  ran
)
const closed = await waitFor(() => {
  try {
    process.kill(pid, 0)
    return false
  } catch {
    return true
  }
}, 15000)
check('A6 e o Wisp fecha, para o instalador trocar os arquivos', closed === true)

await stopApp()
server.close()
try {
  home.remove()
} catch (err) {
  console.log(`a pasta de teste ficou: ${err.message}`)
}
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
