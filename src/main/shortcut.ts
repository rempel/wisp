import { globalShortcut } from 'electron'
import { Variant } from './dbus'
import type { DBusConnection } from './dbus'
import { XClient } from './ewmh'
import {
  options,
  PORTAL,
  PORTAL_PATH,
  portalBus,
  portalRequest,
  portalVersion,
  requestPath,
  token
} from './portal'
import { t } from '../shared/i18n'

/** Um atalho global e por onde ele funciona. */
export interface ShortcutStatus {
  /** 'x11': pelo próprio Electron; 'portal': pelo portal do desktop (Wayland); 'none': nenhum. */
  via: 'x11' | 'portal' | 'none'
  /** Como o desktop mostra o atalho ("Ctrl+Alt+W"), quando se sabe. */
  label?: string
  /** Por que não há atalho. */
  problem?: string
  /** O Wisp fica sabendo quando a tecla é solta (o "segure para falar"). */
  releases?: boolean
}

/** Um atalho para ligar. */
export interface ShortcutSpec {
  /** O id no portal: fica guardado no desktop entre uma abertura e outra. */
  id: string
  /** Formato do Electron ("Ctrl+Alt+W"); null desliga. */
  accelerator: string | null
  /** O que o desktop mostra na janela de atalhos. */
  description: string
  /** A tecla foi apertada. No X11, a repetição do teclado chama de novo enquanto ela fica presa. */
  press(): void
  /** A tecla foi solta (só para quem precisa saber, e só onde dá). */
  release?(): void
}

/** De quanto em quanto tempo (ms) o Wisp confere, no X11, se a tecla ainda está apertada. */
const RELEASE_POLL_MS = 30

const MODIFIERS: Record<string, string> = {
  command: 'CTRL',
  cmd: 'CTRL',
  commandorcontrol: 'CTRL',
  cmdorctrl: 'CTRL',
  control: 'CTRL',
  ctrl: 'CTRL',
  alt: 'ALT',
  option: 'ALT',
  altgr: 'ALT',
  shift: 'SHIFT',
  super: 'LOGO',
  meta: 'LOGO'
}

const KEYS: Record<string, string> = {
  space: 'space',
  enter: 'Return',
  return: 'Return',
  tab: 'Tab',
  backspace: 'BackSpace',
  escape: 'Escape',
  esc: 'Escape',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  home: 'Home',
  end: 'End',
  pageup: 'Page_Up',
  pagedown: 'Page_Down',
  insert: 'Insert',
  delete: 'Delete',
  plus: 'plus',
  ',': 'comma',
  '.': 'period',
  '/': 'slash',
  ';': 'semicolon',
  "'": 'apostrophe',
  '[': 'bracketleft',
  ']': 'bracketright',
  '\\': 'backslash',
  '`': 'grave',
  '-': 'minus',
  '=': 'equal'
}

/** O número dos keysyms do X11 que não são uma letra ou um algarismo. */
const KEYSYMS: Record<string, number> = {
  space: 0x20,
  Return: 0xff0d,
  Tab: 0xff09,
  BackSpace: 0xff08,
  Escape: 0xff1b,
  Up: 0xff52,
  Down: 0xff54,
  Left: 0xff51,
  Right: 0xff53,
  Home: 0xff50,
  End: 0xff57,
  Page_Up: 0xff55,
  Page_Down: 0xff56,
  Insert: 0xff63,
  Delete: 0xffff,
  plus: 0x2b,
  comma: 0x2c,
  period: 0x2e,
  slash: 0x2f,
  semicolon: 0x3b,
  apostrophe: 0x27,
  bracketleft: 0x5b,
  bracketright: 0x5d,
  backslash: 0x5c,
  grave: 0x60,
  minus: 0x2d,
  equal: 0x3d
}

