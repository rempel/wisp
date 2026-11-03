// Explicar a seleção (Fase 45): um atalho leva o texto selecionado em qualquer programa para uma
// conversa nova, com o pedido de explicar já na caixa (para trocar por "traduza", "corrija"… e
// mandar). No Linux, o texto vem da seleção primária (o que está marcado, sem copiar). No Windows,
// que não tem essa seleção, o Wisp aperta Ctrl+C por você (depois de você soltar as teclas do
// atalho) e devolve a área de transferência como estava.

import { clipboard } from 'electron'
import { IS_WINDOWS } from './platform'
import { runPowerShell } from './powershell'
import type { Notify } from './notify'
import { MAX_CLIPBOARD } from '../shared/prompts'
import { t } from '../shared/i18n'

/** O Ctrl+C do Windows: espera as teclas do atalho subirem (até 1,5 s) e aperta Ctrl+C. */
const COPY_SCRIPT =
  "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; namespace Wisp { " +
  'public static class Copiar { [DllImport("user32.dll")] static extern short GetAsyncKeyState(int k); ' +
  '[DllImport("user32.dll")] static extern void keybd_event(byte v, byte s, int f, UIntPtr e); ' +
  'public static void Agora() { var fim = DateTime.UtcNow.AddMilliseconds(1500); ' +
  'int[] teclas = { 0x10, 0x11, 0x12, 0x5B, 0x5C }; ' +
  'while (DateTime.UtcNow < fim) { bool solta = true; foreach (var k in teclas) if (GetAsyncKeyState(k) < 0) solta = false; ' +
  'if (solta) break; System.Threading.Thread.Sleep(20); } ' +
  'keybd_event(0x11, 0, 0, UIntPtr.Zero); keybd_event(0x43, 0, 0, UIntPtr.Zero); ' +
  "keybd_event(0x43, 0, 2, UIntPtr.Zero); keybd_event(0x11, 0, 2, UIntPtr.Zero); } } }'; " +
  '[Wisp.Copiar]::Agora()'

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** O texto selecionado, ou '' se não há nada (ou não deu para ler). */
export async function readSelection(): Promise<string> {
  if (!IS_WINDOWS) {
    const text = await clipboard.selection?.readText().catch(() => '')
    return (text ?? '').trim().slice(0, MAX_CLIPBOARD)
  }
  // A área de transferência de antes (todos os formatos) volta no fim.
  const saved = await clipboard.read().catch(() => [])
  const marker = `wisp-${Date.now()}`
  await clipboard.writeText(marker)
  let text = ''
  try {
    const result = await runPowerShell(COPY_SCRIPT, {}, 8000)
    if (result.code !== 0) return ''
    // O programa da frente copia quando pode: espera até 1 s pelo texto novo.
    for (let i = 0; i < 20; i++) {
      const now = await clipboard.readText().catch(() => '')
      if (now && now !== marker) {
        text = now
        break
      }
      await wait(50)
    }
  } finally {
    if (saved.length) await clipboard.write(saved).catch(() => clipboard.clear())
    else clipboard.clear()
  }
  return text.trim().slice(0, MAX_CLIPBOARD)
}

/** O pedido que vai para a caixa: explicar o texto (a pessoa troca o pedido antes de mandar). */
export const explainPrompt = (text: string): string =>
  t('Explique, em poucas linhas e sem jargão, o que é isto:\n\n{text}', { text })

/**
 * O atalho: lê a seleção e abre uma conversa nova com o pedido na caixa (sem mandar); sem nada
 * selecionado, uma notificação diz como usar.
 */
export async function explainSelection(
  chat: { newConversation(): void; compose(text: string): void } | null,
  notify: Notify
): Promise<void> {
  const text = await readSelection()
  if (!text) {
    notify(
      t('Nada selecionado'),
      t('Marque um texto em qualquer programa e aperte o atalho de novo.')
    )
    return
  }
  chat?.newConversation()
  chat?.compose(explainPrompt(text))
}
