import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles.css";
import { formatClock, formatDuration, splitDuration } from "./format";
import { renderHelp } from "./help";
import { playFinish, primeAudio } from "./sound";
import { renderSettings } from "./settings";
import {
  DEFAULT_SETTINGS,
  FONT_FAMILIES,
  type Layout,
  type ScreenSize,
  type Settings,
  type Snapshot,
  type Status,
} from "./types";

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少节点 #${id}`);
  return node as T;
};

const app = el("app");
const clock = el("clock");
const mini = el("mini");
const fill = el("fill");
const elapsedText = el("elapsedText");
const remainText = el("remainText");
const statusText = el("statusText");
const roundText = el("roundText");
const track = el("track");
const btnStart = el<HTMLButtonElement>("btnStart");
const btnSet = el<HTMLButtonElement>("btnSet");
const btnFlash = el<HTMLButtonElement>("btnFlash");
const btnBar = el<HTMLButtonElement>("btnBar");
const btnTop = el<HTMLButtonElement>("btnTop");
const btnSettings = el<HTMLButtonElement>("btnSettings");
const btnHelp = el<HTMLButtonElement>("btnHelp");
const gripLeft = el("gripLeft");
const gripRight = el("gripRight");
const setOverlay = el("setOverlay");
const settingsOverlay = el("settingsOverlay");
const confirmOverlay = el("confirmOverlay");
const confirmTitle = el("confirmTitle");
const confirmText = el("confirmText");
const confirmOk = el<HTMLButtonElement>("confirmOk");
const confirmCancel = el<HTMLButtonElement>("confirmCancel");
const settingsGrid = el("settingsGrid");
const settingsClose = el<HTMLButtonElement>("settingsClose");
const settingsReset = el<HTMLButtonElement>("settingsReset");
const helpOverlay = el("helpOverlay");
const helpBody = el("helpBody");
const helpClose = el<HTMLButtonElement>("helpClose");
const ctxMenu = el("ctxMenu");
const toastEl = el("toast");
const inHours = el<HTMLInputElement>("inHours");
const inMinutes = el<HTMLInputElement>("inMinutes");
const inSeconds = el<HTMLInputElement>("inSeconds");
const chkLoop = el<HTMLInputElement>("chkLoop");
const presetRow = el("presetRow");
const setStart = el<HTMLButtonElement>("setStart");
const setCancel = el<HTMLButtonElement>("setCancel");

let settings: Settings = structuredClone(DEFAULT_SETTINGS);
let snapshot: Snapshot = {
  total: DEFAULT_SETTINGS.defaultDuration,
  elapsed: 0,
  remaining: DEFAULT_SETTINGS.defaultDuration,
  status: "idle",
  loopMode: false,
  rounds: 0,
};
let layout: Layout = "h";
let screenSize: ScreenSize = { width: 1920, height: 1080 };
let saveTimer: number | undefined;
let toastTimer: number | undefined;
let clickTimer: number | undefined;
let confirmAction: (() => void) | null = null;
let screenTimer: number | undefined;
/** Set when the slim bar was expanded, so the settings can put it back. */
let restoreBarMode = false;
/** Set once the user silences the red blinking after a countdown ended. */
let flashMuted = false;

/** Live state the settings panel needs to translate percentages into pixels. */
const settingsContext = {
  screen: () => screenSize,
  layout: () => layout,
};

// ------------------------------------------------------------------ helpers

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T | undefined> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    console.error(command, error);
    toast(String(error));
    return undefined;
  }
}

function toast(message: string): void {
  toastEl.textContent = message;
  toastEl.hidden = false;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.hidden = true;
  }, 1900);
}

function statusLabel(status: Status): string {
  switch (status) {
    case "running":
      return "进行中";
    case "paused":
      return "已暂停";
    case "finished":
      return "时间到";
    default:
      return "待机";
  }
}

function startLabel(status: Status): string {
  switch (status) {
    case "running":
      return "暂停";
    case "paused":
      return "继续";
    default:
      return "开始";
  }
}

// ----------------------------------------------------------------- settings

