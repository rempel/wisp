import type { JSX } from 'react'
import type { SlashCommand } from './slash'
import { t } from '../../shared/i18n'

/** O menu dos comandos com barra, acima da caixa de texto. */
export function SlashMenu({
  commands,
  selected,
  onPick
}: {
  commands: SlashCommand[]
  selected: number
  onPick: (command: SlashCommand) => void
}): JSX.Element {
  return (
    <div className="slash-menu" role="listbox" aria-label={t('Comandos')}>
      {commands.map((command, index) => (
        <button
          key={command.name}
          type="button"
          role="option"
          aria-selected={index === selected}
          className={`slash-option${index === selected ? ' selected' : ''}`}
          // O clique não tira o foco da caixa de texto.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(command)}
        >
          <strong>/{command.name}</strong>
          {command.prompt && <em className="slash-saved">{t('prompt salvo')}</em>}
          {command.description && <span>{command.description}</span>}
        </button>
      ))}
    </div>
  )
}
