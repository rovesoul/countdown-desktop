import type { Settings } from "./types";

/** One line of the manual: the key on the left, what it does on the right. */
export interface HelpRow {
  key: string;
  text: string;
}

export interface HelpGroup {
  title: string;
  rows: HelpRow[];
}

const HOTKEY_NAMES: Record<string, string> = {
  Super: "Win",
  Meta: "Win",
  Cmd: "Win",
  Command: "Win",
  Control: "Ctrl",
  Alt: "Alt",
  Shift: "Shift",
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
  Space: "空格",
  Enter: "回车",
  Escape: "Esc",
};

/** Turns a stored combo like `Super+Up` into a readable `Win + ↑`. */
export function hotkeyLabel(combo: string): string {
  if (!combo) return "未设置";
  return combo
    .split("+")
    .map((part) => HOTKEY_NAMES[part] ?? part)
    .join(" + ");
}

/** Every way the widget can be operated, grouped by where the control lives. */
export function helpGroups(settings: Settings): HelpGroup[] {
  const hotkeys = settings.hotkeys;
  return [
    {
      title: "顶部按钮",
      rows: [
        { key: "▮", text: "细条模式：收成贴在屏幕边缘的窄条，再点一次展开面板" },
        { key: "图钉", text: "窗口置顶，让它浮在其它窗口上方，再点一次取消" },
        { key: "?", text: "打开这份操作说明" },
        { key: "⚙", text: "设置外观、进度条与快捷键" },
      ],
    },
    {
      title: "进度条",
      rows: [
        { key: "单击", text: "暂停 / 继续" },
        { key: "双击", text: "重置；结束后双击也能停止闪烁" },
      ],
    },
    {
      title: "窗口内按键",
      rows: [
        { key: "空格", text: "暂停 / 继续" },
        { key: "Enter", text: "设定时间" },
        { key: "R", text: "重置" },
        { key: "Esc", text: "关闭当前面板" },
      ],
    },
    {
      title: "全局热键",
      rows: [
        { key: hotkeyLabel(hotkeys.toggle), text: "开始 / 继续" },
        { key: hotkeyLabel(hotkeys.pause), text: "暂停" },
        { key: hotkeyLabel(hotkeys.stop), text: "停止（会先确认）" },
        { key: hotkeyLabel(hotkeys.reset), text: "重置" },
      ],
    },
    {
      title: "右键菜单",
      rows: [
        { key: "计时", text: "设定时间、开始、暂停、停止、重置、停止闪烁" },
        { key: "窗口", text: "窗口置顶、细条模式、靠边吸附、窗口居中" },
        { key: "其它", text: "操作说明、设置、关闭窗口（缩到托盘）、退出程序" },
      ],
    },
    {
      title: "托盘图标",
      rows: [
        { key: "左键", text: "显示 / 隐藏窗口" },
        { key: "右键", text: "打开托盘菜单" },
      ],
    },
    {
      title: "结束提醒",
      rows: [
        { key: "红色闪烁", text: "面板和细条都会闪，并播放提示音" },
        { key: "停止闪烁", text: "点「停止闪烁」按钮，或双击进度条" },
      ],
    },
  ];
}

/** Fills the manual overlay with the shortcuts the user actually configured. */
export function renderHelp(root: HTMLElement, settings: Settings): void {
  root.textContent = "";
  for (const group of helpGroups(settings)) {
    const section = document.createElement("section");
    section.className = "help-group";

    const title = document.createElement("div");
    title.className = "help-title";
    title.textContent = group.title;
    section.appendChild(title);

    for (const row of group.rows) {
      const line = document.createElement("div");
      line.className = "help-row";

      const key = document.createElement("span");
      key.className = "help-key";
      key.textContent = row.key;

      const text = document.createElement("span");
      text.className = "help-text";
      text.textContent = row.text;

      line.append(key, text);
      section.appendChild(line);
    }
    root.appendChild(section);
  }
}
