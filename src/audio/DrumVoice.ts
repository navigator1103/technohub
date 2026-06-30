// ============================================================================
// DrumVoice.ts — synthesised 909-style drum voices.
//
// Each voice is a pure function: it creates its oscillators / noise sources,
// schedules an amplitude envelope, starts and STOPS the sources so they free
// themselves, and connects to the supplied destination. Because nodes are
// stopped at a known time they are garbage-collected automatically — no manual
// cleanup bookkeeping and no leaks across thousands of hits.
//
// All functions take a BaseAudioContext, so they run identically live and in
// the OfflineAudioContext during WAV export.
// ============================================================================

import type { SampleType } from "../sequencing/patternTypes";

export interface DrumTriggerParams {
  /** semitone offset applied to the voice's base pitch */
  pitch: number;
  /** 0..1 multiplier on natural decay length */
  decay: number;
  /** 0..1 saturation handled upstream; passed for voices that self-distort */
  drive: number;
  /** 0..1 final loudness for this hit */
  velocity: number;
  /** louder + brighter when true */
  accent: boolean;
}

/** Convert a semitone offset to a frequency ratio. */
function semitoneRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

/** Cache one second of white noise per context (cheap, reused by all hits). */
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function getNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

function makeNoiseSource(ctx: BaseAudioContext): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  src.loop = true;
  return src;
}

// ----------------------------------------------------------------------------
// Individual voices
// ----------------------------------------------------------------------------

function triggerKick(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  p: DrumTriggerParams,
): void {
  const ratio = semitoneRatio(p.pitch);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const len = (0.45 + p.decay * 0.4) ; // total length in seconds

  // Pitch envelope: snap from a high "knock" down to the body frequency.
  const startFreq = 150 * ratio;
  const endFreq = 48 * ratio;
  osc.frequency.setValueAtTime(startFreq, time);
  osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.08);

  // Amplitude envelope.
  const peak = p.velocity * (p.accent ? 1.0 : 0.85);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(peak, time + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + len);

  osc.connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + len + 0.02);

  // Short transient "click" for punch.
  const click = makeNoiseSource(ctx);
  const clickGain = ctx.createGain();
  const clickFilter = ctx.createBiquadFilter();
  clickFilter.type = "highpass";
  clickFilter.frequency.value = 1200;
  clickGain.gain.setValueAtTime(peak * 0.5, time);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);
  click.connect(clickFilter).connect(clickGain).connect(dest);
  click.start(time);
  click.stop(time + 0.03);
}

function triggerClap(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  p: DrumTriggerParams,
): void {
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1200 * semitoneRatio(p.pitch);
  filter.Q.value = 1.4;

  const out = ctx.createGain();
  out.connect(dest);
  filter.connect(out);

  const peak = p.velocity * (p.accent ? 1.0 : 0.8);
  const tail = 0.12 + p.decay * 0.2;

  // A clap is three quick noise bursts then a longer tail — the classic stutter.
  const offsets = [0, 0.01, 0.02];
  offsets.forEach((off) => {
    const src = makeNoiseSource(ctx);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time + off);
    g.gain.exponentialRampToValueAtTime(peak, time + off + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, time + off + 0.03);
    src.connect(g).connect(filter);
    src.start(time + off);
    src.stop(time + off + 0.04);
  });
  // Tail burst.
  const tailSrc = makeNoiseSource(ctx);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.0001, time + 0.02);
  tg.gain.exponentialRampToValueAtTime(peak * 0.6, time + 0.025);
  tg.gain.exponentialRampToValueAtTime(0.0001, time + 0.02 + tail);
  tailSrc.connect(tg).connect(filter);
  tailSrc.start(time + 0.02);
  tailSrc.stop(time + 0.02 + tail + 0.02);
}

