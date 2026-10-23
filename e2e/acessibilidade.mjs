// Acessibilidade e aparência (Fase 22), de ponta a ponta. A árvore de acessibilidade do Chromium
// (a que o leitor de tela lê) sem controles sem nome no chat, nas configurações e no histórico;
// o fluxo só com o teclado (o pedido anunciado, Alt+P vai para o card, Enter permite e a
// resposta é anunciada); o tamanho do painel (Ctrl+mais, Ctrl+0); o tema claro e escuro; o alto
// contraste; e o reduzir animações, no painel e no mascote.
// Uso: node e2e/acessibilidade.mjs (veja e2e/run.sh).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const configFile = join(home.home, '.config/wisp/config.json')
const config = () => JSON.parse(readFileSync(configFile, 'utf8'))

const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)

const key = async (k, code, vk, modifiers = 0, text) => {
  for (const type of ['keyDown', 'keyUp'])
    await chat.send('Input.dispatchKeyEvent', {
      type,
      key: k,
      code,
      windowsVirtualKeyCode: vk,
      modifiers,
      ...(type === 'keyDown' && text ? { text } : {})
    })
  await sleep(150)
}
const busy = () =>
  ev(`document.querySelector('.header .status')?.classList.contains('busy') ?? false`)
const announced = () => ev(`document.querySelector('.pane [data-announce]')?.textContent ?? ''`)

/** Os controles que o leitor de tela lê sem nome (um botão só com ícone e sem rótulo, por exemplo). */
const ROLES = new Set([
  'button',
  'textbox',
  'searchbox',
  'combobox',
  'switch',
  'checkbox',
  'radio',
  'link',
  'slider',
  'spinbutton',
  'menuitem',
  'tab'
])
const unnamed = async () => {
  await chat.send('Accessibility.enable')
  const { nodes } = await chat.send('Accessibility.getFullAXTree')
  return nodes
    .filter((node) => !node.ignored && ROLES.has(node.role?.value))
    .filter((node) => !String(node.name?.value ?? '').trim())
    .map((node) => `${node.role.value}#${node.backendDOMNodeId}`)
}
const describeNodes = async (list) => {
  const out = []
  for (const item of list) {
    const backendNodeId = Number(item.split('#')[1])
    const { object } = await chat.send('DOM.resolveNode', { backendNodeId })
    const html = await chat.send('Runtime.callFunctionOn', {
      objectId: object?.objectId,
      functionDeclaration: 'function () { return this.outerHTML.slice(0, 160) }',
      returnByValue: true
    })
    out.push(html.result?.value)
  }
  return out.join('\n')
}

console.log('== A árvore de acessibilidade')
await chat.send('DOM.enable')
let missing = await unnamed()
check('A1 no chat, todo controle tem nome', missing.length === 0, await describeNodes(missing))
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
await waitFor(() => ev(`!!document.querySelector('.settings-section')`), 5000)
missing = await unnamed()
check(
  'A2 nas configurações, todo controle tem nome',
  missing.length === 0,
  await describeNodes(missing)
)
const sections = await ev(
  `[...document.querySelectorAll('.settings-section h2')].map(h => h.textContent)`
)
check(
  'A3 a seção Aparência e acessibilidade',
  sections.includes('Aparência e acessibilidade') &&
    (await ev(
      `(() => { const s = [...document.querySelectorAll('.settings-section')].find(s => s.querySelector('h2').textContent === 'Aparência e acessibilidade'); return !!s && /Tema/.test(s.innerText) && /Alto contraste/.test(s.innerText) && /Reduzir animações/.test(s.innerText) && /100%/.test(s.innerText) })()`
    )),
  JSON.stringify(sections)
)
await ev(
  `document.querySelector('.header .icon-button[aria-label="Conversas anteriores"]')?.click()`
)
await sleep(500)
missing = await unnamed()
check('A4 no histórico, todo controle tem nome', missing.length === 0, await describeNodes(missing))
await key('Escape', 'Escape', 27)
await waitFor(() => ev(`!!document.querySelector('.pane .composer textarea')`), 3000)

