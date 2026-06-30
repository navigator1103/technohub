// ============================================================================
// patternPresets.ts — genre starter patterns + the "Generate Groove" button.
// ============================================================================

import {
  DRUM_LAYOUT,
  makeBassStep,
  makeDrumTrack,
  makeId,
  makeStep,
  STEP_COUNT,
  type BassStep,
  type DrumTrack,
  type Pattern,
  type SampleType,
} from "./patternTypes";

type HitMap = Partial<Record<SampleType, number[]>>;

/** Build a pattern from a simple map of sampleType -> active step indices. */
function buildPattern(name: string, hits: HitMap, bass: BassStep[]): Pattern {
  const tracks = DRUM_LAYOUT.map(makeDrumTrack);
  const byType = (t: SampleType) => tracks.find((x) => x.sampleType === t)!;
  (Object.keys(hits) as SampleType[]).forEach((type) => {
    const trk = byType(type);
    hits[type]!.forEach((i) => {
      if (i >= 0 && i < STEP_COUNT) trk.steps[i] = makeStep(true);
    });
  });
  return {
    id: makeId("pat"),
    name,
    steps: STEP_COUNT,
    drumTracks: tracks,
    bassline: bass,
  };
}

function bassFrom(
  hits: Array<{ i: number; note: number; octave?: number; slide?: boolean; accent?: boolean }>,
): BassStep[] {
  const line = Array.from({ length: STEP_COUNT }, () => makeBassStep());
  hits.forEach((h) => {
    line[h.i] = {
      ...makeBassStep(true),
      note: h.note,
      octave: h.octave ?? 2,
      slide: h.slide ?? false,
      accent: h.accent ?? false,
    };
  });
  return line;
}

export interface PresetDef {
  id: string;
  name: string;
  bpm: number;
  swing: number;
  build: () => Pattern;
}

export const PRESETS: PresetDef[] = [
  {
    id: "dark",
    name: "Dark Techno",
    bpm: 132,
    swing: 0.06,
    build: () =>
      buildPattern(
        "Dark Techno",
        {
          kick: [0, 4, 8, 12],
          clap: [4, 12],
          closedHat: [2, 6, 10, 14],
          openHat: [14],
          rim: [7],
          perc: [11],
        },
        bassFrom([
          { i: 0, note: 0, octave: 1, accent: true },
          { i: 6, note: 0, octave: 1 },
          { i: 8, note: 0, octave: 1 },
          { i: 14, note: 3, octave: 1, slide: true },
        ]),
      ),
  },
  {
    id: "minimal",
    name: "Minimal Techno",
    bpm: 128,
    swing: 0.12,
    build: () =>
      buildPattern(
        "Minimal Techno",
        {
          kick: [0, 4, 8, 12],
          closedHat: [2, 6, 10, 14],
          rim: [3, 11],
          perc: [7, 15],
        },
        bassFrom([
          { i: 2, note: 0, octave: 2 },
          { i: 10, note: 7, octave: 1 },
        ]),
      ),
  },
  {
    id: "peak",
    name: "Peak Time",
    bpm: 134,
    swing: 0.04,
    build: () =>
      buildPattern(
        "Peak Time",
        {
          kick: [0, 4, 8, 12],
          clap: [4, 12],
          closedHat: [0, 2, 4, 6, 8, 10, 12, 14],
          openHat: [2, 6, 10, 14],
          ride: [1, 5, 9, 13],
          perc: [3, 11],
        },
        bassFrom([
          { i: 0, note: 0, octave: 2, accent: true },
          { i: 4, note: 0, octave: 2 },
          { i: 8, note: 10, octave: 1, slide: true },
          { i: 12, note: 0, octave: 2 },
        ]),
      ),
  },
  {
    id: "acid",
    name: "Acid Groove",
    bpm: 130,
    swing: 0.1,
    build: () =>
      buildPattern(
        "Acid Groove",
        {
          kick: [0, 4, 8, 12],
          clap: [4, 12],
          closedHat: [2, 6, 10, 14],
          openHat: [6, 14],
          perc: [7, 15],
        },
        bassFrom([
          { i: 0, note: 0, octave: 2, accent: true },
          { i: 2, note: 0, octave: 2, slide: true },
          { i: 3, note: 3, octave: 2 },
          { i: 6, note: 5, octave: 2, slide: true },
          { i: 8, note: 0, octave: 2 },
          { i: 10, note: 7, octave: 2, accent: true },
          { i: 11, note: 10, octave: 2, slide: true },
          { i: 14, note: 3, octave: 2 },
        ]),
      ),
  },
];

