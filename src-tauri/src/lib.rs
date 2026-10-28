mod hotkeys;
mod settings;
mod timer;
mod tray;
mod window_ops;

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WindowEvent};

use settings::Settings;
use timer::{RoundEnd, Snapshot, Status, Timer};

pub struct AppState {
    pub timer: Mutex<Timer>,
    pub settings: Mutex<Settings>,
    /// Bindings that could not be registered, shown to the user as a warning.
    pub hotkey_warnings: Mutex<Vec<String>>,
    /// Window geometry captured before a panel enlarged the window.
    pub pre_panel_geometry: Mutex<Option<window_ops::WindowGeometry>>,
}

// ---------------------------------------------------------------- commands

#[tauri::command]
fn get_state(app: AppHandle) -> Snapshot {
    app.state::<AppState>().timer.lock().unwrap().snapshot()
}

/// Sets the countdown length and rewinds the clock.
#[tauri::command]
fn set_duration(app: AppHandle, seconds: f64) -> Snapshot {
    let state = app.state::<AppState>();
    let mut timer = state.timer.lock().unwrap();
    timer.total = seconds.max(0.0);
    timer.elapsed = 0.0;
    timer.status = Status::Idle;
    timer.snapshot()
}

#[tauri::command]
fn start(app: AppHandle) -> Snapshot {
    let state = app.state::<AppState>();
    let mut timer = state.timer.lock().unwrap();
    if timer.total <= 0.0 {
        return timer.snapshot();
    }
    if timer.status == Status::Finished {
        timer.elapsed = 0.0;
    }
    timer.status = Status::Running;
    timer.snapshot()
}

#[tauri::command]
fn pause(app: AppHandle) -> Snapshot {
    let state = app.state::<AppState>();
    let mut timer = state.timer.lock().unwrap();
    if timer.status == Status::Running {
        timer.status = Status::Paused;
    }
    timer.snapshot()
}

#[tauri::command]
fn resume(app: AppHandle) -> Snapshot {
    let state = app.state::<AppState>();
    let mut timer = state.timer.lock().unwrap();
    if timer.status == Status::Paused {
        timer.status = Status::Running;
    }
    timer.snapshot()
}

/// Stops the countdown and rewinds it to the beginning.
#[tauri::command]
fn stop(app: AppHandle) -> Snapshot {
    let state = app.state::<AppState>();
    let mut timer = state.timer.lock().unwrap();
    timer.elapsed = 0.0;
    timer.status = Status::Idle;
    timer.snapshot()
}

#[tauri::command]
fn reset(app: AppHandle) -> Snapshot {
    let state = app.state::<AppState>();
    let mut timer = state.timer.lock().unwrap();
    timer.elapsed = 0.0;
    timer.status = Status::Idle;
    timer.snapshot()
}

#[tauri::command]
fn set_loop(app: AppHandle, enabled: bool) -> Snapshot {
    let state = app.state::<AppState>();
    let mut timer = state.timer.lock().unwrap();
    timer.loop_mode = enabled;
    timer.snapshot()
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Settings {
    app.state::<AppState>().settings.lock().unwrap().clone()
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Settings) -> Result<Settings, String> {
    {
        let state = app.state::<AppState>();
        let mut current = state.settings.lock().unwrap();
        *current = settings.clone();
    }
    apply_settings(&app, &settings);
    settings::save(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_always_on_top(app: AppHandle, value: bool) -> Result<bool, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    window.set_always_on_top(value).map_err(|e| e.to_string())?;
    let _ = app
        .state::<tray::TrayState>()
        .always_on_top
        .set_checked(value);
    Ok(value)
}

#[tauri::command]
fn set_bar_mode(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    let side = {
        let state = app.state::<AppState>();
        let settings = state.settings.lock().unwrap();
        window_ops::BarSide::from_settings(&settings.bar_side)
    };
    window_ops::set_bar_mode(&window, enabled, side)?;
    Ok(enabled)
}

#[tauri::command]
fn dock_side(app: AppHandle, side: String) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    window_ops::dock_side(&window, window_ops::BarSide::from_settings(&side))
}

#[tauri::command]
fn center_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    window_ops::center_on_monitor(&window)
}

/// Resizes the window using logical (CSS) pixels.
#[tauri::command]
fn set_window_size(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    window
        .set_size(LogicalSize::new(
            width.max(60.0) as u32,
            height.max(60.0) as u32,
        ))
        .map_err(|e| e.to_string())
}

/// Logical size of the screen the widget is displayed on. The progress bar
/// thickness is expressed as a percentage of it.
#[tauri::command]
fn screen_size(app: AppHandle) -> Result<window_ops::ScreenSize, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    window_ops::screen_size(&window)
}

