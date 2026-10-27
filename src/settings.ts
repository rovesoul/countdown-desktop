import {
  BAR_OPTIONS,
  FONT_OPTIONS,
  PROGRESS_OPTIONS,
  SOUND_OPTIONS,
  THEMES,
  type Settings,
} from "./types";

export type SettingsPatch = (mutate: (draft: Settings) => void) => void;

const KEY_ALIASES: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  " ": "Space",
  Escape: "Esc",
};

/** Turns a keyboard event into a hotkey string understood by the backend. */
export function comboFromEvent(event: KeyboardEvent): string | null {
  if (["Control", "Alt", "Shift", "Meta", "OS"].includes(event.key)) {
    return null;
  }
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Super");
  const key = KEY_ALIASES[event.key] ?? event.key;
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}

export function renderSettings(
  root: HTMLElement,
  settings: Settings,
  patch: SettingsPatch,
): void {
  root.textContent = "";

  root.appendChild(sectionTitle("外观"));
  root.appendChild(
    selectField("主题", settings.theme, THEMES, (value) =>
      patch((draft) => {
        draft.theme = value;
      }),
    ),
  );
  root.appendChild(
    selectField("字体", settings.fontFamily, FONT_OPTIONS, (value) =>
      patch((draft) => {
        draft.fontFamily = value;
      }),
    ),
  );
  root.appendChild(
    rangeField("字号", settings.fontSize, 20, 96, 1, (v) => `${v}px`, (value) =>
      patch((draft) => {
        draft.fontSize = value;
      }),
    ),
  );
  root.appendChild(
    rangeField(
      "不透明度",
      settings.opacity,
      0.2,
      1,
      0.05,
      (v) => `${Math.round(v * 100)}%`,
      (value) =>
        patch((draft) => {
          draft.opacity = value;
        }),
    ),
  );
  root.appendChild(
    rangeField("圆角", settings.radius, 0, 28, 1, (v) => `${v}px`, (value) =>
      patch((draft) => {
        draft.radius = value;
      }),
    ),
  );
  root.appendChild(
    selectField("进度条样式", settings.barStyle, BAR_OPTIONS, (value) =>
      patch((draft) => {
        draft.barStyle = value;
      }),
    ),
  );
  root.appendChild(
    selectField("进度方向", settings.progressMode, PROGRESS_OPTIONS, (value) =>
      patch((draft) => {
        draft.progressMode = value;
      }),
    ),
  );

  root.appendChild(sectionTitle("显示与提醒"));
  root.appendChild(
    switchField("显示大号数字", settings.showClock, (value) =>
      patch((draft) => {
        draft.showClock = value;
      }),
    ),
  );
  root.appendChild(
    switchField("显示两端读数", settings.showLabels, (value) =>
      patch((draft) => {
        draft.showLabels = value;
      }),
    ),
  );
  root.appendChild(
    selectField("结束提示音", settings.sound, SOUND_OPTIONS, (value) =>
      patch((draft) => {
        draft.sound = value;
      }),
    ),
  );
  root.appendChild(
    switchField("循环倒计时", settings.loopMode, (value) =>
      patch((draft) => {
        draft.loopMode = value;
      }),
    ),
  );
  root.appendChild(
    switchField("窗口置顶", settings.alwaysOnTop, (value) =>
      patch((draft) => {
        draft.alwaysOnTop = value;
      }),
    ),
  );
  root.appendChild(
    switchField("窗口边缘自动吸附", settings.snapToEdge, (value) =>
      patch((draft) => {
        draft.snapToEdge = value;
      }),
    ),
  );

  root.appendChild(sectionTitle("全局快捷键"));
  root.appendChild(
    switchField("启用全局快捷键", settings.hotkeys.enabled, (value) =>
      patch((draft) => {
        draft.hotkeys.enabled = value;
      }),
    ),
  );
  root.appendChild(
    hotkeyField("开始 / 继续", settings.hotkeys.toggle, (value) =>
      patch((draft) => {
        draft.hotkeys.toggle = value;
      }),
    ),
  );
  root.appendChild(
    hotkeyField("暂停", settings.hotkeys.pause, (value) =>
      patch((draft) => {
        draft.hotkeys.pause = value;
      }),
    ),
  );
  root.appendChild(
    hotkeyField("停止（需确认）", settings.hotkeys.stop, (value) =>
      patch((draft) => {
        draft.hotkeys.stop = value;
      }),
    ),
  );
  root.appendChild(
    hotkeyField("重置", settings.hotkeys.reset, (value) =>
      patch((draft) => {
        draft.hotkeys.reset = value;
      }),
    ),
  );
}

function sectionTitle(text: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "section-title";
  element.textContent = text;
  return element;
}

function selectField(
  label: string,
  value: string,
  options: [string, string][],
  onChange: (value: string) => void,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "setting";

  const labelRow = document.createElement("div");
  labelRow.className = "setting-label";
  const name = document.createElement("span");
  name.textContent = label;
  labelRow.appendChild(name);
  wrapper.appendChild(labelRow);

  const select = document.createElement("select");
  for (const [key, text] of options) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = text;
    option.selected = key === value;
    select.appendChild(option);
  }
  select.addEventListener("change", () => onChange(select.value));
  wrapper.appendChild(select);
  return wrapper;
}

function rangeField(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  format: (value: number) => string,
  onChange: (value: number) => void,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "setting";

  const labelRow = document.createElement("div");
  labelRow.className = "setting-label";
  const name = document.createElement("span");
  name.textContent = label;
  const readout = document.createElement("span");
  readout.className = "setting-value";
  readout.textContent = format(value);
  labelRow.append(name, readout);
  wrapper.appendChild(labelRow);

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener("input", () => {
    const next = Number(input.value);
    readout.textContent = format(next);
    onChange(next);
  });
  wrapper.appendChild(input);
  return wrapper;
}

function switchField(
  label: string,
  value: boolean,
  onChange: (value: boolean) => void,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "setting";

  const row = document.createElement("div");
  row.className = "switch-row";
  const name = document.createElement("span");
  name.textContent = label;

  const holder = document.createElement("label");
  holder.className = "switch";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = value;
  const track = document.createElement("span");
  input.addEventListener("change", () => onChange(input.checked));
  holder.append(input, track);

  row.append(name, holder);
  wrapper.appendChild(row);
  return wrapper;
}

function hotkeyField(
  label: string,
  value: string,
  onChange: (value: string) => void,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "setting";

  const labelRow = document.createElement("div");
  labelRow.className = "setting-label";
  const name = document.createElement("span");
  name.textContent = label;
  labelRow.appendChild(name);
  wrapper.appendChild(labelRow);

  const input = document.createElement("input");
  input.type = "text";
  input.className = "hotkey-input";
  input.readOnly = true;
  input.value = value || "未设置";
  input.title = "点击后按下新的组合键";
  input.addEventListener("focus", () => input.classList.add("recording"));
  input.addEventListener("blur", () => input.classList.remove("recording"));
  input.addEventListener("keydown", (event) => {
    event.preventDefault();
    if (event.key === "Escape") {
      input.blur();
      return;
    }
    const combo = comboFromEvent(event);
    if (!combo) return;
    input.value = combo;
    input.classList.remove("recording");
    onChange(combo);
  });
  wrapper.appendChild(input);
  return wrapper;
}
