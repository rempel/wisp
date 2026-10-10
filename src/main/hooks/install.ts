import { createHash } from 'crypto'
import {
  chmodSync,
  constants,
  copyFileSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync
} from 'fs'
import { homedir } from 'os'
import { dirname, isAbsolute, join } from 'path'
import { compactHunks, lineDiff } from '../../shared/diff'
import type { HookPreview, HooksAction, HooksStatus } from '../../shared/ipc'
import { shellQuote } from '../launcher'
import { DATA_DIR } from '../paths'
import { HOOK_EVENTS, RELAY_NAME } from './protocol'

/** Onde o relay fica para o Claude Code: um script curto que roda o relay do app. */
export const WRAPPER_PATH = join(DATA_DIR, 'bin', RELAY_NAME)

/** O settings.json do Claude Code do usuário (respeita o CLAUDE_CONFIG_DIR). */
export function settingsPath(env: NodeJS.ProcessEnv = process.env): string {
  const dir = env.CLAUDE_CONFIG_DIR
  return join(dir && isAbsolute(dir) ? dir : join(homedir(), '.claude'), 'settings.json')
}

const tilde = (path: string): string =>
  path.startsWith(homedir() + '/') ? `~${path.slice(homedir().length)}` : path

/**
 * Escreve o script que o Claude Code chama a cada hook. Ele roda o relay com o próprio Electron
 * em modo Node, então não depende de nada instalado. O Wisp o reescreve sempre que abre, para
 * acompanhar o lugar do app; sem o app ali, o script sai sem fazer nada.
 */
export function deployRelay(
  electron = process.execPath,
  relay = join(__dirname, 'wisp-hook.js')
): void {
  const script = [
    '#!/bin/sh',
    '# Relay dos hooks do Claude Code para o Wisp. O Wisp reescreve este arquivo sempre que abre.',
    '# Sem o Wisp neste lugar, sai sem fazer nada e o Claude Code segue normal.',
    `electron=${shellQuote(electron)}`,
    `relay=${shellQuote(relay)}`,
    '[ -x "$electron" ] && [ -f "$relay" ] || exit 0',
    'unset NODE_OPTIONS',
    'ELECTRON_RUN_AS_NODE=1 exec "$electron" "$relay" "$@"',
    ''
  ].join('\n')
  try {
    mkdirSync(dirname(WRAPPER_PATH), { recursive: true, mode: 0o700 })
    let current = ''
    try {
      current = readFileSync(WRAPPER_PATH, 'utf8')
    } catch {
      // Ainda não existe.
    }
    if (current !== script) writeFileSync(WRAPPER_PATH, script, { mode: 0o700 })
    chmodSync(WRAPPER_PATH, 0o700)
  } catch (err) {
    console.warn('[wisp] não consegui preparar o relay dos hooks:', err)
  }
}

/** O comando de um evento: o caminho do relay (entre aspas) e o nome do evento. */
function hookCommand(event: string): string {
  return `${shellQuote(WRAPPER_PATH)} ${event}`
}

/** A entrada do Wisp num evento, no formato do settings.json. */
function ourEntry(event: (typeof HOOK_EVENTS)[number]): Record<string, unknown> {
  return {
    hooks: [
      {
        type: 'command',
        command: hookCommand(event.event),
        timeout: event.timeout,
        ...(event.async ? { async: true } : {})
      }
    ]
  }
}

/** Uma entrada é do Wisp se algum comando dela chama o relay do Wisp. */
function isOurs(entry: unknown): boolean {
  const hooks = (entry as { hooks?: unknown } | null)?.hooks
  return (
    Array.isArray(hooks) &&
    hooks.some((hook: { command?: unknown } | null) => {
      const command = hook?.command
      return typeof command === 'string' && command.includes(`/${RELAY_NAME}`)
    })
  )
}

type Settings = Record<string, unknown>

interface Current {
  path: string
  /** Bytes como estão, ou null se o arquivo não existe. */
  bytes: Buffer | null
  settings: Settings
  /** Recuo usado no arquivo, para a mudança não reformatar o resto. */
  indent: string
}

/** Lê o settings.json. Lança um erro em português se não der para mexer nele com segurança. */
function readCurrent(): Current {
  const path = settingsPath()
  let bytes: Buffer | null = null
  try {
    bytes = readFileSync(path)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(`não consegui ler o ${tilde(path)} (${(err as Error).message})`, {
        cause: err
      })
    }
  }
  if (!bytes || !bytes.toString('utf8').trim()) return { path, bytes, settings: {}, indent: '  ' }
  const text = bytes.toString('utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new Error(
      `o ${tilde(path)} não é um JSON válido (${(err as Error).message}); o Wisp não mexe nele assim`,
      { cause: err }
    )
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`o ${tilde(path)} deveria ter um objeto JSON; o Wisp não mexe nele assim`)
  }
  const indent = /\n([ \t]+)"/.exec(text)?.[1] ?? '  '
  return { path, bytes, settings: parsed as Settings, indent }
}

