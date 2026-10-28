// Sound engine v3.
// Synthesized packs are rendered once into audio buffers with physical modelling
// (modal resonances, contact noise, mallets, bubbles, bells), several random variations
// per sound, then played through a per-pack room reverb.
// Four packs use real recordings (sounds/*, by Enigmahack, AGPLv3+ — see sounds/CREDITS.md).
let ctx = null, master = null;
let enabled = true, packId = 'wood', volume = 0.8;
let SR = 48000;
const verbs = {};      // packId -> ConvolverNode
const bufs = {};       // packId -> { kind: AudioBuffer[] }
const loading = {};    // packId -> Promise

export function setSoundEnabled(v){ enabled = !!v; }
export function setSoundPack(id){ if (PACKS[id]){ packId = id; if (ctx) prepare(id); } }
export function setVolume(v){ volume = Math.max(0, Math.min(1, +v || 0)); if (master) master.gain.value = volume; }

export function unlockAudio(){
  try {
    if (!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch(_){ ctx = new AC(); }
      SR = ctx.sampleRate;
      master = ctx.createGain(); master.gain.value = volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -9; comp.knee.value = 8; comp.ratio.value = 3;
      comp.attack.value = 0.002; comp.release.value = 0.15;
      master.connect(comp); comp.connect(ctx.destination);
      prepare(packId);
    }
    if (ctx.state !== 'running') ctx.resume();
  } catch(_){}
}

// ======================================================================
// DSP toolkit (sample domain)
// ======================================================================
const TAU = Math.PI * 2;
const rr = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const mk = sec => new Float32Array(Math.max(1, Math.ceil(sec * SR)));

// Exponentially decaying sinusoid (one resonant mode). dec = time constant (s).
// o.att = attack (s), o.glide = [startRatio, endRatio, tau], o.ph = phase
function mode(b, t0, f, amp, dec, o){
  if (!(f > 0) || f >= SR * 0.46 || !amp) return;
  const i0 = Math.max(0, Math.round(t0 * SR));
  const n = Math.min(b.length - i0, Math.ceil(dec * 7 * SR));
  if (n <= 0) return;
  const att = Math.max(1, Math.round(((o && o.att) || 0.0005) * SR));
  const dm = Math.exp(-1 / (dec * SR));
  const w = TAU * f / SR;
  const gl = o && o.glide;
  let gk = 1, gdm = gl ? Math.exp(-1 / (gl[2] * SR)) : 1;
  let e = amp, ph = (o && o.ph != null) ? o.ph : Math.random() * TAU;
  if (!gl){
    // constant pitch: rotate a phasor instead of calling sin() every sample (much faster)
    const cw = Math.cos(w) * dm, sw = Math.sin(w) * dm;
    let re = Math.cos(ph) * amp, im = Math.sin(ph) * amp;
    for (let i = 0; i < n; i++){
      const a = i < att ? 0.5 - 0.5 * Math.cos(Math.PI * i / att) : 1;
      b[i0 + i] += a * im;
      const r2 = re * cw - im * sw; im = re * sw + im * cw; re = r2;
    }
    return;
  }
  for (let i = 0; i < n; i++){
    ph += w * (gl[1] + (gl[0] - gl[1]) * gk); gk *= gdm;
    const a = i < att ? 0.5 - 0.5 * Math.cos(Math.PI * i / att) : 1;
    b[i0 + i] += e * a * Math.sin(ph);
    e *= dm;
  }
}
// a set of modes: [[ratio, amp, dec], ...] relative to f
function modes(b, t0, f, list, vel = 1, o){
  for (const m of list) mode(b, t0, f * m[0] * (m[3] ? rr(1 - m[3], 1 + m[3]) : 1), m[1] * vel, m[2], o);
}

