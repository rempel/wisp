// "Perguntar ao Wisp" no gerenciador de arquivos (Fase 64) e o comando `wisp` no PATH do Windows
// (Fase 67). São integrações com o sistema que você liga nas configurações: no Linux, um script
// do Nautilus e um menu de serviço do Dolphin, arquivos do Wisp (com a marca dele) na sua pasta;
// no Windows, uma entrada no menu de contexto do Explorer e a pasta do comando no PATH, as duas
// só do seu usuário (HKCU), sem pedir administrador. Desligar tira o que o Wisp pôs.

import { spawn } from 'child_process'
import { mkdirSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { basename, isAbsolute, join } from 'path'
import { isSensitivePath } from './claude-settings'
import { desktopArg, LAUNCHER_PATH, MARKER, removeOwnFile, writeOwnFile } from './launcher'
import { DATA_DIR } from './paths'
import { IS_WINDOWS } from './platform'
import { runPowerShell } from './powershell'
import type { DroppedFiles } from '../shared/ipc'
import { t } from '../shared/i18n'

/** Os arquivos da integração no Linux: o script do Nautilus e o menu de serviço do Dolphin. */
export function linuxMenuFiles(
  launcher = LAUNCHER_PATH,
  home = homedir(),
  label = t('Perguntar ao Wisp')
): { path: string; content: string; mode: number }[] {
  const data = process.env.XDG_DATA_HOME || join(home, '.local', 'share')
  const quoted = `'${launcher.replace(/'/g, `'\\''`)}'`
  return [
    {
      // O Nautilus passa os arquivos escolhidos como argumentos.
      path: join(data, 'nautilus', 'scripts', label),
      mode: 0o755,
      content: [
        '#!/bin/sh',
        `# ${MARKER}`,
        '# Os arquivos escolhidos no Nautilus vão como anexos para o Wisp.',
        'for file in "$@"; do',
        `  ${quoted} --file "$file"`,
        'done',
        ''
      ].join('\n')
    },
    {
      path: join(data, 'kio', 'servicemenus', 'wisp.desktop'),
      // O Dolphin (KF6) só mostra os menus de serviço executáveis.
      mode: 0o755,
      content: [
        '[Desktop Entry]',
        'Type=Service',
        'MimeType=application/octet-stream;text/plain;image/*;application/pdf;',
        'Actions=wispAsk;',
        MARKER,
        '',
        '[Desktop Action wispAsk]',
        `Name=${label}`,
        'Icon=io.github.rempel.Wisp',
        `Exec=${desktopArg(launcher)} --file %f`,
        ''
      ].join('\n')
    }
  ]
}

/** Os argumentos do reg.exe para a entrada "Perguntar ao Wisp" de todo arquivo, no seu usuário. */
export function windowsMenuCommands(
  exe: string,
  enabled: boolean,
  label = t('Perguntar ao Wisp')
): string[][] {
  const key = 'HKCU\\Software\\Classes\\*\\shell\\Wisp'
  if (!enabled) return [['delete', key, '/f']]
  return [
    ['add', key, '/ve', '/d', label, '/f'],
    ['add', key, '/v', 'Icon', '/d', exe, '/f'],
    ['add', `${key}\\command`, '/ve', '/d', `"${exe}" --file "%1"`, '/f']
  ]
}

const run = (command: string, args: string[]): Promise<boolean> =>
  new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })

/** Liga ou desliga o "Perguntar ao Wisp" do gerenciador de arquivos. Devolve se deu. */
export async function setFileMenu(enabled: boolean, exe = process.execPath): Promise<boolean> {
  if (IS_WINDOWS) {
    let ok = true
    for (const args of windowsMenuCommands(exe, enabled)) {
      // Tirar o que não existe não é um erro.
      ok = (await run('reg.exe', args)) || !enabled ? ok : false
    }
    return ok
  }
  let ok = true
  for (const file of linuxMenuFiles()) {
    try {
      if (enabled) ok = writeOwnFile(file.path, file.content, file.mode) && ok
      else ok = removeOwnFile(file.path) && ok
    } catch {
      ok = false
    }
  }
  return ok
}

/** A pasta do comando `wisp` no Windows (o wisp.cmd fica nela). */
export const WINDOWS_BIN = join(DATA_DIR, 'bin')

/** O wisp.cmd: entrega as opções ao Wisp.exe (o mesmo que o comando `wisp` faz no Linux). */
export function windowsCommandScript(exe: string): string {
  return ['@echo off', `rem ${MARKER}`, `start "" "${exe}" %*`, ''].join('\r\n')
}

/** O PATH do usuário com a pasta do comando (ou sem ela): só essa pasta muda. */
export function pathWith(current: string, dir: string, enabled: boolean): string {
  const same = (entry: string): boolean =>
    entry.replace(/[\\/]+$/, '').toLowerCase() === dir.replace(/[\\/]+$/, '').toLowerCase()
  const entries = current.split(';').filter((entry) => entry.trim() && !same(entry))
  return (enabled ? [...entries, dir] : entries).join(';')
}

// O PATH do usuário, lido e gravado pelo .NET (que avisa os programas abertos da mudança). O
// valor novo vem numa variável, nunca colado no script.
const PATH_SCRIPT = `
if ($env:WISP_PATH_SET -eq '1') {
  [Environment]::SetEnvironmentVariable('Path', $env:WISP_PATH_VALUE, 'User')
} else {
  [Console]::Out.Write([Environment]::GetEnvironmentVariable('Path', 'User'))
}
`

/** Põe (ou tira) o comando `wisp` no PATH do seu usuário, no Windows. Devolve se deu. */
export async function setWindowsCommand(
  enabled: boolean,
  exe = process.execPath
): Promise<boolean> {
  if (!IS_WINDOWS) return true
  try {
    if (enabled) {
      mkdirSync(WINDOWS_BIN, { recursive: true })
      writeFileSync(join(WINDOWS_BIN, 'wisp.cmd'), windowsCommandScript(exe))
    } else removeOwnFile(join(WINDOWS_BIN, 'wisp.cmd'))
  } catch {
    return false
  }
  const read = await runPowerShell(PATH_SCRIPT)
  if (read.code !== 0) return false
  const next = pathWith(read.stdout, WINDOWS_BIN, enabled)
  if (next === read.stdout) return true
  const written = await runPowerShell(PATH_SCRIPT, { WISP_PATH_SET: '1', WISP_PATH_VALUE: next })
  return written.code === 0
}

/**
 * Um arquivo do disco como anexo solto no painel (o "Perguntar ao Wisp", Fase 64): só um
 * arquivo de verdade, de caminho inteiro, e nunca um dos que guardam segredos. null: não dá.
 */
export function fileAttachment(path: string): DroppedFiles | null {
  try {
    if (!isAbsolute(path)) return null
    const info = statSync(path)
    const name = basename(path)
    if (!info.isFile()) return { files: [], problems: [t('"{name}" não é um arquivo.', { name })] }
    if (isSensitivePath(path)) {
      return { files: [], problems: [t('Este arquivo guarda segredos: o painel não mostra.')] }
    }
    return { files: [{ path, name, size: info.size }], problems: [] }
  } catch {
    return null
  }
}
