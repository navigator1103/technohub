// ============================================================================
// AudioEngine.ts — owns the live AudioContext and the whole node graph.
//
// Graph:
//
//   drum voices ─┐
//                ├─ per-track: drive ─> gain ─> pan ─┐
//   (8 tracks)  ─┘                                   ├─> masterGain ─> limiter ─> destination
//                                                     │        ▲
//   BassSynth ─> sidechain (pump) gain ───────────────┘        │
//                                                  delay send ──┘
//
// The engine knows nothing about timing — the Sequencer drives it. The engine
// only synthesises sound and applies per-track mixing + the sidechain pump.
// ============================================================================

import {
  createMasterLimiter,
  createSaturation,
  createDelaySend,
  applyPumpEnvelope,
  type DelaySend,
} from "./Effects";
import { triggerDrumVoice, type DrumTriggerParams } from "./DrumVoice";
import { BassSynth } from "./BassSynth";
import type { DrumTrack } from "../sequencing/patternTypes";

interface TrackNodes {
  drive: WaveShaperNode;
  gain: GainNode;
  pan: StereoPannerNode;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private delay!: DelaySend;
  private bassBus!: GainNode; // the node the sidechain pump ducks
  private bass!: BassSynth;

  private tracks = new Map<string, TrackNodes>();

  // Sidechain settings.
  sidechainEnabled = true;
  pumpDepth = 0.7; // 0..1 how hard the bass ducks on each kick
  private pumpRecover = 0.18; // seconds

  /**
   * Create the AudioContext and master chain. MUST be called from a user
   * gesture (click/keypress) — browsers block audio otherwise.
   */
  init(): void {
    if (this.ctx) return;
    // Fall back to the webkit-prefixed constructor for older iOS Safari.
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    // iOS 16.4+: route audio to the "playback" session so it is NOT muted by
    // the hardware silent/ring switch. Harmless / ignored elsewhere.
    const audioSession = (navigator as unknown as {
      audioSession?: { type: string };
    }).audioSession;
    if (audioSession) {
      try {
        audioSession.type = "playback";
      } catch {
        /* not supported — ignore */
      }
    }

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.85;

    this.limiter = createMasterLimiter(ctx);
    this.masterGain.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    // A gentle delay send, mostly for perc/claps. Time is set per-BPM later.
    this.delay = createDelaySend(ctx, 0.28, 0.32, 0.18);
    this.delay.output.connect(this.masterGain);

    // Bass bus is the duckable node for sidechain.
    this.bassBus = ctx.createGain();
    this.bassBus.gain.value = 1;
    this.bassBus.connect(this.masterGain);

    this.bass = new BassSynth(ctx, "sawtooth");
    this.bass.output.connect(this.bassBus);
    this.bass.start(ctx.currentTime);
  }

  /**
   * Unlock audio on mobile. MUST run synchronously inside the user-gesture
   * handler (tap/click). Plays a 1-sample silent buffer — the canonical iOS /
   * Android Web Audio unlock — and kicks off resume(). Without this, mobile
   * browsers keep the context muted even after resume().
   */
  unlock(): void {
    if (!this.ctx) return;
    const buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx.destination);
    src.start(0);
    // Fire-and-forget resume so we stay inside the gesture tick.
    if (this.ctx.state !== "running") void this.ctx.resume();
  }

  /** Resume a suspended context (also user-gesture territory). */
  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state !== "running") {
      await this.ctx.resume();
    }
  }

  get currentTime(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  get sampleRate(): number {
    return this.ctx ? this.ctx.sampleRate : 44100;
  }

  // --------------------------------------------------------------------------
  // Track graph management
  // --------------------------------------------------------------------------

  private ensureTrack(track: DrumTrack): TrackNodes {
    const ctx = this.ctx!;
    let nodes = this.tracks.get(track.id);
    if (!nodes) {
      const drive = createSaturation(ctx, Math.max(0.001, track.drive));
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner();
      drive.connect(gain);
      gain.connect(pan);
      pan.connect(this.masterGain);
      // Perc-ish voices also feed the delay send a little.
      if (track.sampleType === "perc" || track.sampleType === "clap") {
        pan.connect(this.delay.input);
      }
      nodes = { drive, gain, pan };
      this.tracks.set(track.id, nodes);
    }
    return nodes;
  }

  /**
   * Sync ALL track node settings from the current pattern. Call whenever track
   * settings change. Handles solo: if any track is soloed, the rest are muted.
   */
  setTracks(tracks: DrumTrack[]): void {
    if (!this.ctx) return;
    const anySolo = tracks.some((t) => t.solo);
    tracks.forEach((t) => {
      const nodes = this.ensureTrack(t);
      const audible = t.solo || (!anySolo && !t.muted);
      nodes.gain.gain.setTargetAtTime(
        audible ? t.volume : 0,
        this.ctx!.currentTime,
        0.01,
      );
      nodes.pan.pan.setTargetAtTime(t.pan, this.ctx!.currentTime, 0.01);
      nodes.drive.curve = createSaturation(this.ctx!, Math.max(0.001, t.drive)).curve;
    });
  }

  /** Convenience used by the React layer for live tweaks. */
  updateTrackSettings(tracks: DrumTrack[]): void {
    this.setTracks(tracks);
  }

  // --------------------------------------------------------------------------
  // Triggers (called by the Sequencer)
  // --------------------------------------------------------------------------

  /**
   * Trigger a drum hit. `velocity`/`accent` come from the step. The kick also
   * fires the sidechain pump.
   */
  triggerDrum(
    track: DrumTrack,
    time: number,
    velocity: number,
    accent: boolean,
  ): void {
    if (!this.ctx) return;
    const nodes = this.ensureTrack(track);
    const params: DrumTriggerParams = {
      pitch: track.pitch,
      decay: track.decay,
      drive: track.drive,
      velocity,
      accent,
    };
    // Voices feed the track's drive node (the head of the per-track chain).
    triggerDrumVoice(this.ctx, nodes.drive, track.sampleType, time, params);

    // The kick drives the sidechain pump.
    if (track.sampleType === "kick") this.pump(time);
  }

  triggerBass(
    frequency: number,
    time: number,
    duration: number,
    velocity: number,
    slide: boolean,
    accent: boolean,
  ): void {
    if (!this.ctx) return;
    this.bass.trigger({ frequency, time, duration, velocity, slide, accent });
  }

  /** Duck the bass bus, synced to a kick at `time`. */
  pump(time: number): void {
    if (!this.ctx || !this.sidechainEnabled) return;
    applyPumpEnvelope(this.bassBus.gain, time, this.pumpRecover, this.pumpDepth);
  }

  /** Adjust the sidechain recovery based on tempo so the pump stays musical. */
  setStepDuration(stepSeconds: number): void {
    this.pumpRecover = Math.max(0.08, stepSeconds * 1.6);
  }

  // --------------------------------------------------------------------------
  // Master
  // --------------------------------------------------------------------------

  setMasterVolume(v: number): void {
    if (this.ctx) this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }
}
