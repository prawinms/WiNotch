import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type {
  AgentProcessInfo,
  ClipboardEntry,
  HarnessInfo,
  ShelfItem,
  SystemTelemetry,
} from "./types";

const isTauriEnv = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

let fallbackClips: ClipboardEntry[] = [
  {
    id: "clip-1",
    content: "cargo tauri dev",
    kind: "code",
    pinned: true,
    timestamp: Math.floor(Date.now() / 1000) - 180,
  },
  {
    id: "clip-2",
    content: "https://github.com/Somafet/qnotch",
    kind: "link",
    pinned: true,
    timestamp: Math.floor(Date.now() / 1000) - 600,
  },
  {
    id: "clip-3",
    content:
      "WiNotch dynamic island for Windows 11 — hover to expand system details, temp file drop shelf, and AI harness launcher.",
    kind: "text",
    pinned: false,
    timestamp: Math.floor(Date.now() / 1000) - 1200,
  },
];

let fallbackShelf: ShelfItem[] = [];

export async function updateInteractiveBounds(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  expanded: boolean;
  pinned: boolean;
  gameModeOverride: string;
  colorPicking: boolean;
}): Promise<void> {
  if (!isTauriEnv()) return;
  try {
    await invoke("update_interactive_bounds", {
      x: params.x,
      y: params.y,
      width: params.width,
      height: params.height,
      expanded: params.expanded,
      pinned: params.pinned,
      gameModeOverride: params.gameModeOverride,
      colorPicking: params.colorPicking,
    });
  } catch {
    // ignore in non-tauri preview
  }
}

export async function nudgeNotchPosition(
  deltaX: number,
  resetCenter = false
): Promise<number> {
  if (!isTauriEnv()) return 0;
  try {
    return await invoke<number>("nudge_notch_position", {
      deltaX,
      resetCenter,
    });
  } catch {
    return 0;
  }
}

export async function getSystemTelemetry(): Promise<SystemTelemetry> {
  if (isTauriEnv()) {
    try {
      return await invoke<SystemTelemetry>("get_system_telemetry");
    } catch {
      // fall through
    }
  }
  return {
    battery_percent: 94,
    is_charging: true,
    battery_saver: false,
    remaining_mins: -1,
    power_mode: "Balanced",
    cpu_usage: 14.2,
    ram_used_gb: 9.4,
    ram_total_gb: 16.0,
    sound_volume: 72,
    sound_muted: false,
    sound_mode: "Spatial Audio",
    sound_device: "Realtek(R) Audio Speakers",
    wifi: {
      connected: true,
      ssid: "WiNotch_5G_Ultra",
      signal_percent: 96,
      radio_type: "802.11ax (Wi-Fi 6E)",
      band: "5 GHz",
      rx_mbps: "1201 Mbps",
      tx_mbps: "1201 Mbps",
      ipv4: "192.168.1.104",
    },
    fullscreen_active: false,
  };
}

export async function setPowerMode(mode: string): Promise<string> {
  if (isTauriEnv()) {
    try {
      return await invoke<string>("set_power_mode", { mode });
    } catch {
      // fall through
    }
  }
  return mode;
}

export async function setSoundState(params: {
  volume?: number;
  muted?: boolean;
  mode?: string;
}): Promise<void> {
  if (!isTauriEnv()) return;
  try {
    await invoke("set_sound_state", {
      volume: params.volume ?? null,
      muted: params.muted ?? null,
      mode: params.mode ?? null,
    });
  } catch {
    // ignore
  }
}

export async function sendMediaKey(
  action: "play_pause" | "next" | "prev"
): Promise<void> {
  if (!isTauriEnv()) return;
  try {
    await invoke("send_media_key", { action });
  } catch {
    // ignore
  }
}

export async function openWindowsSetting(uri: string): Promise<void> {
  if (isTauriEnv()) {
    try {
      await invoke("open_windows_setting", { uri });
      return;
    } catch {
      // fall through
    }
  }
  if (uri.startsWith("http")) {
    window.open(uri, "_blank");
  }
}

export async function pollClipboardHistory(): Promise<ClipboardEntry[]> {
  if (isTauriEnv()) {
    try {
      const items = await invoke<ClipboardEntry[]>("poll_clipboard_history");
      if (items.length > 0) return items;
    } catch {
      // fall through
    }
  }
  return fallbackClips;
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (isTauriEnv()) {
    try {
      await invoke("copy_text_to_clipboard", { text });
      return;
    } catch {
      // fall through
    }
  }
  await navigator.clipboard.writeText(text);
}

export async function togglePinClipboard(id: string): Promise<ClipboardEntry[]> {
  if (isTauriEnv()) {
    try {
      return await invoke<ClipboardEntry[]>("toggle_pin_clipboard", { id });
    } catch {
      // fall through
    }
  }
  fallbackClips = fallbackClips.map((c) =>
    c.id === id ? { ...c, pinned: !c.pinned } : c
  );
  return fallbackClips;
}

