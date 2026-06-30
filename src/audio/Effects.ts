// ============================================================================
// Effects.ts — small, reusable DSP helpers.
// Everything takes a BaseAudioContext so the exact same code runs on both the
// live AudioContext and the OfflineAudioContext used for WAV export.
// ============================================================================

/**
 * Build a waveshaper transfer curve for soft saturation / drive.
 * `amount` 0..1 -> gentle warmth up to fairly aggressive distortion.
 */
export function makeSaturationCurve(amount: number): Float32Array<ArrayBuffer> {
  const k = amount * 100; // map 0..1 to a usable shaping coefficient
  const samples = 1024;
  // Allocate over an explicit ArrayBuffer so the type is Float32Array<ArrayBuffer>,
  // which is what WaveShaperNode.curve expects across TS lib versions.
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1; // -1..1
    // Classic arctangent-style soft clip.
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/** A WaveShaper configured as a drive stage. amount 0 => effectively bypass. */
export function createSaturation(
  ctx: BaseAudioContext,
  amount: number,
): WaveShaperNode {
  const shaper = ctx.createWaveShaper();
  shaper.curve = makeSaturationCurve(Math.max(0.001, amount));
  shaper.oversample = "2x";
  return shaper;
}

/**
 * A master "limiter" built from a DynamicsCompressor with a hard, fast setting.
 * Not a true brickwall limiter, but it keeps the mix from clipping audibly.
 */
export function createMasterLimiter(ctx: BaseAudioContext): DynamicsCompressorNode {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -3; // dB
  comp.knee.value = 0;
  comp.ratio.value = 20; // strong limiting
  comp.attack.value = 0.002;
  comp.release.value = 0.1;
  return comp;
}

/** A simple feedback delay send. Returns the input node to feed it. */
export interface DelaySend {
  input: GainNode;
  output: GainNode;
}

export function createDelaySend(
  ctx: BaseAudioContext,
  timeSeconds: number,
  feedback: number,
  wet: number,
): DelaySend {
  const input = ctx.createGain();
  const delay = ctx.createDelay(2.0);
  delay.delayTime.value = timeSeconds;
  const fb = ctx.createGain();
  fb.gain.value = feedback;
  const wetGain = ctx.createGain();
  wetGain.gain.value = wet;
  const output = ctx.createGain();

  // input -> delay -> wet -> output, with delay -> fb -> delay feedback loop.
  input.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wetGain);
  wetGain.connect(output);

  return { input, output };
}

/**
 * Apply a sidechain "pump" envelope to a gain node, synced to a kick hit.
 * Ducks down fast at `time`, then recovers over `recover` seconds — the classic
 * techno breathing effect. `depth` 0..1 is how far the level is pulled down.
 */
export function applyPumpEnvelope(
  param: AudioParam,
  time: number,
  recover: number,
  depth: number,
): void {
  const floor = Math.max(0, 1 - depth);
  // Cancel anything queued so overlapping kicks don't stack weirdly.
  param.cancelScheduledValues(time);
  param.setValueAtTime(floor, time);
  // Exponential recovery feels more natural than linear.
  param.exponentialRampToValueAtTime(
    Math.max(0.0001, floor),
    time + 0.001,
  );
  param.setTargetAtTime(1, time + 0.01, recover / 3);
}
