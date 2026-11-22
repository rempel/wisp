// Os prints do README, em inglês e no modo completo: o Início, o card de uma edição, a bancada, a
// grade, a paleta, o quadro, os três temas e as categorias das configurações. As respostas vêm do
// modo demonstração, com as gravações em inglês de scripts/prints-readme/demo (o app continua com
// as de resources/demo). Rodam num X virtual de 1440 × 900, como os roteiros de ponta a ponta;
// depois, `node scripts/prints-readme-compose.mjs` monta o banner e o themes.png.
// Uso: npm run build && node scripts/prints-readme.mjs [pasta] [prints: home,chat,workbench,...]
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const WIDTH = 1440
const HEIGHT = 900

// Fora do X virtual: roda de novo dentro dele, com a tela do tamanho dos prints.
if (!process.env.WISP_E2E_INNER) {
  execFileSync(
    'dbus-run-session',
    [
      '--',
      'xvfb-run',
      '-a',
      '-s',
      `-screen 0 ${WIDTH}x${HEIGHT}x24`,
      process.execPath,
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2)
    ],
    { stdio: 'inherit', env: { ...process.env, WISP_E2E_INNER: '1' } }
  )
  process.exit(0)
}

const { connect, dataDir, ROOT, sleep, startApp, stopApp, testHome, waitFor, wisp } =
  await import('../e2e/lib.mjs')

process.env.TZ = 'America/Sao_Paulo'
const out = process.argv[2] ?? join(ROOT, 'docs')
const ALL = [
  'home',
  'chat',
  'workbench',
  'palette',
  'board',
  'grid',
  'themes',
  'settings',
  'mascot'
]
const wanted = (process.argv[3] ?? ALL.join(',')).split(',')
mkdirSync(out, { recursive: true })
const DEMO = join(HERE, 'prints-readme', 'demo')

const pad = (n) => String(n).padStart(2, '0')

/** Uma agenda de exemplo (um .ics) em volta de hoje. */
function calendar() {
  const stamp = (d) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
  const day = (offset, hour, minute = 0) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    d.setHours(hour, minute, 0, 0)
    return d
  }
  const monday = -((new Date().getDay() + 6) % 7)
  const events = [
    ['Team stand-up', 0, 9, 30, 15],
    ['Review the checkout PR', 0, 11, 0, 60],
    ['Call with Ana (website)', 0, 17, 0, 30],
    ['Ship store v2.3', 0, Math.min(new Date().getHours() + 1, 22), 30, 60],
    ['Planning', monday, 14, 0, 90],
    ['Dentist', monday + 1, 11, 0, 60],
    ['Testing workshop', monday + 2, 15, 0, 120],
    ["Bia's birthday", 6, 20, 0, 120],
    ['Product meeting', 9, 10, 0, 60]
  ]
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//wisp//prints//EN']
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

/** Abre o Wisp em inglês, no modo completo e maximizado, e devolve o jeito de mexer nele. */
async function open(theme, highContrast = false, extra = {}) {
  const home = testHome({
    demo: true,
    language: 'en',
    windowMode: 'full',
    theme,
    highContrast,
    calendar: true,
    calendarFiles: ['~/agenda.ics'],
    projectRoots: ['~/projects'],
    projects: [
      { folder: '~/projects/store', name: 'Store', color: 'green', mode: null },
      { folder: '~/projects/website', name: 'Website', color: 'violet', mode: 'plan' }
    ],
    ...extra
  })
  // Os dois projetos, repositórios git de verdade (o quadro e o menu das pastas pedem).
  for (const name of ['store', 'website']) {
    const folder = join(home.home, 'projects', name)
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'README.md'), `# ${name}\n`)
    execFileSync('git', ['init', '-q', folder])
  }
  writeFileSync(join(home.home, 'agenda.ics'), calendar())
  // A janela completa ocupando a tela toda (no X virtual não há quem maximize).
  writeFileSync(
    join(dataDir(home.home), 'abas.json'),
    JSON.stringify({
      window: { full: { bounds: { x: 0, y: 0, width: WIDTH, height: HEIGHT }, maximized: false } }
    })
  )
  const mascot = await startApp(home, { LANG: 'en_US.UTF-8', WISP_DEMO_DIR: DEMO })
  wisp(home, '--show')
  const chat = await connect('/chat/')
  const ev = (expression) => chat.evaluate(expression)
  await waitFor(() => ev(`!!document.querySelector('.sidebar')`), 15000)
  await sleep(1200)
  const nav = async (index) => {
    await ev(`document.querySelectorAll('.sidebar-nav .sidebar-item')[${index}].click()`)
    await sleep(600)
  }
  /** Manda uma mensagem no painel em foco (ou, com `empty`, no primeiro painel ainda vazio). */
  const say = async (text, empty = false) => {
    const pane = empty
      ? `[...document.querySelectorAll('.panes .pane')].find((p) => !p.querySelector('.msg.user'))`
      : `(document.querySelector('.pane.focused') ?? document.querySelector('.pane'))`
    await ev(`${pane}.querySelector('.composer textarea').focus()`)
    await chat.send('Input.insertText', { text })
    await sleep(200)
    await ev(`${pane}.querySelector('.composer').requestSubmit()`)
  }
  const key = async (k, code, vk, modifiers) => {
    for (const type of ['rawKeyDown', 'keyUp'])
      await chat.send('Input.dispatchKeyEvent', {
        type,
        key: k,
        code,
        windowsVirtualKeyCode: vk,
        modifiers
      })
    await sleep(400)
  }
  /** Um print da página (ou de um pedaço dela: `clip` em pixels da página). */
  const take = async (name, clip) => {
    const shot = await chat.send('Page.captureScreenshot', {
      format: 'png',
      ...(clip ? { clip: { ...clip, scale: 1 }, captureBeyondViewport: true } : {})
    })
    writeFileSync(join(out, `${name}.png`), Buffer.from(shot.data, 'base64'))
    console.log(`${name}.png`)
  }
  return { home, chat, mascot, ev, nav, say, key, take }
}

