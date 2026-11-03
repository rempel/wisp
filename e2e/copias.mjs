// A conversa numa cópia do Git (Fase 43), de ponta a ponta, com um repositório de verdade: o menu
// das pastas abre o projeto numa cópia (uma worktree num ramo wisp/…); a barra da cópia mostra o
// ramo e, depois de uma edição do Claude Code (de mentira) na cópia, o arquivo que mudou; Juntar
// leva a mudança para a pasta original (sem commit, e sem mexer nela antes); Descartar pede uma
// confirmação, tira a cópia e o ramo e fecha a aba.
// Uso: node e2e/copias.mjs (veja e2e/run.sh).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, dataDir, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome({ projectRoots: ['~/projetos'] })
const original = join(home.home, 'projetos', 'app')
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
const idle = () =>
  waitFor(() => ev(`!document.querySelector('.status')?.classList.contains('busy')`), 15000)

console.log('== Abrir numa cópia')
await ev(`document.querySelector('.tabs-folder').click()`)
await waitFor(() => ev(`!!document.querySelector('.folder-copy input')`), 5000)
await ev(`document.querySelector('.folder-copy input').click()`)
await ev(
  `[...document.querySelectorAll('.folder-list .model-option')].find((b) => b.querySelector('strong')?.textContent === 'app').click()`
)
const bar = await waitFor(
  () =>
    ev(
      `document.querySelector('.pane.focused .worktree-bar, .pane .worktree-bar')?.innerText ?? null`
    ),
  10000
)
check('C1 a aba nova tem a barra da cópia, com o ramo', /wisp\/[0-9a-f]{6}/.test(bar ?? ''), bar)
check('C2 sem mudanças ainda', /sem mudanças/.test(bar ?? ''), bar)
const registry = JSON.parse(readFileSync(join(dataDir(home.home), 'copias.json'), 'utf8'))
const copy = registry[0]
check(
  'C3 a cópia é uma worktree do repositório',
  !!copy && existsSync(join(copy.dir, 'app.ts')),
  JSON.stringify(registry)
)
check('C4 no ramo dela', /wisp\//.test(git(original, 'branch')), git(original, 'branch'))

console.log('== Uma edição na cópia')
wisp(home, '--ask', `[edit ${join(copy.dir, 'app.ts')}]`)
await idle()
const changed = await waitFor(
  () =>
    ev(
      `(() => { const b = document.querySelector('.pane .worktree-bar'); return b && /1 arquivo mudou/.test(b.innerText) ? b.innerText : null })()`
    ),
  10000
)
check('C5 a barra mostra o arquivo que mudou', /app\.ts/.test(changed ?? ''), changed)
check(
  'C6 a pasta original ainda não mudou',
  readFileSync(join(original, 'app.ts'), 'utf8') === before
)

console.log('== Juntar')
await ev(
  `[...document.querySelectorAll('.pane .worktree-bar button')].find((b) => b.textContent === 'Juntar na pasta original').click()`
)
const joined = await waitFor(
  () => readFileSync(join(original, 'app.ts'), 'utf8').includes('const c = 4'),
  5000
)
check(
  'C7 a mudança entra na pasta original',
  !!joined,
  readFileSync(join(original, 'app.ts'), 'utf8')
)
check(
  'C8 sem commit (fica para você)',
  git(original, 'log', '--oneline').trim().split('\n').length === 1
)
const note = await waitFor(
  () => ev(`document.querySelector('.pane .worktree-bar .settings-hint')?.innerText ?? null`),
  5000
)
check('C9 a barra diz o que entrou', /pasta original/.test(note ?? ''), note)

console.log('== Descartar')
const tabsBefore = await ev(`document.querySelectorAll('.tab').length`)
await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane .worktree-bar button')].some((b) => b.textContent === 'Descartar' && !b.disabled)`
    ),
  10000
)
await ev(
  `[...document.querySelectorAll('.pane .worktree-bar button')].find((b) => b.textContent === 'Descartar').click()`
)
const asks = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane .worktree-bar button')].some((b) => b.textContent === 'Descartar de vez?')`
    ),
  3000
)
check('C10 Descartar pede a confirmação', !!asks)
await ev(
  `[...document.querySelectorAll('.pane .worktree-bar button')].find((b) => b.textContent === 'Descartar de vez?').click()`
)
const gone = await waitFor(() => !existsSync(copy.dir), 10000)
check('C11 a cópia sai do disco', !!gone)
const pruned = await waitFor(() => !/wisp\//.test(git(original, 'branch')), 10000)
check('C12 e o ramo também', !!pruned, git(original, 'branch'))
const closed = await waitFor(
  async () => (await ev(`document.querySelectorAll('.tab').length`)) < tabsBefore,
  5000
)
check('C13 a aba da cópia fecha', !!closed)
check(
  'C14 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