export function buildPresetPattern(id: string): Pattern | null {
  const preset = PRESETS.find((p) => p.id === id);
  return preset ? preset.build() : null;
}

// ----------------------------------------------------------------------------
// Generate Groove — a tasteful randomiser.
// ----------------------------------------------------------------------------

const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10]; // natural minor degrees

function chance(p: number): boolean {
  return Math.random() < p;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Produce a fresh, musical-ish techno pattern:
 *   - kick stays four-on-the-floor (occasional ghost)
 *   - clap locked to 5/13
 *   - hats & perc randomised with probability for variation
 *   - bass uses a minor scale with some slides/accents
 */
export function generateGroove(): Pattern {
  const tracks: DrumTrack[] = DRUM_LAYOUT.map(makeDrumTrack);
  const byType = (t: SampleType) => tracks.find((x) => x.sampleType === t)!;

  // Kick: solid four-on-the-floor, maybe one ghost note.
  const kick = byType("kick");
  [0, 4, 8, 12].forEach((i) => (kick.steps[i] = makeStep(true)));
  if (chance(0.3)) {
    const ghost = pick([3, 7, 11, 15]);
    const g = makeStep(true);
    g.velocity = 0.5;
    g.probability = 0.5;
    kick.steps[ghost] = g;
  }

  // Clap on the backbeat.
  const clap = byType("clap");
  [4, 12].forEach((i) => {
    const s = makeStep(true);
    s.accent = true;
    clap.steps[i] = s;
  });

  // Closed hats: offbeats guaranteed, fill the rest probabilistically.
  const ch = byType("closedHat");
  for (let i = 0; i < STEP_COUNT; i++) {
    if (i % 2 === 1 && chance(0.85)) {
      const s = makeStep(true);
      s.probability = chance(0.3) ? 0.6 : 1;
      if (chance(0.15)) s.ratchet = pick([2, 2, 3]);
      ch.steps[i] = s;
    } else if (chance(0.2)) {
      ch.steps[i] = makeStep(true);
    }
  }

  // Open hat: a couple of offbeat lifts.
  const oh = byType("openHat");
  [6, 14].forEach((i) => {
    if (chance(0.7)) oh.steps[i] = makeStep(true);
  });

  // Percussion: sparse, probabilistic, syncopated.
  const perc = byType("perc");
  for (let i = 0; i < STEP_COUNT; i++) {
    if (chance(0.18)) {
      const s = makeStep(true);
      s.probability = pick([0.4, 0.6, 0.8]);
      perc.steps[i] = s;
    }
  }

  // Rim: a sprinkle.
  const rim = byType("rim");
  for (let i = 0; i < STEP_COUNT; i++) {
    if (i % 4 !== 0 && chance(0.12)) rim.steps[i] = makeStep(true);
  }

  // Bass: rooted, minor-scale, with slides and accents for movement.
  const bass = Array.from({ length: STEP_COUNT }, () => makeBassStep());
  const root = 0;
  for (let i = 0; i < STEP_COUNT; i++) {
    // Favour offbeats and gaps between kicks.
    const onKick = i % 4 === 0;
    const prob = onKick ? 0.25 : 0.45;
    if (chance(prob)) {
      const degree = chance(0.6) ? root : pick(MINOR_SCALE);
      const s = makeBassStep(true);
      s.note = (root + degree) % 12;
      s.octave = chance(0.2) ? 1 : 2;
      s.slide = chance(0.3);
      s.accent = chance(0.25);
      bass[i] = s;
    }
  }
  // Guarantee a downbeat anchor.
  if (!bass[0].active) bass[0] = { ...makeBassStep(true), note: root, accent: true };

  return {
    id: makeId("pat"),
    name: "Generated Groove",
    steps: STEP_COUNT,
    drumTracks: tracks,
    bassline: bass,
  };
}
