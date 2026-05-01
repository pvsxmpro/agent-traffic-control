// Prompt template renderer. Substitutes {{var}} from a strip context.
// Unknown variables are left as the empty string. The template language is
// intentionally tiny — no conditionals, no loops, no helpers.

import type { Strip } from "../types";

export interface PromptContext {
  callsign: string;
  controller: string;
  controller_from?: string;
  controller_from_or_current: string;
  bay: string;
  status: string;
  next: string;
  objective_or_title: string;
  controller_notes: string;
  controller_notes_or_default: string;
  constraints: string;
  constraints_or_none: string;
  definition_of_done: string;
  tags: string;
  recent_events_5: string;
}

export function buildContext(strip: Strip, recentEvents: string[]): PromptContext {
  const constraints = strip.constraints.join(", ");
  return {
    callsign: strip.callsign,
    controller: strip.controller,
    controller_from: strip.controller_from,
    controller_from_or_current: strip.controller_from ?? strip.controller,
    bay: strip.bay,
    status: strip.status,
    next: strip.next ?? "",
    objective_or_title: strip.objective ?? strip.title,
    controller_notes: strip.controller_notes ?? "",
    controller_notes_or_default: strip.controller_notes ?? "see prior session",
    constraints,
    constraints_or_none: constraints || "none",
    definition_of_done: strip.outcome || "see objective",
    tags: strip.tags.length ? strip.tags.map((t) => `#${t}`).join(" ") : "none",
    recent_events_5: recentEvents.length ? recentEvents.join("\n") : "none recorded",
  };
}

export function renderTemplate(template: string, ctx: PromptContext): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, key) => {
    const v = (ctx as unknown as Record<string, string | undefined>)[key];
    return v === undefined ? "" : String(v);
  });
}
