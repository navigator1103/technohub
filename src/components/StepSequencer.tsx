// StepSequencer — the 8 drum rows plus a step-number ruler and a Tap-mode
// selector (so every per-step feature is reachable on touch devices).

import { useState } from "react";
import type {
  DrumTrack as DrumTrackType,
  Pattern,
  Step,
  TapMode,
} from "../sequencing/patternTypes";
import { DrumTrack } from "./DrumTrack";

interface StepSequencerProps {
  pattern: Pattern;
  currentStep: number;
  onUpdateStep: (trackId: string, stepIndex: number, patch: Partial<Step>) => void;
  onUpdateTrack: (trackId: string, patch: Partial<DrumTrackType>) => void;
}

const TAP_MODES: Array<{ id: TapMode; label: string }> = [
  { id: "step", label: "Step" },
  { id: "accent", label: "Accent" },
  { id: "prob", label: "Prob" },
  { id: "ratchet", label: "Roll" },
];

export function StepSequencer({
  pattern,
  currentStep,
  onUpdateStep,
  onUpdateTrack,
}: StepSequencerProps) {
  const [tapMode, setTapMode] = useState<TapMode>("step");

  return (
    <div className="sequencer panel">
      <div className="seq-toolbar">
        <span className="seq-toolbar-label">Tap</span>
        <div className="seg">
          {TAP_MODES.map((m) => (
            <button
              key={m.id}
              className={`seg-btn ${tapMode === m.id ? "active" : ""}`}
              onClick={() => setTapMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="seq-ruler">
        <div className="drum-head ruler-head">STEP</div>
        <div className="steps">
          {Array.from({ length: pattern.steps }, (_, i) => (
            <div
              key={i}
              className={`ruler-cell ${i === currentStep ? "current" : ""} ${
                i % 4 === 0 ? "beat" : ""
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>
      </div>

      {pattern.drumTracks.map((track) => (
        <DrumTrack
          key={track.id}
          track={track}
          currentStep={currentStep}
          tapMode={tapMode}
          onUpdateStep={(i, patch) => onUpdateStep(track.id, i, patch)}
          onUpdateTrack={(patch) => onUpdateTrack(track.id, patch)}
        />
      ))}

      <p className="hint">
        Pick a <strong>Tap</strong> mode above for touch. On desktop: right-click
        = accent · Alt-click = roll · Shift-click = probability.
      </p>
    </div>
  );
}
