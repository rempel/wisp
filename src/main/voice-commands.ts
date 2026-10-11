import type { AppEntry } from './desktop'
import type { MediaAction } from './media'

// O que o Wisp entende sozinho na voz, sem o Claude e sem internet: tocar, pausar e pular a
// música, mudar o volume e abrir um app (com o card de permissão). E o "não" de um card. O resto
// vai para o Claude. As frases valem inteiras: "abre o Firefox e procura X" não é um comando
// rápido (o app "firefox e procura x" não existe) e vai para o Claude.

export type QuickCommand =
  | { kind: 'media'; action: MediaAction }
  /** Volume do sistema: +1 sobe, -1 desce. */
  | { kind: 'volume'; direction: 1 | -1 }
  /** Abrir um app, pelo nome falado. */
  | { kind: 'open'; name: string }

/** Sem acentos, em minúsculas, sem pontuação, com "Wisp," no começo tirado. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(?:(?:ei|oi|ok|ola|hey) )?wisp /, '')
    .replace(/ (?:por favor|pra mim|para mim|ai)$/, '')
}

const THING = '(?: (?:a|o|essa|esse))? (?:musica|som|player|video|podcast|faixa|cancao)'

const MEDIA: [RegExp, MediaAction][] = [
  [new RegExp(`^(?:pausa|pause|pausar|pausa ai)(?:${THING})?$`), 'pausar'],
  [new RegExp(`^(?:para|pare|parar)${THING}$`), 'pausar'],
  [new RegExp(`^(?:toca|tocar|toque|play|despausa|retoma|volta a tocar)(?:${THING})?$`), 'tocar'],
  [new RegExp(`^(?:continua|continuar|solta)${THING}$`), 'tocar'],
  [
    new RegExp(
      '^(?:(?:proxima|proximo|pula|pular|passa|avanca)(?: (?:a|o|essa|esse))?' +
        '(?: (?:musica|faixa|cancao|video|episodio))?|(?:proxima|proximo) (?:musica|faixa))$'
    ),
    'proxima'
  ],
  [
    new RegExp(
      '^(?:anterior|(?:musica|faixa) anterior|volta(?: uma| a)? (?:musica|faixa)|' +
        'volta pra (?:musica|faixa) anterior)$'
    ),
    'anterior'
  ]
]

const VOLUME_UP =
  /^(?:(?:aumenta|aumentar|aumente|sobe|subir|suba) (?:o )?(?:volume|som)(?: (?:um pouco|mais))?|(?:volume|som)? ?mais alto)$/
const VOLUME_DOWN =
  /^(?:(?:abaixa|abaixar|abaixe|baixa|baixar|diminui|diminuir|diminua|reduz|reduzir) (?:o )?(?:volume|som)(?: (?:um pouco|mais))?|(?:volume|som)? ?mais baixo)$/

const OPEN =
  /^(?:abre|abrir|abra|abri|inicia|iniciar|executa|executar|lanca)(?: (?:o|a|um|uma))?(?: (?:app|aplicativo|programa))?(?: (?:do|da|de|o|a))? (.+)$/

/** O comando rápido de uma frase, ou null (vai para o Claude). */
export function parseQuickCommand(text: string): QuickCommand | null {
  const said = fold(text)
  if (!said) return null
  for (const [pattern, action] of MEDIA) {
    if (pattern.test(said)) return { kind: 'media', action }
  }
  if (VOLUME_UP.test(said)) return { kind: 'volume', direction: 1 }
  if (VOLUME_DOWN.test(said)) return { kind: 'volume', direction: -1 }
  const open = OPEN.exec(said)
  if (open) return { kind: 'open', name: open[1] }
  return null
}

/**
 * O app instalado com esse nome: o nome igual, o id igual (ou o fim dele, como o "firefox" de
 * "org.mozilla.firefox") ou o nome que começa com ele ("Firefox Web Browser"). Mais de um app
 * possível e nenhum com o nome exato: null (o Claude pergunta qual).
 */
export function matchApp(name: string, apps: AppEntry[]): AppEntry | null {
  const wanted = fold(name)
  if (!wanted) return null
  const exact = apps.filter((app) => {
    const id = fold(app.id)
    return fold(app.nome) === wanted || id === wanted || id.endsWith(` ${wanted}`)
  })
  if (exact.length) return exact[0]
  const prefix = apps.filter((app) => fold(app.nome).startsWith(`${wanted} `))
  return prefix.length === 1 ? prefix[0] : null
}

const DENY =
  /^(?:nao|nega|negar|negue|nego|cancela|cancelar|cancele|recusa|recusar|recuse|nem pensar|de jeito nenhum|para|pare)(?: |$)/
const APPROVE =
  /^(?:sim|pode|permite|permitir|permito|permita|aprova|aprovar|aprovo|aprove|libera|liberar|libero|libere|autoriza|autorizo|autorize|confirma|confirmo|ok|okay|beleza|claro|manda ver|vai|isso|faz|faca)(?: |$)/

/** A frase nega um pedido de permissão ("não", "nega", "cancela isso"…). */
export function isDeny(text: string): boolean {
  return DENY.test(fold(text))
}

/** A frase tenta aprovar um pedido ("sim", "pode"…): por voz, isso nunca vale. */
export function isApprove(text: string): boolean {
  return APPROVE.test(fold(text))
}
