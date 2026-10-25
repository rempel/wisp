// As emoções e as danças dos avatares (Fase 27), de ponta a ponta. A galeria das configurações
// mostra cada emoção no mascote, com a troca atuada (o susto), o rosto, a cor e o sinal no ar, e
// depois ele volta ao rosto de sempre; as danças tocam na camada da dança. O Claude mostra uma
// emoção ou dança com a ferramenta express, sem card de permissão, e o card dela diz qual. Falando,
// a boca abre e fecha. O fantasminha levanta os bracinhos. Com menos movimento, o rosto muda mas o
// corpo não anima.
// Uso: node e2e/emocoes.mjs (veja e2e/run.sh).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome()
const config = () => JSON.parse(readFileSync(join(home.home, '.config/wisp/config.json'), 'utf8'))

const mascot = await startApp(home)
const m = (expression) => mascot.evaluate(expression)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const stage = () =>
  m(
    `(() => { const s = document.querySelector('.stage'); return { ...s.dataset, emoteArt: s.querySelector('.emote')?.dataset.emote ?? null } })()`
  )

console.log('== A galeria, nas configurações')
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
await waitFor(() => ev(`!!document.querySelector('.gallery-chip')`), 5000)
const chips = await ev(
  `[...document.querySelectorAll('.gallery-chips')].map(g => [...g.querySelectorAll('.gallery-chip')].map(b => b.textContent))`
)
check(
  'G1 trinta emoções e doze danças, com os nomes em português',
  chips?.[0]?.length === 30 &&
    chips?.[1]?.length === 12 &&
    chips[0].includes('triste') &&
    chips[0].includes('deslumbrado') &&
    chips[1].includes('requebrar'),
  JSON.stringify(chips)
)
const select = `[...document.querySelectorAll('.settings-row')].find(r => r.querySelector('.settings-label')?.textContent === 'Dança com música')?.querySelector('select')`
check(
  'G2 a dança da música, de tudo um pouco por padrão',
  (await ev(`${select}?.value`)) === 'mix' && (await ev(`${select}?.options.length`)) === 12
)

console.log('== Triste, pela galeria')
// A saudação de quando o app abre (um sorriso) passa primeiro.
const before = await waitFor(async () => {
  const value = await stage()
  return value.mouth ? null : value
}, 6000)
check(
  'E1 parado, o rosto de sempre: os LEDs, sem boca, sem emoção',
  before.eyes === 'normal' && !before.mouth && !before.feel && !before.emote,
  JSON.stringify(before)
)
const idleStop = await m(`getComputedStyle(document.querySelector('.shell-1')).stopColor`)
await ev(`document.querySelector('.gallery-chip[data-emotion="sad"]').click()`)
// A troca é atuada: o susto começa na hora (uma animação na camada .act).
const acted = await waitFor(
  () => m(`document.querySelector('.act').getAnimations().length > 0`),
  600,
  20
)
check('E2 a troca atuada: o susto começa antes do rosto trocar', !!acted)
const sad = await waitFor(async () => {
  const value = await stage()
  return value.feel === 'sad' ? value : null
}, 3000)
check(
  'E3 triste: olhos tristes, boca para baixo, azulado, nuvem de chuva',
  sad?.eyes === 'sad' &&
    sad?.mouth === 'frown' &&
    sad?.tint === 'blue' &&
    sad?.emote === 'cloud' &&
    sad?.emoteArt === 'cloud',
  JSON.stringify(sad)
)
// A cor, as bochechas e a sombra mudam aos poucos (0,3 s).
await sleep(400)
const sadLook = await m(`(() => {
  const s = document.querySelector('.stage')
  return {
    stop: getComputedStyle(s.querySelector('.shell-1')).stopColor,
    plain: getComputedStyle(s).getPropertyValue('--shell-1').trim(),
    gloom: getComputedStyle(s.querySelector('.gloom')).opacity,
    feel: s.querySelector('.feel').getAnimations().map(a => a.animationName)
  }
})()`)
check(
  'E4 a cor entra no casco, a sombra na testa, e o corpo pende devagar',
  sadLook.plain === '#5eead4' &&
    sadLook.stop !== idleStop &&
    Math.abs(Number(sadLook.gloom) - 0.35) < 0.01 &&
    sadLook.feel.includes('feel-sway'),
  JSON.stringify({ ...sadLook, idleStop })
)
const back = await waitFor(async () => {
  const value = await stage()
  return !value.feel && value.eyes === 'normal' ? value : null
}, 7000)
check(
  'E5 uns segundos depois, ele volta ao rosto de sempre',
  !!back && !back.mouth && !back.emoteArt,
  JSON.stringify(back ?? (await stage()))
)

