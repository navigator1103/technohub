// Mixer — a compact channel strip per drum track: volume, decay, drive, pan.

import type { DrumTrack, Pattern } from "../sequencing/patternTypes";

interface MixerProps {
  pattern: Pattern;
  onUpdateTrack: (trackId: string, patch: Partial<DrumTrack>) => void;
}

function Knob({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="knob">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Mixer({ pattern, onUpdateTrack }: MixerProps) {
  return (
    <div className="mixer panel">
      <h2 className="panel-title">Mixer</h2>
      <div className="strips">
        {pattern.drumTracks.map((t) => (
          <div className="strip" key={t.id}>
            <div className="strip-name">{t.name}</div>
            <Knob
              label="Vol"
              value={t.volume}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => onUpdateTrack(t.id, { volume: v })}
            />
            <Knob
              label="Dcy"
              value={t.decay}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => onUpdateTrack(t.id, { decay: v })}
            />
            <Knob
              label="Drv"
              value={t.drive}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => onUpdateTrack(t.id, { drive: v })}
            />
            <Knob
              label="Pan"
              value={t.pan}
              min={-1}
              max={1}
              step={0.05}
              onChange={(v) => onUpdateTrack(t.id, { pan: v })}
            />
            <Knob
              label="Pit"
              value={t.pitch}
              min={-24}
              max={24}
              step={1}
              onChange={(v) => onUpdateTrack(t.id, { pitch: v })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
