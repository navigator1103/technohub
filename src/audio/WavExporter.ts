// ============================================================================
// WavExporter.ts — render the current pattern offline and download a WAV.
//
// We rebuild the same node graph as AudioEngine inside an OfflineAudioContext
// and reuse the EXACT same synthesis functions (triggerDrumVoice / BassSynth),
// so the export sounds like what you hear live. Probability is treated as
// "always fire" for a deterministic, repeatable bounce (documented limitation).
// ============================================================================

import {
  createMasterLimiter,
  createSaturation,
  applyPumpEnvelope,
} from "./Effects";
import { triggerDrumVoice, type DrumTriggerParams } from "./DrumVoice";
import { BassSynth } from "./BassSynth";
import type { Pattern, DrumTrack } from "../sequencing/patternTypes";

export interface ExportOptions {
  bars?: number; // default 4
  sampleRate?: number; // default 44100
}

/** Render `bars` bars of `pattern` to an AudioBuffer. */
export async function renderPatternToBuffer(
  pattern: Pattern,
  bpm: number,
  swing: number,
  opts: ExportOptions = {},
): Promise<AudioBuffer> {
  const bars = opts.bars ?? 4;
  const sampleRate = opts.sampleRate ?? 44100;
  const stepDur = 60 / bpm / 4;
  const totalSteps = pattern.steps * bars;
  const tail = 2.0; // let reverberant tails ring out
  const duration = totalSteps * stepDur + tail;

  const ctx = new OfflineAudioContext(
    2,
    Math.ceil(duration * sampleRate),
    sampleRate,
  );

  // ---- Master chain ----
  const master = ctx.createGain();
  master.gain.value = 0.85;
  const limiter = createMasterLimiter(ctx);
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // ---- Bass + sidechain bus ----
  const bassBus = ctx.createGain();
  bassBus.gain.value = 1;
  bassBus.connect(master);
  const bass = new BassSynth(ctx, "sawtooth");
  bass.output.connect(bassBus);
  bass.start(0);
  const pumpRecover = Math.max(0.08, stepDur * 1.6);

  // ---- Per-track chains ----
  const anySolo = pattern.drumTracks.some((t) => t.solo);
  const trackNodes = new Map<string, WaveShaperNode>();
  for (const t of pattern.drumTracks) {
    const drive = createSaturation(ctx, Math.max(0.001, t.drive));
    const gain = ctx.createGain();
    const audible = t.solo || (!anySolo && !t.muted);
    gain.gain.value = audible ? t.volume : 0;
    const pan = ctx.createStereoPanner();
    pan.pan.value = t.pan;
    drive.connect(gain);
    gain.connect(pan);
    pan.connect(master);
    trackNodes.set(t.id, drive);
  }

  const triggerDrum = (track: DrumTrack, time: number, vel: number, accent: boolean) => {
    const dest = trackNodes.get(track.id)!;
    const params: DrumTriggerParams = {
      pitch: track.pitch,
      decay: track.decay,
      drive: track.drive,
      velocity: vel,
      accent,
    };
    triggerDrumVoice(ctx, dest, track.sampleType, time, params);
    if (track.sampleType === "kick") {
      applyPumpEnvelope(bassBus.gain, time, pumpRecover, 0.7);
    }
  };

  // ---- Schedule every step across all bars ----
  for (let i = 0; i < totalSteps; i++) {
    const step = i % pattern.steps;
    const gridTime = i * stepDur;
    const swungTime = step % 2 === 1 ? gridTime + swing * stepDur * 0.66 : gridTime;

    for (const track of pattern.drumTracks) {
      const audible = track.solo || (!anySolo && !track.muted);
      if (!audible) continue;
      const s = track.steps[step];
      if (!s || !s.active) continue;
      const velocity = s.velocity * (s.accent ? 1 : 0.85);
      const ratchet = Math.max(1, Math.floor(s.ratchet));
      if (ratchet === 1) {
        triggerDrum(track, swungTime, velocity, s.accent);
      } else {
        const sub = stepDur / ratchet;
        for (let r = 0; r < ratchet; r++) {
          triggerDrum(track, swungTime + r * sub, velocity, s.accent);
        }
      }
    }

    const b = pattern.bassline[step];
    if (b && b.active) {
      const midi = 12 * (b.octave + 1) + b.note;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const dur = stepDur * (b.slide ? 1.8 : 0.95);
      const velocity = b.velocity * (b.accent ? 1 : 0.85);
      bass.trigger({ frequency: freq, time: swungTime, duration: dur, velocity, slide: b.slide, accent: b.accent });
    }
  }

  return ctx.startRendering();
}

// ----------------------------------------------------------------------------
// AudioBuffer -> 16-bit PCM WAV
// ----------------------------------------------------------------------------

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const bufferSize = 44 + dataSize;

  const arr = new ArrayBuffer(bufferSize);
  const view = new DataView(arr);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  // RIFF header
  writeString(0, "RIFF");
  view.setUint32(4, bufferSize - 8, true);
  writeString(8, "WAVE");
  // fmt chunk
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true); // bits per sample
  // data chunk
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave channels and convert float -> 16-bit PCM.
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channels[c][i];
      sample = Math.max(-1, Math.min(1, sample)); // clamp
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: "audio/wav" });
}

/** Render + download as technoforge-loop.wav. */
export async function exportPatternToWav(
  pattern: Pattern,
  bpm: number,
  swing: number,
  opts: ExportOptions = {},
): Promise<void> {
  const buffer = await renderPatternToBuffer(pattern, bpm, swing, opts);
  const blob = audioBufferToWav(buffer);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "technoforge-loop.wav";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
