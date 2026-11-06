// Os subagentes pelo Wisp (Fase 50), de ponta a ponta: nas configurações, "Ver e editar os
// subagentes" abre a tela; um subagente novo mostra o diff antes de criar e vira o .md em
// ~/.claude/agents; editar mostra o que muda e deixa o backup do arquivo velho; apagar o manda para
// a lixeira (ou diz por que não deu).
// Uso: node e2e/agentes.mjs (veja e2e/run.sh).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const dir = join(home.home, '.claude', 'agents')
const file = join(dir, 'revisor.md')

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
/** Preenche um campo do formulário pelo rótulo (o setter nativo, para o React ver). */
const fill = (label, value) =>
  ev(`(() => {
    const field = [...document.querySelectorAll('.agent-form label')].find((l) => l.textContent.startsWith(${JSON.stringify(label)}))?.querySelector('input, textarea, select')
    if (!field) return false
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement : field instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(field, ${JSON.stringify(value)})
    field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    return true
  })()`)

console.log('== Abrir pelas configurações')
await ev(`document.querySelector('.header [aria-label="Configurações"]')?.click()`)
await waitFor(() => ev(`!!document.querySelector('.settings')`), 5000)
check(
  'A1 o botão dos subagentes está nas configurações',
  await click('.settings button', 'Ver e editar os subagentes')
)
const empty = await waitFor(
  () => ev(`document.querySelector('.agents-view')?.innerText ?? null`),
  5000
)
check('A2 a tela abre, sem subagentes ainda', /Nenhum subagente ainda/.test(empty ?? ''), empty)

console.log('== Criar')
await click('.agents-view button', 'Novo subagente')
await sleep(200)
await fill('Nome', 'revisor')
await fill('Quando usar', 'Revisa o código: bugs e clareza.')
await fill('O prompt', 'Você é um revisor cuidadoso.')
await fill('Modelo', 'sonnet')
await fill('Ferramentas', 'Read, Grep')
await click('.agent-form button', 'Ver o que muda')
const preview = await waitFor(
  () => ev(`document.querySelector('.agent-preview')?.innerText ?? null`),
  5000
)
check(
  'A3 a prévia diz o que cria, antes de gravar',
  /Cria .*revisor\.md/.test(preview ?? ''),
  preview
)
check('A4 nada gravado ainda', !existsSync(file))
await click('.agent-form button', 'Criar')
const created = await waitFor(() => existsSync(file), 5000)
check('A5 o arquivo nasce em ~/.claude/agents', !!created)
const text = created ? readFileSync(file, 'utf8') : ''
check(
  'A6 com o cabeçalho do Claude Code',
  /^---\nname: revisor\ndescription: 'Revisa o código: bugs e clareza\.'\ntools: Read, Grep\nmodel: sonnet\n---\n\nVocê é um revisor cuidadoso\.\n$/.test(
    text
  ),
  text
)
const listed = await waitFor(
  () => ev(`document.querySelector('.agents-view .agent')?.innerText ?? null`),
  5000
)
check(
  'A7 ele aparece na lista',
  /revisor/.test(listed ?? '') && /sonnet/.test(listed ?? ''),
  listed
)

console.log('== Editar')
await click('.agents-view .agent button', 'Editar')
await sleep(200)
await fill('Modelo', 'opus')
await click('.agent-form button', 'Ver o que muda')
const change = await waitFor(
  () => ev(`document.querySelector('.agent-preview')?.innerText ?? null`),
  5000
)
check('A8 a prévia diz que muda (com o backup)', /Muda .*backup/.test(change ?? ''), change)
await click('.agent-form button', 'Gravar')
const edited = await waitFor(() => /model: opus/.test(readFileSync(file, 'utf8')), 5000)
check('A9 o arquivo muda', !!edited)
check(
  'A10 o de antes ganha um backup ao lado',
  readdirSync(dir).some((name) => name.startsWith('revisor.md.backup-wisp-')),
  readdirSync(dir).join(', ')
)

console.log('== Apagar')
await click('.agents-view .agent button', 'Apagar')
await click('.agents-view .agent button', 'Mandar para a lixeira?')
const gone = await waitFor(
  () =>
    !existsSync(file) ||
    ev(`/lixeira/.test(document.querySelector('.agents-view > small')?.innerText ?? '')`),
  5000
)
check('A11 apagar manda para a lixeira (ou diz por que não deu)', !!gone)
check(
  'A12 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
