// Manutenção (Fase 28): o aviso das dependências (o que pede atualização e o resumo do job), os
// arquivos do src/ abaixo de 1.000 linhas, as folhas de estilo todas ligadas e o CI que aguenta
// um espelho do apt lento.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { assess, major, summary } from '../scripts/deps.mjs'

const ROOT = join(__dirname, '../..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

/** Os arquivos de uma pasta, de todas as subpastas. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const QUIET = {
  audit: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
  electron: { current: '44.9.3', latest: '44.9.3' },
  claude: { minimum: '2.1.0', latest: '2.1.310' }
}

test('dependências: o número maior de uma versão', () => {
  assert.equal(major('44.9.3'), 44)
  assert.equal(major('v2.1.0'), 2)
  assert.ok(Number.isNaN(major(null)))
  assert.ok(Number.isNaN(major('mais nova')))
})

test('dependências: nada a avisar com tudo em dia, e sem rede também não', () => {
  assert.deepEqual(assess(QUIET), [])
  assert.deepEqual(
    assess({
      audit: null,
      electron: { current: '44.9.3', latest: null },
      claude: { minimum: '2.1.0', latest: null }
    }),
    []
  )
  const text = summary(QUIET, [])
  assert.match(text, /\| Electron \| 44\.9\.3 \| 44\.9\.3 \|/)
  assert.match(text, /\| Claude Code \(mínimo\) \| 2\.1\.0 \| 2\.1\.310 \|/)
  assert.match(text, /Nada pede atualização\./)
})

test('dependências: falha alta ou crítica é aviso; moderada, só nota', () => {
  const serious = assess({ ...QUIET, audit: { ...QUIET.audit, high: 1, critical: 1, total: 2 } })
  assert.equal(serious.length, 1)
  assert.equal(serious[0].level, 'warning')
  assert.match(serious[0].message, /^2 falha\(s\) alta\(s\) ou crítica\(s\)/)
  const moderate = assess({ ...QUIET, audit: { ...QUIET.audit, moderate: 3, total: 3 } })
  assert.deepEqual(
    moderate.map((note) => note.level),
    ['notice']
  )
  // As baixas não aparecem.
  assert.deepEqual(assess({ ...QUIET, audit: { ...QUIET.audit, low: 5, total: 5 } }), [])
})

test('dependências: o Electron uma versão atrás é nota; três, aviso (sem correções)', () => {
  const behind = (latest: string): string[] =>
    assess({ ...QUIET, electron: { current: '44.9.3', latest } }).map((note) => note.level)
  assert.deepEqual(behind('44.10.0'), [])
  assert.deepEqual(behind('45.0.0'), ['notice'])
  assert.deepEqual(behind('46.1.0'), ['notice'])
  assert.deepEqual(behind('47.0.0'), ['warning'])
})

test('dependências: um Claude Code de versão maior nova pede conferir e subir o mínimo', () => {
  const notes = assess({ ...QUIET, claude: { minimum: '2.1.0', latest: '3.0.0' } })
  assert.equal(notes.length, 1)
  assert.equal(notes[0].level, 'warning')
  assert.match(notes[0].message, /MIN_CLAUDE/)
  // O resumo lista os avisos.
  assert.match(summary(QUIET, notes), /- \*\*Claude Code novo:\*\*/)
  // O mínimo do Wisp é o que o deps-check.mjs lê.
  assert.match(read('src/main/diagnostics.ts'), /MIN_CLAUDE = '\d+\.\d+\.\d+'/)
})

test('arquivos: nenhum do src/ passa de 1.000 linhas (menos o dicionário em inglês)', () => {
  // O dicionário é uma lista de frases (o npm run i18n confere), não código para ler de ponta a
  // ponta: cresce com cada texto novo.
  const allowed = new Set(['src/shared/i18n-en.ts'])
  const big = walk(join(ROOT, 'src'))
    .filter((path) => /\.(ts|tsx|css|mjs)$/.test(path))
    .map((path) => ({ path: relative(ROOT, path), lines: read(relative(ROOT, path)).split('\n') }))
    .filter(({ path, lines }) => !allowed.has(path) && lines.length > 1000)
    .map(({ path, lines }) => `${path} (${lines.length})`)
  assert.deepEqual(big, [])
})

test('estilos: o chat.css e o mascot.css ligam cada folha do styles/ uma vez, na ordem', () => {
  for (const page of ['chat', 'mascot']) {
    const index = read(`src/renderer/${page}/${page}.css`)
    const imports = [...index.matchAll(/@import '\.\/styles\/([\w-]+\.css)';/g)].map((m) => m[1])
    const sheets = readdirSync(join(ROOT, `src/renderer/${page}/styles`)).filter((name) =>
      name.endsWith('.css')
    )
    assert.deepEqual([...imports].sort(), [...sheets].sort(), `${page}: folhas sem @import`)
    assert.equal(new Set(imports).size, imports.length, `${page}: folha repetida`)
    // Só os @import: uma regra aqui viria antes das folhas e perderia delas.
    const rest = index.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import [^;]+;/g, '')
    assert.equal(rest.trim(), '', `${page}: regra fora das folhas`)
  }
  // As páginas importam só o índice.
  assert.match(read('src/renderer/mascot/main.tsx'), /import '\.\/mascot\.css'/)
  assert.doesNotMatch(read('src/renderer/mascot/main.tsx'), /emotions\.css|avatars\.css/)
})

test('CI: o apt passa pelo ci-apt.sh (cache, tentativas e limite) e todo job tem limite', () => {
  const ci = read('.github/workflows/ci.yml')
  assert.doesNotMatch(ci, /sudo apt-get/)
  const uses = ci.match(/scripts\/ci-apt\.sh /g) ?? []
  assert.ok(uses.length >= 3, 'os jobs que instalam pacotes usam o ci-apt.sh')
  // Cada uso tem o cache do apt antes e um limite no passo.
  assert.equal((ci.match(/path: ~\/\.cache\/apt/g) ?? []).length, uses.length)
  // Todo job tem timeout-minutes (um espelho travado não segura o CI por 6 horas).
  const jobs = ci
    .slice(ci.indexOf('\njobs:\n'))
    .split(/\n {2}(?=[\w-]+:\n)/)
    .slice(1)
  assert.ok(jobs.length >= 7)
  for (const job of jobs) {
    const name = job.split(':')[0]
    assert.match(job, /\n {4}timeout-minutes: \d+/, `o job ${name} tem limite`)
  }
  const script = read('scripts/ci-apt.sh')
  assert.match(script, /Acquire::Retries=3/)
  assert.match(script, /Dir::Cache::Archives=/)
  assert.match(script, /timeout "\$limit"/)
  // O job das dependências roda o deps-check.mjs.
  assert.match(ci, /node scripts\/deps-check\.mjs/)
})
