// A ilha, de ponta a ponta (Fase 14; aberta na Fase 37): a cápsula recolhida no centro do topo
// (fora dela, o clique é de quem está atrás), espia com o cursor, abre com o clique e mostra a
// música de um player de mentira (MPRIS) com os controles; um pedido de permissão a abre sozinha
// com Negar e Permitir; recolhida, ela guarda o pedido; a conversa aparece com os passos; os
// ajustes vão para o config.json; o botão do painel o abre logo abaixo; e ela sai de cena quando o
// modo é desligado. O cursor e o clique são de verdade (xdotool), porque o recorte da janela só
// vale no servidor X.
// Uso: node e2e/island.mjs (veja e2e/run.sh); precisa do xdotool.
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  checks,
  configDir,
  connect,
  ROOT,
  sleep,
  startApp,
  stopApp,
  testHome,
  waitFor,
  wisp
} from './lib.mjs'

const { check, failed } = checks()
// Uma tela de 1600×900 (e2e/run.sh): a janela da ilha (680×340) fica em 460,4; a cápsula
// recolhida vai de 682 a 918, a que espia de 630 a 970 (84 de altura), a aberta de 480 a 1120.
const home = testHome({ compact: true })
const xdo = (...args) => execFileSync('xdotool', args.map(String)).toString()
/** A janela X que está sob o cursor nesse ponto (o recorte da janela vale aqui). */
const windowAt = (x, y) => {
  xdo('mousemove', x, y)
  return /WINDOW=(\d+)/.exec(xdo('getmouselocation', '--shell'))[1]
}
const away = () => xdo('mousemove', 300, 600)

// Um D-Bus só deste teste, com o player de mentira tocando uma faixa com capa.
const [address, busPid] = execFileSync(
  'dbus-daemon',
  ['--session', '--fork', '--print-address=1', '--print-pid=1'],
  { env: { ...process.env, HOME: home.home } }
)
  .toString()
  .trim()
  .split('\n')
const art = join(home.home, 'capa.png')
writeFileSync(
  art,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  )
)
const playerFile = join(home.home, 'player.json')
const bundle = join(home.home, 'fake-mpris.mjs')
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
  join(ROOT, 'test/fixtures/fake-mpris.ts'),
  '--bundle',
  '--platform=node',
  '--format=esm',
  `--outfile=${bundle}`,
  '--log-level=warning'
])
const player = spawn(process.execPath, [bundle], {
  env: {
    ...process.env,
    DBUS_SESSION_BUS_ADDRESS: address,
    FAKE_MPRIS_FILE: playerFile,
    FAKE_MPRIS_ART: art
  },
  stdio: ['ignore', 'pipe', 'inherit']
})
await new Promise((resolve) => player.stdout.once('data', resolve))
const playerState = () => JSON.parse(readFileSync(playerFile, 'utf8'))
const config = () => JSON.parse(readFileSync(join(configDir(home.home), 'config.json'), 'utf8'))

const mascot = await startApp(home, { DBUS_SESSION_BUS_ADDRESS: address })
const ev = (expression) => mascot.evaluate(expression)
// Os prints da ilha (com WISP_E2E_SHOTS): só a cápsula, no tamanho dela.
const SHOTS = process.env.WISP_E2E_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const shoot = async (name) => {
  if (!SHOTS) return
  await sleep(400)
  const box = await ev(
    `(() => { const r = document.querySelector('.island').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height } })()`
  )
  const { data } = await mascot.send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...box, scale: 2 }
  })
  if (data) writeFileSync(join(SHOTS, `ilha-${name}.png`), Buffer.from(data, 'base64'))
}
const island = () =>
  ev(`(() => { const i = document.querySelector('.island'); return i ? {
    mode: [...i.classList].find(c => c.startsWith('mode-'))?.slice(5) ?? null,
    tone: [...i.classList].find(c => c.startsWith('tone-'))?.slice(5) ?? null,
    title: i.querySelector('.island-text strong, .island-status')?.textContent ?? '',
    x: window.screenX,
    y: window.screenY
  } : null })()`)
