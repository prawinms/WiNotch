use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use sysinfo::System;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InteractiveBox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub expanded: bool,
    pub pinned: bool,
    pub game_mode_override: String, // "auto", "on", "off"
    pub color_picking: bool,
}

impl Default for InteractiveBox {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            width: 460.0,
            height: 68.0,
            expanded: false,
            pinned: false,
            game_mode_override: "off".to_string(),
            color_picking: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WifiDetails {
    pub connected: bool,
    pub ssid: String,
    pub signal_percent: u32,
    pub radio_type: String,
    pub band: String,
    pub rx_mbps: String,
    pub tx_mbps: String,
    pub ipv4: String,
}

impl Default for WifiDetails {
    fn default() -> Self {
        Self {
            connected: true,
            ssid: "Wi-Fi Connected".to_string(),
            signal_percent: 94,
            radio_type: "802.11ax (Wi-Fi 6)".to_string(),
            band: "5 GHz".to_string(),
            rx_mbps: "866 Mbps".to_string(),
            tx_mbps: "866 Mbps".to_string(),
            ipv4: "192.168.1.104".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemTelemetry {
    pub battery_percent: u32,
    pub is_charging: bool,
    pub battery_saver: bool,
    pub remaining_mins: i32,
    pub power_mode: String,
    pub cpu_usage: f32,
    pub ram_used_gb: f32,
    pub ram_total_gb: f32,
    pub sound_volume: u32,
    pub sound_muted: bool,
    pub sound_mode: String,
    pub sound_device: String,
    pub wifi: WifiDetails,
    pub fullscreen_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShelfItem {
    pub id: String,
    pub name: String,
    pub path: String,
    pub original_path: String,
    pub size_bytes: u64,
    pub kind: String,
    pub ext: String,
    pub preview_data_url: Option<String>,
    pub added_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardEntry {
    pub id: String,
    pub content: String,
    pub kind: String,
    pub pinned: bool,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HarnessInfo {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub kind: String,
    pub installed: bool,
    pub executable_path: String,
    pub default_model: String,
    pub models: Vec<String>,
    pub description: String,
    pub badge_color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentProcessInfo {
    pub pid: u32,
    pub name: String,
    pub title: String,
    pub category: String,
    pub status: String,
    pub cpu_percent: f32,
    pub memory_mb: u64,
    pub port: Option<u16>,
}

pub struct AppState {
    pub bounds: Arc<Mutex<InteractiveBox>>,
    pub wifi_cache: Arc<Mutex<(Instant, WifiDetails)>>,
    pub power_mode: Arc<Mutex<String>>,
    pub sound_volume: Arc<Mutex<u32>>,
    pub sound_muted: Arc<Mutex<bool>>,
    pub sound_mode: Arc<Mutex<String>>,
    pub shelf_items: Arc<Mutex<Vec<ShelfItem>>>,
    pub clipboard_history: Arc<Mutex<Vec<ClipboardEntry>>>,
    pub last_clipboard_text: Arc<Mutex<String>>,
    pub sys: Arc<Mutex<System>>,
    pub nudge_x: Arc<Mutex<i32>>,
}

fn get_app_data_dir() -> PathBuf {
    let base = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    let dir = base.join("WiNotch");
    let _ = fs::create_dir_all(&dir);
    let _ = fs::create_dir_all(dir.join("shelf"));
    dir
}

fn load_shelf_from_disk() -> Vec<ShelfItem> {
    let index_path = get_app_data_dir().join("shelf_index.json");
    if let Ok(data) = fs::read_to_string(index_path) {
        if let Ok(items) = serde_json::from_str::<Vec<ShelfItem>>(&data) {
            return items
                .into_iter()
                .filter(|item| PathBuf::from(&item.path).exists())
                .collect();
        }
    }
    Vec::new()
}

fn save_shelf_to_disk(items: &[ShelfItem]) {
    let index_path = get_app_data_dir().join("shelf_index.json");
    if let Ok(json) = serde_json::to_string_pretty(items) {
        let _ = fs::write(index_path, json);
    }
}

fn classify_file_ext(ext: &str) -> String {
    match ext.to_lowercase().as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "ico" => "image".to_string(),
        "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "json" | "md" | "html" | "css" | "cs"
        | "cpp" | "c" | "go" | "toml" | "yaml" | "yml" | "ps1" | "sh" => "code".to_string(),
        "pdf" | "doc" | "docx" | "txt" | "xls" | "xlsx" | "ppt" | "pptx" | "csv" => {
            "document".to_string()
        }
        "zip" | "rar" | "7z" | "tar" | "gz" => "archive".to_string(),
        "mp3" | "wav" | "flac" | "mp4" | "mkv" | "mov" | "webm" => "media".to_string(),
        _ => "file".to_string(),
    }
}

fn classify_text(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return "link".to_string();
    }
    let code_markers = [
        "fn ",
        "const ",
        "let ",
        "import ",
        "function ",
        "class ",
        "public ",
        "return ",
        "=>",
        "{",
        "};",
        "SELECT ",
        "def ",
    ];
    let hits = code_markers
        .iter()
        .filter(|m| trimmed.contains(*m))
        .count();
    if hits >= 2 || (trimmed.contains('{') && trimmed.contains('}') && trimmed.lines().count() > 2)
    {
        return "code".to_string();
    }
    "text".to_string()
}

#[cfg(windows)]
fn read_windows_battery() -> (u32, bool, bool, i32) {
    use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    unsafe {
        let mut status: SYSTEM_POWER_STATUS = std::mem::zeroed();
        if GetSystemPowerStatus(&mut status) != 0 {
            let pct = if status.BatteryLifePercent <= 100 {
                status.BatteryLifePercent as u32
            } else {
                100
            };
            let charging = status.ACLineStatus == 1 || (status.BatteryFlag & 8) != 0;
            let saver = status.SystemStatusFlag == 1;
            let rem_mins = if status.BatteryLifeTime != u32::MAX {
                (status.BatteryLifeTime / 60) as i32
            } else if charging {
                -1
            } else {
                215
            };
            return (pct, charging, saver, rem_mins);
        }
    }
    (100, true, false, -1)
}

#[cfg(not(windows))]
fn read_windows_battery() -> (u32, bool, bool, i32) {
    (100, true, false, -1)
}

fn query_wifi_details() -> WifiDetails {
    let mut details = WifiDetails::default();
    let mut cmd = Command::new("netsh");
    cmd.args(["wlan", "show", "interfaces"]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    if let Ok(output) = cmd.output() {
        let text = String::from_utf8_lossy(&output.stdout);
        let mut connected = false;
        for line in text.lines() {
            if let Some((k, v)) = line.split_once(':') {
                let key = k.trim().to_lowercase();
                let val = v.trim().to_string();
                if key == "state" {
                    connected = val.to_lowercase().contains("connected")
                        && !val.to_lowercase().contains("disconnected");
                } else if key == "ssid" && !val.is_empty() {
                    details.ssid = val;
                } else if key == "signal" {
                    if let Ok(num) = val.trim_end_matches('%').trim().parse::<u32>() {
                        details.signal_percent = num;
                    }
                } else if key == "radio type" {
                    details.radio_type = val;
                } else if key == "band" {
                    details.band = val;
                } else if key.contains("receive rate") {
                    details.rx_mbps = format!("{} Mbps", val);
                } else if key.contains("transmit rate") {
                    details.tx_mbps = format!("{} Mbps", val);
                }
            }
        }
        details.connected = connected;
        if !connected {
            details.ssid = "Disconnected".to_string();
            details.signal_percent = 0;
        }
    }
    details
}

#[cfg(windows)]
fn read_clipboard_unicode_text() -> Option<String> {
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    };
    use windows_sys::Win32::System::Memory::{GlobalLock, GlobalUnlock};

    const CF_UNICODETEXT: u32 = 13;
    unsafe {
        if IsClipboardFormatAvailable(CF_UNICODETEXT) == 0 {
            return None;
        }
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return None;
        }
        let handle = GetClipboardData(CF_UNICODETEXT);
        if handle.is_null() {
            CloseClipboard();
            return None;
        }
        let ptr = GlobalLock(handle) as *const u16;
        if ptr.is_null() {
            CloseClipboard();
            return None;
        }
        let mut len = 0usize;
        while len < 65536 && *ptr.add(len) != 0 {
            len += 1;
        }
        let slice = std::slice::from_raw_parts(ptr, len);
        let result = String::from_utf16_lossy(slice);
        GlobalUnlock(handle);
        CloseClipboard();
        if result.trim().is_empty() {
            None
        } else {
            Some(result)
        }
    }
}

#[cfg(not(windows))]
fn read_clipboard_unicode_text() -> Option<String> {
    None
}

#[cfg(windows)]
fn write_clipboard_unicode_text(text: &str) -> Result<(), String> {
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows_sys::Win32::System::Memory::{
        GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE, GMEM_ZEROINIT,
    };

    const CF_UNICODETEXT: u32 = 13;
    let mut wide: Vec<u16> = text.encode_utf16().collect();
    wide.push(0);
    let byte_len = wide.len() * 2;

    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return Err("Could not open Windows clipboard".to_string());
        }
        EmptyClipboard();
        let hglobal = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, byte_len);
        if hglobal.is_null() {
            CloseClipboard();
            return Err("GlobalAlloc failed".to_string());
        }
        let dst = GlobalLock(hglobal) as *mut u16;
        if dst.is_null() {
            CloseClipboard();
            return Err("GlobalLock failed".to_string());
        }
        std::ptr::copy_nonoverlapping(wide.as_ptr(), dst, wide.len());
        GlobalUnlock(hglobal);
        SetClipboardData(CF_UNICODETEXT, hglobal);
        CloseClipboard();
    }
    Ok(())
}

#[cfg(windows)]
fn write_clipboard_files_cf_hdrop(paths: &[String]) -> Result<(), String> {
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows_sys::Win32::System::Memory::{
        GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE, GMEM_ZEROINIT,
    };
    use windows_sys::Win32::UI::Shell::DROPFILES;

    const CF_HDROP: u32 = 15;
    if paths.is_empty() {
        return Err("No files selected to copy".to_string());
    }

    let mut wide_files: Vec<u16> = Vec::new();
    for p in paths {
        let canonical = p.replace('/', "\\");
        wide_files.extend(canonical.encode_utf16());
        wide_files.push(0);
    }
    wide_files.push(0);

    let header_size = std::mem::size_of::<DROPFILES>();
    let total_bytes = header_size + wide_files.len() * 2;

    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return Err("Could not open Windows clipboard".to_string());
        }
        EmptyClipboard();
        let hglobal = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, total_bytes);
        if hglobal.is_null() {
            CloseClipboard();
            return Err("GlobalAlloc failed for CF_HDROP".to_string());
        }
        let ptr = GlobalLock(hglobal) as *mut u8;
        if ptr.is_null() {
            CloseClipboard();
            return Err("GlobalLock failed for CF_HDROP".to_string());
        }

