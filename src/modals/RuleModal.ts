import { App, Modal } from "obsidian";

/**
 * A single-question text-prompt modal used to enforce hard rules on drop:
 *   - "What's the next concrete action?"
 *   - "Objective / current state / next action / DoD?"
 *   - "What needs to be true to resume?"
 *   - "What was the outcome?"
 *
 * Returns a Promise that resolves to the entered string, or null if cancelled.
 */
export class RuleModal extends Modal {
  private title: string;
  private placeholder: string;
  private resolveFn: ((v: string | null) => void) | null = null;
  private multiline: boolean;
  private initial: string;

  constructor(
    app: App,
    title: string,
    placeholder: string,
    multiline = false,
    initial = "",
  ) {
    super(app);
    this.title = title;
    this.placeholder = placeholder;
    this.multiline = multiline;
    this.initial = initial;
  }

  async ask(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("atc-rule-modal");
    contentEl.createEl("h3", { text: this.title });
    let input: HTMLInputElement | HTMLTextAreaElement;
    if (this.multiline) {
      input = contentEl.createEl("textarea", { cls: "atc-rule-input" });
      (input as HTMLTextAreaElement).rows = 6;
    } else {
      input = contentEl.createEl("input", {
        type: "text",
        cls: "atc-rule-input",
      });
    }
    input.placeholder = this.placeholder;
    input.value = this.initial;
    setTimeout(() => input.focus(), 50);
    input.addEventListener("keydown", (ev: KeyboardEvent) => {
      if (ev.key === "Enter" && !ev.shiftKey && !this.multiline) {
        ev.preventDefault();
        this.submit(input.value);
      }
      if (ev.key === "Escape") {
        ev.preventDefault();
        this.cancel();
      }
    });

    const row = contentEl.createDiv({ cls: "atc-button-row" });
    const ok = row.createEl("button", { text: "OK" });
    ok.addClass("mod-cta");
    ok.addEventListener("click", () => this.submit(input.value));
    const cancel = row.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.cancel());
  }

  private submit(v: string): void {
    if (v.trim() === "") {
      // refuse empty — required field
      this.contentEl
        .createDiv({ cls: "atc-error", text: "This is required." });
      return;
    }
    this.resolveFn?.(v.trim());
    this.resolveFn = null;
    this.close();
  }

  private cancel(): void {
    this.resolveFn?.(null);
    this.resolveFn = null;
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
    if (this.resolveFn) {
      this.resolveFn(null);
      this.resolveFn = null;
    }
  }
}
