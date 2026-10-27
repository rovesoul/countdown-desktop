use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::settings::HotkeySettings;

/// (Re)registers the global hotkeys. Any previously registered shortcut is
/// dropped first so the bindings can be changed at runtime.
///
/// Returns a human readable warning for every binding that could not be
/// grabbed. Windows itself owns `Super + Arrow` for the snap layouts, so a
/// less contested combination is used as a fallback.
pub fn register(app: &AppHandle, hotkeys: &HotkeySettings) -> Vec<String> {
    let _ = app.global_shortcut().unregister_all();
    let mut warnings = Vec::new();
    if !hotkeys.enabled {
        return warnings;
    }

    let bindings: [(&str, &str); 4] = [
        ("toggle", hotkeys.toggle.as_str()),
        ("pause", hotkeys.pause.as_str()),
        ("stop", hotkeys.stop.as_str()),
        ("reset", hotkeys.reset.as_str()),
    ];

    for (action, combo) in bindings {
        let combo = combo.trim();
        if combo.is_empty() {
            continue;
        }
        if let Err(err) = register_one(app, action, combo) {
            let mut fallback_taken = false;
            if let Some(fallback) = fallback_combo(combo) {
                if register_one(app, action, &fallback).is_ok() {
                    warnings.push(format!("{combo} 已被其它程序占用，改用 {fallback}"));
                    fallback_taken = true;
                }
            }
            if !fallback_taken {
                warnings.push(format!("{combo} 注册失败：{err}"));
            }
        }
    }
    warnings
}

/// Registers a single binding and wires it to the `ui:action` event.
fn register_one(app: &AppHandle, action: &str, combo: &str) -> Result<(), String> {
    let shortcut = combo
        .parse::<Shortcut>()
        .map_err(|err| format!("无法解析快捷键 {combo}: {err}"))?;
    let handle = app.clone();
    let action = action.to_string();
    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                let _ = handle.emit("ui:action", action.clone());
            }
        })
        .map_err(|err| err.to_string())
}

/// `Super+Up` -> `Ctrl+Alt+Up`
fn fallback_combo(combo: &str) -> Option<String> {
    for prefix in ["Super+", "Meta+", "Cmd+", "Command+"] {
        if let Some(rest) = combo.strip_prefix(prefix) {
            return Some(format!("Ctrl+Alt+{rest}"));
        }
    }
    None
}