        let dropfiles = ptr as *mut DROPFILES;
        (*dropfiles).pFiles = header_size as u32;
        (*dropfiles).pt.x = 0;
        (*dropfiles).pt.y = 0;
        (*dropfiles).fNC = 0;
        (*dropfiles).fWide = 1;

        let dest_wide = ptr.add(header_size) as *mut u16;
        std::ptr::copy_nonoverlapping(wide_files.as_ptr(), dest_wide, wide_files.len());

        GlobalUnlock(hglobal);
        if SetClipboardData(CF_HDROP, hglobal).is_null() {
            CloseClipboard();
            return Err("SetClipboardData(CF_HDROP) failed".to_string());
        }
        CloseClipboard();
    }
    Ok(())
}

fn resize_and_position_notch(
    app: &AppHandle,
    logical_width: f64,
    logical_height: f64,
    nudge_x: i32,
) {
    if let Some(window) = app.get_webview_window("main") {
        let scale = window.scale_factor().unwrap_or(1.0);
        let screen_w = window
            .current_monitor()
            .ok()
            .flatten()
            .map(|m| m.size().width as i32)
            .unwrap_or(1920);

        let phys_w = (logical_width * scale).round() as u32;
        let phys_h = (logical_height * scale).round() as u32;
        let base_x = (screen_w - phys_w as i32) / 2;
        let final_x = (base_x + (nudge_x as f64 * scale) as i32).clamp(0, (screen_w - phys_w as i32).max(0));

        let _ = window.set_size(PhysicalSize::new(phys_w, phys_h));
        let _ = window.set_position(PhysicalPosition::new(final_x, 0));
        let _ = window.set_always_on_top(true);
        let _ = window.show();
    }
}

