import { BAY_LABELS, BAY_ORDER, type Bay, type BoardModel, type Strip } from "../types";
import { StripCard } from "./StripCard";

export interface GridProps {
  model: BoardModel;
  strips: Strip[];
  selectedCall: string | null;
  onSelect: (callsign: string) => void;
  /** Called when a strip is dropped into a bay. Resolved from full model so caller need not look it up. */
  onDrop: (callsign: string, bay: Bay) => void;
}

export function Grid({ model, strips, selectedCall, onSelect, onDrop }: GridProps): preact.JSX.Element {
  return (
    <div class="atc-grid">
      <div class="atc-grid-header">
        <div class="atc-grid-corner" />
        {BAY_ORDER.map((bay) => (
          <div class="atc-grid-bay-header" key={bay}>{BAY_LABELS[bay]}</div>
        ))}
      </div>
      {model.config.sectors.map((sector) => (
        <SectorLane
          key={sector}
          sector={sector}
          model={model}
          strips={strips.filter((s) => s.sector === sector)}
          selectedCall={selectedCall}
          onSelect={onSelect}
          onDrop={onDrop}
        />
      ))}
    </div>
  );
}

interface SectorLaneProps {
  sector: string;
  model: BoardModel;
  strips: Strip[];
  selectedCall: string | null;
  onSelect: (call: string) => void;
  onDrop: (callsign: string, bay: Bay) => void;
}

function SectorLane({ sector, model, strips, selectedCall, onSelect, onDrop }: SectorLaneProps): preact.JSX.Element {
  const limit = model.config.wip_limits[sector] ?? 99;
  const count = strips.filter((s) => s.bay !== "done").length;
  const wipClass = count > limit ? "over" : count === limit ? "at" : "ok";
  return (
    <div class="atc-grid-row">
      <div class={`atc-lane-header atc-lane-${wipClass}`}>
        <div class="atc-lane-name">{sector}</div>
        <div class="atc-lane-wip">{count}/{limit}</div>
      </div>
      {BAY_ORDER.map((bay) => (
        <BayCell
          key={bay}
          bay={bay}
          strips={strips.filter((s) => s.bay === bay)}
          selectedCall={selectedCall}
          onSelect={onSelect}
          onDrop={(callsign) => onDrop(callsign, bay)}
        />
      ))}
    </div>
  );
}

interface BayCellProps {
  bay: Bay;
  strips: Strip[];
  selectedCall: string | null;
  onSelect: (call: string) => void;
  onDrop: (callsign: string) => void;
}

function BayCell({ bay, strips, selectedCall, onSelect, onDrop }: BayCellProps): preact.JSX.Element {
  return (
    <div
      class="atc-bay-cell"
      data-bay={bay}
      onDragOver={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).classList.add("atc-bay-cell-over");
      }}
      onDragLeave={(e) => {
        (e.currentTarget as HTMLElement).classList.remove("atc-bay-cell-over");
      }}
      onDrop={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).classList.remove("atc-bay-cell-over");
        const callsign = e.dataTransfer?.getData("text/plain");
        if (!callsign) return;
        onDrop(callsign);
      }}
    >
      {strips.length === 0 ? (
        <div class="atc-bay-empty" />
      ) : (
        strips.map((s) => (
          <StripCard
            key={s.callsign}
            strip={s}
            selected={selectedCall === s.callsign}
            onSelect={onSelect}
          />
        ))
      )}
    </div>
  );
}
