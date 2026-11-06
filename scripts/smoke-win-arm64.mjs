// Confere os instaladores do Windows montados em dist/ (Fase 40): cada pasta montada tem o
// Wisp.exe e o node-pty da arquitetura dela (pelo cabeçalho PE dos binários), e só ela (o node-pty
// da outra arquitetura fica de fora), nada do projeto além do app montado (sem o src, os testes e
// a documentação), e os dois instaladores existem. Abrir o Wisp de ARM64 pede
// uma máquina ARM; isto confere o que dá para conferir num x64.
// Uso: node scripts/smoke-win-arm64.mjs
import { existsSync, openSync, readSync, closeSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const MACHINES = { 0x8664: 'x64', 0xaa64: 'arm64' }

/** A arquitetura de um binário do Windows, pelo campo Machine do cabeçalho PE. */
function machineOf(path) {
  const fd = openSync(path, 'r')
  try {
    const header = Buffer.alloc(4096)
    readSync(fd, header, 0, header.length, 0)
    if (header.toString('latin1', 0, 2) !== 'MZ') return 'sem MZ'
    const pe = header.readUInt32LE(0x3c)
    if (header.toString('latin1', pe, pe + 4) !== 'PE\0\0') return 'sem PE'
    const machine = header.readUInt16LE(pe + 4)
    return MACHINES[machine] ?? `0x${machine.toString(16)}`
  } finally {
    closeSync(fd)
  }
}

let failed = false
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${message}`)
  if (!ok) failed = true
}

for (const [arch, dir, other] of [
  ['x64', 'win-unpacked', 'arm64'],
  ['arm64', 'win-arm64-unpacked', 'x64']
]) {
  const app = join(dist, dir)
  const prebuilds = join(app, 'resources', 'app', 'node_modules', 'node-pty', 'prebuilds')
  const binaries = [
    join(app, 'Wisp.exe'),
    join(prebuilds, `win32-${arch}`, 'pty.node'),
    join(prebuilds, `win32-${arch}`, 'conpty.node'),
    join(prebuilds, `win32-${arch}`, 'conpty', 'conpty.dll')
  ]
  for (const path of binaries) {
    const found = existsSync(path) ? machineOf(path) : 'não existe'
    check(found === arch, `${path.slice(dist.length + 1)}: ${found}`)
  }
  check(!existsSync(join(prebuilds, `win32-${other}`)), `${dir} sem o node-pty de ${other}`)
  check(!existsSync(join(app, 'resources', 'app', '.cache')), `${dir} sem a pasta .cache`)
  const extra = ['src', 'test', 'e2e', 'docs', 'scripts'].filter((name) =>
    existsSync(join(app, 'resources', 'app', name))
  )
  check(extra.length === 0, `${dir} sem o projeto (${extra.join(', ') || 'só o app montado'})`)
  check(
    !existsSync(join(app, 'resources', 'app', 'node_modules', 'node-pty', 'build')),
    `${dir} sem o node-pty/build`
  )
  const installers = readdirSync(dist).filter((name) => name.endsWith(`-Setup-${arch}.exe`))
  check(installers.length === 1, `o instalador ${arch}: ${installers.join(', ') || 'nenhum'}`)
}
if (failed) process.exit(1)
