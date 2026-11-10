// As telas que faltavam conferir (Fases 63, 65 e 73) e a faixa preta do terminal, de ponta a
// ponta: a Memória mostra o CLAUDE.md, edita com o diff e grava com o backup; o bloco de shell de
// uma resposta tem o Rodar no terminal, que cola o comando num terminal seu sem rodar; um erro
// na saída do terminal vira um aviso com um clique para a caixa; e o fundo do xterm não aparece.
// Uso: node e2e/pontas.mjs (veja e2e/run.sh).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const claude = join(home.home, '.claude')
mkdirSync(claude, { recursive: true })
writeFileSync(join(claude, 'CLAUDE.md'), '# Minhas regras\n\n- Responda curto.\n')

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
}
const say = async (text) => {
  await ev(`document.querySelector('.pane .composer textarea').focus()`)
  await chat.send('Input.insertText', { text })
  await sleep(200)
  await ev(`document.querySelector('.pane .composer').requestSubmit()`)
}
const screen = () =>
  ev(
    `[...document.querySelectorAll('.workbench .xterm-rows > div')].map(d => d.textContent).join('\\n')`
  )
const typeShell = async (text) => {
  await ev(`document.querySelector('.workbench .xterm-helper-textarea').focus()`)
  for (const char of text) await chat.send('Input.dispatchKeyEvent', { type: 'char', text: char })
}

console.log('== A Memória')
await ev(`document.querySelector('.pane .composer textarea').focus()`)
await key('p', 'KeyP', 2)
await waitFor(() => ev(`!!document.querySelector('.palette')`), 5000)
await chat.send('Input.insertText', { text: 'Memória' })
await sleep(300)
await key('Enter', 'Enter', 0, 13)
const shown = await waitFor(
  () => ev(`document.querySelector('.memory-file .memory-text')?.innerText ?? null`),
  5000
)
check('P1 a paleta abre a Memória, com o seu CLAUDE.md', /Minhas regras/.test(shown ?? ''), shown)
await ev(`document.querySelector('.memory-file .settings-button').click()`)
await waitFor(() => ev(`!!document.querySelector('.memory-file textarea')`), 5000)
await ev(`(() => {
  const area = document.querySelector('.memory-file textarea')
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(area, '# Minhas regras\\n\\n- Responda curto.\\n- Use pnpm.\\n')
  area.dispatchEvent(new Event('input', { bubbles: true }))
})()`)
await ev(`document.querySelector('.memory-file form').requestSubmit()`)
const diff = await waitFor(
  () => ev(`document.querySelector('.memory-file .agent-preview')?.innerText ?? null`),
  5000
)
check('P2 Ver o que muda mostra o diff antes de gravar', /Use pnpm/.test(diff ?? ''), diff)
await ev(
  `[...document.querySelectorAll('.memory-file .rewind-actions button')].find((b) => b.textContent.trim() === 'Gravar').click()`
)
const saved = await waitFor(
  () =>
    Promise.resolve(readFileSync(join(claude, 'CLAUDE.md'), 'utf8')).then((text) =>
      /Use pnpm/.test(text) ? text : null
    ),
  5000
)
check('P3 Gravar muda o arquivo', !!saved)
check(
  'P4 e guarda o de antes num backup ao lado',
  readdirSync(claude).some((name) => name.startsWith('CLAUDE.md.backup-wisp-'))
)
await ev(`document.querySelector('.header button[aria-label="Voltar para a conversa"]').click()`)

console.log('== Rodar no terminal')
await say('[bloco]')
const button = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane .code-head button')].some((b) => b.textContent.trim() === 'Rodar no terminal')`
    ),
  10000
)
check('P5 o bloco de shell da resposta tem o Rodar no terminal', !!button)
await ev(
  `[...document.querySelectorAll('.pane .code-head button')].find((b) => b.textContent.trim() === 'Rodar no terminal').click()`
)
const pasted = await waitFor(
  () => screen().then((text) => (/echo rodou-\$\(\(20\+3\)\)/.test(text ?? '') ? text : null)),
  10000
)
check('P6 a bancada abre no terminal, com o comando colado (sem o $ do começo)', !!pasted, pasted)
await sleep(800)
check('P7 e ele não rodou: o Enter é seu', !/rodou-23/.test((await screen()) ?? ''))
await typeShell('\r')
const ran = await waitFor(
  () => screen().then((text) => (/rodou-23/.test(text ?? '') ? text : null)),
  8000
)
check('P8 com o Enter, roda', !!ran)

console.log('== O fundo do terminal')
const strip = await ev(
  `getComputedStyle(document.querySelector('.workbench .xterm-viewport')).backgroundColor`
)
check(
  'P9 o fundo preto do xterm não aparece (sem a faixa no pé)',
  strip === 'rgba(0, 0, 0, 0)',
  strip
)