function applySettings(): void {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.style.setProperty("--fs", `${settings.fontSize}px`);
  root.style.setProperty("--opacity", String(settings.opacity));
  root.style.setProperty("--radius", `${settings.radius}px`);
  root.style.setProperty("--bar-radius", `${settings.barRadius}px`);
  root.style.setProperty(
    "--font",
    FONT_FAMILIES[settings.fontFamily] ?? FONT_FAMILIES.system,
  );
  root.classList.toggle("hide-labels", !settings.showLabels);
  root.classList.toggle("hide-clock", !settings.showClock);
  app.dataset.bar = settings.barStyle;
  applyBarSize();
}

/**
 * Translates the "progress bar thickness" percentage into pixels.
 *
 * The vertical layout measures the bar against the screen width, the
 * horizontal one against the screen height, so a single number controls
 * both directions.
 */
function applyBarSize(): void {
  const ratio = settings.barThickness / 100;
  const base = layout === "h" ? screenSize.height : screenSize.width;
  const thickness = Math.max(2, base * ratio);
  const root = document.documentElement;
  root.style.setProperty("--bar-size", `${thickness.toFixed(1)}px`);
  root.style.setProperty("--seg", `${Math.max(4, thickness / 4).toFixed(1)}px`);
}

/** Reads the size of the screen the widget is on, used by the bar thickness. */
async function refreshScreenSize(): Promise<void> {
  const metrics = await call<ScreenSize>("screen_size");
  if (!metrics) return;
  if (metrics.width === screenSize.width && metrics.height === screenSize.height) {
    return;
  }
  screenSize = metrics;
  applyBarSize();
}

function patchSettings(mutate: (draft: Settings) => void): void {
  mutate(settings);
  applySettings();
  scheduleSave();
}

function scheduleSave(): void {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    void call("save_settings", { settings }).then(() => refreshHotkeyWarnings());
  }, 250);
}

