// A pré-visualização (Fase 47), de ponta a ponta: /preview com um HTML abre a página no navegador
// da bancada (Fase 55; o e2e/bancada.mjs confere a bancada em si); mudar o arquivo a recarrega
// sozinha; "Mostrar ao Claude" põe o print como anexo na caixa; um Markdown abre no próprio
// painel; um endereço da internet é recusado; e o card de uma edição de HTML oferece
// "Pré-visualizar".
// Uso: node e2e/preview.mjs (veja e2e/run.sh).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const site = join(home.home, 'site')
mkdirSync(site, { recursive: true })
const page = join(site, 'index.html')
writeFileSync(page, '<!doctype html><title>t</title><h1>Olá, prévia</h1>')
writeFileSync(join(site, 'notas.md'), '# Notas do projeto\n\n- um item\n')

const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const say = async (text) => {
  await ev(`document.querySelector('.pane .composer textarea').focus()`)
  await chat.send('Input.insertText', { text })
  await sleep(200)
  await ev(`document.querySelector('.pane .composer').requestSubmit()`)
}

console.log('== /preview com um HTML')
await say(`/preview ${page}`)
const preview = await connect('index.html', 10000).catch(() => null)
check('V1 a página abre', !!preview)
const heading = preview
  ? await waitFor(() => preview.evaluate(`document.querySelector('h1')?.textContent ?? null`), 5000)
  : null
check('V2 o HTML aparece', heading === 'Olá, prévia', heading)
const bar = await waitFor(
  () => ev(`document.querySelector('.workbench .workbench-address')?.value || null`),
  5000
)
check('V3 o navegador da bancada mostra o endereço', /index\.html/.test(bar ?? ''), bar)
check(
  'V4 a caixa fica vazia (o /preview não vai para o Claude)',
  (await ev(`document.querySelector('.pane .composer textarea').value`)) === '' &&
    (await ev(`document.querySelectorAll('.pane .msg.user').length`)) === 0
)

console.log('== O arquivo muda')
writeFileSync(page, '<!doctype html><title>t</title><h1>Mudou</h1>')
const reloaded = preview
  ? await waitFor(
      () =>
        preview
          .evaluate(`document.querySelector('h1')?.textContent ?? null`)
          .then((text) => (text === 'Mudou' ? text : null)),
      8000
    ).catch(() => null)
  : null
let again = reloaded
if (!again) {
  // A janela recarregou e o DevTools trocou de alvo: conecta de novo.
  const fresh = await connect('index.html', 5000).catch(() => null)
  again = fresh
    ? await waitFor(() => fresh.evaluate(`document.querySelector('h1')?.textContent ?? null`), 5000)
    : null
}
check('V5 a página recarrega sozinha', again === 'Mudou', again)

console.log('== Mostrar ao Claude')
await ev(`document.querySelector('.workbench button[aria-label="Mostrar ao Claude"]').click()`)
const attached = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane .composer .attachments .attachment')].map((a) => a.title).join(' ') || null`
    ),
  8000
)
check('V6 o print vai como anexo', /preview-.*\.png/.test(attached ?? ''), attached)

console.log('== Markdown e um endereço de fora')
await ev(
  `document.querySelectorAll('.pane .composer .attachments .attachment-remove').forEach((b) => b.click())`
)
await say(`/preview ${join(site, 'notas.md')}`)
const md = await waitFor(
  () => ev(`document.querySelector('.markdown-preview h1')?.textContent ?? null`),
  5000
)
check('V7 o Markdown abre no painel', md === 'Notas do projeto', md)
await ev(`document.querySelector('.markdown-preview .file-viewer-close').click()`)
await say('/preview https://example.com')
const refused = await waitFor(
  () => ev(`document.querySelector('.points-note')?.innerText ?? null`),
  5000
)
check('V8 a internet fica de fora', /desta máquina/.test(refused ?? ''), refused)

console.log('== O card de uma edição de HTML')
writeFileSync(page, '<h1>de novo</h1>')
wisp(home, '--ask', `[edit ${page}]`)
await waitFor(() => ev(`!!document.querySelector('.pane .tool .tool-head')`), 10000)
await sleep(800)
await ev(`document.querySelector('.pane .tool .tool-head').click()`)
const offer = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane .tool button')].some((b) => b.textContent.trim() === 'Pré-visualizar')`
    ),
  5000
)
check('V9 o card oferece Pré-visualizar', !!offer)
await ev(`document.querySelector('.workbench .workbench-page-close').click()`)
const closed = await waitFor(
  () => ev(`!!document.querySelector('.workbench .workbench-empty')`),
  5000
)
check('V10 fechar a página volta o navegador ao começo', !!closed)
check(
  'V11 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
