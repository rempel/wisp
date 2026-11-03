// Baixa o Electron para ARM64 (a mesma versão do node_modules) e o abre na pasta pedida, para o
// electron-builder montar os pacotes ARM64 num computador x86-64: os do Linux
// (scripts/package-arm64.sh) e, desde a Fase 40, o instalador do Windows ARM64 (no job do CI).
// Uso: node scripts/electron-arm64.mjs <pasta> [linux|win32]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { downloadArtifact } from '@electron/get'

const root = fileURLToPath(new URL('..', import.meta.url))
const target = resolve(process.argv[2] ?? join(root, '.cache/electron-arm64'))
const platform = process.argv[3] ?? 'linux'
if (platform !== 'linux' && platform !== 'win32') {
  console.error(`sistema desconhecido: ${platform} (linux ou win32)`)
  process.exit(2)
}
const binary = platform === 'win32' ? 'electron.exe' : 'electron'
const { version } = JSON.parse(
  readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8')
)
if (
  existsSync(join(target, binary)) &&
  readFileSync(join(target, 'version'), 'utf8').trim() === version
) {
  console.log(`Electron ${version} ${platform} arm64 já está em ${target}`)
  process.exit(0)
}
const zip = await downloadArtifact({ version, artifactName: 'electron', platform, arch: 'arm64' })
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
// No Windows não há o unzip: o tar do Windows (o bsdtar) abre .zip. Pelo caminho completo: o do
// Git, que pode vir antes no PATH, é o GNU tar, que não abre.
if (process.platform === 'win32') {
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  execFileSync(tar, ['-xf', zip, '-C', target])
} else execFileSync('unzip', ['-q', zip, '-d', target])
console.log(`Electron ${version} ${platform} arm64 em ${target}`)
