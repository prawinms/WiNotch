# How to Use WiNotch — Complete User Guide

Welcome to **WiNotch**, your Windows 11 Dynamic Notch overlay. This guide walks through every feature, interaction, and workflow.

---

## 1. Launching & Positioning the Notch

### Starting WiNotch
- **One-Click Launch**: Double-click **`Start-WiNotch.bat`** or **`WiNotch.exe`** in File Explorer.
- **From Terminal**:
  ```powershell
  cd C:\Users\pravi\OneDrive\Documents\WiNotch
  .\WiNotch.exe
  ```
- **Development Mode**: Run `npm start` to launch with live hot-reloading.

### Moving & Centering the Notch
- **Nudge Left or Right**: Click and drag horizontally on the **collapsed pill** (or on the **`WiNotch` logo** in the top-left of the expanded header) to slide the Notch out of the way of browser tabs or app titlebars.
- **Reset to Center**: **Double-click** the collapsed pill or the `WiNotch` header badge (or click **Center Notch** in the **Settings** tab) to snap it back to the exact horizontal center of your monitor.

---

## 2. Collapsed Pill View (Taskbar-Style Glance)

When collapsed at the top-center of your screen, the Notch Pill displays:
1. **Left Cluster**:
   - **Now Playing Media Badge**: Animated equalizer bars + current track title.
   - **Active Coding Agent Badge**: Shows the primary running coding agent (e.g., `Antigravity` or `Claude`) or the active **Countdown Timer** (`MM:SS`) when a timer is running.
2. **Right Cluster (Windows 11 System Tray View)**:
   - **Wi-Fi Status Icon**: Connected/disconnected state (hover for SSID & signal %).
   - **Sound Icon + Volume %**: Current master volume level or mute indicator.
   - **Battery Icon + Percentage**: Live battery percentage with a green lightning icon when AC charging.
   - **Clock (`HH:MM`)**: Tabular 24-hour clock (hover for full weekday and date).
3. **Glance Strip**: A slim pill underneath showing `SSID • Power Mode • Drop Shelf / Harness status`.

---

## 3. Hover Expansion & System Quick Details

Move your cursor over the collapsed pill to smoothly expand the Notch panel:

### Top System Detail Strip & Flyout Drawer
At the top of the expanded panel, you'll see three live status pills (**Wi-Fi**, **Power Mode**, and **Sound Mode**) and an expandable 3-column detail drawer:

1. **Wi-Fi Network Card**:
   - Shows your connected **Wi-Fi SSID name**, **Signal %**, **Radio Type** (e.g., `802.11ax`), and **Link Speed (Mbps)**.
   - Click **Networks ↗** to open the native Windows 11 Wi-Fi flyout (`ms-availablenetworks:`).
2. **Power Mode Card**:
   - Shows live **Battery %**, **AC / Battery state**, **CPU load %**, and **RAM used / total GB**.
   - Click **Efficiency**, **Balanced**, or **Performance** to immediately switch your Windows 11 Power Plan via `powercfg`.
3. **Sound & Volume Card**:
   - Drag the **Volume Slider (`0–100%`)** or click the **Speaker icon** to toggle mute.
   - Switch between **Standard**, **Spatial**, and **Voice Focus** sound presets, or click **Mixer ↗** to open Windows Sound Settings (`ms-settings:sound`).

> **Tip**: Click the **Pin icon** in the top-right header to keep the Notch open even when your mouse moves away. Click the **Up/Down chevron** to collapse or expand the 3-column System Detail drawer.

---

## 4. Temp Drag & Drop File/Image Shelf + `Ctrl+V` Pasting

Open the **Drop Shelf & Clip** tab (or use the quick card on the **Home** tab):

### Staging Dropped Files & Images
1. **Drag & Drop Any File**: Drag an image (`PNG`, `JPG`, `GIF`, `WebP`, `SVG`), document (`PDF`, `DOCX`, `XLSX`), archive (`ZIP`), or code file from Windows Explorer, your desktop, or a browser directly onto the Notch.
   - *Note*: Dragging a file over the collapsed pill automatically opens the **Drop Shelf** tab!
   - You can also click **`+ Drop / Add File`** in the tab bar to browse and stage files via the file dialog.
