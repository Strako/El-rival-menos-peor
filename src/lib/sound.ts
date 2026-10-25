let audioContext: AudioContext | null = null;

interface Tone {
  freq: number;
  at: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  return audioContext;
}

/** Debe llamarse tras el primer gesto del usuario (clic o teclado). */
export function unlockAudio(): void {
  const context = getContext();
  if (!context) return;
  if (context.state === 'suspended') {
    void context.resume();
  }
}

function playTones(tones: Tone[], masterGain = 0.16): void {
  const context = getContext();
  if (!context || context.state === 'suspended') return;

  const now = context.currentTime;

  for (const tone of tones) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + tone.at;

    oscillator.type = tone.type ?? 'sine';
    oscillator.frequency.setValueAtTime(tone.freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime((tone.gain ?? 1) * masterGain, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(start);
    oscillator.stop(start + tone.duration + 0.04);
  }
}

export function playTurnSound(): void {
  playTones([
    { freq: 659.25, at: 0, duration: 0.16, type: 'triangle', gain: 0.9 },
    { freq: 880, at: 0.12, duration: 0.22, type: 'triangle', gain: 0.8 },
  ]);
}

export function playCorrectSound(): void {
  playTones([
    { freq: 523.25, at: 0, duration: 0.18, type: 'triangle' },
    { freq: 659.25, at: 0.1, duration: 0.18, type: 'triangle' },
    { freq: 783.99, at: 0.2, duration: 0.2, type: 'triangle' },
    { freq: 1046.5, at: 0.32, duration: 0.34, type: 'triangle', gain: 0.85 },
  ]);
}

export function playWrongSound(): void {
  playTones([
    { freq: 220, at: 0, duration: 0.28, type: 'sawtooth', gain: 0.5 },
    { freq: 164.81, at: 0.2, duration: 0.38, type: 'sawtooth', gain: 0.42 },
  ]);
}

export function playTimeoutSound(): void {
  playTones([
    { freq: 440, at: 0, duration: 0.18, type: 'sine', gain: 0.7 },
    { freq: 329.63, at: 0.15, duration: 0.28, type: 'sine', gain: 0.6 },
  ]);
}
