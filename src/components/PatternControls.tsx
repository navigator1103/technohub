// PatternControls — pattern tabs + project actions (new, duplicate, presets,
// generate, save/load JSON, export WAV) and the sidechain toggle.

import { useRef } from "react";
import type { Pattern } from "../sequencing/patternTypes";
import { PRESETS } from "../sequencing/patternPresets";

interface PatternControlsProps {
  patterns: Pattern[];
  selectedPatternId: string;
  sidechainEnabled: boolean;
  exporting: boolean;
  onSelectPattern: (id: string) => void;
  onNewPattern: () => void;
  onDuplicatePattern: () => void;
  onLoadPreset: (presetId: string) => void;
  onGenerate: () => void;
  onSaveJson: () => void;
  onLoadJson: (file: File) => void;
  onExportWav: () => void;
  onToggleSidechain: (on: boolean) => void;
}

export function PatternControls({
  patterns,
  selectedPatternId,
  sidechainEnabled,
  exporting,
  onSelectPattern,
  onNewPattern,
  onDuplicatePattern,
  onLoadPreset,
  onGenerate,
  onSaveJson,
  onLoadJson,
  onExportWav,
  onToggleSidechain,
}: PatternControlsProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="pattern-controls panel">
      <div className="pc-row">
        <div className="tabs">
          {patterns.map((p) => (
            <button
              key={p.id}
              className={`tab ${p.id === selectedPatternId ? "active" : ""}`}
              onClick={() => onSelectPattern(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="pc-row">
        <button className="btn sm" onClick={onNewPattern}>
          + New
        </button>
        <button className="btn sm" onClick={onDuplicatePattern}>
          ⧉ Duplicate
        </button>
        <button className="btn sm accent-btn" onClick={onGenerate}>
          ⚡ Generate Groove
        </button>

        <select
          className="preset-select"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) {
              onLoadPreset(e.target.value);
              e.target.value = "";
            }
          }}
        >
          <option value="" disabled>
            Load preset…
          </option>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="pc-row">
        <button className="btn sm" onClick={onSaveJson}>
          ⬇ Save JSON
        </button>
        <button className="btn sm" onClick={() => fileRef.current?.click()}>
          ⬆ Load JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onLoadJson(f);
            e.target.value = "";
          }}
        />
        <button className="btn sm export" onClick={onExportWav} disabled={exporting}>
          {exporting ? "Rendering…" : "♫ Export WAV"}
        </button>

        <label className="sidechain-toggle">
          <input
            type="checkbox"
            checked={sidechainEnabled}
            onChange={(e) => onToggleSidechain(e.target.checked)}
          />
          Sidechain pump
        </label>
      </div>
    </div>
  );
}
