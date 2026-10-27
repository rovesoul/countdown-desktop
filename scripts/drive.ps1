param(
  [int]$ProcessId = 0,
  [string]$Keys = "",
  [int]$ClickX = -1,
  [int]$ClickY = -1,
  [int]$MoveX = -1,
  [int]$MoveY = -1,
  [switch]$RightClick
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Drv {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, uint d, IntPtr e);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public struct RECT { public int Left, Top, Right, Bottom; }

  public static IntPtr Find(uint pid) {
    IntPtr found = IntPtr.Zero;
    long best = 0;
    EnumWindows((h, l) => {
      int p; GetWindowThreadProcessId(h, out p);
      if (p != pid || !IsWindowVisible(h)) return true;
      RECT r; GetWindowRect(h, out r);
      long area = (long)(r.Right - r.Left) * (r.Bottom - r.Top);
      if (area > best) { best = area; found = h; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@

[void][Drv]::SetProcessDpiAwarenessContext([IntPtr](-4))
$proc = if ($ProcessId -gt 0) { Get-Process -Id $ProcessId -ErrorAction SilentlyContinue } else { Get-Process -Name countdown -ErrorAction SilentlyContinue | Select-Object -First 1 }
if (-not $proc) { Write-Error "process not found: countdown"; exit 1 }
$handle = [Drv]::Find([uint32]$proc.Id)
if ($handle -eq [IntPtr]::Zero) { Write-Error "window not found"; exit 1 }

$rect = New-Object Drv+RECT
[void][Drv]::GetWindowRect($handle, [ref]$rect)
Write-Output "rect=$($rect.Left),$($rect.Top) -> $($rect.Right),$($rect.Bottom) size=$($rect.Right - $rect.Left)x$($rect.Bottom - $rect.Top)"

[void][Drv]::BringWindowToTop($handle)
[void][Drv]::SetForegroundWindow($handle)
Start-Sleep -Milliseconds 300

if ($MoveX -ge 0 -and $MoveY -ge 0) {
  [void][Drv]::SetCursorPos($rect.Left + $MoveX, $rect.Top + $MoveY)
  Start-Sleep -Milliseconds 200
}

if ($ClickX -ge 0 -and $ClickY -ge 0) {
  # make sure the click actually reaches the app and not another window
  [void][Drv]::SetWindowPos($handle, [IntPtr](-1), 0, 0, 0, 0, 0x0001 -bor 0x0002 -bor 0x0010)
  Start-Sleep -Milliseconds 250
  [void][Drv]::SetCursorPos($rect.Left + $ClickX, $rect.Top + $ClickY)
  Start-Sleep -Milliseconds 250
  if ($RightClick) {
    [Drv]::mouse_event(0x0008, 0, 0, 0, [IntPtr]::Zero)
    [Drv]::mouse_event(0x0010, 0, 0, 0, [IntPtr]::Zero)
  } else {
    [Drv]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
    [Drv]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
  }
  Write-Output "clicked at $($rect.Left + $ClickX),$($rect.Top + $ClickY)"
  Start-Sleep -Milliseconds 300
  [void][Drv]::SetWindowPos($handle, [IntPtr](-2), 0, 0, 0, 0, 0x0001 -bor 0x0002 -bor 0x0010)
}

if ($Keys -ne "") {
  [System.Windows.Forms.SendKeys]::SendWait($Keys)
  Write-Output "sent keys: $Keys"
}
