// Os prompts salvos e as tarefas agendadas (Fase 26), de ponta a ponta. O menu da barra mostra os
// prompts salvos; escolher um põe o texto na caixa com a pasta, a hora e o que foi copiado, sem
// mandar nada. Uma tarefa marcada para daqui a pouco roda com o painel fechado: abre uma aba com o
// nome dela, no modo Pedir (mesmo com o config.json no Automático), e o card do comando espera.
// "Rodar agora", nas configurações, faz o mesmo na hora.
// Uso: node e2e/agendadas.mjs (veja e2e/run.sh).
import { homedir } from 'node:os'
import {
  checks,
  connect,
  fakeLog,
  sleep,
  startApp,
  stopApp,
  testHome,
  waitFor,
  wisp
} from './lib.mjs'

const { check, failed } = checks()
// A tarefa fica para o minuto cheio depois de 25 s (o agendador começa 3 s depois de o Wisp
// abrir), no fuso do app (o TZ do lib.mjs).
const due = new Date(Math.ceil((Date.now() + 25_000) / 60_000) * 60_000)
const time = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
}).format(due)
const home = testHome({
  permissionMode: 'auto',
  prompts: [{ name: 'revisar', text: 'Revise {pasta} às {hora}. Erro: {copiado}' }],
  scheduledTasks: [
    {
      id: 'diaria',
      name: 'Lista diária',
      prompt: 'lista os arquivos de {pasta} [pede ls -la]',
      time,
      days: [0, 1, 2, 3, 4, 5, 6],
      folder: null,
      enabled: true
    },
    {
      id: 'manual',
      name: 'Resumo manual',
      prompt: 'resume o dia',
      time: '03:00',
      days: [],
      folder: null,
      enabled: false
    }
  ]
})
void homedir

await startApp(home)
wisp(home, '--show')
const chat = await connect('/chat/')
const ev = (expression) => chat.evaluate(expression)
await waitFor(() => ev(`!!document.querySelector('.pane .composer')`), 15000)
const key = async (k, code, vk) => {
  for (const type of ['keyDown', 'keyUp'])
    await chat.send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk })
  await sleep(150)
}
const draft = () => ev(`document.querySelector('.pane .composer textarea').value`)

console.log('== Prompts salvos no menu da barra')
await ev(`document.querySelector('.pane .composer textarea').focus()`)
// Copiar pede um gesto do usuário: o DevTools faz as vezes dele.
const copied = (
  await chat.send('Runtime.evaluate', {
    expression: `(() => { const t = document.createElement('textarea'); t.value = 'TypeError: x is undefined'; document.body.append(t); t.select(); const ok = document.execCommand('copy'); t.remove(); document.querySelector('.pane .composer textarea').focus(); return ok })()`,
    userGesture: true,
    returnByValue: true
  })
).result?.value
await chat.send('Input.insertText', { text: '/rev' })
const menu = await waitFor(
  () =>
    ev(
      `(() => { const o = [...document.querySelectorAll('.slash-option')].map(e => e.innerText.replace(/\\s+/g, ' ')); return o.length ? o : null })()`
    ),
  3000
)
check(
  'A1 o prompt salvo aparece no menu, marcado e com o começo do texto',
  /\/revisar prompt salvo Revise \{pasta\}/.test(menu?.[0] ?? ''),
  JSON.stringify(menu)
)
await key('Enter', 'Enter', 13)
const text = await waitFor(async () => {
  const value = await draft()
  return value.startsWith('Revise') ? value : null
}, 3000)
check(
  'A2 o Enter põe o texto na caixa, com a pasta e a hora',
  /^Revise \/\S+ às \d\d:\d\d\. Erro: /.test(text ?? '') && !/\{(pasta|hora)\}/.test(text ?? ''),
  JSON.stringify(text)
)
check(
  'A3 e com o que foi copiado',
  copied === true && /Erro: TypeError: x is undefined$/.test(text ?? ''),
  JSON.stringify({ copied, text })
)
check(
  'A4 nada foi mandado: o texto espera na caixa',
  (await ev(`document.querySelectorAll('.pane .msg.user').length`)) === 0
)
await ev(
  `(() => { const t = document.querySelector('.pane .composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, '/revisar'); t.dispatchEvent(new Event('input', { bubbles: true })) })()`
)
await sleep(200)
await ev(`document.querySelector('.pane .composer .send').click()`)
const byName = await waitFor(async () => ((await draft()).startsWith('Revise') ? true : null), 3000)
check(
  'A5 /revisar mandado pelo botão também vira o texto, sem ir para o Claude',
  !!byName && (await ev(`document.querySelectorAll('.pane .msg.user').length`)) === 0
)
await ev(
  `(() => { const t = document.querySelector('.pane .composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, ''); t.dispatchEvent(new Event('input', { bubbles: true })) })()`
)

