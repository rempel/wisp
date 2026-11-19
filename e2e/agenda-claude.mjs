// A agenda que o Claude marca (Fase 83), de ponta a ponta, com o Claude Code de mentira: o pedido
// vira o card da schedule_task (com o nome, o horário em palavras e o prompt); permitido, a
// tarefa entra no config.json; rodada, o resultado aparece na Wisp e entra no diário. E a Wisp
// (Fase 82): a primeira aba, sem o fechar.
// Uso: node e2e/agenda-claude.mjs (veja e2e/run.sh).
import { readdirSync, readFileSync } from 'node:fs'
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
const home = testHome()
const config = () => JSON.parse(readFileSync(join(configDir(home.home), 'config.json'), 'utf8'))

const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)

console.log('== A Wisp')
const first = await ev(`(() => {
  const tab = document.querySelector('.tab')
  return tab ? { title: tab.querySelector('.tab-title')?.textContent, close: !!tab.querySelector('.tab-close'), mark: !!tab.querySelector('.tab-main-mark') } : null
})()`)
check(
  'A1 a primeira aba é a Wisp, com a estrela e sem o fechar',
  first?.title === 'Wisp' && first.mark && !first.close,
  JSON.stringify(first)
)

const answers = () =>
  ev(`[...document.querySelectorAll('.pane.focused .msg.assistant')].map(e => e.innerText.trim())`)
const say = async (text) => {
  await ev(`document.querySelector('.pane.focused .composer textarea').focus()`)
  await chat.send('Input.insertText', { text })
  await sleep(200)
  await ev(`document.querySelector('.pane.focused .composer').requestSubmit()`)
}

console.log('== O card')
await say('[agenda Conferir o deploy|Confira se o deploy passou|120]')
const card = await waitFor(
  () => ev(`document.querySelector('.pane .permission-pending')?.innerText ?? null`),
  10000
)
check(
  'A2 o card diz o que vai ser agendado, em palavras',
  /Agendar uma tarefa/.test(card ?? '') &&
    /Conferir o deploy/.test(card ?? '') &&
    /uma vez, em/.test(card ?? '') &&
    /Confira se o deploy passou/.test(card ?? '') &&
    /modo Pedir/.test(card ?? ''),
  card
)
check('A3 antes do OK, nada é gravado', !(config().scheduledTasks ?? []).length)
await sleep(1200)
await ev(
  `[...document.querySelectorAll('.pane .permission-pending button')].find(b => b.textContent.trim() === 'Permitir')?.click()`
)
const done = await waitFor(
  () => answers().then((list) => list.find((text) => /Tarefa agendada/.test(text)) ?? null),
  10000
)
check('A4 permitido, o Claude agenda', !!done, done)
const task = (config().scheduledTasks ?? [])[0]
check(
  'A5 a tarefa entra no config.json: uma vez, do Claude, para todos os lugares',
  task?.name === 'Conferir o deploy' &&
    task.repeat === 'once' &&
    task.by === 'claude' &&
    task.deliver?.length === 4,
  JSON.stringify(task)
)

console.log('== A entrega')
const ran = await ev(`window.wisp.settings.runTask(${JSON.stringify(task?.id ?? '')})`)
check('A6 rodar agora abre a tarefa numa aba', ran?.ok === true, JSON.stringify(ran))
// O fim da tarefa manda o resultado para a Wisp: um aviso com o nome dela.
await sleep(1500)
await ev(`window.wisp.tabs.show(document.querySelector('.tab')?.dataset.tab ?? '')`)
const posted = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane.focused .notice')].map(e => e.innerText).find(t => /Conferir o deploy/.test(t)) ?? null`
    ),
  10000
)
check('A7 o resultado aparece na Wisp', !!posted, posted)
const diaryDir = join(dataDir(home.home), 'memoria', 'diario')
const diary = await waitFor(() => {
  try {
    const files = readdirSync(diaryDir)
    const text = files.map((name) => readFileSync(join(diaryDir, name), 'utf8')).join('\n')
    return /Conferir o deploy:/.test(text) ? text : null
  } catch {
    return null
  }
}, 5000)
check('A8 e entra no diário', !!diary, diary)

check(
  'A9 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
