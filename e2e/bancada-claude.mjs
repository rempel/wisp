// O Claude na bancada (Fase 57), de ponta a ponta: as ferramentas do servidor `desktop`,
// chamadas como o Claude Code as chama, com o app de verdade. preview_open abre a página no
// navegador embutido (e a bancada aparece); preview_read, preview_console e preview_screenshot
// devolvem o que a página tem; preview_click e preview_fill mexem nela; um site de fora é
// recusado; terminal_run roda num terminal do Claude, à vista, na pasta da conversa, e
// terminal_read lê o que veio depois.
// Uso: node e2e/bancada-claude.mjs (veja e2e/run.sh).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
// As páginas da internet desligadas (Fase 58): aqui se confere que elas ficam de fora.
const home = testHome({ previewWeb: false })
const site = join(home.home, 'site')
mkdirSync(site, { recursive: true })
const page = join(site, 'index.html')
writeFileSync(
  page,
  `<!doctype html><meta charset="utf-8"><title>Loja</title><h1>Minha loja</h1>
<input id="nome" /><button id="ok">Comprar</button><p id="saida"></p>
<script>
console.log('página pronta')
console.error('estoque vazio')
document.getElementById('ok').onclick = () => {
  document.getElementById('saida').textContent = 'Pedido de ' + document.getElementById('nome').value
}
</script>`
)

const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const conversation = await ev(`document.querySelector('.pane').dataset.conversation`)
await ev(`window.wisp.chat.send(${JSON.stringify(conversation)}, 'oi', [])`)

// O servidor MCP da conversa: o endereço e o token estão no --mcp-config dela.
const run = join(home.runtime, 'wisp')
const file = await waitFor(
  () => readdirSync(run).find((name) => /^mcp-\d+-.+\.json$/.test(name)),
  20000
)
const desktop = JSON.parse(readFileSync(join(run, file), 'utf8')).mcpServers.desktop
const call = async (name, args = {}) => {
  const response = await fetch(desktop.url, {
    method: 'POST',
    headers: {
      ...desktop.headers,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args }
    })
  })
  const body = await response.text()
  const data = body.split('\n').find((line) => line.startsWith('data:'))
  const result = JSON.parse(data ? data.slice(5) : body).result
  return {
    text: result.content.map((part) => part.text ?? '').join('\n'),
    image: result.content.find((part) => part.type === 'image') ?? null,
    error: !!result.isError
  }
}

console.log('== O navegador da bancada')
const nothing = await call('preview_read')
check('C1 sem página, ler pede para abrir uma', nothing.error && /preview_open/.test(nothing.text))
const outside = await call('preview_open', { alvo: 'https://example.com' })
check('C2 um site de fora é recusado', outside.error && /desta máquina/.test(outside.text))
const opened = await call('preview_open', { alvo: page })
check(
  'C3 preview_open abre o arquivo',
  !opened.error && /index\.html/.test(opened.text),
  opened.text
)
const bench = await waitFor(
  () => ev(`document.querySelector('.workbench .workbench-address')?.value || null`),
  8000
)
check('C4 a bancada aparece, no navegador, com o endereço', /index\.html/.test(bench ?? ''), bench)
const view = await connect('site/index.html', 10000).catch(() => null)
check('C5 a página está dentro do painel', !!view)
const read = await call('preview_read')
check(
  'C6 preview_read devolve o título e o texto',
  /Loja/.test(read.text) && /Minha loja/.test(read.text),
  read.text
)
const logs = await call('preview_console')
check(
  'C7 preview_console traz o console da página',
  /\[info\] página pronta/.test(logs.text) && /\[erro\] estoque vazio/.test(logs.text),
  logs.text
)
const errors = await call('preview_console', { so_erros: true })
check(
  'C8 e só os erros, se pedido',
  /estoque vazio/.test(errors.text) && !/página pronta/.test(errors.text)
)
const shot = await call('preview_screenshot')
check(
  'C9 preview_screenshot devolve a imagem da página',
  !shot.error && (shot.image?.data?.length ?? 0) > 500,
  shot.text
)
const filled = await call('preview_fill', { seletor: '#nome', valor: 'Ana' })
const clicked = await call('preview_click', { texto: 'Comprar' })
check(
  'C10 preencher e clicar funcionam',
  !filled.error && !clicked.error,
  filled.text + clicked.text
)
const after = await call('preview_read')
check('C11 a página reagiu ao clique', /Pedido de Ana/.test(after.text), after.text)
const count = await call('preview_eval', { codigo: 'document.querySelectorAll("button").length' })
check('C12 preview_eval devolve o resultado', count.text.trim() === '1', count.text)
const missing = await call('preview_click', { seletor: '#nada' })
check(
  'C13 um elemento que não existe vira um erro claro',
  missing.error && /#nada/.test(missing.text)
)

console.log('== Abas, largura, erros e a mira (Fases 59 a 62)')
writeFileSync(
  join(site, 'outra.html'),
  '<!doctype html><meta charset="utf-8"><title>Outra</title><h1>Outra página</h1>'
)
const second = await call('preview_open', { alvo: join(site, 'outra.html'), nova_aba: true })
check('C20 preview_open com nova_aba abre outra aba', !second.error, second.text)
const listed =
  (await waitFor(
    () => call('preview_tabs').then((reply) => (/Outra/.test(reply.text) ? reply : null)),
    8000
  )) ?? (await call('preview_tabs'))
