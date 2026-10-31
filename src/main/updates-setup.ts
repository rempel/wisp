// Atualizar com um clique (Fase 31; o instalador do Windows na Fase 36) e o aviso de versão nova
// (Fase 20): o que o index.ts monta, à parte para ele não crescer demais.

import { spawn } from 'child_process'
import { app, shell } from 'electron'
import { join } from 'path'
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
}

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
    notify: (release) =>
      selfUpdate
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
  })
  updates.schedule()
  onConfigChange(() => updates.schedule())
  return { updates, selfUpdate }
}
