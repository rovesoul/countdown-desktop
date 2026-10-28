use serde::Serialize;
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

/// Thickness of the slim bar. 8 mm is about one third of the narrow panel the
/// widget used to be squeezed into.
pub const BAR_WIDTH_MM: f64 = 8.0;
/// Default "panel" size of the widget.
pub const PANEL_LOGICAL_SIZE: (f64, f64) = (460.0, 190.0);
/// Smallest height the window may be dragged down to, in logical pixels.
pub const MIN_LOGICAL_HEIGHT: u32 = 90;

/// Logical size of the screen the widget is displayed on.
#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScreenSize {
    pub width: f64,
    pub height: f64,
}

/// Where the window was before the settings panel changed its size.
#[derive(Clone, Copy, Debug)]
pub struct WindowGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Screen edge the slim bar sticks to.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum BarSide {
    Left,
    Right,
}

impl BarSide {
    pub fn from_settings(value: &str) -> Self {
        match value {
            "left" => BarSide::Left,
            _ => BarSide::Right,
        }
    }
}

fn scale_of(window: &WebviewWindow) -> f64 {
    window.scale_factor().unwrap_or(1.0)
}

impl WindowGeometry {
    /// Reads the current window position and size so it can be restored later.
    pub fn capture(window: &WebviewWindow) -> Result<Self, String> {
        let position = window.outer_position().map_err(|e| e.to_string())?;
        let size = window.outer_size().map_err(|e| e.to_string())?;
        Ok(Self {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
        })
    }

    pub fn restore(self, window: &WebviewWindow) -> Result<(), String> {
        window
            .set_size(PhysicalSize::new(self.width, self.height))
            .map_err(|e| e.to_string())?;
        window
            .set_position(PhysicalPosition::new(self.x, self.y))
            .map_err(|e| e.to_string())
    }
}

/// Logical size of the monitor the window currently sits on.
pub fn screen_size(window: &WebviewWindow) -> Result<ScreenSize, String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "找不到显示器".to_string())?;
    let scale = monitor.scale_factor().max(0.01);
    let size = monitor.size();
    Ok(ScreenSize {
        width: (size.width as f64 / scale).round(),
        height: (size.height as f64 / scale).round(),
    })
}

/// Grows the window so a panel fits on screen.
///
/// A widget docked against the right edge would otherwise grow out of the
/// screen, which is what used to make the settings panel impossible to reach.
pub fn expand_for_panel(
    window: &WebviewWindow,
    min_width: f64,
    min_height: f64,
) -> Result<(), String> {
    let scale = scale_of(window);
    let min_width = (min_width * scale).round() as u32;
    let min_height = (min_height * scale).round() as u32;
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "找不到显示器".to_string())?;
    let area = monitor.work_area();
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;

    let area_left = area.position.x;
    let area_top = area.position.y;
    let area_right = area_left + area.size.width as i32;
    let area_bottom = area_top + area.size.height as i32;

    let new_width = size.width.max(min_width).min(area.size.width);
    let new_height = size.height.max(min_height).min(area.size.height);

    // keep the edge the window was docked to
    let right_gap = area_right - (position.x + size.width as i32);
    let left_gap = position.x - area_left;
    let mut x = position.x;
    if right_gap.abs() <= 8 {
        x = area_right - new_width as i32;
    } else if left_gap.abs() <= 8 {
        x = area_left;
    }

    // and keep the vertical centre when it was centred
    let top_gap = position.y - area_top;
    let bottom_gap = area_bottom - (position.y + size.height as i32);
    let mut y = position.y;
    if (top_gap - bottom_gap).abs() <= 8 {
        y = area_top + (area.size.height as i32 - new_height as i32) / 2;
    }

    // never let the window leave the work area
    let max_x = (area_right - new_width as i32).max(area_left);
    let max_y = (area_bottom - new_height as i32).max(area_top);
    x = x.clamp(area_left, max_x);
    y = y.clamp(area_top, max_y);

    window
        .set_size(PhysicalSize::new(new_width, new_height))
        .map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
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
pub fn set_bar_mode(window: &WebviewWindow, enabled: bool, side: BarSide) -> Result<(), String> {
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
        let x = match side {
            BarSide::Right => area.position.x + area.size.width as i32 - width as i32,
            BarSide::Left => area.position.x,
        };
        window
            .set_position(PhysicalPosition::new(x, area.position.y))
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

/// Snaps the window flush against the chosen edge of its monitor.
pub fn dock_side(window: &WebviewWindow, side: BarSide) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "找不到显示器".to_string())?;
    let monitor_pos = monitor.position();
    let monitor_size = monitor.size();
    let window_size = window.outer_size().map_err(|e| e.to_string())?;
    let x = match side {
        BarSide::Right => monitor_pos.x + monitor_size.width as i32 - window_size.width as i32,
        BarSide::Left => monitor_pos.x,
    };
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
pub fn maybe_snap(window: &WebviewWindow, position: PhysicalPosition<i32>) -> Result<(), String> {
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
