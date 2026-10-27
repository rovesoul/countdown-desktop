import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles.css";
import { formatClock, formatDuration, splitDuration } from "./format";
import { playFinish, primeAudio } from "./sound";
import { renderSettings } from "./settings";
import {
  DEFAULT_SETTINGS,
  FONT_FAMILIES,
  type Settings,
  type Snapshot,
  type Status,
} from "./types";

type Layout = "h" | "v" | "bar";

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
const btnSettings = el<HTMLButtonElement>("btnSettings");
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
let saveTimer: number | undefined;
let toastTimer: number | undefined;
let clickTimer: number | undefined;
let confirmAction: (() => void) | null = null;
let settingsRestore: { w: number; h: number } | null = null;
/** Set once the user silences the red blinking after a countdown ended. */
let flashMuted = false;

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
  root.style.setProperty(
    "--font",
    FONT_FAMILIES[settings.fontFamily] ?? FONT_FAMILIES.system,
  );
  root.classList.toggle("hide-labels", !settings.showLabels);
  root.classList.toggle("hide-clock", !settings.showClock);
  app.dataset.bar = settings.barStyle;
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
      await call("set_bar_mode", { enabled: layout !== "bar" });
      break;
    case "dock":
      await call("dock_right");
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
      break;
    }
    case "settings":
      openSettings();
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

function openSettings(): void {
  if (settingsRestore) return;
  settingsRestore = { w: window.innerWidth, h: window.innerHeight };
  void call("set_window_size", {
    width: Math.max(window.innerWidth, 460),
    height: Math.max(window.innerHeight, 450),
  });
  renderSettings(settingsGrid, settings, patchSettings);
  settingsOverlay.hidden = false;
}

function closeSettings(): void {
  if (settingsOverlay.hidden) return;
  settingsOverlay.hidden = true;
  if (settingsRestore) {
    void call("set_window_size", {
      width: settingsRestore.w,
      height: settingsRestore.h,
    });
    settingsRestore = null;
  }
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
  items.push({ label: "重置", action: "reset" });
  items.push({ separator: true });
  items.push({
    label: layout === "bar" ? "展开为面板" : "细条模式",
    action: "bar",
  });
  items.push({ label: "靠右吸附", action: "dock" });
  items.push({ label: "窗口居中", action: "center" });
  items.push({ label: "窗口置顶", action: "top", checked: settings.alwaysOnTop });
  items.push({ separator: true });
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
    button.textContent = item.label ?? "";
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

function closeCtxMenu(): void {
  ctxMenu.hidden = true;
}

// --------------------------------------------------------------------- init

function bindEvents(): void {
  btnSet.addEventListener("click", () => openSetPanel());
  btnStart.addEventListener("click", () => void toggleRun());
  btnFlash.addEventListener("click", () => void runAction("flash"));
  btnSettings.addEventListener("click", () => openSettings());
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

  settingsClose.addEventListener("click", () => closeSettings());
  settingsReset.addEventListener("click", () => {
    settings = structuredClone(DEFAULT_SETTINGS);
    applySettings();
    renderSettings(settingsGrid, settings, patchSettings);
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
    openCtxMenu(event.clientX, event.clientY);
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
      closeSettings();
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

  window.addEventListener("resize", updateLayout);
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
