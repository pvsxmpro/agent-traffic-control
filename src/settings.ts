import { App, PluginSettingTab, Setting } from "obsidian";
import type AgentTrafficPlugin from "./main";
import {
  DEFAULT_CONTEXT_RESET_TEMPLATE,
  DEFAULT_HANDOFF_TEMPLATE,
  DEFAULT_RESUME_TEMPLATE,
} from "./types";

export class AgentTrafficSettingsTab extends PluginSettingTab {
  plugin: AgentTrafficPlugin;

  constructor(app: App, plugin: AgentTrafficPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Agent Traffic Control" });

    new Setting(containerEl)
      .setName("Default board path")
      .setDesc("Vault-relative path of the active board file.")
      .addText((t) =>
        t
          .setPlaceholder("12. Kanban/Agent Traffic/Agent Sessions.md")
          .setValue(this.plugin.settings.default_board_path)
          .onChange(async (v) => {
            this.plugin.settings.default_board_path = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Archive folder")
      .setDesc("Where Land-the-Day writes daily snapshots.")
      .addText((t) =>
        t
          .setPlaceholder("12. Kanban/Agent Traffic/Archive")
          .setValue(this.plugin.settings.archive_folder)
          .onChange(async (v) => {
            this.plugin.settings.archive_folder = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Daily note integration")
      .setDesc("Append a Sessions section to today's daily note on Land-the-Day.")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.daily_note_integration)
          .onChange(async (v) => {
            this.plugin.settings.daily_note_integration = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Daily note path pattern")
      .setDesc(
        "Path pattern for today's note. YYYY/MM/DD tokens supported. Used when daily-note integration is on.",
      )
      .addText((t) =>
        t
          .setPlaceholder("0. Daily Notes/YYYY-MM-DD.md")
          .setValue(this.plugin.settings.daily_note_format)
          .onChange(async (v) => {
            this.plugin.settings.daily_note_format = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl("h3", { text: "Prompt templates" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Used by the Resume / Handoff / Context-reset buttons. Template tokens like {{callsign}} are substituted from the selected strip.",
    });

    this.templateSetting(
      containerEl,
      "Resume template",
      "prompt_resume",
      DEFAULT_RESUME_TEMPLATE,
    );
    this.templateSetting(
      containerEl,
      "Handoff template",
      "prompt_handoff",
      DEFAULT_HANDOFF_TEMPLATE,
    );
    this.templateSetting(
      containerEl,
      "Context-reset template",
      "prompt_context_reset",
      DEFAULT_CONTEXT_RESET_TEMPLATE,
    );

    containerEl.createEl("h3", { text: "Board configuration" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Sectors, controllers, WIP limits and stall threshold live in the board file's YAML frontmatter so they round-trip with the file. Edit the file directly to change them.",
    });
  }

  private templateSetting(
    container: HTMLElement,
    label: string,
    key: "prompt_resume" | "prompt_handoff" | "prompt_context_reset",
    defaultFn: () => string,
  ): void {
    const wrap = container.createDiv({ cls: "setting-item" });
    const info = wrap.createDiv({ cls: "setting-item-info" });
    info.createDiv({ cls: "setting-item-name", text: label });
    const ctrl = wrap.createDiv({ cls: "setting-item-control" });
    const ta = ctrl.createEl("textarea", { cls: "atc-template-textarea" });
    ta.value = this.plugin.settings[key];
    ta.rows = 8;
    ta.style.width = "100%";
    ta.style.minWidth = "320px";
    ta.addEventListener("blur", async () => {
      this.plugin.settings[key] = ta.value;
      await this.plugin.saveSettings();
    });
    const reset = ctrl.createEl("button", { text: "Reset to default" });
    reset.style.marginLeft = "0.5rem";
    reset.addEventListener("click", async () => {
      this.plugin.settings[key] = defaultFn();
      ta.value = this.plugin.settings[key];
      await this.plugin.saveSettings();
    });
  }
}