// RBJ biquad, returns a new array
function biquad(x, type, f, q = 0.707, gainDb = 0){
  f = Math.min(f, SR * 0.45);
  const w = TAU * f / SR, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp'){ b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'hp'){ b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'bp'){ b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else { const A = Math.pow(10, gainDb / 40); b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++){
    const xi = x[i], yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = yi; y[i] = yi;
  }
  return y;
}
function addInto(b, t0, y, amp){
  const i0 = Math.max(0, Math.round(t0 * SR));
  const n = Math.min(y.length, b.length - i0);
  for (let i = 0; i < n; i++) b[i0 + i] += y[i] * amp;
}
function peakOf(y){ let p = 0; for (let i = 0; i < y.length; i++){ const a = Math.abs(y[i]); if (a > p) p = a; } return p; }
// filtered noise burst, normalised to peak = amp
function burst(b, t0, dur, amp, filters, shape = 'exp'){
  const n = Math.ceil(dur * SR) + 1, ring = Math.ceil(0.025 * SR);
  let x = new Float32Array(n + ring);
  for (let i = 0; i < n; i++){
    const t = i / n;
    const env = shape === 'hann' ? Math.pow(Math.sin(Math.PI * t), 2) : shape === 'flat' ? 1 : shape === 'rise' ? t * Math.exp(-3 * t) * 2.7 : Math.exp(-5 * t);
    x[i] = (Math.random() * 2 - 1) * env;
  }
  if (filters) for (const f of filters) x = biquad(x, f[0], f[1], f[2], f[3]);
  const p = peakOf(x) || 1;
  addInto(b, t0, x, amp / p);
}
// noise through a band-pass whose centre sweeps from f0 to f1
function sweep(b, t0, dur, amp, f0, f1, q = 2){
  const n = Math.ceil(dur * SR);
  const y = new Float32Array(n);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, c = null;
  for (let i = 0; i < n; i++){
    if (i % 32 === 0){
      const t = i / n, f = f0 * Math.pow(f1 / f0, t);
      const w = TAU * f / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
      c = [al / a0, -al / a0, -2 * cs / a0, (1 - al) / a0];
    }
    const t = i / n, env = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7;
    const xi = (Math.random() * 2 - 1) * env;
    const yi = c[0] * xi + c[1] * x2 - c[2] * y1 - c[3] * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = yi; y[i] = yi;
  }
  addInto(b, t0, y, amp / (peakOf(y) || 1));
}
// metallic noise (6 detuned square waves, TR-808 style) for hats/cymbals
function metal(b, t0, dec, amp, hp = 7000){
  const n = Math.ceil(dec * 7 * SR);
  let x = new Float32Array(n);
  const fs = [205.3, 304.4, 369.6, 522.7, 540, 800].map(f => f * rr(0.98, 1.02));
  const ph = fs.map(() => Math.random());
  const dm = Math.exp(-1 / (dec * SR));
  let e = 1;
  for (let i = 0; i < n; i++){
    let s = 0;
    for (let k = 0; k < 6; k++){ ph[k] += fs[k] / SR; s += (ph[k] % 1) < 0.5 ? 1 : -1; }
    x[i] = s * e * (0.6 + 0.4 * Math.random()); e *= dm;
  }
  x = biquad(biquad(x, 'hp', hp, 0.7), 'hp', hp, 0.7);
  addInto(b, t0, x, amp / (peakOf(x) || 1));
}
// Bubble (Minnaert resonance): sine with rising pitch and fast decay
function bubble(b, t0, f, amp, dec, rise = 1.6){
  mode(b, t0, f, amp, dec, { att: 0.0015, glide: [1, rise, dec * 1.6] });
}

// final touch: remove DC, normalise, optional warmth, trim silence
function finish(b, peak, drive = 0){
  let y = biquad(b, 'hp', 28, 0.7);
  if (drive > 0){ const k = 1 + drive * 3, nk = Math.tanh(k); for (let i = 0; i < y.length; i++) y[i] = Math.tanh(y[i] * k) / nk; }
  const p = peakOf(y) || 1, g = peak / p;
  let last = y.length - 1;
  const thr = p * 0.0008;
  while (last > 0 && Math.abs(y[last]) < thr) last--;
  const n = Math.min(y.length, last + Math.ceil(0.004 * SR));
  const out = new Float32Array(n);
  // if the tail got cut by the buffer length, fade it out gently instead of clicking
  const fade = n >= y.length - 2 ? Math.min(n >> 2, Math.ceil(0.25 * SR)) : Math.ceil(0.004 * SR);
  for (let i = 0; i < n; i++){ const f = i > n - fade ? (n - i) / fade : 1; out[i] = y[i] * g * f * f; }
  return out;
}

