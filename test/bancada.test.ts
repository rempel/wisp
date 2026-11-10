// A bancada (Fase 55): o que ela guarda e como volta (um arquivo estragado não derruba nada), os
// últimos endereços, a largura e a divisória, onde a vista do navegador fica na janela (com o
// zoom do painel) e como o shell dos terminais sobe (o $SHELL, o ambiente limpo, a pasta, o
// Flatpak).
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { narrowed, saneBounds, viewRect } from '../src/main/preview'
import { PICK_SCRIPT, pickedText, sanePick } from '../src/main/preview-pick'
import { shellEnv, shellLaunch, shellProgram, Shells } from '../src/main/shells'
import { restoreWorkbench, withRecent } from '../src/main/workbench'
import { lastLocalhost } from '../src/renderer/chat/preview-store'
import {
  draggedWidth,
  MAX_SHELLS,
  nextPreviewWidth,
  previewWidth,
  SHELL_LANGUAGES,
  shellSnippet,
  WORKBENCH_WIDTH,
  workbenchWidth
} from '../src/shared/ipc-workbench'

const unixOnly = { skip: process.platform === 'win32' && 'o roteiro usa o bash' }

test('bancada: o que estava guardado volta conferido', () => {
  assert.deepEqual(restoreWorkbench(null), {
    open: false,
    tab: 'browser',
    width: WORKBENCH_WIDTH.initial,
    recent: []
  })
  assert.deepEqual(
    restoreWorkbench({ open: true, tab: 'terminal', width: 700.4, recent: ['localhost:3000', 7] }),
    { open: true, tab: 'terminal', width: 700, recent: ['localhost:3000'] }
  )
  // Um arquivo de outra versão (ou mexido à mão): o que não vale volta ao começo.
  const odd = restoreWorkbench({ open: 'sim', tab: 'editor', width: 'larga', recent: 'x' })
  assert.deepEqual(odd, { open: false, tab: 'browser', width: WORKBENCH_WIDTH.initial, recent: [] })
  assert.equal(restoreWorkbench({ recent: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).recent.length, 5)
})

test('bancada: os últimos endereços, o mais novo primeiro e sem repetir', () => {
  assert.deepEqual(withRecent(['a', 'b'], 'c'), ['c', 'a', 'b'])
  assert.deepEqual(withRecent(['a', 'b', 'c'], 'b'), ['b', 'a', 'c'])
  assert.deepEqual(withRecent(['a', 'b', 'c', 'd', 'e'], 'f'), ['f', 'a', 'b', 'c', 'd'])
})

test('bancada: a largura fica dentro dos limites', () => {
  assert.equal(workbenchWidth(640), 640)
  assert.equal(workbenchWidth(10), WORKBENCH_WIDTH.min)
  assert.equal(workbenchWidth(99999), WORKBENCH_WIDTH.max)
  assert.equal(workbenchWidth(Number.NaN), WORKBENCH_WIDTH.initial)
  assert.equal(workbenchWidth('500'), WORKBENCH_WIDTH.initial)
})

test('bancada: a divisória arrastada deixa espaço para as conversas', () => {
  // A borda direita em 1200, a janela com 1200: o cursor em 700 dá 500 de bancada.
  assert.equal(draggedWidth(1200, 700, 1200), 500)
  // Para a esquerda demais: as conversas ficam com o mínimo delas (320).
  assert.equal(draggedWidth(1200, 50, 1200), 880)
  // Para a direita demais: a bancada fica com o mínimo dela.
  assert.equal(draggedWidth(1200, 1190, 1200), WORKBENCH_WIDTH.min)
  // Numa janela estreita, a bancada nunca some.
  assert.equal(draggedWidth(500, 100, 500), WORKBENCH_WIDTH.min)
})

test('bancada: o lugar da vista do navegador acompanha o zoom do painel', () => {
  const bounds = { x: 420.5, y: 104, width: 519.5, height: 496 }
  assert.deepEqual(viewRect(bounds, 1), { x: 421, y: 104, width: 520, height: 496 })
  assert.deepEqual(viewRect(bounds, 1.5), { x: 631, y: 156, width: 779, height: 744 })
  // Um zoom sem sentido não some com a vista.
  assert.deepEqual(viewRect(bounds, 0), viewRect(bounds, 1))
})

test('bancada: só um lugar com quatro números razoáveis vale', () => {
  assert.deepEqual(saneBounds({ x: 1, y: 2, width: 300, height: 200, extra: true }), {
    x: 1,
    y: 2,
    width: 300,
    height: 200
  })
  assert.equal(saneBounds(null), null)
  assert.equal(saneBounds({ x: 1, y: 2, width: 0, height: 200 }), null)
  assert.equal(saneBounds({ x: -5, y: 2, width: 300, height: 200 }), null)
  assert.equal(saneBounds({ x: 1, y: 2, width: Infinity, height: 200 }), null)
  assert.equal(saneBounds({ x: '1', y: 2, width: 300, height: 200 }), null)
})

test('bancada: o último localhost que o terminal mostrou', () => {
  assert.equal(lastLocalhost('nada aqui'), null)
  assert.equal(
    lastLocalhost('Local: http://localhost:5173/\n  Network: http://127.0.0.1:5174/app'),
    'http://127.0.0.1:5174/app'
  )
})

test('bancada: o shell é o $SHELL que existe, ou o bash, ou o sh', () => {
  const has =
    (...paths: string[]) =>
    (path: string) =>
      paths.includes(path)
  assert.equal(shellProgram({ SHELL: '/usr/bin/zsh' }, false, has('/usr/bin/zsh')), '/usr/bin/zsh')
  assert.equal(shellProgram({ SHELL: '/sumiu/fish' }, false, has('/bin/bash')), '/bin/bash')
  // Um nome solto não vale: só um caminho inteiro.
  assert.equal(shellProgram({ SHELL: 'zsh' }, false, has('/bin/bash')), '/bin/bash')
  assert.equal(shellProgram({}, false, has()), '/bin/sh')
  assert.equal(shellProgram({ SHELL: '/bin/bash' }, true, has('/bin/bash')), 'powershell.exe')
})

test('bancada: o ambiente do shell não leva o que é do npm e do Electron', () => {
  const env = shellEnv({
    PATH: '/usr/bin',
    npm_config_x: '1',
    ELECTRON_RUN_AS_NODE: '1',
    CHROME_DESKTOP: 'wisp.desktop',
    EDITOR: 'vim'
  })
  assert.deepEqual(env, { PATH: '/usr/bin', EDITOR: 'vim', TERM_PROGRAM: 'Wisp' })
})

test('bancada: o shell abre na pasta da conversa, ou na pessoal', () => {
  const project = join(HOME, 'projeto')
  mkdirSync(project, { recursive: true })
  assert.equal(shellLaunch(project, false).cwd, project)
  assert.equal(shellLaunch(join(HOME, 'sumiu'), false).cwd, HOME)
  assert.equal(shellLaunch(null, false).cwd, HOME)
  assert.deepEqual(shellLaunch(null, false).args, [])
})

test('bancada: no Flatpak, o shell é o do sistema, na pasta pedida', () => {
  const project = join(HOME, 'projeto')
  const launch = shellLaunch(project, true)
  assert.equal(launch.file, 'flatpak-spawn')
  assert.ok(launch.args.includes('--host'))
  assert.ok(launch.args.includes(`--directory=${project}`))
  assert.equal(launch.args.at(-1), 'exec "${SHELL:-/bin/bash}"')
})

test('bancada: um terminal de verdade roda, mostra a saída e fecha', unixOnly, async () => {
  let output = ''
  let changes = 0
  const shells = new Shells({
    data: (_id, chunk) => (output += chunk),
    changed: () => changes++
  })
  const id = shells.create(HOME)
  assert.equal(typeof id, 'string')
  const [info] = shells.list()
  assert.equal(info.cwd, HOME)
  assert.equal(info.exited, false)
  shells.input(id as string, 'echo bancada-$((6*7))\r')
  const deadline = Date.now() + 10_000
  while (!output.includes('bancada-42') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.match(output, /bancada-42/)
  assert.match(shells.attach(id as string), /bancada-42/)
  // O limite: a bancada não abre terminais sem fim.
  for (let i = 1; i < MAX_SHELLS; i++) assert.equal(typeof shells.create(null), 'string')
  assert.equal(typeof shells.create(null), 'object')
  shells.close(id as string)
  assert.equal(shells.list().length, MAX_SHELLS - 1)
  assert.equal(shells.attach(id as string), '')
  shells.dispose()
  assert.equal(shells.list().length, 0)
  assert.ok(changes >= MAX_SHELLS + 1)
})

test('navegador: a página estreitada fica no meio do lugar (Fase 61)', () => {
  const place = { x: 400, y: 100, width: 800, height: 600 }
  assert.deepEqual(narrowed(place, null), place)
  assert.deepEqual(narrowed(place, 390), { x: 605, y: 100, width: 390, height: 600 })
  // Mais larga que o lugar: o lugar todo.
  assert.deepEqual(narrowed(place, 1200), place)
  assert.equal(previewWidth(390), 390)
  assert.equal(previewWidth(10), 240)
  assert.equal(previewWidth(null), null)
  assert.equal(previewWidth('390'), null)
  assert.equal(nextPreviewWidth(null), 390)
  assert.equal(nextPreviewWidth(390), 768)
  assert.equal(nextPreviewWidth(768), null)
  // Uma largura fora da lista (o Claude pediu outra) volta ao lugar todo.
  assert.equal(nextPreviewWidth(1234), null)
})

test('navegador: o elemento apontado é conferido (a página não é de confiança) (Fase 60)', () => {
  const raw = {
    selector: '#ok',
    tag: 'button',
    text: 'Comprar `agora`',
    rect: { x: 10, y: 20, width: 80, height: 30 },
    styles: { color: 'rgb(0, 0, 0)', 'font-size': '14px', 'COISA ESTRANHA': 'x', padding: 7 }
  }
  const picked = sanePick(raw)
  assert.ok(picked)
  assert.deepEqual(picked.styles, { color: 'rgb(0, 0, 0)', 'font-size': '14px' })
  assert.equal(sanePick(null), null)
  assert.equal(sanePick({ ...raw, selector: '' }), null)
  assert.equal(sanePick({ ...raw, rect: { x: 1, y: 2, width: 0, height: 3 } }), null)
  assert.equal(sanePick({ ...raw, rect: { x: 1, y: 2, width: 'a', height: 3 } }), null)
  assert.equal(sanePick({ ...raw, tag: '<script>' })?.tag, 'script')
  const text = pickedText(picked, 'http://localhost:5173/')
  assert.match(text, /http:\/\/localhost:5173\//)
  assert.match(text, /`#ok` <button> "Comprar 'agora'"/)
  assert.match(text, /color: rgb\(0, 0, 0\); font-size: 14px/)
  // A mira é uma expressão que roda sem erro de sintaxe.
  assert.doesNotThrow(() => new Function(`return ${PICK_SCRIPT}`))
})

test('rodar no terminal: o comando de um bloco, sem o $ do começo (Fase 63)', () => {
  assert.equal(shellSnippet('$ npm install\n$ npm run dev\n'), 'npm install\nnpm run dev')
  assert.equal(shellSnippet('\n  > git status\n'), 'git status')
  // Um $ no meio do comando fica.
  assert.equal(shellSnippet('echo $HOME'), 'echo $HOME')
  assert.ok(SHELL_LANGUAGES.includes('bash') && SHELL_LANGUAGES.includes('powershell'))
  assert.ok(!SHELL_LANGUAGES.includes('python'))
})

test('rodar no terminal: cola num terminal seu, sem enviar', unixOnly, async () => {
  let output = ''
  const shells = new Shells({ data: (_id, chunk) => (output += chunk), changed: () => undefined })
  const claude = shells.forOwner('aba', HOME) as string
  const id = shells.paste('echo colado-$((2+2))', HOME)
  assert.equal(typeof id, 'string')
  assert.notEqual(id, claude, 'nunca no terminal do Claude')
  assert.equal(shells.paste('echo de-novo', HOME), id, 'o mesmo terminal seu da próxima vez')
  await new Promise((resolve) => setTimeout(resolve, 1500))
  // O texto apareceu na linha de comando, mas não rodou: o Enter é seu.
  assert.match(output, /colado-\$\(\(2\+2\)\)/)
  assert.doesNotMatch(output, /colado-4/)
  shells.dispose()
})
