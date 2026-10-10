import type { JSX } from 'react'
import type { ClipboardOffer } from '../../shared/ipc'
import { ClipboardIcon, CloseIcon } from './icons'

const count = new Intl.NumberFormat('pt-BR')

/** O que o chip diz: a ação e o tamanho, sem mostrar o conteúdo (pode ser uma senha). */
function describe(offer: ClipboardOffer): { label: string; meta: string } {
  switch (offer.kind) {
    case 'link':
      return { label: 'Usar o link copiado', meta: offer.host ?? '' }
    case 'image':
      return {
        label: 'Anexar a imagem copiada',
        meta: offer.width && offer.height ? `${offer.width}×${offer.height}` : ''
      }
    case 'text': {
      const lines = offer.lines ?? 1
      return {
        label: offer.asFile ? 'Anexar o texto copiado' : 'Usar o texto copiado',
        meta:
          lines > 1
            ? `${count.format(lines)} linhas`
            : `${count.format(offer.chars ?? 0)} ${offer.chars === 1 ? 'caractere' : 'caracteres'}`
      }
    }
  }
}

/** "Usar o que você copiou": um clique põe na caixa de texto (ou anexa); o × dispensa. */
export function ClipboardChip({
  offer,
  onTake,
  onDismiss
}: {
  offer: ClipboardOffer
  onTake: () => void
  onDismiss: () => void
}): JSX.Element {
  const { label, meta } = describe(offer)
  return (
    <div className="clip-chip">
      <button
        type="button"
        className="clip-take"
        onClick={onTake}
        title="Nada sai do computador até você enviar a mensagem"
      >
        <ClipboardIcon />
        <span className="clip-label">{label}</span>
        {meta && <span className="clip-meta">{meta}</span>}
      </button>
      <button
        type="button"
        className="clip-dismiss"
        onClick={onDismiss}
        title="Dispensar"
        aria-label="Dispensar"
      >
        <CloseIcon />
      </button>
    </div>
  )
}
