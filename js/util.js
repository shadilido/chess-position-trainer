// Shared helpers
export const FILES = ['a','b','c','d','e','f','g','h'];

export function sqToRC(sq){ return { r: 8 - parseInt(sq[1],10), c: FILES.indexOf(sq[0]) }; }
export function rcToSq(r,c){ return FILES[c] + (8 - r); }

// cp (centipawns, White POV) -> white win probability 0..1
export function winProb(cp){
  if (cp >= 9000) return 1;
  if (cp <= -9000) return 0;
  return 1 / (1 + Math.exp(-0.00368208 * cp));
}

// Normalise a score object {cp, mate} (side-to-move POV) to White-POV centipawns
export function scoreToWhiteCp(score, turn){
  let cp;
  if (score.mate != null) cp = score.mate > 0 ? 10000 - Math.abs(score.mate) : -10000 + Math.abs(score.mate);
  else cp = score.cp ?? 0;
  return turn === 'w' ? cp : -cp;
}

export function fmtEval(whiteCp, turnForMate){
  if (Math.abs(whiteCp) > 9000){
    const n = 10000 - Math.abs(whiteCp);
    return (whiteCp > 0 ? '+M' : '-M') + Math.max(n,1);
  }
  const p = whiteCp / 100;
  return (p > 0 ? '+' : '') + p.toFixed(1);
}

export function clamp(x,a,b){ return Math.min(b, Math.max(a,x)); }

export function el(tag, cls, html){
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export const PIECE_VALUE = { p:1, n:3, b:3.2, r:5, q:9, k:0 };

export function materialWhiteMinusBlack(chess){
  let m = 0;
  for (const row of chess.board()) for (const p of row){
    if (!p) continue;
    const v = PIECE_VALUE[p.type];
    m += p.color === 'w' ? v : -v;
  }
  return m;
}

export function debounce(fn, ms){
  let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), ms); };
}
