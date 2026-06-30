// ============================================================================
// Sequencer.ts — the lookahead clock.
//
// Web Audio gives us a rock-steady audio clock (ctx.currentTime) but JS timers
// are jittery. The standard fix (Chris Wilson's "A Tale of Two Clocks"): a
// coarse setInterval wakes us ~every 25ms; each wake-up we schedule every step
// whose time falls inside a short lookahead window, using precise audio-clock
// timestamps. Timing stays sample-accurate regardless of timer jitter.
// ============================================================================

import type { AudioEngine } from "../audio/AudioEngine";
import type { Pattern, DrumTrack } from "./patternTypes";

/** How far ahead (seconds) we schedule audio events. */
const SCHEDULE_AHEAD = 0.12;
/** How often (ms) the scheduler wakes up. */
const LOOKAHEAD_MS = 25;

export interface SequencerCallbacks {
  /** Always returns the latest pattern (so live edits are picked up). */
  getPattern: () => Pattern;
  getBpm: () => number;
  getSwing: () => number;
  /** Called (roughly) when a step becomes the current one, for UI highlight. */
  onStep?: (stepIndex: number) => void;
}

export class Sequencer {
  private engine: AudioEngine;
  private cb: SequencerCallbacks;

  private timer: number | null = null;
  private currentStep = 0;
  private nextNoteTime = 0;
  isPlaying = false;

  constructor(engine: AudioEngine, cb: SequencerCallbacks) {
    this.engine = engine;
    this.cb = cb;
  }

  /** Seconds per 16th note at the current tempo. */
  private stepDuration(): number {
    const bpm = this.cb.getBpm();
    return 60 / bpm / 4; // 4 sixteenths per beat
  }

  start(): void {
    if (this.isPlaying || !this.engine.ctx) return;
    this.isPlaying = true;
    this.currentStep = 0;
    // Start a hair in the future so the first hits aren't late.
    this.nextNoteTime = this.engine.currentTime + 0.05;
    this.timer = window.setInterval(() => this.scheduler(), LOOKAHEAD_MS);
  }

  stop(): void {
    this.isPlaying = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.cb.onStep?.(-1);
  }

  /** Resolve mute/solo across the kit. */
  private isAudible(track: DrumTrack, tracks: DrumTrack[]): boolean {
    const anySolo = tracks.some((t) => t.solo);
    return track.solo || (!anySolo && !track.muted);
  }

  /** The scheduling loop. */
  private scheduler(): void {
    const ctx = this.engine.ctx;
    if (!ctx) return;
    const stepDur = this.stepDuration();
    this.engine.setStepDuration(stepDur);

    while (this.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
      this.scheduleStep(this.currentStep, this.nextNoteTime, stepDur);
      this.advance(stepDur);
    }
  }

  /** Move to the next step and compute its time, applying swing. */
  private advance(stepDur: number): void {
    this.nextNoteTime += stepDur;
    const pattern = this.cb.getPattern();
    const total = pattern.steps;
    this.currentStep = (this.currentStep + 1) % total;
  }

  /**
   * Schedule everything that happens on `step` at audio time `time`.
   * `time` is the un-swung grid time; swing offset is applied here for the
   * offbeat 16ths (odd-indexed steps).
   */
  scheduleStep(step: number, time: number, stepDur: number): void {
    const pattern = this.cb.getPattern();
    const swing = this.cb.getSwing();

    // Swing: push every second 16th (odd index) later, up to ~2/3 of a step.
    const swungTime =
      step % 2 === 1 ? time + swing * stepDur * 0.66 : time;

    // ---- Drums ----
    for (const track of pattern.drumTracks) {
      if (!this.isAudible(track, pattern.drumTracks)) continue;
      const s = track.steps[step];
      if (!s || !s.active) continue;
      // Probability gate.
      if (s.probability < 1 && Math.random() > s.probability) continue;

      const velocity = s.velocity * (s.accent ? 1 : 0.85);
      const ratchet = Math.max(1, Math.floor(s.ratchet));
      if (ratchet === 1) {
        this.engine.triggerDrum(track, swungTime, velocity, s.accent);
      } else {
        // Ratchet: pack `ratchet` evenly-spaced sub-hits inside the step.
        const sub = stepDur / ratchet;
        for (let r = 0; r < ratchet; r++) {
          this.engine.triggerDrum(track, swungTime + r * sub, velocity, s.accent);
        }
      }
    }

    // ---- Bass ----
    const b = pattern.bassline[step];
    if (b && b.active) {
      const midi = 12 * (b.octave + 1) + b.note;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      // Slides hold longer so consecutive notes connect.
      const dur = stepDur * (b.slide ? 1.8 : 0.95);
      const velocity = b.velocity * (b.accent ? 1 : 0.85);
      this.engine.triggerBass(freq, swungTime, dur, velocity, b.slide, b.accent);
    }

    // ---- UI highlight ----
    // Fire the callback aligned to the audio time (best-effort via setTimeout).
    if (this.cb.onStep) {
      const delayMs = Math.max(0, (swungTime - this.engine.currentTime) * 1000);
      window.setTimeout(() => {
        if (this.isPlaying) this.cb.onStep?.(step);
      }, delayMs);
    }
  }
}
