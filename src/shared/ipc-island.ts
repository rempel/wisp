// A ilha que abre (Fase 37): o que o main manda para a página do mascote quando a ilha está
// ligada (as conversas e sessões ativas, o pedido que espera, a música) e o que ela devolve (os
// botões). Inspirada na ilha do Coucou, com o mascote e o jeito do Wisp.

/**
 * Como a ilha está: recolhida (a cápsula no topo), espiando (o cursor em cima, um pedido: a linha
 * de estado maior) ou aberta (os cartões, os botões).
 */
export type IslandMode = 'compact' | 'peek' | 'open'

/** A tela da ilha aberta. */
export type IslandTab = 'home' | 'settings'

/** Em que pé está uma conversa ou sessão. */
export type IslandTaskState = 'working' | 'waiting' | 'done' | 'error' | 'idle'

/** Um passo (uma ferramenta) numa linha: "Editar app.ts", com +N −M nas edições. */
export interface IslandStep {
  id: string
  label: string
  status: 'running' | 'done' | 'error'
  added?: number
  removed?: number
}

/** Uma conversa do Wisp ou uma sessão do Claude Code no terminal. */
export interface IslandTask {
  /** "c:<conversa>" ou "s:<sessão>". */
  id: string
  kind: 'conversation' | 'session'
  title: string
  state: IslandTaskState
  /** Os últimos passos, do mais antigo para o mais novo. */
  steps: IslandStep[]
  /** O começo da última resposta, quando o turno acabou. */
  reply?: string
  updatedAt: number
}

/** O player em foco (o que toca, ou o último que tocou). */
export interface IslandMusic {
  /** O player: o nome no MPRIS ou o id do app no Windows. */
  id: string
  /** O nome do app ("Spotify"). */
  app: string
  status: 'Playing' | 'Paused' | 'Stopped'
  title?: string
  artist?: string
  album?: string
  /** A capa (data URL). */
  art?: string
  positionMs?: number
  durationMs?: number
  /** Quando a posição foi lida (ms Unix): tocando, a página anda com ela. */
  at: number
  canControl: boolean
  canSeek: boolean
  canNext: boolean
  canPrevious: boolean
  /** null: o player não diz (e não dá para mudar). */
  shuffle: boolean | null
  repeat: IslandRepeat | null
  /** De 0 a 1; null quando não dá para mudar. */
  volume: number | null
  /** De quem é o volume: o do player ou o do sistema (no Windows, os players não mostram o deles). */
  volumeOf: 'player' | 'system'
}

export type IslandRepeat = 'none' | 'track' | 'list'

/** Uma pergunta do Claude (AskUserQuestion), com as opções. */
export interface IslandQuestion {
  question: string
  header?: string
  multiSelect: boolean
  options: { label: string; description?: string }[]
}

/** Um pedido esperando resposta, para o cartão da ilha. */
export interface IslandAlert {
  /** O id do pedido (o do card do painel ou o do hook). */
  id: string
  /** De quem é: o id da conversa ou sessão (o mesmo das pílulas). */
  task: string
  /** O nome da conversa ou do projeto. */
  who: string
  /**
   * 'permission': Negar, Permitir (e Sempre); 'question': as opções; 'panel': só dá para responder
   * no painel (o plano, a confiança numa pasta).
   */
  kind: 'permission' | 'question' | 'panel'
  /** "O Claude quer rodar um comando". */
  title: string
  /** O que está em jogo: o comando, o arquivo, o site. */
  detail: string
  /** O que o "Sempre" libera ("git status"); sem o campo, não há "Sempre". */
  always?: string
  questions?: IslandQuestion[]
  /** Os botões valem a partir daqui (ms Unix): um clique logo que o cartão aparece pode ser outro. */
  armedAt: number
}