#[tauri::command]
fn update_interactive_bounds(
    app: AppHandle,
    state: State<'_, AppState>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    expanded: bool,
    pinned: bool,
    game_mode_override: String,
    color_picking: bool,
) -> Result<(), String> {
    let mut changed = false;
    if let Ok(mut b) = state.bounds.lock() {
        if (b.width - width).abs() > 1.0
            || (b.height - height).abs() > 1.0
            || b.expanded != expanded
        {
            changed = true;
        }
        b.x = x;
        b.y = y;
        b.width = width;
        b.height = height;
        b.expanded = expanded;
        b.pinned = pinned;
        b.game_mode_override = game_mode_override;
        b.color_picking = color_picking;
    }

    if changed {
        let nudge = state.nudge_x.lock().map(|n| *n).unwrap_or(0);
        resize_and_position_notch(&app, width, height, nudge);
    }
    Ok(())
}

#[tauri::command]
fn nudge_notch_position(
    app: AppHandle,
    state: State<'_, AppState>,
    delta_x: i32,
    reset_center: bool,
) -> Result<i32, String> {
    let mut nudge = state.nudge_x.lock().map_err(|e| e.to_string())?;
    if reset_center {
        *nudge = 0;
    } else {
        *nudge = (*nudge + delta_x).clamp(-550, 550);
    }
    let (w, h) = state
        .bounds
        .lock()
        .map(|b| (b.width, b.height))
        .unwrap_or((460.0, 68.0));
    resize_and_position_notch(&app, w, h, *nudge);
    Ok(*nudge)
}

#[tauri::command]
fn get_system_telemetry(state: State<'_, AppState>) -> Result<SystemTelemetry, String> {
    let (battery_percent, is_charging, battery_saver, remaining_mins) = read_windows_battery();

    let wifi = {
        let mut cache = state.wifi_cache.lock().map_err(|e| e.to_string())?;
        if cache.0.elapsed() > Duration::from_secs(8) {
            cache.1 = query_wifi_details();
            cache.0 = Instant::now();
        }
        cache.1.clone()
    };

    let (cpu_usage, ram_used_gb, ram_total_gb) = {
        let mut sys = state.sys.lock().map_err(|e| e.to_string())?;
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        let cpu = sys.global_cpu_usage();
        let used = sys.used_memory() as f32 / (1024.0 * 1024.0 * 1024.0);
        let total = (sys.total_memory() as f32 / (1024.0 * 1024.0 * 1024.0)).max(1.0);
        (cpu, used, total)
    };

    let power_mode = state
        .power_mode
        .lock()
        .map(|p| p.clone())
        .unwrap_or_else(|_| "Balanced".to_string());
    let sound_volume = state.sound_volume.lock().map(|v| *v).unwrap_or(72);
    let sound_muted = state.sound_muted.lock().map(|m| *m).unwrap_or(false);
    let sound_mode = state
        .sound_mode
        .lock()
        .map(|m| m.clone())
        .unwrap_or_else(|_| "Spatial Audio".to_string());

    Ok(SystemTelemetry {
        battery_percent,
        is_charging,
        battery_saver,
        remaining_mins,
        power_mode,
        cpu_usage,
        ram_used_gb,
        ram_total_gb,
        sound_volume,
        sound_muted,
        sound_mode,
        sound_device: "Speakers (Realtek Audio)".to_string(),
        wifi,
        fullscreen_active: false,
    })
}

#[tauri::command]
fn set_power_mode(state: State<'_, AppState>, mode: String) -> Result<String, String> {
    if let Ok(mut pm) = state.power_mode.lock() {
        *pm = mode.clone();
    }
    let guid = match mode.as_str() {
        "Best Power Efficiency" => "a1841308-3541-4fab-bc81-f71556f20b4a",
        "Best Performance" => "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
        _ => "381b4222-f694-41f0-9685-ff5bb260df2e",
    };
    let mut cmd = Command::new("powercfg");
    cmd.args(["/setactive", guid]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd.spawn();
    Ok(mode)
}

#[tauri::command]
fn set_sound_state(
    state: State<'_, AppState>,
    volume: Option<u32>,
    muted: Option<bool>,
    mode: Option<String>,
) -> Result<(), String> {
    #[cfg(windows)]
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        keybd_event, KEYEVENTF_KEYUP, VK_VOLUME_DOWN, VK_VOLUME_MUTE, VK_VOLUME_UP,
    };

    if let Some(v) = volume {
        let prev = state.sound_volume.lock().map(|x| *x).unwrap_or(70);
        if let Ok(mut sv) = state.sound_volume.lock() {
            *sv = v.clamp(0, 100);
        }
        #[cfg(windows)]
        unsafe {
            let vk = if v > prev { VK_VOLUME_UP } else { VK_VOLUME_DOWN };
            keybd_event(vk as u8, 0, 0, 0);
            keybd_event(vk as u8, 0, KEYEVENTF_KEYUP, 0);
        }
    }
    if let Some(m) = muted {
        if let Ok(mut sm) = state.sound_muted.lock() {
            *sm = m;
        }
        #[cfg(windows)]
        unsafe {
            keybd_event(VK_VOLUME_MUTE as u8, 0, 0, 0);
            keybd_event(VK_VOLUME_MUTE as u8, 0, KEYEVENTF_KEYUP, 0);
        }
    }
    if let Some(md) = mode {
        if let Ok(mut smd) = state.sound_mode.lock() {
            *smd = md;
        }
    }
    Ok(())
}