/// Enlarges the window so a panel is fully visible, even when the widget is
/// docked against a screen edge.
#[tauri::command]
fn enter_panel_mode(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    let geometry = window_ops::WindowGeometry::capture(&window)?;
    {
        let state = app.state::<AppState>();
        *state.pre_panel_geometry.lock().unwrap() = Some(geometry);
    }
    window_ops::expand_for_panel(&window, width, height)
}

/// Puts the window back where it was before a panel opened.
#[tauri::command]
fn exit_panel_mode(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    let geometry = {
        let state = app.state::<AppState>();
        let mut slot = state.pre_panel_geometry.lock().unwrap();
        slot.take()
    };
    match geometry {
        Some(geometry) => geometry.restore(&window),
        None => Ok(()),
    }
}

#[tauri::command]
fn hide_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[tauri::command]
fn show_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Hotkeys that are currently unavailable, e.g. because another program
/// already owns the combination.
#[tauri::command]
fn hotkey_warnings(app: AppHandle) -> Vec<String> {
    let state = app.state::<AppState>();
    let warnings = state.hotkey_warnings.lock().unwrap();
    warnings.clone()
}

// ------------------------------------------------------------------ helpers

fn apply_settings(app: &AppHandle, settings: &Settings) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(settings.always_on_top);
    }
    let _ = app
        .state::<tray::TrayState>()
        .always_on_top
        .set_checked(settings.always_on_top);
    let warnings = hotkeys::register(app, &settings.hotkeys);
    let state = app.state::<AppState>();
    let mut current = state.hotkey_warnings.lock().unwrap();
    *current = warnings;
}

fn on_round_finished(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Background thread driving the countdown. The UI is only ever a mirror of
/// the state kept here, so the timer keeps running while the window is hidden.
fn spawn_ticker(app: AppHandle) {
    std::thread::Builder::new()
        .name("countdown-ticker".into())
        .spawn(move || {
            let mut last = Instant::now();
            let mut since_emit = Duration::ZERO;
            loop {
                std::thread::sleep(Duration::from_millis(30));
                let now = Instant::now();
                let dt = now.duration_since(last).as_secs_f64().min(1.0);
                last = now;
                since_emit += Duration::from_secs_f64(dt);

                let (snapshot, event) = {
                    let state = app.state::<AppState>();
                    let mut timer = state.timer.lock().unwrap();
                    let event = timer.advance(dt);
                    (timer.snapshot(), event)
                };

                match event {
                    Some(RoundEnd::Finished) => {
                        let _ = app.emit("timer:finished", snapshot);
                        on_round_finished(&app);
                    }
                    Some(RoundEnd::Looped) => {
                        let _ = app.emit("timer:round", snapshot);
                    }
                    None => {}
                }

                if since_emit >= Duration::from_millis(80) {
                    since_emit = Duration::ZERO;
                    let _ = app.emit("timer:tick", snapshot);
                }
            }
        })
        .expect("无法启动计时线程");
}

// --------------------------------------------------------------------- run

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppState {
            timer: Mutex::new(Timer::new(Settings::default().default_duration)),
            settings: Mutex::new(Settings::default()),
            hotkey_warnings: Mutex::new(Vec::new()),
            pre_panel_geometry: Mutex::new(None),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let loaded = settings::load(&handle);
            {
                let state = app.state::<AppState>();
                let mut current = state.settings.lock().unwrap();
                *current = loaded.clone();
            }
            {
                let state = app.state::<AppState>();
                let mut timer = state.timer.lock().unwrap();
                timer.total = loaded.default_duration.max(1.0);
            }

            let window = app.get_webview_window("main").expect("缺少主窗口");
            let _ = window.set_always_on_top(loaded.always_on_top);
            let _ = window_ops::apply_min_size(&window);

            tray::build(&handle)?;
            {
                let state = handle.state::<AppState>();
                let mut warnings = state.hotkey_warnings.lock().unwrap();
                *warnings = hotkeys::register(&handle, &loaded.hotkeys);
            }
            spawn_ticker(handle.clone());

            let win = window.clone();
            let event_handle = handle.clone();
            window.on_window_event(move |event| match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = win.hide();
                }
                WindowEvent::Moved(position) => {
                    let snap = event_handle
                        .state::<AppState>()
                        .settings
                        .lock()
                        .unwrap()
                        .snap_to_edge;
                    if snap {
                        let _ = window_ops::maybe_snap(
                            &win,
                            PhysicalPosition::new(position.x, position.y),
                        );
                    }
                }
                _ => {}
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            set_duration,
            start,
            pause,
            resume,
            stop,
            reset,
            set_loop,
            load_settings,
            save_settings,
            set_always_on_top,
            set_bar_mode,
            dock_side,
            center_window,
            set_window_size,
            screen_size,
            enter_panel_mode,
            exit_panel_mode,
            hide_window,
            show_window,
            quit_app,
            hotkey_warnings,
        ])
        .run(tauri::generate_context!())
        .expect("无法启动倒计时程序");
}
