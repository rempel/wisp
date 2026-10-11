// O modo demonstração e a tela de configurações, de ponta a ponta: sem o Claude Code instalado, o
// aviso aponta a demonstração; ligada pela tela de configurações, as gravações (resources/demo)
// respondem, com os cards de permissão e o diff, e nada vai para o histórico. A tela grava no
// config.json e recusa um valor errado, com o motivo. Uso: node e2e/demo.mjs (veja e2e/run.sh).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome({ claudePath: '/nao/existe/claude' })
const config = () => JSON.parse(readFileSync(join(home.home, '.config/wisp/config.json'), 'utf8'))

const mascot = await startApp(home)
mascot.close()
await sleep(1500)
wisp(home, '--show')
const chat = await connect('/chat/')
await waitFor(() => chat.evaluate(`!!document.querySelector('.pane .composer')`), 15000)
const ev = (expression) => chat.evaluate(expression)
const key = async (k, code, vk, modifiers = 0) => {
  for (const type of ['keyDown', 'keyUp']) {
    await chat.send('Input.dispatchKeyEvent', {
      type,
      key: k,
      code,
      windowsVirtualKeyCode: vk,
      modifiers
    })
  }
  await sleep(200)
}
async function ask(text) {
  await ev(`document.querySelector('.pane .composer textarea').focus()`)
  await chat.send('Input.insertText', { text })
  await key('Enter', 'Enter', 13)
}
const pane = () =>
  ev(`JSON.stringify({
    notices: [...document.querySelectorAll('.pane .notice')].map(e => e.innerText),
    answers: [...document.querySelectorAll('.pane .msg.assistant')].map(e => e.innerText),
    users: [...document.querySelectorAll('.pane .msg.user')].map(e => e.innerText),
    tools: [...document.querySelectorAll('.pane .tool')].map(e => e.innerText.replace(/\\n+/g, ' ')),
    cards: [...document.querySelectorAll('.pane .permission')].map(e => ({ cls: e.className, text: e.innerText.replace(/\\n+/g, ' / ') })),
    prompts: [...document.querySelectorAll('.demo-prompt')].map(e => e.textContent),
    pill: document.querySelector('.demo-pill')?.textContent ?? null,
    busy: document.querySelector('.status')?.classList.contains('busy') ?? false
  })`).then(JSON.parse)
const idle = () => waitFor(async () => !(await pane()).busy, 15000)
const pendingCard = () =>
  waitFor(async () => (await pane()).cards.find((card) => /pending/.test(card.cls)), 8000)
async function clickCard(label) {
  await sleep(700) // os botões do card só valem depois de 600 ms
  return ev(
    `(() => { const b = [...document.querySelectorAll('.pane .permission-pending button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true })()`
  )
}
const clickSwitch = (label) =>
  ev(
    `(() => { const b = [...document.querySelectorAll('.switch')].find(b => b.querySelector('.settings-label')?.textContent === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true })()`
  )

console.log('== Sem o Claude Code: o aviso aponta a demonstração')
await ask('oi')
await idle()
let p = await pane()
check(
  'D1 o aviso de instalar fala do modo demonstração',
  p.notices.some((n) => /Não encontrei o Claude Code/.test(n) && /Modo demonstração/.test(n)),
  JSON.stringify(p.notices)
)

console.log('== A tela de configurações')
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
await waitFor(() => ev(`!!document.querySelector('.settings-section')`), 5000)
const sections = await ev(
  `[...document.querySelectorAll('.settings-section h2')].map(e => e.textContent)`
)
check(
  'S1 as seções',
  JSON.stringify(sections) ===
    JSON.stringify(['Conversas', 'Mascote e sons', 'Atalhos e sistema', 'Voz', 'Avançado']),
  JSON.stringify(sections)
)
check(
  'S2 o título no cabeçalho',
  (await ev(`document.querySelector('.header .title strong').textContent`)) === 'Configurações'
)
const files = await ev(
  `[...document.querySelectorAll('.settings-file code')].map(e => e.textContent)`
)
check(
  'S2b os caminhos do config.json e do registro',
  JSON.stringify(files) ===
    JSON.stringify(['~/.config/wisp/config.json', '~/.local/state/wisp/wisp.log']),
  JSON.stringify(files)
)
// Um campo de texto: grava ao sair dele.
await ev(
  `(() => { const row = [...document.querySelectorAll('.settings-row')].find(r => r.querySelector('.settings-label')?.textContent === 'Editor'); const input = row.querySelector('input'); input.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, 'codium -n'); input.dispatchEvent(new Event('input', { bubbles: true })); input.blur() })()`
)
await waitFor(() => config().editorCommand === 'codium -n', 4000)
check(
  'S3 o editor vai para o config.json',
  config().editorCommand === 'codium -n',
  JSON.stringify(config().editorCommand)
)
check(
  'S4 e aparece "Salvo"',
  await waitFor(
    () => ev(`document.querySelector('.settings-saved.show')?.textContent === 'Salvo'`),
    3000
  )
)
// Um valor errado: recusado, com o motivo, e o arquivo fica como estava.
await ev(
  `(() => { const row = [...document.querySelectorAll('.settings-row')].find(r => r.querySelector('.settings-label')?.textContent === 'Editor'); const input = row.querySelector('input'); input.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, '   '); input.dispatchEvent(new Event('input', { bubbles: true })); input.blur() })()`
)
const error = await waitFor(
  () => ev(`document.querySelector('.settings-row.invalid .settings-error')?.textContent`),
  4000
)
check(
  'S5 editor vazio: recusado, com o motivo em português',
  /Diga o comando do editor/.test(error ?? ''),
  error
)
check('S6 e o config.json não muda', config().editorCommand === 'codium -n')
// Um liga/desliga (a casa de teste começa com os sons desligados).
await clickSwitch('Sons')
await waitFor(() => config().sound === true, 4000)
check('S7 Sons ligado na tela vai para o arquivo', config().sound === true)
check(
  'S8 e a chave mostra ligado',
  await waitFor(
    () =>
      ev(
        `[...document.querySelectorAll('.switch')].find(b => b.querySelector('.settings-label')?.textContent === 'Sons')?.getAttribute('aria-checked') === 'true'`
      ),
    3000
  )
)

