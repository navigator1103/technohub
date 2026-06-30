// DrumTrack — one drum lane: name + mute/solo + the 16-step grid.
//
// Step interactions (desktop modifiers always work):
//   left click       -> toggle active (or the current Tap mode)
//   right click      -> toggle accent
//   alt + click      -> cycle ratchet (1 -> 2 -> 3 -> 4 -> 1)
//   shift + click    -> cycle probability (100 -> 75 -> 50 -> 25 -> 100)
//
// On touch (no modifier keys), a plain tap applies the active `tapMode`, so
// accent / probability / ratchet stay reachable on phones.

import type { MouseEvent } from "react";
import type {
  DrumTrack as DrumTrackType,
  Step,
  TapMode,
} from "../sequencing/patternTypes";

interface DrumTrackProps {
  track: DrumTrackType;
  currentStep: number;
  tapMode: TapMode;
  onUpdateStep: (stepIndex: number, patch: Partial<Step>) => void;
  onUpdateTrack: (patch: Partial<DrumTrackType>) => void;
}

export function DrumTrack({
  track,
  currentStep,
  tapMode,
  onUpdateStep,
  onUpdateTrack,
}: DrumTrackProps) {
  const cycleRatchet = (i: number, s: Step) =>
    onUpdateStep(i, { ratchet: (s.ratchet % 4) + 1, active: true });

  const cycleProbability = (i: number, s: Step) => {
    const steps = [1, 0.75, 0.5, 0.25];
    const idx = steps.indexOf(s.probability);
    onUpdateStep(i, { probability: steps[(idx + 1) % steps.length], active: true });
  };

  const handleClick = (e: MouseEvent, i: number, s: Step) => {
    // Desktop modifier keys take priority and override the tap mode.
    if (e.altKey) return cycleRatchet(i, s);
    if (e.shiftKey) return cycleProbability(i, s);

    switch (tapMode) {
      case "accent":
        return onUpdateStep(i, { accent: !s.accent, active: true });
      case "prob":
        return cycleProbability(i, s);
      case "ratchet":
        return cycleRatchet(i, s);
      default:
        return onUpdateStep(i, { active: !s.active });
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
