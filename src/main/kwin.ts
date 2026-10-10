import { randomBytes } from 'crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { DBusConnection } from './dbus'

// Scripts do KWin (KDE, no X11 e no Wayland): o jeito de um app ver e ativar janelas de outros
// apps no KDE. O script é carregado pelo D-Bus do KWin, roda uma vez e devolve o resultado
// chamando de volta um objeto que o Wisp exporta na conexão dele.

const KWIN = 'org.kde.KWin'
const REPORT_PATH = '/io/github/rempel/Wisp/KWin'
const REPORT_IFACE = 'io.github.rempel.Wisp.KWin'
const TIMEOUT_MS = 3000

/** O Wisp roda no KDE? */
export function isKde(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.XDG_CURRENT_DESKTOP ?? '').toUpperCase().split(':').includes('KDE')
}

/**
 * As janelas do KWin, numa expressão que funciona no KWin 5 e no 6: da mais à frente para a mais
 * atrás quando há a ordem de empilhamento.
 */
const WINDOWS =
  '(function () {' +
  ' var list = workspace.stackingOrder' +
  ' ? Array.prototype.slice.call(workspace.stackingOrder).reverse()' +
  ' : workspace.windowList ? workspace.windowList() : workspace.clientList();' +
  ' return list;' +
  ' })()'

/** Ativa uma janela no KWin 6 (activeWindow) ou no 5 (activeClient). */
const ACTIVATE =
  'function activate(w) {' +
  ' if (w.minimized) w.minimized = false;' +
  ' if (workspace.windowList) workspace.activeWindow = w; else workspace.activeClient = w;' +
  ' }'

/**
 * Roda um script no KWin. O script recebe `report(valor)` e `windows` (a lista de janelas) e
 * deve chamar report uma vez. Devolve o valor (já do JSON), ou null se não houver KWin ou o script
 * não responder. Só ES5 no script: o KWin 5 usa um motor antigo.
 */
export async function runKWinScript(body: string): Promise<unknown> {
  const bus = await DBusConnection.session()
  if (!bus) return null
  const token = randomBytes(8).toString('hex')
  const plugin = `wisp-${token}`
  let settle: (json: string | null) => void = () => {}
  const reported = new Promise<string | null>((resolve) => {
    settle = resolve
  })
  const unexport = bus.export(REPORT_PATH, REPORT_IFACE, {
    methods: {
      Report: {
        in: 'ss',
        out: '',
        handler: ([sent, json]) => {
          if (sent === token) settle(json as string)
        }
      }
    }
  })
  // O nome do Wisp no barramento e o token vão como texto JSON: nada de fora vira código.
  const script = [
    'function report(value) {',
    `  callDBus(${JSON.stringify(bus.name)}, ${JSON.stringify(REPORT_PATH)}, ${JSON.stringify(REPORT_IFACE)}, 'Report', ${JSON.stringify(token)}, JSON.stringify(value));`,
    '}',
    `var windows = ${WINDOWS};`,
    ACTIVATE,
    body,
    ''
  ].join('\n')
  const dir = mkdtempSync(join(tmpdir(), 'wisp-kwin-'))
  const file = join(dir, 'script.js')
  writeFileSync(file, script)
  const call = (
    path: string,
    iface: string,
    member: string,
    signature = '',
    args: unknown[] = []
  ): Promise<unknown[]> =>
    bus.call({
      destination: KWIN,
      path,
      interface: iface,
      member,
      signature,
      body: args,
      timeout: TIMEOUT_MS
    })
  try {
    const [id] = await call('/Scripting', 'org.kde.kwin.Scripting', 'loadScript', 'ss', [
      file,
      plugin
    ])
    if (typeof id !== 'number' || id < 0) return null
    // O caminho do script mudou entre versões do KWin.
    try {
      await call(`/Scripting/Script${id}`, 'org.kde.kwin.Script', 'run')
    } catch {
      await call(`/${id}`, 'org.kde.kwin.Script', 'run')
    }
    let timer: NodeJS.Timeout | undefined
    const json = await Promise.race([
      reported,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), TIMEOUT_MS)
      })
    ])
    clearTimeout(timer)
    return json === null ? null : (JSON.parse(json) as unknown)
  } catch {
    return null
  } finally {
    unexport()
    await call('/Scripting', 'org.kde.kwin.Scripting', 'unloadScript', 's', [plugin]).catch(
      () => {}
    )
    bus.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Uma janela como o script do KWin descreve. */
export interface KWinWindow {
  id: string
  app: string
  title: string
  pid: number
  minimized: boolean
  active: boolean
}

/** As janelas de apps (sem as do Wisp, painéis e afins), da mais à frente para a mais atrás. */
export async function kwinWindows(ownPid: number): Promise<KWinWindow[] | null> {
  const result = await runKWinScript(
    [
      `var own = ${JSON.stringify(ownPid)};`,
      'var active = workspace.activeWindow || workspace.activeClient;',
      'var out = [];',
      'for (var i = 0; i < windows.length; i++) {',
      '  var w = windows[i];',
      '  if ((!w.normalWindow && !w.dialog) || w.skipTaskbar || w.pid === own) continue;',
      '  out.push({ id: String(w.internalId), app: String(w.resourceClass || ""),',
      '    title: String(w.caption || ""), pid: w.pid, minimized: !!w.minimized,',
      '    active: w === active });',
      '}',
      'report(out);'
    ].join('\n')
  )
  return Array.isArray(result) ? (result as KWinWindow[]) : null
}

/** Ativa a janela com este id (o internalId do KWin). */
export async function kwinActivate(id: string): Promise<boolean> {
  const result = await runKWinScript(
    [
      `var target = ${JSON.stringify(id)};`,
      'var found = false;',
      'for (var i = 0; i < windows.length && !found; i++) {',
      '  if (String(windows[i].internalId) === target) { activate(windows[i]); found = true; }',
      '}',
      'report(found);'
    ].join('\n')
  )
  return result === true
}

/** Ativa a primeira janela de um destes processos (na ordem dada). */
export async function kwinActivatePids(pids: number[]): Promise<boolean> {
  const result = await runKWinScript(
    [
      `var pids = ${JSON.stringify(pids.filter(Number.isInteger))};`,
      'var found = false;',
      'for (var p = 0; p < pids.length && !found; p++) {',
      '  for (var i = 0; i < windows.length; i++) {',
      '    if (windows[i].pid === pids[p] && windows[i].normalWindow) {',
      '      activate(windows[i]); found = true; break;',
      '    }',
      '  }',
      '}',
      'report(found);'
    ].join('\n')
  )
  return result === true
}
