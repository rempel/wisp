import { homedir } from 'os'
import { isAbsolute, relative, resolve, sep } from 'path'

// Até onde vai o "Permitir sempre" e o que o modo Aceitar edições libera sem card. Vale para o
// chat e para as sessões do terminal.
//
// No Bash, liberar só o comando exato fazia o card voltar a cada comando novo ("ls" e depois
// "ls src"), e o "sempre" parecia não funcionar. Agora vale o programa ("ls", "cat") ou o
// programa com o subcomando ("git status", "npm test"). Continuam valendo só para o comando exato:
// - comandos compostos ou com redirecionamento (;, &&, |, >, $(…), crases);
// - programas que apagam, sobem privilégio, rodam outro código ou mandam dados para fora (rm,
//   sudo, curl, bash, python…);
// - comandos que mencionam arquivos de segredos (~/.ssh, .env, credenciais).

/** Programas em que o "sempre" vale com o subcomando: "git status" não libera "git push". */
const WITH_SUBCOMMAND = new Set([
  'git',
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'deno',
  'cargo',
  'rustup',
  'go',
  'docker',
  'podman',
  'kubectl',
  'helm',
  'systemctl',
  'journalctl',
  'apt',
  'apt-get',
  'dnf',
  'pacman',
  'zypper',
  'flatpak',
  'snap',
  'brew',
  'pip',
  'pip3',
  'uv',
  'poetry',
  'make',
  'gh',
  'mvn',
  'gradle',
  'dotnet',
  'composer'
])

/** Programas que só valem pelo comando exato: apagam, sobem privilégio ou rodam outro código. */
const EXACT_ONLY = new Set([
  'rm',
  'rmdir',
  'shred',
  'dd',
  'mkfs',
  'fdisk',
  'parted',
  'wipefs',
  'sudo',
  'su',
  'doas',
  'pkexec',
  'chmod',
  'chown',
  'chgrp',
  'kill',
  'pkill',
  'killall',
  'reboot',
  'shutdown',
  'poweroff',
  'halt',
  'curl',
  'wget',
  'ssh',
  'scp',
  'sftp',
  'rsync',
  'nc',
  'ncat',
  'socat',
  'sh',
  'bash',
  'zsh',
  'fish',
  'dash',
  'python',
  'python3',
  'node',
  'perl',
  'ruby',
  'php',
  'lua',
  'npx',
  'bunx',
  'pnpx',
  'eval',
  'exec',
  'source',
  '.',
  'xargs',
  'find',
  'env',
  'nohup',
  'setsid',
  'timeout',
  'watch',
  'crontab',
  'at',
  'mv',
  'cp',
  'ln',
  'tee',
  'truncate',
  'install',
  'sed',
  'awk',
  'git-filter-repo'
])

/** Pedaços de caminho de arquivos de segredos (chaves, tokens, senhas de navegador). */
const SECRETS =
  /(?:^|[\s'"=:/~])(?:\.ssh|\.gnupg|\.aws|\.azure|\.kube|\.netrc|\.pgpass|\.git-credentials|\.password-store|\.docker\/config\.json|\.config\/gh|\.config\/gcloud|\.claude\/\.credentials\.json|\.local\/share\/keyrings|\.mozilla|google-chrome|chromium|BraveSoftware|\.env(?:\.[\w.-]+)?|id_rsa|id_ed25519|id_ecdsa|id_dsa)(?:$|[\s'"/])/

/** Operadores que juntam comandos, redirecionam ou rodam outro comando dentro deste. */
const COMPOUND = /[;&|<>`\n]|\$\(/

/** O comando menciona arquivos de segredos. */
export function touchesSecrets(text: string): boolean {
  return SECRETS.test(text)
}

export interface Scope {
  /** A chave guardada no "sempre". */
  key: string
  /** O que o card mostra ("git status", "ls"); no comando exato, o próprio comando. */
  label?: string
  /** Só o comando exato. */
  exact?: boolean
}

/** O escopo do "Permitir sempre" de um comando do Bash. */
export function bashScope(command: string): Scope {
  const text = command.trim()
  const exact = { key: `Bash:${text}`, label: text, exact: true }
  if (!text || COMPOUND.test(text) || touchesSecrets(text)) return exact
  const tokens = text.split(/\s+/)
  const program = tokens[0]
  // "./script.sh", "/usr/bin/x", "VAR=1 x", aspas: o programa não é um nome simples.
  if (!/^[\w.+-]+$/.test(program) || EXACT_ONLY.has(program)) return exact
  if (WITH_SUBCOMMAND.has(program)) {
    const sub = tokens[1]
    if (!sub) return { key: `Bash:${program}`, label: program }
    // "git -C /outra/pasta …": a opção muda o que o subcomando faz.
    if (!/^[a-z][\w:.-]*$/i.test(sub)) return exact
    return { key: `Bash:${program} ${sub}`, label: `${program} ${sub}` }
  }
  return { key: `Bash:${program}`, label: program }
}

/** O escopo do "Permitir sempre": no Bash, como acima; nas outras ferramentas, a ferramenta. */
export function permissionScope(toolName: string, input: unknown): Scope {
  const command = (input as { command?: unknown } | null)?.command
  if (toolName === 'Bash' && typeof command === 'string') return bashScope(command)
  return { key: toolName }
}

/** Ferramentas de edição de arquivo que o modo Aceitar edições libera. */
export const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

/** O arquivo de uma ferramenta de edição. */
export function editedPath(input: unknown): string | null {
  const record = (input ?? {}) as Record<string, unknown>
  const path = record.file_path ?? record.notebook_path
  return typeof path === 'string' && path ? path : null
}

/**
 * No modo Aceitar edições, o Wisp libera sem card a edição de um arquivo na pasta pessoal (ou
 * numa das `roots`), menos os ocultos e o que está dentro de pastas ocultas: ~/.bashrc, ~/.ssh,
 * .git, .env e .config continuam pedindo. As `trusted` (o workspace do Wisp, os anexos) valem
 * mesmo dentro de uma pasta oculta.
 */
export function editAllowed(
  path: string,
  roots: string[] = [],
  trusted: string[] = [],
  home = homedir()
): boolean {
  if (!isAbsolute(path) || touchesSecrets(` ${path}`)) return false
  const target = resolve(path)
  const inside = (dir: string): string | null => {
    const rel = relative(resolve(dir), target)
    return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : null
  }
  if (trusted.some((dir) => inside(dir) !== null)) return true
  for (const dir of [home, ...roots]) {
    const rel = inside(dir)
    if (rel !== null && !rel.split(sep).some((part) => part.startsWith('.'))) return true
  }
  return false
}
