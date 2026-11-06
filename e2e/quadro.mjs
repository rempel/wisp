// O quadro de tarefas (Fase 51), de ponta a ponta, com um repositório de verdade: um cartão novo
// num projeto vai para A fazer; Começar abre uma conversa numa cópia do Git com o pedido (o Claude
// Code de mentira edita o arquivo da cópia); no fim da resposta o cartão vai sozinho para Revisar;
// Juntar leva a mudança para a pasta original (sem commit) e o cartão para Feito.
// Uso: node e2e/quadro.mjs (veja e2e/run.sh).
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome({ projectRoots: ['~/projetos'] })
const original = join(home.home, 'projetos', 'loja')
mkdirSync(original, { recursive: true })
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' })
git(original, 'init', '-q', '-b', 'main')
git(original, 'config', 'user.email', 'teste@exemplo.com')
git(original, 'config', 'user.name', 'Teste')
git(original, 'config', 'core.autocrlf', 'false')
const before = 'const a = 1\nconst b = 2\nconst d = 5\n'
writeFileSync(join(original, 'app.ts'), before)
git(original, 'add', '.')
git(original, 'commit', '-q', '-m', 'início')

const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const click = (selector, text) =>
  ev(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((b) => b.textContent.trim() === ${JSON.stringify(text)})
    if (!el) return false
    el.click()
    return true
  })()`)
const fill = (label, value) =>
  ev(`(() => {
    const field = [...document.querySelectorAll('.board-form label')].find((l) => l.textContent.startsWith(${JSON.stringify(label)}))?.querySelector('input, textarea, select')
    if (!field) return false
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement : field instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(field, ${JSON.stringify(value)})
    field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    return true
  })()`)
const column = (name) => ev(`document.querySelector('.board-${name}')?.innerText ?? ''`)

console.log('== Um cartão novo')
await ev(`document.querySelector('.header [aria-label="Quadro de tarefas"]').click()`)
await waitFor(() => ev(`!!document.querySelector('.board-view')`), 5000)
await click('.board-view button', 'Novo cartão')
await waitFor(() => ev(`document.querySelectorAll('.board-form select option').length > 0`), 5000)
await fill('Título', 'Mudar o b')
await fill('O pedido', '[edit app.ts]')
await fill('Projeto', original)
await click('.board-form button', 'Pôr em A fazer')
const todo = await waitFor(
  async () => ((await column('todo')).includes('Mudar o b') ? column('todo') : null),
  5000
)
check('Q1 o cartão entra em A fazer, com o projeto', /loja/.test(todo ?? ''), todo)

console.log('== Começar')
await click('.board-todo button', 'Começar')
const tabs = await waitFor(
  () =>
    ev(
      `document.querySelectorAll('.tab').length >= 2 ? document.querySelectorAll('.tab').length : null`
    ),
  10000
)
check('Q2 uma aba nova para o cartão', !!tabs, tabs)
const bar = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane .worktree-bar')].map((b) => b.innerText).join(' ') || null`
    ),
  15000
)
check('Q3 a conversa roda numa cópia do projeto', /wisp\//.test(bar ?? ''), bar)
const asked = await ev(
  `[...document.querySelectorAll('.pane .msg.user')].some((m) => m.innerText.includes('[edit app.ts]'))`
)
check('Q4 com o pedido do cartão', asked)

console.log('== Revisar e juntar')
await ev(`document.querySelector('.header [aria-label="Quadro de tarefas"]').click()`)
const review = await waitFor(
  async () => ((await column('review')).includes('Mudar o b') ? column('review') : null),
  15000
)
check('Q5 no fim da resposta, o cartão vai para Revisar', !!review, review)
check(
  'Q6 a pasta original ainda não mudou',
  readFileSync(join(original, 'app.ts'), 'utf8') === before
)
await click('.board-review button', 'Juntar')
const joined = await waitFor(
  () => readFileSync(join(original, 'app.ts'), 'utf8').includes('const c = 4'),
  8000
)
check('Q7 Juntar leva a mudança para a pasta original', !!joined)
check('Q8 sem commit', git(original, 'log', '--oneline').trim().split('\n').length === 1)
const done = await waitFor(
  async () => ((await column('done')).includes('Mudar o b') ? true : null),
  5000
)
check('Q9 o cartão vai para Feito', !!done)
await sleep(300)
check(
  'Q10 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
