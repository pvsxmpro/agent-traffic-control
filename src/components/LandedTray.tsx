import { useState } from "preact/hooks";
import type { Strip } from "../types";

export interface LandedTrayProps {
  strips: Strip[];
  onSelect: (callsign: string) => void;
}

export function LandedTray({ strips, onSelect }: LandedTrayProps): preact.JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (strips.length === 0) return null;
  return (
    <div class={`atc-landed ${open ? "atc-landed-open" : ""}`}>
      <button class="atc-landed-toggle" onClick={() => setOpen(!open)}>
        Landed today ({strips.length}) {open ? "▾" : "▸"}
      </button>
      {open ? (
        <ul class="atc-landed-list">
          {strips.map((s) => (
            <li
              key={s.callsign}
              class="atc-landed-row"
              onClick={() => onSelect(s.callsign)}
            >
              <strong>{s.callsign}</strong> — {s.title}
              {s.outcome ? <em> · {s.outcome}</em> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
