// Local persistence: settings, stats, history, active challenge.
const KEY = 'cpt.v1.';

function read(k, fallback){
  try { const v = localStorage.getItem(KEY + k); return v ? JSON.parse(v) : fallback; }
  catch(_) { return fallback; }
}
function write(k, v){
  try { localStorage.setItem(KEY + k, JSON.stringify(v)); return true; }
  catch(_) { return false; }
}

export const DEFAULT_SETTINGS = {
  theme: 'dark',          // dark | light | midnight | oled
  boardTheme: 'blue',
  pieces: 'staunton',
  sound: true,
  soundPack: 'wood',      // one of 15 synthesized packs
  volume: 0.8,
  anim: true,
  animSpeed: 'normal',    // fast | normal | slow
  legal: true,
  coords: true,
  evalBar: true,
  bgDim: 0.55,           // darkening over a custom background photo
  bgBlur: false,
  mode: 'r',              // r(andom) | o | m | e
  level: 3                // 0..5
};

export const store = {
  settings(){
    const s = Object.assign({}, DEFAULT_SETTINGS, read('settings', {}));
    // v2 look: classic pieces + blue board for everyone once
    if (!s.v2){ s.pieces = 'staunton'; s.boardTheme = 'blue'; s.v2 = true; write('settings', s); }
    if (s.pieces === 'glyph') s.pieces = 'staunton';
    return s;
  },
  saveSettings(s){ write('settings', s); },

  stats(){
    return Object.assign({
      completed: 0, success: 0, failed: 0, draws: 0,
      streak: 0, bestStreak: 0,
      byPhase: { o:{p:0,w:0}, m:{p:0,w:0}, e:{p:0,w:0}, r:{p:0,w:0} },
      classes: {},       // classification -> count (player moves)
      tags: {},          // mistake tag -> count
      tagsByPhase: {}    // tag -> {o,m,e,r}
    }, read('stats', {}));
  },
  saveStats(s){ write('stats', s); },

  history(){ return read('history', []); },
  saveHistory(h){
    // keep newest 150; if storage is full drop older entries until it fits
    let list = h.slice(0, 150);
    while (!write('history', list) && list.length > 5) list = list.slice(0, Math.floor(list.length * 0.8));
  },

  active(){ return read('active', null); },
  saveActive(a){ if (a) write('active', a); else { try { localStorage.removeItem(KEY + 'active'); } catch(_){} } },

  seen(){ return read('seen', []); },
  addSeen(key){
    const s = read('seen', []);
    s.push(key);
    write('seen', s.slice(-400));
  },

  resetAll(){
    for (const k of ['stats', 'history', 'active', 'seen']) try { localStorage.removeItem(KEY + k); } catch(_){}
  }
};