console.log('== Só com o teclado')
await ev(`document.querySelector('.pane .composer textarea').focus()`)
await chat.send('Input.insertText', { text: 'roda os testes [pede npm test]' })
await key('Enter', 'Enter', 13)
const asked = await waitFor(async () => {
  const text = await announced()
  return /O Claude pede/.test(text) ? text : null
}, 10000)
check(
  'A5 o pedido é anunciado, com o atalho',
  /O Claude pede: Rodar um comando no terminal\. Alt\+P vai para o card\./.test(asked ?? ''),
  asked ?? (await announced())
)
check(
  'A6 o card é um grupo com nome',
  (await ev(
    `document.querySelector('.permission-pending')?.getAttribute('role') + '|' + document.querySelector('.permission-pending')?.getAttribute('aria-label')`
  )) === 'group|Pedido: Rodar um comando no terminal'
)
await sleep(700)
await key('p', 'KeyP', 80, 1)
const focusedButton = await ev(
  `(() => { const a = document.activeElement; return a?.closest('.permission-pending') ? a.textContent + '|' + getComputedStyle(a).outlineStyle : null })()`
)
check(
  'A7 Alt+P põe o foco no Permitir, com o anel de foco à vista',
  /^Permitir\|(solid|auto)$/.test(focusedButton ?? ''),
  focusedButton
)
await key('Enter', 'Enter', 13, 0, '\r')
const replied = await waitFor(async () => {
  if (await busy()) return null
  const text = await announced()
  return /Resposta pronta/.test(text) ? text : null
}, 10000)
check(
  'A8 Enter permite, e a resposta é anunciada',
  !!replied &&
    (await ev(`document.querySelector('.permission-allow')?.innerText ?? ''`)).includes(
      'Permitido'
    ),
  replied ?? (await announced())
)
check(
  'A9 o leitor de tela sabe quem falou',
  (await ev(`document.querySelector('.pane .user-turn .sr-only')?.textContent`)) === 'Você:' &&
    (await ev(`document.querySelector('.pane .messages')?.getAttribute('role')`)) === 'log'
)
await key('p', 'KeyP', 80, 1)
check(
  'A10 sem pedido esperando, o Alt+P avisa',
  await waitFor(async () => /Nenhum pedido/.test(await announced()), 3000)
)
// Com mensagens, cards e ferramentas na tela, e nas outras telas.
await ev(`document.querySelector('.pane .composer textarea').focus()`)
await chat.send('Input.insertText', { text: 'arruma [edit]' })
await key('Enter', 'Enter', 13)
await waitFor(async () => !(await busy()), 10000)
missing = await unnamed()
check(
  'A11 na conversa com cards, todo controle tem nome',
  missing.length === 0,
  await describeNodes(missing)
)
await ev(
  `document.querySelector('.header .icon-button[aria-label="Sessões do terminal"]')?.click()`
)
await sleep(500)
missing = await unnamed()
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
await waitFor(
  () =>
    ev(
      `(() => { const b = [...document.querySelectorAll('.diag-links button')].find(b => b.textContent === 'Diagnóstico'); if (!b) return false; b.click(); return true })()`
    ),
  5000
)
await waitFor(() => ev(`!!document.querySelector('.diag-item')`), 10000)
missing.push(...(await unnamed()))
check(
  'A12 nas sessões e no diagnóstico, todo controle tem nome',
  missing.length === 0,
  await describeNodes(missing)
)
await key('Escape', 'Escape', 27)

console.log('== O tamanho do painel')
const ratio = () => ev(`window.devicePixelRatio`)
const before = await ratio()
await key('=', 'Equal', 187, 2)
await waitFor(async () => (await ratio()) > before + 0.05, 3000)
check(
  'A13 Ctrl+mais aumenta o painel, e fica no config.json',
  config().panelZoom === 1.1 && Math.abs((await ratio()) / before - 1.1) < 0.02,
  JSON.stringify({ zoom: config().panelZoom, ratio: await ratio(), before })
)
await key('0', 'Digit0', 48, 2)
await waitFor(async () => Math.abs((await ratio()) - before) < 0.01, 3000)
check(
  'A14 Ctrl+0 volta ao normal',
  config().panelZoom === 1 && Math.abs((await ratio()) - before) < 0.01
)

console.log('== Tema, contraste e animações')
const setSettings = (patch) => ev(`window.wisp.settings.set(${JSON.stringify(patch)})`)
const dark = () => ev(`matchMedia('(prefers-color-scheme: dark)').matches`)
const background = () => ev(`getComputedStyle(document.body).backgroundColor`)
await setSettings({ theme: 'dark' })
await waitFor(dark, 3000)
const darkBg = await background()
await setSettings({ theme: 'light' })
await waitFor(async () => !(await dark()), 3000)
const lightBg = await background()
check(
  'A15 o tema escuro e o claro, pelas configurações',
  config().theme === 'light' && darkBg !== lightBg && !(await dark()),
  JSON.stringify({ darkBg, lightBg })
)
await setSettings({ highContrast: true })
await waitFor(() => ev(`document.documentElement.classList.contains('contrast')`), 3000)
check(
  'A16 o alto contraste: texto preto puro no tema claro',
  (await ev(`getComputedStyle(document.documentElement).getPropertyValue('--text').trim()`)) ===
    '#000000'
)
await setSettings({ highContrast: false, reduceMotion: true })
await waitFor(() => ev(`document.documentElement.classList.contains('reduce-motion')`), 3000)
const motionOk = await waitFor(
  () =>
    mascot.evaluate(
      `document.documentElement.classList.contains('reduce-motion') && getComputedStyle(document.querySelector('.float')).animationName === 'none'`
    ),
  3000
)
check(
  'A17 reduzir animações vale no painel e no mascote',
  !(await ev(`document.documentElement.classList.contains('contrast')`)) && motionOk === true
)
await setSettings({ reduceMotion: false, theme: 'system' })
await waitFor(
  () =>
    mascot.evaluate(
      `!document.documentElement.classList.contains('reduce-motion') && getComputedStyle(document.querySelector('.float')).animationName !== 'none'`
    ),
  3000
)
check(
  'A18 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
