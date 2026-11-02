# WiNotch — Windows 11 Dynamic Notch Overlay

**WiNotch** is a fast, native-feeling **Windows 11 Dynamic Notch / Island overlay** built with **Tauri v2 (Rust + Win32 APIs)** and **React 18 + TypeScript**, inspired by [Somafet/qnotch](https://github.com/Somafet/qnotch).

It sits discreetly at the top-center of your primary display as a compact taskbar-style pill showing **Wi-Fi, Sound, Battery, Time, Now Playing media, and active Coding Agents**, and smoothly expands on hover to reveal detailed **Wi-Fi / Power Mode / Sound Mode controls**, a **Temporary Drag & Drop File/Image Shelf** (with native Windows `Ctrl+V` file pasting), **Clipboard History**, an **AI Search & Multi-Harness Switcher**, **Coding Agent & Port Monitor**, and **Quick Tools**.

---

## Documentation Index

- **[How to Use Guide (`docs/HOW_TO_USE.md`)](docs/HOW_TO_USE.md)** — Complete walkthrough of every tab, gesture, shortcut, and feature.
- **[Technical Architecture (`docs/ARCHITECTURE.md`)](docs/ARCHITECTURE.md)** — Deep dive into the Rust Win32 APIs (`CF_HDROP`, `GetSystemPowerStatus`, `GetPixel`, `powercfg`, `netsh`) and React state design.

---

## Feature Highlights

| Category | Features Included |
| :--- | :--- |
| **Collapsed Notch Pill** | Live **Wi-Fi icon**, **Sound Volume % / Mute icon**, **Battery % + Charging glyph**, **Clock (`HH:MM`)**, **Now Playing track + animated equalizer**, **Active Coding Agent badge**, and underneath **Glance Strip**. |
| **Hover System Details** | Expands on hover to show connected **Wi-Fi SSID, signal %, radio band (`802.11ax`), RX/TX Mbps**, **Power Mode switcher** (*Efficiency*, *Balanced*, *Best Performance* via `powercfg`), **Volume slider & Sound Mode** (*Standard*, *Spatial Audio*, *Voice Focus*), and live **CPU / RAM** telemetry. |
| **Temp Drag & Drop File Shelf** | Drop **images, documents, code, archives, or any file type** directly onto the Notch. Stages files in `%APPDATA%\WiNotch\shelf\`, renders image thumbnails, supports **multi-select + "Copy for Ctrl+V"** (writes native Windows `CF_HDROP` shell file drop list to the clipboard so pressing `Ctrl+V` anywhere pastes the actual file!), plus native drag-out. |
| **Clipboard History** | Automatically captures copied text, code snippets, and URLs from the Windows Clipboard (`CF_UNICODETEXT`). Filter by *All / Text / Code / Links / Pinned*, search, pin entries, and 1-click re-copy. |
| **AI Search & Multi-Harness** | Prompt search box + **AI Model Selector** + **Target Harness Selector**. Auto-discovers installed AI harnesses (**Antigravity UI**, **Claude Code CLI**, **Claude Cloud UI**, **OpenCode**, **Ollama**, **VS Code**, **OpenAI Codex**) and displays them in both the AI panel and **Settings Dropdown**. Supports inline AI queries and 1-click hand-off to your chosen harness UI. |
| **Coding Agents & Dev Servers** | Monitors running agent processes (`Antigravity`, `Claude Code`, `OpenCode`, `Ollama`) and active local dev server TCP ports (`:1420`, `:3000`, `:5173`, etc.) with CPU/RAM usage, **Open localhost:port**, and **Stop Process** buttons. |
| **Quick Tools & Home Cards** | Reorderable **Home Card Grid** (with Pencil Edit Mode), auto-saving **Scratchpad Note**, **Pomodoro / Countdown Timer**, **Live Screen Pixel Color Picker** (`Win32 GetPixel`), **Weather Forecast**, **GitHub Contribution Heatmap**, and **Auto Game Mode**. |

---

## Quick Start

### 1. Run the Standalone Executable
If `WiNotch.exe` has already been built in the project root, simply double-click **[Start-WiNotch.bat](Start-WiNotch.bat)** or run in PowerShell:

```powershell
.\WiNotch.exe
```

### 2. Build from Source / Development Mode

#### Prerequisites
- **Node.js** 18+ (tested with Node v24)
- **Rust & Cargo** (`stable-x86_64-pc-windows-msvc` configured automatically via [`rust-toolchain.toml`](rust-toolchain.toml))
- **Visual Studio C++ Build Tools** & **Microsoft Edge WebView2 Runtime** (pre-installed on Windows 11)

#### Commands
```powershell
# 1. Install frontend dependencies
npm install

# 2. Run in live development mode (with Vite HMR + Tauri window)
npm start

# 3. Build standalone executable with embedded frontend
npm run build
cd src-tauri
cargo build
Copy-Item "target\debug\winotch.exe" "..\WiNotch.exe" -Force
```

---

## Global Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| **`Ctrl + Alt + N`** | Toggle Notch panel (Expand / Collapse) |
| **`Ctrl + Alt + F`** | Open Notch directly to the **AI Search & Harness** tab |
| **`Ctrl + Alt + G`** | Cycle **Game Mode** (*Auto Fullscreen Detect* → *Force On* → *Force Off*) |
| **`Esc`** | Cancel Screen Color Picker or Collapse the Notch panel |
| **Double-Click Header / Pill** | Re-center the Notch horizontally on your monitor |

---

## Project Structure

```text
WiNotch/
├── docs/
│   ├── HOW_TO_USE.md          # Step-by-step user guide & workflows
│   └── ARCHITECTURE.md        # Rust Win32 & React technical architecture
├── src/
│   ├── App.tsx                # Main Notch UI (Pill, System Flyout, 6 Tabs, Cards)
│   ├── bridge.ts              # Typed Tauri IPC commands & native event listeners
│   ├── styles.css             # QNotch-inspired theme tokens, glassmorphism & animations
│   ├── types.ts               # Shared TypeScript interfaces
│   └── main.tsx               # React entry point
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs             # Rust backend (Win32 Battery, Wi-Fi, CF_HDROP, Harnesses, Agents)
│   │   └── main.rs            # Binary entry point
│   ├── capabilities/          # Tauri v2 window & webview permissions
│   ├── icons/                 # Application icons (.ico / .png)
│   ├── Cargo.toml             # Rust dependencies & custom-protocol configuration
│   └── tauri.conf.json        # Borderless transparent topmost window configuration
├── package.json               # Frontend scripts & dependencies
├── rust-toolchain.toml        # Pins x86_64 MSVC toolchain on Windows
└── Start-WiNotch.bat          # One-click desktop launcher
```

---

## License

MIT License — Inspired by [Somafet/qnotch](https://github.com/Somafet/qnotch).
