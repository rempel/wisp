// Os avatares do Wisp (Fase 19): o mascote, a ilha e o avatar do cabeçalho do painel desenham o
// escolhido. O corpo de cada um fica aqui (o mesmo espaço de 128 × 128, com os olhos no mesmo
// lugar, para os olhares, as reações e os acessórios servirem a todos); as cores, no
// styles/avatars.css do mascote. Um avatar novo é uma entrada aqui, um corpo e um bloco de cores.

import { t } from './i18n'

export const AVATARS = ['fogo', 'geleca', 'fantasma'] as const
export type AvatarName = (typeof AVATARS)[number]

/** O avatar de quem não escolheu (Fase 39): o fogo-fátuo, o "wisp" do nome. */
export const DEFAULT_AVATAR: AvatarName = 'fogo'

/** O nome de cada um, no menu e nas configurações. */
export const AVATAR_LABELS: Record<AvatarName, string> = {
  fogo: t('Fogo-fátuo'),
  geleca: t('Geleca'),
  fantasma: t('Fantasminha')
}

/** O fogo-fátuo: a chama de três pontas (a do meio mais alta), com a base redonda. */
export const FLAME_PATH =
  'M 64 104 C 49 104 38 93 38 79 C 38 66 43 57 46 46 C 50 53 54 56 56 55 ' +
  'C 55 44 57 33 62 24 C 66 34 72 41 74 47 C 76 44 78 41 80 37 ' +
  'C 86 48 90 62 90 78 C 90 93 79 104 64 104 Z'

/** O miolo claro da chama, onde fica o rosto. */
export const FLAME_CORE_PATH =
  'M 64 100 C 53 100 46 92 46 82 C 46 72 51 65 56 59 C 58 64 61 66 63 65 ' +
  'C 63 58 65 53 68 49 C 74 57 82 68 82 81 C 82 92 75 100 64 100 Z'

/** A geleca: o corpinho gelatinoso, a cúpula baixa e larga assentada no chão. */
export const BLOB_PATH =
  'M 36 101 C 30 101 29 95 31 89 C 34 71 45 54 64 54 C 83 54 94 71 97 89 ' +
  'C 99 95 98 101 92 101 Z'

/** O fantasminha: a cabeça redonda e a barra de três pontas, com a luz flutuando em cima. */
export const GHOST_PATH =
  'M 40 64 C 40 50.7 50.7 40 64 40 C 77.3 40 88 50.7 88 64 L 88 99 ' +
  'Q 84 108 80 102 Q 76 96 72 102 Q 68 108 64 102 Q 60 96 56 102 ' +
  'Q 52 108 48 102 Q 44 96 40 99 Z'

/** O contorno de cada um: o corpo, a sombra das emoções tristes e o avatar do painel. */
export const AVATAR_PATHS: Record<AvatarName, string> = {
  fogo: FLAME_PATH,
  geleca: BLOB_PATH,
  fantasma: GHOST_PATH
}
