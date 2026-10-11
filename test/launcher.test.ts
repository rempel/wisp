// O comando `wisp` (linha de comando, script, entrada no menu), o início com o sistema e o atalho
// no formato do portal.
import { HOME } from './helpers/home'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import * as L from '../src/main/launcher'
import * as A from '../src/main/autostart'
import * as K from '../src/main/shortcut'
import { checker } from './helpers/checks'

test('comando wisp, menu de apps, início com o sistema e atalho', () => {
  const { check, done } = checker()
  // 1. Linha de comando.
  const p = (args) => JSON.stringify(L.parseCommand(['/usr/bin/electron', '/app', ...args]))
  check('1a --toggle', p(['--toggle']) === '{"kind":"toggle"}')
  check(
    '1b --new entre flags do Chromium',
    p(['--no-sandbox', '--new', '--ozone-platform=x11']) === '{"kind":"new"}'
  )
  check(
    '1c --ask "texto"',
    p(['--ask', '  qual a capital?  ']) === '{"kind":"ask","text":"qual a capital?"}'
  )
  check('1d --ask=texto', p(['--ask=oi mundo']) === '{"kind":"ask","text":"oi mundo"}')
  check(
    '1e --ask vazio vira mostrar',
    p(['--ask']) === '{"kind":"show"}' && p(['--ask=']) === '{"kind":"show"}'
  )
  check('1f nada', p([]) === 'null' && p(['--outra']) === 'null')
  check(
    '1g texto longo cortado',
    L.parseCommand(['--ask', 'x'.repeat(30000)]).text.length === 20000
  )
  check(
    '1h pedido de outra instância conferido',
    JSON.stringify(L.checkCommand({ kind: 'ask', text: ' oi ' })) ===
      '{"kind":"ask","text":"oi"}' &&
      L.checkCommand({ kind: 'rm -rf' }) === null &&
      L.checkCommand({ kind: 'ask', text: 5 }) === null &&
      L.checkCommand(null) === null
  )

  // 2. Exec de .desktop.
  check(
    '2a simples',
    L.desktopArg('/home/u/.local/share/wisp/bin/wisp') === '/home/u/.local/share/wisp/bin/wisp'
  )
  check(
    '2b espaço vira aspas',
    L.desktopArg('/home/u/Meus Apps/wisp') === '"/home/u/Meus Apps/wisp"'
  )
  check(
    '2c $ e aspas escapados, barra dobrada',
    L.desktopArg('/a/$b"c') === '"/a/\\\\$b\\\\"c"',
    L.desktopArg('/a/$b"c')
  )
  check('2d % vira %%', L.desktopArg('/a/100%') === '/a/100%%')
  check('2e shellQuote', L.shellQuote("it's") === "'it'\\''s'")

  // 3. Comando e entrada no menu.
  L.deployLauncher(
    { electron: '/opt/electron/electron', appPath: '/home/u/wisp', icon: '/home/u/wisp/icon.png' },
    true
  )
  const script = fs.readFileSync(L.LAUNCHER_PATH, 'utf8')
  check(
    '3a script com electron, app e ozone',
    script.includes("exec '/opt/electron/electron' '/home/u/wisp' --ozone-platform=x11 \"$@\"") &&
      (fs.statSync(L.LAUNCHER_PATH).mode & 0o777) === 0o755
  )
  const menuFile = path.join(HOME, '.local/share/applications/io.github.rempel.Wisp.desktop')
  const menu = fs.readFileSync(menuFile, 'utf8')
  check(
    '3b .desktop com Exec, ações e a marca',
    menu.includes(`Exec=${L.LAUNCHER_PATH}\n`) &&
      menu.includes(`Exec=${L.LAUNCHER_PATH} --toggle`) &&
      menu.includes('StartupWMClass=io.github.rempel.Wisp') &&
      menu.includes('X-Wisp-Generated=true')
  )
  L.deployLauncher({ electron: '/opt/electron/electron', appPath: null, icon: '/i.png' }, false)
  check(
    '3c empacotado: sem a pasta do app',
    fs
      .readFileSync(L.LAUNCHER_PATH, 'utf8')
      .includes("exec '/opt/electron/electron' --ozone-platform=x11")
  )
  fs.writeFileSync(menuFile, '[Desktop Entry]\nName=Outro\n')
  L.deployLauncher({ electron: '/e', appPath: '/a', icon: '/i' }, true)
  check(
    '3d não passa por cima de um .desktop que não é do Wisp',
    fs.readFileSync(menuFile, 'utf8') === '[Desktop Entry]\nName=Outro\n'
  )

  // 4. Início com o sistema.
  const auto = A.autostartPath()
  check('4a caminho', auto === path.join(HOME, '.config/autostart/io.github.rempel.Wisp.desktop'))
  check('4b começa desligado', !A.isAutostartEnabled())
  check(
    '4c liga',
    A.setAutostart(true, '/icon.png') === null &&
      A.isAutostartEnabled() &&
      fs.readFileSync(auto, 'utf8').includes(`Exec=${L.LAUNCHER_PATH}`)
  )
  check(
    '4d desliga',
    A.setAutostart(false, '/icon.png') === null && !fs.existsSync(auto) && !A.isAutostartEnabled()
  )
  fs.writeFileSync(auto, '[Desktop Entry]\nExec=outra-coisa\n')
  check(
    '4e arquivo alheio: não liga por cima',
    /não é do Wisp/.test(A.setAutostart(true, '/i') ?? '') &&
      fs.readFileSync(auto, 'utf8') === '[Desktop Entry]\nExec=outra-coisa\n'
  )
  check(
    '4f nem apaga',
    /não é do Wisp/.test(A.setAutostart(false, '/i') ?? '') && fs.existsSync(auto)
  )
  check('4g alheio não conta como ligado', !A.isAutostartEnabled())
  fs.rmSync(auto)
  A.setAutostart(true, '/old.png')
  A.refreshAutostart('/new.png')
  check(
    '4h ligado: atualizado a cada abertura',
    fs.readFileSync(auto, 'utf8').includes('Icon=/new.png')
  )

  // 5. Atalho para o portal.
  const t = K.toPortalTrigger
  check('5a Ctrl+Alt+W', t('Ctrl+Alt+W') === 'CTRL+ALT+w')
  check('5b Super+Shift+Space', t('Super+Shift+Space') === 'LOGO+SHIFT+space')
  check('5c CommandOrControl+F12', t('CommandOrControl+F12') === 'CTRL+F12')
  check(
    '5d Alt+1 e Ctrl+Plus e Ctrl++',
    t('Alt+1') === 'ALT+1' && t('Ctrl+Plus') === 'CTRL+plus' && t('Ctrl++') === 'CTRL+plus'
  )
  check('5e Meta+,', t('Meta+,') === 'LOGO+comma')
  check('5f inválidos', t('Hyper+W') === null && t('Ctrl+Desconhecida') === null && t('') === null)
  done()
})

