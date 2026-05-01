import type { BoardStats } from "./BoardView";

export interface TopBarProps {
  stats: BoardStats;
  filePath: string;
  onCreate: () => void;
  onLand: () => void;
}

export function TopBar({ stats, filePath, onCreate, onLand }: TopBarProps): preact.JSX.Element {
  return (
    <div class="atc-topbar">
      <div class="atc-topbar-left">
        <span class="atc-topbar-title">Agent Traffic Control</span>
        <span class="atc-topbar-file" title={filePath}>{filePath.split("/").pop()}</span>
      </div>
      <div class="atc-topbar-stats">
        <Stat label="Active" value={stats.active} />
        <Stat label="Handoffs" value={stats.handoffs} />
        <Stat label="Stale" value={stats.stale} kind={stats.stale > 0 ? "warn" : undefined} />
        <Stat label="Alerts" value={stats.alerts} kind={stats.alerts > 0 ? "alert" : undefined} />
      </div>
      <div class="atc-topbar-right">
        <button class="atc-btn" onClick={onCreate}>New strip</button>
        <button class="atc-btn atc-btn-primary" onClick={onLand}>Land the day</button>
      </div>
    </div>
  );
}

function Stat({ label, value, kind }: { label: string; value: number; kind?: "warn" | "alert" }): preact.JSX.Element {
  const cls = ["atc-stat"];
  if (kind) cls.push(`atc-stat-${kind}`);
  return (
    <div class={cls.join(" ")}>
      <span class="atc-stat-value">{value}</span>
      <span class="atc-stat-label">{label}</span>
    </div>
  );
}
