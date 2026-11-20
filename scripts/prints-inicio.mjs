// Os prints do Início como painel de controle (Fases 92 a 97), com dados de exemplo: uma agenda da
// semana (um .ics), as suas tarefas, os hábitos, anotações e o diário de hoje. Rodam num X virtual,
// como os roteiros de ponta a ponta.
// Uso: npm run build && e2e/run.sh scripts/prints-inicio.mjs [pasta] [temas: light,dark,contrast]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  connect,
  dataDir,
  ROOT,
  sleep,
  startApp,
  stopApp,
  testHome,
  waitFor,
  wisp
} from '../e2e/lib.mjs'

// O app de teste roda no fuso de São Paulo (e2e/lib.mjs): as datas daqui também.
process.env.TZ = 'America/Sao_Paulo'
const out = process.argv[2] ?? join(ROOT, 'docs')
const themes = (process.argv[3] ?? 'light,dark').split(',')
mkdirSync(out, { recursive: true })

const pad = (n) => String(n).padStart(2, '0')
const stamp = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
const day = (offset, hour, minute = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  d.setHours(hour, minute, 0, 0)
  return d
}
const monday = -((new Date().getDay() + 6) % 7)

function calendar() {
  const events = [
    ['Daily do time', 0, 9, 30, 15],
    ['Revisar o PR do checkout', 0, 11, 0, 60],
    ['Deploy da loja v2.3', 0, new Date().getHours() + 1, 30, 60],
    ['Call com a Ana (site)', 0, 17, 0, 30],
    ['Academia', 0, 19, 0, 60],
    ['Planejamento', monday, 14, 0, 90],
    ['Dentista', monday + 1, 11, 0, 60],
    ['Workshop de testes', monday + 2, 15, 0, 120],
    ['Feira', monday + 5, 10, 0, 120],
    ['Aniversário da Bia', 6, 20, 0, 120],
    ['Reunião de produto', 9, 10, 0, 60]
  ]
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//wisp//prints//PT']
  events.forEach(([title, offset, hour, minute, length], i) => {
    const start = day(offset, hour, minute)
    lines.push(
      'BEGIN:VEVENT',
      `UID:print-${i}@wisp`,
      'DTSTAMP:20260101T000000Z',
      `SUMMARY:${title}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(new Date(start.getTime() + length * 60_000))}`,
      'END:VEVENT'
    )
  })
  lines.push('END:VCALENDAR', '')
  return lines.join('\r\n')
}

async function shots(theme) {
  const contrast = theme === 'contrast'
  const home = testHome({
    windowMode: 'full',
    theme: contrast ? 'dark' : theme,
    highContrast: contrast,
    calendar: true,
    calendarFiles: ['~/agenda.ics']
  })
  writeFileSync(join(home.home, 'agenda.ics'), calendar())
  const today = new Date()
  const diary = join(dataDir(home.home), 'memoria', 'diario')
  mkdirSync(diary, { recursive: true })
  writeFileSync(
    join(diary, `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.md`),
    [
      '- 08:00 Tarefa "Resumo da manhã" rodou e foi entregue no Telegram.',
      '- 11:40 Anotou na memória: o deploy da loja é sempre na sexta.',
      '- 13:05 Telegram: "me lembra de comprar café amanhã" virou um lembrete.',
      '- 14:30 Batimento: nada urgente; o PR #87 espera há 2 dias.'
    ].join('\n') + '\n'
  )
  await startApp(home)
  wisp(home, '--show')
  const chat = await connect('/chat/')
  const ev = (expression) => chat.evaluate(expression)
  await waitFor(() => ev(`!!document.querySelector('.home-grid')`), 15000)
  // Maximizada, como no uso de todo dia.
  await ev(`window.wisp.chat.maximize()`)
  await ev(`(async () => {
    const h = window.wisp.home
    const d = (n) => { const x = new Date(); x.setHours(0,0,0,0); x.setDate(x.getDate() + n); return x.getTime() }
    if ((await h.todos()).length === 0) {
      await h.changeTodo({ kind: 'add', text: 'Corrigir o bug do carrinho' })
      await h.changeTodo({ kind: 'add', text: 'Renovar o domínio da loja', due: d(0), star: true })
      await h.changeTodo({ kind: 'add', text: 'Responder a issue #142 (frete)', due: d(0) })
      await h.changeTodo({ kind: 'add', text: 'Migrar o banco do site', due: d(1) })
      await h.changeTodo({ kind: 'add', text: 'Escrever o post do lançamento', due: d(7) })
      const list = await h.todos()
      await h.changeTodo({ kind: 'done', id: list.find(t => t.text.startsWith('Corrigir')).id, done: true })
    }
    if ((await h.habits()).length === 0) {
      const key = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10) }
      for (const name of ['Exercício', 'Leitura', 'Meditar']) await h.changeHabit({ kind: 'add', name })
      const habits = await h.habits()
      for (const [i, habit] of habits.entries())
        for (let n = 0; n < 6; n++) if ((n + i) % 3 !== 2) await h.changeHabit({ kind: 'toggle', id: habit.id, day: key(n) })
    }
    for (const text of ['A Ana é a designer do site.', 'Prefere respostas curtas, em português.', 'O deploy da loja é sempre na sexta à tarde.']) await h.note(text)
  })()`)
  // Reabre o Início para ler tudo de novo.
  await ev(
    `[...document.querySelectorAll('.sidebar-item')].find(b => b.getAttribute('aria-label') === 'Wisp')?.click()`
  )
  await sleep(300)
  await ev(
    `[...document.querySelectorAll('.sidebar-item')].find(b => b.getAttribute('aria-label') === 'Início')?.click()`
  )
  await sleep(2500)
  const take = async (name) => {
    const shot = await chat.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(out, `${name}.png`), Buffer.from(shot.data, 'base64'))
    console.log(`${name}.png`)
  }
  await take(`inicio-${theme}`)
  await ev(`document.querySelector('.home-main').scrollTop = 540`)
  await sleep(300)
  await take(`inicio-embaixo-${theme}`)
  await ev(`document.querySelector('.home-main').scrollTop = 0`)
  if (theme === themes[0]) {
    await ev(`document.querySelector('.home-toolbar .btn').click()`)
    await sleep(600)
    await take(`inicio-editando-${theme}`)
    await ev(`document.querySelector('.home-toolbar .btn').click()`)
    await ev(`document.querySelector('.sidebar-collapse').click()`)
    await sleep(600)
    await take(`inicio-barra-aberta-${theme}`)
  }
  await stopApp()
  home.remove()
}

for (const theme of themes) await shots(theme)
