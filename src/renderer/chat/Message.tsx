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
import { ReviewCard } from './ReviewCard'
import { t } from '../../shared/i18n'

export function Message({
  item,
  streaming,
  onEdit,
  onRewind,
  onFork,
  conversation
}: {
  item: Item
  streaming: boolean
  /** A última mensagem dá para editar (com o Claude parado). */
  onEdit?: () => void
  /** Voltar a conversa para antes desta mensagem (Fase 46). */
  onRewind?: () => void
  /** Uma aba nova com a conversa até o fim da resposta desta mensagem (Fase 46). */
  onFork?: () => void
  /** A conversa do painel (o desfazer do card de revisão, Fase 42). */
  conversation?: string
}): JSX.Element {
  switch (item.kind) {
    case 'user':
      return (
        <div className={`user-turn${onEdit || onRewind || onFork ? ' editable' : ''}`}>
          {(onEdit || onRewind || onFork) && (
            <span className="turn-actions">
              {onRewind && (
                <button
                  type="button"
                  className="edit-last"
                  onClick={onRewind}
                  title={t('A conversa volta para antes desta mensagem (e os arquivos, se quiser)')}
                  aria-label={t('Voltar a este ponto')}
                >
                  {t('Voltar aqui')}
                </button>
              )}
              {onFork && (
                <button
                  type="button"
                  className="edit-last"
                  onClick={onFork}
                  title={t('Uma aba nova com a conversa até a resposta desta mensagem')}
                  aria-label={t('Ramificar daqui')}
                >
                  {t('Ramificar')}
                </button>
              )}
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
            </span>
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
          <div className={`msg assistant${streaming ? ' streaming' : ''}`} data-item={item.id}>
            <Markdown text={item.text} />
          </div>
        </>
      )
    case 'tool':
      return <ToolCard tool={item} />
    case 'review':
      return <ReviewCard item={item} conversation={conversation} />
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
