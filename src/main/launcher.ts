import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, isAbsolute, join } from 'path'
import { DATA_DIR } from './paths'

/**
 * O id do app no desktop: o nome do .desktop e o id que o Wisp registra nos portais (o do atalho
 * global pede um id no formato de domínio invertido).
 */
export const APP_ID = 'io.github.rempel.Wisp'

/** O comando `wisp`: abre o app, ou entrega o pedido ao Wisp já aberto. */
export const LAUNCHER_PATH = join(DATA_DIR, 'bin', 'wisp')

/** Marca dos arquivos que o Wisp escreve fora da pasta dele: só esses ele troca ou apaga. */
export const MARKER = 'X-Wisp-Generated=true'

/**
 * Como o Wisp está rodando: do código (`npm run dev`, `npm start`), de um AppImage ou de um
 * pacote instalado (.deb), que já traz o .desktop e o ícone dele.
 */
export type InstallKind = 'dev' | 'appimage' | 'package' | 'flatpak'

export function installKind(packaged: boolean, env: NodeJS.ProcessEnv = process.env): InstallKind {
  if (!packaged) return 'dev'
  if (env.FLATPAK_ID) return 'flatpak'
  return env.APPIMAGE && isAbsolute(env.APPIMAGE) ? 'appimage' : 'package'
}

/**
 * O que abre o Wisp de novo, de fora: no AppImage, o próprio arquivo .AppImage (o executável de
 * dentro fica numa montagem que muda a cada abertura e some quando o app fecha).
 */
export function launchTarget(kind: InstallKind, env: NodeJS.ProcessEnv = process.env): string {
  return kind === 'appimage' && env.APPIMAGE ? env.APPIMAGE : process.execPath
}

/** Onde fica a cópia do ícone para o .desktop do AppImage (a montagem muda a cada abertura). */
export const STABLE_ICON = join(DATA_DIR, 'icon.png')

/**
 * O ícone para os .desktop (menu de apps, início com o sistema). No AppImage, uma cópia num lugar
 * fixo; nos outros casos, o do app.
 */
export function desktopIcon(kind: InstallKind, icon: string): string {
  if (kind !== 'appimage') return icon
  try {
    const bytes = readFileSync(icon)
    let current: Buffer | null = null
    try {
      current = readFileSync(STABLE_ICON)
    } catch {
      // Ainda não existe.
    }
    if (!current?.equals(bytes)) {
      mkdirSync(dirname(STABLE_ICON), { recursive: true })
      writeFileSync(STABLE_ICON, bytes, { mode: 0o644 })
    }
    return STABLE_ICON
  } catch (err) {
    console.warn('[wisp] não consegui copiar o ícone:', err)
    return icon
  }
}

/** O que o comando `wisp` pede ao app. */
export type WispCommand =
  | { kind: 'toggle' }
  | { kind: 'show' }
  | { kind: 'new' }
  | { kind: 'palette' }
  | { kind: 'ask'; text: string }
  /** Um arquivo para anexar na conversa em foco (o "Perguntar ao Wisp", Fase 64). */
  | { kind: 'file'; path: string }

/** Limite do texto de um `--ask` (o resto fica de fora). */
const MAX_ASK = 20_000

/**
 * O pedido que veio na linha de comando: `--toggle`, `--show`, `--new`, `--palette` ou `--ask "texto"`
 * (também `--ask=texto`). Sem nenhum deles, null.
 */
export function parseCommand(argv: readonly string[]): WispCommand | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--toggle') return { kind: 'toggle' }
    if (arg === '--show') return { kind: 'show' }
    if (arg === '--new') return { kind: 'new' }
    if (arg === '--palette') return { kind: 'palette' }
    if (arg === '--file' || arg.startsWith('--file=')) {
      const path = arg === '--file' ? (argv[i + 1] ?? '') : arg.slice('--file='.length)
      return path ? { kind: 'file', path: path.slice(0, 4096) } : { kind: 'show' }
    }
    if (arg === '--ask' || arg.startsWith('--ask=')) {
      const text = (arg === '--ask' ? (argv[i + 1] ?? '') : arg.slice('--ask='.length)).trim()
      return text ? { kind: 'ask', text: text.slice(0, MAX_ASK) } : { kind: 'show' }
    }
  }
  return null
}

/** Confere um pedido que veio de outra instância (pelo bloqueio de instância única). */
export function checkCommand(value: unknown): WispCommand | null {
  const command = value as { kind?: unknown; text?: unknown } | null
  switch (command?.kind) {
    case 'toggle':
    case 'show':
    case 'new':
    case 'palette':
      return { kind: command.kind }
    case 'file': {
      const path = (command as { path?: unknown }).path
      return typeof path === 'string' && path ? { kind: 'file', path: path.slice(0, 4096) } : null
    }
    case 'ask':
      return typeof command.text === 'string' && command.text.trim()
        ? { kind: 'ask', text: command.text.trim().slice(0, MAX_ASK) }
        : null
    default:
      return null
  }
}

/** Aspas simples do sh: o valor vira uma palavra só, seja qual for. */
export const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`

/**
 * Um argumento no Exec de um .desktop. Com caracteres reservados, vai entre aspas duplas, com
 * `"`, `` ` ``, `$` e `\` escapados; `%` vira `%%`. Depois, as barras ainda são dobradas, porque
 * o valor inteiro também é uma string do .desktop.
 */
