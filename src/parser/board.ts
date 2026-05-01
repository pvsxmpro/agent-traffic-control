// Markdown board parser.
// Round-trip-safe: any line we don't recognise inside a strip is preserved in
// `extra_content` and written back verbatim by the serializer.

import {
  BAY_HEADINGS,
  type Bay,
  type BoardConfig,
  type BoardModel,
  type Strip,
} from "../types";
import { splitFrontmatter } from "./frontmatter";

const KNOWN_STRIP_KEYS = new Set<string>([
  "next",
  "objective",
  "review",
  "due",
  "constraints",
  "waiting",
  "handoff_note",
  "resume_condition",
  "outcome",
  "context",
  "updated",
  "created",
  "controller_notes",
]);

const STRIP_TITLE_RE =
  /^- \[([ xX])\]\s+\*\*([A-Z0-9][A-Z0-9_-]*)\*\*\s*·\s*([^·]+)·\s*(.+)$/;

const TAG_LINE_RE = /^#[A-Za-z][\w-]*(?:\s+#[A-Za-z][\w-]*)*$/;

const HANDOFF_ARROW_RE = /^(.+?)\s*(?:→|->)\s*(.+)$/;

export interface ParseResult {
  model: BoardModel;
  warnings: string[];
}

export function parseBoard(text: string): ParseResult {
  const warnings: string[] = [];
  const fm = splitFrontmatter(text);
  const config = buildConfig(fm.data, fm.order);

  const lines = fm.body.split(/\r?\n/);
  const strips: Strip[] = [];
  const unknown_sectors = new Set<string>();
  const known = new Set(config.sectors);
  let preamble: string[] = [];
  let i = 0;
  let currentSector: string | null = null;
  let currentBay: Bay | null = null;
  let order = 0;

  // Walk lines, dispatch into sector/bay context.
  while (i < lines.length) {
    const line = lines[i];

    if (currentSector === null && line.trim() !== "" && !/^#\s/.test(line)) {
      preamble.push(line);
      i++;
      continue;
    }

    if (/^#\s+\S/.test(line)) {
      currentSector = line.replace(/^#\s+/, "").trim();
      currentBay = null;
      if (!known.has(currentSector)) unknown_sectors.add(currentSector);
      i++;
      continue;
    }

    if (/^##\s+\S/.test(line) && currentSector !== null) {
      const heading = line.replace(/^##\s+/, "").trim();
      const bay = BAY_HEADINGS[heading];
      currentBay = bay ?? null;
      i++;
      continue;
    }

    if (currentSector && currentBay && line.startsWith("- [")) {
      // Collect the strip and its continuation lines.
      const stripLines: string[] = [line];
      let j = i + 1;
      while (
        j < lines.length &&
        lines[j].length > 0 &&
        !lines[j].startsWith("- [") &&
        !/^#{1,2}\s+\S/.test(lines[j])
      ) {
        // continuation lines are indented or blank-ish-but-not-empty.
        // Stop when we hit a fully blank line followed by a header or new strip.
        if (lines[j].trim() === "") {
          // peek ahead — blank line ends the strip block if next is heading / strip
          let k = j + 1;
          while (k < lines.length && lines[k].trim() === "") k++;
          if (
            k >= lines.length ||
            lines[k].startsWith("- [") ||
            /^#{1,2}\s+\S/.test(lines[k])
          ) {
            break;
          }
          stripLines.push(lines[j]);
          j++;
          continue;
        }
        if (!lines[j].startsWith("  ") && !lines[j].startsWith("\t")) {
          // unindented non-blank, non-header, non-strip — treat as preamble break
          break;
        }
        stripLines.push(lines[j]);
        j++;
      }
      const strip = parseStrip(
        stripLines,
        currentSector,
        currentBay,
        order++,
        warnings,
      );
      if (strip) strips.push(strip);
      i = j;
      continue;
    }

    // Trailing or in-between blank lines we just discard — serializer
    // re-emits the canonical layout. Comments and stray content under a
    // sector but outside a strip are dropped (logged as warning).
    if (currentSector && line.trim() !== "" && !line.startsWith("- [")) {
      warnings.push(
        `Discarded unrecognised line under "${currentSector}": ${line}`,
      );
    }
    i++;
  }

  return {
    model: {
      config,
      strips,
      preamble: preamble.join("\n").replace(/\n+$/g, ""),
      unknown_sectors: Array.from(unknown_sectors),
    },
    warnings,
  };
}

function buildConfig(
  data: Record<string, unknown>,
  order: string[],
): BoardConfig {
  const sectors = (Array.isArray(data["sectors"]) ? data["sectors"] : [])
    .map((x) => String(x))
    .filter((x) => x.length > 0);
  const wipRaw = (data["wip_limits"] ?? {}) as Record<string, unknown>;
  const wip_limits: Record<string, number> = {};
  for (const k of Object.keys(wipRaw)) {
    const v = Number(wipRaw[k]);
    if (Number.isFinite(v)) wip_limits[k] = v;
  }
  const stall = Number(data["stall_minutes"]);
  const stall_minutes = Number.isFinite(stall) && stall > 0 ? stall : 30;
  const controllers = (Array.isArray(data["controllers"]) ? data["controllers"] : [])
    .map((x) => String(x));
  const known = new Set([
    "agent-traffic-plugin",
    "sectors",
    "wip_limits",
    "stall_minutes",
    "controllers",
  ]);
  const extra_frontmatter: Record<string, unknown> = {};
  for (const k of Object.keys(data)) {
    if (!known.has(k)) extra_frontmatter[k] = data[k];
  }
  return {
    sectors,
    wip_limits,
    stall_minutes,
    controllers,
    extra_frontmatter,
    frontmatter_order: order,
  };
}

function parseStrip(
  lines: string[],
  sector: string,
  bay: Bay,
  source_order: number,
  warnings: string[],
): Strip | null {
  const head = lines[0];
  const m = head.match(STRIP_TITLE_RE);
  if (!m) {
    warnings.push(`Could not parse strip title line: ${head}`);
    return null;
  }
  const checked = m[1].toLowerCase() === "x";
  const callsign = m[2].trim();
  const ctlSegment = m[3].trim();
  const title = m[4].trim();

  let controller = ctlSegment;
  let controller_from: string | undefined;
  const arrow = ctlSegment.match(HANDOFF_ARROW_RE);
  if (arrow) {
    controller_from = arrow[1].trim();
    controller = arrow[2].trim();
  }

  const strip: Strip = {
    callsign,
    sector,
    bay,
    controller,
    controller_from,
    title,
    constraints: [],
    created: "",
    updated: "",
    tags: [],
    status: deriveStatus(bay, checked),
    extra_content: [],
    source_order,
    checked,
  };

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = raw.replace(/^\s+/, "");
    if (stripped === "") {
      strip.extra_content.push(raw);
      continue;
    }
    if (stripped.startsWith("#") && TAG_LINE_RE.test(stripped)) {
      for (const tag of stripped.split(/\s+/)) {
        if (tag.startsWith("#")) strip.tags.push(tag.slice(1));
      }
      continue;
    }
    if (stripped.startsWith("<!--")) {
      strip.extra_content.push(raw);
      continue;
    }
    const colon = stripped.indexOf(":");
    if (colon === -1) {
      strip.extra_content.push(raw);
      continue;
    }
    const key = stripped.slice(0, colon).trim().toLowerCase();
    let value = stripped.slice(colon + 1).trim();

    // YAML "|"-style block scalar for handoff_note and the like
    if (value === "|" && KNOWN_STRIP_KEYS.has(key)) {
      const blockLines: string[] = [];
      const blockIndent = leadingSpaces(raw) + 2;
      let j = i + 1;
      while (j < lines.length) {
        const bl = lines[j];
        if (bl.trim() === "") {
          // blank line might still belong to block — peek
          const k2 = j + 1;
          if (
            k2 < lines.length &&
            leadingSpaces(lines[k2]) >= blockIndent
          ) {
            blockLines.push("");
            j++;
            continue;
          }
          break;
        }
        if (leadingSpaces(bl) < blockIndent) break;
        blockLines.push(bl.slice(blockIndent));
        j++;
      }
      value = blockLines.join("\n").replace(/\n+$/, "");
      i = j - 1;
      assignKnownKey(strip, key, value);
      continue;
    }

    if (KNOWN_STRIP_KEYS.has(key)) {
      assignKnownKey(strip, key, value);
    } else {
      strip.extra_content.push(raw);
    }
  }

  if (!strip.created) strip.created = nowIso();
  if (!strip.updated) strip.updated = strip.created;

  // alert override: a stall comment trumps inferred status.
  if (strip.extra_content.some((l) => /<!--\s*stall_at:/i.test(l))) {
    strip.status = "alert";
  }

  return strip;
}

function leadingSpaces(s: string): number {
  let n = 0;
  while (n < s.length && (s[n] === " " || s[n] === "\t")) n++;
  return n;
}

function assignKnownKey(strip: Strip, key: string, value: string) {
  switch (key) {
    case "next":
      strip.next = value;
      break;
    case "objective":
      strip.objective = value;
      break;
    case "review":
      strip.review = value;
      break;
    case "due":
      strip.due = value;
      break;
    case "constraints":
      strip.constraints = value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      break;
    case "waiting":
      strip.waiting = value;
      break;
    case "handoff_note":
      strip.handoff_note = value;
      break;
    case "resume_condition":
      strip.resume_condition = value;
      break;
    case "outcome":
      strip.outcome = value;
      break;
    case "context": {
      const m = value.match(/^(\d+)\s*%?$/);
      if (m) strip.context_pct = Number.parseInt(m[1], 10);
      break;
    }
    case "updated":
      strip.updated = value;
      break;
    case "created":
      strip.created = value;
      break;
    case "controller_notes":
      strip.controller_notes = value;
      break;
  }
}

function deriveStatus(bay: Bay, checked: boolean): Strip["status"] {
  if (checked || bay === "done") return "done";
  if (bay === "active") return "executing";
  if (bay === "review") return "review";
  if (bay === "waiting" || bay === "holding" || bay === "handoff") return "waiting";
  return "executing";
}

function nowIso(): string {
  // Truncated to minute — board file ISOs in the spec are per-minute.
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}
