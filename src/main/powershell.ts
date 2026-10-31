// Os scripts do PowerShell que o Wisp roda no Windows (Fase 35): as janelas, a música e o volume,
// que o Windows só mostra pelas APIs dele. Cada script é fixo, escrito no código do Wisp; o que
// muda (a janela, a ação, o passo do volume) vai por variáveis de ambiente, nunca pelo texto do
// script. Roda o PowerShell que vem com o Windows, pelo caminho completo (nunca um achado na pasta
// atual), sem perfil, sem janela e só quando pedem; o único que fica aberto é o que acompanha a
// música (Fase 37), e ele fecha junto com o Wisp.

import { spawn } from 'child_process'
import type { ChildProcessWithoutNullStreams } from 'child_process'
import { join } from 'path'

/** O $PSHOME do PowerShell do sistema. */
const PS_HOME = join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0'
)

/** O PowerShell do sistema (o 5.1, que todo Windows tem). */
export const POWERSHELL = join(PS_HOME, 'powershell.exe')

/** Os módulos do Windows: o PSModulePath dos scripts (nada da pasta do usuário). */
export const MODULES = join(PS_HOME, 'Modules')

/**
 * O ambiente do script: o do Wisp, com o PSModulePath fixo e as variáveis dele. No Windows, as
 * variáveis não ligam para maiúsculas: uma "PSMODULEPATH" a mais ganharia da nossa.
 */
function scriptEnv(vars: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (key.toUpperCase() !== 'PSMODULEPATH') env[key] = value
  }
  return { ...env, PSModulePath: MODULES, ...vars }
}

/** Carrega um módulo do Windows pelo caminho (com o $PSHOME do próprio PowerShell). */
export const importModule = (name: string): string =>
  `Import-Module ($PSHOME + '\\Modules\\${name}\\${name}.psd1'); `

/**
 * O que vem antes de todo script: erro para o script, a saída em UTF-8 (os títulos com acento) e
 * os dois módulos que os scripts usam, carregados pelo caminho, com o carregamento automático
 * desligado. Procurar o módulo de um comando é onde o PowerShell travava (a sonda do CI: parado
 * no primeiro Get-Date, conforme o ambiente de quem abriu o Wisp); sem procurar, não trava, e um
 * módulo de fora não toma o lugar de um comando do sistema.
 */
const PRELUDE =
  "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; " +
  "$PSModuleAutoLoadingPreference = 'None'; " +
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ' +
  importModule('Microsoft.PowerShell.Utility') +
  importModule('Microsoft.PowerShell.Management')

export interface PowerShellResult {
  /** O código de saída; -1 se não abriu ou passou do tempo. */
  code: number
  stdout: string
  stderr: string
}

/** Roda um script fixo com as variáveis `vars` (as WISP_*), e espera até `timeoutMs`. */
export function runPowerShell(
  script: string,
  vars: Record<string, string> = {},
  timeoutMs = 20000
): Promise<PowerShellResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const done = (code: number): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    }
    const child = spawn(
      POWERSHELL,
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', PRELUDE + script],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: scriptEnv(vars) }
    )
    const timer = setTimeout(() => {
      child.kill()
      // O que ele já tinha escrito diz onde parou.
      stderr = `passou de ${timeoutMs / 1000} s${stderr ? `: ${stderr}` : ''}`
      done(-1)
    }, timeoutMs)
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.on('error', (err) => {
      stderr += err.message
      done(-1)
    })
    child.on('close', (code) => done(code ?? -1))
  })
}

/**
 * Um script fixo que fica rodando (o que acompanha a música, Fase 37), com a entrada e a saída
 * abertas: os comandos entram como dados, uma linha por vez.
 */
export function startPowerShell(
  script: string,
  vars: Record<string, string> = {}
): ChildProcessWithoutNullStreams {
  return spawn(
    POWERSHELL,
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', PRELUDE + script],
    {
      stdio: 'pipe',
      windowsHide: true,
      env: scriptEnv(vars)
    }
  )
}

/** A saída JSON de um script (o ConvertTo-Json do fim dele); null se ele falhou. */
export async function powerShellJson<T>(
  script: string,
  vars: Record<string, string> = {},
  timeoutMs?: number
): Promise<T | null> {
  const result = await runPowerShell(script, vars, timeoutMs)
  if (result.code !== 0) {
    console.warn(`[wisp] powershell: saiu com ${result.code}: ${firstLine(result.stderr)}`)
    return null
  }
  try {
    return JSON.parse(result.stdout.trim() || 'null') as T
  } catch {
    console.warn('[wisp] powershell: a saída não é JSON')
    return null
  }
}

/** A primeira linha do erro (o PowerShell repete o script e a posição nas outras). */
export function firstLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 200) ?? ''
  )
}
