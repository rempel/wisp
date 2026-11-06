// Ditar em qualquer programa (Fase 53): segure o atalho do ditado, fale e solte; o que você disse
// (transcrito na sua máquina, pelo whisper.cpp da voz) passa pelas suas trocas ("dito → escrito")
// e é colado no programa da frente. O texto vai pela área de transferência, com o Ctrl+V apertado
// pelo Wisp (no Linux, pelo xdotool no X11 ou pelo wtype/ydotool no Wayland; no Windows, pelo
// próprio Windows), e a área de transferência volta a ser a de antes logo depois. Sem um jeito de
// apertar o Ctrl+V, o texto fica copiado e uma notificação diz para colar.

import { clipboard } from 'electron'
import { spawn } from 'child_process'
import { IS_WINDOWS } from './platform'
import { runPowerShell } from './powershell'
import { findProgram } from './programs'
import type { Notify } from './notify'
import { applyReplacements } from '../shared/dictation'
import type { Replacement } from '../shared/dictation'
import { t } from '../shared/i18n'

/** O Ctrl+V do Windows: espera as teclas do atalho subirem (até 1,5 s) e aperta Ctrl+V. */
const PASTE_SCRIPT =
  "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; namespace Wisp { " +
  'public static class Colar { [DllImport("user32.dll")] static extern short GetAsyncKeyState(int k); ' +
  '[DllImport("user32.dll")] static extern void keybd_event(byte v, byte s, int f, UIntPtr e); ' +
  'public static void Agora() { var fim = DateTime.UtcNow.AddMilliseconds(1500); ' +
  'int[] teclas = { 0x10, 0x11, 0x12, 0x5B, 0x5C }; ' +
  'while (DateTime.UtcNow < fim) { bool solta = true; foreach (var k in teclas) if (GetAsyncKeyState(k) < 0) solta = false; ' +
  'if (solta) break; System.Threading.Thread.Sleep(20); } ' +
  'keybd_event(0x11, 0, 0, UIntPtr.Zero); keybd_event(0x56, 0, 0, UIntPtr.Zero); ' +
  "keybd_event(0x56, 0, 2, UIntPtr.Zero); keybd_event(0x11, 0, 2, UIntPtr.Zero); } } }'; " +
  '[Wisp.Colar]::Agora()'

/** Quem aperta o Ctrl+V no Linux (null: ninguém instalado). */
export function pasteCommand(
  env: NodeJS.ProcessEnv = process.env
): { command: string; args: string[] } | null {
  if (env.XDG_SESSION_TYPE === 'wayland') {
    const wtype = findProgram('', ['wtype'])
    if (wtype) return { command: wtype, args: ['-M', 'ctrl', 'v', '-m', 'ctrl'] }
    const ydotool = findProgram('', ['ydotool'])
    // 29 é o Ctrl esquerdo e 47 o V (os códigos do kernel).
    if (ydotool) return { command: ydotool, args: ['key', '29:1', '47:1', '47:0', '29:0'] }
  }
  const xdotool = env.DISPLAY ? findProgram('', ['xdotool']) : null
  // --clearmodifiers: o Ctrl+Alt do atalho, ainda apertado, não entra no Ctrl+V.
  return xdotool ? { command: xdotool, args: ['key', '--clearmodifiers', 'ctrl+v'] } : null
}

const run = (command: string, args: string[]): Promise<boolean> =>
  new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true })
    const timer = setTimeout(() => child.kill(), 5000)
    child.on('error', () => resolve(false))
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve(code === 0)
    })
  })

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** O Ctrl+V no Linux; false sem quem o aperte. */
async function pasteOnLinux(): Promise<boolean> {
  const paste = pasteCommand()
  if (!paste) return false
  // As teclas do atalho acabaram de subir: um instante para o programa da frente voltar a ouvir.
  await wait(120)
  return run(paste.command, paste.args)
}

/** Cola o texto no programa da frente; a área de transferência volta como estava. */
export async function dictate(
  said: string,
  replacements: Replacement[],
  notify: Notify
): Promise<void> {
  const text = applyReplacements(said, replacements)
  if (!text) return
  // Todos os formatos de antes (uma imagem também); no X11 a leitura pode vir vazia, e o texto
  // fica de reserva.
  const saved = await clipboard.read().catch(() => [])
  const savedText = await clipboard.readText().catch(() => '')
  await clipboard.writeText(text)
  const pasted = IS_WINDOWS
    ? (await runPowerShell(PASTE_SCRIPT, {}, 8000)).code === 0
    : await pasteOnLinux()
  if (!pasted) {
    notify(
      t('Copiei o que você disse'),
      t(
        'Cole com Ctrl+V. (Para o Wisp colar sozinho no Linux, instale o xdotool, ou o wtype no Wayland.)'
      )
    )
    return
  }
  // O programa lê a área de transferência ao colar: só depois ela volta (se ainda for o ditado).
  await wait(600)
  if ((await clipboard.readText().catch(() => '')) !== text) return
  const back = saved.length
    ? await clipboard
        .write(saved)
        .then(() => true)
        .catch(() => false)
    : false
  // Os formatos voltaram (e, com texto antes, o texto também): pronto.
  if (back && (!savedText || (await clipboard.readText().catch(() => '')) === savedText)) return
  if (savedText) await clipboard.writeText(savedText)
  else clipboard.clear()
}
