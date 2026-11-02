export interface WifiDetails {
  connected: boolean;
  ssid: string;
  signal_percent: number;
  radio_type: string;
  band: string;
  rx_mbps: string;
  tx_mbps: string;
  ipv4: string;
}

export interface SystemTelemetry {
  battery_percent: number;
  is_charging: boolean;
  battery_saver: boolean;
  remaining_mins: number;
  power_mode: string;
  cpu_usage: number;
  ram_used_gb: number;
  ram_total_gb: number;
  sound_volume: number;
  sound_muted: boolean;
  sound_mode: string;
  sound_device: string;
  wifi: WifiDetails;
  fullscreen_active: boolean;
}

export interface ShelfItem {
  id: string;
  name: string;
  path: string;
  original_path: string;
  size_bytes: number;
  kind: "image" | "code" | "document" | "archive" | "media" | "file" | string;
  ext: string;
  preview_data_url?: string | null;
  added_at: number;
}

export interface ClipboardEntry {
  id: string;
  content: string;
  kind: "text" | "code" | "link" | "files" | string;
  pinned: boolean;
  timestamp: number;
}

export interface HarnessInfo {
  id: string;
  name: string;
  vendor: string;
  kind: "desktop" | "cli" | "web" | "local_api" | string;
  installed: boolean;
  executable_path: string;
  default_model: string;
  models: string[];
  description: string;
  badge_color: string;
}

export interface AgentProcessInfo {
  pid: number;
  name: string;
  title: string;
  category: "agent" | "server" | string;
  status: "Working" | "Ready" | "Listening" | string;
  cpu_percent: number;
  memory_mb: number;
  port?: number | null;
}

export type TabId = "home" | "ai" | "shelf" | "agents" | "tools" | "settings";

export type CardId =
  | "system"
  | "media"
  | "shelf_quick"
  | "ai_quick"
  | "weather"
  | "github"
  | "tools_quick";

export interface NotchSettings {
  defaultHarnessId: string;
  defaultModel: string;
  hoverDwellMs: number;
  leaveDelayMs: number;
  accentColor: string;
  theme: "obsidian" | "oled" | "acrylic" | "light";
  gameModeOverride: "auto" | "on" | "off";
  showGlanceStrip: boolean;
  weatherCity: string;
  githubUsername: string;
  cardOrder: CardId[];
  hiddenCards: CardId[];
}

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  model: string;
  harnessName: string;
  timestamp: string;
}
