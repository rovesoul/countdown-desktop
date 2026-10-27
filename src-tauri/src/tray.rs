use tauri::menu::{CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

/// Tray owned state that the rest of the app needs to keep in sync.
pub struct TrayState {
    pub always_on_top: CheckMenuItem<tauri::Wry>,
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let toggle = MenuItemBuilder::with_id("toggle", "显示 / 隐藏窗口").build(app)?;
    let set = MenuItemBuilder::with_id("set", "设定时间…").build(app)?;
    let start = MenuItemBuilder::with_id("start", "开始 / 继续").build(app)?;
    let pause = MenuItemBuilder::with_id("pause", "暂停").build(app)?;
    let stop = MenuItemBuilder::with_id("stop", "停止").build(app)?;
    let always_on_top = CheckMenuItemBuilder::with_id("top", "窗口置顶")
        .checked(false)
        .build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出程序").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&toggle)
        .item(&set)
        .separator()
        .item(&start)
        .item(&pause)
        .item(&stop)
        .separator()
        .item(&always_on_top)
        .separator()
        .item(&quit)
        .build()?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("倒计时")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle" => crate::window_ops::toggle_window(app),
            "set" => {
                let _ = app.emit("ui:action", "set");
            }
            "start" => {
                let _ = app.emit("ui:action", "toggleRun");
            }
            "pause" => {
                let _ = app.emit("ui:action", "pause");
            }
            "stop" => {
                let _ = app.emit("ui:action", "stop");
            }
            "top" => {
                let _ = app.emit("ui:action", "top");
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                crate::window_ops::toggle_window(tray.app_handle());
            }
        });

    if let Ok(icon) = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png")) {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    app.manage(TrayState { always_on_top });
    Ok(())
}