/** O keysym do X11 da tecla de um acelerador (sem os modificadores); null se não houver. */
export function acceleratorKeysym(accelerator: string): number | null {
  const trigger = toPortalTrigger(accelerator)
  const key = trigger?.split('+').pop()
  if (!key) return null
  if (/^[a-z0-9]$/.test(key)) return key.charCodeAt(0)
  const fn = /^F([1-9]|1[0-9]|2[0-4])$/.exec(key)
  if (fn) return 0xffbe + Number(fn[1]) - 1
  return KEYSYMS[key] ?? null
}

/**
 * Um acelerador do Electron ("Ctrl+Alt+W") no formato da especificação de atalhos do
 * freedesktop, que o portal usa ("CTRL+ALT+w"). null se alguma parte não tiver equivalente.
 */
export function toPortalTrigger(accelerator: string): string | null {
  const parts = accelerator.split('+').map((part) => part.trim())
  // "Ctrl++" (a tecla é o próprio +) deixa uma parte vazia no fim.
  if (parts.length > 1 && parts[parts.length - 1] === '' && parts[parts.length - 2] === '') {
    parts.splice(-2, 2, 'plus')
  }
  const key = parts.pop()
  if (!key) return null
  const modifiers: string[] = []
  for (const part of parts) {
    const modifier = MODIFIERS[part.toLowerCase()]
    if (!modifier) return null
    if (!modifiers.includes(modifier)) modifiers.push(modifier)
  }
  let keysym: string | undefined
  if (/^[a-z]$/i.test(key)) keysym = key.toLowerCase()
  else if (/^[0-9]$/.test(key)) keysym = key
  else if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(key)) keysym = key.toUpperCase()
  else keysym = KEYS[key.toLowerCase()]
  return keysym ? [...modifiers, keysym].join('+') : null
}

let unbind: (() => void) | null = null

/** Desfaz os atalhos atuais (para trocar de atalho ou ao fechar o app). */
export function releaseShortcuts(): void {
  unbind?.()
  unbind = null
}

/**
 * Liga os atalhos globais (abrir o painel, falar). Devolve como ficou cada um, pelo id.
 * - No X11, o próprio Electron prende as teclas. O Electron só avisa quando a tecla é apertada;
 *   para saber quando ela é solta, o Wisp pergunta ao servidor X, enquanto ela está apertada,
 *   quais teclas estão para baixo.
 * - No Wayland, só o portal GlobalShortcuts funciona: o Electron roda no XWayland e só veria
 *   teclas digitadas em janelas X11. O desktop (GNOME 48+, KDE) mostra uma janela para o usuário
 *   confirmar ou escolher as teclas, e avisa quando cada uma é apertada e solta.
 */
export async function setupShortcuts(
  specs: ShortcutSpec[],
  wayland = process.env.XDG_SESSION_TYPE === 'wayland'
): Promise<Map<string, ShortcutStatus>> {
  releaseShortcuts()
  const result = new Map<string, ShortcutStatus>()
  const active = specs.filter((spec) => {
    if (spec.accelerator?.trim()) return true
    result.set(spec.id, { via: 'none', problem: 'desligado no config.json' })
    return false
  })
  if (!active.length) return result
  if (!wayland) {
    for (const [id, status] of await bindWithX11(active)) result.set(id, status)
    return result
  }
  const bus = await portalBus()
  for (const spec of active) {
    if (!bus) result.set(spec.id, { via: 'none', problem: 'sem D-Bus' })
  }
  if (!bus) return result
  for (const [id, status] of await bindWithPortal(bus, active)) result.set(id, status)
  return result
}

