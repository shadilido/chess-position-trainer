// Tiny synthesized sound effects (no audio files needed).
let ctx = null;
let enabled = true;

export function setSoundEnabled(v){ enabled = v; }

export function unlockAudio(){
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch(_){}
}

function knock(t0, freq, dur, gain, noise = 0.6){
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(ctx.destination);
  // body
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t0);
  o.frequency.exponentialRampToValueAtTime(freq * 0.55, t0 + dur);
  o.connect(g); o.start(t0); o.stop(t0 + dur + 0.02);
  // click / wood texture
  if (noise > 0){
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const n = ctx.createBufferSource(); n.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = gain * noise;
    n.connect(f); f.connect(ng); ng.connect(ctx.destination);
    n.start(t0);
  }
}

function tone(t0, freq, dur, gain, type = 'triangle'){
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(ctx.destination);
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  o.connect(g); o.start(t0); o.stop(t0 + dur + 0.02);
}

export function play(kind){
  if (!enabled) return;
  try {
    if (!ctx) unlockAudio();
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    switch (kind){
      case 'move':    knock(t, 420, 0.09, 0.35); break;
      case 'capture': knock(t, 300, 0.12, 0.45, 1.0); knock(t + 0.045, 520, 0.07, 0.25); break;
      case 'check':   knock(t, 420, 0.09, 0.35); tone(t + 0.05, 880, 0.18, 0.12); break;
      case 'castle':  knock(t, 420, 0.08, 0.3); knock(t + 0.09, 380, 0.08, 0.3); break;
      case 'promote': knock(t, 420, 0.08, 0.3); tone(t + 0.04, 990, 0.25, 0.1, 'sine'); break;
      case 'win':     [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.09, f, 0.35, 0.12, 'sine')); break;
      case 'lose':    [392, 330, 262].forEach((f, i) => tone(t + i * 0.12, f, 0.4, 0.12, 'sine')); break;
      case 'draw':    [440, 440].forEach((f, i) => tone(t + i * 0.15, f, 0.3, 0.1, 'sine')); break;
      case 'tap':     knock(t, 900, 0.03, 0.08, 0.2); break;
    }
  } catch(_){}
}
