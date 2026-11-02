import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownUp,
  Battery,
  BatteryCharging,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Clock,
  CloudSun,
  Code2,
  Copy,
  Cpu,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  Gamepad2,
  GitBranch,
  HardDrive,
  Home,
  Image as ImageIcon,
  Layers,
  Link2,
  Maximize2,
  Minimize2,
  Music,
  Palette,
  Pause,
  Pencil,
  Pin,
  Pipette,
  Play,
  Plus,
  Power,
  RefreshCw,
  Search,
  Send,
  Server,
  Settings,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Wrench,
  Zap,
} from "lucide-react";
import {
  addBase64FileToShelf,
  addFilesToShelf,
  copyShelfFilesToClipboard,
  copyTextToClipboard,
  discoverHarnesses,
  getActiveAgentsAndServers,
  getShelfItems,
  getSystemTelemetry,
  launchHarness,
  nudgeNotchPosition,
  openWindowsSetting,
  pollClipboardHistory,
  removeClipboardEntry,
  removeShelfItem,
  revealInExplorer,
  runAiInlineQuery,
  sendMediaKey,
  setPowerMode,
  setSoundState,
  stopProcessByPid,
  subscribeColorPicker,
  subscribeCursorState,
  subscribeNativeFileDrop,
  togglePinClipboard,
  updateInteractiveBounds,
} from "./bridge";
import type {
  AgentProcessInfo,
  AiChatMessage,
  CardId,
  ClipboardEntry,
  HarnessInfo,
  NotchSettings,
  ShelfItem,
  SystemTelemetry,
  TabId,
} from "./types";

