let context: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  try {
    if (!context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    }
    if (context.state === "suspended") {
      void context.resume();
    }
    return context;
  } catch {
    return null;
  }
}

/** Unlocks audio playback after the first user gesture. */
export function primeAudio(): void {
  ensureContext();
}

export function playFinish(kind: string): void {
  if (kind === "none") return;
  const ctx = ensureContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  if (kind === "beep") {
    tone(ctx, now, 880, 0.28, "square");
    tone(ctx, now + 0.16, 880, 0.28, "square");
    return;
  }

  // chime: a small major triad that fades out
  tone(ctx, now, 1046.5, 0.5, "sine");
  tone(ctx, now + 0.12, 1318.5, 0.5, "sine");
  tone(ctx, now + 0.24, 1568, 0.7, "sine");
}

function tone(
  ctx: AudioContext,
  start: number,
  frequency: number,
  duration: number,
  type: OscillatorType,
): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.22, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}
