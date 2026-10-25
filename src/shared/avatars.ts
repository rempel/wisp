// Os avatares do Wisp (Fase 19): o mascote, a ilha e o avatar do cabeçalho do painel desenham o
// escolhido. O corpo de cada um fica aqui (o mesmo espaço de 128 × 128, com os olhos no mesmo
// lugar, para os olhares, as reações e os acessórios servirem a todos); as cores, no
// styles/avatars.css do mascote. Um avatar novo é uma entrada aqui, um corpo e um bloco de cores.

import { t } from './i18n'

export const AVATARS = ['robo', 'fantasma'] as const
export type AvatarName = (typeof AVATARS)[number]

/** O nome de cada um, no menu e nas configurações. */
export const AVATAR_LABELS: Record<AvatarName, string> = {
  robo: t('Robô (a gotinha)'),
  fantasma: t('Fantasminha')
}

/** A gotinha robô: base redonda e ponta para cima, onde a antena encaixa. */
export const DROP_PATH =
  'M 64 30 C 69 41 89 56 89 79 C 89 92.8 77.8 104 64 104 ' +
  'C 50.2 104 39 92.8 39 79 C 39 56 59 41 64 30 Z'

/** O fantasminha: a cabeça redonda e a barra de três pontas, com a luz flutuando em cima. */
export const GHOST_PATH =
  'M 40 64 C 40 50.7 50.7 40 64 40 C 77.3 40 88 50.7 88 64 L 88 99 ' +
  'Q 84 108 80 102 Q 76 96 72 102 Q 68 108 64 102 Q 60 96 56 102 ' +
  'Q 52 108 48 102 Q 44 96 40 99 Z'
