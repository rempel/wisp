import { createContext } from 'react'
import { DEFAULT_AVATAR } from '../../shared/avatars'
import type { AvatarName } from '../../shared/avatars'

/** O avatar escolhido (Fase 19), para o do cabeçalho e o do painel vazio acompanharem. */
export const AvatarContext = createContext<AvatarName>(DEFAULT_AVATAR)
