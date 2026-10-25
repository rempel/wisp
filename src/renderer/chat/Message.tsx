// Uma mensagem da conversa: a sua (com os selos de falada, na fila e não chegou), o texto do
// Claude, uma ferramenta, um aviso ou um card de permissão ou pergunta.

import type { JSX } from 'react'
import { AttachmentList } from './AttachmentList'
import { MicIcon } from './icons'
import { Markdown } from './Markdown'
import { PermissionCard } from './PermissionCard'
import { QuestionCard } from './QuestionCard'
import type { Item } from './state'
import { ToolCard } from './ToolCard'
import { t } from '../../shared/i18n'

export function Message({
  item,
  streaming,
  onEdit
}: {
  item: Item
  streaming: boolean
  /** A última mensagem dá para editar (com o Claude parado). */
  onEdit?: () => void
}): JSX.Element {
  switch (item.kind) {
    case 'user':
      return (
        <div className={`user-turn${onEdit ? ' editable' : ''}`}>
          {onEdit && (
            <button
              type="button"
              className="edit-last"
              onClick={onEdit}
              title={t('Editar e mandar de novo (↑ na caixa vazia)')}
              aria-label={t('Editar a última mensagem')}
            >
              {t('Editar')}
            </button>
          )}
          <span className="sr-only">{t('Você:')}</span>
          {item.attachments.length > 0 && <AttachmentList items={item.attachments} />}
          {item.text && (
            <div
              className={`msg user${item.voice ? ' spoken' : ''}${item.queued ? ' queued' : ''}`}
            >
              {item.voice && (
                <span className="voice-badge" title={t('Falado')}>
                  <MicIcon />
                </span>
              )}
              {item.text}
            </div>
          )}
          {item.queued && (
            <span
              className="queue-badge"
              title={t('O Claude recebe na próxima pausa, sem parar o que está fazendo')}
            >
              {t('na fila')}
            </span>
          )}
          {item.dropped && (
            <span
              className="queue-badge dropped"
              title={t('A resposta parou antes de o Claude pegar esta mensagem')}
            >
              {t('não chegou ao Claude')}
            </span>
          )}
        </div>
      )
    case 'text':
      return (
        <>
          <span className="sr-only">{t('Claude:')}</span>
          <div className={`msg assistant${streaming ? ' streaming' : ''}`}>
            <Markdown text={item.text} />
          </div>
        </>
      )
    case 'tool':
      return <ToolCard tool={item} />
    case 'notice':
      return (
        <div className={`notice notice-${item.level}`}>
          <Markdown text={item.text} />
        </div>
      )
    case 'permission':
      return item.toolName === 'AskUserQuestion' ? (
        <QuestionCard
          request={item}
          onAnswer={(answers) => window.wisp.chat.answerQuestion(item.id, answers)}
        />
      ) : (
        <PermissionCard
          request={item}
          onAnswer={(decision) => window.wisp.chat.answerPermission(item.id, decision)}
        />
      )
  }
}
