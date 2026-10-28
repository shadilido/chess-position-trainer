// Legal position pool (pre-generated from real engine games, verified with Stockfish).
import { Chess } from './vendor/chess.js';

let DB = null;

export const PHASES = {
  r: { label: 'Random',     short: 'Random' },
  o: { label: 'Opening',    short: 'Opening' },
  m: { label: 'Middlegame', short: 'Middlegame' },
  e: { label: 'Endgame',    short: 'Endgame' }
};

export async function loadPositions(){
  if (DB) return DB;
  const res = await fetch('data/positions.json');
  DB = await res.json();
  return DB;
}

function key(fen){ return fen.split(' ').slice(0, 4).join(' '); }

export function pickPosition(mode, seen = []){
  const seenSet = new Set(seen);
  let phase = mode;
  if (mode === 'r'){
    // completely random: any phase, weighted toward variety
    const r = Math.random();
    phase = r < 0.25 ? 'o' : r < 0.6 ? 'm' : r < 0.85 ? 'e' : 'r';
    if (!DB[phase] || !DB[phase].length) phase = 'm';
  }
  const pool = DB[phase] || [];
  let cands = pool.filter(p => !seenSet.has(key(p[0])));
  if (!cands.length) cands = pool;
  for (let tries = 0; tries < 20; tries++){
    const [fen, cp] = cands[Math.floor(Math.random() * cands.length)];
    try {
      const c = new Chess(fen);          // validates legality
      if (c.isGameOver()) continue;
      return { fen, cp, phase: mode === 'r' ? 'r' : phase, srcPhase: phase, key: key(fen) };
    } catch(_) { /* skip invalid */ }
  }
  throw new Error('No valid positions available');
}