async function bindWithX11(specs: ShortcutSpec[]): Promise<Map<string, ShortcutStatus>> {
  const result = new Map<string, ShortcutStatus>()
  const undo: (() => void)[] = []
  // A conexão com o servidor X para saber quando a tecla é solta, só se alguém quiser saber.
  const x = specs.some((spec) => spec.release) ? await XClient.open().catch(() => null) : null
  if (x) undo.push(() => x.close())
  const taken = new Map<string, string>()
  for (const spec of specs) {
    const accelerator = spec.accelerator as string
    const same = taken.get(accelerator.toLowerCase().replace(/\s+/g, ''))
    if (same) {
      result.set(spec.id, {
        via: 'none',
        problem: t('{accelerator} já é o atalho {same}', { accelerator, same })
      })
      continue
    }
    let keycodes: number[] = []
    if (spec.release && x) {
      const keysym = acceleratorKeysym(accelerator)
      if (keysym !== null) keycodes = await x.keycodesOf(keysym)
    }
    const watcher =
      keycodes.length && spec.release ? releaseWatcher(x!, keycodes, spec.release) : null
    try {
      const registered = globalShortcut.register(accelerator, () => {
        spec.press()
        watcher?.start()
      })
      if (!registered) {
        result.set(spec.id, {
          via: 'none',
          problem: t('{accelerator} já é usado por outro programa', { accelerator })
        })
        continue
      }
      undo.push(() => {
        watcher?.stop()
        globalShortcut.unregister(accelerator)
      })
      taken.set(accelerator.toLowerCase().replace(/\s+/g, ''), spec.id)
      result.set(spec.id, { via: 'x11', label: accelerator, releases: watcher !== null })
    } catch {
      result.set(spec.id, {
        via: 'none',
        problem: t('"{accelerator}" não é um atalho válido', { accelerator })
      })
    }
  }
  unbind = () => {
    for (const step of undo.reverse()) step()
  }
  return result
}

/**
 * Confere, de RELEASE_POLL_MS em RELEASE_POLL_MS, se a tecla ainda está apertada, e avisa quando
 * ela é solta. Só roda entre o aperto e o soltar. Se a conexão com o servidor X cair, conta como
 * solta.
 */
function releaseWatcher(
  x: XClient,
  keycodes: number[],
  release: () => void
): { start(): void; stop(): void } {
  let timer: NodeJS.Timeout | null = null
  const down = (keymap: Buffer): boolean =>
    keycodes.some((code) => (keymap[code >> 3] & (1 << (code & 7))) !== 0)
  const stop = (): void => {
    if (timer) clearInterval(timer)
    timer = null
  }
  let checking = false
  const check = async (): Promise<void> => {
    if (checking) return
    checking = true
    const keymap = x.alive ? await x.keymap() : null
    checking = false
    if (!timer) return
    if (!keymap || !down(keymap)) {
      stop()
      release()
    }
  }
  return {
    // A repetição do teclado chama o start de novo enquanto a tecla está presa: já está olhando.
    start() {
      if (timer) return
      timer = setInterval(() => void check(), RELEASE_POLL_MS)
    },
    stop
  }
}

