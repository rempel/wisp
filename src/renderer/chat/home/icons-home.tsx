// Os ícones do painel de controle (Fases 92 a 97), no traço dos outros (16×16, a cor do texto).
import type { JSX } from 'react'
import { Icon } from '../icons'

export const GripIcon = (): JSX.Element => (
  <Icon>
    <circle cx="6" cy="4" r=".6" />
    <circle cx="10" cy="4" r=".6" />
    <circle cx="6" cy="8" r=".6" />
    <circle cx="10" cy="8" r=".6" />
    <circle cx="6" cy="12" r=".6" />
    <circle cx="10" cy="12" r=".6" />
  </Icon>
)

export const EyeOffIcon = (): JSX.Element => (
  <Icon>
    <path d="M2 8s2.2-4 6-4c1 0 1.9.3 2.7.7M14 8s-2.2 4-6 4c-1 0-1.9-.3-2.7-.7" />
    <path d="M6.6 9.4a2 2 0 0 1 2.8-2.8M2.5 13.5l11-11" />
  </Icon>
)

export const EyeIcon = (): JSX.Element => (
  <Icon>
    <path d="M1.8 8S4 3.8 8 3.8 14.2 8 14.2 8 12 12.2 8 12.2 1.8 8 1.8 8Z" />
    <circle cx="8" cy="8" r="2" />
  </Icon>
)

export const ResizeIcon = (): JSX.Element => (
  <Icon>
    <path d="M13 7v6H7M13 13 8.5 8.5" />
  </Icon>
)

export const ClockIcon = (): JSX.Element => (
  <Icon>
    <circle cx="8" cy="8" r="5.8" />
    <path d="M8 5v3.2l2 1.3" />
  </Icon>
)

export const HeartbeatIcon = (): JSX.Element => (
  <Icon>
    <path d="M1.5 8.5h3l1.5-3.5 3 7 1.5-3.5h4" />
  </Icon>
)

export const ChartIcon = (): JSX.Element => (
  <Icon>
    <path d="M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V7" />
  </Icon>
)

export const NoteIcon = (): JSX.Element => (
  <Icon>
    <path d="M9.5 2.5h-5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-7z" />
    <path d="M9.5 2.5v3h3M5.5 9h5M5.5 11.2h3" />
  </Icon>
)

export const StarIcon = ({ filled }: { filled?: boolean }): JSX.Element => (
  <Icon fill={filled ? 'currentColor' : 'none'}>
    <path d="m8 2 1.8 3.7 4 .6-2.9 2.8.7 4L8 11.2l-3.6 1.9.7-4-2.9-2.8 4-.6z" />
  </Icon>
)

export const AlertIcon = (): JSX.Element => (
  <Icon>
    <path d="M8 2.2 1.8 13h12.4z" />
    <path d="M8 6.5v3M8 11.3v.2" />
  </Icon>
)

export const GitIcon = (): JSX.Element => (
  <Icon>
    <circle cx="4.5" cy="4" r="1.6" />
    <circle cx="4.5" cy="12" r="1.6" />
    <circle cx="11.5" cy="6" r="1.6" />
    <path d="M4.5 5.6v4.8M11.5 7.6c0 2.6-4 2-6 3.2" />
  </Icon>
)

export const MusicIcon = (): JSX.Element => (
  <Icon>
    <path d="M6 12V3.5l7-1.3V10.5" />
    <circle cx="4.3" cy="12" r="1.7" />
    <circle cx="11.3" cy="10.5" r="1.7" />
  </Icon>
)

export const SunIcon = (): JSX.Element => (
  <Icon>
    <circle cx="8" cy="8" r="2.8" />
    <path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
  </Icon>
)

export const HabitIcon = (): JSX.Element => (
  <Icon>
    <path d="M13 8a5 5 0 1 1-1.5-3.6" />
    <path d="M13.2 2.5v2.4h-2.4M6 8l1.5 1.5L10.5 6.5" />
  </Icon>
)

export const PlayIcon = (): JSX.Element => (
  <Icon fill="currentColor">
    <path d="M5 3.2v9.6L12.5 8z" />
  </Icon>
)

export const PauseIcon = (): JSX.Element => (
  <Icon fill="currentColor">
    <rect x="4" y="3" width="2.6" height="10" rx=".6" />
    <rect x="9.4" y="3" width="2.6" height="10" rx=".6" />
  </Icon>
)

export const NextIcon = (): JSX.Element => (
  <Icon fill="currentColor">
    <path d="M3.5 3.5v9L10 8z" />
    <rect x="11" y="3.5" width="1.8" height="9" rx=".5" />
  </Icon>
)

export const PrevIcon = (): JSX.Element => (
  <Icon fill="currentColor">
    <path d="M12.5 3.5v9L6 8z" />
    <rect x="3.2" y="3.5" width="1.8" height="9" rx=".5" />
  </Icon>
)

export const ArrowLeftIcon = (): JSX.Element => (
  <Icon>
    <path d="m10 3.5-4.5 4.5 4.5 4.5" />
  </Icon>
)

export const ArrowRightIcon = (): JSX.Element => (
  <Icon>
    <path d="m6 3.5 4.5 4.5-4.5 4.5" />
  </Icon>
)

export const LayoutIcon = (): JSX.Element => (
  <Icon>
    <rect x="2" y="2.5" width="5" height="5" rx="1.2" />
    <rect x="9" y="2.5" width="5" height="3" rx="1.2" />
    <rect x="9" y="7.5" width="5" height="6" rx="1.2" />
    <rect x="2" y="9.5" width="5" height="4" rx="1.2" />
  </Icon>
)

export const SendUpIcon = (): JSX.Element => (
  <Icon strokeWidth="2">
    <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
  </Icon>
)
