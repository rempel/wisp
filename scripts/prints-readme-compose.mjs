// Monta o banner (docs/banner.png) e o docs/themes.png a partir dos prints de
// scripts/prints-readme.mjs, com os modelos HTML de scripts/prints-readme/, no Electron do projeto.
// Uso: node scripts/prints-readme-compose.mjs [pasta dos prints] (por padrão, docs/)
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HERE = join(ROOT, 'scripts', 'prints-readme')
const dir = process.argv[2] ?? join(ROOT, 'docs')
const electron = createRequire(import.meta.url)('electron')

const jobs = [
  {
    html: join(HERE, 'banner.html'),
    out: join(dir, 'banner.png'),
    width: 1600,
    height: 860,
    images: {
      LOGO: join(ROOT, 'docs', 'logo.svg'),
      SHOT: join(dir, 'tour-home.png'),
      MASCOT: join(dir, 'mascot-happy.png')
    }
  },
  {
    html: join(HERE, 'themes.html'),
    out: join(dir, 'themes.png'),
    width: 2052,
    height: 520,
    images: {
      DARK: join(dir, 'theme-dark.png'),
      LIGHT: join(dir, 'theme-light.png'),
      CONTRAST: join(dir, 'theme-contrast.png')
    }
  }
]

const run = (args) =>
  process.env.DISPLAY
    ? execFileSync(electron, args, { stdio: 'inherit' })
    : execFileSync('xvfb-run', ['-a', '-s', '-screen 0 2400x1400x24', electron, ...args], {
        stdio: 'inherit'
      })
run(['--no-sandbox', join(HERE, 'compose.cjs'), JSON.stringify(jobs)])

// Os pedaços só servem para montar: não vão para o README.
for (const name of ['mascot-happy', 'theme-dark', 'theme-light', 'theme-contrast'])
  rmSync(join(dir, `${name}.png`), { force: true })
