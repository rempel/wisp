// Pastas e skills (Fase 15), de ponta a ponta: o botão de pasta lista os projetos; um projeto
// abre numa aba nova, com o Claude Code (de mentira) rodando dentro dele; um projeto com um hook
// no .claude mostra o card de confiança antes de rodar (negar não roda; confiar, sim); a aba
// volta com a pasta depois de fechar e abrir o Wisp; e as skills aparecem, instalam de uma pasta
// (com a prévia) e vão para a lixeira pelas configurações. Uso: node e2e/folders.mjs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome({ projectRoots: ['~/projetos'] })
const H = home.home
const project = (name) => {
  const dir = join(H, 'projetos', name)
  mkdirSync(join(dir, '.git'), { recursive: true })
  mkdirSync(join(dir, '.claude'), { recursive: true })
  return dir
}
const limpo = project('limpo')
const app = project('meu-app')
writeFileSync(
  join(app, '.claude/settings.json'),
  JSON.stringify({
    hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo oi-do-hook' }] }] }
  })
)
const skill = (dir, text) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), text)
}
skill(
  join(H, '.claude/skills/resumo'),
  '---\nname: resumo\ndescription: Resume textos longos\n---\n'
)
const download = join(H, 'Downloads/deploy-rapido')
skill(
  download,
  '---\nname: deploy-rapido\ndescription: Faz o deploy\nallowed-tools: Bash\n---\nRode.'
)
const spawns = () =>
  readFileSync(join(H, '.fake-claude/spawns.log'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))

const env = { WISP_TEST_PICK_FOLDER: download }
await startApp(home, env)
wisp(home, '--show')
let chat = await connect('/chat/')
let ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const tabs = () =>
  ev(
    `[...document.querySelectorAll('.tab')].map(t => ({ title: t.querySelector('.tab-title').textContent, folder: !!t.querySelector('.tab-folder'), active: t.classList.contains('active') }))`
  )
const openProject = async (name) => {
  await ev(`document.querySelector('.tabs-folder').click()`)
  await waitFor(
    () => ev(`document.querySelectorAll('.folder-list .model-option').length > 1`),
    5000
  )
  await ev(
    `[...document.querySelectorAll('.folder-list .model-option')].find(b => b.querySelector('strong').textContent === ${JSON.stringify(name)}).click()`
  )
}
const pendingCard = () =>
  ev(`document.querySelector('.pane .permission-pending')?.innerText ?? null`)
// Os botões de um card recém-aparecido ignoram cliques por 600 ms (useArmed).
const clickCard = (label) =>
  sleep(800).then(() =>
    ev(
      `[...document.querySelectorAll('.pane .permission-pending button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`
    )
  )
const idle = () =>
  waitFor(() => ev(`!document.querySelector('.pane .status')?.classList.contains('busy')`), 15000)

console.log('== Um projeto numa aba')
await ev(`document.querySelector('.tabs-folder').click()`)
const listed = await waitFor(
  () =>
    ev(
      `(() => { const o = [...document.querySelectorAll('.folder-list .model-option strong')].map(e => e.textContent); return o.length > 1 ? o : null })()`
    ),
  5000
)
check(
  'F1 o botão de pasta lista os projetos',
  JSON.stringify(listed) === JSON.stringify(['limpo', 'meu-app', 'Escolher outra pasta…']),
  JSON.stringify(listed)
)
await ev(`document.querySelector('.tabs-folder').click()`)
await openProject('limpo')
await waitFor(async () => (await tabs()).some((t) => t.title === 'limpo' && t.active), 5000)
check(
  'F2 uma aba nova, com o nome e o ícone do projeto',
  (await tabs()).some((t) => t.title === 'limpo' && t.folder)
)
const hello = await waitFor(
  () => ev(`document.querySelector('.pane .empty-folder')?.innerText ?? null`),
  5000
)
check('F3 o painel diz onde trabalha', /Trabalhando em ~\/projetos\/limpo/.test(hello), hello)
check('F4 sem nada que rode sozinho, nenhum card', (await pendingCard()) === null)
wisp(home, '--ask', 'oi')
await sleep(400)
await idle()
check('F5 o Claude Code roda dentro do projeto', spawns().at(-1).cwd === limpo, spawns().at(-1).cwd)