export function desktopArg(arg: string): string {
  const value = arg.replace(/%/g, '%%')
  const quoted = /[\s"'\\><~|&;$*?#()`]/.test(value)
    ? `"${value.replace(/(["`$\\])/g, '\\$1')}"`
    : value
  return quoted.replace(/\\/g, '\\\\')
}

/** O Exec de um .desktop que roda o comando `wisp` com estes argumentos. */
export function desktopExec(...args: string[]): string {
  return [LAUNCHER_PATH, ...args].map(desktopArg).join(' ')
}

/** Onde ficam os .desktop do usuário. */
export function applicationsDir(env: NodeJS.ProcessEnv = process.env): string {
  const data = env.XDG_DATA_HOME
  return join(data && isAbsolute(data) ? data : join(homedir(), '.local/share'), 'applications')
}

/**
 * Grava um arquivo que é do Wisp, sem passar por cima de um que não é: se já existir um sem a
 * marca, deixa como está e devolve false. Grava num temporário e renomeia.
 */
export function writeOwnFile(path: string, content: string, mode = 0o644): boolean {
  let current: string | null = null
  try {
    current = readFileSync(path, 'utf8')
  } catch {
    // Ainda não existe.
  }
  if (current !== null && !current.includes(MARKER)) return false
  if (current === content) return true
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.wisp-tmp`
  writeFileSync(tmp, content, { mode })
  chmodSync(tmp, mode)
  renameSync(tmp, path)
  return true
}

/** Apaga um arquivo do Wisp (com a marca). Devolve false se o arquivo existe e não é dele. */
export function removeOwnFile(path: string): boolean {
  let current: string
  try {
    current = readFileSync(path, 'utf8')
  } catch {
    return true
  }
  if (!current.includes(MARKER)) return false
  rmSync(path, { force: true })
  return true
}

export interface LauncherTarget {
  /** O executável do Electron (ou do app empacotado, ou o arquivo .AppImage). */
  electron: string
  /** No Flatpak, o id do app: o comando chama o `flatpak run` (o executável só existe dentro). */
  flatpak?: string | null
  /** A pasta do app, no desenvolvimento; empacotado, o executável já sabe onde está. */
  appPath: string | null
  /** O ícone do app (PNG). */
  icon: string
}

/**
 * Escreve o comando `wisp` (um script curto) e, fora de um pacote (no código e no AppImage), a
 * entrada do Wisp no menu de apps (~/.local/share/applications), que também dá o id do app aos
 * portais. Os dois são reescritos sempre que o app abre, para acompanhar o lugar dele.
 */
export function deployLauncher(target: LauncherTarget, withMenuEntry: boolean): void {
  const app = target.appPath ? ` ${shellQuote(target.appPath)}` : ''
  const script = [
    '#!/bin/sh',
    '# Abre o Wisp, ou entrega o pedido ao Wisp já aberto:',
    '#   wisp --toggle       abre ou fecha o painel',
    '#   wisp --new          começa uma conversa nova',
    '#   wisp --palette      abre a paleta de comandos',
    '#   wisp --ask "texto"  manda uma mensagem ao Claude',
    '#   wisp --file arquivo  anexa um arquivo na conversa em foco',
    '# O Wisp reescreve este arquivo sempre que abre.',
    'unset ELECTRON_RUN_AS_NODE NODE_OPTIONS',
    target.flatpak
      ? `exec flatpak run ${shellQuote(target.flatpak)} "$@"`
      : `exec ${shellQuote(target.electron)}${app} --ozone-platform=x11 "$@"`,
    ''
  ].join('\n')
  try {
    mkdirSync(dirname(LAUNCHER_PATH), { recursive: true, mode: 0o700 })
    writeFileSync(LAUNCHER_PATH, script, { mode: 0o755 })
    chmodSync(LAUNCHER_PATH, 0o755)
  } catch (err) {
    console.warn('[wisp] não consegui escrever o comando wisp:', err)
  }
  if (!withMenuEntry) return
  const entry = [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Wisp',
    'GenericName=Assistente',
    'GenericName[pt_BR]=Assistente',
    'Comment=Um fogo-fátuo com o Claude Code',
    `Exec=${desktopExec()}`,
    `Icon=${target.icon}`,
    'Terminal=false',
    'Categories=Utility;',
    `StartupWMClass=${APP_ID}`,
    'Actions=toggle;new;',
    MARKER,
    '',
    '[Desktop Action toggle]',
    'Name=Abrir ou fechar o painel',
    `Exec=${desktopExec('--toggle')}`,
    '',
    '[Desktop Action new]',
    'Name=Nova conversa',
    `Exec=${desktopExec('--new')}`,
    ''
  ].join('\n')
  try {
    if (!writeOwnFile(join(applicationsDir(), `${APP_ID}.desktop`), entry)) {
      console.warn(`[wisp] ${APP_ID}.desktop já existe e não é do Wisp; deixei como está.`)
    }
  } catch (err) {
    console.warn('[wisp] não consegui escrever a entrada do menu de apps:', err)
  }
}
