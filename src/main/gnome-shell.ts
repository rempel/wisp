// O GNOME com Wayland (Fase 70): lá o sistema não deixa um app ver nem trazer para a frente as
// janelas dos outros. Uma extensão pequena do GNOME Shell, que você instala pelas configurações
// do Wisp, expõe pelo D-Bus de sessão a lista das janelas e o trazer para a frente; o Wisp fala
// com ela aqui. Sem a extensão (ou fora do GNOME), tudo segue como antes.
//
// A extensão responde a qualquer programa da sua sessão, como a lista de janelas do X11: quem
// roda como você já pode ver os títulos das janelas por ela. Por isso ela é opcional.

import { spawn } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { DBusConnection } from './dbus'
import { MARKER, removeOwnFile, writeOwnFile } from './launcher'

export const EXTENSION_UUID = 'wisp@rempel.github.io'
export const SHELL_NAME = 'org.gnome.Shell'
export const SHELL_PATH = '/io/github/rempel/Wisp/Shell'
export const SHELL_IFACE = 'io.github.rempel.Wisp.Shell'

/** Uma janela como a extensão a descreve. */
export interface ShellWindow {
  id: number
  app: string
  title: string
  minimized: boolean
  active: boolean
  pid?: number
}

const METADATA = JSON.stringify(
  {
    uuid: EXTENSION_UUID,
    name: 'Wisp',
    description:
      'Lets Wisp list windows and bring one to the front on GNOME with Wayland. Installed by Wisp.',
    'shell-version': ['45', '46', '47', '48', '49'],
    url: 'https://github.com/rempel/wisp',
    'x-wisp': MARKER
  },
  null,
  2
)

/** O código da extensão (GNOME 45 em diante, módulos ES). */
export const EXTENSION_JS = `// ${MARKER}
// A extensão do Wisp: a lista das janelas e o trazer uma para a frente, pelo D-Bus de sessão.
import Gio from 'gi://Gio'
import Meta from 'gi://Meta'
import Shell from 'gi://Shell'
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js'

const IFACE = \`<node>
  <interface name="${SHELL_IFACE}">
    <method name="ListWindows"><arg type="s" direction="out"/></method>
    <method name="ActivateWindow">
      <arg type="u" direction="in"/><arg type="b" direction="out"/>
    </method>
    <method name="Pointer">
      <arg type="i" direction="out"/><arg type="i" direction="out"/>
    </method>
  </interface>
</node>\`

const windows = () => global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null)

export default class WispExtension extends Extension {
  enable() {
    this._dbus = Gio.DBusExportedObject.wrapJSObject(IFACE, this)
    this._dbus.export(Gio.DBus.session, '${SHELL_PATH}')
  }

  disable() {
    this._dbus?.unexport()
    this._dbus = null
  }

  // As janelas, da usada por último para a mais antiga.
  ListWindows() {
    const tracker = Shell.WindowTracker.get_default()
    const focus = global.display.focus_window
    return JSON.stringify(
      windows().map((window) => ({
        id: window.get_id(),
        app: tracker.get_window_app(window)?.get_name() ?? window.get_wm_class() ?? '',
        title: window.get_title() ?? '',
        minimized: window.minimized,
        active: window === focus,
        pid: window.get_pid()
      }))
    )
  }

  ActivateWindow(id) {
    const window = windows().find((candidate) => candidate.get_id() === id)
    if (!window) return false
    window.activate(global.get_current_time())
    return true
  }

  Pointer() {
    const [x, y] = global.get_pointer()
    return [x, y]
  }
}
`

/** Os arquivos da extensão, na pasta das extensões do usuário. */
export function extensionFiles(home = homedir()): { path: string; content: string }[] {
  const data = process.env.XDG_DATA_HOME || join(home, '.local', 'share')
  const dir = join(data, 'gnome-shell', 'extensions', EXTENSION_UUID)
  return [
    { path: join(dir, 'metadata.json'), content: METADATA + '\n' },
    { path: join(dir, 'extension.js'), content: EXTENSION_JS }
  ]
}

const run = (command: string, args: string[]): Promise<boolean> =>
  new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })

