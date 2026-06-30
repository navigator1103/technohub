// ============================================================================
// BassSynth.ts — a monophonic acid/techno bass.
//
// Design: ONE persistent oscillator + filter + amp, kept alive for the synth's
// lifetime. Slides work because we ramp the single oscillator's frequency
// instead of retriggering, exactly like a 303. The amp and filter are
// re-enveloped on every note. This is intentionally raw, not a polished synth.
// ============================================================================

import { createSaturation } from "./Effects";

export interface BassTriggerParams {
  /** absolute frequency in Hz for this note */
  frequency: number;
  /** when to start, in ctx time */
  time: number;
  /** note length in seconds */
  duration: number;
  /** 0..1 loudness */
  velocity: number;
  /** glide from the previous note's pitch into this one */
  slide: boolean;
  /** open the filter further + push level */
  accent: boolean;
}

export class BassSynth {
  private osc: OscillatorNode;
  private amp: GainNode;
  private filter: BiquadFilterNode;
  private drive: WaveShaperNode;
  /** public output — connect this into the engine's bass bus */
  readonly output: GainNode;

  private lastFreq = 55;
  private started = false;

  // Tone controls (could be exposed to UI later).
  private baseCutoff = 350; // Hz, resting filter cutoff
  private envAmount = 2200; // Hz the filter envelope adds on top
  private resonance = 8; // filter Q — high for that acid squelch

  constructor(ctx: BaseAudioContext, waveform: OscillatorType = "sawtooth") {
    this.osc = ctx.createOscillator();
    this.osc.type = waveform;
    this.osc.frequency.value = this.lastFreq;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = this.baseCutoff;
    this.filter.Q.value = this.resonance;

    this.drive = createSaturation(ctx, 0.6); // built-in grit

    this.amp = ctx.createGain();
    this.amp.gain.value = 0; // silent until a note plays

    this.output = ctx.createGain();
    this.output.gain.value = 0.9;

    // osc -> filter -> drive -> amp -> output
    this.osc.connect(this.filter);
    this.filter.connect(this.drive);
    this.drive.connect(this.amp);
    this.amp.connect(this.output);
  }

  /** Start the persistent oscillator. Safe to call once. */
  start(time = 0): void {
    if (this.started) return;
    this.osc.start(time);
    this.started = true;
  }

  setWaveform(waveform: OscillatorType): void {
    this.osc.type = waveform;
  }

  /** Trigger one bass note. */
  trigger(p: BassTriggerParams): void {
    const { frequency, time, duration, velocity, slide, accent } = p;
    const f = this.osc.frequency;

    // Pitch: glide from the previous note if sliding, else jump instantly.
    if (slide) {
      f.cancelScheduledValues(time);
      f.setValueAtTime(this.lastFreq, time);
      f.exponentialRampToValueAtTime(frequency, time + Math.min(0.08, duration));
    } else {
      f.cancelScheduledValues(time);
      f.setValueAtTime(frequency, time);
    }
    this.lastFreq = frequency;

    // Amp envelope: punchy attack, decay across most of the step. Slides hold
    // the level (legato) instead of re-attacking from zero.
    const peak = velocity * (accent ? 1.0 : 0.8);
    const g = this.amp.gain;
    g.cancelScheduledValues(time);
    if (!slide) {
      g.setValueAtTime(0.0001, time);
      g.exponentialRampToValueAtTime(peak, time + 0.006);
    } else {
      g.setValueAtTime(Math.max(0.0001, g.value), time);
      g.exponentialRampToValueAtTime(peak, time + 0.02);
    }
    g.exponentialRampToValueAtTime(0.0001, time + duration * 0.95);

    // Filter envelope: the squelch. Accent opens it wider and rings longer.
    const cut = this.filter.frequency;
    const env = this.envAmount * (accent ? 1.5 : 1) * (0.5 + velocity * 0.5);
    cut.cancelScheduledValues(time);
    cut.setValueAtTime(this.baseCutoff + env, time);
    cut.exponentialRampToValueAtTime(
      this.baseCutoff,
      time + duration * (accent ? 0.8 : 0.5),
    );

    this.filter.Q.setValueAtTime(accent ? this.resonance * 1.3 : this.resonance, time);
  }
}
