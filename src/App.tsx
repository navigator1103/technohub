// ============================================================================
// App.tsx — wires React state to the audio engine + sequencer.
//
// React owns the project data (the single source of truth) and pushes settings
// into the engine. The Sequencer reads the LATEST project via a ref each tick,
// so live edits are heard immediately without restarting playback. The engine
// calls back into React only to highlight the current step.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioEngine } from "./audio/AudioEngine";
import { Sequencer } from "./sequencing/Sequencer";
import { exportPatternToWav } from "./audio/WavExporter";
import {
  makeBassStep,
  makeDefaultPattern,
  makeId,
  makeStep,
  type BassStep,
  type DrumTrack as DrumTrackType,
  type Pattern,
  type Project,
  type Step,
} from "./sequencing/patternTypes";
import { buildPresetPattern, generateGroove, PRESETS } from "./sequencing/patternPresets";
import {
  exportProjectFile,
  importProjectFile,
  loadFromLocalStorage,
  saveToLocalStorage,
} from "./storage/projectStorage";
import { Transport } from "./components/Transport";
import { StepSequencer } from "./components/StepSequencer";
import { Mixer } from "./components/Mixer";
import { BasslineEditor } from "./components/BasslineEditor";
import { PatternControls } from "./components/PatternControls";

export default function App() {
  const [project, setProject] = useState<Project>(() => loadFromLocalStorage());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [sidechainEnabled, setSidechainEnabled] = useState(true);
  const [exporting, setExporting] = useState(false);

  const engineRef = useRef<AudioEngine | null>(null);
  const seqRef = useRef<Sequencer | null>(null);

  // Keep a live ref so the sequencer always reads the newest project.
  const projectRef = useRef(project);
  projectRef.current = project;

  const selectedPattern =
    project.patterns.find((p) => p.id === project.selectedPatternId) ??
    project.patterns[0];

  // ---- Audio init (must happen inside a user gesture) ----
  const ensureAudio = useCallback(async () => {
    if (!engineRef.current) {
      const engine = new AudioEngine();
      engine.init();
      engine.sidechainEnabled = sidechainEnabled;
      engineRef.current = engine;

      const seq = new Sequencer(engine, {
        getPattern: () => {
          const p = projectRef.current;
          return p.patterns.find((x) => x.id === p.selectedPatternId) ?? p.patterns[0];
        },
        getBpm: () => projectRef.current.bpm,
        getSwing: () => projectRef.current.swing,
        onStep: (i) => setCurrentStep(i),
      });
      seqRef.current = seq;
      engine.setTracks(
        (
          projectRef.current.patterns.find(
            (x) => x.id === projectRef.current.selectedPatternId,
          ) ?? projectRef.current.patterns[0]
        ).drumTracks,
      );
    }
    // Unlock synchronously within the gesture (critical for mobile), then make
    // sure the context is fully running before the sequencer schedules events.
    engineRef.current.unlock();
    await engineRef.current.resume();
  }, [sidechainEnabled]);

  // ---- Transport ----
  const togglePlay = useCallback(async () => {
    await ensureAudio();
    const seq = seqRef.current!;
    if (seq.isPlaying) {
      seq.stop();
      setIsPlaying(false);
    } else {
      seq.start();
      setIsPlaying(true);
    }
  }, [ensureAudio]);

  const stop = useCallback(() => {
    seqRef.current?.stop();
    setIsPlaying(false);
    setCurrentStep(-1);
  }, []);

  // Spacebar toggles play (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        void togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay]);

  // ---- Keep engine track settings in sync with the selected pattern ----
  useEffect(() => {
    engineRef.current?.setTracks(selectedPattern.drumTracks);
  }, [selectedPattern]);

  // ---- Sidechain toggle ----
  useEffect(() => {
    if (engineRef.current) engineRef.current.sidechainEnabled = sidechainEnabled;
  }, [sidechainEnabled]);

  // ---- Autosave to localStorage ----
  useEffect(() => {
    saveToLocalStorage(project);
  }, [project]);

  // --------------------------------------------------------------------------
  // Immutable update helpers
  // --------------------------------------------------------------------------

  const mapSelectedPattern = (updater: (p: Pattern) => Pattern) =>
    setProject((prev) => ({
      ...prev,
      patterns: prev.patterns.map((p) =>
        p.id === prev.selectedPatternId ? updater(p) : p,
      ),
    }));

  const updateStep = (trackId: string, stepIndex: number, patch: Partial<Step>) =>
    mapSelectedPattern((p) => ({
      ...p,
      drumTracks: p.drumTracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              steps: t.steps.map((s, i) =>
                i === stepIndex ? { ...s, ...patch } : s,
              ),
            }
          : t,
      ),
    }));

  const updateTrack = (trackId: string, patch: Partial<DrumTrackType>) =>
    mapSelectedPattern((p) => ({
      ...p,
      drumTracks: p.drumTracks.map((t) =>
        t.id === trackId ? { ...t, ...patch } : t,
      ),
    }));

  const updateBassStep = (stepIndex: number, patch: Partial<BassStep>) =>
    mapSelectedPattern((p) => ({
      ...p,
      bassline: p.bassline.map((b, i) =>
        i === stepIndex ? { ...b, ...patch } : b,
      ),
    }));

  const setBpm = (bpm: number) =>
    setProject((prev) => ({ ...prev, bpm: Math.max(40, Math.min(300, bpm)) }));
  const setSwing = (swing: number) => setProject((prev) => ({ ...prev, swing }));

  // ---- Pattern management ----
  const selectPattern = (id: string) =>
    setProject((prev) => ({ ...prev, selectedPatternId: id }));

  const newPattern = () =>
    setProject((prev) => {
      const pat = makeDefaultPattern(`Pattern ${prev.patterns.length + 1}`);
      return { ...prev, patterns: [...prev.patterns, pat], selectedPatternId: pat.id };
    });

  const duplicatePattern = () =>
    setProject((prev) => {
      const cur =
        prev.patterns.find((p) => p.id === prev.selectedPatternId) ?? prev.patterns[0];
      // Deep clone via JSON; assign fresh ids.
      const clone: Pattern = JSON.parse(JSON.stringify(cur));
      clone.id = makeId("pat");
      clone.name = `${cur.name} copy`;
      clone.drumTracks.forEach((t) => (t.id = makeId("trk")));
      return { ...prev, patterns: [...prev.patterns, clone], selectedPatternId: clone.id };
    });

  /** Replace the selected pattern's content in place (used by generate/preset). */
  const replaceSelectedContent = (source: Pattern, name: string) =>
    mapSelectedPattern((p) => ({
      ...p,
      name,
      drumTracks: source.drumTracks.map((t) => ({ ...t, id: makeId("trk") })),
      bassline: source.bassline,
    }));

  const loadPreset = (presetId: string) => {
    const pat = buildPresetPattern(presetId);
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!pat || !preset) return;
    replaceSelectedContent(pat, preset.name);
    setBpm(preset.bpm);
    setSwing(preset.swing);
  };

  const generate = () => {
    const pat = generateGroove();
    replaceSelectedContent(pat, "Generated Groove");
  };

  /** Wipe every drum step + bass note in the current pattern (keeps mixer/tempo). */
  const clearPattern = () => {
    if (!window.confirm("Clear all steps and bass notes in this pattern?")) return;
    mapSelectedPattern((p) => ({
      ...p,
      drumTracks: p.drumTracks.map((t) => ({
        ...t,
        steps: t.steps.map(() => makeStep()),
      })),
      bassline: p.bassline.map(() => makeBassStep()),
    }));
  };

  // ---- Save / load / export ----
  const saveJson = () => exportProjectFile(projectRef.current);

  const loadJson = async (file: File) => {
    const loaded = await importProjectFile(file);
    if (loaded) {
      stop();
      setProject(loaded);
    } else {
      alert("Could not load that file — it doesn't look like a TechnoForge project.");
    }
  };

  const exportWav = async () => {
    setExporting(true);
    try {
      await exportPatternToWav(selectedPattern, project.bpm, project.swing, { bars: 4 });
    } catch (err) {
      console.error(err);
      alert("WAV export failed. See console for details.");
    } finally {
      setExporting(false);
    }
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="logo">
          TECHNO<span>FORGE</span>
        </h1>
        <span className="tagline">techno groovebox · MVP</span>
      </header>

      <Transport
        isPlaying={isPlaying}
        bpm={project.bpm}
        swing={project.swing}
        onTogglePlay={togglePlay}
        onStop={stop}
        onBpm={setBpm}
        onSwing={setSwing}
      />

      <PatternControls
        patterns={project.patterns}
        selectedPatternId={project.selectedPatternId}
        sidechainEnabled={sidechainEnabled}
        exporting={exporting}
        onSelectPattern={selectPattern}
        onNewPattern={newPattern}
        onDuplicatePattern={duplicatePattern}
        onClearPattern={clearPattern}
        onLoadPreset={loadPreset}
        onGenerate={generate}
        onSaveJson={saveJson}
        onLoadJson={loadJson}
        onExportWav={exportWav}
        onToggleSidechain={setSidechainEnabled}
      />

      <StepSequencer
        pattern={selectedPattern}
        currentStep={currentStep}
        onUpdateStep={updateStep}
        onUpdateTrack={updateTrack}
      />

      <div className="two-col">
        <BasslineEditor
          pattern={selectedPattern}
          currentStep={currentStep}
          onUpdateBassStep={updateBassStep}
        />
        <Mixer pattern={selectedPattern} onUpdateTrack={updateTrack} />
      </div>

      <footer className="app-footer">
        Synthesised 909-style voices · Web Audio API · no samples required
      </footer>
    </div>
  );
}