console.log('== Um projeto com um hook: o card de confiança')
await openProject('meu-app')
let card = await waitFor(pendingCard, 5000)
check(
  'F6 o card aparece ao abrir, com o hook',
  /Confiar nesta pasta\?/.test(card) && /hook SessionStart roda: echo oi-do-hook/.test(card),
  card
)
check(
  'F7 só sim ou não',
  !(await ev(
    `[...document.querySelectorAll('.pane .permission-pending button')].some(b => /sempre/.test(b.textContent))`
  ))
)
await clickCard('Não confiar')
const count = spawns().length
wisp(home, '--ask', 'roda os testes')
card = await waitFor(pendingCard, 8000)
check(
  'F8 negado, a mensagem pergunta de novo, e nada roda',
  /Confiar nesta pasta\?/.test(card) && spawns().length === count,
  card
)
await clickCard('Confiar nesta pasta')
await waitFor(() => spawns().length > count, 8000)
await idle()
check(
  'F9 confiado, o Claude Code roda dentro dele',
  spawns().at(-1).cwd === app,
  JSON.stringify(spawns().map((s) => [s.cwd.split('/').pop(), s.args.slice(-2)]))
)
const trust = JSON.parse(readFileSync(join(H, '.local/share/wisp/pastas-confiaveis.json'), 'utf8'))
check('F10 a confiança fica guardada', typeof trust[app] === 'string', JSON.stringify(trust))

console.log('== Fechar e abrir o Wisp')
await stopApp()
const mascot = await startApp(home, env)
wisp(home, '--show')
chat = await connect('/chat/')
ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`document.querySelectorAll('.tab').length >= 3`), 15000)
const restored = await tabs()
check(
  'F11 as abas voltam com as pastas',
  restored.filter((t) => t.folder).length === 2,
  JSON.stringify(restored)
)

console.log('== Skills nas configurações')
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
const list = await waitFor(
  () =>
    ev(
      `(() => { const s = [...document.querySelectorAll('.skill')].map(e => e.innerText.replace(/\\n+/g, ' | ')); return s.length ? s : null })()`
    ),
  5000
)
check(
  'F12 a skill pessoal aparece',
  list?.length === 1 && /resumo \| pessoal/.test(list[0]) && /Resume textos longos/.test(list[0]),
  JSON.stringify(list)
)
await ev(
  `[...document.querySelectorAll('.skill-actions button')].find(b => b.textContent.startsWith('Instalar de')).click()`
)
const preview = await waitFor(
  () => ev(`document.querySelector('.skill-preview')?.innerText ?? null`),
  5000
)
check(
  'F13 a prévia antes de instalar, com o aviso do allowed-tools',
  /Instalar “deploy-rapido”\?/.test(preview) &&
    /Ela libera sem card, enquanto é usada: Bash/.test(preview),
  preview
)
check('F14 nada copiado antes do clique', !existsSync(join(H, '.claude/skills/deploy-rapido')))
await ev(
  `[...document.querySelectorAll('.skill-preview button')].find(b => b.textContent === 'Instalar').click()`
)
await waitFor(() => ev(`document.querySelectorAll('.skill').length === 2`), 5000)
check('F15 instalada e na lista', existsSync(join(H, '.claude/skills/deploy-rapido/SKILL.md')))
await ev(`document.querySelector('.skill .link[aria-label="Remover resumo"]').click()`)
const removed = await waitFor(
  () =>
    ev(
      `(() => { const t = document.querySelector('.skills [role="status"]')?.textContent ?? ''; return /lixeira|Não consegui/.test(t) ? t : null })()`
    ),
  5000
)
check(
  'F16 remover manda para a lixeira',
  /foi para a lixeira/.test(removed ?? '') && !existsSync(join(H, '.claude/skills/resumo')),
  removed
)
check(
  'F17 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
