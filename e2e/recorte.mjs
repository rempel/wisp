// Recortar uma área da tela (Fase 41), de ponta a ponta: o menu do "+" abre a camada em tela
// cheia com o print, arrastar um retângulo anexa o recorte (do tamanho arrastado) na caixa da
// conversa, e o Esc desiste sem anexar nada. Funciona igual no Windows (o e2e roda lá também).
// Uso: node e2e/recorte.mjs (veja e2e/run.sh).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)

/** Abre o "+" e escolhe o item pelo título. */
const pick = (title) =>
  ev(`(() => {
    document.querySelector('.pane .composer-plus').click()
    return new Promise((resolve) => setTimeout(() => {
      const item = [...document.querySelectorAll('.composer-plus-menu .model-option')]
        .find((b) => b.querySelector('strong')?.textContent === ${JSON.stringify(title)})
      item?.click()
      resolve(!!item)
    }, 100))
  })()`)

/** A largura e a altura de um PNG, pelo cabeçalho IHDR. */
const pngSize = (path) => {
  const data = readFileSync(path)
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
}

console.log('== Arrastar um retângulo')
check('R1 o "+" tem "Recortar uma área"', await pick('Recortar uma área'))
const area = await connect('/area/', 15000)
const ready = await waitFor(
  () => area.evaluate(`document.getElementById('shot').naturalWidth > 0`),
  10000
)
check('R2 a camada abre com o print da tela', !!ready)
const view = await area.evaluate(
  `({ w: innerWidth, h: innerHeight, nw: document.getElementById('shot').naturalWidth, nh: document.getElementById('shot').naturalHeight, hint: document.getElementById('hint').textContent })`
)
console.log(`  a camada: ${JSON.stringify(view)}`)
check('R3 com a dica de como usar', /Arraste/.test(view?.hint ?? ''), view?.hint)
const mouse = (type, x, y) =>
  area.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: 1, clickCount: 1 })
await mouse('mousePressed', 100, 120)
await mouse('mouseMoved', 200, 180)
await mouse('mouseMoved', 340, 270)
await mouse('mouseReleased', 340, 270)
const name = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane .attachments .attachment img')].map((img) => img.alt).find((alt) => alt.startsWith('recorte')) ?? null`
    ),
  10000
)
check('R4 o recorte aparece nos anexos da caixa, com a miniatura', !!name, name)
// O arquivo salvo pelo main (na pasta de anexos do HOME de teste).
const find = (dir, depth = 0) => {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.name === name) return path
    if (entry.isDirectory() && depth < 6) {
      const inside = find(path, depth + 1)
      if (inside) return inside
    }
  }
  return null
}
const file = name ? find(home.home) : null
const size = file ? pngSize(file) : null
// Quantos pixels do print cabem num da camada (a imagem cabe inteira, sem distorcer): no X
// virtual, 1; num Windows com 150%, o print tem mais pixels que a janela.
const scale = Math.max((view?.nw ?? 1) / (view?.w ?? 1), (view?.nh ?? 1) / (view?.h ?? 1))
check(
  'R4b a camada cobre a tela inteira',
  Math.abs(scale - (view?.nw ?? 1) / (view?.w ?? 1)) < 0.02,
  JSON.stringify(view)
)
console.log(`  o recorte: ${file ?? 'não achei'} ${JSON.stringify(size)} (escala ${scale})`)
check(
  'R5 do tamanho arrastado (240 × 150, na escala da tela)',
  !!size && Math.abs(size.width - 240 * scale) <= 3 && Math.abs(size.height - 150 * scale) <= 3,
  JSON.stringify(size)
)
const gone = await waitFor(async () => {
  const list = await (await fetch('http://127.0.0.1:9333/json')).json()
  return !list.some((item) => item.url.includes('/area/'))
}, 5000)
check('R6 a camada fecha', !!gone)

console.log('== Esc desiste')
const before = await ev(`document.querySelectorAll('.pane .attachments .attachment').length`)
check('R6b o recorte de antes continua lá', before === 1, String(before))
await pick('Recortar uma área')
const again = await connect('/area/', 15000)
await waitFor(() => again.evaluate(`document.getElementById('shot').naturalWidth > 0`), 10000)
await again.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
const closed = await waitFor(async () => {
  const list = await (await fetch('http://127.0.0.1:9333/json')).json()
  return !list.some((item) => item.url.includes('/area/'))
}, 5000)
check('R7 o Esc fecha a camada', !!closed)
await sleep(500)
const after = await ev(`document.querySelectorAll('.pane .attachments .attachment').length`)
check('R8 e nada novo nos anexos', after === before, `${before} → ${after}`)
check(
  'R9 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0 && area.logs.length === 0,
  [...mascot.logs, ...chat.logs, ...area.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
