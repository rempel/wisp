// Testes de unidade: cada test/*.test.ts vira um arquivo CommonJS em out/test (esbuild, com o
// código do app junto) e roda com `node --test`, um processo por arquivo. O relay dos hooks também
// é montado, para o teste dele rodá-lo como o Claude Code roda.
// Uso: npm test [-- nomes dos arquivos, sem .test.ts]
import { spawnSync } from 'node:child_process'
import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'

const root = new URL('..', import.meta.url).pathname
const dir = join(root, 'test')
const out = join(root, 'out/test')
const only = process.argv.slice(2)
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.test.ts'))
  .filter((name) => !only.length || only.includes(name.replace(/\.test\.ts$/, '')))

rmSync(out, { recursive: true, force: true })
const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  logLevel: 'warning',
  // Os ?raw e ?asset do electron-vite não aparecem nos módulos testados.
  loader: { '.md': 'text' }
}
await build({
  ...common,
  entryPoints: files.map((name) => join(dir, name)),
  outdir: out,
  outExtension: { '.js': '.cjs' }
})
await build({
  ...common,
  entryPoints: [join(root, 'src/main/hooks/relay.ts')],
  outfile: join(out, 'wisp-hook.cjs')
})

const result = spawnSync(
  process.execPath,
  [
    '--test',
    '--test-reporter=spec',
    '--test-timeout=60000',
    ...files.map((name) => join(out, name.replace(/\.ts$/, '.cjs')))
  ],
  // Os horários dos testes (lembretes, datas) são os de São Paulo.
  { stdio: 'inherit', env: { ...process.env, TZ: 'America/Sao_Paulo' } }
)
process.exit(result.status ?? 1)
