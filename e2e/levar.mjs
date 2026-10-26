// Levar o Wisp junto (Fase 31), de ponta a ponta. Exportar de um HOME (as configurações, um
// prompt e uma conversa fixada) e importar em outro, vendo antes o que muda (o comando do editor
// marcado), com o backup do config.json; um arquivo mexido depois da prévia não entra. E o
// Atualizar com um clique, com um GitHub de mentira e um script fazendo as vezes do AppImage: a
// assinatura errada não troca nada; a certa troca o arquivo, e "Reiniciar o Wisp" abre o novo.
// Uso: node e2e/levar.mjs (veja e2e/run.sh).
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const ID = '0b6d6f8e-1c2a-4f5b-9d3e-7a8b9c0d1e2f'
const logs = []

const configOf = (home) =>
  JSON.parse(readFileSync(join(home.home, '.config/wisp/config.json'), 'utf8'))

let chat
const ev = (expression) => chat.evaluate(expression)
const open = async (home, extra = {}) => {
  const mascot = await startApp(home, extra)
  wisp(home, '--show')
  chat = await connect('/chat/')
  await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
  return mascot
}
const openSettings = async () => {
  await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
  await waitFor(() => ev(`!!document.querySelector('.portable')`), 5000)
}
const button = (scope, text) =>
  ev(
    `[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(b => b.textContent.trim() === ${JSON.stringify(text)} && !b.disabled)?.click() ?? false`
  )
const status = (scope) => ev(`document.querySelector('${scope} [role="status"]')?.innerText ?? ''`)

console.log('== Exportar')
const from = testHome({
  editorCommand: 'code --wait',
  prompts: [{ name: 'resumo', text: 'Resuma' }]
})
const conversas = join(from.home, '.local/share/wisp/conversas')
mkdirSync(conversas, { recursive: true })
writeFileSync(
  join(conversas, `${ID}.jsonl`),
  [
    { type: 'conversa', v: 1, id: ID, createdAt: Date.now() - 3600_000, title: 'Tubarões' },
    { type: 'user', text: 'Fale dos tubarões-martelo' },
    { type: 'assistant', blocks: [{ type: 'text', text: 'Eles enxergam quase 360°.' }] }
  ]
    .map((line) => JSON.stringify(line))
    .join('\n') + '\n'
)
writeFileSync(join(from.home, '.local/share/wisp/fixadas.json'), JSON.stringify([ID]))
const exported = join(from.home, 'wisp-levar.json')
let mascot = await open(from, { WISP_TEST_SAVE_FILE: exported })
await openSettings()
await ev(`document.querySelector('.portable-history input').click()`)
await button('.portable', 'Exportar…')
const saved = await waitFor(async () => {
  const text = await status('.portable')
  return text ? text : null
}, 5000)
check(
  'L1 exportar diz onde ficou e avisa que leva as conversas',
  /Exportado para ~\/wisp-levar\.json\./.test(saved ?? '') && /guarde com cuidado/.test(saved),
  saved
)
const file = existsSync(exported) ? JSON.parse(readFileSync(exported, 'utf8')) : {}
check(
  'L2 o arquivo: só seu, com as configurações, a conversa e a fixada',
  existsSync(exported) &&
    (statSync(exported).mode & 0o777) === 0o600 &&
    file.tipo === 'wisp-levar' &&
    file.configuracoes?.editorCommand === 'code --wait' &&
    file.configuracoes?.prompts?.some((p) => p.name === 'resumo') &&
    file.conversas?.[0]?.id === ID &&
    file.fixadas?.[0] === ID &&
    !('claudePath' in (file.configuracoes ?? {})),
  JSON.stringify(file).slice(0, 300)
)
logs.push(...mascot.logs, ...chat.logs)
await stopApp()

