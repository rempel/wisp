import type { JSX } from 'react'
import { ChatIcon, TerminalIcon } from './icons'
import { t } from '../../shared/i18n'

/** Chat ou terminal (o Claude Code de verdade): a mesma conversa, dos dois jeitos. */
export function ViewToggle({
  view,
  busy,
  onPick
}: {
  view: 'chat' | 'terminal'
  busy: boolean
  onPick: (view: 'chat' | 'terminal') => void
}): JSX.Element {
  const hint = busy ? t(' (espere a resposta terminar)') : ''
  return (
    <div className="view-toggle" role="group" aria-label={t('Chat ou terminal')}>
      <button
        type="button"
        className={view === 'chat' ? 'active' : ''}
        aria-pressed={view === 'chat'}
        disabled={busy && view !== 'chat'}
        onClick={() => onPick('chat')}
        title={t('Chat: a conversa nas bolhas do Wisp{hint}', { hint })}
      >
        <ChatIcon />
        <span>{t('Chat')}</span>
      </button>
      <button
        type="button"
        className={view === 'terminal' ? 'active' : ''}
        aria-pressed={view === 'terminal'}
        disabled={busy && view !== 'terminal'}
        onClick={() => onPick('terminal')}
        title={t('Terminal: o Claude Code de verdade, na mesma conversa{hint}', { hint })}
      >
        <TerminalIcon />
        <span>{t('Terminal')}</span>
      </button>
    </div>
  )
}
