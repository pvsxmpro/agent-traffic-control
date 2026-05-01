// Root Preact component for the board view. Receives a BoardModel + a set
// of callbacks the plugin owns (so this file stays free of Obsidian APIs and
// is easy to reason about).
//
// Local UI state (selection, filters) lives here. Persistent state (strip
// fields, frontmatter) is owned by the plugin and only mutates via the
// onMutate callback so all writes go through the same serialize-to-disk path.

import { useEffect, useMemo, useState } from "preact/hooks";
import {
  BAY_LABELS,
  BAY_ORDER,
  type Bay,
  type BoardModel,
  type Strip,
} from "../types";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { Grid } from "./Grid";
import { LandedTray } from "./LandedTray";
import { DetailPane } from "./DetailPane";

export interface BoardCallbacks {
  /** Called whenever any user action mutates the model. */
  onMutate: (next: BoardModel) => void;
  /** Open the create-strip modal. */
  onCreateStrip: () => void;
  /** Generate a prompt and show the prompt modal. */
  onPrompt: (kind: "resume" | "handoff" | "context_reset", strip: Strip) => void;
  /** Run the EOD landing workflow. */
  onLandTheDay: () => void;
  /** Park selected strip (move to Holding with resume_condition). */
  onParkStrip: (strip: Strip) => void;
  /** Validate a bay change against hard rules; returns the mutated strip or null. */
  validateBayChange: (
    strip: Strip,
    nextBay: Bay,
  ) => Promise<Strip | null>;
  /** Currently bound file's path, for display. */
  filePath: string;
}

export interface BoardViewProps {
  model: BoardModel;
  callbacks: BoardCallbacks;
}

interface Filters {
  controller: string | null;
  status: string | null;
  tag: string | null;
}

export function BoardView({ model, callbacks }: BoardViewProps): preact.JSX.Element {
  const [selectedCall, setSelectedCall] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    controller: null,
    status: null,
    tag: null,
  });
  const [tick, setTick] = useState(0);

  // re-render every 30s so countdowns stay live
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 30000);
    return () => window.clearInterval(t);
  }, []);

  const selected = useMemo(
    () => model.strips.find((s) => s.callsign === selectedCall) ?? null,
    [model, selectedCall],
  );

  const filteredStrips = useMemo(() => {
    return model.strips.filter((s) => {
      if (filters.controller && s.controller !== filters.controller) return false;
      if (filters.status && s.status !== filters.status) return false;
      if (filters.tag && !s.tags.includes(filters.tag)) return false;
      return true;
    });
  }, [model, filters]);

  const stats = useMemo(() => computeStats(model), [model, tick]);

  const updateStrip = (next: Strip) => {
    const strips = model.strips.map((s) => (s.callsign === next.callsign ? next : s));
    callbacks.onMutate({ ...model, strips });
  };

  const handleDrop = async (callsign: string, bay: Bay) => {
    const strip = model.strips.find((s) => s.callsign === callsign);
    if (!strip || strip.bay === bay) return;
    const validated = await callbacks.validateBayChange({ ...strip, bay }, bay);
    if (!validated) return;
    updateStrip({ ...validated, updated: nowIsoMin() });
  };

  return (
    <div class="atc-root">
      <TopBar stats={stats} filePath={callbacks.filePath} onCreate={callbacks.onCreateStrip} onLand={callbacks.onLandTheDay} />
      <div class="atc-body">
        <Sidebar
          model={model}
          stats={stats}
          filters={filters}
          onFiltersChange={setFilters}
          onAlertClick={(call) => setSelectedCall(call)}
        />
        <div class="atc-main">
          <Grid
            model={model}
            strips={filteredStrips}
            selectedCall={selectedCall}
            onSelect={setSelectedCall}
            onDrop={handleDrop}
          />
          <LandedTray
            strips={model.strips.filter((s) => s.bay === "done")}
            onSelect={setSelectedCall}
          />
        </div>
        {selected ? (
          <DetailPane
            strip={selected}
            controllers={model.config.controllers}
            sectors={model.config.sectors}
            onChange={updateStrip}
            onClose={() => setSelectedCall(null)}
            onPrompt={(k) => callbacks.onPrompt(k, selected)}
            onPark={() => callbacks.onParkStrip(selected)}
          />
        ) : null}
      </div>
    </div>
  );
}

function nowIsoMin(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

export interface BoardStats {
  active: number;
  handoffs: number;
  stale: number;
  alerts: number;
  bySector: { sector: string; count: number; limit: number }[];
}

function computeStats(model: BoardModel): BoardStats {
  let active = 0;
  let handoffs = 0;
  let stale = 0;
  let alerts = 0;
  const counts = new Map<string, number>();
  for (const s of model.strips) {
    if (s.bay === "active") active++;
    if (s.bay === "handoff") handoffs++;
    if (s.status === "alert") alerts++;
    const c = counts.get(s.sector) ?? 0;
    if (s.bay !== "done") counts.set(s.sector, c + 1);
  }
  // stale = stalled (alert) — we surface them in two places intentionally
  stale = alerts;
  const bySector = model.config.sectors.map((sector) => ({
    sector,
    count: counts.get(sector) ?? 0,
    limit: model.config.wip_limits[sector] ?? 99,
  }));
  return { active, handoffs, stale, alerts, bySector };
}

// Re-export bay/order for components that need them.
export { BAY_ORDER, BAY_LABELS };
export type { Bay };
