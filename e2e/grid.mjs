// A grade e a janela (Fase 16), de ponta a ponta, com um gerenciador de janelas de verdade
// (openbox) no X virtual: dividir embaixo e ao lado, o foco pelas setas, a divisória arrastada
// com o mouse (xdotool), uma aba arrastada para a borda e para o meio de um painel, a grade que
// volta igual ao reabrir, maximizar e restaurar, a janela movida que reabre onde ficou e volta
// para perto do mascote, e o "+" da caixa de texto. Uso: node e2e/grid.mjs (precisa do openbox).
import { execFileSync, spawn } from 'node:child_process'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const xdo = (...args) => execFileSync('xdotool', args.map(String)).toString().trim()
const wm = spawn('openbox', ['--sm-disable'], { stdio: 'ignore' })
await sleep(800)

let chat
let mascot
async function open() {
  mascot = await startApp(home)
  wisp(home, '--show')
  chat = await connect('/chat/')
  await waitFor(() => chat.evaluate(`!!document.querySelector('.pane .composer')`), 15000)
  await sleep(600)
}
const ev = (expression) => chat.evaluate(expression)
const key = async (k, code, vk, modifiers) => {
  for (const type of ['keyDown', 'keyUp']) {
    await chat.send('Input.dispatchKeyEvent', {
      type,
      key: k,
      code,
      windowsVirtualKeyCode: vk,
      modifiers
    })
  }
  await sleep(350)
}
// Os modificadores do DevTools: Alt 1, Ctrl 2, Shift 8.
const ALT = 1
const CTRL = 2
const SHIFT = 8
/** Os painéis: onde cada um está (relativo à grade) e qual está em foco. */
const panes = () =>
  ev(`(() => {
    const grid = document.querySelector('.grid').getBoundingClientRect()
    return [...document.querySelectorAll('.panes .pane')].map((p) => {
      const r = p.getBoundingClientRect()
      return { x: Math.round(r.left - grid.left), y: Math.round(r.top - grid.top), w: Math.round(r.width), h: Math.round(r.height), focused: p.classList.contains('focused'), conv: p.dataset.conversation ?? null }
    })
  })()`)
/** A forma da grade, para comparar depois de reabrir. */
const shape = () =>
  ev(`(() => {
    const walk = (el) => {
      if (el.classList.contains('grid-cell')) return 'p'
      const split = el.classList.contains('grid-split') ? el : el.querySelector(':scope > .grid-split, :scope > .grid-cell')
      if (!split) return '?'
      if (split.classList.contains('grid-cell')) return 'p'
      const dir = split.classList.contains('grid-row') ? 'R' : 'C'
      const kids = [...split.children].filter((c) => c.classList.contains('grid-slot')).map((slot) => walk(slot.querySelector(':scope > .grid-item')))
      return dir + '(' + kids.join(',') + ')'
    }
    return walk(document.querySelector('.grid'))
  })()`)
const focusPane = (index) =>
  ev(
    `document.querySelectorAll('.panes .pane')[${index}].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`
  )

await open()

console.log('== Dividir em qualquer direção')
await key('|', 'Backslash', 220, CTRL | SHIFT)
let p = await panes()
check(
  'G1 Ctrl+Shift+\\\\ divide embaixo',
  p.length === 2 && p[1].y > p[0].y && p[0].x === p[1].x,
  JSON.stringify(p)
)
await focusPane(0)
await sleep(200)
await key('\\\\', 'Backslash', 220, CTRL)
p = await panes()
check(
  'G2 Ctrl+\\\\ divide ao lado, só o painel de cima',
  p.length === 3 && p[0].y === p[1].y && p[1].x > p[0].x && p[2].y > p[0].y && p[2].w > p[0].w,
  JSON.stringify(p)
)
check('G3 a forma da grade', (await shape()) === 'C(R(p,p),p)', await shape())

console.log('== O foco pelas setas')
check('G4 o painel novo fica em foco', p[1].focused)
await key('ArrowDown', 'ArrowDown', 40, ALT | SHIFT)
p = await panes()
check(
  'G5 Alt+Shift+↓ vai para o painel de baixo',
  p[2].focused,
  JSON.stringify(p.map((x) => x.focused))
)
await key('ArrowUp', 'ArrowUp', 38, ALT | SHIFT)
await key('ArrowLeft', 'ArrowLeft', 37, ALT | SHIFT)
p = await panes()
check(
  'G6 ↑ e ← voltam para o de cima à esquerda',
  p[0].focused,
  JSON.stringify(p.map((x) => x.focused))
)

console.log('== A divisória, com o mouse')
const before = (await panes())[0].h
const handle = await ev(`(() => {
  const d = document.querySelector('.grid > .grid-split > .grid-divider').getBoundingClientRect()
  return { x: Math.round(window.screenX + d.left + d.width / 2), y: Math.round(window.screenY + d.top + d.height / 2) }
})()`)
xdo('mousemove', handle.x, handle.y)
await sleep(150)
xdo('mousedown', 1)
for (const dy of [20, 50, 80]) {
  xdo('mousemove', handle.x, handle.y + dy)
  await sleep(80)
}
xdo('mouseup', 1)
await sleep(500)
const after = (await panes())[0].h
check(
  'G7 arrastar a divisória aumenta o painel de cima',
  after - before > 50,
  `${before} → ${after}`
)

