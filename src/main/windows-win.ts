// As janelas dos outros apps no Windows (Fase 35): listar e trazer para a frente, pelas funções do
// próprio Windows (user32), chamadas de um script fixo do PowerShell. A lista é a da barra de
// tarefas: as janelas visíveis, com título, sem dona, que não são de ferramenta nem estão
// escondidas pelo Windows (as de outra área de trabalho virtual), da mais à frente para a mais
// atrás. Só roda quando pedem.

import { firstLine, powerShellJson, runPowerShell } from './powershell'

/** O que o script devolve de cada janela. */
export interface RawWindow {
  id: number
  pid: number
  app: string | null
  title: string
  minimized: boolean
  active: boolean
}

// O código C# das funções do Windows (compilado pelo Add-Type a cada vez, em menos de um segundo).
// Numa linha só e sem aspas simples: vai dentro de uma string do PowerShell.
const NATIVE =
  'using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text; ' +
  'namespace Wisp { public static class Janelas { ' +
  'delegate bool Visita(IntPtr h, IntPtr p); ' +
  '[DllImport("user32.dll")] static extern bool EnumWindows(Visita f, IntPtr p); ' +
  '[DllImport("user32.dll")] static extern bool IsWindow(IntPtr h); ' +
  '[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h); ' +
  '[DllImport("user32.dll")] static extern bool IsIconic(IntPtr h); ' +
  '[DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n); ' +
  '[DllImport("user32.dll")] static extern int GetWindowTextLengthW(IntPtr h); ' +
  '[DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassNameW(IntPtr h, StringBuilder s, int n); ' +
  '[DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid); ' +
  '[DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint c); ' +
  '[DllImport("user32.dll")] static extern int GetWindowLongW(IntPtr h, int i); ' +
  '[DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s); ' +
  '[DllImport("user32.dll")] static extern IntPtr GetForegroundWindow(); ' +
  '[DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h); ' +
  '[DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h); ' +
  '[DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c); ' +
  '[DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool c); ' +
  '[DllImport("kernel32.dll")] static extern uint GetCurrentThreadId(); ' +
  'public class Janela { public long Id; public uint Processo; public string Titulo; public bool Minimizada; public bool Ativa; } ' +
  'public static List<Janela> Listar() { ' +
  'var lista = new List<Janela>(); var ativa = GetForegroundWindow(); ' +
  'EnumWindows(delegate (IntPtr h, IntPtr p) { ' +
  // Só as da barra de tarefas: visíveis, sem dona (GW_OWNER), sem WS_EX_TOOLWINDOW, não
  // escondidas pelo DWM (DWMWA_CLOAKED) e com título; e não a área de trabalho.
  'if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return true; ' +
  'if ((GetWindowLongW(h, -20) & 0x80) != 0) return true; ' +
  'int escondida; if (DwmGetWindowAttribute(h, 14, out escondida, 4) == 0 && escondida != 0) return true; ' +
  'int n = GetWindowTextLengthW(h); if (n == 0) return true; ' +
  'var classe = new StringBuilder(64); GetClassNameW(h, classe, 64); ' +
  'if (classe.ToString() == "Progman" || classe.ToString() == "WorkerW") return true; ' +
  'var titulo = new StringBuilder(n + 1); GetWindowTextW(h, titulo, n + 1); ' +
  'uint processo; GetWindowThreadProcessId(h, out processo); ' +
  'lista.Add(new Janela { Id = h.ToInt64(), Processo = processo, Titulo = titulo.ToString(), Minimizada = IsIconic(h), Ativa = h == ativa }); ' +
  'return true; }, IntPtr.Zero); ' +
  'return lista; } ' +
  // Tira do minimizado e traz para a frente. Junto da fila de entrada da janela da frente, o
  // Windows deixa trocar (sem isso, a janela só pisca na barra de tarefas).
  'public static bool Ativar(long id) { ' +
  'var h = new IntPtr(id); if (!IsWindow(h)) return false; ' +
  'if (IsIconic(h)) ShowWindow(h, 9); ' +
  'uint processo; uint dela = GetWindowThreadProcessId(GetForegroundWindow(), out processo); ' +
  'uint minha = GetCurrentThreadId(); ' +
  'bool junto = dela != 0 && dela != minha && AttachThreadInput(minha, dela, true); ' +
  'BringWindowToTop(h); SetForegroundWindow(h); ' +
  'if (junto) AttachThreadInput(minha, dela, false); ' +
  'return GetForegroundWindow() == h; } } }'

const LOAD = `Add-Type -TypeDefinition '${NATIVE}'; `

/** As janelas, sem as do processo WISP_SELF; o nome do app vem da descrição do executável. */
const LIST =
  LOAD +
  '$nomes = @{}; ' +
  '$saida = foreach ($j in [Wisp.Janelas]::Listar()) { ' +
  'if ($j.Processo -eq [uint32]$env:WISP_SELF) { continue }; ' +
  'if (-not $nomes.ContainsKey($j.Processo)) { ' +
  '$nome = $null; $p = Get-Process -Id $j.Processo -ErrorAction SilentlyContinue; ' +
  'if ($p) { try { $nome = $p.MainModule.FileVersionInfo.FileDescription } catch {}; ' +
  'if (-not $nome) { $nome = $p.ProcessName } }; ' +
  '$nomes[$j.Processo] = $nome }; ' +
  '[pscustomobject]@{ id = $j.Id; pid = $j.Processo; app = $nomes[$j.Processo]; ' +
  'title = $j.Titulo; minimized = $j.Minimizada; active = $j.Ativa } }; ' +
  'ConvertTo-Json -InputObject @($saida) -Compress'

const ACTIVATE =
  LOAD + "if ([Wisp.Janelas]::Ativar([long]$env:WISP_JANELA)) { 'ok' } else { 'nao' }"

/** As janelas abertas (da mais à frente para a mais atrás), sem as do processo `self`. */
export async function windowsWindows(self = process.pid): Promise<RawWindow[] | null> {
  const found = await powerShellJson<RawWindow[]>(LIST, { WISP_SELF: String(self) })
  return Array.isArray(found) ? found.filter(isWindow) : null
}

/** Traz a janela para a frente; false se o Windows não deixou (ou ela fechou). */
export async function activateWindowsWindow(id: number): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id <= 0) return false
  const result = await runPowerShell(ACTIVATE, { WISP_JANELA: String(id) })
  if (result.code !== 0) console.warn(`[wisp] janela: ${firstLine(result.stderr)}`)
  return result.code === 0 && result.stdout.trim() === 'ok'
}

const isWindow = (value: unknown): value is RawWindow => {
  const window = value as RawWindow
  return (
    typeof window === 'object' &&
    window !== null &&
    Number.isSafeInteger(window.id) &&
    typeof window.title === 'string'
  )
}
