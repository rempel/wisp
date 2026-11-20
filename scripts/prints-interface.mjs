// Os prints da interface completa (Fase 91) para o README, no modo demonstração: o Início, uma
// conversa e as configurações, nos temas claro, escuro e de alto contraste. Rodam num X virtual,
// como os roteiros de ponta a ponta.
// Uso: npm run build && e2e/run.sh scripts/prints-interface.mjs [pasta] (por padrão, docs/)
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { connect, ROOT, sleep, startApp, stopApp, testHome, waitFor, wisp } from '../e2e/lib.mjs'

const out = process.argv[2] ?? join(ROOT, 'docs')

/** Abre o Wisp no modo completo num tema e tira os prints pedidos. */
async function shots(theme, highContrast, wanted) {
  const home = testHome({
    demo: true,
    windowMode: 'full',
    theme,
    highContrast,
    projects: [
      { folder: '/tmp', name: 'Loja', color: 'green', mode: null },
      { folder: '/var/tmp', name: 'Site', color: 'violet', mode: 'plan' }
    ]
  })
  await startApp(home)
  wisp(home, '--show')
  const chat = await connect('/chat/')
  const ev = (expression) => chat.evaluate(expression)
  await waitFor(() => ev(`!!document.querySelector('.sidebar')`), 15000)
  await sleep(1200)
  const take = async (name) => {
    const shot = await chat.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(out, `${name}.png`), Buffer.from(shot.data, 'base64'))
    console.log(`${name}.png`)
  }
  const item = (label) =>
    ev(
      `[...document.querySelectorAll('.sidebar-item')].find(b => b.getAttribute('aria-label') === ${JSON.stringify(label)}).click()`
    )
  if (wanted.includes('home')) await take(`full-home-${theme}${highContrast ? '-contrast' : ''}`)
  if (wanted.includes('chat')) {
    await item('Wisp')
    await sleep(500)
    await ev(
      `[...document.querySelectorAll('.demo-prompt')].find(b => /bug/.test(b.textContent))?.click()`
    )
    await sleep(9000)
    await take(`full-chat-${theme}${highContrast ? '-contrast' : ''}`)
  }
  if (wanted.includes('settings')) {
    await item('Configurações')
    await sleep(500)
    await ev(
      `[...document.querySelectorAll('.settings-category')].find(b => b.textContent === 'Assistente').click()`
    )
    await sleep(500)
    await take(`full-settings-${theme}`)
  }
  await stopApp()
  home.remove()
}

await shots('light', false, ['home', 'chat', 'settings'])
await shots('dark', false, ['home', 'chat'])
await shots('dark', true, ['chat'])
