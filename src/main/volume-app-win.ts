// O volume de um aplicativo no Windows (Fase 69): o do mixer de volume, por programa, pela API
// de áudio do Windows (as sessões de áudio do Core Audio), chamada de um script fixo do
// PowerShell. O nome do programa, o nível e o passo vão por variável de ambiente. Se o programa
// não tem uma sessão de áudio aberta (ou algo falha), quem chama recua para o volume do sistema.

import { firstLine, runPowerShell } from './powershell'

// As interfaces COM das sessões de áudio (só os métodos usados; os outros ocupam o lugar na
// tabela, na ordem do Windows). Numa linha só e sem aspas simples: vai numa string do PowerShell.
export const NATIVE =
  'using System; using System.Diagnostics; using System.Runtime.InteropServices; namespace WispApp { ' +
  '[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] ' +
  'interface ISimpleAudioVolume { int SetMasterVolume(float nivel, ref Guid contexto); ' +
  'int GetMasterVolume(out float nivel); } ' +
  // IAudioSessionControl2: os 9 métodos do IAudioSessionControl, 2 identificadores e o processo.
  '[Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] ' +
  'interface IAudioSessionControl2 { int a(); int b(); int c(); int d(); int e(); int f(); int g(); ' +
  'int h(); int i(); int j(); int k(); int GetProcessId(out uint processo); } ' +
  '[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] ' +
  'interface IAudioSessionEnumerator { int GetCount(out int quantas); ' +
  'int GetSession(int indice, out IAudioSessionControl2 sessao); } ' +
  '[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] ' +
  'interface IAudioSessionManager2 { int a(); int b(); ' +
  'int GetSessionEnumerator(out IAudioSessionEnumerator sessoes); } ' +
  '[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] ' +
  'interface IMMDevice { int Activate(ref Guid id, int contexto, IntPtr parametros, ' +
  '[MarshalAs(UnmanagedType.IUnknown)] out object objeto); } ' +
  '[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] ' +
  'interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int fluxo, int papel, out IMMDevice aparelho); } ' +
  '[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { } ' +
  'public static class Som { ' +
  // Devolve o volume novo do programa (0 a 100), ou -1 se ele não tem uma sessão de áudio.
  'public static int Mudar(string programa, int nivel, int passo) { ' +
  'var aparelhos = (IMMDeviceEnumerator)new MMDeviceEnumerator(); IMMDevice aparelho; ' +
  'Marshal.ThrowExceptionForHR(aparelhos.GetDefaultAudioEndpoint(0, 1, out aparelho)); ' +
  'var id = typeof(IAudioSessionManager2).GUID; object objeto; ' +
  'Marshal.ThrowExceptionForHR(aparelho.Activate(ref id, 23, IntPtr.Zero, out objeto)); ' +
  'var gerente = (IAudioSessionManager2)objeto; IAudioSessionEnumerator sessoes; ' +
  'Marshal.ThrowExceptionForHR(gerente.GetSessionEnumerator(out sessoes)); ' +
  'int quantas; Marshal.ThrowExceptionForHR(sessoes.GetCount(out quantas)); int resultado = -1; ' +
  'for (int n = 0; n < quantas; n++) { IAudioSessionControl2 sessao; ' +
  'if (sessoes.GetSession(n, out sessao) != 0 || sessao == null) continue; ' +
  'uint processo; if (sessao.GetProcessId(out processo) != 0 || processo == 0) continue; ' +
  'string nome; try { nome = Process.GetProcessById((int)processo).ProcessName; } catch { continue; } ' +
  'if (!String.Equals(nome, programa, StringComparison.OrdinalIgnoreCase)) continue; ' +
  'var volume = (ISimpleAudioVolume)sessao; float atual; ' +
  'Marshal.ThrowExceptionForHR(volume.GetMasterVolume(out atual)); ' +
  'int novo = nivel >= 0 ? nivel : (int)Math.Round(atual * 100) + passo; ' +
  'novo = Math.Max(0, Math.Min(100, novo)); var contexto = Guid.Empty; ' +
  'Marshal.ThrowExceptionForHR(volume.SetMasterVolume(novo / 100f, ref contexto)); resultado = novo; } ' +
  'return resultado; } } }'

const SCRIPT =
  `Add-Type -TypeDefinition '${NATIVE}'; ` +
  '[WispApp.Som]::Mudar($env:WISP_PROGRAMA, [int]$env:WISP_NIVEL, [int]$env:WISP_PASSO)'

/** O nome do processo de um player (o "Spotify" de "Spotify.exe"); só letras, números, . _ e -. */
export function processNameOf(app: string): string | null {
  const name = app.trim().replace(/\.exe$/i, '')
  return /^[\w.-]{1,80}$/.test(name) ? name : null
}

/**
 * Muda o volume de um programa no mixer do Windows: para `level` (0 a 100) ou somando `step`.
 * Devolve o volume novo; null se o programa não tem uma sessão de áudio (não está tocando) ou
 * se o Windows não deixou: quem chama muda o volume do sistema.
 */
export async function setAppVolume(
  app: string,
  change: { level: number } | { step: number }
): Promise<number | null> {
  const program = processNameOf(app)
  if (!program) return null
  const level = 'level' in change ? Math.round(Math.min(100, Math.max(0, change.level))) : -1
  const step = 'step' in change ? Math.round(change.step) : 0
  const result = await runPowerShell(SCRIPT, {
    WISP_PROGRAMA: program,
    WISP_NIVEL: String(level),
    WISP_PASSO: String(step)
  })
  const value = Number(result.stdout.trim())
  if (result.code === 0 && Number.isInteger(value) && value >= 0) return value
  if (result.code !== 0) {
    console.warn(`[wisp] volume do programa: ${firstLine(result.stderr) || result.code}`)
  }
  return null
}
