// Atualizar com um clique (Fase 31; o instalador do Windows na Fase 36) e o aviso de versão nova
// (Fase 20): o que o index.ts monta, à parte para ele não crescer demais.

import { spawn } from 'child_process'
import { app, shell } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { compareVersions } from './diagnostics'
import { getConfig, onConfigChange } from './config'
import { parseCommand } from './launcher'
import type { InstallKind } from './launcher'
import { DATA_DIR } from './paths'
import { releaseKey, SelfUpdater, updateTarget } from './self-update'
import { UpdateChecker } from './updates'
import { t } from '../shared/i18n'

export interface UpdatesOptions {
  kind: InstallKind
  /** Uma notificação do sistema, com o que o clique nela faz. */
  notify(title: string, body: string, onClick?: () => void): void
  /** Abre o painel no diagnóstico (onde fica o Atualizar). */
  showDiagnostics(): void
  /** O mascote avisa que há versão nova (Fase 52). */
  announce?(): void
}

/** O arquivo com a versão que abriu da última vez (as notas depois de atualizar, Fase 52). */
export const LAST_VERSION_FILE = join(DATA_DIR, 'ultima-versao.txt')

/**
 * A versão que abriu da última vez, trocada pela de agora; devolve a de antes se o Wisp foi
 * atualizado (null na primeira vez, ou na mesma versão).
 */
export function updatedFrom(current: string, file = LAST_VERSION_FILE): string | null {
  let previous: string | null = null
  try {
    previous = readFileSync(file, 'utf8').trim() || null
  } catch {
    // Primeira vez: nada a avisar.
  }
  if (previous === current) return null
  try {
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, current)
  } catch {
    // Sem gravar, o aviso volta na próxima vez: tudo bem.
  }
  return previous && compareVersions(current, previous) > 0 ? previous : null
}

/** A página das notas de uma versão no GitHub. */
export const notesUrl = (version: string): string =>
  `https://github.com/rempel/wisp/releases/tag/v${version}`

export function setupUpdates(options: UpdatesOptions): {
  updates: UpdateChecker
  selfUpdate: SelfUpdater | null
} {
  const { kind, notify } = options
  // Atualizar com um clique (Fase 31): o AppImage e, no Windows (Fase 36), o instalador; só com a
  // chave que confere a assinatura.
  const updatePlan = updateTarget(kind, app.isPackaged)
  const publicKey = releaseKey(app.isPackaged)
  const downloadBase = app.isPackaged ? '' : (process.env.WISP_TEST_DOWNLOAD_BASE ?? '')
  const selfUpdate =
    updatePlan && publicKey
      ? new SelfUpdater({
          ...updatePlan,
          publicKey,
          rewrite: downloadBase
            ? (url) => url.replace(/^https:\/\/github\.com/, downloadBase)
            : undefined,
          relaunch: (path) => {
            if (updatePlan.format === 'installer') {
              // O instalador (conferido) instala por cima em silêncio e abre o Wisp novo; este fecha
              // para ele trocar os arquivos.
              spawn(path, ['--updated', '/S', '--force-run'], {
                detached: true,
                stdio: 'ignore'
              }).unref()
            } else {
              app.relaunch({
                execPath: path,
                args: process.argv.slice(1).filter((arg) => !parseCommand([arg]))
              })
            }
            app.quit()
          }
        })
      : null
  // O aviso de versão nova (Fase 20), desligado por padrão: uma conferência por dia no GitHub.
  const updates = new UpdateChecker({
    current: app.getVersion(),
    enabled: () => getConfig().updateCheck,
    stateFile: join(DATA_DIR, 'versao.json'),
    notify: (release) => {
      options.announce?.()
      return selfUpdate
        ? notify(
            t('Wisp {version} disponível', { version: release.version }),
            selfUpdate.format === 'installer'
              ? t(
                  'Clique para atualizar: o Wisp baixa o instalador, confere a assinatura e instala.'
                )
              : t('Clique para atualizar: o Wisp baixa, confere a assinatura e troca o AppImage.'),
            () => options.showDiagnostics()
          )
        : notify(
            t('Wisp {version} disponível', { version: release.version }),
            t('Clique para ver o que mudou e baixar. As configurações e as conversas continuam.'),
            () => void shell.openExternal(release.url)
          )
    }
  })
  // Depois de atualizar (Fase 52): o que mudou, num clique (a página da versão no GitHub).
  const from = updatedFrom(app.getVersion())
  if (from) {
    setTimeout(() => {
      options.announce?.()
      notify(
        t('Wisp atualizado para {version}', { version: app.getVersion() }),
        t('Antes era a {previous}. Clique para ver o que mudou.', { previous: from }),
        () => void shell.openExternal(notesUrl(app.getVersion()))
      )
    }, 8000).unref()
  }
  updates.schedule()
  onConfigChange(() => updates.schedule())
  return { updates, selfUpdate }
}
