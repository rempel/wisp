// O diagnóstico e o aviso de versão (Fase 20): as conferências de cada máquina, o relatório sem
// nada pessoal, a issue, o Claude Code de mentira (versão e login) e a conferência de versão nova
// (uma vez por versão, só ligada).
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { hostname, tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { claudeStatus } from '../src/main/claude'
import { checkSettings } from '../src/main/config'
import {
  buildReport,
  compareVersions,
  desktopOf,
  evaluate,
  ISSUES_URL,
  issueUrl,
  osName
} from '../src/main/diagnostics'
import type { Facts } from '../src/main/diagnostics'
import { parseRelease, UpdateChecker } from '../src/main/updates'

const FAKE_CLAUDE = join(__dirname, '../../test/fixtures/fake-claude')

function facts(patch: Partial<Facts> = {}): Facts {
  return {
    app: { version: '0.1.0', install: 'package', electron: '44.0.1', node: '22.22.0' },
    os: { name: 'Ubuntu 24.04.1 LTS', kernel: '6.8.0-45-generic', arch: 'x64' },
    desktop: { name: 'GNOME', session: 'wayland' },
    claude: { installed: true, version: '2.1.296', loggedIn: true },
    provider: 'subscription',
    keyring: 'activatable',
    tray: 'running',
    shortcut: { via: 'portal', label: 'Ctrl+Alt+W' },
    voice: 'ok',
    terminal: true,
    configProblems: 0,
    features: ['voz', 'ilha'],
    needsKeyring: false,
    update: null,
    ...patch
  }
}

const byId = (checks: ReturnType<typeof evaluate>, id: string) =>
  checks.find((check) => check.id === id)!

test('diagnostics: a machine with everything in place', () => {
  const checks = evaluate(facts())
  assert.deepEqual(
    checks.map((check) => [check.id, check.status]),
    [
      ['claude', 'ok'],
      ['login', 'ok'],
      ['shortcut', 'ok'],
      ['tray', 'ok'],
      ['keyring', 'ok'],
      ['voice', 'ok'],
      ['terminal', 'ok'],
      ['config', 'ok']
    ]
  )
  assert.equal(byId(checks, 'claude').summary, 'versão 2.1.296')
  assert.match(byId(checks, 'shortcut').detail, /Ctrl\+Alt\+W.*portal/)
})

test('diagnostics: without Claude Code, how to install and the demo', () => {
  const checks = evaluate(facts({ claude: { installed: false, version: null, loggedIn: null } }))
  const claude = byId(checks, 'claude')
  assert.equal(claude.status, 'error')
  assert.equal(claude.action, 'demo')
  // No Windows, o instalador do PowerShell.
  assert.match(
    claude.fix ?? '',
    process.platform === 'win32' ? /claude\.ai\/install\.ps1/ : /claude\.ai\/install\.sh/
  )
  assert.match(claude.fix ?? '', /npm install -g @anthropic-ai\/claude-code/)
  assert.equal(byId(checks, 'login').status, 'off')
})

test('diagnostics: old version, no login, unknown login, OpenRouter', () => {
  const old = byId(
    evaluate(facts({ claude: { installed: true, version: '2.0.9', loggedIn: true } })),
    'claude'
  )
  assert.equal(old.status, 'warn')
  assert.match(old.fix ?? '', /claude update/)
  const out = byId(
    evaluate(facts({ claude: { installed: true, version: '2.1.296', loggedIn: false } })),
    'login'
  )
  assert.equal(out.status, 'error')
  assert.equal(out.action, 'terminal')
  assert.equal(
    byId(evaluate(facts({ claude: { installed: true, version: null, loggedIn: null } })), 'login')
      .status,
    'warn'
  )
  const router = byId(
    evaluate(
      facts({
        provider: 'openrouter',
        claude: { installed: true, version: '2.1.3', loggedIn: false }
      })
    ),
    'login'
  )
  assert.equal(router.status, 'ok')
  assert.match(router.detail, /OpenRouter/)
})

test('diagnostics: shortcut, tray, keyring, voice, terminal, config and update', () => {
  const checks = evaluate(
    facts({
      shortcut: { via: 'none', problem: 'outro programa já usa a combinação' },
      tray: 'absent',
      keyring: 'absent',
      needsKeyring: true,
      voice: 'model',
      terminal: false,
      configProblems: 2,
      update: { version: '0.2.0', url: 'https://github.com/rempel/wisp/releases/tag/v0.2.0' }
    })
  )
  assert.equal(byId(checks, 'shortcut').status, 'warn')
  assert.match(byId(checks, 'shortcut').detail, /outro programa/)
  assert.match(byId(checks, 'tray').fix ?? '', /AppIndicator/)
  assert.equal(byId(checks, 'keyring').status, 'warn')
  assert.equal(byId(checks, 'voice').summary, 'sem o modelo de voz')
  assert.equal(byId(checks, 'terminal').status, 'warn')
  assert.equal(byId(checks, 'config').summary, '2 problemas')
  assert.equal(byId(checks, 'update').action, 'release')
  // Sem precisar do chaveiro, a falta dele não é um aviso.
  assert.equal(byId(evaluate(facts({ keyring: 'absent' })), 'keyring').status, 'off')
  assert.equal(byId(evaluate(facts({ voice: 'off' })), 'voice').status, 'off')
  assert.equal(byId(evaluate(facts({ shortcut: null })), 'shortcut').status, 'off')
  // No KDE, a bandeja não fala da extensão do GNOME.
  assert.doesNotMatch(
    byId(evaluate(facts({ tray: 'absent', desktop: { name: 'KDE', session: 'x11' } })), 'tray')
      .fix ?? '',
    /AppIndicator/
  )
})

test('diagnostics: on Windows, nothing about the Linux desktop, and what comes later says so', () => {
  const windows = (patch: Partial<Facts> = {}) =>
    evaluate(
      facts({
        os: { name: 'Windows 11 Pro', kernel: '10.0.26100', arch: 'x64' },
        desktop: { name: 'Windows', session: 'outra' },
        keyring: 'unknown',
        shortcut: { via: 'x11', label: 'Ctrl+Alt+W' },
        terminal: false,
        windows: true,
        ...patch
      })
    )
  const checks = windows()
  assert.equal(byId(checks, 'shortcut').summary, 'pelo Windows')
  // O chaveiro é o DPAPI do Windows: disponível, ok; sem ele, o aviso só com a OpenRouter ou o
  // celular ligados.
  assert.equal(byId(windows({ keyring: 'running' }), 'keyring').status, 'ok')
  assert.equal(byId(windows({ keyring: 'running' }), 'keyring').summary, 'pelo Windows')
  assert.equal(byId(windows({ keyring: 'absent' }), 'keyring').status, 'off')
  assert.doesNotMatch(byId(checks, 'keyring').fix ?? '', /GNOME|KWallet/)
  assert.equal(byId(checks, 'terminal').status, 'off')
  assert.match(byId(checks, 'terminal').detail, /próxima versão/)
  assert.equal(byId(windows({ keyring: 'absent', needsKeyring: true }), 'keyring').status, 'warn')
  // O login pelo PowerShell, sem o botão de abrir um terminal.
  const login = byId(
    windows({ claude: { installed: true, version: '2.1.296', loggedIn: false } }),
    'login'
  )
  assert.match(login.fix ?? '', /PowerShell/)
  assert.equal(login.action, undefined)
})

test('diagnostics: the report has versions and results, nothing personal', () => {
  const sneaky = facts({
    os: { name: 'Ubuntu 24.04 <script>', kernel: '6.8.0', arch: 'x64' },
    shortcut: { via: 'none', problem: `não deu: ${HOME}/.config/segredo` },
    claude: { installed: true, version: '2.1.296', loggedIn: false }
  })
  const report = buildReport(sneaky, evaluate(sneaky))
  assert.match(report, /Wisp:\*\* 0\.1\.0 \(pacote\), Electron 44\.0\.1/)
  assert.match(report, /Desktop:\*\* GNOME, Wayland/)
  assert.match(report, /Claude Code:\*\* 2\.1\.296, sem login/)
  assert.match(report, /Ligado:\*\* voz, ilha/)
  assert.match(report, /\| ❌ \| Login \| sem login \|/)
  assert.doesNotMatch(report, /segredo|<script>/)
  assert.ok(!report.includes(HOME), 'nenhum caminho da pasta pessoal')
  for (const personal of [userInfo().username, hostname()]) {
    if (personal.length > 3) assert.ok(!report.includes(personal), personal)
  }
  const url = issueUrl(report)
  assert.ok(url.startsWith(`${ISSUES_URL}?body=`))
  assert.ok(decodeURIComponent(url.split('body=')[1]).includes(report))
})

test('diagnostics: os-release, desktop and versions', () => {
  assert.equal(
    osName('NAME="Ubuntu"\nPRETTY_NAME="Ubuntu 24.04.1 LTS"\nID=ubuntu\n'),
    'Ubuntu 24.04.1 LTS'
  )
  assert.equal(osName('ID=arch'), '')
  assert.deepEqual(
    desktopOf({ XDG_CURRENT_DESKTOP: 'ubuntu:GNOME', XDG_SESSION_TYPE: 'wayland' }),
    {
      name: 'ubuntu',
      session: 'wayland'
    }
  )
  assert.deepEqual(desktopOf({ XDG_CURRENT_DESKTOP: 'KDE', DISPLAY: ':0' }), {
    name: 'KDE',
    session: 'x11'
  })
  assert.equal(desktopOf({}).session, 'outra')
  assert.ok(compareVersions('2.0.9', '2.1.0') < 0)
  assert.ok(compareVersions('v0.10.0', '0.9.9') > 0)
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0)
  assert.equal(checkSettings({ updateCheck: true }).ok, true)
  assert.equal(checkSettings({ updateCheck: 'sim' }).ok, false)
})

