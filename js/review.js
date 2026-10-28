// Full-game analysis, move classification and plain-language explanations.
import { Chess } from './vendor/chess.js';
import { winProb, scoreToWhiteCp, fmtEval, PIECE_VALUE } from './util.js';

export const CLASSES = {
  brilliant:  { label: 'Brilliant',  sym: '!!', color: 'var(--c-brilliant)' },
  great:      { label: 'Great',      sym: '!',  color: 'var(--c-great)' },
  best:       { label: 'Best',       sym: '★',  color: 'var(--c-best)' },
  excellent:  { label: 'Excellent',  sym: '✓',  color: 'var(--c-excellent)' },
  good:       { label: 'Good',       sym: '✓',  color: 'var(--c-good)' },
  forced:     { label: 'Forced',     sym: '→',  color: 'var(--c-forced)' },
  inaccuracy: { label: 'Inaccuracy', sym: '?!', color: 'var(--c-inaccuracy)' },
  mistake:    { label: 'Mistake',    sym: '?',  color: 'var(--c-mistake)' },
  miss:       { label: 'Miss',       sym: '✕',  color: 'var(--c-miss)' },
  blunder:    { label: 'Blunder',    sym: '??', color: 'var(--c-blunder)' }
};
export const CLASS_ORDER = ['brilliant','great','best','excellent','good','forced','inaccuracy','mistake','miss','blunder'];

export const TAGS = {
  hanging:     'Leaving pieces hanging',
  allowedMate: 'Allowing checkmate',
  missedMate:  'Missing checkmate',
  missedWin:   'Missing winning tactics',
  lostMaterial:'Losing material in exchanges',
  positional:  'Positional inaccuracies',
  missedChance:'Not punishing bot mistakes'
};

const NAME = { p:'pawn', n:'knight', b:'bishop', r:'rook', q:'queen', k:'king' };
const VAL = { p:1, n:3, b:3, r:5, q:9, k:100 };

function wpFor(cpWhite, color){ const w = winProb(cpWhite); return color === 'w' ? w : 1 - w; }
function opp(c){ return c === 'w' ? 'b' : 'w'; }

function uciToMove(u){ return u ? { from: u.slice(0,2), to: u.slice(2,4), promotion: u[4] } : null; }

export function uciToSan(fen, uci){
  try { const c = new Chess(fen); const m = c.move(uciToMove(uci)); return m ? m.san : uci; }
  catch(_) { return uci; }
}

export function pvToSan(fen, pv, n = 4){
  const c = new Chess(fen); const out = [];
  for (const u of pv.slice(0, n)){
    try { const m = c.move(uciToMove(u)); if (!m) break; out.push(m.san); } catch(_) { break; }
  }
  return out;
}

function material(c, color){
  let m = 0;
  for (const row of c.board()) for (const p of row){
    if (!p || p.type === 'k') continue;
    m += (p.color === color ? 1 : -1) * VAL[p.type];
  }
  return m;
}

// Net material change (for `color`) after playing the line (stops at a quiet point).
function lineSwing(fen, line, color, maxPlies = 5){
  const c = new Chess(fen);
  const start = material(c, color);
  let lastCap = false, i = 0;
  for (; i < line.length; i++){
    if (i >= maxPlies && !lastCap) break;
    if (i >= maxPlies + 2) break;
    let m; try { m = c.move(uciToMove(line[i])); } catch(_) { break; }
    if (!m) break;
    lastCap = !!m.captured;
  }
  return material(c, color) - start;
}

function materialPhrase(v, pieceType){
  if (pieceType && VAL[pieceType] && Math.abs(VAL[pieceType] - v) <= 1 && pieceType !== 'p') return 'a ' + NAME[pieceType];
  if (v >= 8) return 'the queen';
  if (v >= 5) return 'a rook';
  if (v >= 3) return 'a piece';
  if (v >= 2) return 'two pawns';
  return 'a pawn';
}

