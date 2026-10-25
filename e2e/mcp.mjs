// Os servidores MCP pelo Wisp (Fase 30), de ponta a ponta, com o Claude Code de mentira (que
// grava o ~/.claude.json pelo `claude mcp` e diz as ferramentas de cada servidor no init): a
// lista (os seus e os do projeto, sem segredo); pôr um pelas configurações, com a prévia e o
// backup; ele entra na conversa nova e a ferramenta dele pede permissão pelo card; liberar uma
// ferramenta; ligar um que já existia; e tirar.
// Uso: node e2e/mcp.mjs (veja e2e/run.sh).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const projects = 'projetos'
const home = testHome({ projectRoots: [`~/${projects}`] })
const H = home.home
const claudeJson = join(H, '.claude.json')
writeFileSync(
  claudeJson,
  JSON.stringify(
    {
      numStartups: 3,
      mcpServers: {
        notas: {
          type: 'stdio',
          command: '/opt/notas/bin/notas-mcp',
          args: ['--pasta', 'Meus Documentos'],
          env: { NOTAS_TOKEN: 'segredo-das-notas', FAKE_TOOLS: 'ler' }
        }
      }
    },
    null,
    2
  )
)
const loja = join(H, projects, 'loja')
mkdirSync(join(loja, '.git'), { recursive: true })
writeFileSync(
  join(loja, '.mcp.json'),
  JSON.stringify({ mcpServers: { banco: { command: 'pg-mcp', args: ['--ro'] } } })
)
const config = () => JSON.parse(readFileSync(join(H, '.config/wisp/config.json'), 'utf8'))
const servers = () => JSON.parse(readFileSync(claudeJson, 'utf8')).mcpServers
const spawns = () =>
  readFileSync(join(H, '.fake-claude/spawns.log'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
/** Os servidores no --mcp-config do último Claude Code que subiu. */
const lastMcp = () => {
  const args = spawns().at(-1).args
  const file = args[args.indexOf('--mcp-config') + 1]
  return Object.keys(JSON.parse(readFileSync(file, 'utf8')).mcpServers)
}

let mascot = await startApp(home)
wisp(home, '--show')
let chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)

const key = async (k, code, vk, modifiers = 0) => {
  for (const type of ['keyDown', 'keyUp'])
    await chat.send('Input.dispatchKeyEvent', {
      type,
      key: k,
      code,
      windowsVirtualKeyCode: vk,
      modifiers
    })
  await sleep(150)
}
const send = async (text) => {
  await ev(`document.querySelector('.pane .composer textarea').focus()`)
  await chat.send('Input.insertText', { text })
  await sleep(100)
  await key('Enter', 'Enter', 13)
  await sleep(300)
}
const openSettings = async () => {
  await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
  await waitFor(() => ev(`!!document.querySelector('.mcp')`), 5000)
}
const backToChat = async () => {
  await key('Escape', 'Escape', 27)
  await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 5000)
}
/** Cada servidor da lista das configurações, em texto. */
const listed = () =>
  ev(`[...document.querySelectorAll('.mcp .skill')].map(e => e.innerText.replace(/\\n+/g, ' | '))`)
const fill = (selector, value) =>
  ev(
    `(() => { const e = document.querySelector(${JSON.stringify(selector)}); const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })) })()`
  )
const button = (scope, text) =>
  ev(
    `[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(b => b.textContent.trim() === ${JSON.stringify(text)})?.click() ?? false`
  )
const answers = () =>
  ev(`[...document.querySelectorAll('.pane .msg.assistant')].map(e => e.innerText.trim())`)

console.log('== A lista')
await openSettings()
let rows = await waitFor(async () => {
  const value = await listed()
  return value.length >= 2 ? value : null
}, 5000)
check(
  'M1 o seu servidor, com o comando e só os nomes das variáveis, desligado no Wisp',
  /^notas \| comando/.test(rows?.[0] ?? '') &&
    rows[0].includes('/opt/notas/bin/notas-mcp --pasta "Meus Documentos"') &&
    rows[0].includes('NOTAS_TOKEN, FAKE_TOOLS (os valores ficam escondidos)') &&
    !rows.join(' ').includes('segredo-das-notas') &&
    (await ev(
      `document.querySelector('.mcp-server [role="switch"]').getAttribute('aria-checked')`
    )) === 'false',
  JSON.stringify(rows)
)
check(
  'M2 o do projeto aparece à parte, só para ver',
  rows?.some((row) => /^banco \| loja \| pg-mcp --ro$/.test(row)),
  JSON.stringify(rows)
)

