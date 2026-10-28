export type Status = "idle" | "running" | "paused" | "finished";

/** Layout the window settled into, based on its aspect ratio. */
export type Layout = "h" | "v" | "bar";

/** Logical size of the screen the widget is displayed on. */
export interface ScreenSize {
  width: number;
  height: number;
}

export interface Snapshot {
  total: number;
  elapsed: number;
  remaining: number;
  status: Status;
  loopMode: boolean;
  rounds: number;
}

export interface HotkeySettings {
  enabled: boolean;
  toggle: string;
  pause: string;
  stop: string;
  reset: string;
}

export interface Settings {
  theme: string;
  fontFamily: string;
  fontSize: number;
  opacity: number;
  radius: number;
  alwaysOnTop: boolean;
  showLabels: boolean;
  showClock: boolean;
  progressMode: string;
  barStyle: string;
  barThickness: number;
  barRadius: number;
  barSide: string;
  sound: string;
  loopMode: boolean;
  snapToEdge: boolean;
  defaultDuration: number;
  hotkeys: HotkeySettings;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "ink",
  fontFamily: "system",
  fontSize: 44,
  opacity: 1,
  radius: 16,
  alwaysOnTop: false,
  showLabels: true,
  showClock: true,
  progressMode: "elapsed",
  barStyle: "solid",
  barThickness: 1.5,
  barRadius: 60,
  barSide: "right",
  sound: "chime",
  loopMode: false,
  snapToEdge: true,
  defaultDuration: 1500,
  hotkeys: {
    enabled: true,
    toggle: "Super+Up",
    pause: "Super+Down",
    stop: "Super+Left",
    reset: "Super+Right",
  },
};

export const THEMES: [string, string][] = [
  ["ink", "墨水屏"],
  ["midnight", "夜幕"],
  ["neon", "霓虹"],
  ["bamboo", "竹青"],
  ["amber", "琥珀"],
  ["mono", "黑白"],
];

export const FONT_FAMILIES: Record<string, string> = {
  system: 'system-ui, "Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif',
  mono: '"Cascadia Mono", Consolas, "Courier New", monospace',
  serif: 'Georgia, "Songti SC", "SimSun", serif',
  rounded: '"Segoe UI Variable Display", "Microsoft YaHei UI", system-ui, sans-serif',
  condensed: '"Bahnschrift Condensed", "Arial Narrow", Impact, sans-serif',
};

export const FONT_OPTIONS: [string, string][] = [
  ["system", "系统默认"],
  ["mono", "等宽"],
  ["serif", "衬线"],
  ["rounded", "圆体"],
  ["condensed", "窄体"],
];

export const BAR_OPTIONS: [string, string][] = [
  ["solid", "实心"],
  ["gradient", "渐变"],
  ["segments", "分段"],
  ["glow", "辉光"],
];

export const PROGRESS_OPTIONS: [string, string][] = [
  ["elapsed", "已用时间增长"],
  ["remaining", "剩余时间递减"],
];

export const BAR_SIDE_OPTIONS: [string, string][] = [
  ["right", "右侧"],
  ["left", "左侧"],
];

export const SOUND_OPTIONS: [string, string][] = [
  ["chime", "钟声"],
  ["beep", "滴声"],
  ["none", "静音"],
];
