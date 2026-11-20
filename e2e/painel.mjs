// O Início como painel de controle (Fases 92 a 97), de ponta a ponta: o trilho de ícones; os blocos
// do modelo; a edição (arrastar com o mouse, as setas do teclado, o tamanho com Shift, esconder,
// trazer de volta, restaurar), guardada no config.json e de volta depois de fechar e abrir; as suas
// tarefas e os hábitos; o foco; a pergunta que vai para a aba Wisp; o clima desligado.
// Uso: node e2e/painel.mjs (veja e2e/run.sh).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  checks,
  configDir,
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
const home = testHome({ windowMode: 'full' })
const config = () => JSON.parse(readFileSync(join(configDir(home.home), 'config.json'), 'utf8'))

await startApp(home)
wisp(home, '--show')
let chat = await connect('/chat/')
let ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.home-grid')`), 15000)
await sleep(800)

const shown = () => ev(`[...document.querySelectorAll('.home-block')].map(b => b.dataset.block)`)
const key = async (k, code, vk, modifiers = 0) => {
  for (const type of ['keyDown', 'keyUp'])
    await chat.send('Input.dispatchKeyEvent', {
      type,
      key: k,
      code,
      windowsVirtualKeyCode: vk,
      modifiers
    })
  await sleep(150)
}
const center = (selector) =>
  ev(
    `(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } })()`
  )
const mouse = (type, x, y) =>
  chat.send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: 'left',
    buttons: type === 'mouseReleased' ? 0 : 1,
    clickCount: 1
  })

console.log('== O trilho e os blocos do modelo')
const rail = await ev(`document.querySelector('.sidebar').getBoundingClientRect().width`)
check('P1 a sidebar começa como o trilho de ícones', rail > 40 && rail < 80, String(rail))
const first = await shown()
check(
  'P2 os dez blocos do modelo, na ordem',
  JSON.stringify(first) ===
    JSON.stringify([
      'precisa',
      'calendario',
      'agenda',
      'batimento',
      'uso',
      'tarefas',
      'agendado',
      'anotacoes',
      'conversas',
      'semana-wisp'
    ]),
  JSON.stringify(first)
)
check(
  'P3 o relógio e a pergunta no alto',
  await ev(
    `!!document.querySelector('.home-clock strong') && !!document.querySelector('.home-ask input')`
  )
)

