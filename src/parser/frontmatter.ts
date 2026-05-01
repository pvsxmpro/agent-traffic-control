// A small YAML-ish parser for the limited frontmatter shapes Agent Traffic
// Control uses. We deliberately do not pull in a full YAML library — the
// markdown file is meant to be readable and the schema is fixed. We support:
//   key: scalar
//   key: [a, b, c]                (inline list of strings)
//   key:                          (block list)
//     - a
//     - b
//   key:                          (block map)
//     subkey: value
// Numbers are coerced where they look numeric. Everything else stays as string.

export interface FrontmatterParse {
  data: Record<string, unknown>;
  /** Order keys appeared in source. */
  order: string[];
  /** Lines after the closing `---`, including any trailing blank line. */
  body: string;
  /** Raw frontmatter block (without the --- fences). Empty if none. */
  raw: string;
  /** Whether the file actually had frontmatter. */
  hasFrontmatter: boolean;
}

const FENCE = "---";

export function splitFrontmatter(text: string): FrontmatterParse {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0 || lines[0].trim() !== FENCE) {
    return {
      data: {},
      order: [],
      body: text,
      raw: "",
      hasFrontmatter: false,
    };
  }
  // find the closing fence
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === FENCE) {
      close = i;
      break;
    }
  }
  if (close === -1) {
    return {
      data: {},
      order: [],
      body: text,
      raw: "",
      hasFrontmatter: false,
    };
  }
  const fmLines = lines.slice(1, close);
  const bodyLines = lines.slice(close + 1);
  const raw = fmLines.join("\n");
  const { data, order } = parseYamlIsh(fmLines);
  return {
    data,
    order,
    body: bodyLines.join("\n"),
    raw,
    hasFrontmatter: true,
  };
}

function coerce(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null" || trimmed === "~") return null;
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number.parseFloat(trimmed);
  // strip wrapping quotes
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseInlineList(value: string): unknown[] {
  // "[a, b, c]"  ->  ["a", "b", "c"]
  const inner = value.trim().slice(1, -1).trim();
  if (inner === "") return [];
  return inner.split(",").map((s) => coerce(s));
}

function indentOf(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === " ") n++;
  return n;
}

function parseYamlIsh(
  lines: string[],
): { data: Record<string, unknown>; order: string[] } {
  const data: Record<string, unknown> = {};
  const order: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw;
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const ind = indentOf(line);
    if (ind > 0) {
      // unexpected — skip
      i++;
      continue;
    }
    const colon = line.indexOf(":");
    if (colon === -1) {
      i++;
      continue;
    }
    const key = line.slice(0, colon).trim();
    const after = line.slice(colon + 1);
    const trailing = after.trim();
    if (trailing === "") {
      // block list or block map
      const childLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && (lines[j].trim() === "" || indentOf(lines[j]) > 0)) {
        childLines.push(lines[j]);
        j++;
      }
      // Decide: block list vs block map.
      const firstNonEmpty = childLines.find((l) => l.trim() !== "");
      if (firstNonEmpty && firstNonEmpty.trim().startsWith("- ")) {
        const items: unknown[] = [];
        for (const cl of childLines) {
          const t = cl.trim();
          if (t.startsWith("- ")) items.push(coerce(t.slice(2)));
        }
        data[key] = items;
      } else {
        // block map of scalars
        const sub: Record<string, unknown> = {};
        for (const cl of childLines) {
          const t = cl.trim();
          if (t === "" || t.startsWith("#")) continue;
          const sc = t.indexOf(":");
          if (sc === -1) continue;
          const sk = t.slice(0, sc).trim();
          const sv = t.slice(sc + 1).trim();
          sub[sk] = coerce(sv);
        }
        data[key] = sub;
      }
      if (!order.includes(key)) order.push(key);
      i = j;
      continue;
    }
    // inline list?
    if (trailing.startsWith("[") && trailing.endsWith("]")) {
      data[key] = parseInlineList(trailing);
    } else {
      data[key] = coerce(trailing);
    }
    if (!order.includes(key)) order.push(key);
    i++;
  }
  return { data, order };
}

/**
 * Serialize the frontmatter back. Tries to preserve the user's original key
 * order, then appends any newly added keys at the end.
 */
export function serializeFrontmatter(
  data: Record<string, unknown>,
  order: string[],
): string {
  const out: string[] = ["---"];
  const seen = new Set<string>();
  const writeKey = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    if (!(key in data)) return;
    const value = data[key];
    out.push(...serializeKeyValue(key, value));
  };
  for (const k of order) writeKey(k);
  for (const k of Object.keys(data)) writeKey(k);
  out.push("---");
  return out.join("\n");
}

function serializeKeyValue(key: string, value: unknown): string[] {
  if (value === null || value === undefined) {
    return [`${key}:`];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${key}: []`];
    if (value.every((v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")) {
      // Use inline list when items are simple — matches the spec's example.
      const items = value.map((v) => formatScalar(v)).join(", ");
      return [`${key}: [${items}]`];
    }
    // Fallback: block list
    const lines: string[] = [`${key}:`];
    for (const v of value) lines.push(`  - ${formatScalar(v)}`);
    return lines;
  }
  if (typeof value === "object") {
    const lines: string[] = [`${key}:`];
    const obj = value as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      lines.push(`  ${k}: ${formatScalar(obj[k])}`);
    }
    return lines;
  }
  return [`${key}: ${formatScalar(value)}`];
}

function formatScalar(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") {
    // quote when needed
    if (v === "" || /^[\d-]/.test(v) || /[:#\[\]\{\},]/.test(v)) {
      return `"${v.replace(/"/g, '\\"')}"`;
    }
    return v;
  }
  return String(v);
}