console.log('== Liga a demonstração pela tela')
// O "oi" de antes (sem o Claude Code) já está no histórico; a demonstração não acrescenta nada.
const historyBefore = await ev(`window.wisp.history.list().then(list => list.length)`)
check('M1 a chave da demonstração', await clickSwitch('Modo demonstração'))
await waitFor(() => config().demo === true, 4000)
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 4000)
p = await waitFor(async () => {
  const value = await pane()
  return value.pill ? value : null
}, 4000)
check('M2 a pílula "Demo" no cabeçalho', p?.pill === 'Demo', JSON.stringify(p))
check(
  'M3 a conversa recomeçou, com o aviso',
  p?.users.length === 0 && p.notices.some((n) => /Modo demonstração ligado/.test(n)),
  JSON.stringify(p?.notices)
)
check(
  'M4 o painel vazio sugere o que pedir',
  p?.prompts.length === 5 && p.prompts.includes('Abre o Firefox'),
  JSON.stringify(p?.prompts)
)

console.log('== As gravações respondem')
await ev(
  `[...document.querySelectorAll('.demo-prompt')].find(b => b.textContent === 'Abre o Firefox').click()`
)
let card = await pendingCard()
check(
  'G1 "Abre o Firefox": o card de abrir um app, com o firefox',
  /Abrir um app/.test(card?.text) && /firefox/.test(card?.text),
  JSON.stringify(card)
)
check('G2 Permitir', await clickCard('Permitir'))
await idle()
p = await pane()
check(
  'G3 a resposta gravada diz que nada foi aberto',
  p.answers.some((a) => /nada foi aberto/.test(a)),
  JSON.stringify(p.answers)
)
await ask('arruma o bug do contador')
card = await pendingCard()
check(
  'G4 a edição pede, com o diff no card',
  /contador\.ts/.test(card?.text) && /i = 0/.test(card?.text),
  JSON.stringify(card)
)
await clickCard('Negar')
await idle()
p = await pane()
check(
  'G5 negada: a resposta gravada do "não"',
  p.answers.some((a) => /não mexo no arquivo/.test(a)),
  JSON.stringify(p.answers.slice(-1))
)
await ask('arruma o bug do contador')
await pendingCard()
await clickCard('Permitir')
await idle()
p = await pane()
check(
  'G6 permitida: o card da edição com +1 −1',
  p.tools.some((t) => /Edit/.test(t) && /\+1/.test(t) && /−1|-1/.test(t)),
  JSON.stringify(p.tools)
)
await ask('pesquisa a previsão do tempo')
await idle()
check(
  'G7 a pesquisa com a tabela formatada',
  await ev(`!!document.querySelector('.pane .msg.assistant table')`)
)
const history = await ev(`window.wisp.history.list().then(list => list.length)`)
check(
  'G8 nada da demonstração vai para o histórico',
  history === historyBefore,
  `${historyBefore} → ${history}`
)

console.log('== Desliga pela pílula')
await ev(`document.querySelector('.demo-pill').click()`)
await waitFor(() => config().demo === false, 4000)
p = await waitFor(async () => {
  const value = await pane()
  return value.pill === null && value.notices.some((n) => /Modo demonstração desligado/.test(n))
    ? value
    : null
}, 4000)
p ??= await pane()
check(
  'O1 a pílula some e o aviso diz que desligou',
  !!p && p.notices.some((n) => /Modo demonstração desligado/.test(n)),
  JSON.stringify(p?.notices)
)
check('O2 sem erros no painel', chat.logs.length === 0, chat.logs.join('\n'))

console.log('== O registro em arquivo')
const logText = readFileSync(join(home.home, '.local/state/wisp/wisp.log'), 'utf8')
check(
  'L1 a primeira linha diz qual Wisp é',
  /INFO {2}--- Wisp [\d.]+ \(dev\), Electron/.test(logText.split('\n')[0]),
  logText.split('\n')[0]
)
check(
  'L2 o que foi para o terminal está lá, com ~ no lugar da pasta pessoal',
  logText.includes('[wisp] config: ~/.config/wisp/config.json')
)
check(
  'L3 sem URLs nem a pasta pessoal',
  !/\b(?:https?|wss?):\/\//.test(logText) && !logText.includes(home.home),
  logText.slice(0, 2000)
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
