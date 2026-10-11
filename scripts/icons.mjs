// Gera os ícones do pacote (build/icons/NxN.png) a partir de resources/icon.svg, desenhando o SVG
// num Chromium. Uso: node scripts/icons.mjs [caminho do chrome]
// Sem o caminho, usa o CHROMIUM do ambiente ou o Chromium do Playwright.
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const root = new URL('..', import.meta.url).pathname
const svg = readFileSync(join(root, 'resources/icon.svg'), 'utf8')
const out = join(root, 'build/icons')
mkdirSync(out, { recursive: true })

const executablePath = process.argv[2] ?? process.env.CHROMIUM
const browser = await chromium.launch(executablePath ? { executablePath } : {})
for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`
  )
  await page.screenshot({ path: join(out, `${size}x${size}.png`), omitBackground: true })
  await page.close()
}
await browser.close()
console.log(`ícones em ${out}`)
