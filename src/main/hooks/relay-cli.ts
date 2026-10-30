// O programa do relay (`wisp-hook`), rodado com o Electron em modo Node pelo comando que o Wisp
// instala (veja relay.ts).
import { runRelay } from './relay'

runRelay(process.argv.slice(2))
