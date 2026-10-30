// Testes de unidade: cada test/*.test.ts vira um arquivo CommonJS em out/test (esbuild, com o
// código do app junto) e roda com `node --test`, um processo por arquivo. O relay dos hooks e o
// Claude Code gravado da demonstração também são montados, para os testes rodarem os dois como o
// app roda.
// Uso: npm test [-- nomes dos arquivos, sem .test.ts]
import { spawnSync } from 'node:child_process'
import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
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
  // O node-pty é nativo: vem do node_modules, como no app.
  external: ['electron', 'node-pty'],
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
  entryPoints: [join(root, 'src/main/hooks/relay-cli.ts')],
  outfile: join(out, 'wisp-hook.cjs')
})
await build({
  ...common,
  entryPoints: [join(root, 'src/main/demo/player.ts')],
  outfile: join(out, 'wisp-demo.cjs')
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
