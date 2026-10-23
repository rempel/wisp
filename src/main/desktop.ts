import { spawn } from 'child_process'
import { accessSync, constants, readdirSync, readFileSync, realpathSync, statSync } from 'fs'
import { homedir } from 'os'
import { delimiter, join, resolve, sep } from 'path'
import { expandHome } from './paths'
import { viaHost } from './host'

// Ferramentas de desktop do servidor MCP (seção 6). Node puro: sem Electron, para dar para
// testar fora do app. Processos sempre com spawn e lista de argumentos, nunca via shell.

// ---------------------------------------------------------------------------
// Apps (.desktop)

export interface AppEntry {
  id: string
  nome: string
  /** Nome genérico ou comentário do app ("Navegador web"), quando existir. */
  descricao?: string
}

interface DesktopFile extends AppEntry {
  path: string
  keywords: string
}

/** Pastas de .desktop, da mais prioritária para a menos (a do usuário ganha). */
function applicationDirs(): string[] {
  const home = homedir()
  return [
    join(home, '.local/share/applications'),
    join(home, '.local/share/flatpak/exports/share/applications'),
    '/var/lib/flatpak/exports/share/applications',
    '/var/lib/snapd/desktop/applications',
    '/usr/local/share/applications',
    '/usr/share/applications'
  ]
}

/** Lê o grupo [Desktop Entry] de um arquivo .desktop. */
function parseDesktopEntry(text: string): Map<string, string> {
  const fields = new Map<string, string>()
  let inEntry = false
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('[')) {
      inEntry = line === '[Desktop Entry]'
      continue
    }
    const eq = line.indexOf('=')
    if (inEntry && eq > 0) fields.set(line.slice(0, eq).trim(), unescape(line.slice(eq + 1).trim()))
  }
  return fields
}

function unescape(value: string): string {
  return value.replace(/\\([sntr\\])/g, (_, c: string) =>
    c === 's' ? ' ' : c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : '\\'
  )
}

/** Chaves localizadas na ordem da especificação: Name[pt_BR], Name[pt], Name. */
function localizedKeys(key: string): string[] {
  const locale = (process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '')
    .split('.')[0]
    .split('@')[0]
  const keys = [key]
  if (locale && locale !== 'C' && locale !== 'POSIX') {
    const lang = locale.split('_')[0]
    keys.unshift(`${key}[${lang}]`)
    if (locale !== lang) keys.unshift(`${key}[${locale}]`)
  }
  return keys
}

function localized(fields: Map<string, string>, key: string): string | undefined {
  for (const k of localizedKeys(key)) {
    const value = fields.get(k)
    if (value) return value
  }
  return undefined
}

