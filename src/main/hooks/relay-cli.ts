// O programa do relay (`wisp-hook`), rodado com o Electron em modo Node pelo comando que o Wisp
// instala (veja relay.ts).
import { runRelay } from './relay'

// O Claude Code que chamou pode já ter ido embora (o stdout fechado): sai, sem erro.
process.stdout.on('error', () => process.exit(0))
runRelay(process.argv.slice(2))
