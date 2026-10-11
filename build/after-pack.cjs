// Depois de montar a pasta do app: tira o app padrão do Electron (resources/default_app.asar),
// que vem junto quando o Electron sai do node_modules (electronDist) e nunca é usado.
const { rmSync } = require('node:fs')
const { join } = require('node:path')

exports.default = async function afterPack(context) {
  rmSync(join(context.appOutDir, 'resources', 'default_app.asar'), { force: true })
}