console.log('== Arrastar uma aba')
// Com o mouse de verdade (arrastar e soltar do X11): uma aba escondida para a borda esquerda
// do painel de cima à direita.
await focusPane(0)
await key('t', 'KeyT', 84, CTRL)
const real = await ev(`(() => {
  const tab = [...document.querySelectorAll('.tab')].find((t) => !t.classList.contains('visible')).getBoundingClientRect()
  const pane = document.querySelectorAll('.panes .pane')[1].getBoundingClientRect()
  return { tx: window.screenX + tab.left + tab.width / 2, ty: window.screenY + tab.top + tab.height / 2, px: window.screenX + pane.left + 15, py: window.screenY + pane.top + pane.height / 2 }
})()`)
xdo('mousemove', Math.round(real.tx), Math.round(real.ty))
await sleep(200)
xdo('mousedown', 1)
await sleep(100)
for (let i = 1; i <= 12; i++) {
  xdo(
    'mousemove',
    Math.round(real.tx + ((real.px - real.tx) * i) / 12),
    Math.round(real.ty + ((real.py - real.ty) * i) / 12)
  )
  await sleep(60)
}
await sleep(300)
// O arrastar e soltar do X11 precisa de mais movimento depois que o destino aceita.
for (const dx of [2, 4, 2]) {
  xdo('mousemove', Math.round(real.px + dx), Math.round(real.py))
  await sleep(120)
}
const realZone = await ev(`document.querySelector('.drop-zone')?.textContent ?? null`)
xdo('mouseup', 1)
await sleep(600)
check(
  'G8b com o mouse de verdade: a zona aparece e o painel se divide',
  realZone === 'À esquerda' && (await panes()).length === 4,
  `${realZone} ${(await panes()).length}`
)

// Uma aba nova no painel de cima à esquerda; a que estava nele fica escondida.
await focusPane(0)
await key('t', 'KeyT', 84, CTRL)
const hidden = await ev(`(() => {
  const shown = new Set([...document.querySelectorAll('.panes .pane')].map((p) => p.dataset.conversation))
  const tab = [...document.querySelectorAll('.tab')].find((t) => !t.classList.contains('visible'))
  return tab ? tab.querySelector('.tab-title').textContent : null
})()`)
check('G8 há uma aba escondida para arrastar', hidden !== null)
const dragTo = (tabIndex, paneIndex, fx, fy) =>
  ev(`(async () => {
    const tab = [...document.querySelectorAll('.tab .tab-main')][${tabIndex}]
    const dt = new DataTransfer()
    tab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
    await new Promise((r) => setTimeout(r, 150))
    const cell = document.querySelectorAll('.panes .grid-cell')[${paneIndex}]
    const overlay = cell.querySelector('.tab-drop')
    if (!overlay) return 'sem zona'
    const r = overlay.getBoundingClientRect()
    const at = { clientX: r.left + r.width * ${fx}, clientY: r.top + r.height * ${fy}, bubbles: true, dataTransfer: dt }
    overlay.dispatchEvent(new DragEvent('dragover', { ...at, cancelable: true }))
    await new Promise((r) => setTimeout(r, 50))
    const label = cell.querySelector('.drop-zone')?.textContent ?? null
    overlay.dispatchEvent(new DragEvent('drop', { ...at, cancelable: true }))
    tab.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }))
    return label
  })()`)
const hiddenIndex = await ev(
  `[...document.querySelectorAll('.tab')].findIndex((t) => !t.classList.contains('visible'))`
)
const label = await dragTo(hiddenIndex, 3, 0.95, 0.5)
await sleep(500)
p = await panes()
check('G9 a zona mostra onde cai', label === 'À direita', label)
check(
  'G10 solta na borda direita do painel de baixo: ele se divide ali',
  p.length === 5 && p[4].y === p[3].y && p[4].x > p[3].x,
  JSON.stringify(p)
)
check('G11 a forma da grade', (await shape()) === 'C(R(p,p,p),R(p,p))', await shape())
const convs = (await panes()).map((x) => x.conv)
const firstTab = await ev(
  `[...document.querySelectorAll('.tab')].findIndex((t) => t.dataset.tab === ${JSON.stringify(convs[0])})`
)
await dragTo(firstTab, 3, 0.5, 0.5)
await sleep(500)
const swapped = (await panes()).map((x) => x.conv)
check(
  'G12 no meio: as duas abas trocam de painel',
  swapped[3] === convs[0] && swapped[0] === convs[3],
  `${JSON.stringify(convs)} → ${JSON.stringify(swapped)}`
)