// ======================================================================
// Physical instruments
// ======================================================================
// Wooden piece placed on a wooden board: contact click + piece body + board plate + table thump.
function woodHit(b, t0, o = {}){
  const v = o.vel || 1, k = o.k || 1, hard = o.hard == null ? 1 : o.hard;
  burst(b, t0, 0.0022, 0.5 * v * hard, [['bp', 2700 * rr(0.88, 1.12), 0.9], ['hp', 700]]);
  modes(b, t0, 1, [[1720, 0.4 * hard, 0.012, 0.06], [2680, 0.2 * hard, 0.008, 0.06], [3950, 0.1 * hard, 0.005, 0.06]], v, { att: 0.0004 });
  modes(b, t0, k, [[182, 0.28, 0.03, 0.04], [297, 0.34, 0.032, 0.04], [447, 0.36, 0.028, 0.04], [658, 0.34, 0.022, 0.04], [912, 0.3, 0.016, 0.04], [1236, 0.3, 0.012, 0.04]], v, { att: 0.0008 });
  mode(b, t0, 92 * rr(0.95, 1.05), 0.14 * v, 0.025, { att: 0.002 });
}
// two pieces colliding
function clack(b, t0, v = 1, bright = 1){
  burst(b, t0, 0.0014, 0.5 * v, [['hp', 1400 * bright]]);
  modes(b, t0, bright, [[2350, 0.26, 0.012, 0.05], [3480, 0.2, 0.008, 0.05], [5150, 0.1, 0.005, 0.05], [1450, 0.14, 0.016, 0.05]], v, { att: 0.0003 });
}
// wooden bar (marimba / woodblock family)
function bar(b, t0, f, v, o = {}){
  const len = o.len || 1;
  const d1 = Math.max(0.09, Math.min(1.3, 0.6 * Math.pow(262 / f, 0.65))) * len;
  burst(b, t0, 0.0035, 0.12 * v, [['lp', Math.min(5000, f * 6)]], 'hann');
  modes(b, t0, f, [[1, 1, d1], [3.93, 0.2, d1 * 0.22], [9.2, 0.05, d1 * 0.07], [2, 0.03, d1 * 0.3]], v * 0.6, { att: 0.0015 });
}
// singing bowl / bell with beating split modes
function bowl(b, t0, f, v, len = 1){
  const parts = [[1, 1, 2.0], [2.71, 0.48, 1.1], [5.15, 0.22, 0.55], [8.1, 0.09, 0.28], [11.6, 0.04, 0.15]];
  for (const [r, a, d] of parts){
    mode(b, t0, f * r, a * v * 0.32, d * len, { att: 0.002 });
    mode(b, t0, f * r * 1.0035, a * v * 0.26, d * len * 0.9, { att: 0.002 });
  }
  burst(b, t0, 0.004, 0.06 * v, [['lp', 1800]], 'hann');
}
// small bright bell (typewriter ding, notifications)
function bell(b, t0, f, v, len = 1){
  modes(b, t0, f, [[1, 1, 0.55 * len], [2.76, 0.35, 0.25 * len], [5.4, 0.16, 0.12 * len], [8.93, 0.06, 0.06 * len], [1.002, 0.6, 0.5 * len]], v * 0.4, { att: 0.0006 });
  burst(b, t0, 0.0012, 0.12 * v, [['hp', 4000]]);
}
// crystal glass
function glassTink(b, t0, f, v, len = 1){
  modes(b, t0, f, [[1, 1, 0.42 * len], [1.0018, 0.7, 0.38 * len], [2.32, 0.34, 0.2 * len], [4.25, 0.14, 0.09 * len], [6.63, 0.05, 0.05 * len]], v * 0.35, { att: 0.0004 });
  burst(b, t0, 0.0009, 0.1 * v, [['hp', 5500]]);
}
// marble / stone
function stoneHit(b, t0, o = {}){
  const v = o.vel || 1, k = o.k || 1;
  burst(b, t0, 0.0012, 0.6 * v, [['hp', 2200], ['peak', 5200, 1.2, 6]]);
  modes(b, t0, k, [[1650, 0.22, 0.022, 0.05], [2790, 0.3, 0.018, 0.05], [4310, 0.22, 0.012, 0.05], [6080, 0.12, 0.008, 0.05], [8150, 0.06, 0.005, 0.05]], v, { att: 0.0002 });
  mode(b, t0, 430 * k, 0.16 * v, 0.012, { att: 0.0006 });
}
// soft felt
function feltHit(b, t0, o = {}){
  const v = o.vel || 1, k = o.k || 1;
  burst(b, t0, 0.006, 0.34 * v, [['lp', 1500], ['lp', 1800]], 'hann');
  modes(b, t0, k, [[160, 0.42, 0.045, 0.04], [268, 0.42, 0.038, 0.04], [418, 0.38, 0.03, 0.04], [640, 0.27, 0.022, 0.04], [940, 0.13, 0.014, 0.04]], v, { att: 0.0025 });
}
// thumb piano tine
function tine(b, t0, f, v){
  const d1 = Math.max(0.25, Math.min(1.6, 1.05 * Math.pow(523 / f, 0.55)));
  modes(b, t0, f, [[1, 1, d1], [5.62, 0.16, d1 * 0.11], [2.01, 0.06, d1 * 0.4], [8.9, 0.04, d1 * 0.05]], v * 0.55, { att: 0.0008, glide: [1.006, 1, 0.02] });
  burst(b, t0, 0.0016, 0.14 * v, [['bp', 3600, 1.2]]);
  mode(b, t0, f * 0.5, 0.05 * v, d1 * 0.5, { att: 0.004 });   // body resonance
}
// mechanical keyboard switch
function keyHit(b, t0, v = 1, o = {}){
  burst(b, t0, 0.0009, 0.48 * v, [['hp', 3000]]);
  modes(b, t0, 1, [[3150, 0.2, 0.004, 0.05], [4720, 0.12, 0.003, 0.05]], v);
  const t1 = t0 + (o.travel || 0.016) * rr(0.9, 1.1);
  burst(b, t1, 0.0022, 0.38 * v, [['lp', 2400]]);
  modes(b, t1, o.k || 1, [[380, 0.36, 0.018, 0.04], [620, 0.26, 0.014, 0.04], [1150, 0.18, 0.009, 0.04], [2100, 0.1, 0.006, 0.04]], v, { att: 0.0006 });
}
// typewriter type-bar strike
function typeStrike(b, t0, v = 1){
  burst(b, t0, 0.0011, 0.7 * v, [['bp', 2600, 0.7]]);
  modes(b, t0, 1, [[2920, 0.3, 0.006, 0.05], [4380, 0.2, 0.004, 0.05], [1720, 0.26, 0.012, 0.05], [262, 0.34, 0.02, 0.05], [530, 0.2, 0.012, 0.05]], v, { att: 0.0003 });
  burst(b, t0 + 0.026, 0.0012, 0.16 * v, [['hp', 2500]]);   // key returns
}
// drums
function kick(b, t0, v = 1){
  mode(b, t0, 58, 0.95 * v, 0.17, { att: 0.0008, glide: [3.2, 1, 0.022], ph: 0 });
  mode(b, t0, 410, 0.22 * v, 0.018, { att: 0.0005 });
  mode(b, t0, 760, 0.12 * v, 0.01, { att: 0.0005 });
  burst(b, t0, 0.0016, 0.42 * v, [['bp', 2600, 0.8]]);
}
function snare(b, t0, v = 1){
  modes(b, t0, 1, [[186, 0.42, 0.07], [332, 0.26, 0.045]], v, { att: 0.0006 });
  burst(b, t0, 0.17, 0.55 * v, [['hp', 1300], ['peak', 5000, 1, 4]]);
}
function tom(b, t0, f, v = 1){
  mode(b, t0, f, 0.8 * v, 0.2, { att: 0.0008, glide: [1.35, 1, 0.03] });
  mode(b, t0, f * 1.59, 0.3 * v, 0.1, { att: 0.0008 });
  mode(b, t0, f * 2.14, 0.14 * v, 0.06, { att: 0.0008 });
  burst(b, t0, 0.002, 0.3 * v, [['bp', 2400, 0.8]]);
}

