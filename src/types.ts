// Shared types for Agent Traffic Control.
// The BoardModel is the in-memory representation of the markdown board file.
// Round-trip invariant: parse(serialize(parse(text))) === parse(text).

export type Bay =
  | "inbound"
  | "active"
  | "waiting"
  | "review"
  | "handoff"
  | "holding"
  | "done";

export type Status = "executing" | "waiting" | "review" | "alert" | "done";

export interface BoardConfig {
  sectors: string[];
  wip_limits: Record<string, number>;
  stall_minutes: number;
  controllers: string[];
  /** Anything else that was in frontmatter but we don't formally manage. */
  extra_frontmatter: Record<string, unknown>;
  /** Frontmatter key order so we can write them back the same way. */
  frontmatter_order: string[];
}

export interface Strip {
  callsign: string;
  sector: string; // from H1
  bay: Bay; // from H2
  controller: string;
  controller_from?: string; // for handoff lines like "Cowork → Code"
  title: string;
  objective?: string;
  next?: string;
  review?: string; // ISO
  due?: string; // ISO
  constraints: string[];
  waiting?: string;
  handoff_note?: string;
  resume_condition?: string;
  outcome?: string;
  context_pct?: number;
  controller_notes?: string;
  created: string; // ISO
  updated: string; // ISO
  tags: string[];
  /** Computed status; not serialized. */
  status: Status;
  /** Indented or trailing lines we did not parse — preserved verbatim. */
  extra_content: string[];
  /** Source-file order for stable round-trip. */
  source_order: number;
  /** Raw checked state of the list checkbox. true if `- [x]`. */
  checked: boolean;
}

export interface BoardModel {
  config: BoardConfig;
  strips: Strip[];
  /** Body text outside any sector — we keep it as a leading preamble block. */
  preamble: string;
  /**
   * Sector blocks the user typed in the file but did not declare in the
   * `sectors:` config. We round-trip these too rather than dropping them.
   */
  unknown_sectors: string[];
}

/** Mapping between "## Heading" text and bay enum value. */
export const BAY_HEADINGS: Record<string, Bay> = {
  Inbound: "inbound",
  Active: "active",
  Waiting: "waiting",
  Review: "review",
  Handoff: "handoff",
  Holding: "holding",
  Done: "done",
};

export const BAY_LABELS: Record<Bay, string> = {
  inbound: "Inbound",
  active: "Active",
  waiting: "Waiting",
  review: "Review",
  handoff: "Handoff",
  holding: "Holding",
  done: "Done",
};

export const BAY_ORDER: Bay[] = [
  "inbound",
  "active",
  "waiting",
  "review",
  "handoff",
  "holding",
];

export interface PluginSettings {
  default_board_path: string;
  archive_folder: string;
  daily_note_integration: boolean;
  daily_note_format: string; // path pattern, e.g., "0. Daily Notes/YYYY-MM-DD.md"
  prompt_resume: string;
  prompt_handoff: string;
  prompt_context_reset: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  default_board_path: "12. Kanban/Agent Traffic/Agent Sessions.md",
  archive_folder: "12. Kanban/Agent Traffic/Archive",
  daily_note_integration: false,
  daily_note_format: "0. Daily Notes/YYYY-MM-DD.md",
  prompt_resume: DEFAULT_RESUME_TEMPLATE(),
  prompt_handoff: DEFAULT_HANDOFF_TEMPLATE(),
  prompt_context_reset: DEFAULT_CONTEXT_RESET_TEMPLATE(),
};

export function DEFAULT_RESUME_TEMPLATE(): string {
  return `Resume this workstream.

Callsign: {{callsign}}
Objective: {{objective_or_title}}
Current state: {{controller_notes_or_default}}
Current controller: {{controller}}
Bay / status: {{bay}} / {{status}}
Next action: {{next}}
Constraints: {{constraints_or_none}}
Definition of done: {{definition_of_done}}

Work only on the next action. Do not expand scope. When you stop, report:
1. What changed
2. What remains
3. Any new risks
4. Recommended next bay/status for this strip`;
}

export function DEFAULT_HANDOFF_TEMPLATE(): string {
  return `Create a handoff packet for this workstream.

Callsign: {{callsign}}
Objective: {{objective_or_title}}
Outgoing controller: {{controller_from_or_current}}
Incoming controller: {{controller}}
Current state: {{controller_notes}}
Recent events: {{recent_events_5}}
Risks/tags: {{tags}}

Produce a packet I can paste into the next session containing:
- One-paragraph summary of where we are
- What changed in this session
- What is blocked or unfinished
- Next action for the receiving controller
- Recommended definition of done`;
}

export function DEFAULT_CONTEXT_RESET_TEMPLATE(): string {
  return `Compress this session into a restart packet.

Preserve:
- Objective: {{objective_or_title}}
- Decisions made
- Files touched
- Current state
- Open risks: {{tags}}
- Next action: {{next}}
- Definition of done

Remove:
- Conversational chatter
- Dead ends and superseded options
- Repeated analysis

Output: a single packet I can paste into a fresh session to continue without context loss.`;
}
