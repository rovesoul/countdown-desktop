use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

/// Thickness of the slim bar. 8 mm is about one third of the narrow panel the
/// widget used to be squeezed into.
pub const BAR_WIDTH_MM: f64 = 8.0;
/// Default "panel" size of the widget.
pub const PANEL_LOGICAL_SIZE: (f64, f64) = (460.0, 190.0);
/// Smallest height the window may be dragged down to, in logical pixels.
pub const MIN_LOGICAL_HEIGHT: u32 = 90;

fn scale_of(window: &WebviewWindow) -> f64 {
    window.scale_factor().unwrap_or(1.0)
}

/// Physical pixel count of `mm` millimetres on the monitor the window lives on.
pub fn mm_to_physical(scale: f64, mm: f64) -> u32 {
    ((96.0 * scale / 25.4) * mm).round().max(1.0) as u32
}

/// Allows the window to be squeezed down into a slim strip, but never shorter
/// than a usable bar.
pub fn apply_min_size(window: &WebviewWindow) -> Result<(), String> {
    let scale = scale_of(window);
    let width = mm_to_physical(scale, BAR_WIDTH_MM);
    window
        .set_min_size(Some(PhysicalSize::new(width, MIN_LOGICAL_HEIGHT)))
        .map_err(|e| e.to_string())
}

/// Switches between the regular panel and the slim bar. The slim bar is
/// `BAR_WIDTH_MM` thick and spans the whole height of the screen.
pub fn set_bar_mode(window: &WebviewWindow, enabled: bool) -> Result<(), String> {
    if enabled {
        apply_min_size(window)?;
        let scale = scale_of(window);
        let width = mm_to_physical(scale, BAR_WIDTH_MM);
        let monitor = window
            .current_monitor()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "找不到显示器".to_string())?;
        // the work area keeps the bar clear of the taskbar
        let area = monitor.work_area();
        let height = area.size.height;
        window
            .set_size(PhysicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
        window
            .set_position(PhysicalPosition::new(
                area.position.x + area.size.width as i32 - width as i32,
                area.position.y,
            ))
            .map_err(|e| e.to_string())?;
    } else {
        window
            .set_size(LogicalSize::new(
                PANEL_LOGICAL_SIZE.0 as u32,
                PANEL_LOGICAL_SIZE.1 as u32,
            ))
            .map_err(|e| e.to_string())?;
        center_on_monitor(window)?;
    }
    Ok(())
}

/// Snaps the window flush against the right edge of its monitor.
pub fn dock_right(window: &WebviewWindow) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "找不到显示器".to_string())?;
    let monitor_pos = monitor.position();
    let monitor_size = monitor.size();
    let window_size = window.outer_size().map_err(|e| e.to_string())?;
    let x = monitor_pos.x + monitor_size.width as i32 - window_size.width as i32;
    let y = monitor_pos.y + ((monitor_size.height as i32 - window_size.height as i32) / 2).max(0);
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

/// Places the window in the middle of the monitor it currently sits on.
pub fn center_on_monitor(window: &WebviewWindow) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "找不到显示器".to_string())?;
    let monitor_pos = monitor.position();
    let monitor_size = monitor.size();
    let window_size = window.outer_size().map_err(|e| e.to_string())?;
    let x = monitor_pos.x + (monitor_size.width as i32 - window_size.width as i32) / 2;
    let y = monitor_pos.y + (monitor_size.height as i32 - window_size.height as i32) / 2;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

/// Magnetises the window to the left / right / top edge of its monitor.
pub fn maybe_snap(
    window: &WebviewWindow,
    position: PhysicalPosition<i32>,
) -> Result<(), String> {
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let center_x = position.x as f64 + size.width as f64 / 2.0;
    let center_y = position.y as f64 + size.height as f64 / 2.0;
    let monitor = match window.monitor_from_point(center_x, center_y) {
        Ok(Some(monitor)) => monitor,
        _ => window
            .current_monitor()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "找不到显示器".to_string())?,
    };
    let monitor_pos = monitor.position();
    let monitor_size = monitor.size();
    let threshold = 24i32;

    let mut x = position.x;
    let mut y = position.y;

    let right = position.x + size.width as i32;
    if (right - (monitor_pos.x + monitor_size.width as i32)).abs() <= threshold {
        x = monitor_pos.x + monitor_size.width as i32 - size.width as i32;
    }
    if (position.x - monitor_pos.x).abs() <= threshold {
        x = monitor_pos.x;
    }
    if (position.y - monitor_pos.y).abs() <= threshold {
        y = monitor_pos.y;
    }

    if x != position.x || y != position.y {
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn toggle_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    match window.is_visible() {
        Ok(true) => {
            let _ = window.hide();
        }
        _ => {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}
