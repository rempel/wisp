// Miniaturas de imagens anexadas, usadas pelo painel e pelo mascote (arquivos soltos nele).

/** Lado da miniatura em px (o dobro do tamanho na tela, para telas HiDPI). */
const THUMB_PX = 128

/**
 * Miniatura quadrada (corte central) num data URL pequeno. Sem object URLs: o CSP das páginas
 * só aceita imagens data:. Formatos que o Chromium não decodifica (HEIC, TIFF, SVG) viram chip.
 */
export async function makeThumbnail(file: File): Promise<string | undefined> {
  if (!file.type.startsWith('image/')) return undefined
  try {
    const bitmap = await createImageBitmap(file)
    const side = Math.min(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = Math.max(1, Math.min(THUMB_PX, side))
    canvas
      .getContext('2d')
      ?.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        canvas.width,
        canvas.height
      )
    bitmap.close()
    return canvas.toDataURL('image/webp', 0.85)
  } catch {
    return undefined
  }
}
