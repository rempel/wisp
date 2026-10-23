import type { JSX } from 'react'
import { CloseIcon, FileIcon } from './icons'
import type { AttachmentPreview } from './state'
import { formatSize } from './useAttachments'
import { t } from '../../shared/i18n'

/**
 * Anexos de uma mensagem: miniaturas para imagens e chips com o nome para o resto. Com
 * `onRemove` (na caixa de texto), cada um ganha um botão de remover.
 */
export function AttachmentList({
  items,
  onRemove
}: {
  items: (AttachmentPreview & { id?: string })[]
  onRemove?: (id: string) => void
}): JSX.Element {
  return (
    <div className="attachments">
      {items.map((item, index) => {
        const label = `${item.name} (${formatSize(item.size)})`
        const removeButton =
          onRemove && item.id ? (
            <button
              type="button"
              className="attachment-remove"
              onClick={() => onRemove(item.id as string)}
              title={t('Remover {name}', { name: item.name })}
              aria-label={t('Remover {name}', { name: item.name })}
            >
              <CloseIcon />
            </button>
          ) : null
        return item.thumbnail ? (
          <div key={item.id ?? index} className="attachment thumb" title={label}>
            <img src={item.thumbnail} alt={item.name} />
            {removeButton}
          </div>
        ) : (
          <div key={item.id ?? index} className="attachment chip" title={label}>
            <FileIcon />
            <span className="attachment-name">{item.name}</span>
            <span className="attachment-size">{formatSize(item.size)}</span>
            {removeButton}
          </div>
        )
      })}
    </div>
  )
}
