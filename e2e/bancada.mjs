// A bancada (Fase 55), de ponta a ponta: o botão do cabeçalho abre o navegador e o terminal ao
// lado da conversa (e a janela alarga); o terminal é um shell de verdade, na pasta pessoal; um
// localhost na saída dele vira um atalho para o navegador; /preview abre a página dentro da
// janela do painel, no lugar reservado; a paleta por cima esconde a página; os terminais
// continuam com a bancada fechada; e ela volta como estava depois de fechar e abrir o Wisp.
// Uso: node e2e/bancada.mjs (veja e2e/run.sh).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import {
  checks,
  connect,
  dataDir,
  sleep,
  startApp,
  stopApp,
  testHome,
  waitFor,
  wisp
} from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const site = join(home.home, 'site')
mkdirSync(site, { recursive: true })
const page = join(site, 'index.html')
writeFileSync(page, '<!doctype html><title>Prévia</title><h1>Olá, bancada</h1>')

let mascot = await startApp(home)
wisp(home, '--show')
let chat = await connect('/chat/')
let ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const click = (selector) => ev(`document.querySelector(${JSON.stringify(selector)}).click()`)
const button = (scope, text) =>
  ev(
    `[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find((b) => b.textContent.trim() === ${JSON.stringify(text)})?.click()`
  )
const key = async (k, code, modifiers) => {
  for (const type of ['rawKeyDown', 'keyUp']) {
    await chat.send('Input.dispatchKeyEvent', {
      type,
      key: k,
      code,
      modifiers,
      windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0)
    })
  }
}
const screen = () =>
  ev(
    `[...document.querySelectorAll('.workbench .xterm-rows > div')].map(d => d.textContent).join('\\n')`
  )
const shows = (re, ms = 10000) =>
  waitFor(async () => {
    const text = await screen()
    return re.test(text) ? text : null
  }, ms)
const type = async (text) => {
  await ev(`document.querySelector('.workbench .xterm-helper-textarea').focus()`)
  // Tecla por tecla: um segundo insertText seguido não chega ao xterm.
  for (const char of text + '\r')
    await chat.send('Input.dispatchKeyEvent', { type: 'char', text: char })
}
const say = async (text) => {
  await ev(`document.querySelector('.pane .composer textarea').focus()`)
  await chat.send('Input.insertText', { text })
  await sleep(200)
  await ev(`document.querySelector('.pane .composer').requestSubmit()`)
}

console.log('== O botão do cabeçalho')
const before = await ev(`window.innerWidth`)
await click('.workbench-toggle')
const opened = await waitFor(() => ev(`!!document.querySelector('.workbench')`), 5000)
check('B1 a bancada abre ao lado da conversa', !!opened)
const after = await waitFor(
  () => ev(`window.innerWidth`).then((width) => (width > before + 200 ? width : null)),
  5000
)
check('B2 a janela alarga para ela caber', !!after, `${before} -> ${after}`)
check(
  'B3 começa no navegador, vazio, com o campo do endereço',
  await ev(
    `!!document.querySelector('.workbench .workbench-address') && !!document.querySelector('.workbench .workbench-empty')`
  )
)

console.log('== O terminal')
await button('.workbench-head', 'Terminal')
await waitFor(() => ev(`!!document.querySelector('.workbench .xterm-rows')`), 8000)
await sleep(600)
await type('echo oi-$((40+2)) && pwd')
const out = await shows(/oi-42/)
check('B4 o shell roda o que foi digitado', !!out, await screen())
check('B5 na pasta pessoal (a conversa não tem pasta)', (out ?? '').includes(home.home), out)
check(
  'B6 a aba do terminal tem o nome da pasta',
  (await ev(`document.querySelector('.workbench-shell [role=tab]')?.textContent`)) ===
    home.home.split('/').pop()
)
await type('echo http://localhost:4321/')
const chip = await waitFor(
  () => ev(`document.querySelector('.workbench-served button')?.textContent ?? null`),
  5000
)
check('B7 um localhost na saída vira um atalho', /localhost:4321/.test(chip ?? ''), chip)
await button('.workbench-shells', 'Seleção para a conversa')
const hint = await waitFor(
  () => ev(`document.querySelector('.workbench-note')?.textContent ?? null`),
  3000
)
check('B8 sem seleção, o botão diz o que fazer', /Selecione/.test(hint ?? ''), hint)

console.log('== /preview abre no navegador da bancada')
await say(`/preview ${page}`)
const view = await connect('site/index.html', 10000).catch(() => null)
check('B9 a página abre', !!view)
const heading = view
  ? await waitFor(() => view.evaluate(`document.querySelector('h1')?.textContent ?? null`), 5000)
  : null
check('B10 o HTML aparece', heading === 'Olá, bancada', heading)
const address = await waitFor(
  () =>
    ev(`document.querySelector('.workbench-address')?.value || null`).then((value) =>
      value?.includes('index.html') ? value : null
    ),
  5000
)
check('B11 a bancada passa para o navegador, com o endereço', !!address, address)
const place = await waitFor(
  () =>
    ev(
      `(() => { const r = document.querySelector('.workbench-page')?.getBoundingClientRect(); return r ? [Math.round(r.width), Math.round(r.height)] : null })()`
    ),
  5000
)
const inner = view
  ? await waitFor(
      () =>
        view
          .evaluate(`[window.innerWidth, window.innerHeight]`)
          .then((size) => (size && place && Math.abs(size[0] - place[0]) <= 2 ? size : null)),
      5000
    )
  : null