export async function removeClipboardEntry(
  id: string
): Promise<ClipboardEntry[]> {
  if (isTauriEnv()) {
    try {
      return await invoke<ClipboardEntry[]>("remove_clipboard_entry", { id });
    } catch {
      // fall through
    }
  }
  if (id === "__clear_unpinned__") {
    fallbackClips = fallbackClips.filter((c) => c.pinned);
  } else {
    fallbackClips = fallbackClips.filter((c) => c.id !== id);
  }
  return fallbackClips;
}

export async function getShelfItems(): Promise<ShelfItem[]> {
  if (isTauriEnv()) {
    try {
      return await invoke<ShelfItem[]>("get_shelf_items");
    } catch {
      // fall through
    }
  }
  return fallbackShelf;
}

export async function addFilesToShelf(paths: string[]): Promise<ShelfItem[]> {
  if (isTauriEnv()) {
    try {
      return await invoke<ShelfItem[]>("add_files_to_shelf", { paths });
    } catch {
      // fall through
    }
  }
  return fallbackShelf;
}

export async function addBase64FileToShelf(
  name: string,
  base64Data: string,
  sizeBytes = 0
): Promise<ShelfItem[]> {
  if (isTauriEnv()) {
    try {
      return await invoke<ShelfItem[]>("add_base64_file_to_shelf", {
        name,
        base64Data,
      });
    } catch {
      // fall through
    }
  }
  const ext = name.includes(".") ? name.split(".").pop() || "" : "";
  const isImg = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(
    ext.toLowerCase()
  );
  const newItem: ShelfItem = {
    id: `shelf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    path: `C:\\Users\\pravi\\AppData\\Roaming\\WiNotch\\shelf\\${name}`,
    original_path: name,
    size_bytes: sizeBytes || Math.round(base64Data.length * 0.75),
    kind: isImg ? "image" : "file",
    ext,
    preview_data_url: isImg ? base64Data : null,
    added_at: Math.floor(Date.now() / 1000),
  };
  fallbackShelf = [newItem, ...fallbackShelf];
  return fallbackShelf;
}

export async function copyShelfFilesToClipboard(
  paths: string[]
): Promise<string> {
  if (isTauriEnv()) {
    return await invoke<string>("copy_shelf_files_to_clipboard", { paths });
  }
  await navigator.clipboard.writeText(paths.join("\n"));
  return `Copied ${paths.length} item(s) to clipboard! Press Ctrl+V to paste.`;
}

export async function removeShelfItem(id: string): Promise<ShelfItem[]> {
  if (isTauriEnv()) {
    try {
      return await invoke<ShelfItem[]>("remove_shelf_item", { id });
    } catch {
      // fall through
    }
  }
  if (id === "__clear_all__") {
    fallbackShelf = [];
  } else {
    fallbackShelf = fallbackShelf.filter((i) => i.id !== id);
  }
  return fallbackShelf;
}

export async function revealInExplorer(path: string): Promise<void> {
  if (!isTauriEnv()) return;
  try {
    await invoke("reveal_in_explorer", { path });
  } catch {
    // ignore
  }
}

export async function discoverHarnesses(): Promise<HarnessInfo[]> {
  if (isTauriEnv()) {
    try {
      return await invoke<HarnessInfo[]>("discover_harnesses");
    } catch {
      // fall through
    }
  }
  return [
    {
      id: "antigravity",
      name: "Antigravity UI",
      vendor: "Google DeepMind",
      kind: "desktop",
      installed: true,
      executable_path:
        "C:\\Users\\pravi\\AppData\\Local\\Programs\\antigravity\\Antigravity.exe",
      default_model: "Gemini 2.5 Pro (Antigravity)",
      models: [
        "Gemini 2.5 Pro (Antigravity)",
        "Gemini 2.5 Flash",
        "Claude Sonnet 4.5 (via AGY)",
      ],
      description:
        "Agentic AI IDE & Coding Harness with full workspace orchestration.",
      badge_color: "#38bdf8",
    },
    {
      id: "claude-code",
      name: "Claude Code CLI & UI",
      vendor: "Anthropic",
      kind: "cli",
      installed: true,
      executable_path: "C:\\Users\\pravi\\.local\\bin\\claude.exe",
      default_model: "Claude Sonnet 4.5",
      models: ["Claude Sonnet 4.5", "Claude Opus 4.6", "Claude Haiku 4.5"],
      description: "Anthropic's agentic coding CLI & terminal session manager.",
      badge_color: "#f97316",
    },
    {
      id: "claude-web",
      name: "Claude Cloud UI",
      vendor: "Anthropic Web",
      kind: "web",
      installed: true,
      executable_path: "https://claude.ai/new",
      default_model: "Claude Sonnet 4.5",
      models: ["Claude Sonnet 4.5", "Claude Opus 4.6"],
      description:
        "Expand prompt directly to Claude Web UI with Artifacts & Projects.",
      badge_color: "#fb923c",
    },
    {
      id: "opencode",
      name: "OpenCode Harness",
      vendor: "OpenCode",
      kind: "cli",
      installed: true,
      executable_path: "C:\\Users\\pravi\\AppData\\Roaming\\npm\\opencode.ps1",
      default_model: "Claude Sonnet 4.5 / GPT-4.1",
      models: ["Claude Sonnet 4.5 / GPT-4.1", "DeepSeek R1", "Gemini 2.5 Pro"],
      description: "Terminal-native AI coding harness installed on your system.",
      badge_color: "#10b981",
    },
    {
      id: "ollama",
      name: "Ollama Local AI",
      vendor: "Ollama",
      kind: "local_api",
      installed: true,
      executable_path:
        "C:\\Users\\pravi\\AppData\\Local\\Programs\\Ollama\\ollama.exe",
      default_model: "llama3.2:latest",
      models: ["llama3.2:latest", "qwen2.5-coder:7b", "deepseek-r1:8b"],
      description: "Local LLM inference server running on your laptop.",
      badge_color: "#a855f7",
    },
    {
      id: "vscode",
      name: "VS Code + Copilot",
      vendor: "Microsoft",
      kind: "desktop",
      installed: true,
      executable_path:
        "C:\\Users\\pravi\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd",
      default_model: "GPT-4.1 / Copilot",
      models: ["GPT-4.1 / Copilot", "Claude Sonnet 4"],
      description: "Visual Studio Code editor and integrated AI chat.",
      badge_color: "#3b82f6",
    },
  ];
}

export async function launchHarness(params: {
  harnessId: string;
  executablePath: string;
  prompt: string;
  model: string;
}): Promise<string> {
  if (isTauriEnv()) {
    return await invoke<string>("launch_harness", {
      harnessId: params.harnessId,
      executablePath: params.executablePath,
      prompt: params.prompt,
      model: params.model,
    });
  }
  if (params.executablePath.startsWith("http")) {
    window.open(params.executablePath, "_blank");
  }
  return `Dispatched to ${params.harnessId} (${params.model}) — prompt copied!`;
}

export async function runAiInlineQuery(params: {
  prompt: string;
  model: string;
  harnessId: string;
}): Promise<string> {
  if (isTauriEnv()) {
    return await invoke<string>("run_ai_inline_query", {
      prompt: params.prompt,
      model: params.model,
      harnessId: params.harnessId,
    });
  }
  return `**[${params.model} • ${params.harnessId}]**\n\nProcessed query: *"${params.prompt}"*\n\nClick **Expand to Harness** to open the full ${params.harnessId} workspace with this prompt staged.`;
}

export async function getActiveAgentsAndServers(): Promise<AgentProcessInfo[]> {
  if (isTauriEnv()) {
    try {
      return await invoke<AgentProcessInfo[]>("get_active_agents_and_servers");
    } catch {
      // fall through
    }
  }
  return [
    {
      pid: 14820,
      name: "Antigravity IDE",
      title: "Google DeepMind Coding Agent",
      category: "agent",
      status: "Working",
      cpu_percent: 4.2,
      memory_mb: 412,
      port: null,
    },
    {
      pid: 9310,
      name: "Claude Code",
      title: "Anthropic Coding Session",
      category: "agent",
      status: "Ready",
      cpu_percent: 0.4,
      memory_mb: 128,
      port: null,
    },
    {
      pid: 22104,
      name: "node.exe",
      title: "Active Local Dev Server (Vite)",
      category: "server",
      status: "Listening",
      cpu_percent: 1.1,
      memory_mb: 96,
      port: 1420,
    },
  ];
}

export async function stopProcessByPid(pid: number): Promise<void> {
  if (!isTauriEnv()) return;
  try {
    await invoke("stop_process_by_pid", { pid });
  } catch {
    // ignore
  }
}

export function subscribeCursorState(
  callback: (state: { inside: boolean; dragging_button: boolean }) => void
): () => void {
  if (!isTauriEnv()) return () => {};
  let unlisten: (() => void) | null = null;
  listen<{ inside: boolean; dragging_button: boolean }>(
    "notch-cursor-state",
    (event) => {
      callback(event.payload);
    }
  ).then((fn) => {
    unlisten = fn;
  });
  return () => {
    if (unlisten) unlisten();
  };
}

export function subscribeColorPicker(
  callback: (data: {
    hex: string;
    x: number;
    y: number;
    clicked: boolean;
  }) => void
): () => void {
  if (!isTauriEnv()) return () => {};
  let unlisten: (() => void) | null = null;
  listen<{ hex: string; x: number; y: number; clicked: boolean }>(
    "color-picker-move",
    (event) => {
      callback(event.payload);
    }
  ).then((fn) => {
    unlisten = fn;
  });
  return () => {
    if (unlisten) unlisten();
  };
}

export function subscribeNativeFileDrop(
  onDrop: (paths: string[]) => void,
  onDragHover: (hovering: boolean) => void
): () => void {
  if (!isTauriEnv()) return () => {};
  let unlisten: (() => void) | null = null;
  try {
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over" || event.payload.type === "enter") {
          onDragHover(true);
        } else if (event.payload.type === "leave") {
          onDragHover(false);
        } else if (event.payload.type === "drop") {
          onDragHover(false);
          if (event.payload.paths && event.payload.paths.length > 0) {
            onDrop(event.payload.paths);
          }
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
  } catch {
    // ignore
  }
  return () => {
    if (unlisten) unlisten();
  };
}
