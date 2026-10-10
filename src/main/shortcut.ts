import { globalShortcut } from 'electron'
import { Variant } from './dbus'
import type { DBusConnection } from './dbus'
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

/** O atalho global e por onde ele funciona. */
export interface ShortcutStatus {
  /** 'x11': pelo próprio Electron; 'portal': pelo portal do desktop (Wayland); 'none': nenhum. */
  via: 'x11' | 'portal' | 'none'
  /** Como o desktop mostra o atalho ("Ctrl+Alt+W"), quando se sabe. */
  label?: string
  /** Por que não há atalho. */
  problem?: string
}

const SHORTCUT_ID = 'toggle'
const DESCRIPTION = 'Abrir ou fechar o painel do Wisp'

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

/** Desfaz o atalho atual (para trocar de atalho ou ao fechar o app). */
export function releaseShortcut(): void {
  unbind?.()
  unbind = null
}

/**
 * Liga o atalho global que abre e fecha o painel.
 * - No X11, o próprio Electron prende a tecla.
 * - No Wayland, só o portal GlobalShortcuts funciona: o Electron roda no XWayland e só veria
 *   teclas digitadas em janelas X11. O desktop (GNOME 48+, KDE) mostra uma janela para o usuário
 *   confirmar ou escolher a tecla.
 */
export async function setupShortcut(
  accelerator: string | null,
  activate: () => void,
  wayland = process.env.XDG_SESSION_TYPE === 'wayland'
): Promise<ShortcutStatus> {
  releaseShortcut()
  if (!accelerator?.trim()) return { via: 'none', problem: 'desligado no config.json' }
  if (!wayland) {
    try {
      if (globalShortcut.register(accelerator, activate)) {
        unbind = () => globalShortcut.unregister(accelerator)
        return { via: 'x11', label: accelerator }
      }
      return { via: 'none', problem: `${accelerator} já é usado por outro programa` }
    } catch {
      return { via: 'none', problem: `"${accelerator}" não é um atalho válido` }
    }
  }
  const bus = await portalBus()
  if (!bus) return { via: 'none', problem: 'sem D-Bus' }
  return bindWithPortal(bus, accelerator, activate)
}

async function bindWithPortal(
  bus: DBusConnection,
  accelerator: string,
  activate: () => void
): Promise<ShortcutStatus> {
  const iface = 'org.freedesktop.portal.GlobalShortcuts'
  if ((await portalVersion(bus, iface)) === null) {
    return { via: 'none', problem: 'este desktop não tem o portal de atalhos globais' }
  }
  // 1. A sessão, à qual o atalho fica preso.
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
  if (created.response !== 0) {
    return { via: 'none', problem: 'o desktop recusou a sessão de atalhos' }
  }
  const session =
    typeof created.results.session_handle === 'string'
      ? created.results.session_handle
      : requestPath(bus, sessionToken, 'session')
  // 2. As ativações, ouvidas antes de ligar o atalho, para a primeira não se perder.
  const unsubscribe = await bus.subscribe(
    { path: PORTAL_PATH, interface: iface, member: 'Activated' },
    (signal) => {
      const [from, id] = signal.body as [string, string]
      if (from === session && id === SHORTCUT_ID) activate()
    }
  )
  // 3. Se o atalho já foi ligado numa abertura anterior, o desktop o devolve aqui, e não é
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
  const known = findShortcut(listed?.response === 0 ? listed.results.shortcuts : undefined)
  if (known) {
    unbind = () => {
      unsubscribe()
      closeSession(bus, session)
    }
    return { via: 'portal', ...labelOf(known) }
  }
  // 4. O atalho: o desktop mostra uma janela para o usuário confirmar ou escolher a tecla.
  const trigger = toPortalTrigger(accelerator)
  const bindToken = token()
  const bound = await portalRequest(
    bus,
    {
      interface: iface,
      member: 'BindShortcuts',
      signature: 'oa(sa{sv})sa{sv}',
      body: [
        session,
        [
          [
            SHORTCUT_ID,
            {
              description: new Variant('s', DESCRIPTION),
              ...(trigger ? { preferred_trigger: new Variant('s', trigger) } : {})
            }
          ]
        ],
        '',
        options({ handle_token: bindToken })
      ]
    },
    bindToken
  )
  const mine = findShortcut(bound.results.shortcuts)
  if (bound.response !== 0 || !mine) {
    unsubscribe()
    closeSession(bus, session)
    return {
      via: 'none',
      problem:
        bound.response === 1
          ? 'o atalho foi recusado na janela do desktop'
          : 'o desktop não ligou o atalho'
    }
  }
  unbind = () => {
    unsubscribe()
    closeSession(bus, session)
  }
  return { via: 'portal', ...labelOf(mine) }
}

/** O atalho do Wisp numa lista de atalhos do portal (a(sa{sv}), já sem os Variant). */
function findShortcut(list: unknown): Record<string, unknown> | null {
  if (!Array.isArray(list)) return null
  const found = (list as [string, Record<string, unknown>][]).find(([id]) => id === SHORTCUT_ID)
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
