// O resumo da semana em imagem (Fase 52): um PNG de 1080 × 1350 para compartilhar, só com as
// contagens (nada de títulos de conversa, projetos nem apps abertos), desenhado num canvas.
import type { WeekSummary } from '../../shared/ipc'
import { dateLocale, t } from '../../shared/i18n'

export const WEEK_IMAGE = { width: 1080, height: 1350 }

/** "1 h 20 min", "45 min", "—". */
function minutes(total: number): string {
  if (total < 1) return '—'
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? t('{h} h {m} min', { h, m }) : `${h} h`
}

/** As linhas da imagem: os quatro números e o que mais foi usado. */
export function weekImageLines(week: WeekSummary): { value: string; label: string }[] {
  return [
    {
      value: String(week.conversations),
      label: week.conversations === 1 ? t('conversa') : t('conversas')
    },
    { value: minutes(week.claudeMinutes), label: t('o Claude trabalhando') },
    { value: `+${week.added} −${week.removed}`, label: t('linhas editadas') },
    { value: String(week.approved), label: t('pedidos aprovados') }
  ]
}

/** Desenha o resumo e devolve o PNG. */
export async function weekImage(week: WeekSummary): Promise<ArrayBuffer> {
  const { width, height } = WEEK_IMAGE
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(t('O painel não conseguiu desenhar a imagem.'))
  const background = ctx.createLinearGradient(0, 0, 0, height)
  background.addColorStop(0, '#0b1418')
  background.addColorStop(1, '#0e3a44')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)
  // A chama do Wisp, simples, no alto.
  ctx.fillStyle = '#67e8f9'
  ctx.beginPath()
  ctx.ellipse(width / 2, 210, 70, 95, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#0b1418'
  ctx.beginPath()
  ctx.arc(width / 2 - 24, 215, 10, 0, Math.PI * 2)
  ctx.arc(width / 2 + 24, 215, 10, 0, Math.PI * 2)
  ctx.fill()
  const day = new Intl.DateTimeFormat(dateLocale(), { day: '2-digit', month: 'short' })
  ctx.textAlign = 'center'
  ctx.fillStyle = '#e6f6f9'
  ctx.font = '600 64px sans-serif'
  ctx.fillText(t('Minha semana com o Wisp'), width / 2, 400)
  ctx.fillStyle = '#9cc7cf'
  ctx.font = '36px sans-serif'
  ctx.fillText(`${day.format(week.from)} – ${day.format(week.to - 1)}`, width / 2, 460)
  weekImageLines(week).forEach((line, index) => {
    const y = 600 + index * 165
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 88px sans-serif'
    ctx.fillText(line.value, width / 2, y)
    ctx.fillStyle = '#9cc7cf'
    ctx.font = '34px sans-serif'
    ctx.fillText(line.label, width / 2, y + 48)
  })
  if (week.tools.length) {
    ctx.fillStyle = '#c8e7ec'
    ctx.font = '32px sans-serif'
    const tools = week.tools
      .slice(0, 3)
      .map(([name]) => name)
      .join(' · ')
    ctx.fillText(t('Mais usadas: {tools}', { tools }), width / 2, 1270)
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error(t('O painel não conseguiu desenhar a imagem.'))
  return blob.arrayBuffer()
}