console.log('== O "+" e a linha das pílulas')
await ev(`document.querySelectorAll('.panes .pane')[0].querySelector('.composer-plus').click()`)
await sleep(200)
const menu = await ev(
  `[...document.querySelectorAll('.panes .pane')[0].querySelectorAll('.composer-plus-menu strong')].map((e) => e.textContent)`
)
check(
  'G13 o + abre anexar, print, recortar, a pré-visualização e a pergunta lateral',
  JSON.stringify(menu) ===
    JSON.stringify([
      'Anexar arquivos',
      'Print da tela',
      'Recortar uma área',
      'Pré-visualizar',
      'Pergunta lateral'
    ]),
  JSON.stringify(menu)
)
check(
  'G14 sem os botões soltos de anexar e print',
  (await ev(
    `document.querySelectorAll('.panes .pane')[0].querySelectorAll('.composer-row [aria-label="Anexar arquivos"], .composer-row [aria-label="Anexar um print da tela"]').length`
  )) === 0
)
await key('Escape', 'Escape', 27, 0)
// Um painel bem estreito: a divisória quase toda para a esquerda.
await ev(`window.wisp.tabs.resize([0], [0.1, 0.45, 0.45])`)
await sleep(400)
const meta = await ev(`(() => {
  const m = document.querySelectorAll('.panes .pane')[0].querySelector('.composer-meta')
  return { overflow: getComputedStyle(m).overflowX, scroll: m.scrollWidth, client: m.clientWidth }
})()`)
check(
  'G15 a linha das pílulas rola de lado num painel estreito',
  meta.overflow === 'auto' && meta.scroll > meta.client,
  JSON.stringify(meta)
)
const pill = await ev(`(() => {
  const pane = document.querySelectorAll('.panes .pane')[0]
  const m = pane.querySelector('.composer-meta')
  m.scrollLeft = m.scrollWidth
  pane.querySelector('.mode-pill').click()
  return null
})()`)
await sleep(200)
const modeMenu = await ev(`(() => {
  const menu = document.querySelectorAll('.panes .pane')[0].querySelector('.mode .model-menu')
  if (!menu) return null
  const r = menu.getBoundingClientRect()
  return { visible: r.width > 100 && r.height > 60, top: Math.round(r.top) }
})()`)
check(
  'G16 o menu de uma pílula rolada aparece inteiro',
  modeMenu?.visible === true,
  JSON.stringify(modeMenu ?? pill)
)
await key('Escape', 'Escape', 27, 0)

console.log('== Reabrir o Wisp')
const shapeBefore = await shape()
await stopApp()
await open()
check(
  'G17 a grade volta igual',
  (await shape()) === shapeBefore,
  `${shapeBefore} → ${await shape()}`
)

console.log('== A janela')
const size = () =>
  ev(`({ x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight })`)
const normal = await size()
await ev(`document.querySelector('.window-maximize').click()`)
const max = await waitFor(async () => {
  const s = await size()
  return s.w >= 1590 ? s : null
}, 5000)
check('G18 maximizar ocupa a tela', !!max, JSON.stringify(await size()))
check(
  'G19 o botão vira Restaurar',
  (await ev(`document.querySelector('.window-maximize').title`)) === 'Restaurar'
)
await ev(`document.querySelector('.window-maximize').click()`)
const restored = await waitFor(async () => {
  const s = await size()
  return Math.abs(s.w - normal.w) < 4 ? s : null
}, 5000)
check(
  'G20 restaurar volta ao tamanho de antes',
  !!restored,
  `${JSON.stringify(normal)} → ${JSON.stringify(await size())}`
)
check(
  'G21 sem mexer, a janela continua presa ao mascote',
  !(await ev(`!!document.querySelector('.window-dock')`))
)
const id = xdo('search', '--name', '^Wisp$')
  .split('\n')
  .find((w) => {
    try {
      return Number(xdo('getwindowgeometry', '--shell', w).match(/WIDTH=(\d+)/)[1]) === normal.w
    } catch {
      return false
    }
  })
xdo('windowmove', id, 200, 150)
const dock = await waitFor(() => ev(`!!document.querySelector('.window-dock')`), 5000)
check('G22 movida por você: aparece o "voltar para perto do mascote"', !!dock)
const moved = await size()
await ev(`window.wisp.chat.hide()`)
await sleep(500)
wisp(home, '--show')
await sleep(800)
const reopened = await size()
check(
  'G23 reabre onde você a deixou',
  Math.abs(reopened.x - moved.x) < 8 && Math.abs(reopened.y - moved.y) < 8,
  `${JSON.stringify(moved)} → ${JSON.stringify(reopened)}`
)
await ev(`document.querySelector('.window-dock').click()`)
const docked = await waitFor(async () => {
  const s = await size()
  return Math.abs(s.x - moved.x) + Math.abs(s.y - moved.y) > 20 ? s : null
}, 5000)
check(
  'G24 voltar para perto do mascote',
  !!docked && !(await ev(`!!document.querySelector('.window-dock')`)),
  JSON.stringify(await size())
)
check(
  'G25 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
wm.kill()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
