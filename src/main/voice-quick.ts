// Os comandos rápidos de voz (Fase 10), feitos pelo próprio Wisp, sem o Claude: a música, o
// volume e abrir um app (com o mesmo card do open_app). E os avisos da voz.

import type { Chat } from './chat'
import { getConfig } from './config'
import { listApps, openApp } from './desktop'
import type { MediaPlayers } from './media'
import type { Notify } from './notify'
import { IS_WINDOWS } from './platform'
import { matchApp } from './voice-commands'
import type { QuickCommand } from './voice-commands'
import { stepSystemVolume } from './volume'
import type { NoticeLevel } from '../shared/ipc'
import { t } from '../shared/i18n'

export interface QuickOptions {
  chat(): Chat | null
  media(): MediaPlayers | null
  notify: Notify
  /** O mascote comemora o comando feito. */
  happy(): void
}

export interface VoiceQuick {
  /** Um aviso da voz: no painel e, com ele escondido, numa notificação (menos os informativos). */
  notice(level: NoticeLevel, text: string): void
  /** Um comando rápido de voz, feito aqui mesmo; false se é para o Claude. */
  run(command: QuickCommand, text: string): Promise<boolean>
}

export function voiceQuick(options: QuickOptions): VoiceQuick {
  const notice = (level: NoticeLevel, text: string): void => {
    const chat = options.chat()
    chat?.notice(level, text)
    if (level !== 'info' && !chat?.visible()) options.notify('Wisp', text.replace(/\*\*|`/g, ''))
  }
  const quick = async (chat: Chat, command: QuickCommand, text: string): Promise<boolean> => {
    const media = options.media()
    const done = (ok: boolean, message: string): true => {
      chat.utterance(text)
      if (ok) {
        chat.notice('info', message)
        options.happy()
      } else {
        notice('warning', message)
      }
      return true
    }
    switch (command.kind) {
      case 'media': {
        if (!media || !(await media.players()).length) {
          return done(false, t('Nenhum player de música aberto.'))
        }
        return done(true, (await media.control(command.action)) || t('Feito.'))
      }
      case 'volume': {
        const level = await stepSystemVolume(command.direction)
        if (level !== null) return done(true, t('Volume do sistema em {level}%.', { level }))
        // No Windows, o volume do player já é o do sistema.
        if (IS_WINDOWS) return done(false, t('Não consegui mudar o volume do Windows.'))
        if (media && (await media.players()).length) {
          return done(true, await media.volume(undefined, command.direction * 10))
        }
        return done(false, t('Não consegui mudar o volume: não achei o wpctl nem o pactl.'))
      }
      case 'open': {
        // Um nome que não é de um app instalado vai para o Claude, que sabe procurar melhor.
        const found = matchApp(command.name, listApps())
        if (!found) return false
        chat.utterance(text)
        // O mesmo card do open_app do Claude: nada abre sem um clique (a não ser que o open_app
        // esteja em extraAllowedTools, como para o Claude).
        const allowed = getConfig().extraAllowedTools.includes('mcp__desktop__open_app')
        const approval = allowed
          ? { allow: true }
          : await chat.requestApproval({
              toolName: 'mcp__desktop__open_app',
              input: { id: found.id }
            })
        if (!approval.allow) return true
        const outcome = await openApp(found.id)
        chat.notice(outcome.ok ? 'info' : 'warning', outcome.message)
        if (outcome.ok) options.happy()
        return true
      }
    }
  }
  return {
    notice,
    run: async (command, text) => {
      const chat = options.chat()
      if (!chat) return false
      try {
        return await quick(chat, command, text)
      } catch (err) {
        chat.utterance(text)
        notice('warning', t('Não consegui: {message}.', { message: (err as Error).message }))
        return true
      }
    }
  }
}