// ---------- tactic detection ----------
function attackersOf(c, sq, color){ try { return c.attackers(sq, color); } catch(_) { return []; } }

function detectTactic(fenBefore, uci){
  const c = new Chess(fenBefore);
  const me = c.turn(), them = opp(me);
  let mv; try { mv = c.move(uciToMove(uci)); } catch(_) { return null; }
  if (!mv) return null;
  if (c.isCheckmate()) return { kind: 'mate', text: 'delivers checkmate' };
  const sq = mv.to, piece = c.get(sq);
  const myVal = VAL[piece.type];

  // fork
  const targets = [];
  for (const row of c.board()) for (const p of row){
    if (!p || p.color !== them) continue;
    if (!attackersOf(c, p.square, me).includes(sq)) continue;
    const defended = attackersOf(c, p.square, them).length > 0;
    if (p.type === 'k' || VAL[p.type] > myVal || (!defended && VAL[p.type] >= 3)) targets.push(p);
  }
  if (targets.length >= 2){
    targets.sort((a,b) => VAL[b.type] - VAL[a.type]);
    return { kind: 'fork', text: `forks the ${NAME[targets[0].type]} and ${NAME[targets[1].type]}` };
  }

  // pin / skewer along lines from a slider
  if ('brq'.includes(piece.type)){
    const dirs = [];
    if ('rq'.includes(piece.type)) dirs.push([1,0],[-1,0],[0,1],[0,-1]);
    if ('bq'.includes(piece.type)) dirs.push([1,1],[1,-1],[-1,1],[-1,-1]);
    const f0 = sq.charCodeAt(0) - 97, r0 = +sq[1];
    for (const [df, dr] of dirs){
      let f = f0 + df, r = r0 + dr, first = null;
      while (f >= 0 && f < 8 && r >= 1 && r <= 8){
        const s = String.fromCharCode(97 + f) + r;
        const p = c.get(s);
        if (p){
          if (!first){ if (p.color !== them) break; first = p; }
          else {
            if (p.color !== them) break;
            if (p.type === 'k' && first.type !== 'p') return { kind: 'pin', text: `pins the ${NAME[first.type]} to the king` };
            if (first.type === 'k' && VAL[p.type] >= 3) return { kind: 'skewer', text: `skewers the king and wins the ${NAME[p.type]} behind it` };
            if (VAL[first.type] > VAL[p.type] && VAL[p.type] >= 3 && VAL[first.type] > myVal) return { kind: 'skewer', text: `skewers the ${NAME[first.type]} and ${NAME[p.type]}` };
            if (VAL[p.type] > VAL[first.type] && VAL[p.type] > myVal && first.type !== 'p') return { kind: 'pin', text: `pins the ${NAME[first.type]} to the ${NAME[p.type]}` };
            break;
          }
        }
        f += df; r += dr;
      }
    }
  }

  // discovered attack: another of my pieces now attacks a valuable enemy piece
  const before = new Chess(fenBefore);
  for (const row of c.board()) for (const p of row){
    if (!p || p.color !== them || !(p.type === 'k' || VAL[p.type] >= 5)) continue;
    const nowA = attackersOf(c, p.square, me).filter(s => s !== sq);
    const wasA = attackersOf(before, p.square, me);
    if (nowA.some(s => !wasA.includes(s))){
      return { kind: 'discovered', text: p.type === 'k' ? 'unleashes a discovered check' : `uncovers a discovered attack on the ${NAME[p.type]}` };
    }
  }
  if (mv.san.includes('+')) return { kind: 'check', text: 'gives check' };
  if (mv.captured) return { kind: 'capture', text: `captures the ${NAME[mv.captured]}` };
  return null;
}