function inPath(command: string): boolean {
  if (command.includes('/')) return isExecutable(command)
  return (process.env.PATH ?? '')
    .split(delimiter)
    .some((dir) => dir && isExecutable(join(dir, command)))
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** O app deve aparecer neste desktop? (OnlyShowIn / NotShowIn) */
function shownHere(fields: Map<string, string>): boolean {
  const current = (process.env.XDG_CURRENT_DESKTOP ?? '').split(':').filter(Boolean)
  if (current.length === 0) return true
  const list = (key: string): string[] => (fields.get(key) ?? '').split(';').filter(Boolean)
  const only = list('OnlyShowIn')
  if (only.length > 0 && !only.some((d) => current.includes(d))) return false
  return !list('NotShowIn').some((d) => current.includes(d))
}

function readApps(): DesktopFile[] {
  const apps = new Map<string, DesktopFile>()
  for (const dir of applicationDirs()) {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (!name.endsWith('.desktop')) continue
      const id = name.slice(0, -'.desktop'.length)
      if (apps.has(id)) continue
      const path = join(dir, name)
      let fields: Map<string, string>
      try {
        fields = parseDesktopEntry(readFileSync(path, 'utf8'))
      } catch {
        continue
      }
      const nome = localized(fields, 'Name')
      if (
        fields.get('Type') !== 'Application' ||
        fields.get('NoDisplay') === 'true' ||
        fields.get('Hidden') === 'true' ||
        !nome ||
        !shownHere(fields)
      ) {
        // Mesmo escondido, reserva o id: um .desktop do usuário pode esconder o do sistema.
        apps.set(id, { id, nome: '', path: '', keywords: '' })
        continue
      }
      const tryExec = fields.get('TryExec')
      if (tryExec && !inPath(tryExec)) continue
      const descricao = localized(fields, 'GenericName') ?? localized(fields, 'Comment')
      const keywords = localized(fields, 'Keywords') ?? ''
      apps.set(id, { id, nome, ...(descricao ? { descricao } : {}), path, keywords })
    }
  }
  return [...apps.values()]
    .filter((app) => app.nome)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** Apps instalados. `busca` filtra por nome, id, descrição ou palavras-chave. */
export function listApps(busca?: string): AppEntry[] {
  const query = busca ? normalize(busca.trim()) : ''
  return readApps()
    .filter(
      (app) =>
        !query ||
        normalize(`${app.nome} ${app.id} ${app.descricao ?? ''} ${app.keywords}`).includes(query)
    )
    .map(({ id, nome, descricao }) => ({ id, nome, ...(descricao ? { descricao } : {}) }))
}

// ---------------------------------------------------------------------------
// Abrir coisas

/** Resultado de uma ação: mensagem para o Claude e se deu certo. */
export interface Outcome {
  ok: boolean
  message: string
}

/**
 * Roda um programa destacado do Wisp (continua aberto se o Wisp fechar) e espera ele sair
 * por até `waitMs`. Lançadores como gtk-launch e xdg-open saem logo depois de abrir o app;
 * se ainda estiver rodando ao fim da espera, considera que deu certo.
 * A saída vai para /dev/null: um pipe ligado ao app poderia derrubá-lo quando o Wisp fechasse.
 */
function launch(
  command: string,
  args: string[],
  waitMs = 8000,
  cwd?: string
): Promise<number | 'missing'> {
  return new Promise((done) => {
    let settled = false
    const finish = (result: number | 'missing'): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      done(result)
    }
    // No Flatpak, o app abre no sistema, fora do sandbox.
    const env = launchEnv()
    const run = viaHost(command, args, { env, cwd })
    const child = spawn(run.command, run.args, {
      detached: true,
      stdio: 'ignore',
      env,
      ...(cwd ? { cwd } : {})
    })
    const timer = setTimeout(() => finish(0), waitMs)
    child.on('error', (err: NodeJS.ErrnoException) => finish(err.code === 'ENOENT' ? 'missing' : 1))
    child.on('exit', (code) => finish(code ?? 1))
    child.unref()
  })
}

/**
 * Ambiente dos apps abertos: o do usuário, sem as variáveis que o npm e o Electron põem no
 * processo do Wisp (elas confundiriam outros apps, como um VS Code aberto daqui).
 */
function launchEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('npm_') || key.startsWith('ELECTRON_') || key === 'CHROME_DESKTOP') {
      delete env[key]
    }
  }
  return env
}

/** Abre um app pelo id do .desktop (gtk-launch; gio ou kioclient se ele não existir). */
export async function openApp(id: string): Promise<Outcome> {
  const cleanId = id.trim().replace(/\.desktop$/, '')
  const app = /^[\w.@+-]+$/.test(cleanId) ? readApps().find((a) => a.id === cleanId) : undefined
  if (!app) {
    return { ok: false, message: `Não achei o app "${id}". Use list_apps para ver os ids.` }
  }
  const attempts: [string, string[]][] = [
    ['gtk-launch', [app.id]],
    ['gio', ['launch', app.path]],
    ['kioclient', ['exec', app.path]],
    ['kioclient5', ['exec', app.path]]
  ]
  for (const [command, args] of attempts) {
    const result = await launch(command, args)
    if (result === 'missing') continue
    return result === 0
      ? { ok: true, message: `Abri ${app.nome}.` }
      : { ok: false, message: `${command} não conseguiu abrir ${app.nome} (código ${result}).` }
  }
  return {
    ok: false,
    message:
      'Não achei um lançador de apps. Instale o gtk-launch (pacote libgtk-3-bin no Ubuntu ' +
      'e no Debian).'
  }
}

/** Abre um link no navegador padrão. Só http e https. */
export async function openUrl(url: string): Promise<Outcome> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, message: `"${url}" não é uma URL válida.` }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, message: 'Só abro links http e https.' }
  }
  const result = await launch('xdg-open', [parsed.href], 3000)
  if (result === 'missing') {
    return { ok: false, message: 'O xdg-open não está instalado (pacote xdg-utils).' }
  }
  return result === 0
    ? { ok: true, message: `Abri ${parsed.href} no navegador.` }
    : { ok: false, message: `O xdg-open não conseguiu abrir o link (código ${result}).` }
}