test('empacotado: o tipo de instalação, o que abre o Wisp de fora e o ícone dos .desktop', () => {
  const { check, done } = checker()
  check('6a do código', L.installKind(false, { APPIMAGE: '/x/Wisp.AppImage' }) === 'dev')
  check('6b do .deb', L.installKind(true, {}) === 'package')
  check('6c do AppImage', L.installKind(true, { APPIMAGE: '/home/u/Wisp.AppImage' }) === 'appimage')
  check(
    '6d APPIMAGE relativo não conta',
    L.installKind(true, { APPIMAGE: 'Wisp.AppImage' }) === 'package'
  )
  check(
    '6e AppImage: abre pelo arquivo',
    L.launchTarget('appimage', { APPIMAGE: '/home/u/Wisp.AppImage' }) === '/home/u/Wisp.AppImage'
  )
  check('6f .deb: pelo executável', L.launchTarget('package', {}) === process.execPath)
  const icon = path.join(HOME, 'icone-do-app.png')
  fs.writeFileSync(icon, 'png de mentira')
  check('6g fora do AppImage: o ícone do app', L.desktopIcon('package', icon) === icon)
  const stable = L.desktopIcon('appimage', icon)
  check(
    '6h AppImage: uma cópia num lugar fixo',
    stable === L.STABLE_ICON && fs.readFileSync(stable, 'utf8') === 'png de mentira'
  )
  done()
})