/** Writes the settings out right away, e.g. when a panel closes. */
async function flushSave(): Promise<void> {
  if (saveTimer) {
    window.clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  await call("save_settings", { settings }).then(() => refreshHotkeyWarnings());
}

/** Surfaces hotkeys that could not be grabbed (another program owns them). */
async function refreshHotkeyWarnings(): Promise<void> {
  const warnings = await call<string[]>("hotkey_warnings");
  if (warnings && warnings.length > 0) {
    toast(warnings.join("；"));
  }
}

// ------------------------------------------------------------------ drawing

function render(): void {
  const total = Math.max(snapshot.total, 0);
  const elapsed = Math.min(Math.max(snapshot.elapsed, 0), total);
  const remaining = Math.max(snapshot.remaining, 0);
  const ratio =
    total > 0
      ? settings.progressMode === "remaining"
        ? remaining / total
        : elapsed / total
      : 0;
  const percent = `${(Math.min(Math.max(ratio, 0), 1) * 100).toFixed(2)}%`;

  clock.textContent = formatClock(remaining);
  mini.textContent = formatClock(remaining);
  elapsedText.textContent = formatDuration(elapsed);
  remainText.textContent = formatDuration(remaining);

  if (layout === "h") {
    fill.style.width = percent;
    fill.style.height = "100%";
  } else {
    fill.style.height = percent;
    fill.style.width = "100%";
  }

  app.dataset.status = snapshot.status;
  // the window keeps blinking red for as long as the countdown is over,
  // until the user silences it
  const finished = snapshot.status === "finished";
  if (!finished) flashMuted = false;
  app.classList.toggle("flash", finished && !flashMuted);
  btnFlash.hidden = !finished;
  btnFlash.textContent = flashMuted ? "继续闪烁" : "停止闪烁";
  statusText.textContent = statusLabel(snapshot.status);
  roundText.textContent = snapshot.rounds > 0 ? `第 ${snapshot.rounds + 1} 轮` : "";
  btnStart.textContent = startLabel(snapshot.status);
  btnTop.classList.toggle("is-active", settings.alwaysOnTop);
  btnTop.title = settings.alwaysOnTop ? "取消窗口置顶" : "窗口置顶";
}

function updateLayout(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const next: Layout = width < 90 ? "bar" : width > height ? "h" : "v";
  if (next !== layout) {
    layout = next;
    render();
  }
  app.dataset.layout = next;
  applyBarSize();
}

// ------------------------------------------------------------------ actions

async function toggleRun(): Promise<void> {
  if (snapshot.status === "running") {
    await call("pause");
  } else if (snapshot.status === "paused") {
    await call("resume");
  } else {
    if (snapshot.total <= 0) {
      await call("set_duration", { seconds: settings.defaultDuration });
    }
    await call("start");
  }
}

async function runAction(action: string): Promise<void> {
  switch (action) {
    case "set":
      openSetPanel();
      break;
    case "toggleRun":
      await toggleRun();
      break;
    case "toggle":
      await toggleRun();
      break;
    case "pause":
      await call("pause");
      break;
    case "resume":
      await call("resume");
      break;
    case "stop":
      openConfirm("停止倒计时？", "当前进度会被清零，倒计时回到待机状态。", () => {
        void call("stop");
      });
      break;
    case "flash":
      flashMuted = !flashMuted;
      render();
      break;
    case "hide":
      await call("hide_window");
      break;
    case "reset":
      await call("reset");
      break;
    case "bar":
      restoreBarMode = false;
      await call("set_bar_mode", { enabled: layout !== "bar" });
      break;
    case "dock":
      await call("dock_side", { side: settings.barSide });
      break;
    case "center":
      await call("center_window");
      break;
    case "top": {
      const next = !settings.alwaysOnTop;
      await call("set_always_on_top", { value: next });
      patchSettings((draft) => {
        draft.alwaysOnTop = next;
      });
      render();
      break;
    }
    case "settings":
      void openSettings();
      break;
    case "help":
      void openHelp();
      break;
    case "quit":
      await call("quit_app");
      break;
    default:
      break;
  }
}

// ----------------------------------------------------------------- overlays

function readDuration(): number {
  const hours = clampInt(inHours.value, 0, 99);
  const minutes = clampInt(inMinutes.value, 0, 59);
  const seconds = clampInt(inSeconds.value, 0, 59);
  return hours * 3600 + minutes * 60 + seconds;
}

function clampInt(raw: string, min: number, max: number): number {
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function openSetPanel(): void {
  const [hours, minutes, seconds] = splitDuration(
    snapshot.total > 0 ? snapshot.total : settings.defaultDuration,
  );
  inHours.value = String(hours);
  inMinutes.value = String(minutes);
  inSeconds.value = String(seconds);
  chkLoop.checked = settings.loopMode;
  closeCtxMenu();
  setOverlay.hidden = false;
  inMinutes.focus();
  inMinutes.select();
}

async function openSettings(): Promise<void> {
  if (!settingsOverlay.hidden) return;
  // growing the window while keeping it on screen makes the panel reachable
  // even when the widget is docked against an edge
  await call("enter_panel_mode", { width: 460, height: 450 });
  renderSettings(settingsGrid, settings, patchSettings, settingsContext);
  settingsOverlay.hidden = false;
}

async function closeSettings(): Promise<void> {
  if (settingsOverlay.hidden) return;
  settingsOverlay.hidden = true;
  // persist first, so a new bar side takes effect right away
  await flushSave();
  await leavePanelMode();
}

async function openHelp(): Promise<void> {
  if (!helpOverlay.hidden) return;
  // the manual needs more room than the widget itself
  await call("enter_panel_mode", { width: 520, height: 560 });
  renderHelp(helpBody, settings);
  helpOverlay.hidden = false;
}

async function closeHelp(): Promise<void> {
  if (helpOverlay.hidden) return;
  helpOverlay.hidden = true;
  await leavePanelMode();
}

/**
 * Shrinks the window back to the size it had before a panel was opened and
 * restores the slim bar whenever the panel was opened from it.
 */
async function leavePanelMode(): Promise<void> {
  if (restoreBarMode) {
    restoreBarMode = false;
    await call("exit_panel_mode");
    await call("set_bar_mode", { enabled: true });
    return;
  }
  await call("exit_panel_mode");
}

function openConfirm(title: string, text: string, action: () => void): void {
  confirmTitle.textContent = title;
  confirmText.textContent = text;
  confirmAction = action;
  closeCtxMenu();
  confirmOverlay.hidden = false;
}

function closeConfirm(): void {
  confirmOverlay.hidden = true;
  confirmAction = null;
}

// ------------------------------------------------------------- context menu

interface CtxItem {
  label?: string;
  action?: string;
  hint?: string;
  danger?: boolean;
  checked?: boolean;
  separator?: boolean;
}

function openCtxMenu(x: number, y: number): void {
  const items: CtxItem[] = [];
  if (snapshot.status === "running") {
    items.push({ label: "暂停", action: "pause" });
    items.push({ label: "停止…", action: "stop", danger: true });
  } else if (snapshot.status === "paused") {
    items.push({ label: "继续", action: "toggleRun" });
    items.push({ label: "停止…", action: "stop", danger: true });
  } else {
    items.push({ label: "设定时间…", action: "set" });
    items.push({ label: "开始", action: "toggleRun" });
  }
  if (snapshot.status === "finished") {
    items.push({
      label: flashMuted ? "继续闪烁" : "停止闪烁",
      action: "flash",
    });
  }
  items.push({ separator: true });
  items.push({
    label: settings.alwaysOnTop ? "取消窗口置顶" : "窗口置顶",
    action: "top",
    checked: settings.alwaysOnTop,
  });
  items.push({ label: "重置", action: "reset" });
  items.push({ separator: true });
  items.push({
    label: layout === "bar" ? "展开为面板" : "细条模式",
    action: "bar",
  });
  items.push({
    label: settings.barSide === "left" ? "靠左吸附" : "靠右吸附",
    action: "dock",
  });
  items.push({ label: "窗口居中", action: "center" });
  items.push({ separator: true });
  items.push({ label: "操作说明…", action: "help" });
  items.push({ label: "设置…", action: "settings" });
  items.push({ label: "关闭窗口", action: "hide", hint: "缩到托盘" });
  items.push({ label: "退出程序", action: "quit", danger: true });

  ctxMenu.textContent = "";
  for (const item of items) {
    if (item.separator) {
      const separator = document.createElement("div");
      separator.className = "ctx-sep";
      ctxMenu.appendChild(separator);
      continue;
    }
    const button = document.createElement("button");
    button.className = item.danger ? "ctx-item is-danger" : "ctx-item";
    const label = document.createElement("span");
    label.className = "ctx-label";
    label.textContent = item.label ?? "";
    button.appendChild(label);
    if (item.checked !== undefined) {
      button.setAttribute("aria-checked", String(item.checked));
    }
    if (item.hint) {
      const hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = item.hint;
      button.appendChild(hint);
    }
    button.addEventListener("click", () => {
      closeCtxMenu();
      if (item.action) void runAction(item.action);
    });
    ctxMenu.appendChild(button);
  }

  ctxMenu.hidden = false;
  const rect = ctxMenu.getBoundingClientRect();
  ctxMenu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - rect.width - 6))}px`;
  ctxMenu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - rect.height - 6))}px`;
}

