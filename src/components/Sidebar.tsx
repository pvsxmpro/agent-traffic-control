import type { BoardModel } from "../types";
import type { BoardStats } from "./BoardView";

interface Filters {
  controller: string | null;
  status: string | null;
  tag: string | null;
}

export interface SidebarProps {
  model: BoardModel;
  stats: BoardStats;
  filters: Filters;
  onFiltersChange: (next: Filters) => void;
  onAlertClick: (callsign: string) => void;
}

export function Sidebar({ model, stats, filters, onFiltersChange, onAlertClick }: SidebarProps): preact.JSX.Element {
  const allTags = new Set<string>();
  for (const s of model.strips) for (const t of s.tags) allTags.add(t);

  const alerts = model.strips.filter((s) => s.status === "alert");

  return (
    <div class="atc-sidebar">
      <section class="atc-side-section">
        <h4>Capacity</h4>
        <ul class="atc-capacity">
          {stats.bySector.map((row) => {
            const ratio = row.limit > 0 ? row.count / row.limit : 0;
            const cls = ratio > 1 ? "over" : ratio === 1 ? "at" : "ok";
            return (
              <li class={`atc-capacity-row atc-capacity-${cls}`} key={row.sector}>
                <span class="atc-capacity-label">{row.sector}</span>
                <span class="atc-capacity-pill">{row.count}/{row.limit}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section class="atc-side-section">
        <h4>Alerts ({alerts.length})</h4>
        {alerts.length === 0 ? (
          <div class="atc-empty">All quiet.</div>
        ) : (
          <ul class="atc-alerts">
            {alerts.map((s) => (
              <li
                key={s.callsign}
                class="atc-alert-row"
                onClick={() => onAlertClick(s.callsign)}
              >
                <strong>{s.callsign}</strong>
                <span>{s.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="atc-side-section">
        <h4>Filters</h4>
        <div class="atc-filter-block">
          <label>Controller</label>
          <select
            value={filters.controller ?? ""}
            onChange={(e) =>
              onFiltersChange({ ...filters, controller: nonEmptyOrNull((e.target as HTMLSelectElement).value) })
            }
          >
            <option value="">All</option>
            {model.config.controllers.map((c) => <option value={c} key={c}>{c}</option>)}
          </select>
        </div>
        <div class="atc-filter-block">
          <label>Status</label>
          <select
            value={filters.status ?? ""}
            onChange={(e) =>
              onFiltersChange({ ...filters, status: nonEmptyOrNull((e.target as HTMLSelectElement).value) })
            }
          >
            <option value="">All</option>
            {["executing", "waiting", "review", "alert", "done"].map((s) => (
              <option value={s} key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div class="atc-filter-block">
          <label>Tag</label>
          <select
            value={filters.tag ?? ""}
            onChange={(e) =>
              onFiltersChange({ ...filters, tag: nonEmptyOrNull((e.target as HTMLSelectElement).value) })
            }
          >
            <option value="">All</option>
            {[...allTags].sort().map((t) => <option value={t} key={t}>#{t}</option>)}
          </select>
        </div>
      </section>
    </div>
  );
}

function nonEmptyOrNull(s: string): string | null {
  return s === "" ? null : s;
}
