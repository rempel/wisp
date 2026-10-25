// O diagnóstico e os primeiros passos (Fase 20) no app: junta os fatos (o Claude Code, o
// desktop, o D-Bus, o atalho, a voz...), responde à tela do painel e mostra os primeiros passos
// na primeira vez que o Wisp abre.

import { clipboard, ipcMain, shell } from 'electron'
import type { WebContents } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir, release } from 'os'
import { join } from 'path'
import { claudeStatus } from './claude'
import { configProblems, getConfig, notifyConfigChange, updateConfig } from './config'
import { DBusConnection } from './dbus'
import { findTerminal, openTerminal } from './desktop'
import { buildReport, desktopOf, evaluate, issueUrl, osName } from './diagnostics'
import type { BusName, Facts } from './diagnostics'
import type { InstallKind } from './launcher'
import { DATA_DIR } from './paths'
import type { SelfUpdater } from './self-update'
import type { ShortcutStatus } from './shortcut'
import type { UpdateChecker } from './updates'
import { whisperSetup } from './whisper'
import { IPC } from '../shared/ipc'
import type { DiagnosticAction, DiagnosticsSnapshot, PanelView, PhoneResult } from '../shared/ipc'
import { t } from '../shared/i18n'

/** Os primeiros passos já foram vistos (ou pulados). */
const WELCOME_FILE = join(DATA_DIR, 'boas-vindas.json')
/** As abas guardadas: quem já tem uma usou o Wisp antes desta versão. */
const TABS_FILE = join(DATA_DIR, 'abas.json')

export interface DiagnosticsOptions {
  /** O pedido veio da página do painel? */
  isSender(sender: WebContents): boolean
  version: string
  install: InstallKind
  /** O atalho de abrir o painel (null antes de ligar). */
  shortcut(): ShortcutStatus | null
  updates: UpdateChecker
  /** Atualizar com um clique (Fase 31); null se este Wisp não se atualiza sozinho. */
  selfUpdate: SelfUpdater | null
  /** Mostra uma tela no painel. */
  showView(view: PanelView): void
}

/** Um nome no D-Bus da sessão: rodando, que sobe quando chamado, ausente ou sem D-Bus. */
async function busName(bus: DBusConnection | null, name: string): Promise<BusName> {
  if (!bus) return 'unknown'
  try {
    const [running] = await bus.call({
      destination: 'org.freedesktop.DBus',
      path: '/org/freedesktop/DBus',
      interface: 'org.freedesktop.DBus',
      member: 'NameHasOwner',
      signature: 's',
      body: [name],
      timeout: 2000
    })
    if (running === true) return 'running'
    const [activatable] = await bus.call({
      destination: 'org.freedesktop.DBus',
      path: '/org/freedesktop/DBus',
      interface: 'org.freedesktop.DBus',
      member: 'ListActivatableNames',
      timeout: 2000
    })
    return Array.isArray(activatable) && activatable.includes(name) ? 'activatable' : 'absent'
  } catch {
    return 'unknown'
  }
}

/** O que está ligado, em palavras (sem nada do que a pessoa escreveu). */
function features(): string[] {
  const config = getConfig()
  const on: [boolean, string][] = [
    [config.voiceShortcut !== null, t('voz')],
    [config.voiceReplies, t('respostas faladas')],
    [config.compact, t('ilha')],
    [config.github, 'GitHub'],
    [config.calendar, t('agenda')],
    [config.weeklySummary, t('resumo da semana')],
    [config.phoneApprovals, t('celular')],
    [config.browserAutomation, t('navegador do Claude')],
    [config.provider === 'openrouter', 'OpenRouter'],
    [config.demo, t('demonstração')],
    [config.updateCheck, t('aviso de versão')],
    [config.avatar !== 'robo', `avatar ${config.avatar}`]
  ]
  return on.filter(([enabled]) => enabled).map(([, name]) => name)
}

function voiceState(): Facts['voice'] {
  const config = getConfig()
  try {
    whisperSetup({
      binary: config.whisperPath,
      model: config.whisperModel,
      language: config.voiceLanguage
    })
    return 'ok'
  } catch (err) {
    if (config.voiceShortcut === null) return 'off'
    return /modelo/.test((err as Error).message) ? 'model' : 'binary'
  }
}

function readOsRelease(): string {
  try {
    return osName(readFileSync('/etc/os-release', 'utf8'))
  } catch {
    return ''
  }
}