/** As configurações com as entradas do Wisp acrescentadas (ou tiradas); o resto fica igual. */
function merged(settings: Settings, action: HooksAction, path: string): Settings {
  const root = { ...settings }
  const current = root.hooks ?? {}
  if (typeof current !== 'object' || Array.isArray(current)) {
    throw new Error(`"hooks" no ${tilde(path)} não tem o formato esperado; o Wisp não mexeu nele`)
  }
  const hooks = { ...(current as Record<string, unknown>) }
  // Tira as entradas do Wisp de todos os eventos (inclusive de versões antigas)…
  for (const [event, list] of Object.entries(hooks)) {
    if (!Array.isArray(list)) {
      if (HOOK_EVENTS.some((hook) => hook.event === event)) {
        throw new Error(
          `"hooks.${event}" no ${tilde(path)} não tem o formato esperado; o Wisp não mexeu nele`
        )
      }
      continue
    }
    const others = list.filter((entry) => !isOurs(entry))
    if (others.length) hooks[event] = others
    else delete hooks[event]
  }
  // …e, para instalar, põe as de agora no fim de cada evento, depois das do usuário.
  if (action === 'install') {
    for (const event of HOOK_EVENTS) {
      const list = (hooks[event.event] as unknown[] | undefined) ?? []
      hooks[event.event] = [...list, ourEntry(event)]
    }
  }
  if (Object.keys(hooks).length) root.hooks = hooks
  else delete root.hooks
  return root
}

const fingerprintOf = (bytes: Buffer | null): string =>
  bytes ? createHash('sha256').update(bytes).digest('hex') : 'sem-arquivo'

const serialize = (settings: Settings, indent: string): string =>
  JSON.stringify(settings, null, indent) + '\n'

/** "2026-10-10-124501", para o nome do backup. */
function stamp(date = new Date()): string {
  const two = (n: number): string => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}-` +
    `${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`
  )
}

/** Copia o arquivo para o backup sem sobrescrever outro: "…-124501", "…-124501-2"… */
function backupFile(source: string, name: string): string {
  for (let n = 1; ; n++) {
    const target = n === 1 ? name : `${name}-${n}`
    try {
      copyFileSync(source, target, constants.COPYFILE_EXCL)
      return target
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST' || n >= 100) throw err
    }
  }
}

/** Se os hooks do Wisp estão no settings.json, iguais aos de agora. */
export function hooksStatus(): HooksStatus {
  const path = settingsPath()
  try {
    const { settings } = readCurrent()
    const hooks = (settings.hooks ?? {}) as Record<string, unknown>
    const ours = HOOK_EVENTS.filter((event) => {
      const list = hooks[event.event]
      return (
        Array.isArray(list) &&
        list.some((entry) => JSON.stringify(entry) === JSON.stringify(ourEntry(event)))
      )
    })
    const any = Object.values(hooks).some((list) => Array.isArray(list) && list.some(isOurs))
    return {
      installed: ours.length === HOOK_EVENTS.length,
      outdated: any && ours.length !== HOOK_EVENTS.length,
      settingsPath: tilde(path)
    }
  } catch (err) {
    return {
      installed: false,
      outdated: false,
      settingsPath: tilde(path),
      problem: (err as Error).message
    }
  }
}

/**
 * O que instalar (ou desinstalar) muda no settings.json: o diff, o backup que vai ser feito e
 * uma impressão digital do arquivo, para gravar só o que o usuário viu.
 */
export function previewHooks(action: HooksAction): HookPreview | { error: string } {
  try {
    const current = readCurrent()
    const before = current.bytes ? current.bytes.toString('utf8') : ''
    const after = serialize(merged(current.settings, action, current.path), current.indent)
    return {
      action,
      settingsPath: tilde(current.path),
      backupPath: current.bytes ? tilde(`${current.path}.backup-wisp-${stamp()}`) : null,
      diff: compactHunks(lineDiff(before, after)),
      fingerprint: fingerprintOf(current.bytes),
      changes: before !== after
    }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

/**
 * Grava a mudança que o usuário viu na prévia. Antes, confere que o arquivo continua igual e faz
 * o backup datado ao lado dele. Grava num temporário e renomeia, no destino do link se o
 * settings.json for um, mantendo as permissões.
 */
export function applyHooks(
  action: HooksAction,
  fingerprint: string
): { ok: true; backupPath: string | null } | { error: string } {
  try {
    const current = readCurrent()
    if (fingerprintOf(current.bytes) !== fingerprint) {
      return { error: `o ${tilde(current.path)} mudou desde a prévia; veja as mudanças de novo` }
    }
    const content = serialize(merged(current.settings, action, current.path), current.indent)
    let target = current.path
    let mode: number | null = null
    let backup: string | null = null
    if (current.bytes) {
      target = realpathSync(current.path)
      mode = statSync(target).mode & 0o777
      backup = backupFile(target, `${current.path}.backup-wisp-${stamp()}`)
      chmodSync(backup, mode)
    } else {
      mkdirSync(dirname(target), { recursive: true })
    }
    const tmp = `${target}.wisp-tmp`
    writeFileSync(tmp, content, 'utf8')
    if (mode !== null) chmodSync(tmp, mode)
    renameSync(tmp, target)
    return { ok: true, backupPath: backup && tilde(backup) }
  } catch (err) {
    return { error: (err as Error).message }
  }
}