function isSacrifice(fenBefore, uci){
  const c = new Chess(fenBefore);
  const me = c.turn(), them = opp(me);
  let mv; try { mv = c.move(uciToMove(uci)); } catch(_) { return false; }
  if (!mv || mv.piece === 'p' || mv.piece === 'k') return false;
  const v = VAL[mv.promotion || mv.piece];
  const capV = mv.captured ? VAL[mv.captured] : 0;
  if (v - capV < 2) return false;
  const att = attackersOf(c, mv.to, them);
  if (!att.length) return false;
  const minAtt = Math.min(...att.map(s => VAL[c.get(s).type]));
  const defended = attackersOf(c, mv.to, me).length > 0;
  if (minAtt >= 100 && defended) return false;
  return !defended || minAtt < v;
}

function hangingAfter(fenAfter, reply){
  // reply (opponent best move) captures something of ours?
  if (!reply) return null;
  const c = new Chess(fenAfter);
  const m = uciToMove(reply);
  const target = c.get(m.to);
  if (!target) return null;
  return { type: target.type, square: m.to };
}

// ---------- main analysis ----------
// game: { startFen, playerColor, moves:[{uci,san,fenBefore,fenAfter,by}] }
export async function analyzeGame(engine, game, onProgress){
  const fens = [game.startFen, ...game.moves.map(m => m.fenAfter)];
  const evals = [];
  for (let i = 0; i < fens.length; i++){
    const fen = fens[i];
    const c = new Chess(fen);
    const stm = c.turn();
    if (c.isCheckmate()){
      evals.push({ cpW: stm === 'w' ? -10000 : 10000, mate: 0, best: null, pv: [], lines: [], terminal: true });
    } else if (c.isGameOver()){
      evals.push({ cpW: 0, mate: null, best: null, pv: [], lines: [], terminal: true });
    } else {
      const playerToMove = stm === game.playerColor;
      const res = await engine.go(fen, { movetime: playerToMove ? 420 : 260, multipv: playerToMove ? 3 : 1, skill: 20 });
      const lines = res.lines.map(l => ({ uci: l.pv[0], cpW: scoreToWhiteCp(l.score, stm), mate: l.score.mate, pv: l.pv }));
      const top = lines[0] || { cpW: 0, mate: null, pv: [res.best] };
      evals.push({ cpW: top.cpW, mate: top.mate, best: res.best, pv: top.pv, lines });
    }
    onProgress && onProgress((i + 1) / fens.length);
  }
  return buildReview(game, evals);
}

