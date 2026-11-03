// Depois de montar a pasta do app: tira o app padrão do Electron (resources/default_app.asar),
// que vem junto quando o Electron sai do node_modules (electronDist) e nunca é usado. No Windows
// (Fase 40, com o instalador ARM64), tira também o node-pty da outra arquitetura.
const { rmSync } = require('node:fs')
const { join } = require('node:path')
const { Arch } = require('electron-builder')

exports.default = async function afterPack(context) {
  rmSync(join(context.appOutDir, 'resources', 'default_app.asar'), { force: true })
  if (context.electronPlatformName !== 'win32') return
  const arch = Arch[context.arch]
  const prebuilds = join(
    context.appOutDir,
    'resources',
    'app',
    'node_modules',
    'node-pty',
    'prebuilds'
  )
  for (const other of ['x64', 'arm64']) {
    if (other !== arch) rmSync(join(prebuilds, `win32-${other}`), { recursive: true, force: true })
  }
}
