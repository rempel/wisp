// O histórico que acha (Fase 29), de ponta a ponta: a busca no que foi dito (sem acentos), com o
// trecho; os filtros por período e por pasta; abrir pelo resultado leva à mensagem (a dela, numa
// conversa longa, onde ela nem aparecia de começo), com a busca na conversa marcando o termo; e
// apagar tira a conversa do índice.
// Uso: node e2e/historico.mjs (veja e2e/run.sh).
import { existsSync, mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const dir = join(home.home, '.local/share/wisp/conversas')
const project = join(home.home, 'projetos/aquario')
mkdirSync(dir, { recursive: true, mode: 0o700 })
mkdirSync(project, { recursive: true })

const DAY = 86_400_000
const OLD = '11111111-1111-4111-8111-111111111111'
const NEW = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'

/** Grava uma conversa como o Wisp grava: o cabeçalho e os turnos. */
function save(id, title, turns, { cwd, daysAgo = 0 } = {}) {
  const at = Date.now() - daysAgo * DAY
  const lines = [{ type: 'conversa', v: 1, id, createdAt: at, title, ...(cwd ? { cwd } : {}) }]
  turns.forEach(([user, reply], index) => {
    lines.push({ type: 'user', text: user, attachments: [] })
    lines.push({ type: 'text', blockId: `${id.slice(0, 3)}-b${index}`, delta: reply })
    lines.push({ type: 'turn-end', outcome: 'done' })
  })
  const file = join(dir, `${id}.jsonl`)
  writeFileSync(file, lines.map((line) => JSON.stringify(line)).join('\n') + '\n', { mode: 0o600 })
  utimesSync(file, new Date(at), new Date(at))
}

// Uma conversa de 40 dias atrás, longa (200 turnos): a anêmona está no 20º, bem antes das
// mensagens que o painel mostra de começo; o tubarão, numa mensagem sua, no 30º.
const long = Array.from({ length: 200 }, (_, i) => [
  `Pergunta ${i} sobre o aquário`,
  `Resposta ${i}: a água precisa de cuidado.`
])
long[20][1] = 'A **anêmona** precisa de luz forte e de um peixe-palhaço por perto.'
long[30][0] = 'E um tubarão-martelo cabe num aquário de 500 litros?'
save(OLD, 'Montando o aquário de água salgada', long, { cwd: project, daysAgo: 40 })
save(NEW, 'Lista de compras', [
  ['O que falta para o jantar?', 'Pepino em conserva e uma anêmona de chocolate, para brincar.']
])
save(OTHER, 'Receita de bolo', [['Bolo de fubá?', 'Fubá, ovos, leite e açúcar.']], {
  daysAgo: 3
})

const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)

