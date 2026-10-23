import qrcode from 'qrcode-generator'
import { useMemo } from 'react'
import type { JSX } from 'react'
import { t } from '../../shared/i18n'

/** Um QR code em SVG (o link do pareamento do celular), com a margem que os leitores pedem. */
export function QrCode({ text, size = 168 }: { text: string; size?: number }): JSX.Element {
  const { count, path } = useMemo(() => {
    const code = qrcode(0, 'M')
    code.addData(text, 'Byte')
    code.make()
    const modules = code.getModuleCount()
    let d = ''
    for (let row = 0; row < modules; row++) {
      for (let col = 0; col < modules; col++) {
        if (code.isDark(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`
      }
    }
    return { count: modules + 8, path: d }
  }, [text])
  return (
    <svg
      className="qr-code"
      width={size}
      height={size}
      viewBox={`0 0 ${count} ${count}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={t('QR code do pareamento')}
    >
      <rect width={count} height={count} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}
