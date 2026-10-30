// As ferramentas de desktop no Windows (Fase 35): achar programas, os apps do menu Iniciar, abrir
// links e apps, e o terminal. Nunca pelo cmd: os programas são achados pelo PATH (com as
// extensões do PATHEXT), sempre pelo caminho completo e nunca na pasta atual (uma pasta de
// projeto com um "pwsh.exe" dentro não roda); o que o Windows abre por associação (um atalho, um
// link, um console novo) vai pelo Start-Process de um script fixo, com o caminho numa variável.

import { accessSync, constants, lstatSync, readdirSync } from 'fs'
import { basename, dirname, extname, isAbsolute, join, relative, sep } from 'path'
import { firstLine, powerShellJson, runPowerShell } from './powershell'
import { pathDirs } from './win'
import { t } from '../shared/i18n'

/** As extensões que o Windows roda sem dizer (PATHEXT), em minúsculas. */
function pathExts(env: NodeJS.ProcessEnv): string[] {
  return (env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((ext) => ext.trim().toLowerCase())
    .filter((ext) => ext.startsWith('.'))
}

const isFile = (path: string): boolean => {
  try {
    accessSync(path, constants.F_OK)
    // Os apelidos dos apps da loja (o wt.exe) são pontos de reparo: existem, mas não abrem como
    // arquivo comum. Só a pasta não serve.
    return !lstatSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * O caminho completo de um programa ("wt", "pwsh.exe", "C:\...\x.exe"), pelas pastas absolutas do
 * PATH e as extensões do PATHEXT; null se não achou. Nunca procura na pasta atual.
 */
export function whichWindows(command: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const exts = pathExts(env)
  const hasExt = exts.includes(extname(command).toLowerCase())
  const names = hasExt ? [command] : exts.map((ext) => command + ext)
  if (command.includes('/') || command.includes('\\')) {
    if (!isAbsolute(command)) return null
    return names.find(isFile) ?? null
  }
  for (const dir of pathDirs(env)) {
    if (!isAbsolute(dir)) continue
    const found = names.map((name) => join(dir, name)).find(isFile)
    if (found) return found
  }
  return null
}

/**
 * Os editores que se instalam com um .cmd no PATH e o executável deles: o .cmd passaria pelo
 * cmd, e o Wisp abre o executável direto (que aceita as mesmas pastas e opções).
 */
const EDITOR_EXES: Record<string, string> = {
  code: 'Code.exe',
  'code-insiders': 'Code - Insiders.exe',
  codium: 'VSCodium.exe',
  cursor: 'Cursor.exe',
  windsurf: 'Windsurf.exe'
}

/**
 * O que dá para rodar sem o cmd: um .exe ou .com como está; um .cmd ou .bat de editor conhecido
 * vira o executável dele (até três pastas acima, como o bin\code.cmd do VS Code); outro script,
 * null.
 */
export function launchableWindows(
  path: string,
  exists: (path: string) => boolean = isFile
): string | null {
  const ext = extname(path).toLowerCase()
  if (ext === '.exe' || ext === '.com') return path
  if (ext !== '.cmd' && ext !== '.bat') return null
  const exe = EDITOR_EXES[basename(path, extname(path)).toLowerCase()]
  if (!exe) return null
  let dir = dirname(path)
  for (let level = 0; level < 3; level++) {
    dir = dirname(dir)
    const candidate = join(dir, exe)
    if (exists(candidate)) return candidate
  }
  return null
}

/** Um programa do config.json (o terminal ou o editor) como o Windows o roda, ou por que não. */
export function windowsProgram(
  command: string,
  env: NodeJS.ProcessEnv = process.env
): { path: string } | { error: 'missing' | 'script' } {
  const found = whichWindows(command, env)
  if (!found) return { error: 'missing' }
  const runnable = launchableWindows(found)
  return runnable ? { path: runnable } : { error: 'script' }
}

// ---------------------------------------------------------------------------
// Abrir pelo Windows

/** Abre o arquivo, atalho ou link de WISP_ABRIR (numa pasta, com WISP_PASTA) pela associação. */
const START =
  '$alvo = $env:WISP_ABRIR; $pasta = $env:WISP_PASTA; ' +
  'Remove-Item Env:WISP_ABRIR, Env:WISP_PASTA -ErrorAction SilentlyContinue; ' +
  'if ($pasta) { Start-Process -FilePath $alvo -WorkingDirectory $pasta } ' +
  'else { Start-Process -FilePath $alvo }'

/**
 * Abre pelo Windows (como um clique duplo): um atalho do menu Iniciar, um link, ou um console
 * novo numa pasta. Devolve o erro do Windows, ou null se abriu.
 */
export async function startWindows(target: string, folder?: string): Promise<string | null> {
  const result = await runPowerShell(START, { WISP_ABRIR: target, WISP_PASTA: folder ?? '' })
  return result.code === 0 ? null : firstLine(result.stderr) || `código ${result.code}`
}

// ---------------------------------------------------------------------------
// Os apps do menu Iniciar

export interface WindowsApp {
  /**
   * O caminho do atalho dentro da pasta do menu, com "/" ("Accessories/Notepad"), ou o AppID do
   * menu Iniciar ("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App").
   */
  id: string
  nome: string
  /** O que o Windows abre: o atalho, ou o app pelo shell:AppsFolder. */
  path: string
}

/** As pastas do menu Iniciar: a do usuário e a de todos. */
export function startMenuDirs(env: NodeJS.ProcessEnv = process.env): string[] {
  const menu = join('Microsoft', 'Windows', 'Start Menu', 'Programs')
  return [env.APPDATA, env.ProgramData ?? env.PROGRAMDATA]
    .filter((dir): dir is string => !!dir)
    .map((dir) => join(dir, menu))
}

/** Os atalhos de desinstalar e de ajuda não são apps para abrir. */
const NOT_APPS = /\b(uninstall|desinstalar|remover)\b|^(leia-me|readme|help|ajuda)\b/i

/** Os atalhos (.lnk e .url) do menu Iniciar, até três pastas de profundidade; o do usuário ganha. */
export function readWindowsApps(dirs: string[] = startMenuDirs()): WindowsApp[] {
  const apps = new Map<string, WindowsApp>()
  const visit = (root: string, dir: string, depth: number): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth < 3) visit(root, path, depth + 1)
        continue
      }
      const ext = extname(entry.name).toLowerCase()
      if (ext !== '.lnk' && ext !== '.url') continue
      const nome = basename(entry.name, extname(entry.name)).trim()
      if (!nome || NOT_APPS.test(nome)) continue
      const id = relative(root, path).slice(0, -ext.length).split(sep).join('/')
      const key = nome.toLowerCase()
      if (!apps.has(key)) apps.set(key, { id, nome, path })
    }
  }
  for (const root of dirs) visit(root, root, 0)
  return [...apps.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** O que o menu Iniciar do Windows mostra (com os apps da loja, que não têm atalho). */
const START_APPS =
  '$apps = @(Get-StartApps | ForEach-Object { [pscustomobject]@{ nome = [string]$_.Name; id = [string]$_.AppID } }); ' +
  'ConvertTo-Json -InputObject $apps -Compress'

/**
 * Junta os atalhos das pastas do menu Iniciar com a lista do Windows (a Calculadora, o Bloco de
 * Notas e os apps da loja não têm atalho no Windows 11): um app por nome, o atalho primeiro.
 */
export function mergeApps(
  shortcuts: WindowsApp[],
  start: { nome: string; id: string }[]
): WindowsApp[] {
  const apps = new Map(shortcuts.map((app) => [app.nome.toLowerCase(), app]))
  for (const { nome, id } of start) {
    const name = nome?.trim()
    if (!name || !id || NOT_APPS.test(name) || apps.has(name.toLowerCase())) continue
    apps.set(name.toLowerCase(), { id, nome: name, path: `shell:AppsFolder\\${id}` })
  }
  return [...apps.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

const START_TTL_MS = 2 * 60_000
let startCache: { at: number; apps: { nome: string; id: string }[] } | null = null

/** Os apps do Windows: os atalhos e a lista do menu Iniciar (guardada por 2 minutos). */
export async function windowsApps(): Promise<WindowsApp[]> {
  if (!startCache || Date.now() - startCache.at > START_TTL_MS) {
    const found = await powerShellJson<{ nome: string; id: string }[]>(START_APPS)
    startCache = { at: Date.now(), apps: Array.isArray(found) ? found : [] }
  }
  return mergeApps(readWindowsApps(), startCache.apps)
}

// ---------------------------------------------------------------------------
// O terminal

/** Os terminais do Windows na ordem de tentativa, com o nome que aparece na mensagem. */
export function windowsTerminals(): [string, string][] {
  return [
    ['wt.exe', 'Windows Terminal'],
    ['pwsh.exe', 'PowerShell'],
    ['powershell.exe', 'Windows PowerShell'],
    ['cmd.exe', t('Prompt de Comando')]
  ]
}

/** O cmd é o do sistema, nunca um achado pelo PATH. */
export const CMD = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe')

/** Onde está um dos terminais de windowsTerminals(); null se não está instalado. */
export function windowsTerminalPath(
  command: string,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (command === 'cmd.exe') return isFile(CMD) ? CMD : null
  return whichWindows(command, env)
}

/** O primeiro terminal do Windows que existe aqui (o caminho e o nome); null se nenhum. */
export function findWindowsTerminal(
  env: NodeJS.ProcessEnv = process.env
): { path: string; name: string } | null {
  for (const [command, name] of windowsTerminals()) {
    const path = windowsTerminalPath(command, env)
    if (path) return { path, name }
  }
  return null
}
