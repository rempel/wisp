// O modo terminal (Fase 17), de ponta a ponta, com o Claude Code de mentira no modo interativo:
// a aba troca para o terminal (o processo sobe num pty, com o modo da conversa, os hooks e a
// linha de status do Wisp); o que se digita chega ao Claude Code; o card do Wisp aparece por cima
// do terminal e vale junto com as teclas de lá; o --ask entra colado; uma mensagem no meio entra
// na resposta; o Esc interrompe; trocar o modelo e o modo recomeça na mesma sessão; de volta ao
// chat, a conversa está lá; e a aba volta no modo terminal depois de fechar e abrir o Wisp.
// Uso: node e2e/terminal.mjs (veja e2e/run.sh).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const tuiLog = () => {
  try {
    return readFileSync(join(home.home, '.fake-claude/tui.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
  } catch {
    return []
  }
}
const starts = () => tuiLog().filter((entry) => entry.start)

await startApp(home)
wisp(home, '--show')
let chat = await connect('/chat/')
let ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const conv = await ev(`document.querySelector('.pane').dataset.conversation`)
const screen = () =>
  ev(
    `[...document.querySelectorAll('.pane .xterm-rows > div')].map(d => d.textContent).join('\\n')`
  )
const shows = (re, ms = 10000) =>
  waitFor(async () => {
    const text = await screen()
    return re.test(text) ? text : null
  }, ms)
const type = (text) => ev(`window.wisp.tui.input(${JSON.stringify(conv)}, ${JSON.stringify(text)})`)
const status = () => ev(`document.querySelector('.header .status')?.textContent ?? ''`)
const idle = () => waitFor(async () => (await status()) === 'pronto', 10000)
const pickView = (label) =>
  ev(
    `[...document.querySelectorAll('.pane .view-toggle button')].find(b => b.textContent.includes(${JSON.stringify(label)})).click()`
  )
const card = () =>
  ev(`document.querySelector('.terminal-cards .permission-pending')?.innerText ?? null`)

console.log('== Para o terminal')
await pickView('Terminal')
const banner = await shows(/Claude Code de mentira \(terminal\)/)
check('T1 o Claude Code abre no terminal da aba', !!banner, await screen())
const first = starts()[0]
check(
  'T2 interativo, com o modo da conversa, uma sessão nova, os hooks e a linha de status do Wisp',
  first &&
    !first.args.includes('-p') &&
    first.args.includes('--permission-mode') &&
    first.args[first.args.indexOf('--permission-mode') + 1] === 'default' &&
    first.args.includes('--session-id') &&
    !first.args.some((a) => a.startsWith('--permission-prompt-tool')) &&
    ['UserPromptSubmit', 'PermissionRequest', 'Stop', 'PreToolUse'].every((h) =>
      first.hooks.includes(h)
    ) &&
    / --status [a-f0-9]{32}$/.test(first.status ?? '') &&
    first.term === 'xterm-256color',
  JSON.stringify(first)
)
const line = await shows(/Wisp · claude-sonnet-5-5 · contexto 2%/)
check('T3 a linha de status do Wisp aparece no terminal', !!line, await screen())

console.log('== Conversar pelo terminal')
await type('oi\r')
await shows(/Oi do terminal!/)
await idle()
const tabTitle = await ev(`document.querySelector('.tab.active .tab-title')?.textContent`)
check('T4 a resposta aparece, e a aba ganha o título', tabTitle === 'oi', tabTitle)
const pill = await waitFor(
  () =>
    ev(
      `(() => { const t = document.querySelector('.pane .context-pill')?.innerText; return t && t !== '2%' ? t : null })()`
    ),
  5000
)
check('T5 a pílula do contexto acompanha a linha de status', pill === '17%', pill)

console.log('== O card do Wisp por cima do terminal')
await type('roda [pede ls -la]\r')
let text = await waitFor(card, 8000)
check('T6 o card aparece por cima do terminal', /ls -la/.test(text ?? ''), text)
check('T7 o diálogo do terminal aparece junto', /Do you want to proceed/.test(await screen()))
await sleep(800)
await ev(
  `[...document.querySelectorAll('.terminal-cards .permission-pending button')].find(b => b.textContent.trim() === 'Permitir').click()`
)
await shows(/Rodei ls -la\./)
check(
  'T8 permitido pelo card: o hook decide',
  tuiLog().some((e) => e.decision === 'allow' && e.by === 'hook' && e.command === 'ls -la')
)
await idle()
await type('apaga [pede rm velho.txt]\r')
await waitFor(card, 8000)
await type('3')
await shows(/Não rodei rm velho\.txt\./)
const gone = await waitFor(async () => ((await card()) === null ? 'sumiu' : null), 5000)
check(
  'T9 respondido no terminal: o card some',
  gone === 'sumiu' && tuiLog().some((e) => e.decision === 'deny' && e.by === 'keys'),
  JSON.stringify(tuiLog().filter((e) => e.decision)) + ' | card: ' + (await card())
)
await idle()

console.log('== O --ask, uma mensagem no meio e o Esc')
wisp(home, '--ask', 'pelo comando wisp')
await shows(/pelo comando wisp[\s\S]*Oi do terminal!/)
check('T10 o --ask entra colado no terminal e é enviado', true)
await idle()
await type('conta [lento]\r')
await waitFor(async () => (await status()) !== 'pronto', 5000)
await sleep(300)
await type('no meio\r')
const middle = await shows(/também:\s*no\s*meio/, 15000)
check('T11 uma mensagem no meio entra na resposta', !!middle)
await idle()
await type('de novo [lento]\r')
await waitFor(async () => (await status()) !== 'pronto', 5000)
await sleep(400)
await ev(`document.querySelector('.pane .composer .stop')?.click()`)
await shows(/Interrupted by user/)
const stopped = await waitFor(async () => ((await status()) === 'pronto' ? 'pronto' : null), 5000)
check('T12 o Parar (o Esc) interrompe, e o painel percebe sem hook', stopped === 'pronto')

console.log('== Trocar o modelo e o modo recomeça na mesma sessão')
const before = starts().length
const session = first.args[first.args.indexOf('--session-id') + 1]
await ev(`window.wisp.chat.setModel(${JSON.stringify(conv)}, 'opus')`)
await waitFor(() => starts().length > before, 10000)
const restarted = starts().at(-1)
check(
  'T13 o modelo novo, retomando a mesma sessão',
  restarted.args.includes('--model=opus') &&
    restarted.args[restarted.args.indexOf('--resume') + 1] === session,
  JSON.stringify(restarted.args)
)
await shows(/Claude Code de mentira \(terminal\) · claude-opus-5-5/)
await ev(`window.wisp.chat.setMode(${JSON.stringify(conv)}, 'acceptEdits')`)
await waitFor(() => starts().length > before + 1, 10000)
const mode = starts().at(-1)
check(
  'T14 o modo novo também',
  mode.args[mode.args.indexOf('--permission-mode') + 1] === 'acceptEdits',
  JSON.stringify(mode.args)
)
await shows(/modo acceptEdits/)

console.log('== Esc no terminal não fecha o painel')
await ev(`document.querySelector('.terminal-view textarea')?.focus()`)
for (const kind of ['keyDown', 'keyUp'])
  await chat.send('Input.dispatchKeyEvent', {
    type: kind,
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27
  })
await sleep(500)
check(
  'T15 o Esc vai para o Claude Code, e o painel fica',
  await ev(`document.hasFocus() || document.visibilityState === 'visible'`)
)

console.log('== De volta ao chat')
await pickView('Chat')
const transcript = await waitFor(
  () =>
    ev(
      `(() => { const t = document.querySelector('.pane .messages')?.innerText ?? ''; return /Rodei ls -la/.test(t) ? t : null })()`
    ),
  8000
)
check(
  'T16 a conversa do terminal está no chat: as mensagens, o comando e as respostas',
  /oi/.test(transcript ?? '') &&
    /Oi do terminal!/.test(transcript ?? '') &&
    /ls -la/.test(transcript ?? '') &&
    /Você parou a resposta/.test(transcript ?? ''),
  transcript
)
check(
  'T17 o terminal saiu',
  await waitFor(() => ev(`!document.querySelector('.terminal-view')`), 5000)
)
await pickView('Terminal')
await shows(/Claude Code de mentira/)

console.log('== Fechar e abrir o Wisp')
await stopApp()
const mascot = await startApp(home)
wisp(home, '--show')
chat = await connect('/chat/')
ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const back = await waitFor(
  () => ev(`document.querySelector('.pane .view-toggle .active')?.textContent ?? null`),
  8000
)
check('T18 a aba volta no modo terminal', back === 'Terminal', back)
await shows(/Claude Code de mentira/)
const resumed = starts().at(-1)
check(
  'T19 e retoma a mesma sessão',
  resumed.args[resumed.args.indexOf('--resume') + 1] === session,
  JSON.stringify(resumed.args)
)
check(
  'T20 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
