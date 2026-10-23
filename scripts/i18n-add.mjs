// Acrescenta traduções ao dicionário do inglês (src/shared/i18n-en.ts), a partir de um JSON
// {"texto em português": "English text"}. As que já existem ficam como estão.
// Uso: node scripts/i18n-add.mjs novas.json (depois, npx prettier --write src/shared/i18n-en.ts)
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dictionary } from './i18n.mjs'

const root = new URL('..', import.meta.url).pathname
const file = join(root, 'src/shared/i18n-en.ts')
const added = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const current = dictionary(root)
const entries = Object.entries(added).filter(([key]) => !current.has(key))
const source = readFileSync(file, 'utf8')
const end = source.lastIndexOf('}')
const body = source.slice(0, end).replace(/,?\s*$/, ',\n')
const lines = entries.map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
writeFileSync(file, body + lines.join('\n').replace(/,$/, '') + '\n}\n')
console.log(`${entries.length} novas, ${Object.keys(added).length - entries.length} já estavam`)