console.log(`== A tarefa das ${time}, com o painel fechado`)
const tabsBefore = await ev(`document.querySelectorAll('.tab').length`)
await ev(`window.wisp.chat.hide()`)
const ran = await waitFor(
  () =>
    ev(
      `(() => { const p = [...document.querySelectorAll('.pane')].find(p => p.querySelector('.msg.user')?.innerText.includes('lista os arquivos')); return p ? p.dataset.conversation : null })()`
    ),
  due.getTime() - Date.now() + 20_000,
  500
)
check('T1 na hora, a tarefa abre uma aba e manda o prompt', !!ran)
const tabTitles = await ev(`[...document.querySelectorAll('.tab')].map(t => t.innerText.trim())`)
check(
  'T2 a aba nova leva o nome da tarefa',
  tabTitles.some((title) => title.includes('Lista diária')) && tabTitles.length > tabsBefore,
  JSON.stringify(tabTitles)
)
const prompt = await ev(
  `[...document.querySelectorAll('.pane')].find(p => p.dataset.conversation === ${JSON.stringify(ran)})?.querySelector('.msg.user')?.innerText ?? ''`
)
check(
  'T3 com a pasta preenchida',
  prompt.includes(`lista os arquivos de ${home.home}`),
  JSON.stringify(prompt)
)
const pane = `[...document.querySelectorAll('.pane')].find(p => p.dataset.conversation === ${JSON.stringify(ran)})`
const mode = await ev(`${pane}?.querySelector('.mode-pill')?.className ?? ''`)
check('T4 no modo Pedir, mesmo com o config.json no Automático', /mode-default/.test(mode), mode)
const card = await waitFor(
  () => ev(`${pane}?.querySelector('.permission-pending')?.innerText ?? null`),
  10000
)
check('T5 o card do comando espera você', /ls -la/.test(card ?? ''), card)
const spawns = fakeLog(home, 'spawns').map((line) => JSON.parse(line))
const spawn = spawns.find((item) => item.args.join(' ').includes('--permission-mode default'))
check(
  'T6 o Claude Code subiu no modo default (o Pedir)',
  !!spawn && !spawns.some((item) => item.args.join(' ').includes('--permission-mode auto')),
  JSON.stringify(spawns.map((item) => item.args.join(' ')))
)
await sleep(800)
await ev(
  `[...${pane}.querySelectorAll('.permission-pending button')].find(b => b.textContent.trim() === 'Negar').click()`
)

console.log('== Rodar agora, nas configurações')
wisp(home, '--show')
await sleep(500)
await ev(`document.querySelector('.header .icon-button[aria-label="Configurações"]').click()`)
await waitFor(() => ev(`!!document.querySelector('.settings .automation')`), 5000)
const settings = await ev(`document.querySelector('.settings').innerText`)
// Os títulos das seções vêm em maiúsculas (o CSS): a busca não liga para isso.
const automation = settings.slice(settings.search(/prompts salvos/i))
check(
  'T7 as configurações listam os prompts e as tarefas, com a próxima vez e a última',
  /tarefas agendadas/i.test(automation) &&
    /rodou (agora|há)/.test(automation) &&
    /Desligada/.test(automation),
  automation.slice(0, 900)
)
const tabsNow = await ev(`document.querySelectorAll('.tab').length`)
await ev(
  `(() => { const item = [...document.querySelectorAll('.automation-item')].find(i => i.querySelector('input')?.value === 'Resumo manual'); [...item.querySelectorAll('button')].find(b => b.textContent.trim() === 'Rodar agora').click() })()`
)
const status = await waitFor(
  () =>
    ev(
      `[...document.querySelectorAll('.automation-item [role=status]')].map(e => e.textContent).join(' ') || null`
    ),
  5000
)
check(
  'T8 rodar agora (mesmo desligada) abre outra aba',
  /Rodando numa aba nova/.test(status ?? ''),
  status
)
await ev(
  `document.querySelector('.header .icon-button[aria-label="Voltar para a conversa"]').click()`
)
const tabsAfter = await waitFor(async () => {
  const n = await ev(`document.querySelectorAll('.tab').length`)
  return n > tabsNow ? n : null
}, 5000)
check('T9 a aba da tarefa manual está lá', !!tabsAfter, `${tabsNow} → ${tabsAfter}`)
check('T10 sem erros nas páginas', chat.logs.length === 0, chat.logs.join('\n'))

await stopApp()
home.remove()
console.log(failed() ? `${failed()} FAIL` : 'all ok')
process.exit(failed() ? 1 : 0)
