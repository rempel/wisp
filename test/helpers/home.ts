// Um HOME só deste arquivo de teste, numa pasta temporária, sem as variáveis XDG de quem roda:
// os módulos do Wisp calculam as pastas deles ao serem carregados. Importe antes de tudo.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const HOME = mkdtempSync(join(tmpdir(), 'wisp-test-'))
process.env.HOME = HOME
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
