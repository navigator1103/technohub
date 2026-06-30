# TechnoForge

A browser-based **techno groovebox** — a focused little machine for building 16-step
techno loops fast. Not a DAW: no timeline, no plugins, no audio tracks. Just a kit, a
sequencer, an acid bass, a sidechain pump, and a way to bounce the result to WAV.

Everything is **synthesised** with the Web Audio API — 909-style drum voices and a
303-style mono bass — so there are **no samples to load**. Open it and make noise.

![stack](https://img.shields.io/badge/React-18-61dafb) ![stack](https://img.shields.io/badge/TypeScript-5-3178c6) ![stack](https://img.shields.io/badge/Vite-5-646cff) ![audio](https://img.shields.io/badge/Web%20Audio-API-ff5c2a)

---

## Features

- **16-step sequencer × 8 drum tracks** — Kick, Clap, Closed Hat, Open Hat, Ride, Rim, Tom, Perc.
- **Synthesised 909-style drums** — each voice is generated live (sine pitch-envelope kick, noise-burst clap, filtered-noise hats, metallic ride, etc.). No sample files.
- **Per-step detail** — velocity via accent, **probability** (shift-click), **ratchets/rolls** (alt-click), and accent (right-click).
- **BPM & swing** — tempo 40–300, swing shuffles the offbeat 16ths.
- **Acid bassline** — monophonic saw bass with resonant low-pass filter envelope, built-in drive, and **slide/glide** between notes. Note + octave + accent per step.
- **Mixer** — per-track volume, decay, drive (saturation), pan, pitch, plus **mute/solo**.
- **Sidechain pump** — the bass ducks on every kick for that classic techno breathing (toggleable).
- **Presets** — Dark Techno, Minimal Techno, Peak Time, Acid Groove.
- **Generate Groove** — a tasteful randomiser: keeps the kick four-on-the-floor and the clap on the backbeat, randomises hats/perc with probability, and writes a minor-scale bassline.
- **Patterns** — multiple patterns per project; new / duplicate / switch.
- **Save / load** — autosaves to `localStorage`, exports/imports the project as JSON (with light validation + safe fallback).
- **WAV export** — renders 4 bars offline (reusing the exact synthesis engine) and downloads `technoforge-loop.wav`.
- **Keyboard** — `Space` toggles play/stop.

---

## Install

Requires Node 18+.

```bash
npm install
```

## Run (development)

```bash
npm run dev
```

Then open the printed URL (default <http://localhost:5173>). **Click Play (or press Space) once** —
browsers only allow audio to start after a user gesture.

## Build (production)

```bash
npm run build      # typecheck + bundle to dist/
npm run preview    # serve the production build locally
```

## Typecheck only

```bash
npm run typecheck
```

---

## How it works (architecture)

```
src/
  audio/
    AudioEngine.ts    # owns AudioContext + master chain + per-track nodes + sidechain
    DrumVoice.ts      # pure 909-style synthesis functions (self-cleaning nodes)
    BassSynth.ts      # persistent mono 303-style voice with glide
    Effects.ts        # saturation, master limiter, delay send, pump envelope
    WavExporter.ts    # OfflineAudioContext render + AudioBuffer -> 16-bit WAV
  sequencing/
    Sequencer.ts      # lookahead scheduler (audio-clock timing, swing, ratchets, probability)
    patternTypes.ts   # the data model + defaults (132 BPM techno starter)
    patternPresets.ts # genre presets + Generate Groove
  components/         # Transport, StepSequencer, DrumTrack, Mixer, BasslineEditor, PatternControls
  storage/
    projectStorage.ts # localStorage autosave + JSON import/export with validation
  App.tsx             # wires React state <-> engine <-> sequencer
```

Key design choices:

- **Audio is decoupled from React.** React holds the project (single source of truth) and
  pushes settings into the engine; the sequencer reads the latest project via a ref each tick,
  so live edits are heard immediately. The engine only calls back to highlight the current step.
- **Lookahead scheduling** (Chris Wilson's "two clocks"): a coarse 25 ms timer schedules events
  on the precise `AudioContext` clock, so timing stays stable despite JS timer jitter.
- **No leaks:** every drum hit creates oscillators/noise sources that `stop()` themselves at a
  known time, so they're garbage-collected automatically.
- **Export reuses synthesis:** WAV bounce runs the same `triggerDrumVoice` / `BassSynth` code in
  an `OfflineAudioContext`, so the file matches what you hear.

---

## Known limitations

- **Synth-only drums.** Voices are approximations of 909 sounds, not sampled. Sample import is a
  planned feature.
- **WAV export ignores per-step probability** — it renders every active step deterministically so
  the bounce is repeatable.
- **Master limiter** is a fast `DynamicsCompressor`, not a true brick-wall limiter.
- **Reverb** is not implemented (only a feedback delay send on perc/clap). Listed as optional in scope.
- **One pattern plays at a time** — no song/arrangement chaining yet.
- Slide on the bass is a fixed short glide, not tied exactly to note overlap.

---

## Next features

- VST/AU export
- Sample import (drag-and-drop your own one-shots)
- Arrangement mode (chain patterns into a song)
- Automation lanes
- MIDI controller support
- Ableton Link sync

---

Built as an MVP — readable over clever, working over complete.
