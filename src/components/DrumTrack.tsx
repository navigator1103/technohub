// DrumTrack — one drum lane: name + mute/solo + the 16-step grid.
//
// Step interactions:
//   left click       -> toggle active
//   right click      -> toggle accent
//   alt + click      -> cycle ratchet (1 -> 2 -> 3 -> 4 -> 1)
//   shift + click    -> cycle probability (100 -> 75 -> 50 -> 25 -> 100)

import type { MouseEvent } from "react";
import type { DrumTrack as DrumTrackType, Step } from "../sequencing/patternTypes";

interface DrumTrackProps {
  track: DrumTrackType;
  currentStep: number;
  onUpdateStep: (stepIndex: number, patch: Partial<Step>) => void;
  onUpdateTrack: (patch: Partial<DrumTrackType>) => void;
}

export function DrumTrack({
  track,
  currentStep,
  onUpdateStep,
  onUpdateTrack,
}: DrumTrackProps) {
  const handleClick = (e: MouseEvent, i: number, s: Step) => {
    if (e.altKey) {
      const next = (s.ratchet % 4) + 1;
      onUpdateStep(i, { ratchet: next, active: true });
    } else if (e.shiftKey) {
      const steps = [1, 0.75, 0.5, 0.25];
      const idx = steps.indexOf(s.probability);
      const next = steps[(idx + 1) % steps.length];
      onUpdateStep(i, { probability: next, active: true });
    } else {
      onUpdateStep(i, { active: !s.active });
    }
  };

  return (
    <div className="drum-row">
      <div className="drum-head">
        <span className="drum-name">{track.name}</span>
        <div className="drum-flags">
          <button
            className={`flag ${track.muted ? "on" : ""}`}
            onClick={() => onUpdateTrack({ muted: !track.muted })}
            title="Mute"
          >
            M
          </button>
          <button
            className={`flag solo ${track.solo ? "on" : ""}`}
            onClick={() => onUpdateTrack({ solo: !track.solo })}
            title="Solo"
          >
            S
          </button>
        </div>
      </div>

      <div className="steps">
        {track.steps.map((s, i) => {
          const cls = [
            "step",
            s.active ? "active" : "",
            s.accent ? "accent" : "",
            i === currentStep ? "current" : "",
            i % 4 === 0 ? "beat" : "",
            s.probability < 1 ? "prob" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={i}
              className={cls}
              onClick={(e) => handleClick(e, i, s)}
              onContextMenu={(e) => {
                e.preventDefault();
                onUpdateStep(i, { accent: !s.accent, active: true });
              }}
              title={`Step ${i + 1}${s.ratchet > 1 ? ` ·${s.ratchet}x` : ""}${
                s.probability < 1 ? ` ·${Math.round(s.probability * 100)}%` : ""
              }`}
            >
              {s.active && s.ratchet > 1 ? s.ratchet : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}