// ---------------------------------------------------------------------------
// Projetos

export interface ProjectEntry {
  nome: string
  caminho: string
}

const SKIP_DIRS = new Set(['node_modules', 'vendor', 'target', 'build', 'dist'])

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function hasGit(dir: string): boolean {
  try {
    statSync(join(dir, '.git')) // pasta, ou arquivo em worktrees e submódulos
    return true
  } catch {
    return false
  }
}

function subdirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
      .map((e) => join(dir, e.name))
  } catch {
    return []
  }
}

/** Repositórios git até dois níveis abaixo de cada pasta de projectRoots. */
export function listProjects(projectRoots: string[]): ProjectEntry[] {
  const found = new Map<string, ProjectEntry>()
  for (const root of projectRoots) {
    const base = resolve(expandHome(root))
    for (const level1 of subdirs(base)) {
      if (hasGit(level1)) {
        found.set(level1, { nome: level1.slice(base.length + 1), caminho: level1 })
        continue
      }
      for (const level2 of subdirs(level1)) {
        if (hasGit(level2))
          found.set(level2, { nome: level2.slice(base.length + 1), caminho: level2 })
      }
    }
  }
  return [...found.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function realpathOrNull(path: string): string | null {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

/**
 * Abre uma pasta no editor (`editorCommand`, que pode ter argumentos, como "code -n").
 * A pasta precisa estar dentro de uma das projectRoots (links simbólicos resolvidos).
 */
export async function openProject(
  path: string,
  projectRoots: string[],
  editorCommand: string
): Promise<Outcome> {
  const target = realpathOrNull(resolve(expandHome(path.trim())))
  if (!target || !isDir(target)) return { ok: false, message: `A pasta "${path}" não existe.` }
  const roots = projectRoots
    .map((root) => realpathOrNull(resolve(expandHome(root))))
    .filter((root): root is string => root !== null)
  if (!roots.some((root) => target === root || target.startsWith(root + sep))) {
    return {
      ok: false,
      message:
        `"${target}" está fora das pastas de projetos (${projectRoots.join(', ')}). ` +
        'Só abro projetos que estejam dentro delas.'
    }
  }
  return openInEditor(target, editorCommand)
}

/**
 * Abre uma pasta no editor (editorCommand). Sem a trava de projectRoots: é para o que o próprio
 * usuário pede no painel, como a pasta de uma sessão do terminal.
 */
export async function openInEditor(path: string, editorCommand: string): Promise<Outcome> {
  const target = realpathOrNull(resolve(expandHome(path.trim())))
  if (!target || !isDir(target)) return { ok: false, message: `A pasta "${path}" não existe.` }
  const [command, ...args] = editorCommand.trim().split(/\s+/)
  if (!command) return { ok: false, message: 'editorCommand está vazio no config.json.' }
  const result = await launch(command, [...args, target], 5000)
  if (result === 'missing') {
    return { ok: false, message: `Não achei o editor "${command}" (editorCommand no config.json).` }
  }
  return result === 0
    ? { ok: true, message: `Abri ${target} no editor.` }
    : { ok: false, message: `O editor saiu com erro (código ${result}).` }
}

// ---------------------------------------------------------------------------
// Terminal

/** Terminais conhecidos e como pedir que abram numa pasta (o resto abre na pasta do processo). */
const TERMINALS: Record<string, { name: string; args: (dir: string) => string[] }> = {
  ptyxis: { name: 'Ptyxis', args: (dir) => ['--new-window', '--working-directory', dir] },
  kgx: { name: 'Console', args: (dir) => ['--working-directory', dir] },
  'gnome-terminal': { name: 'Terminal', args: (dir) => ['--window', `--working-directory=${dir}`] },
  konsole: { name: 'Konsole', args: (dir) => ['--workdir', dir] },
  'xfce4-terminal': { name: 'Terminal do Xfce', args: (dir) => [`--working-directory=${dir}`] },
  'mate-terminal': { name: 'Terminal do MATE', args: (dir) => [`--working-directory=${dir}`] },
  tilix: { name: 'Tilix', args: (dir) => [`--working-directory=${dir}`] },
  terminator: { name: 'Terminator', args: (dir) => [`--working-directory=${dir}`] },
  kitty: { name: 'kitty', args: (dir) => ['--directory', dir] },
  alacritty: { name: 'Alacritty', args: (dir) => ['--working-directory', dir] },
  wezterm: { name: 'WezTerm', args: (dir) => ['start', '--cwd', dir] },
  foot: { name: 'foot', args: (dir) => [`--working-directory=${dir}`] },
  'x-terminal-emulator': { name: 'terminal', args: () => [] },
  xterm: { name: 'XTerm', args: () => [] }
}

/** A ordem de tentativa: o $TERMINAL, o do desktop e depois os mais comuns. */
export function terminalOrder(env: NodeJS.ProcessEnv = process.env): string[] {
  const desktop = (env.XDG_CURRENT_DESKTOP ?? '').toUpperCase()
  const preferred = desktop.includes('KDE')
    ? ['konsole']
    : desktop.includes('GNOME')
      ? ['ptyxis', 'kgx', 'gnome-terminal']
      : desktop.includes('XFCE')
        ? ['xfce4-terminal']
        : desktop.includes('MATE')
          ? ['mate-terminal']
          : []
  const chosen = env.TERMINAL?.trim() ? [env.TERMINAL.trim()] : []
  return [...new Set([...chosen, ...preferred, 'x-terminal-emulator', ...Object.keys(TERMINALS)])]
}

/** O terminal que o Wisp abriria (o configurado ou o primeiro achado); null se nenhum. */
export function findTerminal(
  terminalCommand: string | null,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const configured = terminalCommand?.trim().split(/\s+/)[0]
  if (configured) return inPath(configured) ? configured : null
  return terminalOrder(env).find(inPath) ?? null
}

/**
 * Abre um terminal na pasta: o do `terminalCommand` (com {dir} no lugar da pasta, ou só rodando
 * nela), senão o primeiro que achar na ordem de terminalOrder.
 */
export async function openTerminal(
  dir: string,
  terminalCommand: string | null,
  env: NodeJS.ProcessEnv = process.env
): Promise<Outcome> {
  const configured = terminalCommand?.trim()
  if (configured) {
    const [command, ...args] = configured.split(/\s+/)
    const result = await launch(
      command,
      args.map((arg) => arg.replaceAll('{dir}', dir)),
      1500,
      dir
    )
    if (result === 'missing') {
      return {
        ok: false,
        message: `Não achei o terminal "${command}" (terminalCommand no config.json).`
      }
    }
    return result === 0
      ? { ok: true, message: `Abri o terminal em ${dir}.` }
      : { ok: false, message: `O terminal saiu com erro (código ${result}).` }
  }
  for (const command of terminalOrder(env)) {
    if (!inPath(command)) continue
    const known = TERMINALS[command.split('/').pop() ?? command]
    const result = await launch(command, known ? known.args(dir) : [], 1500, dir)
    if (result === 0) return { ok: true, message: `Abri o ${known?.name ?? command} em ${dir}.` }
  }
  return {
    ok: false,
    message:
      'Não achei um terminal instalado. Diga qual usar em terminalCommand no config.json ' +
      '(por exemplo "kitty" ou "konsole --workdir {dir}").'
  }
}

/**
 * Abre um terminal numa pasta da pasta pessoal ou de uma das projectRoots (links resolvidos);
 * sem pasta, na pasta pessoal.
 */
export async function openTerminalIn(
  path: string | undefined,
  projectRoots: string[],
  terminalCommand: string | null
): Promise<Outcome> {
  const asked = path?.trim() || '~'
  const target = realpathOrNull(resolve(expandHome(asked)))
  if (!target || !isDir(target)) return { ok: false, message: `A pasta "${asked}" não existe.` }
  const roots = [homedir(), ...projectRoots]
    .map((root) => realpathOrNull(resolve(expandHome(root))))
    .filter((root): root is string => root !== null)
  if (!roots.some((root) => target === root || target.startsWith(root + sep))) {
    return {
      ok: false,
      message: `"${target}" fica fora da pasta pessoal e das pastas de projetos; só abro terminais nelas.`
    }
  }
  return openTerminal(target, terminalCommand)
}
