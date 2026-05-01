// Plugin entry point. Wires:
//   - custom view registration
//   - ribbon icon
//   - command palette commands
//   - settings tab
//   - 60-second stall scan interval

import { Notice, Plugin, TFile, WorkspaceLeaf, addIcon } from "obsidian";
import { AgentTrafficSettingsTab } from "./settings";
import { DEFAULT_SETTINGS, type PluginSettings, type Strip } from "./types";
import { AgentTrafficView, VIEW_TYPE_AGENT_TRAFFIC } from "./view";

// A simple radio-tower SVG so the ribbon icon is on-brand.
const TOWER_ICON = `<svg viewBox="0 0 100 100" stroke="currentColor" fill="none" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
<path d="M50 30 L30 95 L70 95 Z" />
<path d="M40 65 L60 65" />
<path d="M50 30 L50 10" />
<circle cx="50" cy="20" r="6" />
<path d="M30 22 Q50 5 70 22" />
<path d="M22 28 Q50 -2 78 28" />
</svg>`;

export default class AgentTrafficPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  stallInterval: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    addIcon("radio-tower", TOWER_ICON);

    this.registerView(
      VIEW_TYPE_AGENT_TRAFFIC,
      (leaf) => new AgentTrafficView(leaf, this),
    );

    this.addRibbonIcon("radio-tower", "Open Agent Traffic Control", () => {
      void this.openBoard();
    });

    this.addCommand({
      id: "open-board",
      name: "Open today's board",
      callback: () => { void this.openBoard(); },
    });

    this.addCommand({
      id: "create-strip",
      name: "Create new strip",
      checkCallback: (checking) => {
        const view = this.focusedView();
        if (!view) return false;
        if (!checking) view.openCreateStripModal();
        return true;
      },
      hotkeys: [{ modifiers: [], key: "n" }],
    });

    this.addCommand({
      id: "resume-prompt",
      name: "Generate resume prompt",
      checkCallback: (checking) => {
        const view = this.focusedView();
        const strip = this.selectedStrip(view);
        if (!view || !strip) return false;
        if (!checking) view.openPromptModal("resume", strip);
        return true;
      },
      hotkeys: [{ modifiers: [], key: "r" }],
    });

    this.addCommand({
      id: "handoff-prompt",
      name: "Generate handoff prompt",
      checkCallback: (checking) => {
        const view = this.focusedView();
        const strip = this.selectedStrip(view);
        if (!view || !strip) return false;
        if (!checking) view.openPromptModal("handoff", strip);
        return true;
      },
      hotkeys: [{ modifiers: [], key: "h" }],
    });

    this.addCommand({
      id: "context-reset-prompt",
      name: "Generate context-reset prompt",
      checkCallback: (checking) => {
        const view = this.activeView();
        const strip = this.selectedStrip(view);
        if (!view || !strip) return false;
        if (!checking) view.openPromptModal("context_reset", strip);
        return true;
      },
    });

    this.addCommand({
      id: "land-day",
      name: "Land the day",
      checkCallback: (checking) => {
        const view = this.activeView();
        if (!view) return false;
        if (!checking) void view.runLandTheDay();
        return true;
      },
    });

    this.addCommand({
      id: "park-strip",
      name: "Park selected strip",
      checkCallback: (checking) => {
        const view = this.focusedView();
        const strip = this.selectedStrip(view);
        if (!view || !strip) return false;
        if (!checking) void view.parkStrip(strip);
        return true;
      },
      hotkeys: [{ modifiers: [], key: "p" }],
    });

    this.addCommand({
      id: "open-archive",
      name: "Open today's archive",
      callback: async () => {
        const today = new Date();
        const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const path = `${this.settings.archive_folder.replace(/\/$/, "")}/${stamp}.md`;
        const f = this.app.vault.getAbstractFileByPath(path);
        if (f instanceof TFile) {
          await this.app.workspace.openLinkText(f.path, "", true);
        } else {
          new Notice(`No archive found for ${stamp}.`);
        }
      },
    });

    this.addSettingTab(new AgentTrafficSettingsTab(this.app, this));

    // Background stall scan, every 60 seconds.
    this.stallInterval = window.setInterval(() => {
      const view = this.activeView();
      if (!view || !view.model) return;
      view.scanStalls(view.model.config.stall_minutes);
    }, 60_000);
    this.registerInterval(this.stallInterval);

    // Auto-open board view on layout ready if configured file exists.
    this.app.workspace.onLayoutReady(() => {
      // Don't force the board open on load — just make sure detection happens
      // when the user clicks the ribbon. This keeps the plugin out of the way.
    });
  }

  onunload(): void {
    if (this.stallInterval !== null) window.clearInterval(this.stallInterval);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_AGENT_TRAFFIC);
  }

  async openBoard(): Promise<void> {
    const path = this.settings.default_board_path;
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`Board file not found at ${path}. Create it first or update settings.`);
      return;
    }
    // Find or create a leaf for the view.
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT_TRAFFIC);
    let leaf: WorkspaceLeaf;
    if (existing.length > 0) {
      leaf = existing[0];
    } else {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_AGENT_TRAFFIC, active: true });
    }
    const view = leaf.view as AgentTrafficView;
    await view.setFile(file);
    this.app.workspace.revealLeaf(leaf);
  }

  activeView(): AgentTrafficView | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT_TRAFFIC);
    if (leaves.length === 0) return null;
    return leaves[0].view as AgentTrafficView;
  }

  /**
   * Returns the ATC view ONLY when it's the currently focused leaf.
   * Used by hotkey-scoped commands so pressing N/R/H/P while typing in
   * an unrelated note doesn't fire ATC actions.
   *
   * We compare by view-type string rather than `getActiveViewOfType` because
   * class identity gets confused after plugin hot-reload (BRAT updates).
   */
  focusedView(): AgentTrafficView | null {
    const leaf = this.app.workspace.activeLeaf;
    if (!leaf) return null;
    const view = leaf.view as { getViewType?: () => string } | null;
    if (view?.getViewType?.() !== VIEW_TYPE_AGENT_TRAFFIC) return null;
    return leaf.view as AgentTrafficView;
  }

  selectedStrip(view: AgentTrafficView | null): Strip | null {
    if (!view || !view.model) return null;
    if (!view.selectedCallsign) return null;
    return view.model.strips.find((s) => s.callsign === view.selectedCallsign) ?? null;
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<PluginSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(data ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
