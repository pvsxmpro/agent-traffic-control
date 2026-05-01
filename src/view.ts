// Custom view that hosts the Preact board UI and bridges it to Obsidian's
// vault APIs. All file I/O happens here. The Preact components are pure.

import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { h, render } from "preact";
import { BoardView } from "./components/BoardView";
import { CreateStripModal } from "./modals/CreateStripModal";
import { EodModal, type EodAction } from "./modals/EodModal";
import { PromptModal } from "./modals/PromptModal";
import { RuleModal } from "./modals/RuleModal";
import { parseBoard } from "./parser/board";
import { serializeBoard } from "./serializer/board";
import {
  type Bay,
  type BoardModel,
  type Strip,
} from "./types";
import { buildContext, renderTemplate } from "./util/prompts";
import { formatDate, nowIso, parseIso } from "./util/time";
import type AgentTrafficPlugin from "./main";

export const VIEW_TYPE_AGENT_TRAFFIC = "agent-traffic-board";

export class AgentTrafficView extends ItemView {
  plugin: AgentTrafficPlugin;
  file: TFile | null = null;
  model: BoardModel | null = null;
  rootEl: HTMLElement | null = null;
  /** Set whenever we are writing to the file ourselves, to ignore the resulting modify event. */
  private writingOurselves = false;
  private debounceModify: number | null = null;
  selectedCallsign: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: AgentTrafficPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_AGENT_TRAFFIC;
  }

  getDisplayText(): string {
    return this.file ? `ATC: ${this.file.basename}` : "Agent Traffic Control";
  }

  getIcon(): string {
    return "radio-tower";
  }

  async setFile(file: TFile): Promise<void> {
    this.file = file;
    await this.reload();
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("atc-view");
    this.rootEl = this.contentEl.createDiv({ cls: "atc-mount" });

    // If we don't yet have a file, try the configured path.
    if (!this.file) {
      const f = this.app.vault.getAbstractFileByPath(this.plugin.settings.default_board_path);
      if (f instanceof TFile) this.file = f;
    }
    if (this.file) await this.reload();
    this.registerEvent(this.app.vault.on("modify", this.onVaultModify));
  }

  async onClose(): Promise<void> {
    if (this.rootEl) render(null, this.rootEl);
    if (this.debounceModify !== null) {
      window.clearTimeout(this.debounceModify);
      this.debounceModify = null;
    }
  }

  private onVaultModify = (file: TFile) => {
    if (!this.file || file.path !== this.file.path) return;
    if (this.writingOurselves) {
      this.writingOurselves = false;
      return;
    }
    if (this.debounceModify !== null) {
      window.clearTimeout(this.debounceModify);
    }
    this.debounceModify = window.setTimeout(async () => {
      await this.reload();
      new Notice("Board reloaded from disk.");
    }, 200);
  };

  async reload(): Promise<void> {
    if (!this.file) return;
    const text = await this.app.vault.read(this.file);
    const { model, warnings } = parseBoard(text);
    this.model = model;
    if (warnings.length > 0) {
      console.warn("[Agent Traffic Control] parser warnings:", warnings);
    }
    this.renderBoard();
  }

  /** Mutate the model and persist to disk. */
  async mutate(next: BoardModel): Promise<void> {
    this.model = next;
    await this.persist();
    this.renderBoard();
  }

  private async persist(): Promise<void> {
    if (!this.file || !this.model) return;
    const text = serializeBoard(this.model);
    this.writingOurselves = true;
    await this.app.vault.modify(this.file, text);
  }

  renderBoard(): void {
    if (!this.rootEl || !this.model) return;
    const model = this.model;
    const callbacks = {
      filePath: this.file?.path ?? "",
      onMutate: (next: BoardModel) => { void this.mutate(next); },
      onCreateStrip: () => this.openCreateStripModal(),
      onPrompt: (kind: "resume" | "handoff" | "context_reset", strip: Strip) =>
        this.openPromptModal(kind, strip),
      onLandTheDay: () => { void this.runLandTheDay(); },
      onParkStrip: (strip: Strip) => { void this.parkStrip(strip); },
      validateBayChange: (strip: Strip, nextBay: Bay) => this.validateBayChange(strip, nextBay),
    };
    render(h(BoardView as any, { model, callbacks } as any), this.rootEl);
  }

  /** Hard-rule enforcement on bay transitions. Returns the (possibly mutated) strip or null if cancelled. */
  async validateBayChange(strip: Strip, nextBay: Bay): Promise<Strip | null> {
    let next = { ...strip, bay: nextBay };
    if (nextBay === "active" && !next.next) {
      const v = await new RuleModal(this.app, "What's the next concrete action?", "Next action").ask();
      if (!v) return null;
      next.next = v;
    }
    if (nextBay === "handoff" && !next.handoff_note) {
      const v = await new RuleModal(
        this.app,
        "Handoff note",
        "Objective / current state / next action / DoD?",
        true,
      ).ask();
      if (!v) return null;
      next.handoff_note = v;
    }
    if (nextBay === "holding" && !next.resume_condition) {
      const v = await new RuleModal(
        this.app,
        "Resume condition",
        "What needs to be true to resume?",
      ).ask();
      if (!v) return null;
      next.resume_condition = v;
    }
    if (nextBay === "done" && !next.outcome) {
      const v = await new RuleModal(this.app, "Outcome", "What was the outcome?").ask();
      if (!v) return null;
      next.outcome = v;
      next.checked = true;
    }
    return next;
  }

  openCreateStripModal(): void {
    if (!this.model) return;
    new CreateStripModal(
      this.app,
      this.model.config.sectors,
      this.model.config.controllers,
      {},
      (strip) => {
        if (!this.model) return;
        // Append at the very end of source order.
        const maxOrder = this.model.strips.reduce((m, s) => Math.max(m, s.source_order), -1);
        strip.source_order = maxOrder + 1;
        const next = { ...this.model, strips: [...this.model.strips, strip] };
        void this.mutate(next);
      },
    ).open();
  }

  async parkStrip(strip: Strip): Promise<void> {
    const validated = await this.validateBayChange({ ...strip, bay: "holding" }, "holding");
    if (!validated || !this.model) return;
    const strips = this.model.strips.map((s) => (s.callsign === validated.callsign ? { ...validated, updated: nowIso() } : s));
    await this.mutate({ ...this.model, strips });
  }

  openPromptModal(kind: "resume" | "handoff" | "context_reset", strip: Strip): void {
    const settings = this.plugin.settings;
    const tpl =
      kind === "resume" ? settings.prompt_resume :
      kind === "handoff" ? settings.prompt_handoff :
      settings.prompt_context_reset;
    const recent: string[] = []; // future: read from in-session history
    const ctx = buildContext(strip, recent);
    const body = renderTemplate(tpl, ctx);
    const title =
      kind === "resume" ? `Resume — ${strip.callsign}` :
      kind === "handoff" ? `Handoff — ${strip.callsign}` :
      `Context reset — ${strip.callsign}`;
    new PromptModal(this.app, title, body).open();
  }

  /** Land the day: walk every non-Done strip, then archive Done strips and (optionally) append to daily note. */
  async runLandTheDay(): Promise<void> {
    if (!this.model || !this.file) return;
    const candidates = this.model.strips
      .filter((s) => s.bay !== "done")
      .sort((a, b) => a.source_order - b.source_order);
    if (candidates.length === 0) {
      new Notice("Nothing to land — all strips already Done.");
    }
    const eod = new EodModal(this.app, candidates);
    const actions = await eod.run();
    const newModel: BoardModel = {
      ...this.model,
      strips: this.model.strips.map((s) => {
        const a = actions.get(s.callsign);
        if (!a) return s;
        const stamped = { ...s, updated: nowIso() };
        if (a.kind === "park") {
          return { ...stamped, bay: "holding", resume_condition: a.resume_condition };
        }
        if (a.kind === "handoff") {
          return { ...stamped, bay: "handoff", handoff_note: a.handoff_note };
        }
        if (a.kind === "land") {
          return { ...stamped, bay: "done", outcome: a.outcome, checked: true, status: "done" };
        }
        return stamped;
      }),
    };

    // Archive the Done strips to a dated archive file, then drop them from the live board.
    const dateStr = formatDate(new Date());
    const doneStrips = newModel.strips.filter((s) => s.bay === "done");
    if (doneStrips.length > 0) {
      await this.appendArchive(dateStr, doneStrips);
    }
    const survivors = newModel.strips.filter((s) => s.bay !== "done");
    await this.mutate({ ...newModel, strips: survivors });

    // Daily note append
    if (this.plugin.settings.daily_note_integration && doneStrips.length > 0) {
      await this.appendDailyNote(dateStr, doneStrips, survivors, actions);
    }
    new Notice(`Land the day: ${doneStrips.length} landed, ${survivors.length} carried forward.`);
  }

  private async appendArchive(dateStr: string, doneStrips: Strip[]): Promise<void> {
    const folder = this.plugin.settings.archive_folder.replace(/\/$/, "");
    await this.ensureFolder(folder);
    const path = `${folder}/${dateStr}.md`;
    const existing = this.app.vault.getAbstractFileByPath(path);
    const archiveModel: BoardModel = {
      config: {
        sectors: Array.from(new Set(doneStrips.map((s) => s.sector))),
        wip_limits: {},
        stall_minutes: this.model?.config.stall_minutes ?? 30,
        controllers: [],
        extra_frontmatter: { archived_on: dateStr },
        frontmatter_order: ["agent-traffic-plugin", "archived_on", "sectors", "stall_minutes"],
      },
      strips: doneStrips.map((s, i) => ({ ...s, source_order: i })),
      preamble: `_Snapshot from Land-the-Day on ${dateStr}._`,
      unknown_sectors: [],
    };
    const text = serializeBoard(archiveModel);
    if (existing instanceof TFile) {
      const prev = await this.app.vault.read(existing);
      await this.app.vault.modify(existing, prev + "\n\n" + text);
    } else {
      await this.app.vault.create(path, text);
    }
  }

  private async ensureFolder(folder: string): Promise<void> {
    if (!folder) return;
    const parts = folder.split("/").filter((p) => p.length > 0);
    let current = "";
    for (const p of parts) {
      current = current ? `${current}/${p}` : p;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (!existing) {
        try {
          await this.app.vault.createFolder(current);
        } catch (e) {
          // race or already-exists — continue
        }
      }
    }
  }

  private async appendDailyNote(
    dateStr: string,
    landed: Strip[],
    survivors: Strip[],
    actions: Map<string, EodAction>,
  ): Promise<void> {
    const pattern = this.plugin.settings.daily_note_format || "0. Daily Notes/YYYY-MM-DD.md";
    const today = new Date();
    const path = pattern
      .replace(/YYYY/g, String(today.getFullYear()))
      .replace(/MM/g, String(today.getMonth() + 1).padStart(2, "0"))
      .replace(/DD/g, String(today.getDate()).padStart(2, "0"));
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`Daily note not found at ${path}; skipping append.`);
      return;
    }
    const time = `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;
    const lines: string[] = [];
    lines.push("");
    lines.push(`## Sessions`);
    lines.push(`*Generated by Agent Traffic Control at ${time}*`);
    lines.push("");
    lines.push(`### Landed today (${landed.length})`);
    for (const s of landed) {
      const reason = s.outcome ? ` — ${s.outcome}` : "";
      lines.push(`- **${s.callsign}** (${s.sector}, ${s.controller})${reason}.`);
    }
    lines.push("");
    lines.push(`### Carried forward (${survivors.length})`);
    for (const s of survivors) {
      const tail =
        s.bay === "holding" && s.resume_condition ? ` — resume when ${s.resume_condition}` :
        s.bay === "handoff" ? ` — Handoff to ${s.controller}` :
        s.bay === "waiting" && s.waiting ? ` — waiting: ${s.waiting}` : "";
      lines.push(`- **${s.callsign}** (${s.sector}, ${capitalize(s.bay)})${tail}`);
    }
    const transferActions = [...actions.entries()].filter(([, a]) => a.kind === "handoff");
    if (transferActions.length > 0) {
      lines.push("");
      lines.push(`### Today's transfers (${transferActions.length})`);
      for (const [call] of transferActions) {
        const strip = landed.find((s) => s.callsign === call) ?? survivors.find((s) => s.callsign === call);
        if (strip) lines.push(`- ${call}: → ${strip.controller}`);
      }
    }
    const existing = await this.app.vault.read(file);
    await this.app.vault.modify(file, existing.replace(/\s*$/, "") + "\n" + lines.join("\n") + "\n");
  }

  /** Stall scan — called from the plugin's interval. */
  scanStalls(stallMinutes: number): boolean {
    if (!this.model) return false;
    const now = Date.now();
    let changed = false;
    const strips = this.model.strips.map((s) => {
      if (s.bay !== "active") return s;
      const upd = parseIso(s.updated);
      if (upd === null) return s;
      const age = (now - upd) / 60000;
      if (age >= stallMinutes && s.status !== "alert") {
        changed = true;
        const stallLine = `<!-- stall_at: ${nowIso()} -->`;
        const extra = s.extra_content.some((l) => /<!--\s*stall_at:/i.test(l))
          ? s.extra_content
          : [...s.extra_content, stallLine];
        return { ...s, status: "alert" as const, extra_content: extra };
      }
      return s;
    });
    if (!changed) return false;
    this.mutate({ ...this.model, strips }).catch((e) => console.error(e));
    return true;
  }

  /** Bring a strip into the visible area and select it. */
  selectAndScrollTo(callsign: string): void {
    this.selectedCallsign = callsign;
    this.renderBoard();
    setTimeout(() => {
      const node = this.contentEl.querySelector(`.atc-strip-selected`);
      if (node) (node as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
