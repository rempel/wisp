// As tarefas por evento (Fase 44), de ponta a ponta: uma tarefa que acompanha uma pasta roda quando
// aparece um arquivo novo nela (os que já estavam lá não contam), numa aba com o nome dela, com o
// caminho do arquivo no {evento}; o editor da tarefa mostra o gatilho e a pasta acompanhada.
// Uso: node e2e/gatilhos.mjs (veja e2e/run.sh).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, connect, sleep, startApp, stopApp, testHome, waitFor, wisp } from './lib.mjs'

const { check, failed } = checks()
const home = testHome({
  scheduledTasks: [
    {
      id: 'downloads',
      name: 'Arrumar downloads',
      prompt: 'Chegou: {evento}',
      trigger: 'new-file',
      watch: '~/Baixados',
      time: '09:00',
      days: [1],
      folder: null,
      enabled: true
    }
  ]
})
const watched = join(home.home, 'Baixados')
mkdirSync(watched, { recursive: true })
writeFileSync(join(watched, 'antigo.pdf'), 'já estava')

const mascot = await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const tabsBefore = await ev(`document.querySelectorAll('.tab').length`)

console.log('== Um arquivo novo na pasta')
await sleep(1500)
// Com o painel escondido, a aba da tarefa aparece na frente quando ele abrir.
await ev(`window.wisp.chat.hide()`)
writeFileSync(join(watched, 'nota-fiscal.pdf'), 'nova')
// A aba da tarefa (com o nome dela) na frente.
const tab = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.tab')].find((t) => t.innerText.includes('Arrumar downloads'))?.dataset.tab ?? null`
    ),
  15000
)
// O painel aplica os eventos a cada quadro, e escondido ele não desenha: abre para ver.
wisp(home, '--show')
if (tab) await ev(`window.wisp.tabs.show(${JSON.stringify(tab)})`)
const message = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.pane .msg.user')].map((m) => m.innerText).find((text) => text.includes('Chegou:')) ?? null`
    ),
  15000
)
check(
  'E1 a tarefa roda com o arquivo novo no {evento}',
  /nota-fiscal\.pdf/.test(message ?? ''),
  message
)
check('E2 o que já estava lá não conta', !/antigo\.pdf/.test(message ?? ''), message)
const titles = await ev(
  `[...document.querySelectorAll('.tab .tab-title')].map((e) => e.textContent)`
)
check(
  'E3 numa aba nova, com o nome da tarefa',
  titles.length > tabsBefore && titles.some((title) => title.includes('Arrumar downloads')),
  JSON.stringify(titles)
)

console.log('== O editor da tarefa')
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]')?.click()`)
const editor = await waitFor(
  () =>
    ev(
      `(() => { const s = document.querySelector('.automation-trigger'); return s ? { value: s.value, watch: [...document.querySelectorAll('.automation-item input')].find((i) => i.getAttribute('aria-label') === 'Pasta acompanhada')?.value ?? null, time: !!document.querySelector('.automation-item input[type=time]') } : null })()`
    ),
  8000
)
check('E4 o gatilho "arquivo novo" no editor', editor?.value === 'new-file', JSON.stringify(editor))
check(
  'E5 com a pasta acompanhada, sem o horário',
  editor?.watch === '~/Baixados' && editor?.time === false,
  JSON.stringify(editor)
)
check(
  'E6 sem erros nas páginas',
  mascot.logs.length === 0 && chat.logs.length === 0,
  [...mascot.logs, ...chat.logs].join('\n')
)

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
