// Os ícones da ilha (Fase 37): traço de 1,6 px, no tamanho da fonte.

import type { JSX, ReactNode } from 'react'

export const Svg = ({
  children,
  size = 14
}: {
  children: ReactNode
  size?: number
}): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
)

export const HomeIcon = (): JSX.Element => (
  <Svg>
    <path d="M2.5 7.5 8 3l5.5 4.5V13H10V9.5H6V13H2.5z" />
  </Svg>
)
export const GearIcon = (): JSX.Element => (
  <Svg>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M3.6 12.4l1.2-1.2M11.2 4.8l1.2-1.2" />
  </Svg>
)
export const PanelIcon = (): JSX.Element => (
  <Svg>
    <rect x="2.5" y="3" width="11" height="10" rx="2" />
    <path d="M2.5 6h11" />
  </Svg>
)
export const SoundIcon = ({ on }: { on: boolean }): JSX.Element => (
  <Svg>
    <path d="M3 6.2h2.2L8.4 3.5v9L5.2 9.8H3z" />
    {on ? (
      <path d="M10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.4 4a5.6 5.6 0 0 1 0 8" />
    ) : (
      <path d="m11 6 3 3m0-3-3 3" />
    )}
  </Svg>
)
export const AskIcon = (): JSX.Element => (
  <Svg>
    <path d="M3 3.5h10v7H7.5L4.5 13v-2.5H3z" />
  </Svg>
)
export const MicIcon = (): JSX.Element => (
  <Svg>
    <rect x="6" y="2" width="4" height="8" rx="2" />
    <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2" />
  </Svg>
)
export const FileIcon = (): JSX.Element => (
  <Svg size={12}>
    <path d="M4 2h5l3 3v9H4z" />
    <path d="M9 2v3h3" />
  </Svg>
)
export const BackIcon = (): JSX.Element => (
  <Svg>
    <path d="M10 3.5 5.5 8l4.5 4.5" />
  </Svg>
)
export const FoldIcon = (): JSX.Element => (
  <Svg>
    <path d="m4 10 4-4 4 4" />
  </Svg>
)
export const OpenIcon = (): JSX.Element => (
  <Svg size={12}>
    <path d="M6 3.5h6.5V10M12.5 3.5 4 12" />
  </Svg>
)
export const NoteIcon = ({ size = 14 }: { size?: number }): JSX.Element => (
  <Svg size={size}>
    <path d="M6 12.2V3.6l7-1.4v8.6" />
    <circle cx="4.4" cy="12.2" r="1.7" />
    <circle cx="11.4" cy="10.8" r="1.7" />
  </Svg>
)
export const PlayIcon = (): JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
    <path d="M5 3.2v9.6L12.8 8z" fill="currentColor" />
  </svg>
)
export const PauseIcon = (): JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
    <path d="M4.5 3h2.4v10H4.5zM9.1 3h2.4v10H9.1z" fill="currentColor" />
  </svg>
)
export const PrevIcon = (): JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
    <path d="M3.5 3h1.8v10H3.5zM13 3.2v9.6L6 8z" fill="currentColor" />
  </svg>
)
export const NextIcon = (): JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
    <path d="M10.7 3h1.8v10h-1.8zM3 3.2v9.6L10 8z" fill="currentColor" />
  </svg>
)
export const ShuffleIcon = (): JSX.Element => (
  <Svg>
    <path d="M2 4.5h2.4c2.6 0 4.2 7 7 7H14M2 11.5h2.4c1.2 0 2.1-1.4 2.9-3M14 4.5h-2.6c-1 0-1.8 1-2.5 2.3M12 2.5l2 2-2 2M12 9.5l2 2-2 2" />
  </Svg>
)
export const RepeatIcon = ({ one }: { one: boolean }): JSX.Element => (
  <Svg>
    <path d="M3 7V6a2 2 0 0 1 2-2h8l-2-2M13 9v1a2 2 0 0 1-2 2H3l2 2" />
    {one && <path d="M7.4 7.2 8.4 6.6v3" strokeWidth="1.3" />}
  </Svg>
)