2. **Managed Temp Storage**: Dropped files are safely staged in `%APPDATA%\WiNotch\shelf\`, so removing them from the shelf never deletes your original files. Images automatically display a thumbnail preview.

### Pasting Staged Files Anywhere (`Ctrl+V` or Drag-Out)
- **Method A — Copy for `Ctrl+V` (Recommended)**:
  1. Click one or more items in the **Temporary Drop Shelf** to select them (a checkmark and blue highlight appear).
  2. Click **`Copy for Ctrl+V`** (or the copy icon on an individual row).
  3. WiNotch writes a native Windows **`CF_HDROP` Shell File Drop List** directly to your Windows Clipboard.
  4. Switch to **File Explorer, Desktop, Slack, Discord, WhatsApp, Teams, Outlook, or a browser upload box** and press **`Ctrl + V`** — the actual file(s) will be pasted!
- **Method B — Drag Out**:
  - Grab any item row in the Drop Shelf and drag it out into another application.
- **Reveal in Explorer**: Click the folder icon on any shelf item to highlight it in Windows File Explorer.

---

## 5. Clipboard History Manager

Located on the right side of the **Drop Shelf & Clip** tab:
- **Automatic Capture**: Any text, code snippet, or URL you copy (`Ctrl+C`) anywhere in Windows 11 is automatically captured and classified as `TEXT`, `CODE`, or `LINK`.
- **Filter & Search**: Type in the search box or click **`ALL`**, **`TEXT`**, **`CODE`**, **`LINK`**, or **`PINNED`** to filter your history.
- **One-Click Copy**: Click any entry (or its copy icon) to copy it back to the Windows Clipboard.
- **Pin Important Items**: Click the **Pin icon** on an entry so it stays at the top and is protected when you click **Clear Unpinned**.

---

## 6. AI Search Panel & Multi-Harness Integration

Open the **AI Search & Harness** tab (or press **`Ctrl + Alt + F`**):

### Selecting Your Harness & AI Model
1. **Installed Harness / UI Target Dropdown**:
   WiNotch automatically scans your laptop for installed AI tools and web harnesses:
   - **Antigravity UI** (`Antigravity.exe` / `agy`)
   - **Claude Code CLI & UI** (`claude.exe`)
   - **Claude Cloud UI** (`https://claude.ai/new`)
   - **OpenCode Harness** (`opencode.ps1`)
   - **Ollama Local AI** (`ollama.exe`)
   - **VS Code + Copilot** (`code.cmd`)
   - **OpenAI Codex / ChatGPT UI** (`https://chatgpt.com`)
2. **AI Model Selection Dropdown**:
   Pick the model associated with your selected harness (e.g., *Gemini 2.5 Pro (Antigravity)*, *Claude Sonnet 4.5*, *Claude Opus 4.6*, *llama3.2:latest*, *qwen2.5-coder:7b*, *GPT-5 / o3*).

### Running Queries & Expanding to Harnesses
- **Ask Inline**: Type a prompt in the search bar and press **`Enter`** (or click **Ask Inline**) to run an immediate query inside the Notch panel. (If **Ollama** is selected, it queries your local Ollama model directly!)
- **Open in Harness (`Expand to Harness`)**: Click **`Open in Antigravity`** (or any harness pill in the **Quick Hand-Off** row):
  - Automatically copies your prompt to the Windows Clipboard.
  - Launches or focuses the target desktop app (**Antigravity IDE**, **VS Code**), opens a live **Claude Code / OpenCode / Ollama** PowerShell session with your prompt, or opens **Claude Cloud UI / ChatGPT** in your browser with your query pre-filled!
- **Expand Drawer**: Click **Expand Drawer** in the top-right of the AI tab to vertically expand the Notch into a taller 624px workspace.

---

## 7. Active Coding Agents & Dev Servers (`Agents & Ports` Tab)

Open the **Agents & Ports** tab to monitor your development environment in real time:
- **Coding Agents**: Detects running instances of **Antigravity IDE**, **Claude Code**, **OpenCode**, **Ollama**, and **Codex**, showing their PID, CPU %, RAM usage (MB), and status (`Working` / `Ready`).
- **Active Local Dev Servers**: Scans listening TCP ports (`netstat -ano`) for `node.exe`, `cargo.exe`, and `python.exe` servers:
  - Click **`localhost:<port> ↗`** to open the running dev server in your browser.
  - Click **`Stop`** to terminate a runaway background dev server process.

---

## 8. Quick Tools (`Tools` Tab)

1. **Personal Scratchpad Note**:
   - Free-form text pad that auto-saves on every keystroke to local storage. Includes character count and a 1-click **Copy Note** button.
2. **Countdown & Pomodoro Timer**:
   - Choose a preset (**5m**, **15m**, **25m**, **45m**) and click **Start**.
   - While running, the live countdown appears right inside the **Collapsed Notch Pill**!
3. **Live Screen Pixel Color Picker**:
   - Click **Pick Screen Pixel**, move your cursor anywhere on your Windows 11 screen, and **left-click** to sample the exact pixel color (`HEX`).
   - Automatically copies the `HEX` code (e.g., `#38BDF8`) to your clipboard and saves it to your recent color swatches.

---

## 9. Home Tab Edit Mode & Settings

- **Reorder Home Cards**: On the **Home** tab, click the **Pencil icon** in the top-right header to enter **Edit Mode** (cards jiggle with a dashed border). Use the **`←`** and **`→`** buttons on any card to customize your grid layout.
- **Settings Tab**:
  - **Default Primary AI Harness Dropdown**: View all detected harnesses on your system with their exact executable paths and choose your default harness.
  - **Theme Surface**: Switch between *Obsidian Dark*, *OLED Pitch Black*, *Windows 11 Acrylic*, and *Daylight Frost*.
  - **Accent Color**: Choose between Cyan, Violet, Emerald, Orange, Rose, and Amber.
  - **Game Mode (`Ctrl+Alt+G`)**: Choose *Auto (Fullscreen Detect)*, *Always Interactive*, or *Force Passive Game Bar*.
  - **Weather City & GitHub Username**: Customize the city used for live Open-Meteo weather forecasts and the username displayed on the GitHub Contribution card.