const mode = (want, ms = 6000) => waitFor(async () => (await island())?.mode === want, ms)
/** Clica num botão da ilha pelo texto ou pelo aria-label (o cursor fica onde está). */
const press = (selector, label) =>
  ev(
    `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find(b => (b.getAttribute('aria-label') ?? b.textContent.trim()) === ${JSON.stringify(label)} && !b.disabled); b?.click(); return !!b })()`
  )
const text = (selector) =>
  ev(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? null`)

console.log('== Recolhida no centro do topo')
away()
let s = await waitFor(island, 5000)
check('I1 a janela no centro do topo', s?.x === 460 && s?.y === 4, JSON.stringify(s))
// Depois da saudação, que ela mostra espiando.
check('I2 sozinha, ela recolhe', await mode('compact', 10000))
s = await island()
check('I3 parada, só o nome', s.title === 'Wisp' && s.tone === 'calm', JSON.stringify(s))
await shoot('recolhida')
check(
  'I3b com a música tocando, a bolinha dela na cápsula',
  await waitFor(() => ev(`!!document.querySelector('.island-dots .dot.music')`), 5000)
)
await sleep(300)
// Primeiro fora da cápsula (o cursor nela faz ela espiar).
const outside = windowAt(650, 70)
const capsule = windowAt(800, 20)
check('I4 fora da cápsula, o clique é de quem está atrás', outside !== capsule)

console.log('== Espia com o cursor, abre com o clique')
check('I5 o cursor na cápsula: ela espia', await mode('peek', 3000))
await shoot('espiando')
await sleep(400)
check('I6 e a cápsula espiando pega o cursor', windowAt(650, 70) === capsule)
away()
check('I7 o cursor sai: ela recolhe', await mode('compact', 4000))
xdo('mousemove', 800, 20)
await sleep(300)
xdo('click', 1)
check('I8 o clique abre a ilha', await mode('open', 3000))
await sleep(400)
check('I9 e a ilha aberta pega o cursor', windowAt(500, 160) === capsule)

console.log('== A música')
const card = await waitFor(() => text('.island-card.music'), 5000)
check(
  'M1 o cartão da música: a faixa, o artista, o player e a capa',
  /Canção da Ilha/.test(card ?? '') &&
    /Wisp e Banda · Toca Teste/.test(card ?? '') &&
    (await ev(
      `document.querySelector('.island-card.music .art img')?.src.startsWith('data:image/png') ?? false`
    )),
  card
)
await shoot('musica')
check('M2 a barra com o tempo (0:3x de 3:20)', /0:3\d[\s\S]*−2:[45]\d/.test(card ?? ''), card)
await press('.island-card.music button', 'Pausar')
s = await waitFor(() => (playerState().status === 'Paused' ? playerState() : null), 4000)
check('M3 pausar pela ilha', s?.calls.includes('PlayPause'), JSON.stringify(s))
check(
  'M4 e o botão vira tocar',
  await waitFor(
    () => ev(`!!document.querySelector('.island-card.music button[aria-label="Tocar"]')`),
    4000
  )
)
await press('.island-card.music button', 'Próxima')
check(
  'M5 próxima: a outra faixa',
  !!(await waitFor(
    async () => /Segunda Faixa/.test((await text('.island-card.music')) ?? ''),
    4000
  )),
  await text('.island-card.music')
)
await press('.island-card.music button', 'Aleatório')
await press('.island-card.music button', 'Repetir')
s = await waitFor(() => {
  const state = playerState()
  return state.shuffle && state.loop === 'Playlist' ? state : null
}, 4000)
check('M6 aleatório e repetir a lista', !!s, JSON.stringify(playerState()))
// Pular para o meio da faixa: um clique de verdade no meio da barra.
const bar = await ev(`(() => {
  const box = document.querySelector('.island-card.music .bar.seekable').getBoundingClientRect()
  return { x: Math.round(window.screenX + box.left + box.width / 2), y: Math.round(window.screenY + box.top + 7) }
})()`)
xdo('mousemove', bar.x, bar.y)
await sleep(200)
xdo('click', 1)
s = await waitFor(() => playerState().calls.find((c) => c.startsWith('SetPosition')), 4000)
check(
  'M7 a barra pula para o meio da faixa (75 s de 150)',
  !!s && Math.abs(Number(s.split(' ')[1]) - 75_000_000) < 3_000_000,
  s
)
await ev(`(() => {
  const input = document.querySelector('.island-card.music input.volume')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '80')
  input.dispatchEvent(new Event('input', { bubbles: true }))
})()`)
s = await waitFor(() => (playerState().volume === 0.8 ? playerState() : null), 4000)
check('M8 o volume do player', !!s, JSON.stringify(playerState()))

console.log('== Os ajustes')
await press('.island-tab', 'Ajustes')
await waitFor(() => ev(`!!document.querySelector('.island-card.settings')`), 3000)
await shoot('ajustes')
await press('.island-card.settings .segments button', '10 s')
check(
  'S1 recolher em 10 s vai para o config.json',
  !!(await waitFor(() => config().islandAutoClose === 10, 3000)),
  JSON.stringify(config())
)
await press('.island-tab', 'Início')
away()
check(
  'S2 o cursor sai: a barrinha da contagem, e ela continua aberta',
  !!(await waitFor(() => ev(`!!document.querySelector('.island-countdown')`), 3000)) &&
    (await island()).mode === 'open'
)
check('S3 e recolhe sozinha depois dos 10 s', await mode('compact', 13000))

console.log('== Um pedido de permissão')
wisp(home, '--show')
const chat = await connect('/chat/')
await waitFor(() => chat.evaluate(`!!document.querySelector('.pane .composer')`), 15000)
wisp(home, '--ask', '[pede ls -la]')
await waitFor(() => chat.evaluate(`!!document.querySelector('.pane .permission-pending')`), 8000)
// Com o painel à vista, o card está lá: a ilha só espia.
await sleep(600)
check('P1 com o painel à vista, a ilha não abre', (await island()).mode !== 'open')
wisp(home, '--toggle')
check('P2 o painel sai da frente: a ilha abre com o pedido', await mode('open', 5000))
const alert = await waitFor(() => text('.island-card.alert'), 3000)
check(
  'P3 o cartão diz quem pede e o comando, com Negar, Permitir e Sempre',
  /O Claude quer rodar um comando/.test(alert ?? '') &&
    /ls -la/.test(alert ?? '') &&
    /Negar/.test(alert ?? '') &&
    /Permitir/.test(alert ?? '') &&
    /Sempre/.test(alert ?? ''),
  alert
)
await shoot('pedido')
await sleep(1500)
check('P4 o cursor fora: com o pedido, ela continua aberta', (await island()).mode === 'open')
check('P5 Permitir pela ilha', await press('.island-card.alert button', 'Permitir'))
check(
  'P7 respondido, ela recolhe',
  !!(await waitFor(async () => (await island()).mode !== 'open', 6000))
)
// O painel escondido não desenha os eventos: a conversa aparece quando ele volta.
wisp(home, '--show')
const allowed = await waitFor(async () => {
  const t = await chat.evaluate(`document.querySelector('.pane .messages')?.innerText ?? ''`)
  return /Permitido pela ilha/.test(t) && /Rodei ls -la/.test(t) ? t : null
}, 8000)
check(
  'P6 o Claude segue, e a conversa diz que foi pela ilha',
  !!allowed,
  await chat.evaluate(`document.querySelector('.pane .messages')?.innerText ?? ''`)
)
wisp(home, '--toggle')

console.log('== A conversa na ilha')
await waitFor(async () => (await island()).mode === 'compact', 6000)
xdo('mousemove', 800, 20)
await sleep(300)
xdo('click', 1)
await mode('open', 3000)
const task = await waitFor(() => text('.island-card.task'), 4000)
check(
  'T1 a conversa com o passo e o começo da resposta',
  /Rodar ls -la/.test(task ?? '') && /pronto/.test(task ?? ''),
  task
)
await shoot('conversa')
const pills = await ev(
  `[...document.querySelectorAll('.island-pills .pill')].map(p => p.innerText.replace(/\\s+/g, ' ')).join(' | ')`
)
check(
  'T2 as pílulas: a conversa e a música',
  /pronto/.test(pills) && /Segunda Faixa/.test(pills),
  pills
)
await press('.island-pills .pill-main', 'Segunda Faixa')
await ev(`document.querySelector('.island-pills .pill.music .pill-main')?.click()`)
check(
  'T3 a pílula da música mostra o cartão dela',
  !!(await waitFor(() => ev(`!!document.querySelector('.island-card.music')`), 3000))
)

console.log('== Recolher com um pedido esperando')
wisp(home, '--ask', '[pede git status]')
const second = await waitFor(
  async () => (/git status/.test((await text('.island-card.alert')) ?? '') ? true : null),
  8000
)
check('R1 o pedido novo aparece na ilha aberta', !!second)
await press('.island-actions button', 'Recolher')
check(
  'R2 recolhida, ela não abre de novo sozinha',
  (await mode('compact', 3000)) || (await island()).mode === 'peek'
)
await sleep(1000)
check(
  'R3 e o pedido continua esperando no painel',
  await chat.evaluate(`!!document.querySelector('.pane .permission-pending')`)
)
xdo('mousemove', 800, 20)
await sleep(300)
xdo('click', 1)
check(
  'R4 aberta de novo, o pedido volta',
  !!(await waitFor(async () => /git status/.test((await text('.island-card.alert')) ?? ''), 4000))
)
await sleep(700)
await press('.island-card.alert button', 'Negar')
check(
  'R5 Negar pela ilha',
  !!(await waitFor(
    async () =>
      /Negado pela ilha/.test(
        await chat.evaluate(`document.querySelector('.pane .messages')?.innerText ?? ''`)
      ),
    6000
  ))
)

console.log('== Abrir ao passar o mouse')
await press('.island-tab', 'Ajustes')
await ev(
  `[...document.querySelectorAll('.island-card.settings label')].find(l => /passar o mouse/.test(l.textContent))?.querySelector('input').click()`
)
check('H1 vai para o config.json', !!(await waitFor(() => config().islandHoverOpen === true, 3000)))
away()
await mode('compact', 14000)
xdo('mousemove', 800, 20)
check('H2 o cursor na cápsula a abre inteira', await mode('open', 3000))
away()
check('H3 aberta pelo cursor, ela recolhe logo que ele sai', await mode('compact', 3000))

console.log('== O painel logo abaixo')
xdo('mousemove', 800, 20)
await mode('open', 3000)
await press('.island-actions button', 'Abrir o painel')
const panel = await waitFor(
  () =>
    chat.evaluate(
      `document.visibilityState === 'visible' ? { x: window.screenX, y: window.screenY, w: window.outerWidth } : null`
    ),
  5000
)
check(
  'D1 o painel abre abaixo da cápsula, centralizado',
  !!panel && panel.y >= 88 && Math.abs(panel.x + panel.w / 2 - 800) <= 2,
  JSON.stringify(panel)
)
away()
check('D2 e a ilha recolhe', !!(await waitFor(async () => (await island()).mode !== 'open', 3000)))

console.log('== Desligada')
await chat.evaluate(`window.wisp.settings.set({ compact: false })`)
await waitFor(async () => (await island()) === null, 4000)
const floating = await ev(
  `({ x: window.screenX, y: window.screenY, w: innerWidth, h: innerHeight })`
)
check(
  'I14 sem a ilha, o mascote volta a flutuar',
  floating.w === 128 && floating.h === 128 && floating.y > 4,
  JSON.stringify(floating)
)
check(
  'I15 e a janela inteira pega o cursor de novo',
  windowAt(floating.x + 20, floating.y + 20) === windowAt(floating.x + 64, floating.y + 80)
)
check(
  'I16 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
player.kill()
try {
  process.kill(Number(busPid))
} catch {
  // Já saiu.
}
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