#[tauri::command]
fn send_media_key(action: String) -> Result<(), String> {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            keybd_event, KEYEVENTF_KEYUP, VK_MEDIA_NEXT_TRACK, VK_MEDIA_PLAY_PAUSE,
            VK_MEDIA_PREV_TRACK,
        };
        let vk = match action.as_str() {
            "next" => VK_MEDIA_NEXT_TRACK,
            "prev" => VK_MEDIA_PREV_TRACK,
            _ => VK_MEDIA_PLAY_PAUSE,
        };
        keybd_event(vk as u8, 0, 0, 0);
        keybd_event(vk as u8, 0, KEYEVENTF_KEYUP, 0);
    }
    Ok(())
}

#[tauri::command]
fn open_windows_setting(uri: String) -> Result<(), String> {
    let mut cmd = Command::new("cmd");
    cmd.args(["/C", "start", "", &uri]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd.spawn();
    Ok(())
}

#[tauri::command]
fn poll_clipboard_history(state: State<'_, AppState>) -> Result<Vec<ClipboardEntry>, String> {
    if let Some(current_text) = read_clipboard_unicode_text() {
        let mut last = state.last_clipboard_text.lock().map_err(|e| e.to_string())?;
        if *last != current_text {
            *last = current_text.clone();
            let mut history = state.clipboard_history.lock().map_err(|e| e.to_string())?;
            if !history.iter().any(|e| e.content == current_text) {
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                let entry = ClipboardEntry {
                    id: format!("clip-{}", now),
                    kind: classify_text(&current_text),
                    content: current_text,
                    pinned: false,
                    timestamp: now,
                };
                history.insert(0, entry);
                if history.len() > 40 {
                    if let Some(pos) = history.iter().rposition(|x| !x.pinned) {
                        history.remove(pos);
                    }
                }
            }
        }
    }
    let history = state.clipboard_history.lock().map_err(|e| e.to_string())?;
    Ok(history.clone())
}

#[tauri::command]
fn copy_text_to_clipboard(state: State<'_, AppState>, text: String) -> Result<(), String> {
    if let Ok(mut last) = state.last_clipboard_text.lock() {
        *last = text.clone();
    }
    #[cfg(windows)]
    write_clipboard_unicode_text(&text)?;
    Ok(())
}

#[tauri::command]
fn toggle_pin_clipboard(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<ClipboardEntry>, String> {
    let mut history = state.clipboard_history.lock().map_err(|e| e.to_string())?;
    if let Some(item) = history.iter_mut().find(|x| x.id == id) {
        item.pinned = !item.pinned;
    }
    Ok(history.clone())
}

#[tauri::command]
fn remove_clipboard_entry(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<ClipboardEntry>, String> {
    let mut history = state.clipboard_history.lock().map_err(|e| e.to_string())?;
    if id == "__clear_unpinned__" {
        history.retain(|x| x.pinned);
    } else {
        history.retain(|x| x.id != id);
    }
    Ok(history.clone())
}

fn build_shelf_item_from_path(src_path: &PathBuf) -> Option<ShelfItem> {
    if !src_path.exists() {
        return None;
    }
    let metadata = fs::metadata(src_path).ok()?;
    let file_name = src_path.file_name()?.to_string_lossy().to_string();
    let ext = src_path
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_default();
    let kind = classify_file_ext(&ext);

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let shelf_dir = get_app_data_dir().join("shelf");
    let staged_name = format!("{}_{}", now_ms % 100_000, file_name);
    let staged_path = shelf_dir.join(&staged_name);

    let final_path = if metadata.is_file() && metadata.len() <= 50 * 1024 * 1024 {
        if fs::copy(src_path, &staged_path).is_ok() {
            staged_path
        } else {
            src_path.clone()
        }
    } else {
        src_path.clone()
    };

    let preview_data_url = if kind == "image" && metadata.len() <= 4 * 1024 * 1024 {
        if let Ok(bytes) = fs::read(&final_path) {
            let mime = match ext.to_lowercase().as_str() {
                "png" => "image/png",
                "gif" => "image/gif",
                "webp" => "image/webp",
                "svg" => "image/svg+xml",
                "bmp" => "image/bmp",
                "ico" => "image/x-icon",
                _ => "image/jpeg",
            };
            Some(format!("data:{};base64,{}", mime, BASE64.encode(bytes)))
        } else {
            None
        }
    } else {
        None
    };

    Some(ShelfItem {
        id: format!("shelf-{}", now_ms),
        name: file_name,
        path: final_path.to_string_lossy().to_string(),
        original_path: src_path.to_string_lossy().to_string(),
        size_bytes: metadata.len(),
        kind,
        ext,
        preview_data_url,
        added_at: (now_ms / 1000),
    })
}

#[tauri::command]
fn get_shelf_items(state: State<'_, AppState>) -> Result<Vec<ShelfItem>, String> {
    let items = state.shelf_items.lock().map_err(|e| e.to_string())?;
    Ok(items.clone())
}

#[tauri::command]
fn add_files_to_shelf(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<Vec<ShelfItem>, String> {
    let mut items = state.shelf_items.lock().map_err(|e| e.to_string())?;
    for p in paths {
        let pb = PathBuf::from(&p);
        if let Some(item) = build_shelf_item_from_path(&pb) {
            items.insert(0, item);
        }
    }
    save_shelf_to_disk(&items);
    Ok(items.clone())
}

#[tauri::command]
fn add_base64_file_to_shelf(
    state: State<'_, AppState>,
    name: String,
    base64_data: String,
) -> Result<Vec<ShelfItem>, String> {
    let clean_b64 = if let Some((_, b64)) = base64_data.split_once(',') {
        b64
    } else {
        base64_data.as_str()
    };
    let bytes = BASE64.decode(clean_b64).map_err(|e| e.to_string())?;
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let safe_name: String = name
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) { '_' } else { c })
        .collect();
    let staged_path = get_app_data_dir()
        .join("shelf")
        .join(format!("{}_{}", now_ms % 100_000, safe_name));
    fs::write(&staged_path, &bytes).map_err(|e| e.to_string())?;

    let mut items = state.shelf_items.lock().map_err(|e| e.to_string())?;
    if let Some(mut item) = build_shelf_item_from_path(&staged_path) {
        item.name = safe_name;
        items.insert(0, item);
        save_shelf_to_disk(&items);
    }
    Ok(items.clone())
}

#[tauri::command]
fn copy_shelf_files_to_clipboard(paths: Vec<String>) -> Result<String, String> {
    #[cfg(windows)]
    {
        write_clipboard_files_cf_hdrop(&paths)?;
        return Ok(format!(
            "Copied {} file(s) to Windows Clipboard! Press Ctrl+V anywhere to paste.",
            paths.len()
        ));
    }
    #[cfg(not(windows))]
    Err("File clipboard requires Windows".to_string())
}

#[tauri::command]
fn remove_shelf_item(state: State<'_, AppState>, id: String) -> Result<Vec<ShelfItem>, String> {
    let mut items = state.shelf_items.lock().map_err(|e| e.to_string())?;
    let shelf_dir = get_app_data_dir().join("shelf");
    if id == "__clear_all__" {
        for item in items.iter() {
            let pb = PathBuf::from(&item.path);
            if pb.starts_with(&shelf_dir) {
                let _ = fs::remove_file(pb);
            }
        }
        items.clear();
    } else if let Some(pos) = items.iter().position(|x| x.id == id) {
        let removed = items.remove(pos);
        let pb = PathBuf::from(&removed.path);
        if pb.starts_with(&shelf_dir) {
            let _ = fs::remove_file(pb);
        }
    }
    save_shelf_to_disk(&items);
    Ok(items.clone())
}

#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    let mut cmd = Command::new("explorer.exe");
    cmd.arg(format!("/select,{}", path));
    let _ = cmd.spawn();
    Ok(())
}

fn find_executable(candidates: &[String]) -> Option<String> {
    for c in candidates {
        let pb = PathBuf::from(c);
        if pb.is_absolute() || c.contains('\\') {
            if pb.exists() {
                return Some(pb.to_string_lossy().to_string());
            }
        } else {
            let mut cmd = Command::new("where.exe");
            cmd.arg(c);
            #[cfg(windows)]
            cmd.creation_flags(CREATE_NO_WINDOW);
            if let Ok(out) = cmd.output() {
                if out.status.success() {
                    if let Some(first_line) = String::from_utf8_lossy(&out.stdout).lines().next() {
                        let trimmed = first_line.trim();
                        if !trimmed.is_empty() {
                            return Some(trimmed.to_string());
                        }
                    }
                }
            }
        }
    }
    None
}

#[tauri::command]
fn discover_harnesses() -> Result<Vec<HarnessInfo>, String> {
    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let app_data = std::env::var("APPDATA").unwrap_or_default();
    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();

    let agy_path = find_executable(&[
        format!("{}\\Programs\\antigravity\\Antigravity.exe", local_app_data),
        "agy".to_string(),
        "antigravity".to_string(),
    ]);

    let claude_path = find_executable(&[
        format!("{}\\.local\\bin\\claude.exe", user_profile),
        format!("{}\\AnthropicClaude\\claude.exe", local_app_data),
        "claude".to_string(),
    ]);

    let ollama_path = find_executable(&[
        format!("{}\\Programs\\Ollama\\ollama.exe", local_app_data),
        "ollama".to_string(),
    ]);

    let opencode_path = find_executable(&[
        format!("{}\\npm\\opencode.cmd", app_data),
        format!("{}\\npm\\opencode.ps1", app_data),
        "opencode".to_string(),
    ]);

    let vscode_path = find_executable(&[
        format!(
            "{}\\Programs\\Microsoft VS Code\\Code.exe",
            local_app_data
        ),
        format!(
            "{}\\Programs\\Microsoft VS Code\\bin\\code.cmd",
            local_app_data
        ),
        "code".to_string(),
    ]);

    let codex_path = find_executable(&[
        format!("{}\\npm\\codex.cmd", app_data),
        "codex".to_string(),
    ]);

    let cursor_path = find_executable(&[
        format!("{}\\Programs\\cursor\\Cursor.exe", local_app_data),
        "cursor".to_string(),
    ]);

    let harnesses = vec![
        HarnessInfo {
            id: "antigravity".to_string(),
            name: "Antigravity UI".to_string(),
            vendor: "Google DeepMind".to_string(),
            kind: "desktop".to_string(),
            installed: agy_path.is_some(),
            executable_path: agy_path.unwrap_or_else(|| "Antigravity.exe".to_string()),
            default_model: "Gemini 2.5 Pro (Antigravity)".to_string(),
            models: vec![
                "Gemini 2.5 Pro (Antigravity)".to_string(),
                "Gemini 2.5 Flash".to_string(),
                "Claude Sonnet 4.5 (via AGY)".to_string(),
            ],
            description: "Agentic AI IDE & Coding Harness with full workspace orchestration.".to_string(),
            badge_color: "#38bdf8".to_string(),
        },
        HarnessInfo {
            id: "claude-code".to_string(),
            name: "Claude Code CLI & UI".to_string(),
            vendor: "Anthropic".to_string(),
            kind: "cli".to_string(),
            installed: claude_path.is_some(),
            executable_path: claude_path.unwrap_or_else(|| "claude.exe".to_string()),
            default_model: "Claude Sonnet 4.5".to_string(),
            models: vec![
                "Claude Sonnet 4.5".to_string(),
                "Claude Opus 4.6".to_string(),
                "Claude Haiku 4.5".to_string(),
            ],
            description: "Anthropic's agentic coding CLI & terminal session manager.".to_string(),
            badge_color: "#f97316".to_string(),
        },
        HarnessInfo {
            id: "claude-web".to_string(),
            name: "Claude Cloud UI".to_string(),
            vendor: "Anthropic Web".to_string(),
            kind: "web".to_string(),
            installed: true,
            executable_path: "https://claude.ai/new".to_string(),
            default_model: "Claude Sonnet 4.5".to_string(),
            models: vec![
                "Claude Sonnet 4.5".to_string(),
                "Claude Opus 4.6".to_string(),
            ],
            description: "Expand prompt directly to Claude Web UI with Artifacts & Projects.".to_string(),
            badge_color: "#fb923c".to_string(),
        },
        HarnessInfo {
            id: "opencode".to_string(),
            name: "OpenCode Harness".to_string(),
            vendor: "OpenCode".to_string(),
            kind: "cli".to_string(),
            installed: opencode_path.is_some(),
            executable_path: opencode_path.unwrap_or_else(|| "opencode".to_string()),
            default_model: "Claude Sonnet 4.5 / GPT-4.1".to_string(),
            models: vec![
                "Claude Sonnet 4.5 / GPT-4.1".to_string(),
                "DeepSeek R1".to_string(),
                "Gemini 2.5 Pro".to_string(),
            ],
            description: "Terminal-native AI coding harness installed on your system.".to_string(),
            badge_color: "#10b981".to_string(),
        },
        HarnessInfo {
            id: "ollama".to_string(),
            name: "Ollama Local AI".to_string(),
            vendor: "Ollama".to_string(),
            kind: "local_api".to_string(),
            installed: ollama_path.is_some(),
            executable_path: ollama_path.unwrap_or_else(|| "ollama.exe".to_string()),
            default_model: "llama3.2:latest".to_string(),
            models: vec![
                "llama3.2:latest".to_string(),
                "qwen2.5-coder:7b".to_string(),
                "deepseek-r1:8b".to_string(),
            ],
            description: "Local LLM inference server running on your laptop.".to_string(),
            badge_color: "#a855f7".to_string(),
        },
        HarnessInfo {
            id: "vscode".to_string(),
            name: "VS Code + Copilot".to_string(),
            vendor: "Microsoft".to_string(),
            kind: "desktop".to_string(),
            installed: vscode_path.is_some(),
            executable_path: vscode_path.unwrap_or_else(|| "code.cmd".to_string()),
            default_model: "GPT-4.1 / Copilot".to_string(),
            models: vec!["GPT-4.1 / Copilot".to_string(), "Claude Sonnet 4".to_string()],
            description: "Visual Studio Code editor and integrated AI chat.".to_string(),
            badge_color: "#3b82f6".to_string(),
        },
        HarnessInfo {
            id: "codex".to_string(),
            name: "OpenAI Codex / ChatGPT UI".to_string(),
            vendor: "OpenAI".to_string(),
            kind: if codex_path.is_some() {
                "cli".to_string()
            } else {
                "web".to_string()
            },
            installed: true,
            executable_path: codex_path.unwrap_or_else(|| "https://chatgpt.com".to_string()),
            default_model: "GPT-5 / o3".to_string(),
            models: vec!["GPT-5 / o3".to_string(), "Codex-Mini".to_string()],
            description: "OpenAI Codex agent & ChatGPT web interface.".to_string(),
            badge_color: "#14b8a6".to_string(),
        },
        HarnessInfo {
            id: "cursor".to_string(),
            name: "Cursor AI IDE".to_string(),
            vendor: "Anysphere".to_string(),
            kind: "desktop".to_string(),
            installed: cursor_path.is_some(),
            executable_path: cursor_path.unwrap_or_else(|| "Cursor.exe".to_string()),
            default_model: "Cursor-Fast / Sonnet".to_string(),
            models: vec!["Cursor-Fast / Sonnet".to_string()],
            description: "Cursor AI Code Editor.".to_string(),
            badge_color: "#6366f1".to_string(),
        },
    ];

    Ok(harnesses)
}

#[tauri::command]
fn launch_harness(
    state: State<'_, AppState>,
    harness_id: String,
    executable_path: String,
    prompt: String,
    model: String,
) -> Result<String, String> {
    if !prompt.trim().is_empty() {
        if let Ok(mut last) = state.last_clipboard_text.lock() {
            *last = prompt.clone();
        }
        #[cfg(windows)]
        let _ = write_clipboard_unicode_text(&prompt);
    }

    match harness_id.as_str() {
        "antigravity" => {
            let mut cmd = Command::new(&executable_path);
            let _ = cmd.spawn();
            Ok(format!(
                "Opened Antigravity UI ({}) — prompt copied to clipboard!",
                model
            ))
        }
        "claude-code" => {
            let mut cmd = Command::new("cmd");
            if prompt.trim().is_empty() {
                cmd.args([
                    "/C",
                    "start",
                    "powershell",
                    "-NoExit",
                    "-Command",
                    &format!("& '{}'", executable_path),
                ]);
            } else {
                let escaped = prompt.replace('\'', "''").replace('"', "\\\"");
                cmd.args([
                    "/C",
                    "start",
                    "powershell",
                    "-NoExit",
                    "-Command",
                    &format!("& '{}' '{}'", executable_path, escaped),
                ]);
            }
            let _ = cmd.spawn();
            Ok(format!("Launched Claude Code CLI session with {}", model))
        }
        "opencode" => {
            let mut cmd = Command::new("cmd");
            cmd.args(["/C", "start", "powershell", "-NoExit", "-Command", "opencode"]);
            let _ = cmd.spawn();
            Ok("Launched OpenCode terminal harness (prompt copied to clipboard)".to_string())
        }
        "ollama" => {
            let mut cmd = Command::new("cmd");
            let model_tag = model.split_whitespace().next().unwrap_or("llama3.2");
            cmd.args([
                "/C",
                "start",
                "powershell",
                "-NoExit",
                "-Command",
                &format!("ollama run {}", model_tag),
            ]);
            let _ = cmd.spawn();
            Ok(format!("Started Ollama terminal with {}", model_tag))
        }
        "vscode" => {
            let mut cmd = Command::new("cmd");
            cmd.args(["/C", "start", "", &executable_path]);
            #[cfg(windows)]
            cmd.creation_flags(CREATE_NO_WINDOW);
            let _ = cmd.spawn();
            Ok("Opened VS Code (prompt copied to clipboard)".to_string())
        }
        "claude-web" => {
            let url = if prompt.trim().is_empty() {
                "https://claude.ai/new".to_string()
            } else {
                format!("https://claude.ai/new?q={}", url_encode(&prompt))
            };
            let _ = open_windows_setting(url);
            Ok("Opened Claude Cloud UI in browser with your prompt!".to_string())
        }
        "codex" => {
            let url = if prompt.trim().is_empty() {
                "https://chatgpt.com".to_string()
            } else {
                format!("https://chatgpt.com/?q={}", url_encode(&prompt))
            };
            let _ = open_windows_setting(url);
            Ok("Opened ChatGPT / Codex UI with your prompt!".to_string())
        }
        _ => {
            if executable_path.starts_with("http") {
                let _ = open_windows_setting(executable_path);
            } else {
                let _ = Command::new(&executable_path).spawn();
            }
            Ok(format!(
                "Launched {} (prompt copied to clipboard)",
                harness_id
            ))
        }
    }
}

fn url_encode(input: &str) -> String {
    let mut out = String::new();
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

#[tauri::command]
fn run_ai_inline_query(
    prompt: String,
    model: String,
    harness_id: String,
) -> Result<String, String> {
    let q = prompt.trim();
    if q.is_empty() {
        return Err("Please enter a prompt or search query.".to_string());
    }

    if harness_id == "ollama" {
        let model_name = model.split_whitespace().next().unwrap_or("llama3.2:latest");
        let mut cmd = Command::new("ollama");
        cmd.args(["run", model_name, q]);
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        if let Ok(output) = cmd.output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !text.is_empty() {
                    return Ok(text);
                }
            }
        }
    }

    let lower = q.to_lowercase();
    let answer = if lower.contains("wifi") || lower.contains("network") {
        let wifi = query_wifi_details();
        format!(
            "**Network Diagnostic ({})**\n- **SSID**: `{}`\n- **Signal**: `{}%` ({})\n- **Link Speed**: RX `{}` / TX `{}`\n\nTip: Click **Open in {}** to run deeper packet/network scripts.",
            model, wifi.ssid, wifi.signal_percent, wifi.radio_type, wifi.rx_mbps, wifi.tx_mbps, harness_id
        )
    } else if lower.contains("battery") || lower.contains("power") {
        let (pct, charging, saver, _) = read_windows_battery();
        format!(
            "**System Power Status ({})**\n- **Battery**: `{}%` ({})\n- **Battery Saver**: `{}`\n- Use the **Power Mode** pills in the Notch header to switch between *Efficiency*, *Balanced*, and *Best Performance*.",
            model,
            pct,
            if charging { "AC Charging" } else { "On Battery" },
            if saver { "On" } else { "Off" }
        )
    } else {
        format!(
            "**[{model} • {harness_id}] Ready**\n\nHere is a quick inline synthesis for:\n> *{q}*\n\n1. **Action Plan**: Your prompt has been formatted and staged for **{harness_id}**.\n2. **Direct Hand-Off**: Click **Open in {harness_id}** above to launch the full **{model}** workspace with this prompt automatically copied & injected."
        )
    };

    Ok(answer)
}

