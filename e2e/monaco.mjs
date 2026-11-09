// O editor do VS Code no painel (Fase 34): o painel abre sem o Monaco; o diff de uma edição abre
// nele, com o realce da linguagem, os números das linhas do arquivo e o lado a lado; o arquivo
// mudado abre no visualizador, só para ler, na linha da mudança; o Esc fecha; o painel não mostra
// um arquivo de segredos nem um binário.
// Uso: node e2e/monaco.mjs (veja e2e/run.sh).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
// Os prints (WISP_E2E_SHOTS): o diff em linha e lado a lado, e o arquivo aberto.
const SHOTS = process.env.WISP_E2E_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const shoot = async (page, name) => {
  if (!SHOTS) return
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
  if (data) writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'))
}
// O arquivo que o Claude de mentira edita: as linhas 10 a 12 são as do trecho do diff.
const project = join(home.home, 'projeto/src')
mkdirSync(project, { recursive: true })
const file = join(project, 'app.ts')
const lines = Array.from({ length: 20 }, (_, i) => `// linha ${i + 1}`)
lines.splice(9, 3, 'const a = 1', 'const b = 2', 'const d = 5')
writeFileSync(file, lines.join('\n') + '\n')
mkdirSync(join(home.home, '.ssh'), { recursive: true })
writeFileSync(join(home.home, '.ssh/id_ed25519'), 'CHAVE SECRETA')
writeFileSync(join(home.home, 'foto.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))

const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 20000)
const conversation = await ev(`document.querySelector('.pane').dataset.conversation`)
// O Vite põe o CSS do pedaço do Monaco na página quando ele carrega (o Chromium não registra os
// arquivos locais no performance).
const monacoLoaded = () =>
  ev(
    `[...document.querySelectorAll('link[href]')].some((link) => /\\/monaco-[^/]*\\.css/.test(link.href))`
  )

console.log('== O painel abre sem o Monaco')
check(
  'M1 o painel abre sem carregar o Monaco',
  (await monacoLoaded()) === false && (await ev(`!document.querySelector('.monaco-editor')`))
)

console.log('== O diff de uma edição')
await ev(
  `window.wisp.chat.send(${JSON.stringify(conversation)}, ${JSON.stringify(`muda [edit ${file}]`)}, [])`
)
await waitFor(() => ev(`!!document.querySelector('.pane .tool.tool-done .diff-count')`), 15000)
await ev(`document.querySelector('.pane .tool.tool-done .tool-head').click()`)
const ready = await waitFor(
  () => ev(`!!document.querySelector('.pane .code-diff.ready .monaco-diff-editor .view-line')`),
  15000
)
check('M2 o diff abre no Monaco, que carrega só agora', !!ready && (await monacoLoaded()))
await sleep(800)
const numbers = await ev(
  `[...document.querySelectorAll('.pane .code-diff .editor.modified .line-numbers')].map((n) => n.textContent.trim()).filter(Boolean)`
)
check(
  'M3 os números são os das linhas do arquivo',
  ['10', '11', '12', '13'].every((n) => numbers?.includes(n)),
  JSON.stringify(numbers)
)
// O realce: "const" e o nome não têm a mesma cor (classes de token diferentes).
const tokens = await ev(
  `[...new Set([...document.querySelectorAll('.pane .code-diff .editor.modified .view-line span span')].map((s) => s.className))]`
)
check('M4 com o realce do TypeScript', (tokens?.length ?? 0) >= 3, JSON.stringify(tokens))
check(
  'M5 o que entrou e o que saiu, marcados',
  await ev(
    `!!document.querySelector('.pane .code-diff .line-insert, .pane .code-diff .char-insert') && !!document.querySelector('.pane .code-diff .line-delete, .pane .code-diff .char-delete, .pane .code-diff .inline-deleted-margin-view-zone')`
  )
)
const background = await ev(
  `getComputedStyle(document.querySelector('.pane .code-diff .editor.modified .monaco-editor-background')).backgroundColor`
)
await shoot(chat, 'diff-em-linha')
check(
  'M6 no tema do Wisp (o fundo do código do painel)',
  background === 'rgb(236, 239, 241)',
  background
)
// O tema escuro das configurações: o Monaco acompanha, sem reabrir o diff.
await ev(`window.wisp.settings.set({ theme: 'dark' })`)
const darkBackground = await waitFor(async () => {
  const value = await ev(
    `getComputedStyle(document.querySelector('.pane .code-diff .editor.modified .monaco-editor-background')).backgroundColor`
  )
  return value === 'rgb(11, 13, 14)' ? value : null
}, 5000)
await shoot(chat, 'diff-escuro')
await ev(`window.wisp.settings.set({ theme: 'system' })`)
check('M6b no tema escuro, o Monaco acompanha', !!darkBackground)
// No painel estreito, o diff fica em linha (sem a escolha); largo, aparece o lado a lado.
const narrowToggle = await ev(`!!document.querySelector('.pane .code-diff-toggle')`)
await chat.send('Emulation.setDeviceMetricsOverride', {
  width: 1100,
  height: 700,
  deviceScaleFactor: 1,
  mobile: false
})
await waitFor(() => ev(`!!document.querySelector('.pane .code-diff-toggle')`), 3000)
await ev(`document.querySelector('.pane .code-diff-toggle').click()`)
await sleep(500)
const sideBySide = await ev(`(() => {
  const original = document.querySelector('.pane .code-diff .editor.original')
  return {
    pressed: document.querySelector('.pane .code-diff-toggle')?.getAttribute('aria-pressed'),
    remembered: localStorage.getItem('wisp.diff.sideBySide'),
    original: original ? original.getBoundingClientRect().width : 0
  }
})()`)
check(
  'M7 largo, o lado a lado liga (o de antes à esquerda), e o painel lembra; estreito, em linha',
  !narrowToggle &&
    sideBySide?.pressed === 'true' &&
    sideBySide.remembered === '1' &&
    sideBySide.original > 200,
  JSON.stringify({ narrowToggle, sideBySide })
)
await shoot(chat, 'diff-lado-a-lado')
await chat.send('Emulation.clearDeviceMetricsOverride')
await sleep(300)

console.log('== O arquivo no painel')
await ev(
  `[...document.querySelectorAll('.pane .tool-open-file')].find((b) => b.textContent.includes('Abrir o arquivo'))?.click()`
)
const viewer = await waitFor(
  () =>
    ev(
      `document.querySelector('.file-viewer .monaco-editor .view-lines')?.innerText.replace(/\\u00a0/g, ' ').includes('const c = 4') ?? false`
    ),
  15000
)
check('M8 o arquivo mudado abre no painel, no editor', !!viewer)
await sleep(300)
await shoot(chat, 'arquivo')
const viewerState = await ev(`(() => ({
  title: document.querySelector('.file-viewer-head strong')?.textContent,
  changed: document.querySelectorAll('.file-viewer .monaco-changed-line').length,
  readOnly: !!document.querySelector('.file-viewer .monaco-editor textarea[readonly], .file-viewer .monaco-editor [aria-readonly="true"]')
}))()`)
check(
  'M9 na linha da mudança (marcada), só para ler',
  viewerState?.title === 'app.ts' && viewerState.changed === 2 && viewerState.readOnly,
  JSON.stringify(viewerState)
)
// O Ctrl+F no arquivo é a busca do editor, não a da conversa.
const press = async (type, key, code, keyCode, modifiers = 0) =>
  chat.send('Input.dispatchKeyEvent', {
    type,
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    modifiers
  })
await press('keyDown', 'f', 'KeyF', 70, 2)
await press('keyUp', 'f', 'KeyF', 70, 2)
const find = await waitFor(
  () => ev(`!!document.querySelector('.file-viewer .find-widget.visible')`),
  3000
)
check(
  'M9b o Ctrl+F busca no arquivo',
  !!find && (await ev(`!document.querySelector('.find-bar')`)),
  JSON.stringify({ find })
)
// O primeiro Esc fecha a busca do editor; o segundo, o arquivo.
await press('keyDown', 'Escape', 'Escape', 27)
await press('keyUp', 'Escape', 'Escape', 27)
await sleep(200)
await chat.send('Input.dispatchKeyEvent', {
  type: 'keyDown',
  key: 'Escape',
  code: 'Escape',
  windowsVirtualKeyCode: 27
})
await chat.send('Input.dispatchKeyEvent', {
  type: 'keyUp',
  key: 'Escape',
  code: 'Escape',
  windowsVirtualKeyCode: 27
})
check(
  'M10 o Esc fecha o arquivo e volta para a conversa',
  !!(await waitFor(() => ev(`!document.querySelector('.file-viewer')`), 3000)) &&
    (await ev(`!!document.querySelector('.pane .composer')`))
)

console.log('== O que o painel não mostra')
const secret = await ev(
  `window.wisp.files.view(${JSON.stringify(join(home.home, '.ssh/id_ed25519'))})`
)
const binary = await ev(`window.wisp.files.view(${JSON.stringify(join(home.home, 'foto.png'))})`)
check(
  'M11 nem um arquivo de segredos, nem um binário',
  secret?.ok === false && /segredos/.test(secret.message) && binary?.ok === false,
  JSON.stringify({ secret, binary })
)
check(
  'M12 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