console.log('== Pôr um servidor')
await button('.mcp', 'Adicionar um servidor…')
await waitFor(() => ev(`!!document.querySelector('.mcp-form')`), 3000)
const inputs = '.mcp-form .settings-row'
await fill(`${inputs}:nth-of-type(1) input`, 'agenda')
await fill(`${inputs}:nth-of-type(2) input`, '/usr/local/bin/agenda-mcp')
await fill(`${inputs}:nth-of-type(3) textarea`, '--somente-leitura')
await fill(
  `${inputs}:nth-of-type(4) textarea`,
  'FAKE_TOOLS=consultar,marcar\nAGENDA_CHAVE=chave-secreta'
)
await button('.mcp-form', 'Ver a mudança')
const preview = await waitFor(
  () => ev(`document.querySelector('.mcp-preview')?.innerText ?? null`),
  5000
)
check(
  'M3 a prévia mostra a mudança no ~/.claude.json, sem o valor secreto, e o backup',
  /Pôr “agenda” no seu Claude Code/.test(preview) &&
    /"command": "\/usr\/local\/bin\/agenda-mcp"/.test(preview) &&
    /"AGENDA_CHAVE": "•••"/.test(preview) &&
    !preview.includes('chave-secreta') &&
    /copiado para ~\/\.claude\.json\.backup-wisp-/.test(preview),
  preview
)
check('M4 nada gravado antes do clique', !servers().agenda)
await button('.mcp-preview', 'Gravar')
const done = await waitFor(
  () =>
    ev(
      `(() => { const t = document.querySelector('.mcp [role="status"]')?.textContent ?? ''; return /Pronto|Não gravei/.test(t) ? t : null })()`
    ),
  10000
)
const added = servers().agenda
check(
  'M5 gravado pelo claude mcp, com o backup e ligado no Wisp',
  /^Pronto: “agenda” está no seu Claude Code/.test(done ?? '') &&
    added?.command === '/usr/local/bin/agenda-mcp' &&
    added.env.AGENDA_CHAVE === 'chave-secreta' &&
    JSON.parse(readFileSync(claudeJson, 'utf8')).numStartups === 3 &&
    readdirSync(H).some((name) => name.startsWith('.claude.json.backup-wisp-')) &&
    JSON.stringify(config().enabledMcpServers) === '["agenda"]',
  done
)

console.log('== Na conversa nova')
await backToChat()
await key('k', 'KeyK', 75, 2)
await send('[mcp agenda consultar]')
const card = await waitFor(
  () =>
    ev(
      `document.querySelector('.pane .permission-pending .permission-title')?.textContent ?? null`
    ),
  10000
)
check(
  'C1 o servidor entra na conversa (e o que não foi ligado, não)',
  JSON.stringify(lastMcp().sort()) === JSON.stringify(['agenda', 'desktop']),
  JSON.stringify(lastMcp())
)
check(
  'C2 a ferramenta dele pede permissão pelo card, dizendo de qual servidor',
  card === 'Usar a ferramenta consultar do servidor agenda',
  card
)
// O card ignora cliques nos primeiros instantes (contra o clique acidental).
await sleep(1200)
await button('.pane .permission-pending', 'Permitir')
const used = await waitFor(async () => {
  const value = await answers()
  return value.some((text) => text === 'Usei mcp__agenda__consultar.') ? value : null
}, 8000)
check('C3 permitida, ela roda', !!used, JSON.stringify(await answers()))

