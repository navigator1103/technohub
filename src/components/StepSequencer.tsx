// StepSequencer — the 8 drum rows plus a step-number ruler.

import type { DrumTrack as DrumTrackType, Pattern, Step } from "../sequencing/patternTypes";
import { DrumTrack } from "./DrumTrack";

interface StepSequencerProps {
  pattern: Pattern;
  currentStep: number;
  onUpdateStep: (trackId: string, stepIndex: number, patch: Partial<Step>) => void;
  onUpdateTrack: (trackId: string, patch: Partial<DrumTrackType>) => void;
}

export function StepSequencer({
  pattern,
  currentStep,
  onUpdateStep,
  onUpdateTrack,
}: StepSequencerProps) {
  return (
    <div className="sequencer panel">
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
          onUpdateStep={(i, patch) => onUpdateStep(track.id, i, patch)}
          onUpdateTrack={(patch) => onUpdateTrack(track.id, patch)}
        />
      ))}

      <p className="hint">
        Left-click: toggle · Right-click: accent · Alt-click: ratchet ·
        Shift-click: probability
      </p>
    </div>
  );
}