console.log('== Uma dança, pela galeria')
await ev(`document.querySelector('.gallery-chip[data-dance="spin"]').click()`)
const spin = await waitFor(
  () =>
    m(
      `(() => { const s = document.querySelector('.stage'); return s.dataset.dance === 'spin' ? s.querySelector('.groove').getAnimations().map(a => a.animationName) : null })()`
    ),
  3000
)
check(
  'D1 girar: a camada da dança gira (com as notinhas)',
  spin?.includes('dance-spin') &&
    (await m(`getComputedStyle(document.querySelector('.note')).animationName`)) === 'note-rise',
  JSON.stringify(spin)
)

console.log('== A dança da música, nas configurações')
await ev(
  `(() => { const s = ${select}; s.value = 'shimmy'; s.dispatchEvent(new Event('change', { bubbles: true })) })()`
)
check(
  'D2 gravada no config.json',
  !!(await waitFor(() => config().dance === 'shimmy', 3000)),
  JSON.stringify(config().dance)
)

console.log('== O Claude mostra uma emoção (a ferramenta express)')
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
wisp(home, '--ask', 'deu certo! [sente proud]')
const proud = await waitFor(async () => {
  const value = await stage()
  return value.feel === 'proud' ? value : null
}, 10000)
check(
  'C1 orgulhoso no mascote, com o dourado e a estrelinha',
  proud?.tint === 'gold' && proud?.emote === 'spark' && proud?.eyes === 'closed',
  JSON.stringify(proud)
)
const card = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane .tool')].map(t => t.querySelector('.tool-head').innerText.replace(/\\s+/g, ' ')).find(t => t.includes('express')) ?? null`
    ),
  5000
)
check('C2 o card da ferramenta diz a emoção', /express orgulhoso/.test(card ?? ''), card)
check(
  'C3 sem card de permissão: a ferramenta é liberada',
  (await ev(`document.querySelectorAll('.pane .permission-pending').length`)) === 0 &&
    !existsSync(join(home.home, '.fake-claude/approvals.log'))
)
await waitFor(() => ev(`!document.querySelector('.pane .stop')`), 8000)
wisp(home, '--ask', 'dança! [dança roof]')
check(
  'C4 e uma dança: mãos para o alto',
  !!(await waitFor(async () => (await stage()).dance === 'roof', 10000)),
  JSON.stringify(await stage())
)

console.log('== Falando, a boca abre e fecha')
await waitFor(() => ev(`!document.querySelector('.pane .stop')`), 8000)
await sleep(5000)
wisp(home, '--ask', 'conta devagar [lento]')
const talking = await waitFor(
  () =>
    m(
      `(() => { const s = document.querySelector('.stage'); return s.classList.contains('state-talking') && s.dataset.mouth === 'open' ? s.querySelector('.mouth-move').getAnimations().map(a => a.animationName) : null })()`
    ),
  10000,
  50
)
check('F1 falando: a boca aberta, mexendo', talking?.includes('chatter'), JSON.stringify(talking))
await waitFor(() => ev(`!document.querySelector('.pane .stop')`), 20000)

console.log('== O fantasminha')
await ev(`window.wisp.settings.set({ avatar: 'fantasma' })`)
await waitFor(() => m(`!!document.querySelector('.stage.avatar-fantasma')`), 5000)
await sleep(800)
await ev(`window.wisp.settings.previewMascot({ emotion: 'surprised' })`)
await waitFor(async () => (await stage()).feel === 'surprised', 3000)
await sleep(600)
const arms = await m(`(() => {
  const s = document.querySelector('.stage')
  return { arm: getComputedStyle(s.querySelector('.arm-l')).transform, mouth: getComputedStyle(s.querySelector('.m-O')).opacity, emote: s.querySelector('.emote')?.dataset.emote }
})()`)
check(
  'H1 surpreso: os bracinhos para cima, a boca em O e o "!"',
  arms.arm !== 'none' && arms.mouth === '1' && arms.emote === '!',
  JSON.stringify(arms)
)

console.log('== Menos movimento')
await ev(`window.wisp.settings.set({ reduceMotion: true })`)
await waitFor(() => m(`document.documentElement.classList.contains('reduce-motion')`), 5000)
await ev(`window.wisp.settings.previewMascot({ emotion: 'excited' })`)
const calm = await waitFor(async () => {
  const value = await stage()
  return value.feel === 'excited' ? value : null
}, 3000)
await sleep(300)
const moving = await m(
  `[...document.querySelectorAll('.feel, .act, .arm-move, .emote, .emote-pop, .part')].filter(e => e.getAnimations().length).map(e => e.className + ':' + e.getAnimations().map(a => a.animationName ?? 'take').join('+'))`
)
check(
  'M1 o rosto muda (olhos arregalados), mas o corpo e o sinal não animam',
  calm?.eyes === 'wide' && moving?.length === 0,
  JSON.stringify({ calm, moving })
)

check(
  'Z1 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