export function buildReview(game, evals){
  const pc = game.playerColor;
  const moves = [];
  const counts = {};
  const tags = {};
  let accSum = 0, accN = 0;
  let prevOppLoss = 0;

  for (let i = 0; i < game.moves.length; i++){
    const mv = game.moves[i];
    const before = evals[i], after = evals[i + 1];
    const mover = new Chess(mv.fenBefore).turn();
    const wpB = wpFor(before.cpW, mover), wpA = wpFor(after.cpW, mover);
    const loss = Math.max(0, wpB - wpA);
    const entry = { i, san: mv.san, uci: mv.uci, by: mv.by, mover, cpBefore: before.cpW, cpAfter: after.cpW, loss };

    if (mv.by !== 'p'){
      prevOppLoss = loss;
      moves.push(entry);
      continue;
    }

    const legalCount = new Chess(mv.fenBefore).moves().length;
    // centipawn loss from the mover's point of view (mate scores clipped) — guards against
    // "everything is best" when the win-probability curve is saturated in won/lost positions
    const clip = v => Math.max(-1500, Math.min(1500, v));
    const sgn = mover === 'w' ? 1 : -1;
    const cpLoss = Math.max(0, sgn * (clip(before.cpW) - clip(after.cpW)));
    const isTop = before.best === mv.uci || (loss <= 0.008 && cpLoss <= 30);
    const second = before.lines && before.lines[1];
    const wpSecond = second ? wpFor(second.cpW, mover) : null;
    const gap = wpSecond == null ? 0 : wpB - wpSecond;
    const prev = game.moves[i - 1];
    const recapture = prev && prev.uci && prev.captured && mv.uci.slice(2,4) === prev.uci.slice(2,4);
    const moverHadMate = before.mate != null && before.mate > 0;
    const keptMate = (after.mate != null && after.mate < 0) || (after.terminal && after.mate === 0);
    const oppMateAfter = after.mate != null && after.mate > 0; // opponent (to move) has mate

    let cls;
    if (legalCount === 1) cls = 'forced';
    else if (isTop || loss < 0.02){
      if (loss < 0.02 && isSacrifice(mv.fenBefore, mv.uci) && wpA >= 0.5 && wpB < 0.97) cls = 'brilliant';
      else if (isTop && gap >= 0.15 && wpB < 0.95 && wpA >= 0.35 && !recapture) cls = 'great';
      else if (isTop) cls = 'best';
      else cls = cpLoss <= 100 ? 'excellent' : 'good';
    }
    else if (loss < 0.05) cls = 'good';
    else if (loss >= 0.08 && wpA >= 0.3 && ((moverHadMate && !keptMate) || (prevOppLoss >= 0.10 && wpB >= 0.6))) cls = 'miss';
    else if (loss < 0.10) cls = 'inaccuracy';
    else if (loss < 0.20) cls = 'mistake';
    else cls = 'blunder';
    // a short forced mate that slipped away is always flagged, even if still winning
    if (moverHadMate && !keptMate && cls !== 'forced' && before.mate <= 3 && wpA >= 0.3) cls = 'miss';
    // allowing a brand-new forced mate is always serious
    const wasBeingMated = before.mate != null && before.mate < 0;
    if (oppMateAfter && !wasBeingMated && cls !== 'forced') cls = wpB >= 0.25 ? 'blunder' : (CLASS_ORDER.indexOf(cls) < CLASS_ORDER.indexOf('mistake') ? 'mistake' : cls);
    // already facing mate: judge by how long you resist
    let fasterMate = false;
    if (wasBeingMated && cls !== 'forced' && mv.uci !== before.best){
      const was = Math.abs(before.mate), now = after.terminal ? 0 : (after.mate != null && after.mate > 0 ? after.mate : 99);
      if (now < was){ cls = 'inaccuracy'; fasterMate = true; }
      else if (cls === 'best') cls = 'excellent';
    }

    entry.cls = cls;
    counts[cls] = (counts[cls] || 0) + 1;
    const acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss * 100) - 3.1669));
    entry.acc = acc; accSum += acc; accN++;

    // explanations
    const bestSan = before.best ? uciToSan(mv.fenBefore, before.best) : null;
    entry.bestUci = before.best;
    entry.bestSan = bestSan;
    entry.bestLine = before.best ? pvToSan(mv.fenBefore, before.pv, 4) : [];
    entry.replyUci = after.best;
    entry.replyLine = after.best ? pvToSan(mv.fenAfter, after.pv, 3) : [];
    const ex = fasterMate
      ? { text: `You were already facing a forced mate, but ${mv.san} allows it ${after.terminal ? 'immediately' : 'faster'}. ${bestSan} would have resisted longer.`, tag: null }
      : explain({ mv, before, after, cls, bestSan, mover, moverHadMate, keptMate, oppMateAfter, wpB, wpA, entry });
    entry.text = ex.text;
    entry.tag = ex.tag;
    if (ex.tag) tags[ex.tag] = (tags[ex.tag] || 0) + 1;
    moves.push(entry);
    prevOppLoss = 0;
  }

  // turning points: biggest swings in White's win probability
  const swings = [];
  for (let i = 0; i < game.moves.length; i++){
    const d = winProb(evals[i + 1].cpW) - winProb(evals[i].cpW);
    if (Math.abs(d) >= 0.15) swings.push({ i, d });
  }
  swings.sort((a,b) => Math.abs(b.d) - Math.abs(a.d));
  const turning = swings.slice(0, 3).map(s => s.i).sort((a,b) => a - b);
  for (const t of turning) moves[t].turning = true;

  const accuracy = accN ? Math.round(accSum / accN * 10) / 10 : null;
  return {
    evals: evals.map(e => ({ cpW: e.cpW, mate: e.mate, best: e.best })),
    moves, counts, tags, accuracy, turning,
    summary: summarize(game, evals, moves, counts, turning, accuracy)
  };
}