/** Shared hi-hat synthesis used by both closed and open hats. */
function triggerHat(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  p: DrumTriggerParams,
  baseDecay: number,
): void {
  const src = makeNoiseSource(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = (p.accent ? 9000 : 7500) * semitoneRatio(p.pitch);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 10000;
  bp.Q.value = 0.7;

  const g = ctx.createGain();
  const len = baseDecay * (0.5 + p.decay);
  const peak = p.velocity * (p.accent ? 0.9 : 0.7);
  g.gain.setValueAtTime(peak, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + len);

  src.connect(hp).connect(bp).connect(g).connect(dest);
  src.start(time);
  src.stop(time + len + 0.02);
}

function triggerRide(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  p: DrumTriggerParams,
): void {
  // Metallic tone: a cluster of inharmonic square oscillators through a high BP.
  const out = ctx.createGain();
  const len = 0.4 + p.decay * 0.6;
  const peak = p.velocity * (p.accent ? 0.6 : 0.45);
  out.gain.setValueAtTime(peak, time);
  out.gain.exponentialRampToValueAtTime(0.0001, time + len);

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 6000 * semitoneRatio(p.pitch);
  bp.Q.value = 0.5;
  bp.connect(out).connect(dest);

  const ratios = [1, 1.34, 1.79, 2.41, 2.93];
  ratios.forEach((r) => {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 440 * r * semitoneRatio(p.pitch);
    const og = ctx.createGain();
    og.gain.value = 0.2;
    osc.connect(og).connect(bp);
    osc.start(time);
    osc.stop(time + len + 0.02);
  });
}

function triggerRim(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  p: DrumTriggerParams,
): void {
  // Short pitched click: a fast triangle blip plus a noise tick.
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = 1700 * semitoneRatio(p.pitch);
  const g = ctx.createGain();
  const peak = p.velocity * (p.accent ? 0.9 : 0.7);
  g.gain.setValueAtTime(peak, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  osc.connect(g).connect(dest);
  osc.start(time);
  osc.stop(time + 0.06);

  const noise = makeNoiseSource(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 3000;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(peak * 0.5, time);
  ng.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);
  noise.connect(hp).connect(ng).connect(dest);
  noise.start(time);
  noise.stop(time + 0.03);
}

function triggerTom(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  p: DrumTriggerParams,
): void {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  const base = 180 * semitoneRatio(p.pitch);
  osc.frequency.setValueAtTime(base * 1.5, time);
  osc.frequency.exponentialRampToValueAtTime(base, time + 0.1);
  const g = ctx.createGain();
  const len = 0.25 + p.decay * 0.35;
  const peak = p.velocity * (p.accent ? 1.0 : 0.85);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(peak, time + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, time + len);
  osc.connect(g).connect(dest);
  osc.start(time);
  osc.stop(time + len + 0.02);
}

function triggerPerc(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  p: DrumTriggerParams,
): void {
  // A bright noise blip with a resonant peak — generic "perc" / shaker stab.
  const src = makeNoiseSource(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2400 * semitoneRatio(p.pitch);
  bp.Q.value = 3;
  const g = ctx.createGain();
  const len = 0.06 + p.decay * 0.15;
  const peak = p.velocity * (p.accent ? 0.9 : 0.7);
  g.gain.setValueAtTime(peak, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + len);
  src.connect(bp).connect(g).connect(dest);
  src.start(time);
  src.stop(time + len + 0.02);
}

// ----------------------------------------------------------------------------
// Dispatch
// ----------------------------------------------------------------------------

/**
 * Trigger one drum hit of `type` at `time`, routed to `dest`.
 * Self-contained: all created nodes stop themselves, so memory is reclaimed.
 */
export function triggerDrumVoice(
  ctx: BaseAudioContext,
  dest: AudioNode,
  type: SampleType,
  time: number,
  p: DrumTriggerParams,
): void {
  switch (type) {
    case "kick":
      return triggerKick(ctx, dest, time, p);
    case "clap":
      return triggerClap(ctx, dest, time, p);
    case "closedHat":
      return triggerHat(ctx, dest, time, p, 0.06);
    case "openHat":
      return triggerHat(ctx, dest, time, p, 0.35);
    case "ride":
      return triggerRide(ctx, dest, time, p);
    case "rim":
      return triggerRim(ctx, dest, time, p);
    case "tom":
      return triggerTom(ctx, dest, time, p);
    case "perc":
      return triggerPerc(ctx, dest, time, p);
  }
}
