// Os textos da interface (Fase 25): acha cada t('…') do código e confere o dicionário do inglês
// (src/shared/i18n-en.ts). O test/idiomas.test.ts usa as mesmas funções.
// Uso: npm run i18n (lista os textos sem tradução e as traduções que nenhum código usa)
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ESCAPES = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' }

/** Lê o literal de string que começa em `start` (a aspa); devolve o texto e onde ele acaba. */
export function literal(source, start) {
  const quote = source[start]
  let value = ''
  let i = start + 1
  while (i < source.length && source[i] !== quote) {
    if (source[i] !== '\\') {
      value += source[i++]
      continue
    }
    const next = source[i + 1]
    if (next === 'u' && source[i + 2] === '{') {
      const close = source.indexOf('}', i)
      value += String.fromCodePoint(parseInt(source.slice(i + 3, close), 16))
      i = close + 1
    } else if (next === 'u') {
      value += String.fromCharCode(parseInt(source.slice(i + 2, i + 6), 16))
      i += 6
    } else if (next === 'x') {
      value += String.fromCharCode(parseInt(source.slice(i + 2, i + 4), 16))
      i += 4
    } else if (next === '\n') {
      i += 2
    } else {
      value += ESCAPES[next] ?? next
      i += 2
    }
  }
  return { value, end: i + 1 }
}

/** Os t('…') de um arquivo: as chaves e as linhas das chamadas sem um texto fixo. */
export function keysIn(source) {
  const keys = []
  const dynamic = []
  const call = /(?<![\w.$])t\(\s*/g
  let match
  while ((match = call.exec(source))) {
    const at = match.index + match[0].length
    const line = source.slice(0, match.index).split('\n').length
    if (source[at] === "'" || source[at] === '"')
      keys.push({ key: literal(source, at).value, line })
    else dynamic.push(line)
  }
  return { keys, dynamic }
}

/** Os arquivos do app que têm textos (menos o i18n.ts e o dicionário). */
export function sourceFiles(root) {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx?$/.test(entry.name) && !/i18n(-en)?\.ts$/.test(entry.name)) files.push(path)
    }
  }
  walk(join(root, 'src'))
  return files.sort()
}

/** O dicionário do inglês, lido do arquivo (os pares chave: valor). */
export function dictionary(root) {
  const source = readFileSync(join(root, 'src/shared/i18n-en.ts'), 'utf8')
  const body = source.slice(source.indexOf('= {') + 3)
  const entries = new Map()
  let i = 0
  const skip = () => {
    while (i < body.length && /[\s,:]/.test(body[i])) i++
  }
  for (skip(); i < body.length && body[i] !== '}'; skip()) {
    // O Prettier tira as aspas das chaves que são uma palavra só.
    const key = /['"]/.test(body[i])
      ? literal(body, i)
      : { value: /^[^\s:]+/.exec(body.slice(i))[0], end: body.indexOf(':', i) }
    i = key.end
    skip()
    const value = literal(body, i)
    i = value.end
    entries.set(key.value, value.value)
  }
  return entries
}

/** Os {nomes} de um texto, em ordem. */
export const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

/** Tudo de uma vez: as chaves do código (com onde aparecem), as chamadas dinâmicas e o dicionário. */
export function survey(root) {
  const used = new Map()
  const dynamic = []
  for (const file of sourceFiles(root)) {
    const found = keysIn(readFileSync(file, 'utf8'))
    const name = relative(root, file)
    for (const { key, line } of found.keys) if (!used.has(key)) used.set(key, `${name}:${line}`)
    for (const line of found.dynamic) dynamic.push(`${name}:${line}`)
  }
  return { used, dynamic, en: dictionary(root) }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = new URL('..', import.meta.url).pathname
  const { used, en } = survey(root)
  const missing = [...used].filter(([key]) => !en.has(key))
  for (const [key, where] of missing) console.log(`sem tradução  ${where}  ${JSON.stringify(key)}`)
  for (const key of en.keys()) {
    if (!used.has(key)) console.log(`sem uso       ${JSON.stringify(key)}`)
  }
  console.log(`${used.size} textos, ${missing.length} sem tradução`)
  process.exit(missing.length ? 1 : 0)
}