function explain(o){
  const { mv, before, after, cls, bestSan, mover, moverHadMate, keptMate, oppMateAfter, entry } = o;
  const them = opp(mover);
  const bestTactic = before.best ? detectTactic(mv.fenBefore, before.best) : null;
  const playedTactic = detectTactic(mv.fenBefore, mv.uci);
  const evB = fmtEval(before.cpW), evA = fmtEval(after.cpW);
  const reply = after.best ? uciToSan(mv.fenAfter, after.best) : null;
  const lines = [];
  let tag = null;

  if (cls === 'forced') return { text: 'This was the only legal move.', tag };

  if (cls === 'brilliant'){
    lines.push(`A brilliant sacrifice! ${mv.san} gives up material, but the engine confirms it is the strongest way to play.`);
    if (playedTactic && playedTactic.kind !== 'capture') lines.push(`It ${playedTactic.text}.`);
    return { text: lines.join(' '), tag };
  }
  if (cls === 'great'){
    const alt = before.lines[1] ? uciToSan(mv.fenBefore, before.lines[1].uci) : null;
    lines.push(`Great find — ${mv.san} was the only move that keeps your position on track.`);
    if (alt) lines.push(`The next best option, ${alt}, would have been clearly worse (${fmtEval(before.lines[1].cpW)}).`);
    if (playedTactic && playedTactic.kind !== 'capture') lines.push(`It ${playedTactic.text}.`);
    return { text: lines.join(' '), tag };
  }
  if (cls === 'best'){
    lines.push(bestSan && bestSan !== mv.san ? `${mv.san} is just as strong as the engine's first choice (${bestSan}).` : `${mv.san} is the engine's top move.`);
    if (playedTactic) lines.push(`It ${playedTactic.text}.`);
    if (moverHadMate && after.mate != null && after.mate < 0) lines.push(`You are on track for checkmate in ${Math.abs(after.mate)}.`);
    return { text: lines.join(' '), tag };
  }
  if (cls === 'excellent' || cls === 'good'){
    lines.push(cls === 'excellent' ? `${mv.san} is a strong move, almost as good as the top choice.` : `${mv.san} is a reasonable move.`);
    if (bestSan && bestSan !== mv.san){
      lines.push(`The engine slightly preferred ${bestSan}${bestTactic && bestTactic.kind !== 'capture' ? `, which ${bestTactic.text}` : ''}.`);
    }
    return { text: lines.join(' '), tag };
  }

  // Inaccuracy / Mistake / Miss / Blunder
  const swingPlayed = lineSwing(mv.fenAfter, after.pv || [], mover, 4) + lineSwingMove(mv);
  const swingBest = before.pv && before.pv.length ? lineSwing(mv.fenBefore, before.pv, mover, 5) : 0;

  if (oppMateAfter){
    lines.push(`${mv.san} allows a forced checkmate in ${after.mate}${reply ? `, starting with ${reply}` : ''}.`);
    tag = 'allowedMate';
  } else if (moverHadMate && !keptMate){
    lines.push(`You missed a forced checkmate in ${before.mate}, starting with ${bestSan}.`);
    tag = 'missedMate';
  } else if (swingPlayed <= -2){
    const h = hangingAfter(mv.fenAfter, after.best);
    if (h && h.type !== 'p'){
      lines.push(`This leaves your ${NAME[h.type]} on ${h.square} vulnerable — after ${reply}, you lose ${materialPhrase(-swingPlayed, h.type)}.`);
      tag = 'hanging';
    } else {
      lines.push(`After ${reply || 'the reply'}, you lose ${materialPhrase(-swingPlayed)}.`);
      tag = 'lostMaterial';
    }
  } else if (swingBest >= 2 && swingBest - swingPlayed >= 2){
    lines.push(`${bestSan} would have won ${materialPhrase(swingBest)}${bestTactic && !['capture','check'].includes(bestTactic.kind) ? ` — it ${bestTactic.text}` : ''}.`);
    tag = cls === 'miss' ? 'missedChance' : 'missedWin';
  } else if (cls === 'miss'){
    lines.push(`The bot had just made a mistake, but ${mv.san} lets the chance slip.`);
    tag = 'missedChance';
  } else {
    lines.push(`${mv.san} worsens your position — the evaluation goes from ${evB} to ${evA}${mover === 'b' ? ' (positive numbers favour White)' : ''}.`);
    tag = 'positional';
  }

  if (bestSan && bestSan !== mv.san && tag !== 'missedMate' && tag !== 'missedWin' && tag !== 'missedChance'){
    let why = `Better was ${bestSan}`;
    if (bestTactic && bestTactic.kind !== 'capture') why += `, which ${bestTactic.text}`;
    why += ` (${evB}).`;
    lines.push(why);
  } else if (tag === 'missedChance' && bestSan && !lines[0].includes(bestSan)){
    lines.push(`${bestSan} was the way to punish it (${evB}).`);
  }
  if (entry.bestLine.length > 1 && tag !== 'missedMate') lines.push(`Main idea: ${entry.bestLine.slice(0, 3).join(' ')}.`);
  return { text: lines.join(' '), tag };
}