console.log('== Liberar uma ferramenta')
await openSettings()
const tools = await waitFor(
  () =>
    ev(
      `(() => { const f = [...document.querySelectorAll('.mcp-tools label')].map(l => l.textContent.trim()); return f.length ? f : null })()`
    ),
  5000
)
const status = await ev(`document.querySelector('.mcp-status')?.textContent`)
check(
  'L1 as ferramentas que ele ofereceu, e conectado',
  JSON.stringify(tools) === JSON.stringify(['consultar', 'marcar']) && status === 'conectado',
  JSON.stringify({ tools, status })
)
await ev(
  `[...document.querySelectorAll('.mcp-tools label')].find(l => l.textContent.trim() === 'marcar').querySelector('input').click()`
)
await waitFor(() => config().extraAllowedTools.includes('mcp__agenda__marcar'), 5000)
check(
  'L2 marcada, ela vai para as liberadas',
  JSON.stringify(config().extraAllowedTools) === '["mcp__agenda__marcar"]'
)
// As ferramentas liberadas valem quando o Wisp abre de novo (uma conversa não se libera sozinha
// mexendo no config.json).
const earlier = [...mascot.logs, ...chat.logs]
await stopApp()
mascot = await startApp(home)
wisp(home, '--show')
chat = await connect('/chat/')
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
await key('k', 'KeyK', 75, 2)
await send('[mcp agenda marcar]')
const free = await waitFor(async () => {
  const value = await answers()
  return value.some((text) => /sem perguntar/.test(text)) ? value : null
}, 8000)
check(
  'L3 a liberada roda sem card; as outras continuam pedindo',
  !!free && (await ev(`!document.querySelector('.pane .permission-pending')`)),
  JSON.stringify(await answers())
)

console.log('== Ligar um que já existia')
await openSettings()
await waitFor(() => ev(`!!document.querySelector('.mcp-server [role="switch"]')`), 5000)
await ev(`document.querySelector('.mcp-server [role="switch"]').click()`)
await waitFor(() => config().enabledMcpServers.includes('notas'), 5000)
await backToChat()
await key('k', 'KeyK', 75, 2)
await send('oi')
await waitFor(async () => (await answers()).length > 0, 8000)
check(
  'O1 ligado, ele entra na próxima conversa',
  JSON.stringify(lastMcp().sort()) === JSON.stringify(['agenda', 'desktop', 'notas']),
  JSON.stringify(lastMcp())
)

console.log('== Tirar')
await openSettings()
await waitFor(() => ev(`!!document.querySelector('.mcp .link[aria-label="Tirar agenda"]')`), 5000)
await ev(`document.querySelector('.mcp .link[aria-label="Tirar agenda"]').click()`)
const removal = await waitFor(
  () => ev(`document.querySelector('.mcp-preview')?.innerText ?? null`),
  5000
)
check(
  'T1 a prévia de tirar mostra o que sai',
  /Tirar “agenda” do seu Claude Code/.test(removal) && /-\s+"agenda": \{/.test(removal),
  removal
)
await button('.mcp-preview', 'Tirar')
await waitFor(() => !servers().agenda, 10000)
await sleep(300)
check(
  'T2 sai do ~/.claude.json, do Wisp e das liberadas',
  !servers().agenda &&
    !!servers().notas &&
    JSON.stringify(config().enabledMcpServers) === '["notas"]' &&
    config().extraAllowedTools.length === 0 &&
    readdirSync(H).filter((name) => name.startsWith('.claude.json.backup-wisp-')).length === 2
)
const mcpLog = readFileSync(join(H, '.fake-claude/mcp.log'), 'utf8').trim().split('\n')
check(
  'T3 pelo claude mcp, no escopo do usuário',
  mcpLog.length === 2 &&
    JSON.parse(mcpLog[0]).slice(0, 4).join(' ') === 'mcp add-json --scope user' &&
    JSON.parse(mcpLog[1]).join(' ') === 'mcp remove --scope user agenda',
  mcpLog.join('\n')
)
check(
  'T4 sem erros nas páginas',
  earlier.length === 0 && mascot.logs.length === 0 && chat.logs.length === 0,
  [...earlier, ...mascot.logs, ...chat.logs].join('\n')
)
check('T5 o arquivo do projeto não mudou', existsSync(join(loja, '.mcp.json')))

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
