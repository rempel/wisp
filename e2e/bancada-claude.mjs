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
