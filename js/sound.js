// 15 synthesized sound packs (Web Audio, no audio files — works offline).
// Each pack has a "voice" (its instrument) plus move/capture/check sounds; the rest fall back to jingles in that voice.
let ctx = null, master = null, noiseBuf = null;
let enabled = true, packId = 'wood', volume = 0.8;

export function setSoundEnabled(v){ enabled = v; }
export function setSoundPack(id){ if (PACKS[id]) packId = id; }
export function setVolume(v){ volume = Math.max(0, Math.min(1, v)); if (master) master.gain.value = volume; }

export function unlockAudio(){
  try {
    if (!ctx){
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch(_){}
}

// ---------------- synth primitives ----------------
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function env(g, t, a, d, peak){
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function filt(spec){
  const f = ctx.createBiquadFilter();
  f.type = spec.type || 'lowpass'; f.frequency.value = spec.f || 1000; f.Q.value = spec.q || 0.8;
  return f;
}
function osc(t, o){
  const { type = 'sine', f = 440, f2 = null, dur = 0.2, gain = 0.2, a = 0.004, filter = null, detune = 0 } = o;
  const s = ctx.createOscillator(); s.type = type;
  s.frequency.setValueAtTime(f, t);
  if (f2) s.frequency.exponentialRampToValueAtTime(f2, t + Math.max(0.01, o.sweep || dur));
  s.detune.value = detune;
  const g = ctx.createGain(); env(g, t, a, dur, gain);
  if (filter){ const fl = filt(filter); s.connect(fl); fl.connect(g); } else s.connect(g);
  g.connect(master); s.start(t); s.stop(t + a + dur + 0.05);
}
function noise(t, o){
  const { dur = 0.05, gain = 0.3, filter = { type: 'bandpass', f: 2000, q: 1 }, a = 0.001, f2 = null } = o;
  if (!noiseBuf){
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const n = ctx.createBufferSource(); n.buffer = noiseBuf;
  const fl = filt(filter);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain(); env(g, t, a, dur, gain);
  n.connect(fl); fl.connect(g); g.connect(master);
  n.start(t, Math.random() * 0.5); n.stop(t + a + dur + 0.05);
}
function fm(t, o){
  const { f = 440, f2 = null, ratio = 2, index = 200, dur = 0.3, gain = 0.15, a = 0.005 } = o;
  const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  c.frequency.setValueAtTime(f, t); m.frequency.setValueAtTime(f * ratio, t);
  if (f2){ c.frequency.exponentialRampToValueAtTime(f2, t + dur); m.frequency.exponentialRampToValueAtTime(f2 * ratio, t + dur); }
  mg.gain.setValueAtTime(index, t); mg.gain.exponentialRampToValueAtTime(Math.max(1, index * 0.1), t + dur);
  m.connect(mg); mg.connect(c.frequency);
  env(g, t, a, dur, gain); c.connect(g); g.connect(master);
  c.start(t); m.start(t); c.stop(t + a + dur + 0.05); m.stop(t + a + dur + 0.05);
}
// additive "struck" tone: partials [[ratio, gain, decay]]
function struck(t, f, partials, vel = 1){
  for (const [r, g, d] of partials) osc(t, { f: f * r, dur: d, gain: g * vel, a: 0.002 });
}
function melody(t, notes, voice, step = 0.1, vel = 1){
  notes.forEach((n, i) => voice(t + i * step, mtof(n), vel));
}

// ---------------- the packs ----------------
const knock = (t, f = 420, g = 0.35, n = 0.6) => {
  osc(t, { f, f2: f * 0.55, dur: 0.09, gain: g });
  noise(t, { dur: 0.03, gain: g * n, filter: { type: 'bandpass', f: 1800, q: 0.8 } });
};

const PACKS = {
  wood: {
    name: 'Wood', desc: 'Classic wooden board',
    voice: (t, f, v) => osc(t, { f, dur: 0.32, gain: 0.12 * v }),
    move: t => knock(t, rnd(400, 440)),
    capture: t => { knock(t, 300, 0.45, 1); knock(t + 0.045, 520, 0.25); },
    check: t => { knock(t, 420); osc(t + 0.05, { type: 'triangle', f: 880, dur: 0.18, gain: 0.12 }); },
    castle: t => { knock(t, 420, 0.3); knock(t + 0.09, 380, 0.3); }
  },
  soft: {
    name: 'Soft', desc: 'Muted, gentle felt',
    voice: (t, f, v) => osc(t, { f, dur: 0.4, gain: 0.1 * v, filter: { type: 'lowpass', f: 1200 } }),
    move: t => { osc(t, { f: rnd(280, 310), f2: 170, dur: 0.12, gain: 0.28, filter: { type: 'lowpass', f: 700 } }); noise(t, { dur: 0.04, gain: 0.1, filter: { type: 'lowpass', f: 600 } }); },
    capture: t => { osc(t, { f: 220, f2: 110, dur: 0.18, gain: 0.38, filter: { type: 'lowpass', f: 600 } }); noise(t, { dur: 0.06, gain: 0.16, filter: { type: 'lowpass', f: 900 } }); },
    check: t => { osc(t, { f: 300, f2: 180, dur: 0.12, gain: 0.25, filter: { type: 'lowpass', f: 700 } }); osc(t + 0.06, { type: 'triangle', f: 660, dur: 0.3, gain: 0.08, a: 0.03 }); }
  },
  stone: {
    name: 'Marble', desc: 'Hard stone clicks',
    voice: (t, f, v) => struck(t, f, [[1, 0.1, 0.4], [2.76, 0.04, 0.15]], v),
    move: t => { noise(t, { dur: 0.025, gain: 0.4, filter: { type: 'highpass', f: 2400 } }); osc(t, { f: rnd(1350, 1450), f2: 1100, dur: 0.06, gain: 0.1 }); },
    capture: t => { noise(t, { dur: 0.05, gain: 0.55, filter: { type: 'bandpass', f: 1500, q: 1.2 } }); osc(t, { f: 900, f2: 600, dur: 0.1, gain: 0.2 }); noise(t + 0.04, { dur: 0.03, gain: 0.3, filter: { type: 'highpass', f: 3000 } }); },
    check: t => { noise(t, { dur: 0.025, gain: 0.4, filter: { type: 'highpass', f: 2400 } }); struck(t + 0.05, 1760, [[1, 0.1, 0.35], [2.4, 0.04, 0.2]]); }
  },
  glass: {
    name: 'Glass', desc: 'Crystal tinkles',
    voice: (t, f, v) => struck(t, f * 2, [[1, 0.09, 0.5], [2.01, 0.04, 0.3], [3.98, 0.02, 0.15]], v),
    move: t => struck(t, pick([1760, 1975, 2093, 2349]), [[1, 0.22, 0.28], [2.01, 0.08, 0.16]]),
    capture: t => { struck(t, 1568, [[1, 0.1, 0.3], [2.01, 0.04, 0.18]]); struck(t + 0.05, 2093, [[1, 0.08, 0.35], [2.01, 0.03, 0.18]]); noise(t, { dur: 0.04, gain: 0.08, filter: { type: 'highpass', f: 6000 } }); },
    check: t => { struck(t, 2637, [[1, 0.09, 0.5], [1.5, 0.05, 0.4]]); struck(t + 0.08, 3136, [[1, 0.07, 0.5]]); }
  },
  retro: {
    name: '8-Bit', desc: 'Classic console bleeps',
    voice: (t, f, v) => osc(t, { type: 'square', f, dur: 0.1, gain: 0.13 * v, a: 0.001 }),
    move: t => osc(t, { type: 'square', f: 440, f2: 660, sweep: 0.04, dur: 0.06, gain: 0.3, a: 0.001 }),
    capture: t => { osc(t, { type: 'square', f: 660, f2: 180, dur: 0.12, gain: 0.2, a: 0.001 }); noise(t, { dur: 0.06, gain: 0.2, filter: { type: 'highpass', f: 1500 } }); },
    check: t => { osc(t, { type: 'square', f: 880, dur: 0.07, gain: 0.15, a: 0.001 }); osc(t + 0.08, { type: 'square', f: 1175, dur: 0.09, gain: 0.15, a: 0.001 }); },
    promote: t => osc(t, { type: 'square', f: 400, f2: 1600, dur: 0.25, gain: 0.2, a: 0.001 })
  },
  arcade: {
    name: 'Arcade', desc: 'Lasers and zaps',
    voice: (t, f, v) => osc(t, { type: 'sawtooth', f, dur: 0.14, gain: 0.13 * v, filter: { type: 'lowpass', f: 2500 } }),
    move: t => osc(t, { type: 'sawtooth', f: 900, f2: 300, dur: 0.08, gain: 0.3, filter: { type: 'lowpass', f: 2200 } }),
    capture: t => { osc(t, { type: 'square', f: 1600, f2: 90, dur: 0.22, gain: 0.18 }); noise(t + 0.05, { dur: 0.15, gain: 0.25, filter: { type: 'lowpass', f: 1200 }, f2: 200 }); },
    check: t => [0, 0.12].forEach(d => { osc(t + d, { type: 'sawtooth', f: 620, dur: 0.06, gain: 0.13, filter: { type: 'lowpass', f: 2500 } }); osc(t + d + 0.06, { type: 'sawtooth', f: 830, dur: 0.06, gain: 0.13, filter: { type: 'lowpass', f: 2500 } }); })
  },
  piano: {
    name: 'Piano', desc: 'Every move plays a note',
    voice: (t, f, v) => struck(t, f, [[1, 0.13, 0.9], [2, 0.05, 0.5], [3, 0.025, 0.3], [4.02, 0.01, 0.2]], v),
    move: t => PACKS.piano.voice(t, mtof(pick([60, 62, 64, 65, 67, 69])), 1.3),
    capture: t => { PACKS.piano.voice(t, mtof(55), 0.9); PACKS.piano.voice(t, mtof(59), 0.7); PACKS.piano.voice(t, mtof(62), 0.7); },
    check: t => { PACKS.piano.voice(t, mtof(71), 0.9); PACKS.piano.voice(t + 0.02, mtof(77), 0.8); }
  },
  marimba: {
    name: 'Marimba', desc: 'Warm wooden mallets',
    voice: (t, f, v) => struck(t, f, [[1, 0.16, 0.35], [3.93, 0.05, 0.08], [10.2, 0.015, 0.03]], v),
    move: t => PACKS.marimba.voice(t, mtof(pick([57, 60, 62, 64, 67])), 1.6),
    capture: t => { PACKS.marimba.voice(t, mtof(52), 1); PACKS.marimba.voice(t + 0.07, mtof(59), 0.8); },
    check: t => [69, 72, 76].forEach((n, i) => PACKS.marimba.voice(t + i * 0.06, mtof(n), 0.8))
  },
  bubble: {
    name: 'Bubbles', desc: 'Playful pops',
    voice: (t, f, v) => osc(t, { f: f * 0.6, f2: f * 1.4, sweep: 0.06, dur: 0.1, gain: 0.14 * v }),
    move: t => osc(t, { f: rnd(280, 340), f2: 900, sweep: 0.05, dur: 0.07, gain: 0.22 }),
    capture: t => { osc(t, { f: 180, f2: 620, sweep: 0.06, dur: 0.09, gain: 0.26 }); osc(t + 0.07, { f: 260, f2: 1000, sweep: 0.05, dur: 0.07, gain: 0.2 }); },
    check: t => { osc(t, { f: 400, f2: 1200, sweep: 0.08, dur: 0.1, gain: 0.2 }); osc(t + 0.1, { f: 1200, f2: 500, sweep: 0.08, dur: 0.1, gain: 0.16 }); }
  },
  click: {
    name: 'Keyboard', desc: 'Crisp mechanical clicks',
    voice: (t, f, v) => osc(t, { type: 'triangle', f, dur: 0.12, gain: 0.07 * v }),
    move: t => { noise(t, { dur: 0.014, gain: 0.45, filter: { type: 'highpass', f: 3200 } }); noise(t + 0.008, { dur: 0.035, gain: 0.25, filter: { type: 'bandpass', f: 700, q: 1.4 } }); },
    capture: t => { [0, 0.035].forEach(d => { noise(t + d, { dur: 0.016, gain: 0.5, filter: { type: 'highpass', f: 3000 } }); noise(t + d + 0.008, { dur: 0.04, gain: 0.3, filter: { type: 'bandpass', f: 600, q: 1.4 } }); }); },
    check: t => { noise(t, { dur: 0.014, gain: 0.45, filter: { type: 'highpass', f: 3200 } }); osc(t + 0.04, { type: 'triangle', f: 1320, dur: 0.12, gain: 0.08 }); }
  },
  scifi: {
    name: 'Sci-Fi', desc: 'Futuristic FM tones',
    voice: (t, f, v) => fm(t, { f, ratio: 1.5, index: f * 0.8, dur: 0.25, gain: 0.15 * v }),
    move: t => fm(t, { f: rnd(560, 640), ratio: 1.5, index: 300, dur: 0.1, gain: 0.3 }),
    capture: t => fm(t, { f: 900, f2: 160, ratio: 2.01, index: 700, dur: 0.25, gain: 0.35 }),
    check: t => { fm(t, { f: 1046, ratio: 3, index: 400, dur: 0.08, gain: 0.16 }); fm(t + 0.1, { f: 1046, ratio: 3, index: 400, dur: 0.08, gain: 0.16 }); }
  },
  drums: {
    name: 'Drums', desc: 'Kick, snare, cymbal',
    voice: (t, f, v) => osc(t, { type: 'triangle', f, dur: 0.15, gain: 0.08 * v }),
    move: t => osc(t, { f: 150, f2: 48, sweep: 0.1, dur: 0.14, gain: 0.55, a: 0.002 }),
    capture: t => { noise(t, { dur: 0.13, gain: 0.35, filter: { type: 'highpass', f: 1500 } }); osc(t, { type: 'triangle', f: 210, f2: 150, dur: 0.06, gain: 0.25 }); },
    check: t => { osc(t, { f: 150, f2: 48, sweep: 0.1, dur: 0.14, gain: 0.5 }); noise(t, { dur: 0.45, gain: 0.16, filter: { type: 'highpass', f: 5000 } }); },
    tap: t => noise(t, { dur: 0.02, gain: 0.15, filter: { type: 'highpass', f: 7000 } })
  },
  chime: {
    name: 'Zen', desc: 'Calm bells and bowls',
    voice: (t, f, v) => struck(t, f * 2, [[1, 0.07, 1.2], [2.0, 0.025, 0.8], [2.99, 0.012, 0.5]], v),
    move: t => PACKS.chime.voice(t, mtof(pick([62, 64, 66, 69, 71])), 1.6),
    capture: t => { PACKS.chime.voice(t, mtof(57), 0.8); PACKS.chime.voice(t + 0.12, mtof(64), 0.6); },
    check: t => { osc(t, { f: 528, dur: 1.4, gain: 0.08, a: 0.02 }); osc(t, { f: 1056 * 1.003, dur: 1.1, gain: 0.04, a: 0.02 }); }
  },
  typewriter: {
    name: 'Typewriter', desc: 'Clack clack… ding!',
    voice: (t, f, v) => struck(t, f * 2, [[1, 0.08, 0.5], [2.4, 0.03, 0.3]], v),
    move: t => { noise(t, { dur: 0.02, gain: 0.8, filter: { type: 'bandpass', f: 2600, q: 1 } }); noise(t + 0.006, { dur: 0.05, gain: 0.45, filter: { type: 'lowpass', f: 400 } }); },
    capture: t => [0, 0.05].forEach(d => { noise(t + d, { dur: 0.022, gain: 0.5, filter: { type: 'bandpass', f: 2300, q: 1 } }); noise(t + d + 0.006, { dur: 0.05, gain: 0.3, filter: { type: 'lowpass', f: 450 } }); }),
    check: t => { noise(t, { dur: 0.02, gain: 0.45, filter: { type: 'bandpass', f: 2600, q: 1 } }); struck(t + 0.05, 2093, [[1, 0.1, 0.6], [2.4, 0.04, 0.3]]); },
    castle: t => { noise(t, { dur: 0.35, gain: 0.9, filter: { type: 'bandpass', f: 600, q: 2 }, f2: 2400 }); noise(t + 0.36, { dur: 0.02, gain: 0.5, filter: { type: 'bandpass', f: 2600, q: 1 } }); }
  },
  kalimba: {
    name: 'Kalimba', desc: 'Plucky thumb piano',
    voice: (t, f, v) => struck(t, f, [[1, 0.14, 0.55], [5.2, 0.035, 0.07]], v),
    move: t => PACKS.kalimba.voice(t, mtof(pick([72, 74, 76, 79, 81])), 1.7),
    capture: t => { PACKS.kalimba.voice(t, mtof(67), 0.9); PACKS.kalimba.voice(t + 0.06, mtof(74), 0.8); },
    check: t => [84, 81, 84].forEach((n, i) => PACKS.kalimba.voice(t + i * 0.07, mtof(n), 0.75))
  }
};

// fallbacks built from each pack's voice
const DEFAULTS = {
  castle: (p, t) => { p.move(t); p.move(t + 0.1); },
  promote: (p, t) => { p.move(t); p.voice(t + 0.06, mtof(76), 1); p.voice(t + 0.14, mtof(83), 1); },
  win: (p, t) => melody(t, [72, 76, 79, 84], p.voice, 0.09, 1),
  lose: (p, t) => melody(t, [67, 63, 60], p.voice, 0.14, 1),
  draw: (p, t) => melody(t, [69, 69], p.voice, 0.16, 0.9),
  tap: (p, t) => { if (p.tap) p.tap(t); else noise(t, { dur: 0.015, gain: 0.08, filter: { type: 'bandpass', f: 2500, q: 1 } }); }
};

export const SOUND_PACKS = Object.entries(PACKS).map(([id, p]) => ({ id, name: p.name, desc: p.desc }));

export function play(kind, id){
  if (!enabled && !id) return;
  try {
    if (!ctx) unlockAudio();
    if (!ctx) return;
    const p = PACKS[id || packId] || PACKS.wood;
    const t = ctx.currentTime + 0.01;
    if (p[kind] && kind !== 'tap') p[kind](t);
    else if (DEFAULTS[kind]) DEFAULTS[kind](p, t);
  } catch(_){}
}

// short demo: move, capture, check
export function previewPack(id){
  unlockAudio();
  if (!ctx) return;
  const p = PACKS[id] || PACKS.wood;
  const t = ctx.currentTime + 0.03;
  try { p.move(t); p.capture(t + 0.38); p.check(t + 0.8); } catch(_){}
}
