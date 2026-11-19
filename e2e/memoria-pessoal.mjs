// A memória pessoal (Fase 79), de ponta a ponta, com o Claude Code de mentira: o Claude anota
// sem pedir (memory_save), uma conversa nova já sabe, a tela Memória mostra a anotação com a
// conversa de origem e o desfazer a tira; numa conversa anônima e numa pasta fora da memória,
// nada é anotado.
// Uso: node e2e/memoria-pessoal.mjs (veja e2e/run.sh).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  checks,
  connect,
  dataDir,
  sleep,
  startApp,
  stopApp,
  testHome,
  waitFor,
  wisp
} from './lib.mjs'

const { check, failed } = checks()
const client = 'clientes'
const home = testHome({ projectRoots: [`~/${client}`], memoryExcludedFolders: [`~/${client}`] })
const clientDir = join(home.home, client, 'acme')
mkdirSync(join(clientDir, '.git'), { recursive: true })
const memoryDir = join(dataDir(home.home), 'memoria')
mkdirSync(memoryDir, { recursive: true })
writeFileSync(join(memoryDir, 'EU.md'), '# Sobre mim\n\n- Mora em Curitiba\n')
const facts = () => {
  try {
    return readFileSync(join(memoryDir, 'MEMORIA.md'), 'utf8')
  } catch {
    return ''
  }
}

const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)

const key = async (k, code, modifiers = 0, vk = k.toUpperCase().charCodeAt(0)) => {
  for (const type of ['rawKeyDown', 'keyUp']) {
    await chat.send('Input.dispatchKeyEvent', {
      type,
      key: k,
      code,
      modifiers,
      windowsVirtualKeyCode: vk
    })
  }
  await sleep(150)
}
const answers = () =>
  ev(`[...document.querySelectorAll('.pane.focused .msg.assistant')].map(e => e.innerText.trim())`)
/** Manda na conversa em foco e espera uma resposta nova. */
const ask = async (text) => {
  const before = (await answers()).length
  await ev(`document.querySelector('.pane.focused .composer textarea').focus()`)
  await chat.send('Input.insertText', { text })
  await sleep(200)
  await ev(`document.querySelector('.pane.focused .composer').requestSubmit()`)
  // A resposta inteira: a conversa em foco parou de trabalhar.
  await waitFor(() => answers().then((list) => list.length > before), 15000)
  await waitFor(
    () => ev(`!document.querySelector('.header .status')?.classList.contains('busy')`),
    15000
  )
  const list = await answers()
  return list[list.length - 1]
}
const palette = async (text) => {
  await ev(`document.querySelector('.pane.focused .composer textarea').focus()`)
  await key('p', 'KeyP', 2)
  await waitFor(() => ev(`!!document.querySelector('.palette')`), 5000)
  await chat.send('Input.insertText', { text })
  await sleep(300)
  await key('Enter', 'Enter', 0, 13)
}

console.log('== Anotar sem pedir')
const knowsAtStart = await ask('[sabe Mora em Curitiba]')
check('M1 o EU.md entra no prompt da conversa', /^Sei:/.test(knowsAtStart ?? ''), knowsAtStart)
const saved = await ask('[lembra O aniversário da Ana é 3 de março]')
check('M2 o Claude anota sem card', /Anotado em MEMORIA\.md/.test(saved ?? ''), saved)
check(
  'M3 o MEMORIA.md ganha a anotação',
  /\n- O aniversário da Ana é 3 de março\n/.test(facts()),
  facts()
)
check(
  'M4 nenhum card de permissão',
  (await ev(`document.querySelectorAll('.pane.focused .permission-card').length`)) === 0
)

console.log('== Uma conversa nova já sabe')
await key('t', 'KeyT', 2)
await waitFor(() => ev(`document.querySelectorAll('.tab').length === 2`), 5000)
const knows = await ask('[sabe aniversário da Ana]')
check('M5 a conversa nova sabe do aniversário', /^Sei:/.test(knows ?? ''), knows)

console.log('== A tela Memória')
await palette('Memória')
const note = await waitFor(
  () => ev(`document.querySelector('.memory-notes li')?.innerText ?? null`),
  5000
)
// A conversa de origem leva o título dela: a primeira mensagem.
check(
  'M6 a anotação aparece, com a conversa de origem',
  /aniversário da Ana/.test(note ?? '') && /\[sabe Mora em Curitiba\]/.test(note ?? ''),
  note
)
const shownFile = await ev(
  `document.querySelector('.memory-file[data-memory="facts"] .memory-text')?.innerText ?? null`
)
check('M7 o MEMORIA.md aparece na tela', /aniversário da Ana/.test(shownFile ?? ''), shownFile)
await ev(
  `[...document.querySelectorAll('.memory-notes li button')].find((b) => b.textContent.trim() === 'Desfazer').click()`
)
const undone = await waitFor(() => (/aniversário/.test(facts()) ? null : facts() || 'vazio'), 5000)
check('M8 Desfazer tira a anotação do arquivo', !!undone, facts())
const marked = await waitFor(
  () => ev(`document.querySelector('.memory-notes li.undone')?.innerText ?? null`),
  5000
)
check('M9 e a anotação fica marcada como desfeita', /Desfeita em/.test(marked ?? ''), marked)
await ev(`document.querySelector('.header button[aria-label="Voltar para a conversa"]').click()`)
await sleep(300)
await key('k', 'KeyK', 2)
await sleep(300)
const forgot = await ask('[sabe aniversário da Ana]')
check('M10 depois do desfazer, a conversa nova não sabe', /^Não sei/.test(forgot ?? ''), forgot)

console.log('== A conversa anônima')
await palette('Nova conversa anônima')
const anonymousTab = await waitFor(
  () => ev(`document.querySelector('.tab.active .tab-anonymous') ? true : null`),
  5000
)
check('M11 a aba anônima aparece, com os óculos', !!anonymousTab)
const blind = await ask('[sabe Mora em Curitiba]')
check('M12 a conversa anônima não lê a memória', /^Não sei/.test(blind ?? ''), blind)
const refused = await ask('[lembra Algo da conversa anônima]')
check('M13 e não anota nada', /anônima/.test(refused ?? ''), refused)
check('M14 o arquivo continua sem ela', !/conversa anônima/.test(facts()), facts())

console.log('== Uma pasta fora da memória')
const opened = await ev(`window.wisp.tabs.openFolder(${JSON.stringify(clientDir)}, false)`)
check('M15 a pasta do cliente abre numa conversa', opened?.ok === true, JSON.stringify(opened))
await sleep(500)
const sees = await ask('[sabe Mora em Curitiba]')
check('M16 ela lê o EU.md', /^Sei:/.test(sees ?? ''), sees)
const kept = await ask('[lembra O cliente prefere azul]')
check('M17 mas não anota', /tirou da memória/.test(kept ?? ''), kept)
check('M18 o arquivo continua sem ela', !/cliente prefere/.test(facts()), facts())

check(
  'M19 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
