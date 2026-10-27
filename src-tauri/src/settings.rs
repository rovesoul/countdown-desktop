use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Global hotkey bindings. An empty string disables the individual binding.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HotkeySettings {
    pub enabled: bool,
    pub toggle: String,
    pub pause: String,
    pub stop: String,
    pub reset: String,
}

impl Default for HotkeySettings {
    fn default() -> Self {
        Self {
            enabled: true,
            toggle: "Super+Up".into(),
            pause: "Super+Down".into(),
            stop: "Super+Left".into(),
            reset: "Super+Right".into(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub font_family: String,
    pub font_size: u32,
    pub opacity: f64,
    pub radius: u32,
    pub always_on_top: bool,
    pub show_labels: bool,
    pub show_clock: bool,
    pub progress_mode: String,
    pub bar_style: String,
    pub sound: String,
    pub loop_mode: bool,
    pub snap_to_edge: bool,
    pub default_duration: f64,
    pub hotkeys: HotkeySettings,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "ink".into(),
            font_family: "system".into(),
            font_size: 44,
            opacity: 1.0,
            radius: 16,
            always_on_top: false,
            show_labels: true,
            show_clock: true,
            progress_mode: "elapsed".into(),
            bar_style: "solid".into(),
            sound: "chime".into(),
            loop_mode: false,
            snap_to_edge: true,
            default_duration: 1500.0,
            hotkeys: HotkeySettings::default(),
        }
    }
}

fn config_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    Some(dir.join("settings.json"))
}

pub fn load(app: &AppHandle) -> Settings {
    let Some(path) = config_path(app) else {
        return Settings::default();
    };
    let Ok(text) = fs::read_to_string(&path) else {
        return Settings::default();
    };
    serde_json::from_str::<Settings>(&text).unwrap_or_default()
}

pub fn save(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = config_path(app).ok_or_else(|| "无法定位配置目录".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {e}"))?;
    }
    let text =
        serde_json::to_string_pretty(settings).map_err(|e| format!("序列化设置失败: {e}"))?;
    fs::write(&path, text).map_err(|e| format!("写入设置失败: {e}"))
}