// As telas da barra lateral, na ordem dela.
const NAV = {
  home: 0,
  wisp: 1,
  history: 2,
  board: 3,
  pentest: 4,
  memory: 5,
  sessions: 6,
  usage: 7,
  workbench: 8
}

/** O Início com tarefas, hábitos, anotações e o diário de hoje. */
async function fillHome(app) {
  const today = new Date()
  const diary = join(dataDir(app.home.home), 'memoria', 'diario')
  mkdirSync(diary, { recursive: true })
  writeFileSync(
    join(diary, `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.md`),
    [
      '- 08:00 Task "Morning summary" ran and was delivered on Telegram.',
      '- 11:40 Noted in memory: the store always ships on Friday.',
      '- 13:05 Telegram: "remind me to buy coffee tomorrow" became a reminder.',
      '- 14:30 Heartbeat: nothing urgent; PR #87 has been waiting for 2 days.'
    ].join('\n') + '\n'
  )
  await app.ev(`(async () => {
    const h = window.wisp.home
    const d = (n) => { const x = new Date(); x.setHours(0,0,0,0); x.setDate(x.getDate() + n); return x.getTime() }
    await h.changeTodo({ kind: 'add', text: 'Fix the cart bug' })
    await h.changeTodo({ kind: 'add', text: 'Renew the store domain', due: d(0), star: true })
    await h.changeTodo({ kind: 'add', text: 'Answer issue #142 (shipping)', due: d(0) })
    await h.changeTodo({ kind: 'add', text: 'Migrate the website database', due: d(1) })
    await h.changeTodo({ kind: 'add', text: 'Write the launch post', due: d(7) })
    const list = await h.todos()
    await h.changeTodo({ kind: 'done', id: list.find(t => t.text.startsWith('Fix')).id, done: true })
    const key = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10) }
    for (const name of ['Exercise', 'Reading', 'Meditate']) await h.changeHabit({ kind: 'add', name })
    const habits = await h.habits()
    for (const [i, habit] of habits.entries())
      for (let n = 0; n < 6; n++) if ((n + i) % 3 !== 2) await h.changeHabit({ kind: 'toggle', id: habit.id, day: key(n) })
    for (const text of ['Ana is the website designer.', 'Prefers short answers.', 'The store always ships on Friday afternoon.']) await h.note(text)
  })()`)
  await app.nav(NAV.wisp)
  await app.nav(NAV.home)
  await sleep(2000)
}

/** A conversa do bug do contador, parada no card da edição. */
async function counterBug(app) {
  await app.nav(NAV.wisp)
  await app.say('Can you fix the counter bug? The first click is never counted.')
  await waitFor(() => app.ev(`!!document.querySelector('.pane .permission')`), 15000)
  await sleep(1500)
}

/** O retângulo de um elemento, em pixels da página. */
const rect = (app, selector, margin = 0) =>
  app.ev(`(() => {
    const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect()
    return r ? { x: Math.max(0, r.left - ${margin}), y: Math.max(0, r.top - ${margin}), width: r.width + ${2 * margin}, height: r.height + ${2 * margin} } : null
  })()`)

