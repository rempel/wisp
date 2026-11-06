// Voltar, ramificar e a pergunta lateral (Fase 46), de ponta a ponta: três mensagens, a primeira
// edita um arquivo; "Voltar aqui" na segunda não mexe em arquivo; na primeira, a prévia mostra o
// arquivo e, confirmado, a conversa fica vazia, o texto volta para a caixa e o arquivo volta a ser
// o de antes. Depois, "Ramificar" na primeira de duas abre uma aba com uma mensagem, e o Claude
// Code (de mentira) dela lembra só dessa. A pergunta lateral (/btw) responde sem a conversa
// ganhar mensagens.
// Uso: node e2e/pontos.mjs (veja e2e/run.sh).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const project = join(home.home, 'projeto')
mkdirSync(project, { recursive: true })
const file = join(project, 'app.ts')
const before = 'const a = 1\nconst b = 2\nconst d = 5\n'
writeFileSync(file, before)

const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const idle = () =>
  waitFor(
    () =>
      ev(`!document.querySelector('.pane.focused .status, .status')?.classList.contains('busy')`),
    15000
  )
const pane = `(document.querySelector('.pane.focused') ?? document.querySelector('.pane'))`
const users = () => ev(`[...${pane}.querySelectorAll('.msg.user')].map((m) => m.innerText)`)
const ask = async (text) => {
  const count = (await users()).length
  wisp(home, '--ask', text)
  await waitFor(async () => (await users()).length > count, 10000)
  await idle()
  await sleep(300)
}
/** Clica num botão de uma mensagem sua (pela posição) com o texto dado. */
const turnButton = (index, label) =>
  ev(`(() => {
    const turn = ${pane}.querySelectorAll('.user-turn')[${index}]
    const button = turn && [...turn.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})
    if (!button) return false
    button.click()
    return true
  })()`)

console.log('== Três mensagens, a primeira edita um arquivo')
await ask(`[edit ${file}]`)
await ask('dois')
await ask('três')
check('P1 três mensagens', (await users()).length === 3, await users())
check('P2 o arquivo mudou', readFileSync(file, 'utf8').includes('const c = 4'))

console.log('== Voltar à segunda: nenhum arquivo muda')
check('P3 a mensagem tem o "Voltar aqui"', await turnButton(1, 'Voltar aqui'))
const second = await waitFor(
  () => ev(`${pane}.parentElement.querySelector('.rewind-card')?.innerText ?? null`),
  5000
)
check('P4 a confirmação aparece, sem arquivos', !!second && !/app\.ts/.test(second), second)
await ev(
  `[...document.querySelectorAll('.rewind-card button')].find((b) => b.textContent.trim() === 'Cancelar').click()`
)

console.log('== Voltar à primeira, com o arquivo')
await turnButton(0, 'Voltar aqui')
const first = await waitFor(
  () => ev(`document.querySelector('.rewind-card')?.innerText ?? null`),
  5000
)
check('P5 a prévia mostra o arquivo', /app\.ts/.test(first ?? ''), first)
check(
  'P6 com a caixa de voltar o arquivo marcada',
  await ev(`document.querySelector('.rewind-card input[type=checkbox]')?.checked === true`)
)
await ev(
  `[...document.querySelectorAll('.rewind-card button')].find((b) => b.textContent.trim() === 'Voltar').click()`
)
const emptied = await waitFor(async () => (await users()).length === 0, 5000)
check('P7 a conversa fica sem as mensagens', !!emptied, await users())
const box = await waitFor(
  () => ev(`${pane}.querySelector('.composer textarea')?.value || null`),
  3000
)
check('P8 o texto da primeira volta para a caixa', /\[edit /.test(box ?? ''), box)
check('P9 o arquivo volta a ser o de antes', readFileSync(file, 'utf8') === before)
await ev(`(() => {
  const box = ${pane}.querySelector('.composer textarea')
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  set.call(box, '')
  box.dispatchEvent(new Event('input', { bubbles: true }))
})()`)

console.log('== Ramificar')
await ask('um')
await ask('dois de novo')
const tabsBefore = await ev(`document.querySelectorAll('.tab').length`)
check('P10 a mensagem tem o "Ramificar"', await turnButton(0, 'Ramificar'))
const forked = await waitFor(
  async () => (await ev(`document.querySelectorAll('.tab').length`)) > tabsBefore,
  5000
)
check('P11 uma aba nova', !!forked)
await sleep(500)
check('P12 com a conversa até a primeira resposta', (await users()).length === 1, await users())
const tabTitle = await ev(
  `document.querySelector('.tab.active, .tab[aria-selected="true"]')?.innerText ?? ''`
)
check('P13 a aba diz que é um ramo', /ramo/.test(tabTitle), tabTitle)
await ask('[memória]')
const memory = await ev(`[...${pane}.querySelectorAll('.msg.assistant')].at(-1)?.innerText ?? ''`)
check(
  'P14 o Claude da aba nova lembra só da primeira',
  /Lembro de: um \| \[memória\]/.test(memory) && !/dois de novo/.test(memory),
  memory
)

console.log('== A pergunta lateral')
const count = (await users()).length
await ev(`${pane}.querySelector('.composer textarea').focus()`)
await chat.send('Input.insertText', { text: '/btw qual era a primeira?' })
await sleep(200)
await ev(`${pane}.querySelector('.composer').requestSubmit()`)
const answer = await waitFor(
  () => ev(`document.querySelector('.aside-box .aside-text')?.innerText ?? null`),
  10000
)
check(
  'P15 a resposta aparece na caixinha',
  /De lado: qual era a primeira\?/.test(answer ?? ''),
  answer
)
check('P16 com o contexto da conversa', /lembro de: um/.test(answer ?? ''), answer)
check('P17 sem mensagens novas na conversa', (await users()).length === count)
check(
  'P18 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
