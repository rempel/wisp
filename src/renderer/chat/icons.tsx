import { useContext, useId } from 'react'
import type { JSX, SVGProps } from 'react'
import { DROP_PATH, GHOST_PATH } from '../../shared/avatars'
import type { MascotState } from '../../shared/ipc'
import { AvatarContext } from './avatar-context'

// Ícones de traço simples (16×16, cor do texto) e o avatar do Wisp. Sem assets externos.

function Icon({ children, ...props }: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

export const CopyIcon = (): JSX.Element => (
  <Icon>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5V3.8A1.3 1.3 0 0 0 9.2 2.5H3.8a1.3 1.3 0 0 0-1.3 1.3v5.4a1.3 1.3 0 0 0 1.3 1.3h1.7" />
  </Icon>
)

export const CheckIcon = (): JSX.Element => (
  <Icon>
    <path d="m3.5 8.5 3 3 6-7" />
  </Icon>
)

export const PlusIcon = (): JSX.Element => (
  <Icon>
    <path d="M8 3v10M3 8h10" />
  </Icon>
)

export const CloseIcon = (): JSX.Element => (
  <Icon>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
)

export const SendIcon = (): JSX.Element => (
  <Icon>
    <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
  </Icon>
)

export const StopIcon = (): JSX.Element => (
  <Icon fill="currentColor" stroke="none">
    <rect x="4" y="4" width="8" height="8" rx="1.5" />
  </Icon>
)

export const PaperclipIcon = (): JSX.Element => (
  <Icon>
    <path d="m13 7.6-5.1 5.1a3.1 3.1 0 0 1-4.4-4.4l5.6-5.6a2 2 0 0 1 2.9 2.9l-5.5 5.5a1 1 0 0 1-1.4-1.4l5-5" />
  </Icon>
)

/** Print da tela: os cantos de uma área capturada em volta de uma tela. */
export const ScreenshotIcon = (): JSX.Element => (
  <Icon>
    <path d="M2.5 5.5v-2a1 1 0 0 1 1-1h2M10.5 2.5h2a1 1 0 0 1 1 1v2M13.5 10.5v2a1 1 0 0 1-1 1h-2M5.5 13.5h-2a1 1 0 0 1-1-1v-2" />
    <rect x="5.2" y="5.7" width="5.6" height="4.6" rx="0.8" />
  </Icon>
)

/** Microfone: a cápsula, o arco do suporte e o pé. */
export const MicIcon = (): JSX.Element => (
  <Icon>
    <rect x="5.7" y="1.8" width="4.6" height="8" rx="2.3" />
    <path d="M3.4 7.6a4.6 4.6 0 0 0 9.2 0M8 12.2v2" />
  </Icon>
)

export const ClipboardIcon = (): JSX.Element => (
  <Icon>
    <path d="M10.5 3.5h1a1.3 1.3 0 0 1 1.3 1.3v7.9a1.3 1.3 0 0 1-1.3 1.3h-7a1.3 1.3 0 0 1-1.3-1.3V4.8a1.3 1.3 0 0 1 1.3-1.3h1" />
    <rect x="5.5" y="2.2" width="5" height="2.6" rx="0.8" />
    <path d="M6 8.2h4M6 10.7h2.6" />
  </Icon>
)

export const FileIcon = (): JSX.Element => (
  <Icon>
    <path d="M9 2.5H5.2a1.4 1.4 0 0 0-1.4 1.4v8.2a1.4 1.4 0 0 0 1.4 1.4h5.6a1.4 1.4 0 0 0 1.4-1.4V5.7Z" />
    <path d="M9 2.5v3.2h3.2" />
  </Icon>
)

export const ChevronIcon = ({ open }: { open: boolean }): JSX.Element => (
  <Icon className={`chevron${open ? ' open' : ''}`}>
    <path d="m6 4 4 4-4 4" />
  </Icon>
)

export const HistoryIcon = (): JSX.Element => (
  <Icon>
    <path d="M2.8 8a5.2 5.2 0 1 0 1.5-3.7" />
    <path d="M2.5 2.8v2.3h2.3" />
    <path d="M8 5.2V8l1.9 1.3" />
  </Icon>
)

export const TrashIcon = (): JSX.Element => (
  <Icon>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.4 4.5l.6 8.2a1 1 0 0 0 1 .9h4a1 1 0 0 0 1-.9l.6-8.2" />
  </Icon>
)

/** Um alfinete, para fixar uma conversa no topo do histórico. */
export const PinIcon = (): JSX.Element => (
  <Icon>
    <path d="M6 2.5h4M7 2.5v3.5L4.5 8.5h7L9 6V2.5M8 8.5v5" />
  </Icon>
)

/** Uma seta para baixo numa bandeja, para exportar. */
export const DownloadIcon = (): JSX.Element => (
  <Icon>
    <path d="M8 2.5v7M5 6.5l3 3 3-3M3 11v1.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V11" />
  </Icon>
)

/** Três controles deslizantes, para as configurações. */
export const SettingsIcon = (): JSX.Element => (
  <Icon>
    <path d="M2.5 4.5H8m3 0h2.5M2.5 8H4.5m3 0h6M2.5 11.5H8.5m3 0h2" />
    <circle cx="9.5" cy="4.5" r="1.5" />
    <circle cx="6" cy="8" r="1.5" />
    <circle cx="10" cy="11.5" r="1.5" />
  </Icon>
)

/** Uma folhinha de calendário, para o próximo compromisso. */
export const CalendarIcon = (): JSX.Element => (
  <Icon>
    <rect x="2.5" y="3.5" width="11" height="10" rx="2" />
    <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
  </Icon>
)

/** Um "play", para o modo demonstração. */
export const DemoIcon = (): JSX.Element => (
  <Icon>
    <path d="M5.5 4.2v7.6L11.8 8z" />
  </Icon>
)

export const BackIcon = (): JSX.Element => (
  <Icon>
    <path d="M13 8H3.5M7.5 4 3.5 8l4 4" />
  </Icon>
)

export const SearchIcon = (): JSX.Element => (
  <Icon>
    <circle cx="7" cy="7" r="4.2" />
    <path d="m10.2 10.2 3.3 3.3" />
  </Icon>
)

/** Um chip, para o modelo. */
export const ModelIcon = (): JSX.Element => (
  <Icon>
    <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" />
    <path d="M6.5 2.5v2M9.5 2.5v2M6.5 11.5v2M9.5 11.5v2M2.5 6.5h2M2.5 9.5h2M11.5 6.5h2M11.5 9.5h2" />
  </Icon>
)

/** Maximizar: um quadrado. */
export const MaximizeIcon = (): JSX.Element => (
  <Icon>
    <rect x="3" y="3" width="10" height="10" rx="1.5" />
  </Icon>
)

/** Restaurar: dois quadrados sobrepostos. */
export const RestoreIcon = (): JSX.Element => (
  <Icon>
    <rect x="3" y="5.5" width="7.5" height="7.5" rx="1.3" />
    <path d="M5.5 5.5V4.3c0-.7.6-1.3 1.3-1.3h4.9c.7 0 1.3.6 1.3 1.3v4.9c0 .7-.6 1.3-1.3 1.3h-1.2" />
  </Icon>
)

/** Voltar para perto do mascote: uma seta para um ponto. */
export const DockIcon = (): JSX.Element => (
  <Icon>
    <path d="M3 13 9.5 6.5" />
    <path d="M5 6.5h4.5V11" />
    <circle cx="12.5" cy="3.5" r="1.4" />
  </Icon>
)

/** O provedor: um caminho entre dois pontos. */
export const RouteIcon = (): JSX.Element => (
  <Icon>
    <circle cx="3.5" cy="12.5" r="1.6" />
    <circle cx="12.5" cy="3.5" r="1.6" />
    <path d="M5 12.5h4.5a2 2 0 0 0 0-4h-3a2 2 0 0 1 0-4H11" />
  </Icon>
)

/** Modo Pedir: um escudo. */
export const ShieldIcon = (): JSX.Element => (
  <Icon>
    <path d="M8 1.8 13 3.8v4c0 3-2.1 5.3-5 6.4-2.9-1.1-5-3.4-5-6.4v-4Z" />
  </Icon>
)

/** Modo Aceitar edições: um lápis. */
export const PencilIcon = (): JSX.Element => (
  <Icon>
    <path d="M10.6 2.6a1.6 1.6 0 0 1 2.3 2.3L5.6 12.2l-3 .8.8-3Z" />
    <path d="m9.6 3.6 2.3 2.3" />
  </Icon>
)

/** Modo Planejar: uma lista com marcas. */
export const PlanIcon = (): JSX.Element => (
  <Icon>
    <path d="M6.5 4h7M6.5 8h7M6.5 12h7" />
    <path d="m2.4 4 .8.8 1.4-1.6M2.4 8l.8.8 1.4-1.6" />
    <circle cx="3.4" cy="12" r="0.9" />
  </Icon>
)

/** Modo Automático: um raio. */
export const BoltIcon = (): JSX.Element => (
  <Icon>
    <path d="M9 1.8 3.4 9h4.2L7 14.2 12.6 7H8.4Z" />
  </Icon>
)

/** Dividir a janela: duas colunas. */
export const SplitIcon = (): JSX.Element => (
  <Icon>
    <rect x="2" y="2.8" width="12" height="10.4" rx="1.6" />
    <path d="M8 2.8v10.4" />
  </Icon>
)

/** Um terminal, para a aba Sessões. */
export const TerminalIcon = (): JSX.Element => (
  <Icon>
    <rect x="2" y="3" width="12" height="10" rx="1.8" />
    <path d="m4.8 6.3 2 1.7-2 1.7M8.4 10.2h2.8" />
  </Icon>
)

export const FolderIcon = (): JSX.Element => (
  <Icon>
    <path d="M2.5 4.6a1.1 1.1 0 0 1 1.1-1.1h2.6l1.4 1.5h4.8a1.1 1.1 0 0 1 1.1 1.1v5.7a1.1 1.1 0 0 1-1.1 1.1H3.6a1.1 1.1 0 0 1-1.1-1.1Z" />
  </Icon>
)

/** Uma janela com uma seta saindo: trazer outra janela para a frente. */
export const FocusIcon = (): JSX.Element => (
  <Icon>
    <path d="M9.5 2.5h4v4M13.5 2.5 8 8M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
  </Icon>
)

/** Balão de conversa: continuar no chat. */
export const ChatIcon = (): JSX.Element => (
  <Icon>
    <path d="M3.2 3h9.6a1.2 1.2 0 0 1 1.2 1.2v5.6a1.2 1.2 0 0 1-1.2 1.2H7l-3 2.5V11h-.8A1.2 1.2 0 0 1 2 9.8V4.2A1.2 1.2 0 0 1 3.2 3Z" />
  </Icon>
)

export const ChevronDownIcon = (): JSX.Element => (
  <Icon className="chevron-down">
    <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
  </Icon>
)

/** Alto-falante com ondas: sons ligados. */
export const SoundOnIcon = (): JSX.Element => (
  <Icon>
    <path d="M2.8 6.2h2.3l3.4-2.7v9L5.1 9.8H2.8a.5.5 0 0 1-.5-.5V6.7a.5.5 0 0 1 .5-.5Z" />
    <path d="M10.8 6a2.8 2.8 0 0 1 0 4M12.5 4.3a5.2 5.2 0 0 1 0 7.4" />
  </Icon>
)

/** Alto-falante riscado: sons desligados. */
export const SoundOffIcon = (): JSX.Element => (
  <Icon>
    <path d="M2.8 6.2h2.3l3.4-2.7v9L5.1 9.8H2.8a.5.5 0 0 1-.5-.5V6.7a.5.5 0 0 1 .5-.5Z" />
    <path d="m10.8 6.3 3.4 3.4M14.2 6.3l-3.4 3.4" />
  </Icon>
)

export const ErrorIcon = (): JSX.Element => (
  <Icon>
    <path d="m5 5 6 6M11 5l-6 6" />
  </Icon>
)

/**
 * Os olhos do avatar em cada humor: "^ ^" feliz, "x x" no erro, fechados no cochilo, os
 * retângulos no resto.
 */
function Eyes({ mood, color = '#a5f3fc' }: { mood: MascotState; color?: string }): JSX.Element {
  const stroke = {
    fill: 'none',
    stroke: color,
    strokeWidth: 2.4,
    strokeLinecap: 'round'
  } as const
  if (mood === 'sleeping') {
    return (
      <g className="avatar-eyes">
        <path d="M52 80 q3.5 3.6 7 0" {...stroke} strokeOpacity={0.6} />
        <path d="M69 80 q3.5 3.6 7 0" {...stroke} strokeOpacity={0.6} />
      </g>
    )
  }
  if (mood === 'happy') {
    return (
      <g className="avatar-eyes">
        <path d="M52 82 l3.5 -5 3.5 5" {...stroke} />
        <path d="M69 82 l3.5 -5 3.5 5" {...stroke} />
      </g>
    )
  }
  if (mood === 'error') {
    return (
      <g className="avatar-eyes">
        <path d="M52.5 76.5 l5 7 m0 -7 l-5 7" {...stroke} stroke="#fda4af" />
        <path d="M70 76.5 l5 7 m0 -7 l-5 7" {...stroke} stroke="#fda4af" />
      </g>
    )
  }
  return (
    <g className="avatar-eyes">
      <rect x="52.5" y="75" width="6" height="10" rx="3" fill={color} />
      <rect x="69.5" y="75" width="6" height="10" rx="3" fill={color} />
    </g>
  )
}

/**
 * O Wisp em miniatura: o mesmo avatar do mascote (a gotinha robô ou o fantasminha). Com `mood`,
 * acompanha o humor do mascote: olhos, a luz de cima e um pouco de movimento (styles/base.css).
 */
export function Avatar({ size, mood = 'idle' }: { size: number; mood?: MascotState }): JSX.Element {
  // Os ids do useId têm caracteres que atrapalham o url(#...) do SVG.
  const id = 'avatar' + useId().replace(/[^\w-]/g, '')
  const avatar = useContext(AvatarContext)
  if (avatar === 'fantasma') {
    return (
      <svg
        className={`avatar avatar-${mood} avatar-ghost`}
        viewBox="33 9 62 97"
        width={size * (62 / 97)}
        height={size}
        aria-hidden
      >
        <defs>
          <linearGradient id={`${id}-shell`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.6" stopColor="#ede9fe" />
            <stop offset="1" stopColor="#c4b5fd" />
          </linearGradient>
        </defs>
        <circle className="avatar-tip" cx="64" cy="27" r="4.2" fill="#67e8f9" />
        <path d={GHOST_PATH} fill={`url(#${id}-shell)`} stroke="#8b7fe8" strokeWidth="1.5" />
        <Eyes mood={mood} color="#2e1065" />
      </svg>
    )
  }
  return (
    <svg
      className={`avatar avatar-${mood}`}
      viewBox="33 9 62 97"
      width={size * (62 / 97)}
      height={size}
      aria-hidden
    >
      <defs>
        <linearGradient id={`${id}-shell`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#99f6e4" />
          <stop offset="0.5" stopColor="#5eead4" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <line x1="64" y1="31" x2="64" y2="17.5" stroke="#0e7490" strokeWidth="2.4" />
      <circle className="avatar-tip" cx="64" cy="15" r="4.2" fill="#67e8f9" />
      <path d={DROP_PATH} fill={`url(#${id}-shell)`} stroke="#0e7490" strokeWidth="1.5" />
      <rect x="45" y="70" width="38" height="20" rx="10" fill="#0b1e26" />
      <Eyes mood={mood} />
      <circle cx="39.4" cy="80" r="3.6" fill="#0e7490" />
      <circle cx="88.6" cy="80" r="3.6" fill="#0e7490" />
    </svg>
  )
}
