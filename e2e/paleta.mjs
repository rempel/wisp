// Tudo a um atalho (Fase 32), de ponta a ponta, só pelo teclado: o Ctrl+P abre a paleta; uma
// conversa antiga achada sem o acento abre; um prompt salvo vai preenchido para a caixa e é
// mandado com o Enter; o modo troca; o Esc fecha só a paleta; uma frase dita numa conversa acha a
// conversa; e, com o painel escondido, o atalho global (o Ctrl+Alt+P de verdade, pelo xdotool) e
// o `wisp --palette` abrem o painel já na paleta.
// Uso: node e2e/paleta.mjs (veja e2e/run.sh); precisa do xdotool.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome({
  prompts: [{ name: 'resumo', text: 'Resuma o que vimos em três tópicos.' }]
})
const dir = join(home.home, '.local/share/wisp/conversas')
mkdirSync(dir, { recursive: true, mode: 0o700 })
const OLD = '44444444-4444-4444-8444-444444444444'
const DEEP = '55555555-5555-4555-8555-555555555555'
/** Grava uma conversa como o Wisp grava: o cabeçalho e os turnos. */
function save(id, title, turns, daysAgo) {
  const at = Date.now() - daysAgo * 86_400_000
  const lines = [{ type: 'conversa', v: 1, id, createdAt: at, title }]
  turns.forEach(([user, reply], index) => {
    lines.push({ type: 'user', text: user, attachments: [] })
    lines.push({ type: 'text', blockId: `${id.slice(0, 3)}-b${index}`, delta: reply })
    lines.push({ type: 'turn-end', outcome: 'done' })
  })
  writeFileSync(
    join(dir, `${id}.jsonl`),
    lines.map((line) => JSON.stringify(line)).join('\n') + '\n',
    { mode: 0o600 }
  )
}
save(OLD, 'Tubarões-martelo enxergam em 360°', [['Como o tubarão enxerga?', 'Quase em 360°.']], 9)
save(DEEP, 'Receita de bolo', [['Bolo de fubá?', 'Leva erva-doce e um tantinho de canela.']], 3)

const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
await sleep(500)

const key = async (k, code, vk, modifiers = 0) => {
  for (const type of ['keyDown', 'keyUp'])
    await chat.send('Input.dispatchKeyEvent', {
      type,
      key: k,
      code,
      windowsVirtualKeyCode: vk,
      modifiers
    })
  await sleep(120)
}
const CTRL = 2
const type = async (text) => {
  await chat.send('Input.insertText', { text })
  await sleep(250)
}
const paletteOpen = () => ev(`!!document.querySelector('.palette')`)
const items = () =>
  ev(
    `[...document.querySelectorAll('.palette-item')].map(e => ({ id: e.dataset.item, text: e.innerText.replace(/\\n+/g, ' | '), selected: e.classList.contains('selected') }))`
  )
const openPalette = async () => {
  await key('p', 'KeyP', 80, CTRL)
  return waitFor(() => paletteOpen(), 3000)
}

console.log('== Abrir uma conversa antiga')
check(
  'P1 o Ctrl+P abre a paleta, com o foco na busca',
  (await openPalette()) === true &&
    (await ev(`document.activeElement?.classList.contains('palette-input')`)) === true
)
const idle = await items()
check(
  'P2 sem busca: as ações, o prompt salvo e as conversas recentes',
  idle.some((i) => i.id === 'new') &&
    idle.some((i) => i.id === 'prompt-resumo') &&
    idle.some((i) => i.id === `conversation-${OLD}`) &&
    !idle.some((i) => i.id.startsWith('folder-')),
  JSON.stringify(idle.map((i) => i.id))
)
await type('tubaroes')
const found = await waitFor(async () => {
  const list = await items()
  return list[0]?.id === `conversation-${OLD}` ? list : null
}, 3000)
check(
  'P3 "tubaroes" (sem acento) acha a conversa, já escolhida',
  found?.[0]?.selected === true,
  JSON.stringify(found)
)
await key('Enter', 'Enter', 13)
const opened = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.tab-title')].some(e => e.textContent.includes('Tubarões')) && !document.querySelector('.palette')`
    ),
  5000
)
check('P4 o Enter abre a conversa numa aba e fecha a paleta', opened === true)

