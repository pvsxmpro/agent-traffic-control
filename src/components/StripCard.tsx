import type { Strip } from "../types";
import { formatRelative } from "../util/time";

export interface StripCardProps {
  strip: Strip;
  selected: boolean;
  onSelect: (callsign: string) => void;
}

export function StripCard({ strip, selected, onSelect }: StripCardProps): preact.JSX.Element {
  const cls = ["atc-strip"];
  if (selected) cls.push("atc-strip-selected");
  if (strip.status === "alert") cls.push("atc-strip-alert");
  if (strip.bay === "done") cls.push("atc-strip-done");
  for (const t of strip.tags) cls.push(`atc-tag-${t}`);

  return (
    <div
      class={cls.join(" ")}
      draggable
      onDragStart={(e) => {
        e.dataTransfer?.setData("text/plain", strip.callsign);
        e.dataTransfer && (e.dataTransfer.effectAllowed = "move");
      }}
      onClick={() => onSelect(strip.callsign)}
    >
      <div class="atc-strip-header">
        <span class="atc-strip-call">{strip.callsign}</span>
        <span class="atc-strip-controller">{controllerSegment(strip)}</span>
      </div>
      <div class="atc-strip-title">{strip.title}</div>
      {strip.next ? <div class="atc-strip-next">→ {strip.next}</div> : null}
      <div class="atc-strip-foot">
        {strip.tags.map((t) => (
          <span class={`atc-chip atc-chip-${t}`} key={t}>#{t}</span>
        ))}
        {strip.status === "alert" ? (
          <span class="atc-chip atc-chip-alert">stalled</span>
        ) : null}
        <span class="atc-strip-updated" title={strip.updated}>
          {formatRelative(strip.updated)}
        </span>
      </div>
    </div>
  );
}

function controllerSegment(strip: Strip): string {
  if (strip.controller_from) return `${strip.controller_from} → ${strip.controller}`;
  return strip.controller;
}
