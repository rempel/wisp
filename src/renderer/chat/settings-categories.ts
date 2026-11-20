// As categorias das configurações (Fase 90): quais seções cada uma tem, a última aberta (ou a
// pedida por outra tela) e o filtro que deixa à vista só o que vale agora.
import { useEffect } from 'react'
import type { RefObject } from 'react'
import { fold } from '../../shared/fold'
import { t } from '../../shared/i18n'

export interface SettingsCategory {
  id: string
  label: () => string
  hint: () => string
  /** Os títulos das seções dela (os mesmos dos <Section>). */
  sections: () => string[]
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: 'geral',
    label: () => t('Geral'),
    hint: () => t('O modelo, o modo, as pastas e os projetos'),
    sections: () => [t('Conversas'), t('Projetos')]
  },
  {
    id: 'assistente',
    label: () => t('Assistente'),
    hint: () => t('O batimento, as tarefas agendadas e os prompts'),
    sections: () => [t('Batimento'), t('Tarefas agendadas'), t('Prompts salvos')]
  },
  {
    id: 'aparencia',
    label: () => t('Aparência'),
    hint: () => t('O tema, o tamanho e a acessibilidade'),
    sections: () => [t('Aparência e acessibilidade')]
  },
  {
    id: 'mascote',
    label: () => t('Mascote e sons'),
    hint: () => t('O avatar, as danças e os sons'),
    sections: () => [t('Mascote e sons')]
  },
  {
    id: 'voz',
    label: () => t('Voz'),
    hint: () => t('Falar com o Wisp e ouvir as respostas'),
    sections: () => [t('Voz')]
  },
  {
    id: 'sistema',
    label: () => t('Atalhos e sistema'),
    hint: () => t('Os atalhos, o início com o sistema e as integrações com o desktop'),
    sections: () => [t('Atalhos e sistema')]
  },
  {
    id: 'integracoes',
    label: () => t('Integrações'),
    hint: () => t('O GitHub, o GitLab, a agenda e os avisos'),
    sections: () => [t('Integrações')]
  },
  {
    id: 'claude',
    label: () => 'Claude Code',
    hint: () => t('As skills, os subagentes, os servidores MCP e a OpenRouter'),
    sections: () => [
      t('Skills'),
      t('Subagentes'),
      t('Servidores MCP'),
      t('OpenRouter (experimental)')
    ]
  },
  {
    id: 'pentest',
    label: () => t('Pentest'),
    hint: () => t('O seu projeto pentester: a pasta, a aprovação e o laboratório'),
    sections: () => [t('Pentest')]
  },
  {
    id: 'fora',
    label: () => t('Fora de casa'),
    hint: () => t('O Telegram e o celular'),
    sections: () => ['Telegram', t('Celular')]
  },
  {
    id: 'avancado',
    label: () => t('Avançado'),
    hint: () => t('Levar o Wisp junto, o config.json e o registro'),
    sections: () => [t('Levar o Wisp junto'), t('Avançado')]
  }
]

const STORE = 'wisp.config.categoria'

/** A categoria guardada (a última aberta, ou a pedida por outra tela). */
export function savedCategory(): string {
  try {
    const id = localStorage.getItem(STORE)
    if (id && SETTINGS_CATEGORIES.some((item) => item.id === id)) return id
  } catch {
    // Sem o armazenamento: a primeira.
  }
  return SETTINGS_CATEGORIES[0].id
}

/** Guarda a categoria: a tela de configurações abre nela (o Início e a sidebar usam). */
export function openSettingsAt(id: string): void {
  try {
    localStorage.setItem(STORE, id)
  } catch {
    // Sem o armazenamento: abre na primeira.
  }
}

/** A categoria de uma seção, pelo título dela. */
function categoryOf(title: string): string | null {
  return SETTINGS_CATEGORIES.find((item) => item.sections().includes(title))?.id ?? null
}

/**
 * Deixa à vista só as seções da categoria, ou, com a busca, as que têm o texto (sem acento nem
 * caixa), em qualquer categoria. Uma seção sem categoria conhecida fica em Avançado.
 */
export function useSettingsFilter(
  scroll: RefObject<HTMLDivElement | null>,
  category: string,
  query: string,
  ready: unknown
): void {
  useEffect(() => {
    const wanted = fold(query.trim())
    for (const section of scroll.current?.querySelectorAll<HTMLElement>('.settings-section') ??
      []) {
      const title = section.querySelector('h2')?.textContent ?? ''
      section.hidden = wanted
        ? !fold(section.textContent ?? '').includes(wanted)
        : (categoryOf(title) ?? 'avancado') !== category
    }
    scroll.current?.scrollTo({ top: 0 })
  }, [scroll, category, query, ready])
}
