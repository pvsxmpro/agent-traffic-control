import { App, Modal, Notice } from "obsidian";
import type { Strip } from "../types";

export type EodAction =
  | { kind: "park"; resume_condition: string }
  | { kind: "handoff"; handoff_note: string }
  | { kind: "land"; outcome: string }
  | { kind: "rollforward" }
  | { kind: "skip" };

/**
 * Walks each non-Done strip in sequence, asking how to land it.
 * Returns the chosen actions in the same order as the strips passed in.
 */
export class EodModal extends Modal {
  private strips: Strip[];
  private resolveFn: ((actions: Map<string, EodAction>) => void) | null = null;
  private actions: Map<string, EodAction> = new Map();
  private idx = 0;

  constructor(app: App, strips: Strip[]) {
    super(app);
    this.strips = strips;
  }

  async run(): Promise<Map<string, EodAction>> {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.open();
    });
  }

  onOpen(): void {
    this.renderCurrent();
  }

  private renderCurrent(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("atc-eod-modal");
    if (this.idx >= this.strips.length) {
      this.finish();
      return;
    }
    const strip = this.strips[this.idx];
    contentEl.createEl("h2", { text: "Land the day" });
    contentEl.createEl("p", {
      text: `Strip ${this.idx + 1} of ${this.strips.length}`,
      cls: "atc-eod-progress",
    });
    const card = contentEl.createDiv({ cls: "atc-eod-card" });
    card.createEl("div", {
      text: `${strip.callsign} · ${strip.controller}`,
      cls: "atc-eod-call",
    });
    card.createEl("div", { text: strip.title, cls: "atc-eod-title" });
    card.createEl("div", {
      text: `${strip.sector} / ${strip.bay}`,
      cls: "atc-eod-meta",
    });
    if (strip.next) card.createEl("div", { text: `next: ${strip.next}` });

    const row = contentEl.createDiv({ cls: "atc-button-row" });

    if (strip.bay === "active" || strip.bay === "waiting" || strip.bay === "review") {
      this.btn(row, "Park", () => this.askPark(strip));
      this.btn(row, "Hand off", () => this.askHandoff(strip));
      this.btn(row, "Land", () => this.askLand(strip), true);
    } else if (strip.bay === "handoff") {
      this.btn(row, "Picked up → Active", () => {
        this.actions.set(strip.callsign, { kind: "rollforward" });
        this.next();
      });
      this.btn(row, "Roll forward", () => {
        this.actions.set(strip.callsign, { kind: "rollforward" });
        this.next();
      });
      this.btn(row, "Land", () => this.askLand(strip));
    } else if (strip.bay === "holding") {
      this.btn(row, "Update resume condition", () => this.askPark(strip));
      this.btn(row, "Roll forward", () => {
        this.actions.set(strip.callsign, { kind: "rollforward" });
        this.next();
      });
      this.btn(row, "Land", () => this.askLand(strip));
    } else if (strip.bay === "inbound") {
      this.btn(row, "Keep in Inbound", () => {
        this.actions.set(strip.callsign, { kind: "rollforward" });
        this.next();
      });
      this.btn(row, "Land", () => this.askLand(strip));
    } else {
      // done — shouldn't happen
      this.next();
    }

    const skip = contentEl.createDiv({ cls: "atc-button-row atc-button-row-secondary" });
    this.btn(skip, "Skip", () => {
      this.actions.set(strip.callsign, { kind: "skip" });
      this.next();
    });
  }

  private btn(
    parent: HTMLElement,
    label: string,
    handler: () => void,
    primary = false,
  ): void {
    const b = parent.createEl("button", { text: label });
    if (primary) b.addClass("mod-cta");
    b.addEventListener("click", handler);
  }

  private async askPark(strip: Strip): Promise<void> {
    const v = await this.ask("What needs to be true to resume?", strip.resume_condition ?? "");
    if (v === null) return;
    this.actions.set(strip.callsign, { kind: "park", resume_condition: v });
    this.next();
  }

  private async askHandoff(strip: Strip): Promise<void> {
    const v = await this.ask(
      "Handoff note (objective / state / next / DoD)",
      strip.handoff_note ?? "",
      true,
    );
    if (v === null) return;
    this.actions.set(strip.callsign, { kind: "handoff", handoff_note: v });
    this.next();
  }

  private async askLand(strip: Strip): Promise<void> {
    const v = await this.ask("What was the outcome?", strip.outcome ?? "");
    if (v === null) return;
    this.actions.set(strip.callsign, { kind: "land", outcome: v });
    this.next();
  }

  private async ask(label: string, initial: string, multiline = false): Promise<string | null> {
    const { RuleModal } = await import("./RuleModal");
    const modal = new RuleModal(this.app, label, label, multiline, initial);
    return modal.ask();
  }

  private next(): void {
    this.idx++;
    this.renderCurrent();
  }

  private finish(): void {
    this.resolveFn?.(this.actions);
    this.resolveFn = null;
    this.close();
    new Notice("Day landed.");
  }

  onClose(): void {
    if (this.resolveFn) {
      this.resolveFn(this.actions);
      this.resolveFn = null;
    }
    this.contentEl.empty();
  }
}