console.log('== Importar noutro HOME')
const to = testHome({ prompts: [{ name: 'diff', text: 'Revise' }] })
const copy = join(to.home, 'de-la.json')
writeFileSync(copy, readFileSync(exported))
mascot = await open(to, { WISP_TEST_PICK_FILE: copy })
await openSettings()
await button('.portable', 'Importar…')
const preview = await waitFor(
  () => ev(`document.querySelector('.portable-preview')?.innerText ?? null`),
  5000
)
const sensitive = await ev(
  `[...document.querySelectorAll('.portable-changes li.sensitive')].map(l => l.innerText)`
)
check(
  'L3 a prévia: o arquivo, o comando do editor marcado e as contas',
  /Importar ~\/de-la\.json/.test(preview ?? '') &&
    sensitive.some((line) => /^editorCommand: .+ → code --wait$/.test(line)) &&
    /Prompts novos: 1; trocados: 0/.test(preview) &&
    /Conversas novas: 1; as 0 que já estão aqui/.test(preview) &&
    /importe só um arquivo seu/.test(preview),
  `${preview}\n${JSON.stringify(sensitive)}`
)
check(
  'L4 nada mudou só de ver a prévia',
  configOf(to).editorCommand === undefined &&
    !existsSync(join(to.home, '.local/share/wisp/conversas', `${ID}.jsonl`))
)

// Mexido depois da prévia: não entra.
writeFileSync(copy, readFileSync(exported, 'utf8').replace('code --wait', 'rm -rf ~'))
await button('.portable-preview', 'Importar')
const changed = await waitFor(async () => {
  const text = await status('.portable')
  return text ? text : null
}, 5000)
check(
  'L5 o arquivo mexido depois da prévia não entra',
  /mudou desde a prévia/.test(changed ?? '') && configOf(to).editorCommand === undefined,
  changed
)

writeFileSync(copy, readFileSync(exported))
await button('.portable', 'Importar…')
await waitFor(() => ev(`!!document.querySelector('.portable-preview')`), 5000)
await button('.portable-preview', 'Importar')
const imported = await waitFor(async () => {
  const text = await status('.portable')
  return /Importado/.test(text) ? text : null
}, 5000)
const after = configOf(to)
const backups = readdirSync(join(to.home, '.config/wisp')).filter((name) =>
  name.startsWith('config.json.backup-wisp-')
)
check(
  'L6 importado: a configuração, os prompts juntos e o backup do config.json',
  /Conversas novas: 1\./.test(imported ?? '') &&
    /config\.json anterior ficou em ~\/\.config\/wisp\/config\.json\.backup-wisp-/.test(imported) &&
    after.editorCommand === 'code --wait' &&
    after.prompts.map((p) => p.name).join(',') === 'diff,resumo' &&
    backups.length === 1 &&
    JSON.parse(readFileSync(join(to.home, '.config/wisp', backups[0]), 'utf8')).editorCommand ===
      undefined,
  `${imported}\n${JSON.stringify(after.prompts)}\n${backups}`
)
const history = join(to.home, '.local/share/wisp/conversas', `${ID}.jsonl`)
check(
  'L7 a conversa veio, só sua, e fixada',
  existsSync(history) &&
    (statSync(history).mode & 0o777) === 0o600 &&
    JSON.parse(readFileSync(join(to.home, '.local/share/wisp/fixadas.json'), 'utf8')).includes(ID)
)
await ev(
  `document.querySelector('.header .icon-button[aria-label="Conversas anteriores"]')?.click()`
)
const listed = await waitFor(
  () =>
    ev(
      `(() => { const t = [...document.querySelectorAll('.history-item .history-title')].map(e => e.textContent); return t.length ? t : null })()`
    ),
  5000
)
check(
  'L8 e aparece no histórico',
  listed?.some((text) => text.includes('Tubarões')),
  JSON.stringify(listed)
)
logs.push(...mascot.logs, ...chat.logs)
await stopApp()
from.remove()

