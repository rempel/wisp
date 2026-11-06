// O painel de uso (Fase 49), de ponta a ponta: com sessões do Claude Code de dois projetos no
// ~/.claude/projects, a paleta abre o painel com os números (o custo estimado e os tokens), o
// gráfico dos dias, as tabelas por projeto e por modelo; trocar o período relê; e o CSV sai.
// Uso: node e2e/uso.mjs (veja e2e/run.sh).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const projects = join(home.home, '.claude', 'projects')
const today = new Date()
const ago = (days) => new Date(today.getTime() - days * 86400000).toISOString()
const entry = (id, model, when, cwd, output, input = 1000) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: when,
    cwd,
    requestId: `req_${id}`,
    message: {
      id: `msg_${id}`,
      model,
      usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: 5000 }
    }
  })
mkdirSync(join(projects, '-home-eu-loja'), { recursive: true })
mkdirSync(join(projects, '-home-eu-blog'), { recursive: true })
writeFileSync(
  join(projects, '-home-eu-loja', 'a.jsonl'),
  [
    entry('1', 'claude-opus-5-5', ago(0), '/home/eu/loja', 20000),
    entry('2', 'claude-opus-5-5', ago(2), '/home/eu/loja', 10000)
  ].join('\n')
)
writeFileSync(
  join(projects, '-home-eu-blog', 'b.jsonl'),
  [
    entry('3', 'claude-sonnet-5-5', ago(1), '/home/eu/blog', 3000),
    entry('4', 'claude-sonnet-5-5', ago(40), '/home/eu/blog', 3000)
  ].join('\n')
)
const csv = join(home.home, 'uso.csv')

const mascot = await startApp(home, { WISP_TEST_SAVE_FILE: csv })
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)

console.log('== Pela paleta')
await chat.send('Input.dispatchKeyEvent', {
  type: 'keyDown',
  key: 'p',
  code: 'KeyP',
  windowsVirtualKeyCode: 80,
  modifiers: 2
})
await chat.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'p', code: 'KeyP', modifiers: 2 })
await waitFor(() => ev(`!!document.querySelector('.palette input')`), 5000)
await chat.send('Input.insertText', { text: 'painel de uso' })
await sleep(300)
await chat.send('Input.dispatchKeyEvent', {
  type: 'keyDown',
  key: 'Enter',
  code: 'Enter',
  windowsVirtualKeyCode: 13
})
await chat.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' })
const tiles = await waitFor(
  () => ev(`document.querySelector('.spend-tiles')?.innerText ?? null`),
  8000
)
check('U1 o painel abre com os números', !!tiles, tiles)
// 30 dias: loja 2×1000 entrada (4) + 30000 saída (20) + 10000 lidos (0,2) e blog 1000 + 3000 (2/10) + 5000 (0,2); a de 40 dias atrás fica de fora.
const expected = (2000 * 4 + 30000 * 20 + 10000 * 0.2 + 1000 * 2 + 3000 * 10 + 5000 * 0.2) / 1e6
const shown = expected.toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4
})
check('U2 o custo estimado bate', (tiles ?? '').includes(`US$ ${shown}`), tiles)
const bars = await ev(`document.querySelectorAll('.spend-chart .spend-bar').length`)
check('U3 o gráfico tem uma barra por dia com uso', bars === 3, bars)
const tables = await ev(`[...document.querySelectorAll('.spend-table')].map((t) => t.innerText)`)
check(
  'U4 por projeto e por modelo',
  /loja/.test(tables[0] ?? '') &&
    /blog/.test(tables[0] ?? '') &&
    /claude-opus-5-5/.test(tables[1] ?? ''),
  JSON.stringify(tables)
)

console.log('== O período e o CSV')
await ev(
  `[...document.querySelectorAll('.spend-periods button')].find((b) => b.textContent.startsWith('90')).click()`
)
await sleep(800)
const bars90 = await ev(`document.querySelectorAll('.spend-chart .spend-bar').length`)
check('U5 em 90 dias, a sessão de 40 dias atrás entra', bars90 === 4, bars90)
await ev(
  `[...document.querySelectorAll('.spend-view button')].find((b) => b.textContent === 'Exportar CSV').click()`
)
const saved = await waitFor(() => existsSync(csv) && readFileSync(csv, 'utf8').endsWith('\n'), 5000)
check(
  'U6 o CSV sai com as linhas',
  !!saved && readFileSync(csv, 'utf8').trim().split('\n').length === 5,
  saved
    ? readFileSync(csv, 'utf8')
    : await ev(`document.querySelector('.spend-view > small')?.innerText ?? '(sem aviso)'`)
)
check(
  'U7 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
