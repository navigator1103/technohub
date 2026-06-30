// Transport — play/stop + BPM + swing. Spacebar also toggles play (handled in App).

interface TransportProps {
  isPlaying: boolean;
  bpm: number;
  swing: number;
  onTogglePlay: () => void;
  onStop: () => void;
  onBpm: (bpm: number) => void;
  onSwing: (swing: number) => void;
}

export function Transport({
  isPlaying,
  bpm,
  swing,
  onTogglePlay,
  onStop,
  onBpm,
  onSwing,
}: TransportProps) {
  return (
    <div className="transport">
      <button
        className={`btn play ${isPlaying ? "active" : ""}`}
        onClick={onTogglePlay}
        title="Play / Pause (Space)"
      >
        {isPlaying ? "❚❚ Pause" : "▶ Play"}
      </button>
      <button className="btn" onClick={onStop} title="Stop">
        ■ Stop
      </button>

      <div className="ctrl">
        <label>BPM</label>
        <input
          type="number"
          min={40}
          max={300}
          value={bpm}
          onChange={(e) => onBpm(Number(e.target.value) || bpm)}
        />
        <input
          type="range"
          min={90}
          max={160}
          value={bpm}
          onChange={(e) => onBpm(Number(e.target.value))}
        />
      </div>

      <div className="ctrl">
        <label>Swing {Math.round(swing * 100)}%</label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(swing * 100)}
          onChange={(e) => onSwing(Number(e.target.value) / 100)}
        />
      </div>
    </div>
  );
}
