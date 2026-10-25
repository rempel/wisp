import type { JSX } from 'react'
import { DANCES, EMOTIONS, danceLabel, emotionLabel } from '../../shared/emotions'
import type { MascotPreview } from '../../shared/emotions'
import { t } from '../../shared/i18n'

/**
 * A galeria das emoções e das danças (Fase 27), nas configurações: cada botão mostra a emoção (ou
 * a dança) no mascote por uns segundos, como o Claude faz quando combina com a conversa.
 */
export function MascotGallery(): JSX.Element {
  const show = (preview: MascotPreview): void => window.wisp.settings.previewMascot(preview)
  return (
    <>
      <div className="settings-row">
        <span className="settings-label">{t('Emoções')}</span>
        <div className="gallery-chips" role="group" aria-label={t('Emoções')}>
          {EMOTIONS.filter((emotion) => emotion !== 'neutral').map((emotion) => (
            <button
              key={emotion}
              type="button"
              className="gallery-chip"
              data-emotion={emotion}
              onClick={() => show({ emotion })}
            >
              {emotionLabel(emotion)}
            </button>
          ))}
        </div>
        <small className="settings-hint">
          {t(
            'Clique para ver no mascote. O Claude também mostra uma emoção quando combina com a conversa (um agradecimento, um teste que passou, uma ideia).'
          )}
        </small>
      </div>
      <div className="settings-row">
        <span className="settings-label">{t('Danças')}</span>
        <div className="gallery-chips" role="group" aria-label={t('Danças')}>
          {DANCES.map((dance) => (
            <button
              key={dance}
              type="button"
              className="gallery-chip"
              data-dance={dance}
              onClick={() => show({ dance })}
            >
              {danceLabel(dance)}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