check(
  'C21 preview_tabs lista as duas, com a nova à vista',
  /1: Loja/.test(listed.text) && /2 \(à vista\): Outra/.test(listed.text),
  listed.text
)
const strip = await waitFor(
  () => ev(`document.querySelectorAll('.workbench-pages [role=tab]').length === 2`),
  5000
)
check('C22 as abas aparecem na bancada', !!strip)
check(
  'C23 a aba à vista é a que as ferramentas leem',
  /Outra página/.test((await call('preview_read')).text)
)
const back = await call('preview_tabs', { selecionar: 1, fechar: 2 })
check(
  'C24 selecionar e fechar pelo número',
  /^1 \(à vista\): Loja$/.test(back.text.trim()),
  back.text
)
check(
  'C25 uma aba que não existe é um erro claro',
  (await call('preview_tabs', { selecionar: 9 })).error
)
const narrow = await call('preview_resize', { largura: 390 })
const inner = view
  ? await waitFor(
      () => view.evaluate(`window.innerWidth`).then((width) => (width === 390 ? width : null)),
      5000
    )
  : null
check(
  'C26 preview_resize estreita a página (um celular)',
  /390/.test(narrow.text) && inner === 390,
  `${narrow.text} ${inner}`
)
await call('preview_resize', { largura: 0 })
const wide = view
  ? await waitFor(
      () => view.evaluate(`window.innerWidth`).then((width) => (width > 390 ? width : null)),
      5000
    )
  : null
check('C27 e 0 devolve o lugar todo', !!wide, wide)
const chip = await waitFor(
  () => ev(`document.querySelector('.workbench-errors button')?.textContent ?? null`),
  5000
)
check('C28 o erro do console vira um aviso na bancada', /1 erro no console/.test(chip ?? ''), chip)
await ev(`document.querySelector('.workbench-errors button').click()`)
const composed = await waitFor(
  () =>
    ev(`document.querySelector('.pane .composer textarea').value`).then((value) =>
      /estoque vazio/.test(value ?? '') ? value : null
    ),
  5000
)
check('C29 e um clique o põe na caixa da conversa', !!composed)
check(
  'C30 mandado, o aviso some',
  !!(await waitFor(() => ev(`!document.querySelector('.workbench-errors')`), 5000))
)
await ev(
  `document.querySelector('.workbench button[aria-label="Apontar um elemento da página"]').click()`
)
await waitFor(() => ev(`!!document.querySelector('.workbench button[aria-pressed="true"]')`), 5000)
if (view) {
  const spot = await view.evaluate(
    `(() => { const r = document.getElementById('ok').getBoundingClientRect(); return [r.left + 4, r.top + 4] })()`
  )
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await view.send('Input.dispatchMouseEvent', {
      type,
      x: spot[0],
      y: spot[1],
      button: type === 'mouseMoved' ? 'none' : 'left',
      clickCount: 1
    })
  }
}
const picked = await waitFor(
  () =>
    ev(`document.querySelector('.pane .composer textarea').value`).then((value) =>
      /#ok/.test(value ?? '') ? value : null
    ),
  8000
)
check(
  'C31 apontar um elemento põe o seletor e o texto dele na caixa',
  /#ok/.test(picked ?? '') && /Comprar/.test(picked ?? ''),
  picked
)
const cropped = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane .composer .attachments .attachment')].map((a) => a.title).join(' ') || null`
    ),
  8000
)
check('C32 e o recorte dele vai como anexo', /elemento-.*\.png/.test(cropped ?? ''), cropped)
check(
  'C33 a mira não deixa nada na página',
  view ? (await view.evaluate(`document.documentElement.style.cursor`)) === '' : false
)

console.log('== O terminal da bancada')
const empty = await call('terminal_read')
check('C14 antes de rodar, não há o que ler', empty.error && /terminal_run/.test(empty.text))
const ran = await call('terminal_run', { comando: 'echo claude-$((6*7)) && pwd', espera: 15 })
check('C15 terminal_run devolve a saída', /claude-42/.test(ran.text), ran.text)
const tab = await waitFor(
  () => ev(`document.querySelector('.workbench-shell.claude [role=tab]')?.textContent ?? null`),
  8000
)
check(
  'C16 o terminal do Claude aparece na bancada, com o nome dele',
  /^Claude · /.test(tab ?? ''),
  tab
)
const screen = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.workbench .xterm-rows > div')].map(d => d.textContent).join('\\n')`
    ).then((text) => (/claude-42/.test(text ?? '') ? text : null)),
  8000
)
check('C17 e o comando está à vista nele', !!screen)
await call('terminal_run', { comando: 'echo depois-$((1+1))', espera: 15 })
const tail = await call('terminal_read', { linhas: 20 })
check(
  'C18 terminal_read lê o que veio depois',
  /depois-2/.test(tail.text) && /claude-42/.test(tail.text),
  tail.text
)
check(
  'C19 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
