// BasslineEditor — 16 bass steps. Each active step exposes note, octave,
// slide and accent. Click the cell to toggle the step on/off.

import {
  NOTE_NAMES,
  type BassStep,
  type Pattern,
} from "../sequencing/patternTypes";

interface BasslineEditorProps {
  pattern: Pattern;
  currentStep: number;
  onUpdateBassStep: (stepIndex: number, patch: Partial<BassStep>) => void;
}

export function BasslineEditor({
  pattern,
  currentStep,
  onUpdateBassStep,
}: BasslineEditorProps) {
  return (
    <div className="bassline panel">
      <h2 className="panel-title">Bassline (Acid)</h2>
      <div className="bass-grid">
        {pattern.bassline.map((b, i) => {
          const cls = [
            "bass-cell",
            b.active ? "active" : "",
            i === currentStep ? "current" : "",
            i % 4 === 0 ? "beat" : "",
            b.accent ? "accent" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div className={cls} key={i}>
              <button
                className="bass-toggle"
                onClick={() => onUpdateBassStep(i, { active: !b.active })}
                title={`Step ${i + 1}`}
              >
                {b.active ? `${NOTE_NAMES[b.note]}${b.octave}` : "·"}
              </button>

              {b.active && (
                <div className="bass-controls">
                  <select
                    value={b.note}
                    onChange={(e) =>
                      onUpdateBassStep(i, { note: Number(e.target.value) })
                    }
                    title="Note"
                  >
                    {NOTE_NAMES.map((n, idx) => (
                      <option key={n} value={idx}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <div className="bass-oct">
                    <button
                      onClick={() =>
                        onUpdateBassStep(i, { octave: Math.max(0, b.octave - 1) })
                      }
                    >
                      −
                    </button>
                    <span>{b.octave}</span>
                    <button
                      onClick={() =>
                        onUpdateBassStep(i, { octave: Math.min(5, b.octave + 1) })
                      }
                    >
                      +
                    </button>
                  </div>
                  <div className="bass-flags">
                    <button
                      className={`flag ${b.slide ? "on" : ""}`}
                      onClick={() => onUpdateBassStep(i, { slide: !b.slide })}
                      title="Slide"
                    >
                       slide
                    </button>
                    <button
                      className={`flag ${b.accent ? "on" : ""}`}
                      onClick={() => onUpdateBassStep(i, { accent: !b.accent })}
                      title="Accent"
                    >
                      acc
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
