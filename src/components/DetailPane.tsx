// Right-hand detail pane. Edit any field; changes are pushed to the parent
// via onChange and serialized to disk by the plugin layer.

import type { Strip } from "../types";
import { formatCountdown, formatRelative, nowIso } from "../util/time";

export interface DetailPaneProps {
  strip: Strip;
  controllers: string[];
  sectors: string[];
  onChange: (next: Strip) => void;
  onClose: () => void;
  onPrompt: (kind: "resume" | "handoff" | "context_reset") => void;
  onPark: () => void;
}

export function DetailPane({
  strip,
  controllers,
  sectors,
  onChange,
  onClose,
  onPrompt,
  onPark,
}: DetailPaneProps): preact.JSX.Element {
  const patch = (p: Partial<Strip>) => onChange({ ...strip, ...p, updated: nowIso() });

  return (
    <div class="atc-detail">
      <div class="atc-detail-header">
        <div class="atc-detail-call">{strip.callsign}</div>
        <button class="atc-btn atc-btn-ghost" onClick={onClose} title="Close">✕</button>
      </div>

      <div class="atc-detail-meta">
        <span class="atc-chip">{strip.bay}</span>
        <span class={`atc-chip atc-chip-status atc-chip-status-${strip.status}`}>{strip.status}</span>
        <span class="atc-detail-updated">updated {formatRelative(strip.updated)}</span>
      </div>

      <Field label="Title">
        <input
          type="text"
          value={strip.title}
          onInput={(e) => patch({ title: (e.target as HTMLInputElement).value })}
        />
      </Field>

      <Field label="Sector">
        <select
          value={strip.sector}
          onChange={(e) => patch({ sector: (e.target as HTMLSelectElement).value })}
        >
          {sectors.map((s) => <option value={s} key={s}>{s}</option>)}
        </select>
      </Field>

      <Field label="Controller">
        <select
          value={strip.controller}
          onChange={(e) => patch({ controller: (e.target as HTMLSelectElement).value })}
        >
          {controllers.map((c) => <option value={c} key={c}>{c}</option>)}
        </select>
      </Field>

      <Field label="Objective">
        <textarea
          rows={2}
          value={strip.objective ?? ""}
          onInput={(e) => patch({ objective: (e.target as HTMLTextAreaElement).value || undefined })}
        />
      </Field>

      <Field label="Next">
        <textarea
          rows={2}
          value={strip.next ?? ""}
          onInput={(e) => patch({ next: (e.target as HTMLTextAreaElement).value || undefined })}
        />
      </Field>

      <Field label="Review">
        <input
          type="text"
          value={strip.review ?? ""}
          placeholder="2026-05-01T14:30"
          onInput={(e) => patch({ review: (e.target as HTMLInputElement).value || undefined })}
        />
        {strip.review ? (
          <span class="atc-detail-countdown">{formatCountdown(strip.review)}</span>
        ) : null}
      </Field>

      <Field label="Constraints">
        <input
          type="text"
          value={strip.constraints.join(", ")}
          placeholder="repo:foo, branch:main"
          onInput={(e) =>
            patch({
              constraints: (e.target as HTMLInputElement).value
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s),
            })
          }
        />
      </Field>

      <Field label="Tags">
        <input
          type="text"
          value={strip.tags.join(" ")}
          placeholder="drift-risk high-value"
          onInput={(e) =>
            patch({
              tags: (e.target as HTMLInputElement).value
                .split(/\s+/)
                .map((s) => s.replace(/^#/, "").trim())
                .filter((s) => s),
            })
          }
        />
      </Field>

      {strip.bay === "handoff" ? (
        <Field label="Handoff note">
          <textarea
            rows={6}
            value={strip.handoff_note ?? ""}
            onInput={(e) =>
              patch({ handoff_note: (e.target as HTMLTextAreaElement).value || undefined })
            }
          />
        </Field>
      ) : null}

      {strip.bay === "holding" ? (
        <Field label="Resume condition">
          <textarea
            rows={3}
            value={strip.resume_condition ?? ""}
            onInput={(e) =>
              patch({ resume_condition: (e.target as HTMLTextAreaElement).value || undefined })
            }
          />
        </Field>
      ) : null}

      {strip.bay === "waiting" ? (
        <Field label="Waiting on">
          <input
            type="text"
            value={strip.waiting ?? ""}
            onInput={(e) =>
              patch({ waiting: (e.target as HTMLInputElement).value || undefined })
            }
          />
        </Field>
      ) : null}

      <Field label="Controller notes">
        <textarea
          rows={4}
          value={strip.controller_notes ?? ""}
          onInput={(e) =>
            patch({ controller_notes: (e.target as HTMLTextAreaElement).value || undefined })
          }
        />
      </Field>

      <Field label="Outcome">
        <textarea
          rows={2}
          value={strip.outcome ?? ""}
          onInput={(e) =>
            patch({ outcome: (e.target as HTMLTextAreaElement).value || undefined })
          }
        />
      </Field>

      <div class="atc-detail-actions">
        <button class="atc-btn" onClick={() => onPrompt("resume")}>Resume prompt</button>
        <button class="atc-btn" onClick={() => onPrompt("handoff")}>Handoff prompt</button>
        <button class="atc-btn" onClick={() => onPrompt("context_reset")}>Context-reset prompt</button>
        <button class="atc-btn atc-btn-ghost" onClick={onPark}>Park</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: preact.ComponentChildren }): preact.JSX.Element {
  return (
    <div class="atc-field">
      <label>{label}</label>
      <div class="atc-field-control">{children}</div>
    </div>
  );
}
