// O batimento (Fase 84), de ponta a ponta, com o Claude Code de mentira: "Conferir agora" roda o
// checklist numa aba à parte, no Haiku; sem nada a dizer, a aba fecha quieta e o diário diz que
// conferiu; com algo, o aviso aparece na Wisp e vai para o diário, e a aba fecha também.
// Uso: node e2e/batimento.mjs (veja e2e/run.sh).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  checks,
  connect,
  dataDir,
  fakeLog,
  sleep,
  startApp,
  stopApp,
  testHome,
  waitFor,
  wisp
} from './lib.mjs'

const { check, failed } = checks()
const home = testHome({
  heartbeat: true,
  heartbeatTimes: ['03:00'],
  heartbeatDays: [0, 1, 2, 3, 4, 5, 6]
})
const memoryDir = join(dataDir(home.home), 'memoria')
mkdirSync(memoryDir, { recursive: true })
const writeChecklist = (text) => writeFileSync(join(memoryDir, 'CHECKLIST.md'), text)
const diary = () => {
  try {
    return readdirSync(join(memoryDir, 'diario'))
      .map((name) => readFileSync(join(memoryDir, 'diario', name), 'utf8'))
      .join('\n')
  } catch {
    return ''
  }
}
writeChecklist('# Checklist\n\n- A agenda de hoje. [quieto]\n')

const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const tabs = () => ev(`document.querySelectorAll('.tab').length`)

console.log('== Sem nada a dizer')
const quiet = await ev(`window.wisp.settings.runTask('batimento-03:00')`)
check('B1 conferir agora roda o batimento', quiet?.ok === true, JSON.stringify(quiet))
const noted = await waitFor(
  () => (/Batimento das 03:00: conferiu, nada de novo/.test(diary()) ? diary() : null),
  15000
)
check('B2 sem nada, o diário diz que conferiu', !!noted, diary())
const closed = await waitFor(async () => ((await tabs()) === 1 ? true : null), 8000)
check(
  'B3 e a aba dele fecha, sem aviso na Wisp',
  !!closed && (await ev(`document.querySelectorAll('.pane .notice').length`)) === 0
)
const spawned = fakeLog(home, 'spawns')
check(
  'B4 no Haiku',
  spawned.some((line) => /--model=haiku|"haiku"/.test(JSON.stringify(line))),
  JSON.stringify(spawned.slice(-1))
)

console.log('== Com algo a dizer')
writeChecklist('# Checklist\n\n- A agenda de hoje.\n')
await ev(`window.wisp.settings.runTask('batimento-03:00')`)
const posted = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane.focused .notice')].map(e => e.innerText).find(t => /Batimento das 03:00/.test(t)) ?? null`
    ),
  15000
)
check('B5 o aviso aparece na Wisp', /Reunião às 9h/.test(posted ?? ''), posted)
check('B6 e entra no diário', /Batimento das 03:00: Reunião às 9h/.test(diary()), diary())
const closedAgain = await waitFor(async () => ((await tabs()) === 1 ? true : null), 8000)
check('B7 a aba dele fecha também', !!closedAgain)

check(
  'B8 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)
await sleep(200)
await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
