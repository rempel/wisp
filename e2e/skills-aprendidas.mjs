// As skills que ele aprende (Fase 86), de ponta a ponta, com o Claude Code de mentira: o pedido vira
// o card da propose_skill, com o texto inteiro e a pasta; permitido, o SKILL.md aparece em
// ~/.claude/skills, com a marca do Wisp. Mudar a mesma skill mostra o diff e guarda a de antes.
// Uso: node e2e/skills-aprendidas.mjs (veja e2e/run.sh).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const skillDir = join(home.home, '.claude', 'skills', 'resumo-prs')
const skillFile = join(skillDir, 'SKILL.md')

const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const say = async (text) => {
  await ev(`document.querySelector('.pane.focused .composer textarea').focus()`)
  await chat.send('Input.insertText', { text })
  await sleep(200)
  await ev(`document.querySelector('.pane.focused .composer').requestSubmit()`)
}
const card = () => ev(`document.querySelector('.pane .permission-pending')?.innerText ?? null`)
const allow = async () => {
  await sleep(1200)
  await ev(
    `[...document.querySelectorAll('.pane .permission-pending button')].find(b => b.textContent.trim() === 'Permitir')?.click()`
  )
}

console.log('== Criar')
await say('[skill resumo-prs|Resume os PRs abertos em tópicos|1. Rode gh pr list.]')
const first = await waitFor(async () => {
  const text = await card()
  return /Cria .*resumo-prs\/SKILL\.md/.test(text ?? '') ? text : null
}, 10000)
check(
  'S1 o card mostra a skill inteira e onde ela vai ficar',
  /Criar ou mudar uma skill/.test(first ?? '') &&
    /\/resumo-prs/.test(first ?? '') &&
    /Rode gh pr list/.test(first ?? ''),
  first
)
check('S2 antes do OK, nada é gravado', !existsSync(skillFile))
await allow()
const made = await waitFor(
  () => (existsSync(skillFile) ? readFileSync(skillFile, 'utf8') : null),
  10000
)
check(
  'S3 permitida, o SKILL.md aparece com a marca do Wisp',
  /name: resumo-prs/.test(made ?? '') && /Criada pelo Wisp/.test(made ?? ''),
  made
)

console.log('== Mudar')
await sleep(500)
await say(
  '[skill resumo-prs|Resume os PRs abertos em tópicos|1. Rode gh pr list.\n2. Diga o CI de cada um.]'
)
const second = await waitFor(async () => {
  const text = await card()
  return /Muda .*resumo-prs\/SKILL\.md/.test(text ?? '') ? text : null
}, 10000)
check('S4 mudar uma que existe mostra o diff', /Diga o CI/.test(second ?? ''), second)
await allow()
const changed = await waitFor(
  () => (/Diga o CI/.test(readFileSync(skillFile, 'utf8')) ? true : null),
  10000
)
check(
  'S5 e guarda a de antes num backup ao lado',
  !!changed && readdirSync(skillDir).some((name) => name.startsWith('SKILL.md.backup-wisp-'))
)

check(
  'S6 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)
await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
