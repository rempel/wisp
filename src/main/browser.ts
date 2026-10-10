import { accessSync, constants, readFileSync, realpathSync, statSync } from 'fs'
import { delimiter, dirname, isAbsolute, join } from 'path'
import { CACHE_DIR, DATA_DIR, expandHome } from './paths'

// O navegador do Claude (Fase 9): o servidor MCP do Playwright, rodado pelo próprio Claude Code
// com o Electron em modo Node, controlando um Chrome ou Chromium separado, com perfil próprio. É
// opcional (browserAutomation no config.json) e as permissões ficam em browser-policy.ts.

/** O perfil do navegador do Claude: logins feitos nele ficam só nele. */
export const BROWSER_PROFILE = join(DATA_DIR, 'navegador')
/** Prints e snapshots que o Playwright grava. */
const OUTPUT_DIR = join(CACHE_DIR, 'navegador')

/** Navegadores Chromium que o Playwright consegue controlar, na ordem de preferência. */
const CANDIDATES = [
  'google-chrome-stable',
  'google-chrome',
  'chromium',
  'chromium-browser',
  'brave-browser',
  'brave',
  'microsoft-edge-stable',
  'microsoft-edge',
  'vivaldi-stable',
  'vivaldi'
]

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Um navegador do Snap não serve: o confinamento não deixa ele usar o perfil em ~/.local/share.
 * No Ubuntu, /usr/bin/chromium-browser é um script que só chama o Snap.
 */
function snap(path: string): boolean {
  try {
    if (realpathSync(path).startsWith('/snap/')) return true
    const head = readFileSync(path).subarray(0, 4096).toString('latin1')
    return head.startsWith('#!') && head.includes('/snap/')
  } catch {
    return false
  }
}

/** O navegador a usar: o do config (browserExecutable) ou o primeiro Chromium achado no PATH. */
export function findBrowser(
  configured: string | null,
  env: NodeJS.ProcessEnv = process.env
): { path: string } | { error: string } {
  if (configured?.trim()) {
    const path = expandHome(configured.trim())
    return isAbsolute(path) && executable(path)
      ? { path }
      : { error: `browserExecutable aponta para "${configured}", que não é um programa.` }
  }
  for (const name of CANDIDATES) {
    for (const dir of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
      const path = join(dir, name)
      if (executable(path) && !snap(path)) return { path }
    }
  }
  return {
    error:
      'Não achei um Chrome, Chromium, Brave ou Edge instalado (fora do Snap). Instale um deles ' +
      'ou diga o caminho em browserExecutable no config.json.'
  }
}

/** O servidor MCP do Playwright, como entra no --mcp-config do Claude Code. */
export interface StdioServer {
  type: 'stdio'
  command: string
  args: string[]
  env: Record<string, string>
}

/** O cli.js do @playwright/mcp (o pacote só exporta o package.json e o index). */
function playwrightCli(): string {
  return join(dirname(require.resolve('@playwright/mcp/package.json')), 'cli.js')
}

/**
 * O servidor do Playwright para este navegador. Ele roda com o Electron em modo Node (sem
 * depender de um Node instalado), com um perfil separado, sem as ferramentas que as páginas
 * podem registrar (WebMCP) e com caminhos absolutos nas respostas.
 */
export function playwrightServer(browserPath: string): StdioServer {
  return {
    type: 'stdio',
    command: process.execPath,
    args: [
      playwrightCli(),
      '--executable-path',
      browserPath,
      '--user-data-dir',
      BROWSER_PROFILE,
      '--output-dir',
      OUTPUT_DIR,
      '--file-paths',
      'absolute',
      '--codegen',
      'none',
      '--no-webmcp',
      // Como root, o Chromium só abre sem o sandbox.
      ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])
    ],
    env: { ELECTRON_RUN_AS_NODE: '1' }
  }
}
