// As configurações em categorias (Fase 90): a lista à esquerda (no modo completo) ou um seletor no
// alto (no compacto), a busca e o título da categoria.
import type { JSX } from 'react'
import { openSettingsAt, SETTINGS_CATEGORIES } from './settings-categories'
import { t } from '../../shared/i18n'

export function SettingsNav({
  category,
  onCategory,
  query,
  onQuery
}: {
  category: string
  onCategory: (id: string) => void
  query: string
  onQuery: (query: string) => void
}): JSX.Element {
  const choose = (id: string): void => {
    openSettingsAt(id)
    onQuery('')
    onCategory(id)
  }
  return (
    <nav className="settings-nav" aria-label={t('Categorias das configurações')}>
      <input
        type="search"
        className="settings-search"
        value={query}
        placeholder={t('Buscar nas configurações')}
        aria-label={t('Buscar nas configurações')}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && query) {
            event.stopPropagation()
            onQuery('')
          }
        }}
      />
      <select
        className="settings-category-select"
        value={category}
        aria-label={t('Categoria')}
        onChange={(event) => choose(event.target.value)}
      >
        {SETTINGS_CATEGORIES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label()}
          </option>
        ))}
      </select>
      <ul className="settings-categories">
        {SETTINGS_CATEGORIES.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`settings-category${!query && item.id === category ? ' active' : ''}`}
              aria-current={!query && item.id === category ? 'page' : undefined}
              title={item.hint()}
              onClick={() => choose(item.id)}
            >
              {item.label()}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** O título e a explicação da categoria, no alto das seções (ou o que a busca procura). */
export function SettingsHeading({
  category,
  query
}: {
  category: string
  query: string
}): JSX.Element {
  const current = SETTINGS_CATEGORIES.find((item) => item.id === category)
  return (
    <div className="settings-heading">
      <h1>{query.trim() ? t('Busca: "{query}"', { query: query.trim() }) : current?.label()}</h1>
      {!query.trim() && current && <p>{current.hint()}</p>}
    </div>
  )
}