// ======================================================================
// Packs
// ======================================================================
// Every synthesized pack: move/capture/check (+ optional castle, promote, lowtime, illegal, tap)
// and a pitched `note(b, t0, midi, vel)` used for jingles (start, notify, win, lose, draw).
const C_PENT = [60, 62, 64, 67, 69, 72, 74, 76];

const PACKS = {
  wood: {
    name: 'Wood', desc: 'Classic wooden board', room: { t: 0.45, wet: 0.13, damp: 0.6 },
    note: (b, t, m, v) => bar(b, t, mtof(m), v, { len: 0.7 }),
    move: (b, t, i) => woodHit(b, t, { k: [1, 0.95, 1.05, 0.98][i % 4] }),
    capture: (b, t) => { clack(b, t, 0.9); woodHit(b, t + 0.034, { vel: 1.15, k: 0.97 }); },
    check: (b, t) => { woodHit(b, t); bar(b, t + 0.07, 1975, 0.8, { len: 0.35 }); bar(b, t + 0.07, 2960, 0.35, { len: 0.25 }); },
    castle: (b, t) => { woodHit(b, t, { k: 1.02 }); woodHit(b, t + 0.115, { k: 0.95, vel: 0.85 }); },
    lowtime: (b, t) => { bar(b, t, 2093, 0.6, { len: 0.25 }); bar(b, t + 0.28, 1760, 0.55, { len: 0.25 }); },
    illegal: (b, t) => { feltHit(b, t, { vel: 0.8, k: 1.1 }); }
  },
  soft: {
    name: 'Soft', desc: 'Muted, gentle felt', room: { t: 0.6, wet: 0.14, damp: 0.75 },
    note: (b, t, m, v) => { const f = mtof(m); modes(b, t, f, [[1, 1, 0.55], [2, 0.12, 0.2], [3, 0.03, 0.1]], v * 0.5, { att: 0.008 }); },
    move: (b, t, i) => feltHit(b, t, { k: [1, 0.94, 1.06, 1.02][i % 4] }),
    capture: (b, t) => { feltHit(b, t, { vel: 0.7, k: 1.25 }); feltHit(b, t + 0.045, { vel: 1.2, k: 0.9 }); },
    check: (b, t) => { feltHit(b, t); const f = mtof(76); modes(b, t + 0.07, f, [[1, 1, 0.35], [2, 0.15, 0.12]], 0.35, { att: 0.01 }); }
  },
  stone: {
    name: 'Marble', desc: 'Hard stone clicks', room: { t: 1.3, wet: 0.2, damp: 0.45 },
    note: (b, t, m, v) => { const f = mtof(m); modes(b, t, f, [[1, 1, 0.7], [2.76, 0.3, 0.28], [5.4, 0.1, 0.12]], v * 0.45, { att: 0.0005 }); burst(b, t, 0.001, 0.1 * v, [['hp', 4000]]); },
    move: (b, t, i) => stoneHit(b, t, { k: [1, 0.96, 1.04, 1.01][i % 4] }),
    capture: (b, t) => { stoneHit(b, t, { vel: 0.8, k: 1.12 }); stoneHit(b, t + 0.03, { vel: 1.1, k: 0.93 }); },
    check: (b, t) => { stoneHit(b, t); const f = mtof(88); modes(b, t + 0.06, f, [[1, 1, 0.5], [2.76, 0.3, 0.2]], 0.3); }
  },
  glass: {
    name: 'Glass', desc: 'Crystal tinkles', room: { t: 1.5, wet: 0.22, damp: 0.4 },
    note: (b, t, m, v) => glassTink(b, t, mtof(m + 12), v, 1.4),
    move: (b, t, i) => glassTink(b, t, [2093, 2349, 2637, 3136][i % 4], 1),
    capture: (b, t) => {
      glassTink(b, t, 1568, 0.9); glassTink(b, t + 0.045, 2349, 0.8);
      for (let k = 0; k < 7; k++) mode(b, t + 0.02 + Math.random() * 0.07, rr(4200, 9000), 0.05, rr(0.01, 0.04));
    },
    check: (b, t) => { glassTink(b, t, 2637, 0.9, 1.3); glassTink(b, t + 0.08, 3951, 0.7, 1.3); }
  },
  retro: { name: '8-Bit', desc: 'Retro console (recorded)', dir: 'nes', gain: 0.85 },
  arcade: { name: 'Arcade', desc: 'Game effects (recorded)', dir: 'sfx', gain: 0.9 },
  piano: { name: 'Piano', desc: 'Real piano (recorded)', dir: 'piano', gain: 1 },
  marimba: {
    name: 'Marimba', desc: 'Warm rosewood mallets', room: { t: 1.0, wet: 0.16, damp: 0.5 },
    note: (b, t, m, v) => bar(b, t, mtof(m), v),
    move: (b, t, i) => bar(b, t, mtof([67, 69, 72, 74][i % 4]), 1.1),
    capture: (b, t) => { bar(b, t, mtof(55), 1.05); bar(b, t + 0.075, mtof(62), 0.9); },
    check: (b, t) => [72, 76, 79].forEach((m, k) => bar(b, t + k * 0.065, mtof(m), 0.85)),
    castle: (b, t) => { bar(b, t, mtof(67), 1); bar(b, t + 0.1, mtof(60), 0.9); }
  },
  bubble: {
    name: 'Bubbles', desc: 'Playful water pops', room: { t: 0.5, wet: 0.12, damp: 0.5 },
    note: (b, t, m, v) => { const f = mtof(m); mode(b, t, f, 0.45 * v, 0.22, { att: 0.002, glide: [0.8, 1, 0.012] }); mode(b, t, f * 2, 0.08 * v, 0.08, { att: 0.002 }); },
    move: (b, t, i) => bubble(b, t, [560, 640, 720, 600][i % 4] * rr(0.97, 1.03), 0.8, 0.035, 1.9),
    capture: (b, t) => { bubble(b, t, 420, 0.8, 0.04, 2); bubble(b, t + 0.055, 820, 0.6, 0.03, 1.8); bubble(b, t + 0.085, 1150, 0.35, 0.02, 1.6); },
    check: (b, t) => { bubble(b, t, 700, 0.7, 0.035, 1.9); bubble(b, t + 0.09, 1050, 0.6, 0.04, 2.1); },
    tap: (b, t) => bubble(b, t, 1300, 0.4, 0.012, 1.5)
  },
  click: {
    name: 'Keyboard', desc: 'Thocky mechanical keys', room: { t: 0.3, wet: 0.07, damp: 0.6 },
    note: (b, t, m, v) => { const f = mtof(m); modes(b, t, f, [[1, 1, 0.18], [3, 0.18, 0.06], [5, 0.06, 0.03]], v * 0.45, { att: 0.001 }); },
    move: (b, t, i) => keyHit(b, t, 1, { k: [1, 0.95, 1.05, 1.02][i % 4] }),
    capture: (b, t) => { keyHit(b, t, 0.9, { k: 1.06 }); keyHit(b, t + 0.06, 1.05, { k: 0.95 }); },
    check: (b, t) => { keyHit(b, t); bell(b, t + 0.05, 1568, 0.5, 0.5); },
    castle: (b, t) => { keyHit(b, t, 1, { k: 0.85, travel: 0.02 }); keyHit(b, t + 0.1, 0.9, { k: 0.8, travel: 0.022 }); },
    tap: (b, t) => { burst(b, t, 0.0008, 0.3, [['hp', 3000]]); }
  },
  scifi: { name: 'Sci-Fi', desc: 'Futuristic (recorded)', dir: 'futuristic', gain: 0.85 },
  drums: {
    name: 'Drums', desc: 'Kick, snare, cymbals', room: { t: 0.6, wet: 0.12, damp: 0.55 },
    note: (b, t, m, v) => tom(b, t, mtof(m - 12), v),
    move: (b, t) => kick(b, t),
    capture: (b, t) => { snare(b, t); kick(b, t, 0.5); },
    check: (b, t) => { kick(b, t); metal(b, t, 0.28, 0.5, 5000); },
    castle: (b, t) => { tom(b, t, 220); tom(b, t + 0.1, 165); },
    promote: (b, t) => { tom(b, t, 196); tom(b, t + 0.08, 147); tom(b, t + 0.16, 110); kick(b, t + 0.26); metal(b, t + 0.26, 0.35, 0.6, 5000); },
    win: (b, t) => { for (let k = 0; k < 8; k++) snare(b, t + k * 0.055, 0.35 + k * 0.08); kick(b, t + 0.46); metal(b, t + 0.46, 0.45, 0.8, 4500); },
    lose: (b, t) => { tom(b, t, 220, 0.9); tom(b, t + 0.18, 175, 0.9); tom(b, t + 0.36, 131, 1); },
    draw: (b, t) => { kick(b, t, 0.8); kick(b, t + 0.22, 0.8); metal(b, t + 0.22, 0.08, 0.3); },
    tap: (b, t) => metal(b, t, 0.012, 0.35, 8000),
    lowtime: (b, t) => { metal(b, t, 0.02, 0.4, 8000); metal(b, t + 0.14, 0.02, 0.3, 8000); }
  },
  chime: {
    name: 'Zen', desc: 'Singing bowls and bells', room: { t: 2.6, wet: 0.3, damp: 0.35 }, tail: 1.5,
    note: (b, t, m, v) => bowl(b, t, mtof(m), v, 0.8),
    move: (b, t, i) => bowl(b, t, mtof([74, 76, 78, 81][i % 4]), 0.9, 0.55),
    capture: (b, t) => { bowl(b, t, mtof(69), 0.9, 0.6); bowl(b, t + 0.12, mtof(76), 0.7, 0.55); },
    check: (b, t) => bowl(b, t, mtof(62), 1, 1)
  },
  typewriter: {
    name: 'Typewriter', desc: 'Clack clack… ding!', room: { t: 0.45, wet: 0.1, damp: 0.6 },
    note: (b, t, m, v) => bell(b, t, mtof(m + 12), v, 0.9),
    move: (b, t) => typeStrike(b, t),
    capture: (b, t) => { typeStrike(b, t, 0.85); typeStrike(b, t + 0.055, 1); },
    check: (b, t) => { typeStrike(b, t); bell(b, t + 0.06, 2794, 0.75); },
    castle: (b, t) => {
      sweep(b, t, 0.34, 0.6, 500, 2600, 3);
      for (let k = 0; k < 11; k++) burst(b, t + 0.02 + k * 0.028, 0.0006, 0.14, [['hp', 3500]]);
      bell(b, t + 0.36, 2794, 0.8);
    }
  },
  kalimba: {
    name: 'Kalimba', desc: 'Plucky thumb piano', room: { t: 1.1, wet: 0.18, damp: 0.5 },
    note: (b, t, m, v) => tine(b, t, mtof(m + 12), v),
    move: (b, t, i) => tine(b, t, mtof([72, 74, 76, 79][i % 4]), 1),
    capture: (b, t) => { tine(b, t, mtof(67), 0.9); tine(b, t + 0.06, mtof(74), 0.85); },
    check: (b, t) => [84, 81, 84].forEach((m, k) => tine(b, t + k * 0.075, mtof(m), 0.8))
  },
  // internal: fallbacks used by recorded packs for sounds they don't have
  _gen: {
    name: '', room: null,
    note: (b, t, m, v) => bar(b, t, mtof(m), v, { len: 0.6 }),
    move: (b, t) => woodHit(b, t),
    capture: (b, t) => woodHit(b, t),
    check: (b, t) => woodHit(b, t)
  }
};
const REC_FILES = { move: 'Move', capture: 'Capture', check: 'Check', win: 'Victory', lose: 'Defeat', draw: 'Draw', notify: 'GenericNotify', lowtime: 'LowTime', start: 'NewChallenge' };

