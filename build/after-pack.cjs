// Depois de montar a pasta do app: tira o app padrão do Electron (resources/default_app.asar),
// que vem junto quando o Electron sai do node_modules (electronDist) e nunca é usado. Tira também
// os binários do node-pty que não servem a este pacote: no Linux, os prebuilds (o pty.node é o
// compilado no npm install, em build/); no Windows, o build/ e os prebuilds de outros sistemas e
// da outra arquitetura (Fase 40, com o instalador ARM64). Isso é aqui, e não em `files` no
// linux: ou no win: do electron-builder.yml (veja lá por quê).
const { readdirSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { Arch } = require('electron-builder')

exports.default = async function afterPack(context) {
  rmSync(join(context.appOutDir, 'resources', 'default_app.asar'), { force: true })
  const pty = join(context.appOutDir, 'resources', 'app', 'node_modules', 'node-pty')
  const prebuilds = join(pty, 'prebuilds')
  if (context.electronPlatformName === 'linux') {
    rmSync(prebuilds, { recursive: true, force: true })
  } else if (context.electronPlatformName === 'win32') {
    rmSync(join(pty, 'build'), { recursive: true, force: true })
    const keep = `win32-${Arch[context.arch]}`
    let names = []
    try {
      names = readdirSync(prebuilds)
    } catch {
      // Sem prebuilds: nada a tirar.
    }
    for (const name of names) {
      if (name !== keep) rmSync(join(prebuilds, name), { recursive: true, force: true })
    }
  }
}