const openHistory = async () => {
  await ev(
    `document.querySelector('.header .icon-button[aria-label="Conversas anteriores"]')?.click()`
  )
  await waitFor(() => ev(`!!document.querySelector('.history-search input')`), 5000)
}
const search = async (text) => {
  await ev(
    `(() => { const i = document.querySelector('.history-search input'); i.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
  )
  if (text) await chat.send('Input.insertText', { text })
  await sleep(600)
}
const titles = () =>
  ev(`[...document.querySelectorAll('.history-item .history-title')].map(e => e.textContent)`)
const snippets = () =>
  ev(`[...document.querySelectorAll('.history-snippet')].map(e => e.textContent.trim())`)
const period = async (label) => {
  await ev(
    `[...document.querySelectorAll('.history-period button')].find(b => b.textContent === ${JSON.stringify(label)})?.click()`
  )
  await sleep(250)
}
/** O destaque atual da busca na conversa: o texto e a mensagem onde ele está. */
const current = () =>
  ev(`(() => {
    const h = CSS.highlights.get('wisp-find-current')
    const range = h ? [...h][0] : null
    if (!range) return null
    const node = range.startContainer.parentElement
    const message = node.closest('[data-item], .user-turn')
    const list = document.querySelector('.pane .messages').getBoundingClientRect()
    const box = message.getBoundingClientRect()
    return {
      text: range.toString(),
      item: message.getAttribute('data-item'),
      user: [...document.querySelectorAll('.pane .user-turn')].indexOf(message),
      visible: box.bottom > list.top && box.top < list.bottom,
      count: document.querySelector('.pane .find-count')?.textContent,
      query: document.querySelector('.pane .find-bar input')?.value
    }
  })()`)

console.log('== Buscar no que foi dito')
await openHistory()
await search('anemona')
let found = await titles()
check(
  'H1 sem o acento, acha as duas conversas que falam da anêmona',
  JSON.stringify(found) ===
    JSON.stringify(['Lista de compras', 'Montando o aquário de água salgada']),
  JSON.stringify(found)
)
let shown = await snippets()
check(
  'H2 com o trecho, de quem disse, e a palavra marcada',
  shown.length === 2 &&
    /^Claude: A anêmona precisa de luz forte/.test(shown[1]) &&
    (await ev(
      `[...document.querySelectorAll('.history-snippet mark')].map(m => m.textContent).join('|')`
    )) === 'anêmona|anêmona',
  JSON.stringify(shown)
)
await search('tubarao martelo')
check(
  'H3 numa mensagem sua também acha',
  JSON.stringify(await titles()) === JSON.stringify(['Montando o aquário de água salgada']) &&
    /^Você: E um tubarão-martelo cabe/.test((await snippets())[0] ?? ''),
  JSON.stringify(await snippets())
)
await search('fuba')
check('H4 a busca acha o que só está na resposta', (await titles())[0] === 'Receita de bolo')
await search('girafa')
check(
  'H5 nada encontrado diz isso',
  (await ev(`document.querySelector('.history-empty')?.textContent`)) ===
    'Nada encontrado nas conversas.'
)

console.log('== Filtros')
await search('')
check('F1 sem busca, a lista toda', (await titles()).length === 3)
await period('Hoje')
check(
  'F2 hoje: só a de hoje',
  JSON.stringify(await titles()) === JSON.stringify(['Lista de compras'])
)
await period('Esta semana')
check('F3 esta semana: a de hoje e a de 3 dias', (await titles()).length === 2)
await period('Antes')
await search('anemona')
check(
  'F4 antes, com a busca: só a de 40 dias atrás',
  JSON.stringify(await titles()) === JSON.stringify(['Montando o aquário de água salgada'])
)
await period('Tudo')
const options = await ev(
  `[...document.querySelectorAll('.history-folder option')].map(o => o.textContent)`
)
await ev(
  `(() => { const s = document.querySelector('.history-folder'); s.value = ${JSON.stringify(project)}; s.dispatchEvent(new Event('change', { bubbles: true })) })()`
)
await sleep(250)
check(
  'F5 a pasta: só as conversas do projeto',
  JSON.stringify(options) === JSON.stringify(['Todas as pastas', 'Sem pasta', 'aquario']) &&
    JSON.stringify(await titles()) === JSON.stringify(['Montando o aquário de água salgada']),
  JSON.stringify(options)
)
await ev(
  `(() => { const s = document.querySelector('.history-folder'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })) })()`
)
await sleep(250)
check(
  'F6 sem pasta: as do Wisp',
  JSON.stringify(await titles()) === JSON.stringify(['Lista de compras'])
)
await ev(
  `(() => { const s = document.querySelector('.history-folder'); s.value = '*'; s.dispatchEvent(new Event('change', { bubbles: true })) })()`
)
await sleep(250)

console.log('== Abrir na mensagem')
await ev(
  `[...document.querySelectorAll('.history-open')].find(b => b.textContent.includes('Montando'))?.click()`
)
const jumped = await waitFor(async () => {
  const value = await current()
  return value?.item ? value : null
}, 8000)
check(
  'O1 a conversa abre no painel, com a busca na conversa marcando o termo',
  (await ev(`!document.querySelector('.history')`)) &&
    jumped?.query === 'anêmona' &&
    jumped?.text === 'anêmona',
  JSON.stringify(jumped)
)
check(
  'O2 na mensagem achada (o 20º texto, que de começo nem aparecia), à vista',
  jumped?.item === '111-b20' && jumped.visible && jumped.count === '1 de 1',
  JSON.stringify(jumped)
)
await openHistory()
await search('tubarao martelo')
await ev(`document.querySelector('.history-open')?.click()`)
const user = await waitFor(async () => {
  const value = await current()
  return value && value.user >= 0 ? value : null
}, 8000)
check(
  'O3 já aberta numa aba, vai para a sua mensagem (a 31ª)',
  user?.user === 30 && user.visible && user.text === 'tubarão',
  JSON.stringify(user)
)
// A busca na conversa também não liga para os acentos.
await ev(
  `(() => { const i = document.querySelector('.pane .find-bar input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'PALHACO'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
)
await sleep(300)
check(
  'O4 o Ctrl+F não liga para acentos nem maiúsculas',
  (await ev(`document.querySelector('.pane .find-count').textContent`)) === '1 de 1' &&
    (await current())?.text === 'palhaço',
  JSON.stringify(await current())
)

console.log('== Apagar tira do índice')
const cache = join(home.home, '.cache/wisp/busca.json')
// O cache é gravado uns segundos depois da última mudança.
await waitFor(() => existsSync(cache), 15000)
check(
  'D1 o índice fica no cache, só para você',
  (statSync(cache).mode & 0o777) === 0o600 && readFileSync(cache, 'utf8').includes('Pepino')
)
await openHistory()
await search('pepino')
await ev(`document.querySelector('.history-item .history-delete')?.click()`)
await sleep(150)
await ev(`document.querySelector('.history-item.confirming .danger')?.click()`)
await sleep(800)
check(
  'D2 apagada, a conversa sai da busca e do cache na hora',
  (await titles()).length === 0 && !readFileSync(cache, 'utf8').includes('Pepino'),
  JSON.stringify(await titles())
)
await search('anemona')
check(
  'D3 a outra continua achando',
  JSON.stringify(await titles()) === JSON.stringify(['Montando o aquário de água salgada'])
)
check(
  'D4 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