/** Os ajustes da ilha (a tela Ajustes dela). */
export interface IslandSettings {
  sound: boolean
  /** De 0 a 1. */
  volume: number
  /** Quantos segundos a ilha aberta espera, depois que o cursor sai, para recolher. */
  autoClose: number
  /** Passar o cursor abre a ilha inteira (sem o clique). */
  hoverOpen: boolean
  /** As capas que os players dão pela internet (no Linux; no Windows elas vêm do sistema). */
  covers: boolean
  /** Mostrar a opção das capas (só no Linux). */
  coversOption: boolean
}

/** Os tempos de recolher que a ilha oferece (segundos). */
export const ISLAND_AUTO_CLOSE = [10, 15, 30] as const

/** Uma ação no player pela ilha. */
export type IslandMusicAction =
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'seek'; ms: number }
  | { type: 'shuffle'; on: boolean }
  | { type: 'repeat'; mode: IslandRepeat }
  | { type: 'volume'; level: number }

/** página → main: um botão da ilha. */
export type IslandAction =
  /** Abre a ilha (o clique na cápsula). */
  | { type: 'open' }
  /** Recolhe (o ⌃): um pedido esperando continua esperando. */
  | { type: 'close' }
  /** Um clique dentro da ilha aberta: ela não recolhe sozinha enquanto o cursor estiver nela. */
  | { type: 'touch' }
  | { type: 'tab'; tab: IslandTab }
  | { type: 'focus'; id: string }
  /** Abre o painel (e recolhe a ilha). */
  | { type: 'panel' }
  /** Abre uma conversa no painel, ou traz o terminal de uma sessão para a frente. */
  | { type: 'show'; task: string }
  | { type: 'decide'; id: string; decision: 'allow' | 'deny' | 'allow-always' }
  | { type: 'answer'; id: string; answers: Record<string, string> }
  /** O pedido no painel ("Ver no painel"). */
  | { type: 'alert-panel'; id: string }
  | { type: 'music'; action: IslandMusicAction }
  | { type: 'settings'; patch: Partial<Omit<IslandSettings, 'coversOption'>> }
  /** As configurações do painel ("Mais configurações…"). */
  | { type: 'more-settings' }

/** A ilha para a página do mascote; null: fora da ilha (o mascote flutuando). */
export type MascotIsland = {
  mode: IslandMode
  /** A linha de estado da cápsula ("pronto!", "esperando você"). */
  title: string
  detail: string
  tone: 'calm' | 'busy' | 'alert' | 'happy'
  tab: IslandTab
  tasks: IslandTask[]
  music: IslandMusic | null
  /** O pedido em frente (o mais antigo), e quantos esperam ao todo. */
  alert: IslandAlert | null
  alerts: number
  /** O que o cartão da esquerda mostra: o id de uma tarefa, "music", ou null (o primeiro). */
  focus: string | null
  /** Quando a ilha aberta recolhe (ms Unix), para a barrinha; null: não vai recolher. */
  closesAt: number | null
  /** Quanto dura a contagem toda (ms), para a barrinha. */
  closeMs: number
  settings: IslandSettings
} | null

/** O id da música entre as pílulas. */
export const MUSIC_ID = 'music'

/** A ilha aberta: a largura e a altura de cada tela (px; o CSS e o recorte da janela usam estes). */
export const ISLAND_OPEN_WIDTH = 640
export const ISLAND_OPEN_HEIGHT = 188
/** A altura máxima da ilha aberta (perguntas com muitas opções). */
export const ISLAND_OPEN_MAX = 320

/** A altura da ilha aberta para o que ela mostra (as perguntas pedem mais). */
export function islandOpenHeight(island: NonNullable<MascotIsland>): number {
  const questions = island.alert?.kind === 'question' ? (island.alert.questions ?? []) : []
  if (!questions.length) return ISLAND_OPEN_HEIGHT
  // Uma linha de título e uma de opções (elas quebram de 3 em 3) por pergunta.
  const rows = questions.reduce((sum, q) => sum + 1 + Math.ceil(q.options.length / 3), 0)
  return Math.min(ISLAND_OPEN_MAX, ISLAND_OPEN_HEIGHT - 60 + rows * 30)
}
