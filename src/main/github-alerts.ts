// Os alertas do GitHub (Fase 13, opcional), pelo gh já logado: CI e revisões dos seus PRs, e
// pedidos de revisão. Cada um vira uma notificação (o clique abre o PR no navegador), uma linha na
// ilha e uma reação do mascote; e o Claude lê o mesmo retrato pela ferramenta github_status.
// Desde a Fase 41, o clique num CI vermelho ou num pedido de mudanças abre uma aba nova com o
// pedido de investigar na caixa (sem mandar: você revisa e manda).

import { shell } from 'electron'
import type { Chat } from './chat'
import { getConfig } from './config'
import {
  describeAlert,
  describeSnapshot,
  GithubWatcher,
  investigatePrompt,
  MAX_ALERTS
} from './github'
import type { GithubAlert } from './github'
import { islandMessage, reactMascot } from './mascot'
import type { Signals } from './notify'
import { findProgram } from './programs'
import { t } from '../shared/i18n'

export interface GithubAlerts {
  watcher: GithubWatcher
  /** Liga ou desliga conforme o config.json. */
  update(): void
  /** O retrato dos seus PRs em texto, para o Claude. */
  describe(): Promise<string>
  /** Os alertas novos, para as tarefas por evento (Fase 44). */
  onAlerts(listener: (alerts: GithubAlert[]) => void): void
}

export function setupGithub(signals: Signals, chat: () => Chat | null): GithubAlerts {
  const { notify } = signals
  const listeners: ((alerts: GithubAlert[]) => void)[] = []
  const alerted = (alerts: GithubAlert[]): void => {
    for (const listener of listeners) listener(alerts)
    signals.activity()
    const first = describeAlert(alerts[0])
    islandMessage(first.title, first.body, 8000)
    for (const alert of alerts.slice(0, MAX_ALERTS)) {
      const { title, body, url } = describeAlert(alert)
      const prompt = investigatePrompt(alert)
      const panel = prompt ? chat() : null
      if (prompt && panel) {
        notify(title, `${body}\n${t('Clique para investigar numa conversa.')}`, () => {
          panel.newConversation()
          panel.compose(prompt)
        })
      } else {
        notify(title, body, () => void shell.openExternal(url))
      }
    }
    if (alerts.length > MAX_ALERTS) {
      const more = alerts.length - MAX_ALERTS
      notify(
        'GitHub',
        t('E mais {more} {v2} nos seus PRs.', {
          more,
          v2: more === 1 ? t('novidade') : t('novidades')
        })
      )
    }
    // O mascote reage ao mais importante: CI vermelho ou pedido de mudanças, aprovação ou CI
    // verde, e o resto (pedido de revisão, comentário) com o sininho.
    const bad = alerts.some(
      (a) => a.kind === 'ci-failed' || (a.kind === 'review' && a.state === 'CHANGES_REQUESTED')
    )
    const good = alerts.some(
      (a) => a.kind === 'ci-passed' || (a.kind === 'review' && a.state === 'APPROVED')
    )
    if (bad) {
      signals.flash('error')
      signals.sound('erro')
    } else if (good) {
      signals.flash('happy')
      signals.sound('pronto')
    } else {
      reactMascot('remind')
      signals.sound('lembrete')
    }
  }
  const watcher = new GithubWatcher({
    gh: () =>
      findProgram('gh', ['gh'], ['/usr/local/bin', '/snap/bin', '/home/linuxbrew/.linuxbrew/bin']),
    onAlerts: alerted,
    onProblem: (problem) => {
      if (!problem) return chat()?.notice('info', t('Os alertas do GitHub voltaram a funcionar.'))
      chat()?.notice(
        'warning',
        problem.kind === 'missing'
          ? t(
              'Para os alertas do GitHub, instale o **gh** (GitHub CLI) e rode `gh auth login` no '
            ) + t('terminal. O Wisp pergunta de novo de tempos em tempos.')
          : t('O **gh** não está logado no GitHub: rode `gh auth login` no terminal. O Wisp ') +
              t('pergunta de novo de tempos em tempos.')
      )
    }
  })
  return {
    watcher,
    onAlerts: (listener) => void listeners.push(listener),
    update: () => {
      if (getConfig().github) watcher.start()
      else watcher.stop()
    },
    describe: async () => {
      if (!getConfig().github) {
        return (
          t('Os alertas do GitHub estão desligados. Dá para ligar em Configurações → ') +
          t('Integrações (precisa do gh, o GitHub CLI, logado).')
        )
      }
      // Uma leitura com mais de um minuto é refeita na hora.
      const last = watcher.snapshot()
      if (!last || Date.now() - last.at > 60_000) await watcher.poll()
      const problem = watcher.currentProblem()
      if (problem === 'missing') return t('O gh (GitHub CLI) não está instalado.')
      if (problem === 'login') return t('O gh não está logado: falta rodar `gh auth login`.')
      const snapshot = watcher.snapshot()
      return snapshot ? describeSnapshot(snapshot) : t('Não consegui ler o GitHub agora.')
    }
  }
}