console.log('== Editar o Início')
await ev(`document.querySelector('.home-toolbar .btn').click()`)
await waitFor(() => ev(`!!document.querySelector('.home-blocks')`), 3000)
check(
  'P4 a edição mostra a lista dos blocos',
  (await ev(`document.querySelectorAll('.home-blocks li').length`)) === 21
)
// Pelo teclado: a agenda passa o batimento; as tarefas ficam mais largas.
await ev(`document.querySelector('[data-block="agenda"] .home-block-grip').focus()`)
await key('ArrowRight', 'ArrowRight', 39)
await ev(`document.querySelector('[data-block="tarefas"] .home-block-grip').focus()`)
await key('ArrowRight', 'ArrowRight', 39, 8)
const order = await shown()
check(
  'P5 as setas mudam de lugar',
  order.indexOf('agenda') === order.indexOf('batimento') + 1,
  JSON.stringify(order)
)
check(
  'P6 com Shift, o tamanho',
  (await ev(`document.querySelector('[data-block="tarefas"] .home-block-size').textContent`)) ===
    '6×6'
)
// O olho esconde o uso do plano.
await ev(`document.querySelector('[data-block="uso"] .home-block-hide').click()`)
await sleep(200)
check('P7 o olho esconde', !(await shown()).includes('uso'))
// Com o mouse: o calendário arrastado para depois da agenda (a barra mostra onde cai).
const target = await center('[data-block="agenda"]')
const grip = await center('[data-block="calendario"] .home-block-grip')
await mouse('mousePressed', grip.x, grip.y)
for (let step = 1; step <= 8; step++) {
  await mouse(
    'mouseMoved',
    grip.x + ((target.x + target.w / 2 - 8 - grip.x) * step) / 8,
    grip.y + ((target.y - grip.y) * step) / 8
  )
  await sleep(40)
}
await mouse('mouseReleased', target.x + target.w / 2 - 8, target.y)
await sleep(300)
const dragged = await shown()
check(
  'P8 arrastar com o mouse muda a ordem',
  dragged.indexOf('calendario') === dragged.indexOf('agenda') + 1,
  JSON.stringify(dragged)
)
// O canto muda o tamanho: as anotações uma coluna mais largas.
const before = await center('[data-block="conversas"]')
const corner = await center('[data-block="conversas"] .home-block-resize')
await mouse('mousePressed', corner.x, corner.y)
await mouse('mouseMoved', corner.x + before.w / 5 + 20, corner.y + 10)
await mouse('mouseMoved', corner.x + before.w / 5 + 40, corner.y + 10)
await mouse('mouseReleased', corner.x + before.w / 5 + 40, corner.y + 10)
await sleep(300)
const size = await ev(
  `document.querySelector('[data-block="conversas"] .home-block-size').textContent`
)
check('P9 o canto muda o tamanho', size !== '5×5' && size.endsWith('×5'), size)
// A lista traz o clima de volta.
await ev(
  `[...document.querySelectorAll('.home-blocks li button')].find(b => b.textContent === 'Clima').click()`
)
await sleep(200)
check('P10 a lista traz um bloco escondido', (await shown()).includes('clima'))
const off = await waitFor(
  () =>
    ev(`/Open-Meteo/.test(document.querySelector('[data-block="clima"]').innerText) ? true : null`),
  3000
)
check('P11 o clima começa desligado, sem consultar nada', !!off && !config().weather)
await ev(
  `[...document.querySelectorAll('.home-blocks footer .btn')].find(b => /Pronto/.test(b.textContent)).click()`
)
await sleep(800)
const saved = config().homeLayout ?? []
check(
  'P12 a arrumação fica no config.json',
  saved.find((item) => item.id === 'uso')?.hidden === true &&
    saved.find((item) => item.id === 'tarefas')?.w === 6 &&
    saved.find((item) => item.id === 'clima')?.hidden === false,
  JSON.stringify(saved.slice(0, 6))
)