test('diagnostics: Claude Code installed, version and login', async () => {
  assert.deepEqual(await claudeStatus(FAKE_CLAUDE), {
    installed: true,
    version: '2.1.296',
    loggedIn: true
  })
  process.env.FAKE_CLAUDE_LOGGED_OUT = '1'
  process.env.FAKE_CLAUDE_VERSION = '2.0.1'
  try {
    assert.deepEqual(await claudeStatus(FAKE_CLAUDE), {
      installed: true,
      version: '2.0.1',
      loggedIn: false
    })
  } finally {
    delete process.env.FAKE_CLAUDE_LOGGED_OUT
    delete process.env.FAKE_CLAUDE_VERSION
  }
  assert.deepEqual(await claudeStatus('/nao/existe/claude'), {
    installed: false,
    version: null,
    loggedIn: null
  })
})

test('updates: what counts as a release', () => {
  const url = 'https://github.com/rempel/wisp/releases/tag/v0.2.0'
  assert.deepEqual(parseRelease({ tag_name: 'v0.2.0', html_url: url }), { version: '0.2.0', url })
  assert.equal(parseRelease({ tag_name: 'v0.2.0-beta.1', html_url: url }), null)
  assert.equal(parseRelease({ tag_name: 'v0.2.0', html_url: url, prerelease: true }), null)
  assert.equal(parseRelease({ tag_name: 'v0.2.0', html_url: 'https://mal.example/x' }), null)
  assert.equal(parseRelease({ tag_name: 'v0.2.0', html_url: 'javascript:alert(1)' }), null)
  assert.equal(parseRelease(null), null)
})

