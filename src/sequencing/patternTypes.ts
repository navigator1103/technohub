// ============================================================================
// patternTypes.ts — the TechnoForge data model.
// Everything that gets saved to JSON / localStorage is described here.
// ============================================================================

/** The synthesised drum voices the engine knows how to make. */
export type SampleType =
  | "kick"
  | "clap"
  | "closedHat"
  | "openHat"
  | "ride"
  | "rim"
  | "tom"
  | "perc";

/** A single drum step in the 16-step grid. */
export interface Step {
  active: boolean;
  /** 0..1 loudness for this hit. */
  velocity: number;
  /** 0..1 chance the step actually fires (1 = always). */
  probability: number;
  /** Extra emphasis — boosts volume and (for hats) brightness. */
  accent: boolean;
  /** Number of sub-hits packed into the step (1 = normal, 2..4 = roll). */
  ratchet: number;
}

/** A single drum lane. */
export interface DrumTrack {
  id: string;
  name: string;
  sampleType: SampleType;
  volume: number; // 0..1
  pan: number; // -1..1
  pitch: number; // semitone offset, -24..24
  decay: number; // 0..1 multiplier on the voice's natural decay
  drive: number; // 0..1 saturation amount
  muted: boolean;
  solo: boolean;
  steps: Step[];
}

/** A single step of the monophonic bassline. */
export interface BassStep {
  active: boolean;
  note: number; // semitone within the octave, 0..11 (0 = C)
  octave: number; // 1..4
  velocity: number; // 0..1
  slide: boolean; // glide into this note from the previous one
  accent: boolean; // open the filter / push the level
}

/** One pattern = one 16-step loop across all tracks. */
export interface Pattern {
  id: string;
  name: string;
  steps: number; // grid length, default 16
  drumTracks: DrumTrack[];
  bassline: BassStep[];
}

/** The whole project — what gets persisted. */
export interface Project {
  name: string;
  bpm: number;
  swing: number; // 0..1, amount of shuffle on offbeat 16ths
  patterns: Pattern[];
  selectedPatternId: string;
}

// ----------------------------------------------------------------------------
// Factory helpers — keep defaults in one place.
// ----------------------------------------------------------------------------

export const STEP_COUNT = 16;

export function makeStep(active = false): Step {
  return { active, velocity: 0.9, probability: 1, accent: false, ratchet: 1 };
}

export function makeBassStep(active = false): BassStep {
  return {
    active,
    note: 0,
    octave: 2,
    velocity: 0.9,
    slide: false,
    accent: false,
  };
}

function emptySteps(): Step[] {
  return Array.from({ length: STEP_COUNT }, () => makeStep());
}

function emptyBassline(): BassStep[] {
  return Array.from({ length: STEP_COUNT }, () => makeBassStep());
}

/** Default per-voice tuning so a fresh track sounds usable immediately. */
const TRACK_DEFAULTS: Record<
  SampleType,
  { name: string; volume: number; decay: number; drive: number; pitch: number }
> = {
  kick: { name: "Kick", volume: 0.95, decay: 0.5, drive: 0.25, pitch: 0 },
  clap: { name: "Clap", volume: 0.7, decay: 0.5, drive: 0.1, pitch: 0 },
  closedHat: { name: "Closed Hat", volume: 0.55, decay: 0.3, drive: 0, pitch: 0 },
  openHat: { name: "Open Hat", volume: 0.5, decay: 0.6, drive: 0, pitch: 0 },
  ride: { name: "Ride", volume: 0.45, decay: 0.7, drive: 0, pitch: 0 },
  rim: { name: "Rim", volume: 0.6, decay: 0.3, drive: 0, pitch: 0 },
  tom: { name: "Tom", volume: 0.6, decay: 0.5, drive: 0.1, pitch: 0 },
  perc: { name: "Perc", volume: 0.55, decay: 0.4, drive: 0.1, pitch: 0 },
};

let idCounter = 0;
/** Deterministic-ish unique id (no crypto dependency needed). */
export function makeId(prefix = "id"): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function makeDrumTrack(sampleType: SampleType): DrumTrack {
  const d = TRACK_DEFAULTS[sampleType];
  return {
    id: makeId("trk"),
    name: d.name,
    sampleType,
    volume: d.volume,
    pan: 0,
    pitch: d.pitch,
    decay: d.decay,
    drive: d.drive,
    muted: false,
    solo: false,
    steps: emptySteps(),
  };
}

/** The fixed order of the 8 drum lanes. */
export const DRUM_LAYOUT: SampleType[] = [
  "kick",
  "clap",
  "closedHat",
  "openHat",
  "ride",
  "rim",
  "tom",
  "perc",
];

/**
 * Build the signature 132 BPM techno starter pattern:
 *   - four-on-the-floor kick
 *   - clap on steps 5 & 13 (the classic backbeat)
 *   - closed hats on the offbeat 8ths
 *   - open hat on the offbeat
 *   - sparse perc
 */
export function makeDefaultPattern(name = "Init"): Pattern {
  const tracks = DRUM_LAYOUT.map(makeDrumTrack);
  const byType = (t: SampleType) => tracks.find((x) => x.sampleType === t)!;

  const setActive = (t: SampleType, indices: number[]) => {
    const trk = byType(t);
    indices.forEach((i) => {
      trk.steps[i] = makeStep(true);
    });
  };

  // Kick: every 4th 16th note -> steps 0,4,8,12.
  setActive("kick", [0, 4, 8, 12]);
  // Clap: steps 4 & 12 (1-indexed 5 & 13).
  setActive("clap", [4, 12]);
  byType("clap").steps[4].accent = true;
  byType("clap").steps[12].accent = true;
  // Closed hats: the offbeat 8ths -> 2,6,10,14.
  setActive("closedHat", [2, 6, 10, 14]);
  // Open hat: a single offbeat lift on step 14.
  setActive("openHat", [14]);
  // Sparse perc.
  setActive("perc", [7, 15]);
  byType("perc").steps[7].probability = 0.6;
  byType("perc").steps[15].probability = 0.5;

  // A simple rolling minor bass: root on the offbeats with a couple of slides.
  const bass = emptyBassline();
  const bassHits: Array<Partial<BassStep> & { i: number }> = [
    { i: 2, note: 0, octave: 2 },
    { i: 6, note: 0, octave: 2, slide: true },
    { i: 7, note: 3, octave: 2 },
    { i: 10, note: 0, octave: 2 },
    { i: 14, note: 7, octave: 2, accent: true },
  ];
  bassHits.forEach(({ i, ...rest }) => {
    bass[i] = { ...makeBassStep(true), ...rest };
  });

  return {
    id: makeId("pat"),
    name,
    steps: STEP_COUNT,
    drumTracks: tracks,
    bassline: bass,
  };
}

export function makeDefaultProject(): Project {
  const pattern = makeDefaultPattern("Pattern 1");
  return {
    name: "Untitled Project",
    bpm: 132,
    swing: 0,
    patterns: [pattern],
    selectedPatternId: pattern.id,
  };
}

/** Note names for the bass editor UI. */
export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];
