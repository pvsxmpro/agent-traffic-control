// Markdown serializer.
// Produces output that, when re-parsed, yields the same BoardModel.
// Canonical layout (per spec):
//   ---
//   <frontmatter>
//   ---
//   <preamble?>
//
//   # Sector
//
//   ## Bay
//   - [ ] **CALL** · Controller · Title
//     key: value
//     ...
//
// Empty bays under a present sector are omitted to keep the file light;
// users can re-add them by hand and the parser will not lose them on
// the next round-trip because we never delete user content from
// `extra_content`.

import { serializeFrontmatter } from "../parser/frontmatter";
import {
  BAY_LABELS,
  BAY_ORDER,
  type BoardConfig,
  type BoardModel,
  type Strip,
} from "../types";

export function serializeBoard(model: BoardModel): string {
  const fm = buildFrontmatter(model.config);
  const sectors = uniqueOrdered([
    ...model.config.sectors,
    ...model.unknown_sectors,
  ]);

  const stripBySectorBay = new Map<string, Strip[]>();
  for (const strip of [...model.strips].sort((a, b) => a.source_order - b.source_order)) {
    const key = `${strip.sector}::${strip.bay}`;
    const arr = stripBySectorBay.get(key) ?? [];
    arr.push(strip);
    stripBySectorBay.set(key, arr);
  }

  const out: string[] = [];
  out.push(fm);
  if (model.preamble.trim() !== "") {
    out.push("");
    out.push(model.preamble.replace(/\n+$/g, ""));
  }

  for (const sector of sectors) {
    const sectorStrips = [...model.strips]
      .filter((s) => s.sector === sector)
      .sort((a, b) => a.source_order - b.source_order);
    if (sectorStrips.length === 0) continue;
    out.push("");
    out.push(`# ${sector}`);
    // determine bays present
    const baysPresent = new Set<string>();
    for (const s of sectorStrips) baysPresent.add(s.bay);
    // bay order: known canonical first, then 'done' if present, then any others
    const orderedBays = [
      ...BAY_ORDER.filter((b) => baysPresent.has(b)),
      ...(baysPresent.has("done") ? (["done"] as const) : []),
    ];
    for (const bay of orderedBays) {
      const inBay = sectorStrips.filter((s) => s.bay === bay);
      if (inBay.length === 0) continue;
      out.push("");
      out.push(`## ${BAY_LABELS[bay]}`);
      for (const strip of inBay) {
        out.push(...serializeStrip(strip));
      }
    }
  }
  // trailing newline so editors don't complain
  return out.join("\n").replace(/\n+$/, "") + "\n";
}

function buildFrontmatter(config: BoardConfig): string {
  // Reconstruct the data object respecting the original order.
  const data: Record<string, unknown> = {};
  data["agent-traffic-plugin"] = "v1";
  if (config.sectors.length > 0) data["sectors"] = [...config.sectors];
  if (Object.keys(config.wip_limits).length > 0) data["wip_limits"] = { ...config.wip_limits };
  data["stall_minutes"] = config.stall_minutes;
  if (config.controllers.length > 0) data["controllers"] = [...config.controllers];
  for (const k of Object.keys(config.extra_frontmatter)) {
    data[k] = config.extra_frontmatter[k];
  }
  // Build order: original order first, then any new keys we added above
  const order = [...config.frontmatter_order];
  for (const k of [
    "agent-traffic-plugin",
    "sectors",
    "wip_limits",
    "stall_minutes",
    "controllers",
  ]) {
    if (!order.includes(k)) order.push(k);
  }
  return serializeFrontmatter(data, order);
}

function serializeStrip(strip: Strip): string[] {
  const out: string[] = [];
  const checkbox = strip.checked || strip.bay === "done" ? "[x]" : "[ ]";
  let controllerSegment = strip.controller;
  if (strip.controller_from) {
    controllerSegment = `${strip.controller_from} → ${strip.controller}`;
  }
  out.push(`- ${checkbox} **${strip.callsign}** · ${controllerSegment} · ${strip.title}`);
  // Continuation lines — emit known fields in canonical order.
  if (strip.objective) out.push(`  objective: ${strip.objective}`);
  if (strip.next) out.push(`  next: ${strip.next}`);
  if (strip.waiting) out.push(`  waiting: ${strip.waiting}`);
  if (strip.handoff_note) {
    if (strip.handoff_note.includes("\n")) {
      out.push(`  handoff_note: |`);
      for (const ln of strip.handoff_note.split("\n")) {
        out.push(`    ${ln}`);
      }
    } else {
      out.push(`  handoff_note: ${strip.handoff_note}`);
    }
  }
  if (strip.resume_condition) out.push(`  resume_condition: ${strip.resume_condition}`);
  if (strip.outcome) out.push(`  outcome: ${strip.outcome}`);
  if (strip.review) out.push(`  review: ${strip.review}`);
  if (strip.due) out.push(`  due: ${strip.due}`);
  if (strip.constraints.length > 0) {
    out.push(`  constraints: ${strip.constraints.join(", ")}`);
  }
  if (typeof strip.context_pct === "number") {
    out.push(`  context: ${strip.context_pct}%`);
  }
  if (strip.controller_notes) out.push(`  controller_notes: ${strip.controller_notes}`);
  if (strip.created) out.push(`  created: ${strip.created}`);
  if (strip.updated) out.push(`  updated: ${strip.updated}`);
  if (strip.tags.length > 0) {
    out.push(`  ${strip.tags.map((t) => `#${t}`).join(" ")}`);
  }
  for (const extra of strip.extra_content) {
    out.push(extra);
  }
  return out;
}

function uniqueOrdered<T>(items: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const it of items) {
    if (seen.has(it)) continue;
    seen.add(it);
    out.push(it);
  }
  return out;
}