/** Põe por cima da área da página do navegador da bancada o print dela (outra WebContents). */
async function overlayPreview(app, target) {
  const box = await rect(app, '.workbench-page')
  const shot = await target.send('Page.captureScreenshot', { format: 'png' })
  await app.ev(`(async () => {
    const img = document.createElement('img')
    img.className = 'print-overlay'
    img.src = 'data:image/png;base64,${shot.data}'
    Object.assign(img.style, { position: 'fixed', left: '${box.x}px', top: '${box.y}px', width: '${box.width}px', height: '${box.height}px', zIndex: 99999 })
    document.body.append(img)
    await img.decode()
  })()`)
}

/** Um servidor local com a página de exemplo, como um projeto rodando no localhost:5173. */
function serveLumen() {
  const page = readFileSync(join(HERE, 'prints-readme', 'lumen.html'))
  const server = createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page)
  })
  return new Promise((resolve) => server.listen(5173, '127.0.0.1', () => resolve(server)))
}

const CTRL = 2

// O tema escuro: o Início, a conversa com o card, a bancada, a paleta e o quadro.
if (['home', 'chat', 'workbench', 'palette', 'board'].some((name) => wanted.includes(name))) {
  const app = await open('dark')
  await fillHome(app)
  await counterBug(app)
  if (wanted.includes('chat')) {
    const card = await rect(app, '.pane .permission', 8)
    if (card) await app.take('permission-cards', card)
  }
  if (wanted.includes('home')) {
    // O card da edição esperando aparece no Precisa de você.
    await app.nav(NAV.home)
    await sleep(1500)
    await app.take('tour-home')
    await app.nav(NAV.wisp)
  }
  if (wanted.includes('workbench')) {
    const server = await serveLumen()
    await app.nav(NAV.workbench)
    await waitFor(() => app.ev(`!!document.querySelector('.workbench .workbench-address')`), 5000)
    await app.ev(`(() => {
      const field = document.querySelector('.workbench .workbench-address')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, 'localhost:5173')
      field.dispatchEvent(new Event('input', { bubbles: true }))
      field.form.requestSubmit()
    })()`)
    const target = await connect('localhost:5173', 10000)
    await waitFor(() => target.evaluate(`!!document.querySelector('h1')`), 5000)
    await app.ev(`document.activeElement?.blur()`)
    await sleep(1500)
    await overlayPreview(app, target)
    await app.take('tour-workbench')
    await app.ev(`document.querySelectorAll('.print-overlay').forEach((img) => img.remove())`)
    await app.nav(NAV.workbench)
    server.close()
  }
  if (wanted.includes('palette')) {
    await app.ev(`document.querySelector('.pane .composer textarea').focus()`)
    await app.key('p', 'KeyP', 80, CTRL)
    await waitFor(() => app.ev(`!!document.querySelector('.palette')`), 3000)
    await sleep(500)
    await app.take('tour-palette')
    await app.key('Escape', 'Escape', 27, 0)
  }
  if (wanted.includes('board')) {
    await app.ev(`(async () => {
      const b = window.wisp.board
      const cards = [
        ['Add dark mode to the settings page', 'todo', 'website'],
        ['Write tests for the cart total', 'todo', 'store'],
        ['Fix the shipping estimate on mobile', 'todo', 'store'],
        ['Update the screenshots in the docs', 'review', 'website'],
        ['Bump the payment SDK and fix the warnings', 'done', 'store'],
        ['Translate the checkout page', 'done', 'store']
      ]
      for (const [title, column, project] of cards) {
        await b.add(title, title + '.', '~/projects/' + project)
        const card = (await b.list()).find((c) => c.title === title)
        if (card && column !== 'todo') await b.action('move', card.id, column)
      }
    })()`)
    await app.nav(NAV.board)
    await sleep(1000)
    // Só a parte de cima, até o fim da coluna mais alta.
    const box = await app.ev(`(() => {
      const view = document.querySelector('.board-view').getBoundingClientRect()
      const bottom = Math.max(...[...document.querySelectorAll('.board-view [class*="board-"]')].map((el) => el.getBoundingClientRect().bottom))
      return { x: 0, y: 0, width: window.innerWidth, height: Math.min(window.innerHeight, Math.ceil(bottom) + 24) }
    })()`)
    await app.take('tour-board', box)
  }
  await stopApp()
  app.home.remove()
}