console.log('== Rodar um prompt salvo')
await openPalette()
await type('resumo')
await waitFor(async () => (await items())[0]?.id === 'prompt-resumo', 3000)
await key('Enter', 'Enter', 13)
const draft = await waitFor(async () => {
  const value = await ev(`document.activeElement?.value ?? ''`)
  return value.startsWith('Resuma') ? value : null
}, 3000)
check(
  'P5 o prompt vai preenchido para a caixa, com o foco nela',
  draft === 'Resuma o que vimos em três tópicos.',
  draft
)
const sentBefore = await ev(`document.querySelectorAll('.pane.focused .msg.user').length`)
await key('Enter', 'Enter', 13)
const sent = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane .msg.user')].some(e => e.innerText.includes('Resuma o que vimos'))`
    ),
  5000
)
check('P6 e o Enter manda', sent === true, String(sentBefore))

console.log('== Trocar o modo')
await openPalette()
await type('modo plan')
await waitFor(async () => (await items())[0]?.id === 'mode-plan', 3000)
await key('Enter', 'Enter', 13)
const mode = await waitFor(
  () => ev(`document.querySelector('.pane .mode-pill.mode-plan')?.innerText ?? null`),
  5000
)
check('P7 "modo plan" passa a conversa para Planejar', /Planejar/.test(mode ?? ''), mode)
await openPalette()
const marked = await items()
check(
  'P8 na paleta, o modo de agora aparece marcado',
  /^Modo: Planejar\s*agora \|/.test(marked.find((i) => i.id === 'mode-plan')?.text ?? ''),
  JSON.stringify(marked.find((i) => i.id === 'mode-plan'))
)

console.log('== Esc e a busca no que foi dito')
await type('erva-doce')
const deep = await waitFor(async () => {
  const list = await items()
  return list.find((i) => i.id === `found-${DEEP}`) ?? null
}, 5000)
check(
  'P9 uma frase dita numa conversa acha a conversa, com o trecho',
  /Receita de bolo \| .*erva-doce/.test(deep?.text ?? ''),
  JSON.stringify(deep)
)
await key('Escape', 'Escape', 27)
check(
  'P10 o Esc fecha só a paleta: o painel continua aberto',
  (await paletteOpen()) === false &&
    (await ev(`document.visibilityState`)) === 'visible' &&
    (await ev(`!!document.querySelector('.pane .composer')`)) === true
)

console.log('== De fora do painel')
await ev(`window.wisp.chat.hide()`)
await waitFor(() => ev(`document.visibilityState === 'hidden'`), 5000)
await sleep(300)
execFileSync('xdotool', ['key', 'ctrl+alt+p'])
const global = await waitFor(
  () => ev(`document.visibilityState === 'visible' && !!document.querySelector('.palette')`),
  5000
)
check('P11 o atalho global (Ctrl+Alt+P) abre o painel já na paleta', global === true)
await key('Escape', 'Escape', 27)
await ev(`window.wisp.chat.hide()`)
await waitFor(() => ev(`document.visibilityState === 'hidden'`), 5000)
wisp(home, '--palette')
const command = await waitFor(
  () => ev(`document.visibilityState === 'visible' && !!document.querySelector('.palette')`),
  5000
)
check('P12 o `wisp --palette` também', command === true)
const launcher = readFileSync(join(home.home, '.local/share/wisp/bin/wisp'), 'utf8')
check('P13 o comando wisp ensina o --palette', launcher.includes('wisp --palette'))
check(
  'P14 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
