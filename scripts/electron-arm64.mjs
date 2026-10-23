// Baixa o Electron para ARM64 (a mesma versão do node_modules) e o abre na pasta pedida, para o
// electron-builder montar os pacotes ARM64 num computador x86-64 (scripts/package-arm64.sh).
// Uso: node scripts/electron-arm64.mjs <pasta>
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { downloadArtifact } from '@electron/get'

const root = new URL('..', import.meta.url).pathname
const target = resolve(process.argv[2] ?? join(root, '.cache/electron-arm64'))
const { version } = JSON.parse(
  readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8')
)
if (
  existsSync(join(target, 'electron')) &&
  readFileSync(join(target, 'version'), 'utf8').trim() === version
) {
  console.log(`Electron ${version} arm64 já está em ${target}`)
  process.exit(0)
}
const zip = await downloadArtifact({
  version,
  artifactName: 'electron',
  platform: 'linux',
  arch: 'arm64'
})
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
execFileSync('unzip', ['-q', zip, '-d', target])
console.log(`Electron ${version} arm64 em ${target}`)