// O tema claro: três conversas lado a lado.
if (wanted.includes('grid')) {
  const app = await open('light')
  await app.nav(NAV.wisp)
  await app.say('Can you fix the counter bug? The first click is never counted.')
  await waitFor(() => app.ev(`!!document.querySelector('.pane .permission')`), 15000)
  await sleep(800)
  await app.ev(
    `[...document.querySelectorAll('.pane .permission button')].find((b) => b.textContent.trim() === 'Allow').click()`
  )
  await sleep(4000)
  await app.ev(`window.wisp.tabs.split('row')`)
  await sleep(1200)
  await app.say('Search the weather forecast for tomorrow', true)
  await sleep(5000)
  await app.ev(`window.wisp.tabs.split('column')`)
  await sleep(1200)
  await app.say('Open Firefox for me', true)
  await waitFor(() => app.ev(`document.querySelectorAll('.pane .permission').length > 0`), 15000)
  await sleep(1500)
  await app.take('tour-grid')
  await stopApp()
  app.home.remove()
}

// A mesma conversa nos três temas, para o themes.png (o compose junta os três).
if (wanted.includes('themes')) {
  for (const [theme, contrast] of [
    ['dark', false],
    ['light', false],
    ['dark', true]
  ]) {
    const app = await open(theme, contrast)
    await counterBug(app)
    await app.take(`theme-${contrast ? 'contrast' : theme}`)
    await stopApp()
    app.home.remove()
  }
}

// As categorias das configurações, cada uma inteira (a coluna da direita, sem a rolagem).
if (wanted.includes('settings')) {
  const app = await open('dark')
  await app.ev(
    `[...document.querySelectorAll('.sidebar-item')].find((b) => b.getAttribute('aria-label') === 'Settings').click()`
  )
  await waitFor(() => app.ev(`document.querySelectorAll('.settings-category').length > 0`), 5000)
  const ids = await app.ev(
    `[...document.querySelectorAll('.settings-category')].map((b) => b.textContent.trim())`
  )
  for (const [i, label] of ids.entries()) {
    await app.ev(`document.querySelectorAll('.settings-category')[${i}].click()`)
    await sleep(900)
    // A coluna cresce até o fim: a página toda fica da altura dela, para o print pegar tudo.
    const box = await app.ev(`(() => {
      const scroll = document.querySelector('.settings-scroll')
      for (let el = scroll; el; el = el.parentElement) {
        el.style.overflow = 'visible'
        el.style.height = 'auto'
        el.style.maxHeight = 'none'
      }
      const r = scroll.getBoundingClientRect()
      // Só até onde o conteúdo vai (a coluna tem largura máxima), com a mesma margem da esquerda.
      let right = 0
      let bottom = 0
      for (const el of scroll.querySelectorAll('*')) {
        const box = el.getBoundingClientRect()
        if (!box.width || !box.height) continue
        right = Math.max(right, box.right)
        bottom = Math.max(bottom, box.bottom)
      }
      const width = Math.min(r.width, Math.ceil(right - r.left) + 32)
      return { x: r.left, y: r.top, width, height: Math.ceil(bottom - r.top) + 24 }
    })()`)
    await sleep(300)
    const name = label
      .toLowerCase()
      .replace(/[^a-z]+/g, '-')
      .replace(/^-|-$/g, '')
    await app.take(`settings-${name}`, box)
    await app.ev(`(() => {
      for (let el = document.querySelector('.settings-scroll'); el; el = el.parentElement) {
        el.style.overflow = ''
        el.style.height = ''
        el.style.maxHeight = ''
      }
    })()`)
  }
  await stopApp()
  app.home.remove()
}

// O mascote feliz, com o fundo transparente, para o banner.
if (wanted.includes('mascot')) {
  const app = await open('dark')
  await app.ev(
    `[...document.querySelectorAll('.sidebar-item')].find((b) => b.getAttribute('aria-label') === 'Settings').click()`
  )
  await waitFor(() => app.ev(`!!document.querySelector('.gallery-chip')`), 5000)
  await app.mascot.send('Emulation.setDefaultBackgroundColorOverride', {
    color: { r: 0, g: 0, b: 0, a: 0 }
  })
  const box = await app.mascot.evaluate(`(() => {
    const r = document.querySelector('.stage').getBoundingClientRect()
    return { x: r.left, y: r.top, width: r.width, height: r.height }
  })()`)
  const stage = (key) =>
    app.mascot.evaluate(`document.querySelector('.stage').dataset.${key} ?? null`)
  // A saudação de quando o app abre (o "hi!" e um sorriso) passa primeiro.
  await waitFor(async () => !(await stage('mouth')), 8000)
  await app.ev(`document.querySelector('.gallery-chip[data-emotion="happy"]').click()`)
  await waitFor(async () => (await stage('feel')) === 'happy', 4000)
  // O rosto troca com uma animação: espera ela acabar.
  await sleep(700)
  const shot = await app.mascot.send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...box, scale: 3 }
  })
  writeFileSync(join(out, 'mascot-happy.png'), Buffer.from(shot.data, 'base64'))
  console.log('mascot-happy.png')
  await stopApp()
  app.home.remove()
}
