import { App, Modal, Notice, Setting } from "obsidian";
import type { Strip } from "../types";
import { nowIso } from "../util/time";

export interface CreateStripInput {
  callsign: string;
  sector: string;
  controller: string;
  title: string;
  next: string;
}

export class CreateStripModal extends Modal {
  private sectors: string[];
  private controllers: string[];
  private onSubmit: (strip: Strip) => void;
  private values: CreateStripInput;

  constructor(
    app: App,
    sectors: string[],
    controllers: string[],
    defaults: Partial<CreateStripInput>,
    onSubmit: (strip: Strip) => void,
  ) {
    super(app);
    this.sectors = sectors;
    this.controllers = controllers;
    this.onSubmit = onSubmit;
    this.values = {
      callsign: defaults.callsign ?? "",
      sector: defaults.sector ?? sectors[0] ?? "",
      controller: defaults.controller ?? controllers[0] ?? "Claude",
      title: defaults.title ?? "",
      next: defaults.next ?? "",
    };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("atc-create-modal");
    contentEl.createEl("h2", { text: "New strip" });

    new Setting(contentEl)
      .setName("Callsign")
      .setDesc("Uppercase letters, digits, dashes or underscores — no spaces or punctuation. Example: ATC-PLUG")
      .addText((t) =>
        t
          .setPlaceholder("ATC-PLUG")
          .setValue(this.values.callsign)
          .onChange((v) => (this.values.callsign = v.toUpperCase())),
      );

    new Setting(contentEl).setName("Sector").addDropdown((d) => {
      for (const s of this.sectors) d.addOption(s, s);
      d.setValue(this.values.sector).onChange((v) => (this.values.sector = v));
    });

    new Setting(contentEl).setName("Controller").addDropdown((d) => {
      for (const c of this.controllers) d.addOption(c, c);
      d.setValue(this.values.controller).onChange((v) => (this.values.controller = v));
    });

    new Setting(contentEl)
      .setName("Title")
      .setDesc("One-line objective. Example: Refactor orchestration service and rerun tests")
      .addText((t) =>
        t
          .setPlaceholder("Refactor orchestration service and rerun tests")
          .setValue(this.values.title)
          .onChange((v) => (this.values.title = v)),
      );

    new Setting(contentEl)
      .setName("Next action")
      .setDesc("Smallest concrete thing you can do right now — verb-led, ~1 hour or less. Optional in Inbound; required when you drag to Active.")
      .addText((t) =>
        t
          .setPlaceholder("Run the test suite and capture failing edge cases")
          .setValue(this.values.next)
          .onChange((v) => (this.values.next = v)),
      );

    const row = contentEl.createDiv({ cls: "atc-button-row" });
    const submit = row.createEl("button", { text: "Create" });
    submit.addClass("mod-cta");
    submit.addEventListener("click", () => this.submit());
    const cancel = row.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
  }

  private submit(): void {
    if (!this.values.callsign.match(/^[A-Z0-9][A-Z0-9_-]*$/)) {
      new Notice("Callsign needs uppercase letters, digits, dashes or underscores only — no spaces or punctuation. Example: ATC-PLUG");
      return;
    }
    if (this.values.title.trim() === "") {
      new Notice("Give the strip a title.");
      return;
    }
    const created = nowIso();
    const strip: Strip = {
      callsign: this.values.callsign,
      sector: this.values.sector,
      bay: "inbound",
      controller: this.values.controller,
      title: this.values.title.trim(),
      next: this.values.next.trim() || undefined,
      constraints: [],
      created,
      updated: created,
      tags: [],
      status: "executing",
      extra_content: [],
      source_order: Number.MAX_SAFE_INTEGER,
      checked: false,
    };
    this.onSubmit(strip);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