// jingles + fallbacks built from a pack's own instrument
const DEFAULTS = {
  castle: (P, b, t, i) => { P.move(b, t, i); P.move(b, t + 0.1, i + 1); },
  promote: (P, b, t, i) => { P.move(b, t, i); P.note(b, t + 0.08, 81, 0.7); P.note(b, t + 0.16, 88, 0.6); },
  start: (P, b, t) => { P.note(b, t, 67, 0.7); P.note(b, t + 0.11, 74, 0.75); },
  notify: (P, b, t) => { P.note(b, t, 79, 0.6); P.note(b, t + 0.09, 84, 0.6); },
  win: (P, b, t) => { [72, 76, 79].forEach((m, k) => P.note(b, t + k * 0.09, m, 0.75)); P.note(b, t + 0.3, 84, 0.85); P.note(b, t + 0.3, 76, 0.4); },
  lose: (P, b, t) => { [67, 63, 60].forEach((m, k) => P.note(b, t + k * 0.16, m, 0.75)); },
  draw: (P, b, t) => { P.note(b, t, 72, 0.65); P.note(b, t + 0.17, 67, 0.65); },
  lowtime: (P, b, t) => { P.note(b, t, 88, 0.5); P.note(b, t + 0.14, 88, 0.45); },
  illegal: (P, b, t) => { feltHit(b, t, { vel: 0.9, k: 0.9 }); feltHit(b, t + 0.075, { vel: 0.7, k: 0.8 }); },
  tap: (P, b, t) => { burst(b, t, 0.0012, 0.25, [['bp', 2600, 1]]); mode(b, t, 1900, 0.06, 0.004); }
};
const VARIANTS = { move: 4, capture: 3, check: 2, castle: 2, tap: 2 };
const LEN = { move: 0.5, capture: 0.6, check: 1.0, castle: 0.7, promote: 1.2, start: 1.4, notify: 1.2, win: 2.2, lose: 2.2, draw: 1.8, lowtime: 0.9, illegal: 0.5, tap: 0.15 };
const PEAK = { move: 0.8, capture: 0.92, check: 0.85, castle: 0.8, promote: 0.82, start: 0.55, notify: 0.5, win: 0.62, lose: 0.55, draw: 0.5, lowtime: 0.5, illegal: 0.55, tap: 0.28 };
const DRIVE = { move: 0.25, capture: 0.3, castle: 0.25 };
const JITTER = { move: 1, capture: 1, castle: 1, tap: 1 };
const WARM = ['move', 'capture', 'check', 'castle', 'start', 'illegal', 'promote', 'win', 'lose', 'draw', 'notify', 'lowtime', 'tap'];

