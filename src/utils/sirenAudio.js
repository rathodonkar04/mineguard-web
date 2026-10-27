/**
 * Industrial SCADA Web Audio Siren Utility
 * Smart India Hackathon 2026 (Problem Statement 26025)
 *
 * Implements a dual-tone industrial siren using the native Web Audio API:
 * - Oscillators alternating between 780 Hz and 960 Hz square/sawtooth tones
 * - Bounded safe gain (0.15 max) to protect operator hearing
 * - Automatic resume on user gesture when AudioContext is suspended
 * - Global mute toggle with localStorage persistence
 * - Zero external MP3/WAV network dependencies for offline air-gapped mine servers
 */

const STORAGE_KEY_MUTED = 'mineguard_siren_muted';

class SirenAudioManager {
  constructor() {
    this.audioCtx = null;
    this.oscillator = null;
    this.gainNode = null;
    this.intervalId = null;
    this.currentToneHigh = false;
    this.playing = false;
    this.muted = this.loadMutedState();
    this.listeners = new Set();
  }

  loadMutedState() {
    try {
      return localStorage.getItem(STORAGE_KEY_MUTED) === 'true';
    } catch (_e) {
      return false;
    }
  }

  saveMutedState(isMuted) {
    try {
      localStorage.setItem(STORAGE_KEY_MUTED, isMuted ? 'true' : 'false');
    } catch (_e) {}
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener({ playing: this.playing, muted: this.muted });
      } catch (_e) {}
    }
  }

  initContext() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  startSiren() {
    if (this.playing || this.muted) return;

    this.initContext();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;

      // Master gain node with smooth attack
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.setValueAtTime(0.001, now);
      this.gainNode.gain.exponentialRampToValueAtTime(0.12, now + 0.1);
      this.gainNode.connect(this.audioCtx.destination);

      // Voltage-controlled oscillator for siren tone
      this.oscillator = this.audioCtx.createOscillator();
      this.oscillator.type = 'sawtooth';
      this.oscillator.frequency.setValueAtTime(780, now);
      this.oscillator.connect(this.gainNode);
      this.oscillator.start(now);

      this.playing = true;
      this.currentToneHigh = false;

      // Alternating 780 Hz <-> 960 Hz tone cycle every 400ms
      this.intervalId = setInterval(() => {
        if (!this.oscillator || !this.audioCtx) return;
        this.currentToneHigh = !this.currentToneHigh;
        const targetFreq = this.currentToneHigh ? 960 : 780;
        const toneTime = this.audioCtx.currentTime;
        this.oscillator.frequency.setValueAtTime(targetFreq, toneTime);
      }, 400);

      this.notify();
    } catch (err) {
      console.warn('[MineGuard Audio] Could not start siren:', err.message);
    }
  }

  stopSiren() {
    if (!this.playing) return;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.oscillator && this.gainNode && this.audioCtx) {
      try {
        const now = this.audioCtx.currentTime;
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
        this.oscillator.stop(now + 0.16);
        setTimeout(() => {
          try {
            if (this.oscillator) {
              this.oscillator.disconnect();
              this.oscillator = null;
            }
            if (this.gainNode) {
              this.gainNode.disconnect();
              this.gainNode = null;
            }
          } catch (_e) {}
        }, 200);
      } catch (_e) {
        this.oscillator = null;
        this.gainNode = null;
      }
    }

    this.playing = false;
    this.notify();
  }

  toggleMute() {
    this.setMuted(!this.muted);
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this.saveMutedState(this.muted);
    if (this.muted && this.playing) {
      this.stopSiren();
    }
    this.notify();
  }

  isMuted() {
    return this.muted;
  }

  isPlaying() {
    return this.playing;
  }
}

export const sirenManager = new SirenAudioManager();
export default sirenManager;