test('updates: only when on, once per version, remembered', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wisp-versao-'))
  const stateFile = join(dir, 'versao.json')
  let enabled = false
  let tag = 'v0.2.0'
  let calls = 0
  const notified: string[] = []
  const fetcher = (async () => {
    calls++
    return new Response(
      JSON.stringify({
        tag_name: tag,
        html_url: `https://github.com/rempel/wisp/releases/tag/${tag}`
      })
    )
  }) as unknown as typeof fetch
  const make = (): UpdateChecker =>
    new UpdateChecker({
      current: '0.1.0',
      enabled: () => enabled,
      stateFile,
      notify: (release) => notified.push(release.version),
      fetch: fetcher
    })
  const checker = make()
  assert.equal(await checker.check(), null)
  assert.equal(calls, 0, 'desligado, nem pergunta')
  enabled = true
  assert.equal((await checker.check())?.version, '0.2.0')
  await checker.check()
  assert.deepEqual(notified, ['0.2.0'], 'cada versão avisa uma vez')
  assert.ok(existsSync(stateFile))
  assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).notified, '0.2.0')
  // Abrindo de novo, lembra do que já avisou.
  const again = make()
  await again.check()
  assert.deepEqual(notified, ['0.2.0'])
  tag = 'v0.3.0'
  await again.check()
  assert.deepEqual(notified, ['0.2.0', '0.3.0'])
  // Com uma versão igual ou mais velha, nada.
  tag = 'v0.1.0'
  const fresh = new UpdateChecker({
    current: '0.1.0',
    enabled: () => true,
    stateFile: join(dir, 'outro.json'),
    notify: (release) => notified.push(release.version),
    fetch: fetcher
  })
  assert.equal(await fresh.check(), null)
  enabled = false
  assert.equal(again.available(), null, 'desligado, o diagnóstico não mostra')
  checker.dispose()
  again.dispose()
  fresh.dispose()
})
