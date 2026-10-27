Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class WList {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetClassName(IntPtr h, StringBuilder s, int n);
  public struct RECT { public int Left, Top, Right, Bottom; }

  public static List<string> ForPids(List<uint> pids) {
    var rows = new List<string>();
    EnumWindows((h, l) => {
      int p; GetWindowThreadProcessId(h, out p);
      if (!pids.Contains((uint)p)) return true;
      var cn = new StringBuilder(256);
      GetClassName(h, cn, 256);
      RECT r;
      GetWindowRect(h, out r);
      rows.Add(string.Format("hwnd={0} pid={1} visible={2} class={3} rect={4},{5}->{6},{7} size={8}x{9}",
        h, p, IsWindowVisible(h), cn.ToString(), r.Left, r.Top, r.Right, r.Bottom, r.Right - r.Left, r.Bottom - r.Top));
      return true;
    }, IntPtr.Zero);
    return rows;
  }
}
"@

$pids = @(Get-Process -Name countdown -ErrorAction SilentlyContinue | ForEach-Object { [uint32]$_.Id })
if ($pids.Count -eq 0) { Write-Output "no countdown process"; exit 0 }
$list = New-Object 'System.Collections.Generic.List[uint32]'
foreach ($p in $pids) { $list.Add($p) }
foreach ($row in [WList]::ForPids($list)) {
  Write-Output $row
}
