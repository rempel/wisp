// O volume do sistema no Windows (Fase 35): o do aparelho de som padrão, pela API de áudio do
// Windows (Core Audio), chamada de um script fixo do PowerShell. O nível ou o passo vão por
// variável de ambiente.

import { firstLine, runPowerShell } from './powershell'

// As interfaces COM do Core Audio (só os métodos usados; os outros ocupam o lugar na tabela).
// Numa linha só e sem aspas simples: vai dentro de uma string do PowerShell.
export const NATIVE =
  'using System; using System.Runtime.InteropServices; namespace Wisp { ' +
  '[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] ' +
  'interface IAudioEndpointVolume { int f(); int g(); int h(); int i(); ' +
  'int SetMasterVolumeLevelScalar(float nivel, Guid contexto); int j(); ' +
  'int GetMasterVolumeLevelScalar(out float nivel); } ' +
  '[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] ' +
  'interface IMMDevice { int Activate(ref Guid id, int contexto, IntPtr parametros, out IAudioEndpointVolume volume); } ' +
  '[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] ' +
  'interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int fluxo, int papel, out IMMDevice aparelho); } ' +
  '[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { } ' +
  'public static class Som { ' +
  // O aparelho de saída (eRender) padrão para multimídia (eMultimedia); CLSCTX_ALL.
  'public static int Mudar(int nivel, int passo) { ' +
  'var aparelhos = (IMMDeviceEnumerator)new MMDeviceEnumerator(); IMMDevice aparelho; ' +
  'Marshal.ThrowExceptionForHR(aparelhos.GetDefaultAudioEndpoint(0, 1, out aparelho)); ' +
  'var id = typeof(IAudioEndpointVolume).GUID; IAudioEndpointVolume volume; ' +
  'Marshal.ThrowExceptionForHR(aparelho.Activate(ref id, 23, IntPtr.Zero, out volume)); ' +
  'float atual; Marshal.ThrowExceptionForHR(volume.GetMasterVolumeLevelScalar(out atual)); ' +
  'int novo = nivel >= 0 ? nivel : (int)Math.Round(atual * 100) + passo; ' +
  'novo = Math.Max(0, Math.Min(100, novo)); ' +
  'Marshal.ThrowExceptionForHR(volume.SetMasterVolumeLevelScalar(novo / 100f, Guid.Empty)); ' +
  'return novo; } } }'

const SCRIPT =
  `Add-Type -TypeDefinition '${NATIVE}'; ` +
  '[Wisp.Som]::Mudar([int]$env:WISP_NIVEL, [int]$env:WISP_PASSO)'

/**
 * Muda o volume do sistema: para `level` (0 a 100) ou somando `step`. Devolve o novo volume, ou
 * o erro do Windows (sem aparelho de som, por exemplo).
 */
export async function setWindowsVolume(
  change: { level: number } | { step: number }
): Promise<number | { error: string }> {
  const level = 'level' in change ? Math.round(Math.min(100, Math.max(0, change.level))) : -1
  const step = 'step' in change ? Math.round(change.step) : 0
  const result = await runPowerShell(SCRIPT, {
    WISP_NIVEL: String(level),
    WISP_PASSO: String(step)
  })
  const value = Number(result.stdout.trim())
  if (result.code === 0 && Number.isInteger(value)) return value
  const error = firstLine(result.stderr) || `código ${result.code}`
  console.warn(`[wisp] volume: ${error}`)
  return { error }
}