export function setupDiagnostics(options: DiagnosticsOptions): {
  /** Na primeira vez, os primeiros passos aparecem. */
  maybeWelcome(): void
} {
  let last: DiagnosticsSnapshot | null = null

  const gather = async (): Promise<Facts> => {
    const config = getConfig()
    const bus = await DBusConnection.session().catch(() => null)
    try {
      const [claude, keyring, tray] = await Promise.all([
        claudeStatus(config.claudePath),
        busName(bus, 'org.freedesktop.secrets'),
        busName(bus, 'org.kde.StatusNotifierWatcher')
      ])
      const shortcut = config.shortcut === null ? null : options.shortcut()
      return {
        app: {
          version: options.version,
          install: options.install,
          electron: process.versions.electron ?? '',
          node: process.versions.node
        },
        os: { name: readOsRelease(), kernel: release(), arch: process.arch },
        desktop: desktopOf(process.env),
        claude,
        provider: config.provider,
        keyring,
        tray,
        shortcut:
          config.shortcut === null
            ? null
            : (shortcut ?? { via: 'none', problem: t('ainda ligando') }),
        voice: voiceState(),
        terminal: findTerminal(config.terminalCommand) !== null,
        configProblems: configProblems().length,
        features: features(),
        needsKeyring: config.provider === 'openrouter' || config.phoneApprovals,
        update: options.updates.available(),
        selfUpdate: options.selfUpdate !== null,
        installed: options.selfUpdate?.installed() ?? null
      }
    } finally {
      bus?.close()
    }
  }

  ipcMain.handle(IPC.diagnosticsRun, async (event): Promise<DiagnosticsSnapshot | null> => {
    if (!options.isSender(event.sender)) return null
    const facts = await gather()
    const checks = evaluate(facts)
    last = { checks, report: buildReport(facts, checks) }
    return last
  })
  ipcMain.on(IPC.diagnosticsCopy, (event) => {
    if (options.isSender(event.sender) && last) clipboard.writeText(last.report)
  })
  ipcMain.on(IPC.diagnosticsIssue, (event) => {
    if (options.isSender(event.sender) && last) void shell.openExternal(issueUrl(last.report))
  })
  ipcMain.handle(IPC.diagnosticsAction, async (event, action: unknown): Promise<PhoneResult> => {
    if (!options.isSender(event.sender)) return { ok: false, message: t('pedido inválido') }
    switch (action as DiagnosticAction) {
      case 'terminal': {
        const result = await openTerminal(homedir(), getConfig().terminalCommand)
        return result.ok
          ? { ok: true, message: t('Abri um terminal. Rode `claude` nele.') }
          : { ok: false, message: result.message }
      }
      case 'demo':
        updateConfig({ demo: true })
        notifyConfigChange()
        return { ok: true, message: t('Modo demonstração ligado: as respostas são gravadas.') }
      case 'release': {
        const update = options.updates.available()
        if (!update) return { ok: false, message: t('Não há versão nova.') }
        void shell.openExternal(update.url)
        return { ok: true }
      }
      case 'update': {
        const update = options.updates.available()
        if (!update || !options.selfUpdate) return { ok: false, message: t('Não há versão nova.') }
        const result = await options.selfUpdate.install(update)
        return result.ok
          ? {
              ok: true,
              message: t('Pronto: o Wisp {version} já está no lugar. Reinicie para usar.', {
                version: update.version
              })
            }
          : result
      }
      case 'restart':
        if (!options.selfUpdate?.installed()) {
          return { ok: false, message: t('Não há versão nova instalada.') }
        }
        options.selfUpdate.restart()
        return { ok: true }
      default:
        return { ok: false, message: t('ação desconhecida') }
    }
  })

  const markDone = (): void => {
    try {
      mkdirSync(DATA_DIR, { recursive: true })
      writeFileSync(WELCOME_FILE, JSON.stringify({ done: new Date().toISOString() }))
    } catch (err) {
      console.warn('[wisp] não consegui guardar que os primeiros passos acabaram:', err)
    }
  }
  ipcMain.on(IPC.welcomeDone, (event) => {
    if (options.isSender(event.sender)) markDone()
  })

  return {
    maybeWelcome() {
      if (existsSync(WELCOME_FILE)) return
      // Quem já usava o Wisp antes desta versão não vê os primeiros passos.
      if (existsSync(TABS_FILE)) return markDone()
      options.showView('welcome')
    }
  }
}