async function bindWithPortal(
  bus: DBusConnection,
  specs: ShortcutSpec[]
): Promise<Map<string, ShortcutStatus>> {
  const result = new Map<string, ShortcutStatus>()
  const fail = (problem: string): Map<string, ShortcutStatus> => {
    for (const spec of specs) result.set(spec.id, { via: 'none', problem })
    return result
  }
  const iface = 'org.freedesktop.portal.GlobalShortcuts'
  if ((await portalVersion(bus, iface)) === null) {
    return fail(t('este desktop não tem o portal de atalhos globais'))
  }
  // 1. A sessão, à qual os atalhos ficam presos.
  const handle = token()
  const sessionToken = token()
  const created = await portalRequest(
    bus,
    {
      interface: iface,
      member: 'CreateSession',
      signature: 'a{sv}',
      body: [options({ handle_token: handle, session_handle_token: sessionToken })]
    },
    handle
  )
  if (created.response !== 0) return fail(t('o desktop recusou a sessão de atalhos'))
  const session =
    typeof created.results.session_handle === 'string'
      ? created.results.session_handle
      : requestPath(bus, sessionToken, 'session')
  // 2. As ativações e os soltar, ouvidos antes de ligar os atalhos, para nada se perder.
  const byId = new Map(specs.map((spec) => [spec.id, spec]))
  const unsubscribeActivated = await bus.subscribe(
    { path: PORTAL_PATH, interface: iface, member: 'Activated' },
    (signal) => {
      const [from, id] = signal.body as [string, string]
      if (from === session) byId.get(id)?.press()
    }
  )
  const unsubscribeDeactivated = await bus.subscribe(
    { path: PORTAL_PATH, interface: iface, member: 'Deactivated' },
    (signal) => {
      const [from, id] = signal.body as [string, string]
      if (from === session) byId.get(id)?.release?.()
    }
  )
  const close = (): void => {
    unsubscribeActivated()
    unsubscribeDeactivated()
    closeSession(bus, session)
  }
  const report = (list: unknown): Map<string, ShortcutStatus> => {
    for (const spec of specs) {
      const found = findShortcut(list, spec.id)
      result.set(
        spec.id,
        found
          ? { via: 'portal', ...labelOf(found), releases: Boolean(spec.release) }
          : { via: 'none', problem: t('o desktop não ligou o atalho') }
      )
    }
    return result
  }
  // 3. Se os atalhos já foram ligados numa abertura anterior, o desktop os devolve aqui, e não é
  //    preciso perguntar de novo (o GNOME devolve a lista vazia: lá a janela volta a aparecer).
  const listToken = token()
  const listed = await portalRequest(
    bus,
    {
      interface: iface,
      member: 'ListShortcuts',
      signature: 'oa{sv}',
      body: [session, options({ handle_token: listToken })]
    },
    listToken,
    10_000
  ).catch(() => null)
  const known = listed?.response === 0 ? listed.results.shortcuts : undefined
  if (specs.every((spec) => findShortcut(known, spec.id))) {
    unbind = close
    return report(known)
  }
  // 4. Os atalhos: o desktop mostra uma janela para o usuário confirmar ou escolher as teclas.
  const bindToken = token()
  const bound = await portalRequest(
    bus,
    {
      interface: iface,
      member: 'BindShortcuts',
      signature: 'oa(sa{sv})sa{sv}',
      body: [
        session,
        specs.map((spec) => {
          const trigger = toPortalTrigger(spec.accelerator as string)
          return [
            spec.id,
            {
              description: new Variant('s', spec.description),
              ...(trigger ? { preferred_trigger: new Variant('s', trigger) } : {})
            }
          ]
        }),
        '',
        options({ handle_token: bindToken })
      ]
    },
    bindToken
  )
  if (
    bound.response !== 0 ||
    !specs.some((spec) => findShortcut(bound.results.shortcuts, spec.id))
  ) {
    close()
    return fail(
      bound.response === 1
        ? t('o atalho foi recusado na janela do desktop')
        : t('o desktop não ligou o atalho')
    )
  }
  unbind = close
  return report(bound.results.shortcuts)
}

/** Um atalho do Wisp numa lista de atalhos do portal (a(sa{sv}), já sem os Variant). */
function findShortcut(list: unknown, id: string): Record<string, unknown> | null {
  if (!Array.isArray(list)) return null
  const found = (list as [string, Record<string, unknown>][]).find(([name]) => name === id)
  return found ? (found[1] ?? {}) : null
}

/** Como o desktop descreve a tecla ("Ctrl+Alt+W"). */
function labelOf(shortcut: Record<string, unknown>): { label?: string } {
  const label = shortcut.trigger_description
  return typeof label === 'string' && label ? { label } : {}
}

function closeSession(bus: DBusConnection, session: string): void {
  bus
    .call({
      destination: PORTAL,
      path: session,
      interface: 'org.freedesktop.portal.Session',
      member: 'Close',
      timeout: 3000
    })
    .catch(() => {})
}
