param(
  [string]$Process = "countdown",
  [int]$ProcessId = 0,
  [string]$Title = "",
  [string]$Out = "shot.png",
  [int]$Pad = 24
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  public struct RECT { public int Left, Top, Right, Bottom; }

  public static IntPtr Find(uint pid, string title) {
    IntPtr found = IntPtr.Zero;
    long best = 0;
    EnumWindows((h, l) => {
      int p; GetWindowThreadProcessId(h, out p);
      if (p != pid || !IsWindowVisible(h)) return true;
      if (title != "") {
        int len = GetWindowTextLength(h);
        var sb = new StringBuilder(len + 2);
        GetWindowText(h, sb, sb.Capacity);
        if (sb.ToString() != title) return true;
      }
      RECT r; GetWindowRect(h, out r);
      long area = (long)(r.Right - r.Left) * (r.Bottom - r.Top);
      if (area > best) { best = area; found = h; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@

$proc = if ($ProcessId -gt 0) { Get-Process -Id $ProcessId -ErrorAction SilentlyContinue } else { Get-Process -Name $Process -ErrorAction SilentlyContinue | Select-Object -First 1 }
if (-not $proc) { Write-Error "process not found: $Process"; exit 1 }
[void][Win]::SetProcessDpiAwarenessContext([IntPtr](-4))
$handle = [Win]::Find([uint32]$proc.Id, $Title)
if ($handle -eq [IntPtr]::Zero) { Write-Error "window not found for $Process"; exit 1 }
[void][Win]::SetForegroundWindow($handle)
Start-Sleep -Milliseconds 500

$rect = New-Object Win+RECT
[void][Win]::GetWindowRect($handle, [ref]$rect)
$width = $rect.Right - $rect.Left + $Pad * 2
$height = $rect.Bottom - $rect.Top + $Pad * 2

$bmp = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$dc = $graphics.GetHdc()
[void][Win]::PrintWindow($handle, $dc, 2)
$graphics.ReleaseHdc($dc)
$graphics.Dispose()

$path = Join-Path (Get-Location) $Out
$bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "saved $path ($width x $height)"
