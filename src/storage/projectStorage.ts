// ============================================================================
// projectStorage.ts — localStorage autosave + JSON import/export.
//
// Imported JSON is validated lightly: we check shape and coerce/repair missing
// fields rather than trusting it. If anything is fundamentally wrong we fall
// back to a fresh default project so the app never gets stuck in a bad state.
// ============================================================================

import {
  makeBassStep,
  makeDefaultProject,
  makeStep,
  STEP_COUNT,
  type BassStep,
  type DrumTrack,
  type Pattern,
  type Project,
  type SampleType,
  type Step,
} from "../sequencing/patternTypes";

const STORAGE_KEY = "technoforge.project.v1";

// ----------------------------------------------------------------------------
// Validation / coercion helpers
// ----------------------------------------------------------------------------

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = typeof n === "number" && isFinite(n) ? n : fallback;
  return Math.max(lo, Math.min(hi, v));
}

function coerceStep(raw: unknown): Step {
  const base = makeStep();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  return {
    active: !!r.active,
    velocity: clamp(r.velocity, 0, 1, base.velocity),
    probability: clamp(r.probability, 0, 1, base.probability),
    accent: !!r.accent,
    ratchet: clamp(r.ratchet, 1, 8, base.ratchet),
  };
}

function coerceBassStep(raw: unknown): BassStep {
  const base = makeBassStep();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  return {
    active: !!r.active,
    note: Math.round(clamp(r.note, 0, 11, base.note)),
    octave: Math.round(clamp(r.octave, 0, 5, base.octave)),
    velocity: clamp(r.velocity, 0, 1, base.velocity),
    slide: !!r.slide,
    accent: !!r.accent,
  };
}

const VALID_TYPES: SampleType[] = [
  "kick",
  "clap",
  "closedHat",
  "openHat",
  "ride",
  "rim",
  "tom",
  "perc",
];

function fixedLength<T>(arr: unknown, len: number, coerce: (x: unknown) => T): T[] {
  const src = Array.isArray(arr) ? arr : [];
  return Array.from({ length: len }, (_, i) => coerce(src[i]));
}

function coerceTrack(raw: unknown): DrumTrack | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const sampleType = VALID_TYPES.includes(r.sampleType as SampleType)
    ? (r.sampleType as SampleType)
    : "perc";
  return {
    id: typeof r.id === "string" ? r.id : `trk-${Math.random().toString(36).slice(2)}`,
    name: typeof r.name === "string" ? r.name : sampleType,
    sampleType,
    volume: clamp(r.volume, 0, 1, 0.8),
    pan: clamp(r.pan, -1, 1, 0),
    pitch: clamp(r.pitch, -24, 24, 0),
    decay: clamp(r.decay, 0, 1, 0.5),
    drive: clamp(r.drive, 0, 1, 0),
    muted: !!r.muted,
    solo: !!r.solo,
    steps: fixedLength(r.steps, STEP_COUNT, coerceStep),
  };
}

function coercePattern(raw: unknown): Pattern | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const tracks = (Array.isArray(r.drumTracks) ? r.drumTracks : [])
    .map(coerceTrack)
    .filter((t): t is DrumTrack => t !== null);
  if (tracks.length === 0) return null;
  return {
    id: typeof r.id === "string" ? r.id : `pat-${Math.random().toString(36).slice(2)}`,
    name: typeof r.name === "string" ? r.name : "Pattern",
    steps: STEP_COUNT,
    drumTracks: tracks,
    bassline: fixedLength(r.bassline, STEP_COUNT, coerceBassStep),
  };
}

/** Validate + repair an arbitrary object into a Project, or null if hopeless. */
export function coerceProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const patterns = (Array.isArray(r.patterns) ? r.patterns : [])
    .map(coercePattern)
    .filter((p): p is Pattern => p !== null);
  if (patterns.length === 0) return null;
  const selected =
    typeof r.selectedPatternId === "string" &&
    patterns.some((p) => p.id === r.selectedPatternId)
      ? (r.selectedPatternId as string)
      : patterns[0].id;
  return {
    name: typeof r.name === "string" ? r.name : "Untitled Project",
    bpm: clamp(r.bpm, 40, 300, 132),
    swing: clamp(r.swing, 0, 1, 0),
    patterns,
    selectedPatternId: selected,
  };
}

// ----------------------------------------------------------------------------
// localStorage autosave
// ----------------------------------------------------------------------------

export function saveToLocalStorage(project: Project): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    // Storage full / disabled — non-fatal, just skip autosave.
  }
}

export function loadFromLocalStorage(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = coerceProject(JSON.parse(raw));
      if (parsed) return parsed;
    }
  } catch {
    // Corrupt JSON — ignore and start fresh.
  }
  return makeDefaultProject();
}

// ----------------------------------------------------------------------------
// JSON file import / export
// ----------------------------------------------------------------------------

export function exportProjectFile(project: Project): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "project";
  a.download = `technoforge-${safe}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Read a File chosen by the user and return a validated Project (or null). */
export function importProjectFile(file: File): Promise<Project | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = coerceProject(JSON.parse(String(reader.result)));
        resolve(parsed);
      } catch {
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}
