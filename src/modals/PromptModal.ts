import { App, Modal, Notice } from "obsidian";

/**
 * Modal that shows a generated prompt as plain text with a "Copy to clipboard"
 * button. Used for Resume / Handoff / Context-reset.
 */
export class PromptModal extends Modal {
  private title: string;
  private body: string;

  constructor(app: App, title: string, body: string) {
    super(app);
    this.title = title;
    this.body = body;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("atc-prompt-modal");
    contentEl.createEl("h2", { text: this.title });

    const ta = contentEl.createEl("textarea", { cls: "atc-prompt-textarea" });
    ta.value = this.body;
    ta.rows = Math.min(24, this.body.split("\n").length + 2);
    ta.spellcheck = false;

    const buttonRow = contentEl.createDiv({ cls: "atc-button-row" });
    const copyBtn = buttonRow.createEl("button", { text: "Copy to clipboard" });
    copyBtn.addClass("mod-cta");
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(ta.value);
        new Notice("Prompt copied to clipboard");
      } catch (e) {
        new Notice("Could not copy. Select text manually.");
      }
    });
    const closeBtn = buttonRow.createEl("button", { text: "Close" });
    closeBtn.addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