/**
 * Instala (ou tira) a extensão e pede ao GNOME para ligá-la. No Wayland, uma extensão nova só
 * carrega na próxima sessão: sair e entrar de novo. Devolve se os arquivos ficaram como pedido.
 */
export async function setGnomeExtension(enabled: boolean): Promise<boolean> {
  let ok = true
  for (const file of extensionFiles()) {
    try {
      ok = (enabled ? writeOwnFile(file.path, file.content) : removeOwnFile(file.path)) && ok
    } catch {
      ok = false
    }
  }
  // Sem o gnome-extensions (fora do GNOME), os arquivos ficam lá e nada mais acontece.
  await run('gnome-extensions', [enabled ? 'enable' : 'disable', EXTENSION_UUID])
  return ok
}

/** O que a extensão mandou, conferido. */
export function parseShellWindows(json: unknown): ShellWindow[] | null {
  let list: unknown
  try {
    list = JSON.parse(String(json))
  } catch {
    return null
  }
  if (!Array.isArray(list)) return null
  const out: ShellWindow[] = []
  for (const item of list as Record<string, unknown>[]) {
    if (!item || typeof item.id !== 'number' || !Number.isInteger(item.id)) continue
    out.push({
      id: item.id,
      app: typeof item.app === 'string' ? item.app.slice(0, 200) : '',
      title: typeof item.title === 'string' ? item.title.slice(0, 500) : '',
      minimized: item.minimized === true,
      active: item.active === true,
      ...(typeof item.pid === 'number' && item.pid > 0 ? { pid: item.pid } : {})
    })
  }
  return out
}

async function call(
  member: string,
  signature: string,
  body: unknown[],
  env: NodeJS.ProcessEnv
): Promise<unknown[] | null> {
  const bus = await DBusConnection.session(env)
  if (!bus) return null
  try {
    return await bus.call({
      destination: SHELL_NAME,
      path: SHELL_PATH,
      interface: SHELL_IFACE,
      member,
      signature,
      body,
      timeout: 2000
    })
  } catch {
    // Sem a extensão (ou fora do GNOME): quem chama segue sem ela.
    return null
  } finally {
    bus.close()
  }
}

/** As janelas pela extensão, sem as do próprio Wisp; null sem ela. */
export async function shellWindows(
  ownPid: number,
  env: NodeJS.ProcessEnv = process.env
): Promise<ShellWindow[] | null> {
  const reply = await call('ListWindows', '', [], env)
  const windows = reply ? parseShellWindows(reply[0]) : null
  return windows ? windows.filter((window) => window.pid !== ownPid) : null
}

/** Traz uma janela para a frente pela extensão. */
export async function shellActivate(
  id: number,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  const reply = await call('ActivateWindow', 'u', [id], env)
  return reply?.[0] === true
}

/**
 * Onde está o cursor, pela extensão (no Wayland, um app só sabe do cursor em cima das janelas
 * dele): uma conexão que fica aberta, para os olhos do mascote. `query` devolve null sem a
 * extensão; depois de algumas falhas seguidas, desiste por um tempo, para não insistir à toa.
 */
export class ShellPointer {
  private bus: DBusConnection | null = null
  private opening: Promise<void> | null = null
  private failures = 0
  private retryAt = 0

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async query(now = Date.now()): Promise<{ x: number; y: number } | null> {
    if (now < this.retryAt) return null
    if (!this.bus?.alive) {
      this.opening ??= DBusConnection.session(this.env).then((bus) => {
        this.bus = bus
        this.opening = null
      })
      await this.opening
    }
    if (!this.bus?.alive) return this.failed(now)
    try {
      const [x, y] = await this.bus.call({
        destination: SHELL_NAME,
        path: SHELL_PATH,
        interface: SHELL_IFACE,
        member: 'Pointer',
        timeout: 500
      })
      if (typeof x !== 'number' || typeof y !== 'number') return this.failed(now)
      this.failures = 0
      return { x, y }
    } catch {
      return this.failed(now)
    }
  }

  private failed(now: number): null {
    // Sem a extensão: confere de novo só daqui a um minuto.
    if (++this.failures >= 3) {
      this.failures = 0
      this.retryAt = now + 60_000
    }
    return null
  }

  close(): void {
    this.bus?.close()
    this.bus = null
  }
}