export const SOUND_PACKS = Object.entries(PACKS).filter(([id]) => id[0] !== '_').map(([id, p]) => ({ id, name: p.name, desc: p.desc }));

// ======================================================================
// Rendering, loading, playback
// ======================================================================
function render(P, kind){
  const fn = P[kind], dflt = DEFAULTS[kind];
  if (!fn && !dflt) return [];
  const n = VARIANTS[kind] || 1, out = [];
  for (let i = 0; i < n; i++){
    const b = mk((LEN[kind] || 1) + (P.tail || 0));
    if (fn) fn(b, 0.003, i); else dflt(P, b, 0.003, i);
    const y = finish(b, PEAK[kind] || 0.7, DRIVE[kind] || 0);
    const ab = ctx.createBuffer(1, y.length, SR);
    ab.getChannelData(0).set(y);
    out.push(ab);
  }
  return out;
}
function buffersFor(id, kind){
  const P = PACKS[id];
  const store = bufs[id] || (bufs[id] = {});
  if (P.dir) return store[kind] || null;
  if (!store[kind]) store[kind] = render(P, kind);
  return store[kind];
}
const idle = () => new Promise(r => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 120 }) : setTimeout(r, 16)));
function decode(ab){
  return new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
}
function prepare(id){
  const P = PACKS[id];
  if (!P || !ctx) return Promise.resolve();
  if (loading[id]) return loading[id];
  verbFor(id);
  if (P.dir){
    loading[id] = Promise.all(Object.entries(REC_FILES).map(async ([kind, file]) => {
      try {
        const r = await fetch(`sounds/${P.dir}/${file}.mp3`);
        if (!r.ok) return;
        const buf = await decode(await r.arrayBuffer());
        (bufs[id] || (bufs[id] = {}))[kind] = [buf];
      } catch(_){}
    })).then(() => {});
  } else {
    loading[id] = (async () => { for (const k of WARM){ buffersFor(id, k); await idle(); } })();
  }
  return loading[id];
}
function makeIR(room){
  const len = Math.ceil(room.t * SR), pre = Math.ceil(0.012 * SR);
  const ir = ctx.createBuffer(2, len + pre, SR);
  for (let ch = 0; ch < 2; ch++){
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++){
      const t = i / SR;
      const a = Math.min(0.97, 0.1 + (room.damp || 0.5) * 1.3 * (t / room.t));
      lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
      d[pre + i] = lp * Math.exp(-6.9 * t / room.t) * (1 + (1 - a));
    }
    // a few early reflections
    for (let k = 0; k < 6; k++){
      const at = Math.floor(rr(0.004, 0.045) * SR);
      d[at] += (Math.random() < 0.5 ? -1 : 1) * rr(0.3, 0.7) * (1 - k / 8);
    }
  }
  return ir;
}
function verbFor(id){
  const P = PACKS[id];
  if (!P || !P.room) return null;
  if (!verbs[id]){
    try {
      const c = ctx.createConvolver();
      c.buffer = makeIR(P.room);
      c.connect(master);
      verbs[id] = c;
    } catch(_){ verbs[id] = null; }
  }
  return verbs[id];
}
function fireBuf(id, kind, when, vel){
  const list = buffersFor(id, kind);
  if (!list || !list.length) return false;
  const P = PACKS[id];
  const src = ctx.createBufferSource();
  src.buffer = pick(list);
  if (!P.dir && JITTER[kind]) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.018;
  const g = ctx.createGain();
  g.gain.value = vel * (P.gain || 1);
  src.connect(g); g.connect(master);
  const v = verbFor(id);
  if (v){ const s = ctx.createGain(); s.gain.value = P.room.wet; g.connect(s); s.connect(v); }
  src.start(when);
  return true;
}
function fire(id, kind, when){
  const P = PACKS[id];
  if (!P.dir) return fireBuf(id, kind, when, 1);
  // recorded pack
  if (kind === 'castle'){ fireBuf(id, 'move', when, 1); fireBuf(id, 'move', when + 0.09, 0.6); return true; }
  if (kind === 'promote'){ fireBuf(id, 'move', when, 1); fireBuf(id, 'notify', when + 0.05, 0.45); return true; }
  if (REC_FILES[kind]) return fireBuf(id, kind, when, 1);
  return fireBuf('_gen', kind, when, 1);
}

