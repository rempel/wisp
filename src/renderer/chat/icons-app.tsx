// Os ícones da interface completa (Fase 88): a sidebar, o Início e os dois modos. O mesmo traço
// dos outros (16×16, a cor do texto).
import type { JSX } from 'react'
import { Icon } from './icons'

export const HomeIcon = (): JSX.Element => (
  <Icon>
    <path d="M2.5 7.5 8 3l5.5 4.5" />
    <path d="M4 6.5V13h3V9.5h2V13h3V6.5" />
  </Icon>
)

export const SidebarIcon = (): JSX.Element => (
  <Icon>
    <rect x="2" y="3" width="12" height="10" rx="2" />
    <path d="M6 3v10" />
  </Icon>
)

/** Abrir a janela completa. */
export const ExpandIcon = (): JSX.Element => (
  <Icon>
    <path d="M9.5 2.5h4v4" />
    <path d="M13.5 2.5 9 7" />
    <path d="M6.5 13.5h-4v-4" />
    <path d="M2.5 13.5 7 9" />
  </Icon>
)

/** Voltar ao painel compacto. */
export const CompactIcon = (): JSX.Element => (
  <Icon>
    <path d="M13.5 6.5h-4v-4" />
    <path d="M9.5 6.5 14 2" />
    <path d="M2.5 9.5h4v4" />
    <path d="M6.5 9.5 2 14" />
  </Icon>
)

export const MemoryIcon = (): JSX.Element => (
  <Icon>
    <path d="M8 3.2C6.6 2 4 2.6 4 4.6c-1.5.4-2 2.3-.8 3.3-1 1.2-.2 3.1 1.3 3.1.3 1.6 2.4 2.2 3.5.8" />
    <path d="M8 3.2c1.4-1.2 4-.6 4 1.4 1.5.4 2 2.3.8 3.3 1 1.2.2 3.1-1.3 3.1-.3 1.6-2.4 2.2-3.5.8" />
    <path d="M8 3.2v9.6" />
  </Icon>
)

export const UsageIcon = (): JSX.Element => (
  <Icon>
    <path d="M2.5 13.5h11" />
    <path d="M4.5 11V8" />
    <path d="M8 11V4.5" />
    <path d="M11.5 11V6.5" />
  </Icon>
)

export const ClockIcon = (): JSX.Element => (
  <Icon>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 5v3l2 1.5" />
  </Icon>
)

export const SparkIcon = (): JSX.Element => (
  <Icon>
    <path d="M8 2.5 9.3 6.7 13.5 8 9.3 9.3 8 13.5 6.7 9.3 2.5 8 6.7 6.7Z" />
  </Icon>
)