/**
 * Opens the context menu. The slim bar is too narrow to host a menu, so it is
 * expanded into a panel first.
 */
async function openCtxMenuAt(x: number, y: number): Promise<void> {
  if (window.innerWidth < 190) {
    // remember the slim bar so closing the settings can restore it
    restoreBarMode = layout === "bar";
    await call("set_bar_mode", { enabled: false });
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }
  openCtxMenu(x, y);
}

function closeCtxMenu(): void {
  ctxMenu.hidden = true;
}

// --------------------------------------------------------------------- init

function bindEvents(): void {
  btnSet.addEventListener("click", () => openSetPanel());
  btnStart.addEventListener("click", () => void toggleRun());
  btnFlash.addEventListener("click", () => void runAction("flash"));
  btnTop.addEventListener("click", () => void runAction("top"));
  btnSettings.addEventListener("click", () => void openSettings());
  btnHelp.addEventListener("click", () => void openHelp());
  btnBar.addEventListener("click", () =>
    void runAction(layout === "bar" ? "bar" : "bar"),
  );

  setCancel.addEventListener("click", () => {
    setOverlay.hidden = true;
  });
  setStart.addEventListener("click", async () => {
    const seconds = readDuration();
    if (seconds <= 0) {
      toast("请输入大于 0 的时间");
      return;
    }
    await call("set_duration", { seconds });
    await call("set_loop", { enabled: chkLoop.checked });
    patchSettings((draft) => {
      draft.loopMode = chkLoop.checked;
      draft.defaultDuration = seconds;
    });
    setOverlay.hidden = true;
    await call("start");
  });

  settingsClose.addEventListener("click", () => void closeSettings());
  helpClose.addEventListener("click", () => void closeHelp());
  settingsReset.addEventListener("click", () => {
    settings = structuredClone(DEFAULT_SETTINGS);
    applySettings();
    renderSettings(settingsGrid, settings, patchSettings, settingsContext);
    scheduleSave();
    void call("set_always_on_top", { value: settings.alwaysOnTop });
    toast("已恢复默认设置");
  });

  confirmCancel.addEventListener("click", () => closeConfirm());
  confirmOk.addEventListener("click", () => {
    const action = confirmAction;
    closeConfirm();
    action?.();
  });

  gripLeft.addEventListener("mousedown", (event) => {
    event.preventDefault();
    void getCurrentWindow().startResizeDragging("West").catch((error) => {
      console.error(error);
    });
  });
  gripRight.addEventListener("mousedown", (event) => {
    event.preventDefault();
    void getCurrentWindow().startResizeDragging("East").catch((error) => {
      console.error(error);
    });
  });

  track.addEventListener("click", () => {
    if (clickTimer) window.clearTimeout(clickTimer);
    clickTimer = window.setTimeout(() => void toggleRun(), 180);
  });
  track.addEventListener("dblclick", () => {
    if (clickTimer) window.clearTimeout(clickTimer);
    void call("reset");
  });

  document.addEventListener("contextmenu", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".overlay")) return;
    event.preventDefault();
    void openCtxMenuAt(event.clientX, event.clientY);
  });

  document.addEventListener("pointerdown", (event) => {
    primeAudio();
    const target = event.target as HTMLElement | null;
    if (!target?.closest(".ctx-menu")) closeCtxMenu();
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
      return;
    }
    if (event.key === "Escape") {
      closeCtxMenu();
      setOverlay.hidden = true;
      void closeSettings();
      void closeHelp();
      closeConfirm();
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      void toggleRun();
    } else if (event.key === "Enter") {
      event.preventDefault();
      openSetPanel();
    } else if (event.key.toLowerCase() === "r") {
      void call("reset");
    }
  });

  window.addEventListener("resize", () => {
    updateLayout();
    if (screenTimer) window.clearTimeout(screenTimer);
    screenTimer = window.setTimeout(() => void refreshScreenSize(), 200);
  });
  window.addEventListener("blur", closeCtxMenu);

  for (const minutes of [1, 3, 5, 10, 15, 25, 45, 60, 90]) {
    const button = document.createElement("button");
    button.className = "preset";
    button.textContent = minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`;
    button.addEventListener("click", () => {
      inHours.value = String(Math.floor(minutes / 60));
      inMinutes.value = String(minutes % 60);
      inSeconds.value = "0";
    });
    presetRow.appendChild(button);
  }
}

async function bootstrap(): Promise<void> {
  bindEvents();
  applySettings();
  updateLayout();
  render();

  const loaded = await call<Settings>("load_settings");
  if (loaded) {
    settings = {
      ...DEFAULT_SETTINGS,
      ...loaded,
      hotkeys: { ...DEFAULT_SETTINGS.hotkeys, ...(loaded.hotkeys ?? {}) },
    };
    applySettings();
  }
  await refreshScreenSize();

  const state = await call<Snapshot>("get_state");
  if (state) snapshot = state;
  render();

  await call("set_always_on_top", { value: settings.alwaysOnTop });
  await call("set_loop", { enabled: settings.loopMode });
  await refreshHotkeyWarnings();

  await listen<Snapshot>("timer:tick", (event) => {
    snapshot = event.payload;
    render();
  });
  await listen<Snapshot>("timer:finished", (event) => {
    snapshot = event.payload;
    render();
    playFinish(settings.sound);
  });
  await listen<Snapshot>("timer:round", (event) => {
    snapshot = event.payload;
    render();
    toast("新一轮开始");
  });
  await listen<string>("ui:action", (event) => {
    void runAction(event.payload);
  });
}

void bootstrap();
