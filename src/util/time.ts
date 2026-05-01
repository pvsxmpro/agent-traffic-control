// Time helpers. We use minute precision throughout so the markdown stays
// readable and round-trip-safe.

export function nowIso(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

export function parseIso(s: string | undefined | null): number | null {
  if (!s) return null;
  const d = new Date(s);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

export function minutesBetween(aIso: string | undefined, bMs: number): number | null {
  const a = parseIso(aIso);
  if (a === null) return null;
  return Math.round((bMs - a) / 60000);
}

export function formatRelative(iso: string | undefined): string {
  const t = parseIso(iso);
  if (t === null) return "—";
  const delta = Date.now() - t;
  const mins = Math.round(delta / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function formatCountdown(iso: string | undefined): string {
  const t = parseIso(iso);
  if (t === null) return "—";
  const delta = t - Date.now();
  const mins = Math.round(delta / 60000);
  if (mins <= 0) return `overdue ${-mins}m`;
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `in ${hrs}h${rem > 0 ? ` ${rem}m` : ""}`;
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