function lineSwingMove(mv){
  // material change caused by the played move itself (for the mover)
  return mv.captured ? VAL[mv.captured] : 0;
}

function summarize(game, evals, moves, counts, turning, accuracy){
  const pc = game.playerColor;
  const startW = evals[0].cpW, endW = evals[evals.length - 1].cpW;
  const startP = pc === 'w' ? startW : -startW, endP = pc === 'w' ? endW : -endW;
  const out = [];
  if (game.online){
    const how = { mate: 'by checkmate', resign: 'by resignation', time: 'on time', abandon: 'because your opponent left', agreement: 'by agreement', stalemate: 'by stalemate', repetition: 'by repetition', insufficient: 'by insufficient material', fifty: 'by the 50-move rule' }[game.reason] || '';
    out.push(game.result === 'success' ? `You beat ${game.opp || 'your opponent'} ${how}.` : game.result === 'draw' ? `Drawn ${how}.` : `${game.opp || 'Your opponent'} won ${how}.`);
  } else if (game.result === 'success'){
    out.push(game.reason === 'mate' ? 'You delivered checkmate — challenge complete!' : `You improved the position from ${fmtSigned(startP)} to ${fmtSigned(endP)} — challenge complete!`);
  } else if (game.result === 'draw'){
    out.push('The game ended in a draw before you could improve the position.');
  } else {
    out.push('You were checkmated this time.');
  }
  const player = moves.filter(m => m.by === 'p');
  const good = player.filter(m => ['brilliant','great','best','excellent'].includes(m.cls)).length;
  if (player.length) out.push(`${good} of your ${player.length} moves were excellent or better.`);
  const bad = player.filter(m => ['mistake','blunder','miss'].includes(m.cls));
  if (bad.length){
    const worst = bad.slice().sort((a,b) => b.loss - a.loss)[0];
    out.push(`Biggest slip: ${moveLabel(game, worst.i)} ${worst.san} (${CLASSES[worst.cls].label.toLowerCase()}).`);
  } else if (player.length) out.push('No mistakes — clean game!');
  return out.join(' ');
}

function fmtSigned(cp){ return fmtEval(cp); }

export function moveLabel(game, i){
  // move number for move index i in this game
  const fen = game.moves[i].fenBefore;
  const parts = fen.split(' ');
  const n = +parts[5] || 1;
  return parts[1] === 'w' ? `${n}.` : `${n}…`;
}