const DEFAULT_SETTINGS: NotchSettings = {
  defaultHarnessId: "antigravity",
  defaultModel: "Gemini 2.5 Pro (Antigravity)",
  hoverDwellMs: 110,
  leaveDelayMs: 380,
  accentColor: "#38bdf8",
  theme: "obsidian",
  gameModeOverride: "auto",
  showGlanceStrip: true,
  weatherCity: "Bengaluru",
  githubUsername: "prawinms",
  cardOrder: [
    "system",
    "ai_quick",
    "shelf_quick",
    "media",
    "weather",
    "tools_quick",
    "github",
  ],
  hiddenCards: [],
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function App() {
  // Shell states
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [sysFlyoutOpen, setSysFlyoutOpen] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [aiDrawerExpanded, setAiDrawerExpanded] = useState(false);
  const [dragHovering, setDragHovering] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Settings persisted in localStorage
  const [settings, setSettings] = useState<NotchSettings>(() => {
    try {
      const saved = localStorage.getItem("winotch_settings_v1");
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    try {
      localStorage.setItem("winotch_settings_v1", JSON.stringify(settings));
    } catch {
      // ignore
    }
    document.documentElement.style.setProperty("--accent", settings.accentColor);
    document.documentElement.setAttribute("data-theme", settings.theme);
  }, [settings]);

  // Live Clock
  const [nowTime, setNowTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNowTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Telemetry state
  const [telemetry, setTelemetry] = useState<SystemTelemetry>({
    battery_percent: 95,
    is_charging: true,
    battery_saver: false,
    remaining_mins: -1,
    power_mode: "Balanced",
    cpu_usage: 12.0,
    ram_used_gb: 8.6,
    ram_total_gb: 16.0,
    sound_volume: 72,
    sound_muted: false,
    sound_mode: "Spatial Audio",
    sound_device: "Speakers (Realtek Audio)",
    wifi: {
      connected: true,
      ssid: "Connected Wi-Fi",
      signal_percent: 94,
      radio_type: "802.11ax (Wi-Fi 6)",
      band: "5 GHz",
      rx_mbps: "866 Mbps",
      tx_mbps: "866 Mbps",
      ipv4: "192.168.1.104",
    },
    fullscreen_active: false,
  });

  // Clipboard & Temp Drop Shelf states
  const [clips, setClips] = useState<ClipboardEntry[]>([]);
  const [clipFilter, setClipFilter] = useState<"all" | "text" | "code" | "link" | "pinned">("all");
  const [clipSearch, setClipSearch] = useState("");

  const [shelfItems, setShelfItems] = useState<ShelfItem[]>([]);
  const [selectedShelfIds, setSelectedShelfIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // AI Harnesses & Chat states
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([]);
  const [selectedHarnessId, setSelectedHarnessId] = useState<string>(settings.defaultHarnessId);
  const [selectedModel, setSelectedModel] = useState<string>(settings.defaultModel);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([
    {
      id: "welcome-ai",
      role: "assistant",
      content:
        "Ready! Type any prompt or question above, pick a model, and either run an **Inline Query** right here in the Notch or click **Expand to Harness** to open **Antigravity UI**, **Claude UI**, **OpenCode**, or **Ollama**.",
      model: "Gemini 2.5 Pro (Antigravity)",
      harnessName: "Antigravity UI",
      timestamp: "Now",
    },
  ]);

  // Active Coding Agents & Dev Servers
  const [agentsAndServers, setAgentsAndServers] = useState<AgentProcessInfo[]>([]);

  // Media Player State
  const [mediaPlaying, setMediaPlaying] = useState(true);
  const [mediaTrackIndex, setMediaTrackIndex] = useState(0);
  const tracks = useMemo(
    () => [
      { title: "Midnight City", artist: "M83 • Hurry Up, We're Dreaming", albumColor: "#6366f1" },
      { title: "Starboy", artist: "The Weeknd, Daft Punk", albumColor: "#ec4899" },
      { title: "Veridis Quo", artist: "Daft Punk • Discovery", albumColor: "#0ea5e9" },
    ],
    []
  );
  const currentTrack = tracks[mediaTrackIndex % tracks.length];

  // Quick Tools State: Scratchpad Note, Timer, Screen Color Picker
  const [scratchNote, setScratchNote] = useState<string>(() => {
    return (
      localStorage.getItem("winotch_note_v1") ||
      "Quick scratchpad note — automatically saved locally.\n• Drop files onto the Notch to stage them for Ctrl+V pasting\n• Use AI tab to dispatch prompts to Antigravity or Claude"
    );
  });
  useEffect(() => {
    localStorage.setItem("winotch_note_v1", scratchNote);
  }, [scratchNote]);

  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number>(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      setTimerSecondsLeft((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          showToast("Timer finished! Time is up.");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  const [colorPicking, setColorPicking] = useState(false);
  const [pickedColor, setPickedColor] = useState("#38BDF8");
  const [colorHistory, setColorHistory] = useState<string[]>([
    "#38BDF8",
    "#A855F7",
    "#10B981",
    "#F97316",
    "#F43F5E",
  ]);

  // Weather Data
  const [weatherTemp, setWeatherTemp] = useState<number>(27);
  const [weatherCondition, setWeatherCondition] = useState<string>("Partly Cloudy");

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((curr) => (curr === msg ? null : curr));
    }, 2800);
  };

  // Load initial data & periodic refresh
  useEffect(() => {
    discoverHarnesses().then((list) => {
      setHarnesses(list);
      const found =
        list.find((h) => h.id === settings.defaultHarnessId && h.installed) ||
        list.find((h) => h.installed) ||
        list[0];
      if (found) {
        setSelectedHarnessId(found.id);
        setSelectedModel(found.default_model);
      }
    });
    getShelfItems().then(setShelfItems);
    pollClipboardHistory().then(setClips);
    getSystemTelemetry().then(setTelemetry);
    getActiveAgentsAndServers().then(setAgentsAndServers);

    const fastInterval = setInterval(() => {
      getSystemTelemetry().then(setTelemetry);
      pollClipboardHistory().then(setClips);
    }, 2200);

    const slowInterval = setInterval(() => {
      getActiveAgentsAndServers().then(setAgentsAndServers);
    }, 6000);

    return () => {
      clearInterval(fastInterval);
      clearInterval(slowInterval);
    };
  }, []);

  // Fetch real weather for city using Open-Meteo geocoding + forecast
  useEffect(() => {
    let cancelled = false;
    const city = settings.weatherCity.trim() || "Bengaluru";
    fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        city
      )}&count=1`
    )
      .then((r) => r.json())
      .then((geo) => {
        if (cancelled || !geo.results || !geo.results[0]) return;
        const { latitude, longitude } = geo.results[0];
        return fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
        );
      })
      .then((r) => (r ? r.json() : null))
      .then((wx) => {
        if (cancelled || !wx || !wx.current_weather) return;
        setWeatherTemp(Math.round(wx.current_weather.temperature));
        const code = wx.current_weather.weathercode;
        if (code === 0) setWeatherCondition("Clear Sky");
        else if (code <= 3) setWeatherCondition("Partly Cloudy");
        else if (code <= 67) setWeatherCondition("Light Rain");
        else setWeatherCondition("Thunderstorm");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [settings.weatherCity]);

  // Synchronize interactive bounds with Tauri Win32 hit-test worker
  useEffect(() => {
    const isGameBar =
      settings.gameModeOverride === "on" ||
      (settings.gameModeOverride === "auto" && telemetry.fullscreen_active);

    if (isGameBar) {
      updateInteractiveBounds({
        x: 0,
        y: 0,
        width: 568,
        height: 30,
        expanded: false,
        pinned: false,
        gameModeOverride: settings.gameModeOverride,
        colorPicking,
      });
      return;
    }

    if (expanded) {
      const h = aiDrawerExpanded ? 624 : 490;
      updateInteractiveBounds({
        x: 0,
        y: 0,
        width: 760,
        height: h,
        expanded: true,
        pinned,
        gameModeOverride: settings.gameModeOverride,
        colorPicking,
      });
    } else {
      updateInteractiveBounds({
        x: 0,
        y: 0,
        width: 460,
        height: settings.showGlanceStrip ? 68 : 44,
        expanded: false,
        pinned,
        gameModeOverride: settings.gameModeOverride,
        colorPicking,
      });
    }
  }, [
    expanded,
    pinned,
    aiDrawerExpanded,
    settings.gameModeOverride,
    settings.showGlanceStrip,
    telemetry.fullscreen_active,
    colorPicking,
  ]);

  // Hover dwell & leave timers
  const dwellTimerRef = useRef<number | null>(null);
  const leaveTimerRef = useRef<number | null>(null);

  const handleEnterNotch = (draggingExternal = false) => {
    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    if (draggingExternal) {
      setDragHovering(true);
      setExpanded(true);
      setActiveTab("shelf");
      return;
    }
    if (!expanded) {
      if (dwellTimerRef.current) window.clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = window.setTimeout(() => {
        setExpanded(true);
      }, settings.hoverDwellMs);
    }
  };

  const handleLeaveNotch = () => {
    if (dwellTimerRef.current) {
      window.clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
    if (pinned || editMode || colorPicking) return;
    if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = window.setTimeout(() => {
      setExpanded(false);
      setAiDrawerExpanded(false);
      setDragHovering(false);
    }, settings.leaveDelayMs);
  };

  // Subscribe to native Rust cursor enter/leave & native file drop & color picker
  useEffect(() => {
    const unsubCursor = subscribeCursorState(({ inside, dragging_button }) => {
      if (inside) {
        handleEnterNotch(dragging_button);
      } else {
        handleLeaveNotch();
      }
    });

    const unsubDrop = subscribeNativeFileDrop(
      async (paths) => {
        const updated = await addFilesToShelf(paths);
        setShelfItems(updated);
        setSelectedShelfIds(updated.slice(0, paths.length).map((i) => i.id));
        setExpanded(true);
        setActiveTab("shelf");
        showToast(`Added ${paths.length} dropped file(s) to Temp Shelf!`);
      },
      (hovering) => {
        setDragHovering(hovering);
        if (hovering) {
          setExpanded(true);
          setActiveTab("shelf");
        }
      }
    );

    const unsubColor = subscribeColorPicker(({ hex, clicked }) => {
      setPickedColor(hex);
      if (clicked) {
        setColorPicking(false);
        setColorHistory((prev) => [hex, ...prev.filter((c) => c !== hex)].slice(0, 8));
        copyTextToClipboard(hex);
        showToast(`Picked & copied screen color ${hex}`);
      }
    });

    return () => {
      unsubCursor();
      unsubDrop();
      unsubColor();
    };
  }, [pinned, editMode, colorPicking, expanded, settings.hoverDwellMs, settings.leaveDelayMs]);

  // Keyboard shortcuts inside window (Esc to close, Ctrl+Alt+F search, Ctrl+Alt+G game mode)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (colorPicking) {
          setColorPicking(false);
          return;
        }
        setPinned(false);
        setExpanded(false);
        setAiDrawerExpanded(false);
      } else if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "f") {
        setExpanded(true);
        setActiveTab("ai");
      } else if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "n") {
        setExpanded((prev) => !prev);
      } else if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "g") {
        const modes: Array<"auto" | "on" | "off"> = ["auto", "on", "off"];
        const next =
          modes[(modes.indexOf(settings.gameModeOverride) + 1) % modes.length];
        setSettings((s) => ({ ...s, gameModeOverride: next }));
        showToast(`Game Mode: ${next.toUpperCase()}`);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [colorPicking, settings.gameModeOverride]);

  // HTML5 Drag & Drop handlers (works in both browser preview & WebView)
  const handleHtmlDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragHovering) setDragHovering(true);
    if (!expanded) {
      setExpanded(true);
      setActiveTab("shelf");
    }
  };

  const handleHtmlDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragHovering(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    let latest: ShelfItem[] = shelfItems;
    for (const file of files) {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsDataURL(file);
      });
      latest = await addBase64FileToShelf(file.name, dataUrl, file.size);
    }
    setShelfItems(latest);
    setSelectedShelfIds(latest.slice(0, files.length).map((x) => x.id));
    setExpanded(true);
    setActiveTab("shelf");
    showToast(`Saved ${files.length} dropped file(s) to Temp Shelf!`);
  };

  const handleBrowseFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    let latest = shelfItems;
    for (const file of files) {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsDataURL(file);
      });
      latest = await addBase64FileToShelf(file.name, dataUrl, file.size);
    }
    setShelfItems(latest);
    setSelectedShelfIds(latest.slice(0, files.length).map((x) => x.id));
    showToast(`Added ${files.length} file(s) to Temp Shelf!`);
    e.target.value = "";
  };

  // Copy selected Shelf files to Windows Clipboard (CF_HDROP) for Ctrl+V pasting anywhere
  const handleCopySelectedShelfToClipboard = async () => {
    const targets =
      selectedShelfIds.length > 0
        ? shelfItems.filter((i) => selectedShelfIds.includes(i.id))
        : shelfItems.slice(0, 1);

    if (targets.length === 0) {
      showToast("Drop or select at least one file first.");
      return;
    }

    try {
      const msg = await copyShelfFilesToClipboard(targets.map((t) => t.path));
      showToast(msg);
    } catch (err) {
      showToast(`Clipboard error: ${String(err)}`);
    }
  };

  // Current selected AI harness object
  const activeHarness = useMemo(() => {
    return (
      harnesses.find((h) => h.id === selectedHarnessId) ||
      harnesses[0] || {
        id: "antigravity",
        name: "Antigravity UI",
        vendor: "Google DeepMind",
        kind: "desktop",
        installed: true,
        executable_path: "Antigravity.exe",
        default_model: "Gemini 2.5 Pro (Antigravity)",
        models: ["Gemini 2.5 Pro (Antigravity)", "Gemini 2.5 Flash"],
        description: "Agentic AI IDE & Coding Harness",
        badge_color: "#38bdf8",
      }
    );
  }, [harnesses, selectedHarnessId]);

  const handleRunInlineAi = async () => {
    if (!aiPrompt.trim()) return;
    const userQ = aiPrompt.trim();
    const userMsg: AiChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: userQ,
      model: selectedModel,
      harnessName: activeHarness.name,
      timestamp: nowTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiLoading(true);
    try {
      const reply = await runAiInlineQuery({
        prompt: userQ,
        model: selectedModel,
        harnessId: activeHarness.id,
      });
      setAiMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: reply,
          model: selectedModel,
          harnessName: activeHarness.name,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
    } catch (e) {
      showToast(String(e));
    } finally {
      setAiLoading(false);
    }
  };

  const handleExpandToHarness = async (targetHarness?: HarnessInfo) => {
    const h = targetHarness || activeHarness;
    try {
      const res = await launchHarness({
        harnessId: h.id,
        executablePath: h.executable_path,
        prompt: aiPrompt,
        model: selectedModel,
      });
      showToast(res);
    } catch (e) {
      showToast(String(e));
    }
  };

  // Horizontal pill drag / nudge
  const dragStartXRef = useRef<number | null>(null);
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (e.detail === 2) {
      nudgeNotchPosition(0, true);
      showToast("Notch centered on monitor");
      return;
    }
    dragStartXRef.current = e.screenX;
    const onMove = (mv: MouseEvent) => {
      if (dragStartXRef.current !== null) {
        const dx = mv.screenX - dragStartXRef.current;
        if (Math.abs(dx) > 8) {
          nudgeNotchPosition(dx, false);
          dragStartXRef.current = mv.screenX;
        }
      }
    };
    const onUp = () => {
      dragStartXRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Filtered clipboard items
  const filteredClips = useMemo(() => {
    return clips.filter((c) => {
      if (clipFilter === "pinned" && !c.pinned) return false;
      if (
        clipFilter !== "all" &&
        clipFilter !== "pinned" &&
        c.kind !== clipFilter
      ) {
        return false;
      }
      if (
        clipSearch.trim() &&
        !c.content.toLowerCase().includes(clipSearch.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [clips, clipFilter, clipSearch]);

  // Move card order in Edit Mode
  const moveCard = (cardId: CardId, dir: -1 | 1) => {
    setSettings((prev) => {
      const arr = [...prev.cardOrder];
      const idx = arr.indexOf(cardId);
      if (idx === -1) return prev;
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return prev;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return { ...prev, cardOrder: arr };
    });
  };

  const formattedClock = nowTime.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const formattedDate = nowTime.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const isGameBar =
    settings.gameModeOverride === "on" ||
    (settings.gameModeOverride === "auto" && telemetry.fullscreen_active);

  if (isGameBar) {
    return (
      <div className="notch-stage">
        <div className="notch-shell game-bar">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Gamepad2 size={12} color="var(--accent)" />
            <strong>GAME MODE</strong>
            <span>• {currentTrack.title}</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
            <span>CPU {telemetry.cpu_usage.toFixed(0)}%</span>
            <span>
              RAM {telemetry.ram_used_gb.toFixed(1)}/{telemetry.ram_total_gb.toFixed(0)}G
            </span>
            <span>BAT {telemetry.battery_percent}%</span>
            <span>{formattedClock}</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="notch-stage"
      onDragOver={handleHtmlDragOver}
      onDrop={handleHtmlDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={handleBrowseFiles}
      />

      <div
        className={`notch-shell ${expanded ? "expanded" : "collapsed"} ${
          dragHovering ? "drag-ready" : ""
        } ${aiDrawerExpanded ? "drawer-open" : ""}`}
        onMouseEnter={() => handleEnterNotch(false)}
        onMouseLeave={handleLeaveNotch}
        onClick={() => {
          if (!expanded) setExpanded(true);
        }}
      >
        {/* ================= COLLAPSED PILL VIEW (Windows 11 Taskbar + QNotch Pill) ================= */}
        {!expanded && (
          <div className="pill-row" onMouseDown={handleHeaderMouseDown}>
            <div className="pill-left">
              <span className="pill-brand-dot" />
              {dragHovering ? (
                <span className="pill-agent-chip">
                  <Upload size={11} /> Drop files into Temp Shelf
                </span>
              ) : timerRunning ? (
                <span className="pill-agent-chip">
                  <Clock size={11} />
                  {Math.floor(timerSecondsLeft / 60)}:
                  {String(timerSecondsLeft % 60).padStart(2, "0")}
                </span>
              ) : (
                <>
                  <div className="pill-media-badge">
                    {mediaPlaying && (
                      <span className="eq-bars">
                        <span />
                        <span />
                        <span />
                      </span>
                    )}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {currentTrack.title}
                    </span>
                  </div>
                  {agentsAndServers.length > 0 && (
                    <span className="pill-agent-chip" title="Active Coding Agents">
                      <Bot size={11} />
                      {agentsAndServers[0].name.split(" ")[0]}
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Windows 11 Taskbar System Tray Icons: Wi-Fi, Sound, Battery, Time */}
            <div className="pill-tray-cluster">
              <span
                className="tray-item"
                title={`Wi-Fi: ${telemetry.wifi.ssid} (${telemetry.wifi.signal_percent}%)`}
              >
                {telemetry.wifi.connected ? (
                  <Wifi size={13.5} color="var(--text-primary)" />
                ) : (
                  <WifiOff size={13.5} color="var(--danger)" />
                )}
              </span>

              <span
                className="tray-item"
                title={`Sound: ${telemetry.sound_volume}% (${telemetry.sound_mode})`}
              >
                {telemetry.sound_muted || telemetry.sound_volume === 0 ? (
                  <VolumeX size={13.5} color="var(--warning)" />
                ) : (
                  <Volume2 size={13.5} />
                )}
                <span style={{ fontSize: 11 }}>{telemetry.sound_volume}%</span>
              </span>

              <span
                className="tray-item"
                title={`Battery: ${telemetry.battery_percent}% (${telemetry.power_mode})`}
              >
                {telemetry.is_charging ? (
                  <BatteryCharging size={14} color="var(--success)" />
                ) : (
                  <Battery size={14} />
                )}
                <span>{telemetry.battery_percent}%</span>
              </span>

              <span className="tray-divider" />

              <span className="tray-clock" title={formattedDate}>
                {formattedClock}
              </span>
            </div>
          </div>
        )}

        {/* ================= EXPANDED NOTCH PANEL ================= */}
        {expanded && (
          <>
            {/* Top Header Bar with Hover-Expanded System Quick Details */}
            <div className="panel-top-header">
              <div className="header-left">
                <div
                  className="brand-badge"
                  onMouseDown={handleHeaderMouseDown}
                  title="Drag horizontally to move Notch • Double-click to center"
                >
                  <span className="pill-brand-dot" />
                  <span>WiNotch</span>
                </div>

                {/* System Quick Detail Pills (Wi-Fi Name, Power Mode, Sound Mode, Clock) */}
                <div className="sys-detail-strip">
                  <button
                    className={`sys-pill-btn ${sysFlyoutOpen ? "active" : ""}`}
                    onClick={() => setSysFlyoutOpen((v) => !v)}
                    title="Click to toggle detailed Wi-Fi, Power Mode & Sound Mode controls"
                  >
                    {telemetry.wifi.connected ? (
                      <Wifi size={13} color="var(--accent)" />
                    ) : (
                      <WifiOff size={13} color="var(--danger)" />
                    )}
                    <span>{telemetry.wifi.ssid}</span>
                    <span className="sys-pill-sub">
                      {telemetry.wifi.signal_percent}%
                    </span>
                  </button>

                  <button
                    className={`sys-pill-btn ${sysFlyoutOpen ? "active" : ""}`}
                    onClick={() => setSysFlyoutOpen((v) => !v)}
                    title="Power Mode & Battery Status"
                  >
                    {telemetry.is_charging ? (
                      <BatteryCharging size={13} color="var(--success)" />
                    ) : (
                      <Zap size={13} color="var(--warning)" />
                    )}
                    <span>{telemetry.battery_percent}%</span>
                    <span className="sys-pill-sub">• {telemetry.power_mode}</span>
                  </button>

                  <button
                    className={`sys-pill-btn ${sysFlyoutOpen ? "active" : ""}`}
                    onClick={() => setSysFlyoutOpen((v) => !v)}
                    title="Sound Mode & Output Volume"
                  >
                    {telemetry.sound_muted ? (
                      <VolumeX size={13} color="var(--warning)" />
                    ) : (
                      <Volume2 size={13} color="var(--accent)" />
                    )}
                    <span>{telemetry.sound_volume}%</span>
                    <span className="sys-pill-sub">• {telemetry.sound_mode}</span>
                  </button>
                </div>
              </div>

              {/* Right Header Controls: Time, Edit Mode, Pin, Collapse */}
              <div className="header-actions">
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginRight: 4,
                  }}
                >
                  {formattedDate} • {formattedClock}
                </span>

                <button
                  className={`icon-btn ${sysFlyoutOpen ? "active" : ""}`}
                  onClick={() => setSysFlyoutOpen((v) => !v)}
                  title="Show/Hide System Quick Details Drawer"
                >
                  {sysFlyoutOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {activeTab === "home" && (
                  <button
                    className={`icon-btn ${editMode ? "active" : ""}`}
                    onClick={() => setEditMode((v) => !v)}
                    title="Edit & Reorder Home Cards"
                  >
                    <Pencil size={13.5} />
                  </button>
                )}

                <button
                  className={`icon-btn ${pinned ? "active" : ""}`}
                  onClick={() => setPinned((v) => !v)}
                  title={pinned ? "Unpin Notch Panel" : "Pin Notch Open"}
                >
                  <Pin size={13.5} />
                </button>

                <button
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPinned(false);
                    setExpanded(false);
                    setAiDrawerExpanded(false);
                  }}
                  title="Collapse to Pill (Esc)"
                >
                  <Minimize2 size={13.5} />
                </button>
              </div>
            </div>

            {/* ================= HOVER SYSTEM DETAIL FLYOUT (Wi-Fi Name, Power Mode, Sound Mode) ================= */}
            {sysFlyoutOpen && (
              <div className="sys-flyout-bar">
                {/* Wi-Fi Detail Box */}
                <div className="sys-flyout-card">
                  <div className="sys-flyout-title">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Wifi size={12} color="var(--accent)" /> WI-FI NETWORK
                    </span>
                    <button
                      className="LinkButton"
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--accent)",
                        fontSize: 10.5,
                        cursor: "pointer",
                      }}
                      onClick={() => openWindowsSetting("ms-availablenetworks:")}
                    >
                      Networks ↗
                    </button>
                  </div>
                  <div className="sys-flyout-main">
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {telemetry.wifi.ssid}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--success)" }}>
                      {telemetry.wifi.signal_percent}%
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--text-secondary)",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>{telemetry.wifi.radio_type}</span>
                    <span>↓ {telemetry.wifi.rx_mbps}</span>
                  </div>
                </div>

                {/* Power Mode Detail Box */}
                <div className="sys-flyout-card">
                  <div className="sys-flyout-title">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Power size={12} color="var(--warning)" /> POWER MODE
                    </span>
                    <span style={{ color: "var(--text-primary)" }}>
                      {telemetry.battery_percent}%{" "}
                      {telemetry.is_charging ? "(AC)" : "(Bat)"}
                    </span>
                  </div>
                  <div className="mode-chip-group">
                    {[
                      { label: "Efficiency", full: "Best Power Efficiency" },
                      { label: "Balanced", full: "Balanced" },
                      { label: "Performance", full: "Best Performance" },
                    ].map((pm) => (
                      <button
                        key={pm.full}
                        className={`mode-chip ${
                          telemetry.power_mode === pm.full ? "selected" : ""
                        }`}
                        onClick={async () => {
                          await setPowerMode(pm.full);
                          setTelemetry((t) => ({ ...t, power_mode: pm.full }));
                          showToast(`Switched Windows Power Mode to ${pm.full}`);
                        }}
                      >
                        {pm.label}
                      </button>
                    ))}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--text-secondary)",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>CPU {telemetry.cpu_usage.toFixed(0)}%</span>
                    <span>
                      RAM {telemetry.ram_used_gb.toFixed(1)}/
                      {telemetry.ram_total_gb.toFixed(0)} GB
                    </span>
                  </div>
                </div>

                {/* Sound Mode Detail Box */}
                <div className="sys-flyout-card">
                  <div className="sys-flyout-title">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Volume2 size={12} color="var(--accent)" /> SOUND & VOLUME
                    </span>
                    <button
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--accent)",
                        fontSize: 10.5,
                        cursor: "pointer",
                      }}
                      onClick={() => openWindowsSetting("ms-settings:sound")}
                    >
                      Mixer ↗
                    </button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <button
                      className="icon-btn"
                      style={{ width: 22, height: 22 }}
                      onClick={async () => {
                        const nextMute = !telemetry.sound_muted;
                        await setSoundState({ muted: nextMute });
                        setTelemetry((t) => ({ ...t, sound_muted: nextMute }));
                      }}
                    >
                      {telemetry.sound_muted ? (
                        <VolumeX size={12} color="var(--warning)" />
                      ) : (
                        <Volume2 size={12} />
                      )}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={telemetry.sound_muted ? 0 : telemetry.sound_volume}
                      onChange={async (e) => {
                        const v = Number(e.target.value);
                        setTelemetry((t) => ({
                          ...t,
                          sound_volume: v,
                          sound_muted: v === 0,
                        }));
                        await setSoundState({ volume: v });
                      }}
                      style={{ flex: 1, accentColor: "var(--accent)", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: 11, width: 28, textAlign: "right" }}>
                      {telemetry.sound_volume}%
                    </span>
                  </div>
                  <div className="mode-chip-group">
                    {["Standard", "Spatial Audio", "Voice Focus"].map((sm) => (
                      <button
                        key={sm}
                        className={`mode-chip ${
                          telemetry.sound_mode === sm ? "selected" : ""
                        }`}
                        onClick={async () => {
                          await setSoundState({ mode: sm });
                          setTelemetry((t) => ({ ...t, sound_mode: sm }));
                          showToast(`Sound Mode: ${sm}`);
                        }}
                      >
                        {sm.replace(" Audio", "")}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ================= QNOTCH TAB STRIP ================= */}
            <div className="tab-strip">
              <div className="tab-list">
                <button
                  className={`tab-btn ${activeTab === "home" ? "active" : ""}`}
                  onClick={() => setActiveTab("home")}
                >
                  <Home size={13.5} /> Home
                </button>
                <button
                  className={`tab-btn ${activeTab === "ai" ? "active" : ""}`}
                  onClick={() => setActiveTab("ai")}
                >
                  <Sparkles size={13.5} /> AI Search & Harness
                  <span className="tab-badge">
                    {harnesses.filter((h) => h.installed).length}
                  </span>
                </button>
                <button
                  className={`tab-btn ${activeTab === "shelf" ? "active" : ""}`}
                  onClick={() => setActiveTab("shelf")}
                >
                  <Layers size={13.5} /> Drop Shelf & Clip
                  {shelfItems.length > 0 && (
                    <span className="tab-badge">{shelfItems.length}</span>
                  )}
                </button>
                <button
                  className={`tab-btn ${activeTab === "agents" ? "active" : ""}`}
                  onClick={() => setActiveTab("agents")}
                >
                  <Bot size={13.5} /> Agents & Ports
                  <span className="tab-badge">{agentsAndServers.length}</span>
                </button>
                <button
                  className={`tab-btn ${activeTab === "tools" ? "active" : ""}`}
                  onClick={() => setActiveTab("tools")}
                >
                  <Wrench size={13.5} /> Tools
                </button>
                <button
                  className={`tab-btn ${activeTab === "settings" ? "active" : ""}`}
                  onClick={() => setActiveTab("settings")}
                >
                  <Settings size={13.5} /> Settings
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  className="btn btn-soft"
                  style={{ padding: "4px 9px", fontSize: 11 }}
                  onClick={() => {
                    setActiveTab("shelf");
                    fileInputRef.current?.click();
                  }}
                >
                  <Upload size={12} /> + Drop / Add File
                </button>
              </div>
            </div>

            {/* ================= TAB CONTENT BODY ================= */}
            <div className="tab-body">
              {/* ---------- 1. HOME TAB (QNotch Modular Cards) ---------- */}
              {activeTab === "home" && (
                <div className="home-grid">
                  {settings.cardOrder.map((cardId, idx) => {
                    if (cardId === "system") {
                      return (
                        <div
                          key={cardId}
                          className={`q-card ${editMode ? "edit-jiggle" : ""}`}
                        >
                          <div className="card-header">
                            <span className="card-title-cluster">
                              <Cpu size={13} color="var(--accent)" /> System Live
                            </span>
                            {editMode ? (
                              <span style={{ display: "flex", gap: 3 }}>
                                <button
                                  className="icon-btn"
                                  style={{ width: 20, height: 20 }}
                                  onClick={() => moveCard(cardId, -1)}
                                >
                                  ←
                                </button>
                                <button
                                  className="icon-btn"
                                  style={{ width: 20, height: 20 }}
                                  onClick={() => moveCard(cardId, 1)}
                                >
                                  →
                                </button>
                              </span>
                            ) : (
                              <span style={{ fontSize: 10.5 }}>#{idx + 1}</span>
                            )}
                          </div>
                          <div>
                            <div className="metric-row">
                              <span>CPU Load</span>
                              <strong>{telemetry.cpu_usage.toFixed(1)}%</strong>
                            </div>
                            <div className="bar-track">
                              <div
                                className="bar-fill"
                                style={{
                                  width: `${Math.min(100, telemetry.cpu_usage)}%`,
                                }}
                              />
                            </div>
                            <div className="metric-row" style={{ marginTop: 7 }}>
                              <span>Memory</span>
                              <strong>
                                {telemetry.ram_used_gb.toFixed(1)} /{" "}
                                {telemetry.ram_total_gb.toFixed(0)} GB
                              </strong>
                            </div>
                            <div className="bar-track">
                              <div
                                className="bar-fill"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (telemetry.ram_used_gb /
                                      Math.max(1, telemetry.ram_total_gb)) *
                                      100
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: 10.5,
                              color: "var(--text-secondary)",
                              marginTop: 6,
                              display: "flex",
                              justifyContent: "space-between",
                            }}
                          >
                            <span>Wi-Fi: {telemetry.wifi.ssid}</span>
                            <span>{telemetry.power_mode}</span>
                          </div>
                        </div>
                      );
                    }

                    if (cardId === "ai_quick") {
                      return (
                        <div
                          key={cardId}
                          className={`q-card ${editMode ? "edit-jiggle" : ""}`}
                        >
                          <div className="card-header">
                            <span className="card-title-cluster">
                              <Sparkles size={13} color="var(--accent)" /> AI Harness
                              Quick Search
                            </span>
                            <button
                              className="icon-btn"
                              style={{ width: 22, height: 22 }}
                              onClick={() => setActiveTab("ai")}
                              title="Open Full AI Panel"
                            >
                              <Maximize2 size={11.5} />
                            </button>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", gap: 4 }}>
                              <select
                                className="ui-select"
                                style={{ flex: 1, fontSize: 11, padding: "4px 6px" }}
                                value={selectedHarnessId}
                                onChange={(e) => {
                                  const h = harnesses.find(
                                    (x) => x.id === e.target.value
                                  );
                                  setSelectedHarnessId(e.target.value);
                                  if (h) setSelectedModel(h.default_model);
                                }}
                              >
                                {harnesses.map((h) => (
                                  <option key={h.id} value={h.id}>
                                    {h.installed ? "● " : "○ "}
                                    {h.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div style={{ display: "flex", gap: 5 }}>
                              <input
                                className="ui-input"
                                style={{ flex: 1, fontSize: 11.5 }}
                                placeholder={`Ask ${activeHarness.name}...`}
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    setActiveTab("ai");
                                    handleRunInlineAi();
                                  }
                                }}
                              />
                              <button
                                className="btn btn-accent"
                                style={{ padding: "5px 8px" }}
                                onClick={() => {
                                  setActiveTab("ai");
                                  handleRunInlineAi();
                                }}
                                title="Run AI Search"
                              >
                                <Send size={12} />
                              </button>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                fontSize: 10.5,
                                color: "var(--text-secondary)",
                              }}
                            >
                              <span
                                style={{
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  maxWidth: 115,
                                }}
                              >
                                {selectedModel}
                              </span>
                              <button
                                className="btn btn-soft"
                                style={{ padding: "2px 7px", fontSize: 10 }}
                                onClick={() => handleExpandToHarness()}
                              >
                                Expand UI ↗
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (cardId === "shelf_quick") {
                      return (
                        <div
                          key={cardId}
                          className={`q-card ${editMode ? "edit-jiggle" : ""}`}
                        >
                          <div className="card-header">
                            <span className="card-title-cluster">
                              <Layers size={13} color="var(--accent)" /> Temp Drop
                              Shelf & Clip
                            </span>
                            <button
                              className="icon-btn"
                              style={{ width: 22, height: 22 }}
                              onClick={() => setActiveTab("shelf")}
                            >
                              <Maximize2 size={11.5} />
                            </button>
                          </div>
                          <div
                            className={`drop-zone-box ${
                              dragHovering ? "dragging" : ""
                            }`}
                            onClick={() => setActiveTab("shelf")}
                            style={{ padding: "7px 9px" }}
                          >
                            <div style={{ fontSize: 11 }}>
                              <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                                {shelfItems.length > 0
                                  ? `${shelfItems.length} file(s) staged in Shelf`
                                  : "Drop files or images here"}
                              </div>
                              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                                {clips[0]
                                  ? `Clip: ${clips[0].content.slice(0, 26)}...`
                                  : "Ready for Ctrl+V paste"}
                              </div>
                            </div>
                            <Upload size={15} color="var(--accent)" />
                          </div>
                          <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
                            <button
                              className="btn btn-soft"
                              style={{ flex: 1, padding: "4px 6px", fontSize: 10.5 }}
                              onClick={handleCopySelectedShelfToClipboard}
                            >
                              <Copy size={11} /> Copy File (Ctrl+V)
                            </button>
                            <button
                              className="btn"
                              style={{ padding: "4px 7px", fontSize: 10.5 }}
                              onClick={() => {
                                if (clips[0]) {
                                  copyTextToClipboard(clips[0].content);
                                  showToast("Copied latest clipboard text!");
                                }
                              }}
                            >
                              <Clipboard size={11} />
                            </button>
                          </div>
                        </div>
                      );
                    }

                    if (cardId === "media") {
                      return (
                        <div
                          key={cardId}
                          className={`q-card ${editMode ? "edit-jiggle" : ""}`}
                        >
                          <div className="card-header">
                            <span className="card-title-cluster">
                              <Music size={13} color="var(--accent)" /> Now Playing
                            </span>
                            <span style={{ fontSize: 10, color: "var(--accent)" }}>
                              System Audio
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: 9,
                                background: `linear-gradient(135deg, ${currentTrack.albumColor}, #0f172a)`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              <Music size={18} color="#fff" />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div
                                style={{
                                  fontSize: 12.5,
                                  fontWeight: 700,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {currentTrack.title}
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "var(--text-secondary)",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {currentTrack.artist}
                              </div>
                            </div>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 10,
                              marginTop: 6,
                            }}
                          >
                            <button
                              className="icon-btn"
                              onClick={() => {
                                setMediaTrackIndex((i) => (i - 1 + tracks.length) % tracks.length);
                                sendMediaKey("prev");
                              }}
                            >
                              <SkipBack size={13} />
                            </button>
                            <button
                              className="icon-btn active"
                              style={{ width: 32, height: 28 }}
                              onClick={() => {
                                setMediaPlaying((p) => !p);
                                sendMediaKey("play_pause");
                              }}
                            >
                              {mediaPlaying ? <Pause size={14} /> : <Play size={14} />}
                            </button>
                            <button
                              className="icon-btn"
                              onClick={() => {
                                setMediaTrackIndex((i) => (i + 1) % tracks.length);
                                sendMediaKey("next");
                              }}
                            >
                              <SkipForward size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    }

                    if (cardId === "weather") {
                      return (
                        <div
                          key={cardId}
                          className={`q-card ${editMode ? "edit-jiggle" : ""}`}
                        >
                          <div className="card-header">
                            <span className="card-title-cluster">
                              <CloudSun size={13} color="var(--warning)" />{" "}
                              {settings.weatherCity}
                            </span>
                            <span style={{ fontSize: 10 }}>yr.no / Meteo</span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "baseline",
                              justifyContent: "space-between",
                            }}
                          >
                            <span style={{ fontSize: 24, fontWeight: 700 }}>
                              {weatherTemp}°C
                            </span>
                            <span
                              style={{ fontSize: 11.5, color: "var(--text-secondary)" }}
                            >
                              {weatherCondition}
                            </span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: 10.5,
                              color: "var(--text-secondary)",
                              marginTop: 6,
                              borderTop: "1px solid var(--border-subtle)",
                              paddingTop: 5,
                            }}
                          >
                            <span>Tomorrow {weatherTemp + 1}°</span>
                            <span>Thu {weatherTemp - 1}°</span>
                            <span>Fri {weatherTemp}°</span>
                          </div>
                        </div>
                      );
                    }

                    if (cardId === "tools_quick") {
                      return (
                        <div
                          key={cardId}
                          className={`q-card ${editMode ? "edit-jiggle" : ""}`}
                        >
                          <div className="card-header">
                            <span className="card-title-cluster">
                              <Wrench size={13} color="var(--accent)" /> Quick Tools
                            </span>
                            <button
                              className="icon-btn"
                              style={{ width: 22, height: 22 }}
                              onClick={() => setActiveTab("tools")}
                            >
                              <Maximize2 size={11.5} />
                            </button>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 6,
                            }}
                          >
                            <div>
                              <div style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>
                                Focus Timer
                              </div>
                              <div style={{ fontSize: 16, fontWeight: 700 }}>
                                {Math.floor(timerSecondsLeft / 60)}:
                                {String(timerSecondsLeft % 60).padStart(2, "0")}
                              </div>
                            </div>
                            <button
                              className={`btn ${timerRunning ? "btn-accent" : "btn-soft"}`}
                              style={{ padding: "4px 9px", fontSize: 11 }}
                              onClick={() => setTimerRunning((r) => !r)}
                            >
                              {timerRunning ? "Pause" : "Start"}
                            </button>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              marginTop: 6,
                              gap: 6,
                            }}
                          >
                            <button
                              className={`btn ${colorPicking ? "btn-accent" : ""}`}
                              style={{ flex: 1, padding: "4px 7px", fontSize: 10.5 }}
                              onClick={() => {
                                setColorPicking(true);
                                showToast("Move cursor anywhere & click to sample pixel!");
                              }}
                            >
                              <Pipette size={11.5} /> Pick Screen Color
                            </button>
                            <span
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: 6,
                                background: pickedColor,
                                border: "1px solid rgba(255,255,255,0.25)",
                                cursor: "pointer",
                              }}
                              title={`Click to copy ${pickedColor}`}
                              onClick={() => {
                                copyTextToClipboard(pickedColor);
                                showToast(`Copied ${pickedColor}`);
                              }}
                            />
                          </div>
                        </div>
                      );
                    }

                    if (cardId === "github") {
                      return (
                        <div
                          key={cardId}
                          className={`q-card span-2 ${editMode ? "edit-jiggle" : ""}`}
                        >
                          <div className="card-header">
                            <span className="card-title-cluster">
                              <GitBranch size={13} color="var(--success)" /> GitHub
                              Contributions (@{settings.githubUsername})
                            </span>
                            <span style={{ fontSize: 11, color: "var(--success)" }}>
                              418 contributions • 34 day streak
                            </span>
                          </div>
                          <div className="gh-heatmap">
                            {Array.from({ length: 72 }).map((_, i) => {
                              const lv = (i * 7 + 3) % 5;
                              return (
                                <div
                                  key={i}
                                  className={`gh-cell ${lv > 0 ? `lv-${lv}` : ""}`}
                                />
                              );
                            })}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: 10.5,
                              color: "var(--text-secondary)",
                              marginTop: 6,
                            }}
                          >
                            <span>
                              Active Agents: {agentsAndServers.length} running
                            </span>
                            <span>
                              Installed Harnesses:{" "}
                              {harnesses
                                .filter((h) => h.installed)
                                .map((h) => h.name.split(" ")[0])
                                .join(", ")}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              )}

              {/* ---------- 2. AI SEARCH & MULTI-HARNESS PANEL ---------- */}
              {activeTab === "ai" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    height: "100%",
                  }}
                >
                  {/* Top Selector Row: Installed Harness Dropdown + Model Selector + Expand Toggle */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.1fr 1.1fr auto auto",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <label
                        style={{ fontSize: 10.5, color: "var(--text-secondary)" }}
                      >
                        INSTALLED HARNESS / UI TARGET
                      </label>
                      <select
                        className="ui-select"
                        value={selectedHarnessId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setSelectedHarnessId(id);
                          const h = harnesses.find((x) => x.id === id);
                          if (h) setSelectedModel(h.default_model);
                        }}
                      >
                        {harnesses.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.installed ? "✓ " : "○ "}
                            {h.name} ({h.vendor})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <label
                        style={{ fontSize: 10.5, color: "var(--text-secondary)" }}
                      >
                        AI MODEL SELECTION
                      </label>
                      <select
                        className="ui-select"
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                      >
                        {activeHarness.models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <label style={{ fontSize: 10.5, opacity: 0 }}>Action</label>
                      <button
                        className="btn btn-accent"
                        onClick={() => handleExpandToHarness()}
                        title={`Launch or focus ${activeHarness.name} with current prompt`}
                      >
                        <ExternalLink size={13} /> Open in {activeHarness.name.split(" ")[0]}
                      </button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <label style={{ fontSize: 10.5, opacity: 0 }}>Drawer</label>
                      <button
                        className={`btn ${aiDrawerExpanded ? "btn-soft" : ""}`}
                        onClick={() => setAiDrawerExpanded((v) => !v)}
                        title="Expand Notch Drawer for larger multi-harness workspace"
                      >
                        <Maximize2 size={12.5} />{" "}
                        {aiDrawerExpanded ? "Compact" : "Expand Drawer"}
                      </button>
                    </div>
                  </div>

                  {/* Search / Prompt Bar */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        background: "rgba(0,0,0,0.32)",
                        border: "1px solid var(--border-strong)",
                        borderRadius: 10,
                        padding: "0 10px",
                      }}
                    >
                      <Search size={14} color="var(--accent)" />
                      <input
                        className="ui-input"
                        style={{
                          border: "none",
                          background: "transparent",
                          flex: 1,
                          padding: "8px 2px",
                          fontSize: 12.5,
                        }}
                        placeholder={`Search or prompt ${selectedModel} via ${activeHarness.name}...`}
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRunInlineAi();
                        }}
                      />
                    </div>
                    <button
                      className="btn btn-soft"
                      onClick={handleRunInlineAi}
                      disabled={aiLoading}
                    >
                      <Send size={13} /> {aiLoading ? "Running..." : "Ask Inline"}
                    </button>
                  </div>

                  {/* Quick One-Click Expand Harness Bar (Antigravity UI, Claude UI, OpenCode, Ollama) */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>
                      Quick Hand-Off:
                    </span>
                    {harnesses.slice(0, 5).map((h) => (
                      <button
                        key={h.id}
                        className="btn"
                        style={{
                          padding: "3px 8px",
                          fontSize: 10.5,
                          borderColor:
                            h.id === selectedHarnessId
                              ? "var(--accent-border)"
                              : undefined,
                        }}
                        onClick={() => handleExpandToHarness(h)}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 99,
                            background: h.badge_color,
                          }}
                        />
                        {h.name} ↗
                      </button>
                    ))}
                  </div>

                  {/* Chat / Output Stream */}
                  <div
                    style={{
                      flex: 1,
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      paddingRight: 4,
                    }}
                  >
                    {aiMessages.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          background:
                            m.role === "user"
                              ? "var(--accent-soft)"
                              : "var(--bg-card)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: 11,
                          padding: "8px 11px",
                          fontSize: 12,
                          lineHeight: 1.45,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 10,
                            color: "var(--text-secondary)",
                            marginBottom: 4,
                          }}
                        >
                          <strong>
                            {m.role === "user"
                              ? "You"
                              : `${m.harnessName} • ${m.model}`}
                          </strong>
                          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span>{m.timestamp}</span>
                            <button
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--accent)",
                                cursor: "pointer",
                                fontSize: 10,
                              }}
                              onClick={() => {
                                copyTextToClipboard(m.content);
                                showToast("Copied message to clipboard");
                              }}
                            >
                              Copy
                            </button>
                          </span>
                        </div>
                        <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ---------- 3. TEMP DRAG & DROP FILE SHELF + CLIPBOARD TAB ---------- */}
              {activeTab === "shelf" && (
                <div className="shelf-clip-layout">
                  {/* Left Column: Temp File & Image Drop Shelf */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Layers size={14} color="var(--accent)" /> Temporary Drop
                        Shelf ({shelfItems.length})
                      </span>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button
                          className="btn btn-accent"
                          style={{ padding: "4px 9px", fontSize: 11 }}
                          onClick={handleCopySelectedShelfToClipboard}
                          title="Copies selected files to Windows System Clipboard (CF_HDROP) so Ctrl+V pastes the actual file anywhere!"
                        >
                          <Copy size={11.5} /> Copy for Ctrl+V (
                          {selectedShelfIds.length || (shelfItems.length ? 1 : 0)})
                        </button>
                        {shelfItems.length > 0 && (
                          <button
                            className="btn"
                            style={{ padding: "4px 7px", fontSize: 11 }}
                            onClick={async () => {
                              const next = await removeShelfItem("__clear_all__");
                              setShelfItems(next);
                              setSelectedShelfIds([]);
                              showToast("Cleared Temp Drop Shelf");
                            }}
                          >
                            <Trash2 size={11.5} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Drop Target Area */}
                    <div
                      className={`drop-zone-box ${dragHovering ? "dragging" : ""}`}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>
                          Drag & Drop Images or Any File Type Here
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>
                          Select staged items and click "Copy for Ctrl+V" to paste
                          files into Explorer, Slack, Discord, Browser, or drag out
                        </div>
                      </div>
                      <Upload size={18} color="var(--accent)" />
                    </div>

                    {/* Staged Shelf Items List */}
                    <div className="shelf-list">
                      {shelfItems.length === 0 ? (
                        <div
                          style={{
                            textAlign: "center",
                            padding: "24px 12px",
                            color: "var(--text-muted)",
                            fontSize: 11.5,
                          }}
                        >
                          No files in Temp Shelf yet. Drag any image, document, ZIP,
                          or code file onto the Notch!
                        </div>
                      ) : (
                        shelfItems.map((item) => {
                          const isSelected = selectedShelfIds.includes(item.id);
                          return (
                            <div
                              key={item.id}
                              className={`shelf-item-row ${
                                isSelected ? "selected" : ""
                              }`}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", item.path);
                                if (item.preview_data_url) {
                                  e.dataTransfer.setData(
                                    "DownloadURL",
                                    `application/octet-stream:${item.name}:${item.preview_data_url}`
                                  );
                                }
                              }}
                              onClick={() => {
                                setSelectedShelfIds((prev) =>
                                  prev.includes(item.id)
                                    ? prev.filter((x) => x !== item.id)
                                    : [...prev, item.id]
                                );
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  minWidth: 0,
                                  flex: 1,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  style={{ accentColor: "var(--accent)" }}
                                />
                                {item.preview_data_url ? (
                                  <img
                                    src={item.preview_data_url}
                                    alt={item.name}
                                    className="shelf-thumb"
                                  />
                                ) : (
                                  <div className="shelf-thumb">
                                    {item.kind === "image" ? (
                                      <ImageIcon size={15} color="var(--accent)" />
                                    ) : item.kind === "code" ? (
                                      <Code2 size={15} color="var(--success)" />
                                    ) : (
                                      <FileText size={15} color="var(--text-secondary)" />
                                    )}
                                  </div>
                                )}
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div
                                    style={{
                                      fontSize: 11.5,
                                      fontWeight: 600,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                  >
                                    {item.name}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 10,
                                      color: "var(--text-secondary)",
                                    }}
                                  >
                                    {formatBytes(item.size_bytes)} •{" "}
                                    {item.kind.toUpperCase()}
                                  </div>
                                </div>
                              </div>

                              <div
                                style={{ display: "flex", gap: 4 }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  className="icon-btn"
                                  style={{ width: 24, height: 24 }}
                                  title="Copy this file to Windows Clipboard (Ctrl+V)"
                                  onClick={async () => {
                                    const msg = await copyShelfFilesToClipboard([
                                      item.path,
                                    ]);
                                    showToast(msg);
                                  }}
                                >
                                  <Copy size={12} />
                                </button>
                                <button
                                  className="icon-btn"
                                  style={{ width: 24, height: 24 }}
                                  title="Reveal in Windows Explorer"
                                  onClick={() => revealInExplorer(item.path)}
                                >
                                  <FolderOpen size={12} />
                                </button>
                                <button
                                  className="icon-btn"
                                  style={{ width: 24, height: 24 }}
                                  title="Remove from Shelf"
                                  onClick={async () => {
                                    const next = await removeShelfItem(item.id);
                                    setShelfItems(next);
                                  }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Right Column: Clipboard History Manager */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Clipboard size={14} color="var(--accent)" /> Clipboard
                        History ({clips.length})
                      </span>
                      <button
                        className="btn"
                        style={{ padding: "3px 8px", fontSize: 10.5 }}
                        onClick={async () => {
                          const next = await removeClipboardEntry(
                            "__clear_unpinned__"
                          );
                          setClips(next);
                          showToast("Cleared unpinned clipboard entries");
                        }}
                      >
                        Clear Unpinned
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: 5 }}>
                      <input
                        className="ui-input"
                        style={{ flex: 1, fontSize: 11.5, padding: "5px 8px" }}
                        placeholder="Filter copied text, code, links..."
                        value={clipSearch}
                        onChange={(e) => setClipSearch(e.target.value)}
                      />
                      {(["all", "text", "code", "link", "pinned"] as const).map(
                        (f) => (
                          <button
                            key={f}
                            className={`mode-chip ${
                              clipFilter === f ? "selected" : ""
                            }`}
                            style={{ flex: "none", padding: "4px 7px" }}
                            onClick={() => setClipFilter(f)}
                          >
                            {f.toUpperCase()}
                          </button>
                        )
                      )}
                    </div>

                    <div className="clip-list">
                      {filteredClips.map((clip) => (
                        <div key={clip.id} className="clip-item-row">
                          <div
                            style={{
                              minWidth: 0,
                              flex: 1,
                              cursor: "pointer",
                            }}
                            onClick={() => {
                              copyTextToClipboard(clip.content);
                              showToast("Copied to clipboard!");
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                marginBottom: 2,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 9.5,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  padding: "1px 5px",
                                  borderRadius: 4,
                                  background: "var(--accent-soft)",
                                  color: "var(--accent)",
                                }}
                              >
                                {clip.kind}
                              </span>
                              {clip.pinned && (
                                <Pin size={10} color="var(--warning)" />
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: 11.5,
                                fontFamily:
                                  clip.kind === "code"
                                    ? "var(--font-mono)"
                                    : "var(--font-ui)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {clip.content}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              className="icon-btn"
                              style={{ width: 24, height: 24 }}
                              title="Copy text"
                              onClick={() => {
                                copyTextToClipboard(clip.content);
                                showToast("Copied to clipboard!");
                              }}
                            >
                              <Copy size={11.5} />
                            </button>
                            <button
                              className={`icon-btn ${clip.pinned ? "active" : ""}`}
                              style={{ width: 24, height: 24 }}
                              title="Pin entry"
                              onClick={async () => {
                                const next = await togglePinClipboard(clip.id);
                                setClips(next);
                              }}
                            >
                              <Pin size={11.5} />
                            </button>
                            <button
                              className="icon-btn"
                              style={{ width: 24, height: 24 }}
                              title="Delete entry"
                              onClick={async () => {
                                const next = await removeClipboardEntry(clip.id);
                                setClips(next);
                              }}
                            >
                              <Trash2 size={11.5} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ---------- 4. ACTIVE CODING AGENTS & DEV SERVERS TAB ---------- */}
              {activeTab === "agents" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        Active Coding Agents & Local Dev Servers
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        Live monitoring of running Antigravity, Claude Code, OpenCode,
                        Ollama & listening localhost ports
                      </div>
                    </div>
                    <button
                      className="btn btn-soft"
                      onClick={async () => {
                        const list = await getActiveAgentsAndServers();
                        setAgentsAndServers(list);
                        showToast("Refreshed active agent & port sessions");
                      }}
                    >
                      <RefreshCw size={12} /> Refresh
                    </button>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: 8,
                    }}
                  >
                    {agentsAndServers.map((proc) => (
                      <div
                        key={proc.pid}
                        className="q-card"
                        style={{ minHeight: 86, padding: "10px 12px" }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              fontWeight: 700,
                              fontSize: 12.5,
                            }}
                          >
                            {proc.category === "agent" ? (
                              <Bot size={14} color="var(--accent)" />
                            ) : (
                              <Server size={14} color="var(--success)" />
                            )}
                            {proc.name}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              padding: "2px 7px",
                              borderRadius: 99,
                              background:
                                proc.status === "Working"
                                  ? "rgba(245, 158, 11, 0.2)"
                                  : "rgba(34, 197, 94, 0.18)",
                              color:
                                proc.status === "Working"
                                  ? "var(--warning)"
                                  : "var(--success)",
                              fontWeight: 600,
                            }}
                          >
                            ● {proc.status}
                          </span>
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-secondary)",
                            margin: "4px 0",
                          }}
                        >
                          {proc.title} • PID {proc.pid}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            fontSize: 11,
                          }}
                        >
                          <span>
                            CPU {proc.cpu_percent}% • RAM {proc.memory_mb} MB
                            {proc.port ? ` • :${proc.port}` : ""}
                          </span>
                          <div style={{ display: "flex", gap: 5 }}>
                            {proc.port && (
                              <button
                                className="btn btn-soft"
                                style={{ padding: "2px 7px", fontSize: 10.5 }}
                                onClick={() =>
                                  openWindowsSetting(`http://localhost:${proc.port}`)
                                }
                              >
                                localhost:{proc.port} ↗
                              </button>
                            )}
                            {proc.category === "server" && (
                              <button
                                className="btn"
                                style={{
                                  padding: "2px 7px",
                                  fontSize: 10.5,
                                  color: "var(--danger)",
                                }}
                                onClick={async () => {
                                  await stopProcessByPid(proc.pid);
                                  const updated = await getActiveAgentsAndServers();
                                  setAgentsAndServers(updated);
                                  showToast(`Stopped process PID ${proc.pid}`);
                                }}
                              >
                                Stop
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ---------- 5. QUICK TOOLS TAB (Scratchpad, Timer, Color Picker) ---------- */}
              {activeTab === "tools" && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 1fr",
                    gap: 12,
                    height: "100%",
                  }}
                >
                  {/* Scratchpad Note */}
                  <div
                    className="q-card"
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    <div className="card-header">
                      <span className="card-title-cluster">
                        <FileText size={13} color="var(--accent)" /> Personal
                        Scratchpad Note
                      </span>
                      <span style={{ fontSize: 10.5, color: "var(--success)" }}>
                        Auto-saved ({scratchNote.length} chars)
                      </span>
                    </div>
                    <textarea
                      className="ui-textarea"
                      style={{
                        flex: 1,
                        resize: "none",
                        lineHeight: 1.45,
                        fontSize: 12,
                      }}
                      value={scratchNote}
                      onChange={(e) => setScratchNote(e.target.value)}
                      placeholder="Write notes, snippets, or reminders..."
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                      <button
                        className="btn btn-soft"
                        style={{ padding: "4px 9px", fontSize: 11 }}
                        onClick={() => {
                          copyTextToClipboard(scratchNote);
                          showToast("Copied Scratchpad Note!");
                        }}
                      >
                        <Copy size={11.5} /> Copy Note
                      </button>
                    </div>
                  </div>

                  {/* Right Column: Timer + Screen Color Picker */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div className="q-card" style={{ minHeight: 105 }}>
                      <div className="card-header">
                        <span className="card-title-cluster">
                          <Clock size={13} color="var(--accent)" /> Countdown &
                          Pomodoro Timer
                        </span>
                        <span style={{ fontSize: 10.5 }}>Shows in Pill</span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <span style={{ fontSize: 26, fontWeight: 700 }}>
                          {Math.floor(timerSecondsLeft / 60)}:
                          {String(timerSecondsLeft % 60).padStart(2, "0")}
                        </span>
                        <div style={{ display: "flex", gap: 5 }}>
                          <button
                            className="btn btn-accent"
                            onClick={() => setTimerRunning((r) => !r)}
                          >
                            {timerRunning ? "Pause" : "Start"}
                          </button>
                          <button
                            className="btn"
                            onClick={() => {
                              setTimerRunning(false);
                              setTimerSecondsLeft(25 * 60);
                            }}
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                      <div className="mode-chip-group" style={{ marginTop: 6 }}>
                        {[5, 15, 25, 45].map((mins) => (
                          <button
                            key={mins}
                            className="mode-chip"
                            onClick={() => {
                              setTimerRunning(false);
                              setTimerSecondsLeft(mins * 60);
                            }}
                          >
                            {mins}m
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="q-card" style={{ minHeight: 105 }}>
                      <div className="card-header">
                        <span className="card-title-cluster">
                          <Pipette size={13} color="var(--accent)" /> Live Screen
                          Color Picker
                        </span>
                        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>
                          {pickedColor}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <button
                          className={`btn ${
                            colorPicking ? "btn-accent" : "btn-soft"
                          }`}
                          style={{ flex: 1 }}
                          onClick={() => {
                            setColorPicking((v) => !v);
                            showToast(
                              "Move cursor anywhere on screen & click to sample pixel!"
                            );
                          }}
                        >
                          <Pipette size={13} />{" "}
                          {colorPicking
                            ? "Sampling Screen (Click to Lock)..."
                            : "Pick Screen Pixel"}
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        {colorHistory.map((hex) => (
                          <button
                            key={hex}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 6,
                              background: hex,
                              border:
                                pickedColor === hex
                                  ? "2px solid #fff"
                                  : "1px solid rgba(255,255,255,0.2)",
                              cursor: "pointer",
                            }}
                            title={`Copy ${hex}`}
                            onClick={() => {
                              setPickedColor(hex);
                              copyTextToClipboard(hex);
                              showToast(`Copied ${hex}`);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ---------- 6. SETTINGS TAB (Installed Harnesses Dropdown, Theme, Game Mode) ---------- */}
              {activeTab === "settings" && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.15fr 1fr",
                    gap: 12,
                  }}
                >
                  {/* Left: Installed AI Harnesses Configuration & Dropdown */}
                  <div className="q-card" style={{ gap: 8 }}>
                    <div className="card-header">
                      <span className="card-title-cluster">
                        <Terminal size={13} color="var(--accent)" /> Installed AI
                        Harnesses & CLI Dropdown
                      </span>
                      <span style={{ fontSize: 10.5, color: "var(--success)" }}>
                        {harnesses.filter((h) => h.installed).length} Detected
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <label
                        style={{ fontSize: 11, color: "var(--text-secondary)" }}
                      >
                        Default Primary AI Harness (Shown in Dropdown):
                      </label>
                      <select
                        className="ui-select"
                        value={settings.defaultHarnessId}
                        onChange={(e) => {
                          const id = e.target.value;
                          const h = harnesses.find((x) => x.id === id);
                          setSettings((s) => ({
                            ...s,
                            defaultHarnessId: id,
                            defaultModel: h ? h.default_model : s.defaultModel,
                          }));
                          setSelectedHarnessId(id);
                          if (h) setSelectedModel(h.default_model);
                          showToast(`Default harness set to ${h?.name || id}`);
                        }}
                      >
                        {harnesses.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.installed ? "✓ Installed: " : "○ Available: "}
                            {h.name} — {h.executable_path}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 5,
                        maxHeight: 165,
                        overflowY: "auto",
                        marginTop: 4,
                      }}
                    >
                      {harnesses.map((h) => (
                        <div
                          key={h.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "6px 8px",
                            borderRadius: 8,
                            background: "var(--bg-control)",
                            fontSize: 11,
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  width: 7,
                                  height: 7,
                                  borderRadius: 99,
                                  background: h.badge_color,
                                  marginRight: 6,
                                }}
                              />
                              {h.name}{" "}
                              <span
                                style={{
                                  fontSize: 10,
                                  color: h.installed
                                    ? "var(--success)"
                                    : "var(--text-muted)",
                                }}
                              >
                                ({h.installed ? "Installed" : "Not Found"})
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: "var(--text-secondary)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {h.executable_path}
                            </div>
                          </div>
                          <button
                            className="btn btn-soft"
                            style={{ padding: "3px 8px", fontSize: 10 }}
                            onClick={() => handleExpandToHarness(h)}
                          >
                            Launch ↗
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: Appearance, Hover Dwell, Game Mode & Shortcuts */}
                  <div className="q-card" style={{ gap: 8 }}>
                    <div className="card-header">
                      <span className="card-title-cluster">
                        <Palette size={13} color="var(--accent)" /> Shell Appearance
                        & Behavior
                      </span>
                      <button
                        className="btn"
                        style={{ padding: "2px 7px", fontSize: 10 }}
                        onClick={() => {
                          nudgeNotchPosition(0, true);
                          showToast("Centered Notch on screen");
                        }}
                      >
                        Center Notch
                      </button>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                      }}
                    >
                      <div>
                        <label
                          style={{ fontSize: 10.5, color: "var(--text-secondary)" }}
                        >
                          Theme Surface
                        </label>
                        <select
                          className="ui-select"
                          style={{ width: "100%", marginTop: 3 }}
                          value={settings.theme}
                          onChange={(e) =>
                            setSettings((s) => ({
                              ...s,
                              theme: e.target.value as NotchSettings["theme"],
                            }))
                          }
                        >
                          <option value="obsidian">Obsidian Dark (Default)</option>
                          <option value="oled">OLED Pitch Black</option>
                          <option value="acrylic">Windows 11 Acrylic</option>
                          <option value="light">Daylight Frost</option>
                        </select>
                      </div>

                      <div>
                        <label
                          style={{ fontSize: 10.5, color: "var(--text-secondary)" }}
                        >
                          Game Mode (Ctrl+Alt+G)
                        </label>
                        <select
                          className="ui-select"
                          style={{ width: "100%", marginTop: 3 }}
                          value={settings.gameModeOverride}
                          onChange={(e) =>
                            setSettings((s) => ({
                              ...s,
                              gameModeOverride: e.target
                                .value as NotchSettings["gameModeOverride"],
                            }))
                          }
                        >
                          <option value="auto">Auto (Fullscreen Detect)</option>
                          <option value="off">Always Interactive</option>
                          <option value="on">Force Passive Game Bar</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label
                        style={{ fontSize: 10.5, color: "var(--text-secondary)" }}
                      >
                        Accent Color
                      </label>
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        {[
                          "#38bdf8",
                          "#8b5cf6",
                          "#10b981",
                          "#f97316",
                          "#f43f5e",
                          "#eab308",
                        ].map((col) => (
                          <button
                            key={col}
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 99,
                              background: col,
                              border:
                                settings.accentColor === col
                                  ? "2px solid #fff"
                                  : "none",
                              cursor: "pointer",
                            }}
                            onClick={() =>
                              setSettings((s) => ({ ...s, accentColor: col }))
                            }
                          />
                        ))}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                      }}
                    >
                      <div>
                        <label
                          style={{ fontSize: 10.5, color: "var(--text-secondary)" }}
                        >
                          Weather City
                        </label>
                        <input
                          className="ui-input"
                          style={{ width: "100%", marginTop: 3 }}
                          value={settings.weatherCity}
                          onChange={(e) =>
                            setSettings((s) => ({
                              ...s,
                              weatherCity: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label
                          style={{ fontSize: 10.5, color: "var(--text-secondary)" }}
                        >
                          GitHub Username
                        </label>
                        <input
                          className="ui-input"
                          style={{ width: "100%", marginTop: 3 }}
                          value={settings.githubUsername}
                          onChange={(e) =>
                            setSettings((s) => ({
                              ...s,
                              githubUsername: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 10.5,
                        color: "var(--text-secondary)",
                        borderTop: "1px solid var(--border-subtle)",
                        paddingTop: 6,
                      }}
                    >
                      Shortcuts: <strong>Ctrl+Alt+N</strong> Toggle •{" "}
                      <strong>Ctrl+Alt+F</strong> AI Search •{" "}
                      <strong>Ctrl+Alt+G</strong> Game Mode •{" "}
                      <strong>Esc</strong> Collapse
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Toast Notification Banner */}
        {toastMsg && (
          <div className="toast-banner">
            <Check size={13} color="var(--accent)" />
            <span>{toastMsg}</span>
          </div>
        )}
      </div>

      {/* Glance Strip underneath Collapsed Pill */}
      {!expanded && settings.showGlanceStrip && (
        <div
          className="glance-strip"
          onMouseEnter={() => handleEnterNotch(false)}
          onClick={() => setExpanded(true)}
        >
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>
            {telemetry.wifi.ssid}
          </span>
          <span>•</span>
          <span>{telemetry.power_mode}</span>
          <span>•</span>
          <span>
            {shelfItems.length > 0
              ? `${shelfItems.length} file(s) in Drop Shelf`
              : `${activeHarness.name} Ready`}
          </span>
        </div>
      )}
    </div>
  );
}