console.log('== Atualizar com um clique')
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const arch = { x64: 'x86_64', arm64: 'arm64' }[process.arch]
const name = `Wisp-9.9.9-${arch}.AppImage`
const fresh = Buffer.from('#!/bin/sh\necho "nova $*" > "$HOME/marca"\n')
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
const apps = join(to.home, 'Apps')
mkdirSync(apps)
const appImage = join(apps, 'Wisp.AppImage')
writeFileSync(appImage, '#!/bin/sh\necho velha > "$HOME/marca"\n', { mode: 0o755 })
writeFileSync(
  join(to.home, '.config/wisp/config.json'),
  JSON.stringify({ ...configOf(to), updateCheck: true })
)
mascot = await open(to, {
  WISP_RELEASES_URL: `http://127.0.0.1:${port}/latest`,
  WISP_TEST_UPDATE_FIRST_MS: '300',
  WISP_TEST_APPIMAGE: appImage,
  WISP_TEST_RELEASE_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  WISP_TEST_DOWNLOAD_BASE: `http://127.0.0.1:${port}`
})
await sleep(1200)
await openSettings()
await waitFor(
  () =>
    ev(
      `(() => { const b = [...document.querySelectorAll('.diag-links button')].find(b => b.textContent === 'Diagnóstico'); if (!b) return false; b.click(); return true })()`
    ),
  5000
)
const update = () => ev(`document.querySelector('[data-check="update"]')?.innerText ?? ''`)
const offered = await waitFor(async () => {
  const text = await update()
  if (/Atualizar/.test(text)) return text
  await button('.diagnostics .diag-buttons', 'Conferir de novo')
  await sleep(500)
  return null
}, 15000)
check(
  'U1 a versão nova com o botão Atualizar, sem baixar nada antes do clique',
  /O Wisp 9\.9\.9 saiu/.test(offered ?? '') &&
    /confere a assinatura/.test(offered) &&
    downloads.length === 0,
  `${offered}\n${downloads}`
)

await button('[data-check="update"]', 'Atualizar')
const refused = await waitFor(async () => {
  const text = await status('[data-check="update"]')
  return /assinatura não confere/.test(text) ? text : null
}, 15000)
check(
  'U2 a assinatura errada: nada é trocado, e o baixado vai embora',
  !!refused &&
    readFileSync(appImage, 'utf8').includes('velha') &&
    readdirSync(apps).join(',') === 'Wisp.AppImage' &&
    downloads.length === 2,
  `${refused}\n${readdirSync(apps)}\n${downloads}`
)

served = signature(fresh)
await waitFor(() => button('[data-check="update"]', 'Atualizar'), 5000)
const done = await waitFor(async () => {
  const text = await status('[data-check="update"]')
  return /Pronto/.test(text) ? text : null
}, 15000)
check(
  'U3 a assinatura certa: o arquivo trocado, executável',
  /Wisp 9\.9\.9 já está no lugar/.test(done ?? '') &&
    readFileSync(appImage).equals(fresh) &&
    (statSync(appImage).mode & 0o777) === 0o755 &&
    readdirSync(apps).join(',') === 'Wisp.AppImage',
  done
)
const restart = await waitFor(async () => {
  const text = await update()
  return /Reiniciar o Wisp/.test(text) ? text : null
}, 5000)
check(
  'U4 depois, falta reiniciar',
  /9\.9\.9 já está no lugar do antigo/.test(restart ?? ''),
  restart
)
logs.push(...mascot.logs, ...chat.logs)
// O clique fecha o app: ele vai depois da resposta, para o DevTools não ficar sem ela.
await ev(
  `setTimeout(() => [...document.querySelectorAll('[data-check="update"] button')].find(b => b.textContent.trim() === 'Reiniciar o Wisp')?.click(), 100)`
)
const marker = join(to.home, 'marca')
const relaunched = await waitFor(
  () => (existsSync(marker) ? readFileSync(marker, 'utf8') : null),
  15000
)
check('U5 reiniciar abre o AppImage novo', /^nova/.test(relaunched ?? ''), relaunched)
check('U6 sem erros nas páginas', logs.length === 0, logs.join('\n'))

await stopApp()
server.close()
to.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