check(
  'B12 a página ocupa o lugar reservado na janela do painel',
  !!inner && Math.abs(inner[1] - place[1]) <= 2,
  `${JSON.stringify(place)} x ${JSON.stringify(inner)}`
)
check(
  'B13 nenhuma janela nova: a página fica dentro do painel',
  view ? (await view.evaluate(`document.visibilityState`)) === 'visible' : false
)

console.log('== A paleta por cima')
await ev(`document.querySelector('.pane .composer textarea').focus()`)
await key('p', 'KeyP', 2)
await waitFor(() => ev(`!!document.querySelector('.palette')`), 5000)
const hidden = view
  ? await waitFor(
      () => view.evaluate(`document.visibilityState`).then((state) => state === 'hidden'),
      5000
    )
  : null
check('B14 com a paleta aberta, a página sai da frente', !!hidden)
await key('Escape', 'Escape', 0)
const back = view
  ? await waitFor(
      () => view.evaluate(`document.visibilityState`).then((state) => state === 'visible'),
      5000
    )
  : null
check('B15 e volta quando ela fecha', !!back)

console.log('== Fechar e abrir (Ctrl+Shift+B)')
await ev(`document.querySelector('.pane .composer textarea').focus()`)
await key('B', 'KeyB', 2 | 8)
const closed = await waitFor(() => ev(`!document.querySelector('.workbench')`), 5000)
check('B16 o atalho fecha a bancada', !!closed)
const narrow = await waitFor(
  () => ev(`window.innerWidth`).then((width) => (width <= before + 2 ? width : null)),
  5000
)
check('B17 a janela volta à largura de antes', !!narrow, `${before} x ${narrow}`)
await key('B', 'KeyB', 2 | 8)
await waitFor(() => ev(`!!document.querySelector('.workbench')`), 5000)
await button('.workbench-head', 'Terminal')
const kept = await shows(/oi-42/, 8000)
check('B18 o terminal continuou lá, com o que tinha mostrado', !!kept, await screen())

console.log('== Fechar e abrir o Wisp')
await sleep(900)
const saved = JSON.parse(readFileSync(join(dataDir(home.home), 'bancada.json'), 'utf8'))
check(
  'B19 a bancada fica guardada (aberta, a aba, o último endereço)',
  saved.open === true && saved.tab === 'terminal' && saved.recent?.[0] === page,
  JSON.stringify(saved)
)
check(
  'B20 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)
mascot = await startApp(home)
wisp(home, '--show')
chat = await connect('/chat/')
ev = (expression) => chat.evaluate(expression)
const again = await waitFor(() => ev(`!!document.querySelector('.workbench .xterm-rows')`), 15000)
check('B21 ela volta aberta, no terminal (um shell novo)', !!again)
await button('.workbench-head', 'Navegador')
const recent = await waitFor(
  () => ev(`document.querySelector('.workbench-recent button')?.textContent ?? null`),
  5000
)
check('B22 o navegador lembra o último endereço', recent === page, recent)
await click('.workbench-recent button')
const reopened = await connect('site/index.html', 10000).catch(() => null)
check('B23 e abre de novo com um clique', !!reopened)
await click('.workbench-page-close')
const emptied = await waitFor(() => ev(`!!document.querySelector('.workbench-empty')`), 5000)
check('B24 fechar a página volta ao começo', !!emptied)
console.log('== Uma página de fora desta máquina (Fase 58)')
// Sem a internet nos testes: um servidor daqui, alcançado pelo endereço da rede (que não é o
// localhost), faz o papel do site de fora.
const lan = Object.values(networkInterfaces())
  .flat()
  .find((item) => item && item.family === 'IPv4' && !item.internal)?.address
if (!lan) console.log('  sem endereço de rede: pulado')
else {
  const web = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end('<!doctype html><title>Fora</title><h1>Site de fora</h1>')
  })
  await new Promise((resolve) => web.listen(0, '0.0.0.0', resolve))
  const outside = `http://${lan}:${web.address().port}/`
  const result = await ev(`window.wisp.preview.open(${JSON.stringify(outside)}, null)`)
  check('B26 com a opção ligada (o padrão), a página de fora abre', result?.ok === true, result)
  const remote = await connect(`${lan}:${web.address().port}`, 10000).catch(() => null)
  const title = remote
    ? await waitFor(
        () => remote.evaluate(`document.querySelector('h1')?.textContent ?? null`),
        5000
      )
    : null
  check('B27 e aparece no navegador da bancada', title === 'Site de fora', title)
  await ev(`window.wisp.settings.set({ previewWeb: false })`)
  const refused = await ev(`window.wisp.preview.open(${JSON.stringify(outside)}, null)`)
  check(
    'B28 desligada nas configurações, ela é recusada com o motivo',
    refused?.ok === false && /desligadas nas configurações/.test(refused.message ?? ''),
    JSON.stringify(refused)
  )
  const local = await ev(`window.wisp.preview.open(${JSON.stringify(page)}, null)`)
  check('B29 e o que é desta máquina continua abrindo', local?.ok === true)
  web.close()
}
check(
  'B25 sem erros depois de reabrir',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
