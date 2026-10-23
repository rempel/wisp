// A conversa mais fluida (Fase 21), de ponta a ponta, com o Claude Code de mentira (que lembra
// as mensagens de cada sessão): editar a última mensagem (pelo botão e pelo ↑), com a resposta
// velha saindo do contexto; a busca com Ctrl+F; exportar em Markdown; o rascunho que volta
// depois de fechar e abrir o Wisp; e fixar a conversa no topo do histórico.
// Uso: node e2e/conversa.mjs (veja e2e/run.sh).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const exportFile = join(home.home, 'exportada.md')
const env = { WISP_TEST_SAVE_FILE: exportFile }
const spawns = () =>
  readFileSync(join(home.home, '.fake-claude/spawns.log'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))

let mascot = await startApp(home, env)
wisp(home, '--show')
let chat = await connect('/chat/')
let ev = (expression) => chat.evaluate(expression)
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
const typeText = async (text) => {
  await ev(`document.querySelector('.pane .composer textarea').focus()`)
  await chat.send('Input.insertText', { text })
  await sleep(100)
}
const busy = () =>
  ev(`document.querySelector('.header .status')?.classList.contains('busy') ?? false`)
const idle = () => waitFor(async () => !(await busy()), 15000)
const send = async (text) => {
  await typeText(text)
  await key('Enter', 'Enter', 13)
  await sleep(300)
  await idle()
}
const users = () =>
  ev(`[...document.querySelectorAll('.pane .msg.user')].map(e => e.innerText.trim())`)
const answers = () =>
  ev(`[...document.querySelectorAll('.pane .msg.assistant')].map(e => e.innerText.trim())`)
const box = () => ev(`document.querySelector('.pane .composer textarea').value`)
const banner = () => ev(`document.querySelector('.pane .edit-banner')?.innerText ?? null`)

console.log('== Editar a última mensagem')
await send('primeira')
await send('segunda')
check(
  'E1 só a última mensagem tem o Editar',
  (await ev(`document.querySelectorAll('.pane .edit-last').length`)) === 1 &&
    (await ev(
      `document.querySelector('.pane .user-turn.editable .msg.user')?.innerText.trim()`
    )) === 'segunda'
)
await ev(`document.querySelector('.pane .edit-last').click()`)
await sleep(200)
check(
  'E2 o Editar põe o texto na caixa, com o aviso',
  (await box()) === 'segunda' && /Editando a última mensagem/.test((await banner()) ?? ''),
  `${await box()} | ${await banner()}`
)
await key('Escape', 'Escape', 27)
check(
  'E3 o Esc desiste, sem fechar o painel',
  (await box()) === '' &&
    (await banner()) === null &&
    (await ev(`document.visibilityState === 'visible'`))
)
await ev(`document.querySelector('.pane .composer textarea').focus()`)
await key('ArrowUp', 'ArrowUp', 38)
check('E4 ↑ na caixa vazia também edita', (await box()) === 'segunda', await box())
await ev(
  `(() => { const t = document.querySelector('.pane .composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, ''); t.dispatchEvent(new Event('input', { bubbles: true })) })()`
)
await send('segunda editada [memória]')
const shown = await users()
const replies = await answers()
check(
  'E5 a mensagem velha e a resposta dela saem; a nova vai no lugar',
  JSON.stringify(shown) === JSON.stringify(['primeira', 'segunda editada [memória]']) &&
    replies.length === 2,
  JSON.stringify({ shown, replies })
)
check(
  'E6 o Claude só lembra da primeira e da editada',
  /^Lembro de: primeira \| segunda editada \[memória\]$/.test(replies.at(-1) ?? ''),
  replies.at(-1)
)
const args = spawns().at(-1).args
check(
  'E7 numa cópia da sessão, voltando até a resposta da primeira',
  args.includes('--resume-session-at') && args.includes('--fork-session'),
  JSON.stringify(args)
)

console.log('== Buscar na conversa')
await key('f', 'KeyF', 70, 2)
const opened = await waitFor(() => ev(`!!document.querySelector('.pane .find-bar input')`), 3000)
await chat.send('Input.insertText', { text: 'primeira' })
await sleep(200)
const count = await ev(`document.querySelector('.pane .find-count').textContent`)
check(
  'E8 Ctrl+F busca e marca os trechos',
  opened && count === '1 de 2' && (await ev(`CSS.highlights.get('wisp-find')?.size`)) === 2,
  count
)
await key('Enter', 'Enter', 13)
check(
  'E9 Enter vai para o próximo',
  (await ev(`document.querySelector('.pane .find-count').textContent`)) === '2 de 2'
)
await key('Escape', 'Escape', 27)
check(
  'E10 Esc fecha a busca e tira as marcas, sem fechar o painel',
  (await ev(`!document.querySelector('.pane .find-bar')`)) &&
    (await ev(`CSS.highlights.size`)) === 0 &&
    (await ev(`document.visibilityState === 'visible'`))
)

console.log('== Exportar')
await key('e', 'KeyE', 69, 2 | 8)
const exported = await waitFor(() => existsSync(exportFile), 5000)
const markdown = exported ? readFileSync(exportFile, 'utf8') : ''
check(
  'E11 Ctrl+Shift+E exporta em Markdown, sem a mensagem editada',
  /^# primeira/.test(markdown) &&
    /## Você\n\nsegunda editada \[memória\]/.test(markdown) &&
    /Lembro de: primeira/.test(markdown) &&
    !/\nsegunda\n/.test(markdown),
  markdown
)
check(
  'E12 o aviso diz onde ficou',
  await waitFor(
    () =>
      ev(
        `[...document.querySelectorAll('.pane .notice')].some(n => /exportada para/.test(n.innerText))`
      ),
    3000
  )
)

console.log('== O rascunho volta')
await typeText('um rascunho não mandado')
await sleep(900)
const logs = [...mascot.logs, ...chat.logs]
await stopApp()
mascot = await startApp(home, env)
wisp(home, '--show')
chat = await connect('/chat/')
ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const draft = await waitFor(
  async () => ((await box()) === 'um rascunho não mandado' ? 'sim' : null),
  5000
)
check('E13 depois de fechar e abrir, o rascunho está na caixa', draft === 'sim', await box())
const restored = await waitFor(async () => {
  const value = await users()
  return value.length ? value : null
}, 5000)
check(
  'E14 a conversa volta com a edição aplicada',
  JSON.stringify(restored) === JSON.stringify(['primeira', 'segunda editada [memória]']),
  JSON.stringify(restored)
)

console.log('== Fixar no histórico')
await ev(
  `document.querySelector('.header .icon-button[aria-label="Conversas anteriores"]')?.click()`
)
await waitFor(() => ev(`!!document.querySelector('.history-item .history-pin')`), 5000)
await ev(`document.querySelector('.history-item .history-pin').click()`)
const pinned = await waitFor(
  () =>
    ev(
      `(() => { const g = document.querySelector('.history-group'); const b = document.querySelector('.history-pin.on'); return g && b ? g.textContent : null })()`
    ),
  5000
)
check(
  'E15 a conversa fixada vai para o topo, em Fixadas',
  pinned === 'Fixadas' &&
    JSON.parse(readFileSync(join(home.home, '.local/share/wisp/fixadas.json'), 'utf8')).length ===
      1,
  pinned
)
check(
  'E16 sem erros nas páginas',
  logs.length === 0 && mascot.logs.length === 0 && chat.logs.length === 0,
  [...logs, ...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