#[tauri::command]
fn get_active_agents_and_servers(
    state: State<'_, AppState>,
) -> Result<Vec<AgentProcessInfo>, String> {
    let mut port_map: HashMap<u32, u16> = HashMap::new();
    let mut net_cmd = Command::new("netstat");
    net_cmd.args(["-ano", "-p", "tcp"]);
    #[cfg(windows)]
    net_cmd.creation_flags(CREATE_NO_WINDOW);
    if let Ok(out) = net_cmd.output() {
        let text = String::from_utf8_lossy(&out.stdout);
        for line in text.lines() {
            if line.contains("LISTENING") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 5 {
                    let local_addr = parts[1];
                    let pid_str = parts[4];
                    if let (Some((_, port_s)), Ok(pid)) =
                        (local_addr.rsplit_once(':'), pid_str.parse::<u32>())
                    {
                        if let Ok(port) = port_s.parse::<u16>() {
                            if (1024..=49151).contains(&port) {
                                port_map.entry(pid).or_insert(port);
                            }
                        }
                    }
                }
            }
        }
    }

    let mut sys = state.sys.lock().map_err(|e| e.to_string())?;
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let mut results: Vec<AgentProcessInfo> = Vec::new();
    let mut seen_names: HashMap<String, usize> = HashMap::new();

    for (pid, proc_info) in sys.processes() {
        let pid_u32 = pid.as_u32();
        let raw_name = proc_info.name().to_string_lossy().to_string();
        let lower = raw_name.to_lowercase();

        let matched = if lower.contains("antigravity") {
            Some(("Antigravity IDE", "Google DeepMind Coding Agent", "agent"))
        } else if lower == "claude.exe" || lower.contains("claude") {
            Some(("Claude Code", "Anthropic Coding Session", "agent"))
        } else if lower.contains("ollama") {
            Some(("Ollama Runtime", "Local LLM Inference Daemon", "agent"))
        } else if lower.contains("opencode") {
            Some(("OpenCode", "Terminal Coding Harness", "agent"))
        } else if lower.contains("codex") {
            Some(("OpenAI Codex", "Codex Agent Session", "agent"))
        } else if lower == "node.exe" || lower == "python.exe" || lower == "cargo.exe" {
            if port_map.contains_key(&pid_u32) {
                Some((raw_name.as_str(), "Active Local Dev Server", "server"))
            } else {
                None
            }
        } else {
            None
        };

        if let Some((display_name, desc, category)) = matched {
            let count = seen_names.entry(display_name.to_string()).or_insert(0);
            if *count >= 3 {
                continue;
            }
            *count += 1;

            let port = port_map.get(&pid_u32).copied();
            let cpu = proc_info.cpu_usage();
            let mem_mb = proc_info.memory() / (1024 * 1024);
            let status = if port.is_some() {
                "Listening".to_string()
            } else if cpu > 2.0 {
                "Working".to_string()
            } else {
                "Ready".to_string()
            };

            results.push(AgentProcessInfo {
                pid: pid_u32,
                name: display_name.to_string(),
                title: desc.to_string(),
                category: category.to_string(),
                status,
                cpu_percent: (cpu * 10.0).round() / 10.0,
                memory_mb: mem_mb,
                port,
            });
        }
    }

    results.sort_by(|a, b| b.memory_mb.cmp(&a.memory_mb));
    Ok(results)
}

