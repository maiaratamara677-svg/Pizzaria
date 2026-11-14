import type { PaymentSoundType } from '../types.ts';

export const PAYMENT_SOUND_OPTIONS: {
  id: PaymentSoundType;
  label: string;
  description: string;
}[] = [
  {
    id: 'cozinha',
    label: 'Campainha de Cozinha',
    description: 'Toque duplo metálico de balcão (Ding! Ding!)',
  },
  {
    id: 'hotel',
    label: 'Campainha de Hotel',
    description: 'Sino único de recepção com ressonância longa',
  },
  {
    id: 'caixa_eletronico',
    label: 'Caixa Eletrônico',
    description: 'Bipe eletrônico triplo de aprovação bancária/POS',
  },
  {
    id: 'dinheiro',
    label: 'Dinheiro (Caixa)',
    description: 'Gaveta registradora com tilintar de moedas (Cha-ching!)',
  },
];

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function unlockKitchenBellAudio(): void {
  getAudioContext();
}

function playMetallicStrike(
  ctx: AudioContext,
  startTime: number,
  partials: { freq: number; gain: number; decay: number }[],
  gainScale = 1.0
) {
  for (const partial of partials) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(partial.freq, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, partial.gain * gainScale),
      startTime + 0.006
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + partial.decay);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + partial.decay + 0.06);
  }
}

function playPlungerOrLatchClick(
  ctx: AudioContext,
  startTime: number,
  centerFreq: number,
  duration: number,
  volume: number
) {
  const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) {
    const env = Math.exp((-i / sampleCount) * 4.5);
    channel[i] = (Math.random() * 2 - 1) * env;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(centerFreq, startTime);
  filter.Q.setValueAtTime(1.8, startTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(startTime);
  noise.stop(startTime + duration + 0.02);
}

/**
 * 1. Campainha de Cozinha: Double metallic service bell ("Ding! Ding!")
 */
function synthesizeKitchenBell(ctx: AudioContext, now: number) {
  const partials = [
    { freq: 1567.98, gain: 0.32, decay: 1.15 }, // G6 fundamental
    { freq: 3135.96, gain: 0.16, decay: 0.75 },
    { freq: 4220.0, gain: 0.09, decay: 0.45 },
    { freq: 5890.0, gain: 0.05, decay: 0.25 },
  ];
  playMetallicStrike(ctx, now, partials, 1.0);
  playMetallicStrike(ctx, now + 0.22, partials, 0.85);
}

/**
 * 2. Campainha de Hotel: Plunger click + single bright brass reception desk bell ("Diiiiing!")
 */
function synthesizeHotelBell(ctx: AudioContext, now: number) {
  // Subtle mechanical plunger tap
  playPlungerOrLatchClick(ctx, now, 2600, 0.025, 0.14);

  // Single long resonant brass bell strike (B6 + shimmer)
  const partials = [
    { freq: 1975.53, gain: 0.34, decay: 1.75 }, // B6
    { freq: 3951.07, gain: 0.17, decay: 1.1 },
    { freq: 5310.0, gain: 0.09, decay: 0.65 },
    { freq: 7120.0, gain: 0.05, decay: 0.32 },
  ];
  playMetallicStrike(ctx, now + 0.014, partials, 1.0);
}

/**
 * 3. Caixa Eletrônico: Crisp 3-tone ATM / POS approval chime
 */
function synthesizeAtmBeep(ctx: AudioContext, now: number) {
  const tones = [
    { start: 0, freq: 1174.66, duration: 0.085, gain: 0.22 }, // D6
    { start: 0.105, freq: 1479.98, duration: 0.085, gain: 0.22 }, // F#6
    { start: 0.21, freq: 1760.0, duration: 0.24, gain: 0.26 }, // A6
  ];

  for (const tone of tones) {
    const t = now + tone.start;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(tone.freq, t);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4200, t);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(tone.gain, t + 0.008);
    gain.gain.setValueAtTime(tone.gain * 0.9, t + tone.duration * 0.65);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + tone.duration + 0.03);
  }
}

/**
 * 4. Dinheiro: Cash register drawer latch + cascading silver coin/bell "Cha-ching!"
 */
function synthesizeCashRegister(ctx: AudioContext, now: number) {
  // Mechanical drawer slide & latch snap
  playPlungerOrLatchClick(ctx, now, 1750, 0.07, 0.24);

  const thudOsc = ctx.createOscillator();
  const thudGain = ctx.createGain();
  thudOsc.type = 'triangle';
  thudOsc.frequency.setValueAtTime(190, now);
  thudOsc.frequency.exponentialRampToValueAtTime(75, now + 0.06);
  thudGain.gain.setValueAtTime(0.22, now);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
  thudOsc.connect(thudGain);
  thudGain.connect(ctx.destination);
  thudOsc.start(now);
  thudOsc.stop(now + 0.08);

  // First bright register chime ("Cha-")
  playMetallicStrike(
    ctx,
    now + 0.085,
    [
      { freq: 2093.0, gain: 0.22, decay: 0.45 }, // C7
      { freq: 4186.01, gain: 0.12, decay: 0.3 },
      { freq: 6279.0, gain: 0.06, decay: 0.18 },
    ],
    0.9
  );

  // Second sustained sparkling chime ("-ching!") + coin clink
  playMetallicStrike(
    ctx,
    now + 0.175,
    [
      { freq: 2637.02, gain: 0.3, decay: 1.25 }, // E7
      { freq: 3951.07, gain: 0.14, decay: 0.85 }, // B7
      { freq: 5274.04, gain: 0.1, decay: 0.55 }, // E8
      { freq: 7040.0, gain: 0.05, decay: 0.3 },
    ],
    1.0
  );
}

export function playPaymentSound(soundType: PaymentSoundType = 'cozinha'): boolean {
  const ctx = getAudioContext();
  if (!ctx) return false;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;

  switch (soundType) {
    case 'hotel':
      synthesizeHotelBell(ctx, now);
      break;
    case 'caixa_eletronico':
      synthesizeAtmBeep(ctx, now);
      break;
    case 'dinheiro':
      synthesizeCashRegister(ctx, now);
      break;
    case 'cozinha':
    default:
      synthesizeKitchenBell(ctx, now);
      break;
  }

  return true;
}

export function playKitchenBell(): boolean {
  return playPaymentSound('cozinha');
}