console.log('== As suas tarefas, os hábitos e o foco')
await ev(
  `[...document.querySelectorAll('[data-block="tarefas"] .btn')].find(b => /Nova/.test(b.textContent)).click()`
)
await waitFor(
  () => ev(`!!document.querySelector('[data-block="tarefas"] .inline-add input')`),
  2000
)
await ev(`document.querySelector('[data-block="tarefas"] .inline-add input').focus()`)
await chat.send('Input.insertText', { text: 'Renovar o domínio' })
await ev(`document.querySelector('[data-block="tarefas"] .inline-add').requestSubmit()`)
const todo = await waitFor(
  () => ev(`document.querySelector('[data-block="tarefas"] .todo-text')?.textContent ?? null`),
  3000
)
check('P13 a tarefa nova aparece na lista', todo === 'Renovar o domínio', todo)
await ev(`document.querySelector('[data-block="tarefas"] .todo-check').click()`)
await sleep(300)
const file = join(dataDir(home.home), 'tarefas.json')
const stored = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []
check(
  'P14 feita, ela sai das abertas e fica no tarefas.json',
  stored.length === 1 &&
    stored[0].doneAt !== null &&
    !(await ev(`!!document.querySelector('[data-block="tarefas"] .todo-text')`)),
  JSON.stringify(stored)
)
// Os hábitos: o bloco vem da lista, um hábito novo, hoje marcado.
await ev(`document.querySelector('.home-toolbar .btn').click()`)
await ev(
  `[...document.querySelectorAll('.home-blocks li button')].find(b => b.textContent === 'Hábitos').click()`
)
await ev(
  `[...document.querySelectorAll('.home-blocks li button')].find(b => b.textContent === 'Foco').click()`
)
await ev(`document.querySelector('.home-toolbar .btn').click()`)
await sleep(300)
await ev(`document.querySelector('[data-block="habitos"] .block-tools .icon-button').click()`)
await waitFor(
  () => ev(`!!document.querySelector('[data-block="habitos"] .inline-add input')`),
  2000
)
await ev(`document.querySelector('[data-block="habitos"] .inline-add input').focus()`)
await chat.send('Input.insertText', { text: 'Exercício' })
await ev(`document.querySelector('[data-block="habitos"] .inline-add').requestSubmit()`)
await waitFor(
  () => ev(`!!document.querySelector('[data-block="habitos"] button.habit-mark:not(:disabled)')`),
  3000
)
await ev(
  `[...document.querySelectorAll('[data-block="habitos"] button.habit-mark:not(:disabled)')].pop().click()`
)
const streak = await waitFor(
  () => ev(`document.querySelector('[data-block="habitos"] .habit-streak')?.textContent || null`),
  3000
)
check('P15 marcar hoje conta um dia seguido', streak === '1🔥', streak)
await ev(
  `[...document.querySelectorAll('[data-block="foco"] .btn')].find(b => /25/.test(b.textContent)).click()`
)
const running = await waitFor(
  () =>
    ev(
      `/^2[45]:\\d\\d$/.test(document.querySelector('[data-block="foco"] .ring-text strong').textContent) && /Parar/.test(document.querySelector('[data-block="foco"]').innerText) ? true : null`
    ),
  4000
)
check('P16 o foco de 25 minutos começa (o mesmo modo foco do mascote)', !!running)
await ev(
  `[...document.querySelectorAll('[data-block="foco"] .btn')].find(b => /Parar/.test(b.textContent)).click()`
)

console.log('== Fechar, abrir e perguntar')
await stopApp()
const mascot = await startApp(home)
wisp(home, '--show')
chat = await connect('/chat/')
ev = (expression) => chat.evaluate(expression)
// Já abriu hoje: o Wisp volta na conversa, e o trilho leva ao Início.
await waitFor(() => ev(`!!document.querySelector('.sidebar-item[aria-label="Início"]')`), 15000)
await ev(`document.querySelector('.sidebar-item[aria-label="Início"]').click()`)
await waitFor(() => ev(`!!document.querySelector('.home-grid')`), 5000)
await sleep(800)
const again = await shown()
check(
  'P17 fechar e abrir volta com a mesma arrumação',
  !again.includes('uso') &&
    again.includes('clima') &&
    again.indexOf('calendario') === again.indexOf('agenda') + 1,
  JSON.stringify(again)
)
await ev(`document.querySelector('.home-ask input').focus()`)
await chat.send('Input.insertText', { text: 'Como está a minha semana?' })
await ev(`document.querySelector('.home-ask').requestSubmit()`)
const asked = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane.focused .msg.user')].some(e => /minha semana/.test(e.innerText)) ? true : null`
    ),
  8000
)
check('P18 a pergunta do alto vai para a aba Wisp, e a conversa abre', !!asked)
// Restaurar o padrão.
await ev(
  `[...document.querySelectorAll('.sidebar-item')].find(b => b.getAttribute('aria-label') === 'Início').click()`
)
await waitFor(() => ev(`!!document.querySelector('.home-grid')`), 5000)
await ev(`document.querySelector('.home-toolbar .btn').click()`)
await ev(
  `[...document.querySelectorAll('.home-blocks footer .btn')].find(b => /Restaurar/.test(b.textContent)).click()`
)
await sleep(600)
check('P19 restaurar volta ao modelo', JSON.stringify(await shown()) === JSON.stringify(first))

check(
  'P20 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)
await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
