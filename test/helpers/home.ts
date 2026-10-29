// Um HOME só deste arquivo de teste, numa pasta temporária, sem as variáveis XDG de quem roda:
// os módulos do Wisp calculam as pastas deles ao serem carregados. Importe antes de tudo.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const HOME = mkdtempSync(join(tmpdir(), 'wisp-test-'))
process.env.HOME = HOME
// No Windows (Fase 33), a pasta pessoal e as do app vêm destas.
if (process.platform === 'win32') {
  process.env.USERPROFILE = HOME
  process.env.APPDATA = join(HOME, 'AppData', 'Roaming')
  process.env.LOCALAPPDATA = join(HOME, 'AppData', 'Local')
}
for (const name of [
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'XDG_STATE_HOME',
  'XDG_RUNTIME_DIR',
  'XDG_DATA_DIRS',
  'CLAUDE_CONFIG_DIR',
  'APPIMAGE'
]) {
  delete process.env[name]
}
process.on('exit', () => rmSync(HOME, { recursive: true, force: true }))