console.log('== Um erro no terminal')
check('P10 sem erro, nenhum aviso', !(await ev(`!!document.querySelector('.workbench-errors')`)))
await typeShell('wisp-comando-que-nao-existe\r')
const warned = await waitFor(
  () => ev(`document.querySelector('.workbench-errors .workbench-chip')?.textContent ?? null`),
  8000
)
check('P11 um erro na saída vira um aviso', /erro no terminal/.test(warned ?? ''), warned)
await ev(`document.querySelector('.workbench-errors .workbench-chip').click()`)
const composed = await waitFor(
  () =>
    ev(`document.querySelector('.pane .composer textarea').value`).then((value) =>
      /wisp-comando-que-nao-existe/.test(value ?? '') ? value : null
    ),
  5000
)
check('P12 o clique põe as últimas linhas na caixa da conversa', !!composed, composed)
check(
  'P13 e o aviso some',
  !!(await waitFor(() => ev(`!document.querySelector('.workbench-errors')`), 5000))
)
console.log('== A aba Mudanças (Fase 74)')
const project = join(home.home, 'projeto')
mkdirSync(project, { recursive: true })
const file = join(project, 'app.ts')
const original = 'const a = 1\nconst b = 2\nconst d = 5\n'
writeFileSync(file, original)
await ev(`window.wisp.workbench.set({ open: true, tab: 'changes' })`)
const none = await waitFor(
  () => ev(`document.querySelector('.workbench-changes .workbench-empty')?.innerText ?? null`),
  5000
)
check('P15 sem edições, a aba diz que não há mudanças', /Nenhuma mudança/.test(none ?? ''), none)
await ev(`document.querySelector('.pane .composer textarea').value = ''`)
wisp(home, '--ask', `[edit ${file}]`)
await waitFor(() => ev(`!!document.querySelector('.pane .review-card')`), 15000)
const listed = await waitFor(
  () => ev(`document.querySelector('.workbench-change')?.innerText ?? null`),
  8000
)
check(
  'P16 o arquivo editado aparece, com o +2 −1',
  /app\.ts/.test(listed ?? '') && /\+2/.test(listed ?? '') && /−1/.test(listed ?? ''),
  listed
)
await ev(`document.querySelector('.workbench-change-name').click()`)
check(
  'P17 o clique abre o diff',
  !!(await waitFor(() => ev(`!!document.querySelector('.workbench-change .code-diff')`), 5000))
)
await waitFor(() => ev(`!document.querySelector('.status')?.classList.contains('busy')`), 15000)
await ev(
  `[...document.querySelectorAll('.workbench-change-head .link')].find((b) => b.textContent.trim() === 'Desfazer').click()`
)
const undone = await waitFor(() => Promise.resolve(readFileSync(file, 'utf8') === original), 8000)
check('P18 Desfazer devolve o arquivo ao que era', !!undone, readFileSync(file, 'utf8'))
check(
  'P19 e ele sai da lista',
  !!(await waitFor(() => ev(`!document.querySelector('.workbench-change')`), 8000))
)
console.log('== Rodar o projeto com um clique (Fase 75)')
// Uma conversa na pasta do projeto, com um launch.json que sobe um servidor de verdade.
const { createServer: probe } = await import('node:net')
const free = await new Promise((resolve) => {
  const server = probe()
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address()
    server.close(() => resolve(port))
  })
})
mkdirSync(join(project, '.claude'), { recursive: true })
writeFileSync(join(project, 'index.html'), '<!doctype html><title>Projeto</title><h1>No ar</h1>')
writeFileSync(
  join(project, '.claude', 'launch.json'),
  JSON.stringify({
    configurations: [
      {
        name: 'web',
        runtimeExecutable: 'python3',
        runtimeArgs: ['-m', 'http.server', String(free), '--bind', '127.0.0.1'],
        port: free
      }
    ]
  })
)
const listedLaunch = await ev(`window.wisp.shell.launches(${JSON.stringify(project)})`)
check(
  'P20 o launch.json da pasta vira um servidor para rodar',
  listedLaunch?.[0]?.name === 'web' && listedLaunch[0].port === free,
  JSON.stringify(listedLaunch)
)
const refused = await ev(
  `window.wisp.shell.launch(${JSON.stringify(project)}, 'rm -rf /tmp/qualquer')`
)
check(
  'P21 um comando que não é o da pasta é recusado',
  /não é mais o da pasta/.test(refused ?? ''),
  refused
)
const launched = await ev(
  `window.wisp.shell.launch(${JSON.stringify(project)}, ${JSON.stringify(listedLaunch?.[0]?.command ?? '')})`
)
check('P22 o da pasta roda num terminal novo', launched === null, launched)
const served = await connect(`localhost:${free}`, 30000).catch(() => null)
const title = served
  ? await waitFor(() => served.evaluate(`document.querySelector('h1')?.textContent ?? null`), 8000)
  : null
check('P23 e a página abre no navegador quando a porta responde', title === 'No ar', title)
await ev(`window.wisp.shell.close((await window.wisp.workbench.get()).terminals.at(-1).id)`)
console.log('== A aba Plano (Fase 76)')
await ev(`window.wisp.workbench.set({ open: true, tab: 'plan' })`)
const noPlan = await waitFor(
  () => ev(`document.querySelector('.workbench-plan .workbench-empty')?.innerText ?? null`),
  5000
)
check('P24 sem plano, a aba explica o modo Planejar', /Nenhum plano/.test(noPlan ?? ''), noPlan)
await ev(`document.querySelector('.pane .composer textarea').value = ''`)
wisp(home, '--ask', '[plano]')
const planned = await waitFor(
  () => ev(`document.querySelector('.workbench-plan-text')?.innerText ?? null`),
  15000
)
check('P25 o plano que o Claude apresentou aparece na aba', (planned ?? '').length > 10, planned)
const waiting = await ev(
  `document.querySelector('.workbench-plan-head .plan-waiting')?.textContent ?? null`
)
check('P26 marcado como esperando você aceitar', /esperando/.test(waiting ?? ''), waiting)
const shot = await chat.send('Page.captureScreenshot', { format: 'png' })
if (process.env.WISP_E2E_SHOTS) {
  writeFileSync(join(process.env.WISP_E2E_SHOTS, 'plano.png'), Buffer.from(shot.data, 'base64'))
}
check(
  'P27 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