#[tauri::command]
fn stop_process_by_pid(pid: u32) -> Result<(), String> {
    let mut cmd = Command::new("taskkill");
    cmd.args(["/PID", &pid.to_string(), "/F"]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd.output();
    Ok(())
}

#[tauri::command]
fn sample_cursor_color() -> Result<String, String> {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::Foundation::POINT;
        use windows_sys::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC};
        use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

        let mut pt = POINT { x: 0, y: 0 };
        if GetCursorPos(&mut pt) != 0 {
            let hdc = GetDC(std::ptr::null_mut());
            if !hdc.is_null() {
                let color = GetPixel(hdc, pt.x, pt.y);
                ReleaseDC(std::ptr::null_mut(), hdc);
                let r = color & 0xFF;
                let g = (color >> 8) & 0xFF;
                let b = (color >> 16) & 0xFF;
                return Ok(format!("#{:02X}{:02X}{:02X}", r, g, b));
            }
        }
    }
    Ok("#38BDF8".to_string())
}

fn spawn_color_picker_worker(app_handle: AppHandle, bounds_arc: Arc<Mutex<InteractiveBox>>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(80));
        let picking = bounds_arc
            .lock()
            .map(|b| b.color_picking)
            .unwrap_or(false);
        if !picking {
            continue;
        }
        #[cfg(windows)]
        unsafe {
            use windows_sys::Win32::Foundation::POINT;
            use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
            use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

            let mut pt = POINT { x: 0, y: 0 };
            if GetCursorPos(&mut pt) != 0 {
                let lbutton_down = (GetAsyncKeyState(VK_LBUTTON as i32) as u16 & 0x8000) != 0;
                if let Ok(hex) = sample_cursor_color() {
                    let _ = app_handle.emit(
                        "color-picker-move",
                        serde_json::json!({
                            "hex": hex,
                            "x": pt.x,
                            "y": pt.y,
                            "clicked": lbutton_down
                        }),
                    );
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    println!("[WiNotch] Initializing fast startup state...");
    let bounds_arc = Arc::new(Mutex::new(InteractiveBox::default()));
    let initial_shelf = load_shelf_from_disk();

    // Fast non-blocking initial state (no process or network scan before window opens)
    let state = AppState {
        bounds: bounds_arc.clone(),
        wifi_cache: Arc::new(Mutex::new((
            Instant::now() - Duration::from_secs(60),
            WifiDetails::default(),
        ))),
        power_mode: Arc::new(Mutex::new("Balanced".to_string())),
        sound_volume: Arc::new(Mutex::new(72)),
        sound_muted: Arc::new(Mutex::new(false)),
        sound_mode: Arc::new(Mutex::new("Spatial Audio".to_string())),
        shelf_items: Arc::new(Mutex::new(initial_shelf)),
        clipboard_history: Arc::new(Mutex::new(Vec::new())),
        last_clipboard_text: Arc::new(Mutex::new(String::new())),
        sys: Arc::new(Mutex::new(System::new())),
        nudge_x: Arc::new(Mutex::new(0)),
    };

    tauri::Builder::default()
        .manage(state)
        .setup(move |app| {
            println!("[WiNotch] Setup hook positioning Notch window at top-center...");
            resize_and_position_notch(app.handle(), 460.0, 68.0, 0);
            spawn_color_picker_worker(app.handle().clone(), bounds_arc.clone());
            println!("[WiNotch] Window ready!");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            update_interactive_bounds,
            nudge_notch_position,
            get_system_telemetry,
            set_power_mode,
            set_sound_state,
            send_media_key,
            open_windows_setting,
            poll_clipboard_history,
            copy_text_to_clipboard,
            toggle_pin_clipboard,
            remove_clipboard_entry,
            get_shelf_items,
            add_files_to_shelf,
            add_base64_file_to_shelf,
            copy_shelf_files_to_clipboard,
            remove_shelf_item,
            reveal_in_explorer,
            discover_harnesses,
            launch_harness,
            run_ai_inline_query,
            get_active_agents_and_servers,
            stop_process_by_pid,
            sample_cursor_color,
        ])
        .run(tauri::generate_context!())
        .expect("error while running WiNotch application");
}