export function play(kind, id){
  if (!enabled && !id) return;
  try {
    if (!ctx) unlockAudio();
    if (!ctx) return;
    const pid = PACKS[id] ? id : packId;
    const P = PACKS[pid];
    if (P.dir && !(bufs[pid] && bufs[pid].move)){
      const t0 = performance.now();
      prepare(pid).then(() => { if (performance.now() - t0 < 450) fire(pid, kind, ctx.currentTime + 0.005); });
      return;
    }
    fire(pid, kind, ctx.currentTime + 0.005);
  } catch(_){}
}

// short demo: move, capture, check
export function previewPack(id){
  unlockAudio();
  if (!ctx || !PACKS[id]) return;
  prepare(id).then(() => {
    const t = ctx.currentTime + 0.04;
    try { fire(id, 'move', t); fire(id, 'capture', t + 0.42); fire(id, 'check', t + 0.9); } catch(_){}
  });
}

// test hook: render one sound into a Float32Array (used by the offline checks)
export function __renderForTest(id, kind, sampleRate = 48000){
  const keep = SR; SR = sampleRate;
  const fakeCtx = !ctx;
  if (fakeCtx) ctx = { createBuffer: (c, n, sr) => { const d = new Float32Array(n); return { getChannelData: () => d, length: n, sampleRate: sr }; } };
  try { return render(PACKS[id], kind).map(b => b.getChannelData(0)); }
  finally { SR = keep; if (fakeCtx) ctx = null; }
}
