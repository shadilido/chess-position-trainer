import { Chess } from './vendor/chess.js';
import { Engine } from './engine.js';
import { Board } from './board.js';
import { pieceSVG, PIECE_STYLES } from './pieces.js';
import { store } from './store.js';
import { play as sfx, unlockAudio, setSoundEnabled, setSoundPack, setVolume, SOUND_PACKS, previewPack } from './sound.js';
import { loadPositions, pickPosition, PHASES } from './positions.js';
import { analyzeGame, CLASSES, CLASS_ORDER, TAGS, uciToSan, moveLabel } from './review.js';
import { initOnline, layoutMatch, renderHomeOnline, liveGameActive } from './online-ui.js';
import { winProb, scoreToWhiteCp, fmtEval, el, debounce } from './util.js';
import { getBackgroundBlob, saveBackground, clearBackground, applyBackgroundBlob, backgroundUrl } from './background.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const LEVELS = [
  { name: 'Rookie',   elo: '≈800',  skill: 0,  depth: 1 },
  { name: 'Novice',   elo: '≈1100', skill: 3,  depth: 4 },
  { name: 'Casual',   elo: '≈1400', skill: 6,  depth: 7 },
  { name: 'Club',     elo: '≈1700', skill: 10, movetime: 300 },
  { name: 'Expert',   elo: '≈2100', skill: 15, movetime: 500 },
  { name: 'Master',   elo: '2500+', skill: 20, movetime: 900 }
];
const THEMES = [
  { id: 'dark', name: 'Dark', bg: '#141519', s: '#262930', a: '#f4b740' },
  { id: 'light', name: 'Light', bg: '#f2f0eb', s: '#ffffff', a: '#e9a723' },
  { id: 'midnight', name: 'Midnight', bg: '#0b1220', s: '#1a2540', a: '#f4b740' },
  { id: 'oled', name: 'OLED', bg: '#000000', s: '#161618', a: '#f4b740' }
];
const BOARDS = [
  { id: 'blue', name: 'Classic Blue', l: '#edf0f5', d: '#7a94c4' },
  { id: 'sage', name: 'Sage', l: '#e9e6d3', d: '#86a17f' },
  { id: 'walnut', name: 'Walnut', l: '#ecd5b0', d: '#a97a51' },
  { id: 'ocean', name: 'Ocean', l: '#dfe7ee', d: '#5f8fa8' },
  { id: 'dusk', name: 'Dusk', l: '#ebe2ec', d: '#9a7aa1' },
  { id: 'graphite', name: 'Graphite', l: '#d6d6d2', d: '#7b7c80' },
  { id: 'coral', name: 'Coral', l: '#f4e6d8', d: '#cf846b' },
  { id: 'marble', name: 'Marble', l: '#f1f0ec', d: '#8a8f8c' },
  { id: 'marble-green', name: 'Green Marble', l: '#eef0ea', d: '#4f7a66' }
];
const FLAME = '<svg viewBox="0 0 24 24"><path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.3 1-4 2.5-5.3.2 1.6 1 2.8 2.3 3.3C11 8.7 11.3 5.2 12 2Z"/></svg>';
const MAX_PLAYER_MOVES = 80;

let settings = store.settings();
let stats = store.stats();
let history = store.history();

const playEngine = new Engine();
let anaEngine = null;
let engineReady = null;

let playBoard, reviewBoard, heroBoard;
let G = null;          // active game
let R = null;          // review state
let deferredInstall = null;
const extraBoards = [];

// ================= Boot =================
async function boot(){
  applySettings();
  loadBackground();
  playBoard = new Board($('#play-board'), { onMove: onPlayerMove, getLegal: sq => legalFrom(sq), onIllegal: () => sfx('illegal') });
  reviewBoard = new Board($('#review-board'));
  reviewBoard.root.classList.add('rv');
  heroBoard = new Board($('#hero-board'), { draw: false });
  heroBoard.applySettings({ coords: false, anim: false, pieces: settings.pieces });
  applyBoardSettings();
  bindNav();
  initOnline({
    show, toast, layout,
    settings: () => settings,
    registerBoard: b => { extraBoards.push(b); applyBoardSettings(); },
    addHistory: rec => { history = history.filter(h => h.id !== rec.id); history.unshift(rec); store.saveHistory(history); },
    openReview: (rec, from) => openReview(rec, from),
    analyze: rec => runAnalysis(rec),
    lockedScreen: () => current === 'play' || current === 'review'
  });
  renderHome();
  layout();
  window.addEventListener('resize', debounce(layout, 60));
  window.addEventListener('orientationchange', () => setTimeout(layout, 200));
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  engineReady = Promise.all([playEngine.init(), loadPositions()]).catch(err => { console.error(err); toast('Engine failed to load'); });
  renderHeroPreview();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')){
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; renderInstallCard(); });
  document.addEventListener('keydown', onKey);
}

async function renderHeroPreview(){
  try {
    await loadPositions();
    const p = pickPosition('r', []);
    const c = new Chess(p.fen);
    heroBoard.setOrientation(c.turn());
    heroBoard.setPosition(c, null, false);
  } catch(_){}
}

// ================= Settings / theme =================
function applySettings(){
  const h = document.documentElement;
  h.dataset.theme = settings.theme;
  h.dataset.board = settings.boardTheme;
  h.classList.toggle('no-anim', !settings.anim);
  h.classList.toggle('hide-eval', !settings.evalBar);
  const t = THEMES.find(t => t.id === settings.theme);
  $('meta[name="theme-color"]').setAttribute('content', t ? t.bg : '#141519');
  setSoundEnabled(settings.sound);
  setSoundPack(settings.soundPack);
  setVolume(settings.volume == null ? 0.8 : settings.volume);
  h.style.setProperty('--bg-dim', String(settings.bgDim));
  h.classList.toggle('bg-blur', !!settings.bgBlur);
}
async function loadBackground(){
  const blob = await getBackgroundBlob();
  applyBackgroundBlob(blob || null);
  if (current === 'settings') renderSettings();
}

function applyBoardSettings(){
  const s = { coords: settings.coords, legal: settings.legal, anim: settings.anim, pieces: settings.pieces, animSpeed: settings.animSpeed };
  playBoard.applySettings(s);
  reviewBoard.applySettings(s);
  heroBoard.applySettings({ pieces: settings.pieces, coords: false, anim: false });
  extraBoards.forEach(b => b.applySettings(s));
}
function saveSettings(){ store.saveSettings(settings); applySettings(); applyBoardSettings(); layout(); }

// ================= Navigation =================
let current = 'home';
function show(name){
  // fair play: no bot, reviews or analysis while a live online game is running
  if ((name === 'play' || name === 'review') && liveGameActive()){
    toast('Finish your online game first: the bot and analysis are locked during live games.');
    return;
  }
  current = name;
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'scr-' + name));
  if (name === 'home') renderHome();
  if (name === 'stats') renderStats();
  if (name === 'settings') renderSettings();
  requestAnimationFrame(layout);
}
function bindNav(){
  document.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go){ sfx('tap'); show(go.dataset.go); }
  });
  $('#btn-play').addEventListener('click', onPlay);
  $('#btn-next').addEventListener('click', () => { hideSheet(); newChallenge(); });
  $('#btn-review').addEventListener('click', () => { const rec = history.find(h => h.id === G?.recId); if (rec) openReview(rec, 'play'); });
  $('#review-back').addEventListener('click', () => show(R && R.from === 'stats' ? 'stats' : R && R.from === 'match' ? 'match' : (G && G.over ? 'play' : 'home')));
  $('#review-next').addEventListener('click', () => { show('play'); if (!G || G.over){ hideSheet(); newChallenge(); } });
  $$('.nav-btn').forEach(b => b.addEventListener('click', () => reviewNav(b.dataset.nav)));
  $('#mode-seg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    settings.mode = b.dataset.mode; store.saveSettings(settings); sfx('tap'); renderHome();
  });
  $('#levels').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    settings.level = +b.dataset.lv; store.saveSettings(settings); sfx('tap'); renderHome();
  });
}

function onKey(e){
  if (current === 'review'){
    if (e.key === 'ArrowLeft'){ reviewNav('prev'); e.preventDefault(); }
    else if (e.key === 'ArrowRight'){ reviewNav('next'); e.preventDefault(); }
    else if (e.key === 'Home' || e.key === 'ArrowUp'){ reviewNav('first'); e.preventDefault(); }
    else if (e.key === 'End' || e.key === 'ArrowDown'){ reviewNav('last'); e.preventDefault(); }
  }
}

// ================= Layout (board sizing) =================
function layout(){
  const evalH = settings.evalBar ? 24 : 0;   // horizontal eval bar under the board (18px + 6px gap)
  if (current === 'play'){
    const main = $('#play-main');
    const availW = Math.min(main.clientWidth, window.innerWidth) - 20;
    const availH = main.clientHeight - $('#goal').offsetHeight - 10 - $('.play-foot').offsetHeight - evalH - 6;
    const size = Math.max(160, Math.floor(Math.min(availW, availH, 640) / 8) * 8);
    $('#scr-play').style.setProperty('--bs', size + 'px');
    $('#scr-play').style.setProperty('--goal-w', size + 'px');
  }
  if (current === 'review'){
    const scr = $('#scr-review');
    const cs = getComputedStyle(scr);
    const avail = scr.clientHeight - 54 - 62 - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - evalH;
    const wide = window.innerWidth >= 900 && window.innerHeight >= 520;
    let size;
    if (wide) size = Math.min(avail - 18, window.innerWidth - 420 - 18 * 3, 720);
    else size = Math.min(avail * 0.54, window.innerWidth - 20);
    size = Math.max(160, Math.floor(size / 8) * 8);
    scr.style.setProperty('--bs', size + 'px');
  }
  if (current === 'match') layoutMatch();
}

// ================= Home =================
function renderHome(){
  const s = stats;
  const rate = s.completed ? Math.round(s.success / s.completed * 100) : 0;
  $('#home-stats').innerHTML = `
    <div><span class="ss-num">${FLAME}${s.streak}</span><span class="ss-lbl">Streak</span></div>
    <div><span class="ss-num">${s.completed ? rate + '%' : '—'}</span><span class="ss-lbl">Success</span></div>
    <div><span class="ss-num">${s.completed}</span><span class="ss-lbl">Solved</span></div>`;
  $$('#mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === settings.mode));
  $('#levels').innerHTML = LEVELS.map((l, i) => `
    <button data-lv="${i}" class="${i === settings.level ? 'on' : ''}" aria-label="${l.name}">
      <span class="pips">${LEVELS.map((_, j) => `<i class="${j <= i ? 'f' : ''}"></i>`).join('')}</span>${l.name}
    </button>`).join('');
  const L = LEVELS[settings.level];
  $('#level-name').textContent = `${L.name} · ${L.elo}`;
  const act = store.active();
  $('#play-label').textContent = (G && !G.over) || act ? 'Continue challenge' : 'Play';
  try { renderHomeOnline(); } catch(_){}
  const rw = $('#recent-wrap'), rl = $('#recent');
  rw.hidden = !history.length;
  rl.innerHTML = '';
  history.slice(0, 3).forEach(h => rl.appendChild(histRow(h)));
  renderInstallCard();
}

function isIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function isStandalone(){ return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }

function renderInstallCard(){
  const card = $('#install-card');
  if (isStandalone() || localStorage.getItem('cpt.hideInstall')){ card.hidden = true; return; }
  if (deferredInstall){
    card.hidden = false;
    card.innerHTML = `<div><b>Install the app</b><br>Get it in its own window, works offline.</div><button class="btn pri" id="inst-go">Install</button>`;
    $('#inst-go').onclick = async () => { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; renderInstallCard(); };
  } else if (isIOS()){
    card.hidden = false;
    card.innerHTML = `<div><b>Add to Home Screen</b><br>Tap <b>Share</b> then <b>Add to Home Screen</b> to use it like an app.</div><button class="x" id="inst-x" aria-label="Dismiss">✕</button>`;
    $('#inst-x').onclick = () => { localStorage.setItem('cpt.hideInstall', '1'); card.hidden = true; };
  } else card.hidden = true;
}

async function onPlay(){
  unlockAudio(); sfx('tap');
  show('play');
  maybeArrowTip();
  if (G && !G.over){ resumeView(); return; }
  if (G && G.over){ resumeView(); return; }
  const act = store.active();
  if (act){ await withEngine(() => resumeChallenge(act)); return; }
  await withEngine(() => newChallenge());
}

async function withEngine(fn){
  const ready = playEngine.ready;
  if (!ready) $('#boot').classList.add('show');
  try { await engineReady; } finally { $('#boot').classList.remove('show'); }
  if (!playEngine.ready){ toast('Engine could not start'); return; }
  return fn();
}

// ================= Play =================
function legalFrom(sq){
  if (!G || G.over || G.busy) return [];
  return G.chess.moves({ square: sq, verbose: true }).map(m => ({ to: m.to, promotion: m.promotion, flags: m.flags }));
}

function setStatus(text, kind = ''){
  const s = $('#play-status');
  s.className = 'status ' + kind;
  s.querySelector('.txt').textContent = text;
}

function playerP(cpW){ return G.playerColor === 'w' ? cpW : -cpW; }

async function newChallenge(){
  if (!playEngine.ready){ await withEngine(() => {}); }
  await loadPositions();
  hideSheet();
  const p = pickPosition(settings.mode, store.seen());
  store.addSeen(p.key);
  const c = new Chess(p.fen);
  G = {
    id: Date.now() + '-' + Math.floor(Math.random() * 1e6),
    startFen: p.fen, phase: p.phase, srcPhase: p.srcPhase, level: settings.level,
    playerColor: c.turn(), chess: c, moves: [], over: false, busy: true,
    startCpW: null, targetP: null, evalW: 0
  };
  const myId = G.id;
  playEngine.newGame();
  setupPlayView();
  setStatus('Evaluating position…', 'thinking');
  const ev = await playEngine.evaluate(p.fen, 700);
  if (!G || G.id !== myId) return;
  G.startCpW = scoreToWhiteCp(ev.score, c.turn());
  G.evalW = G.startCpW;
  G.targetP = Math.round(playerP(G.startCpW) + 100);
  G.busy = false;
  saveActive();
  setupPlayView();
  sfx('start');
  yourTurn();
}

async function resumeChallenge(a){
  const c = new Chess(a.startFen);
  const moves = [];
  for (const m of a.moves){
    const fenBefore = c.fen();
    const r = c.move({ from: m.uci.slice(0,2), to: m.uci.slice(2,4), promotion: m.uci[4] });
    moves.push({ uci: m.uci, san: r.san, by: m.by, fenBefore, fenAfter: c.fen(), captured: r.captured || null, from: r.from, to: r.to });
  }
  G = { ...a, chess: c, moves, over: false, busy: false };
  playEngine.newGame();
  setupPlayView();
  if (c.turn() !== G.playerColor){ G.busy = true; botMove(); }
  else yourTurn();
}

function saveActive(){
  if (!G || G.over) return;
  store.saveActive({
    id: G.id, startFen: G.startFen, phase: G.phase, srcPhase: G.srcPhase, level: G.level, playerColor: G.playerColor,
    startCpW: G.startCpW, targetP: G.targetP, evalW: G.evalW,
    moves: G.moves.map(m => ({ uci: m.uci, by: m.by }))
  });
}

function maybeArrowTip(){
  try {
    if (!window.matchMedia('(pointer:fine)').matches || localStorage.getItem('cpt.tipArrows')) return;
    localStorage.setItem('cpt.tipArrows', '1');
  } catch(_) { return; }
  setTimeout(() => toast('Tip: right-click + drag on the board to draw arrows'), 900);
}

function resumeView(){
  setupPlayView();
  if (G.over) showSheet(G.lastResult);
}

function setupPlayView(){
  $('#play-phase').textContent = PHASES[G.phase].label;
  const L = LEVELS[G.level];
  $('#play-level').textContent = `vs ${L.name} bot · you play ${G.playerColor === 'w' ? 'White' : 'Black'}`;
  playBoard.playerColor = G.playerColor;
  playBoard.setOrientation(G.playerColor);
  const last = G.moves[G.moves.length - 1];
  playBoard.setPosition(G.chess, last ? { from: last.from, to: last.to } : null, false);
  playBoard.interactive = !G.over && !G.busy && G.chess.turn() === G.playerColor;
  $('#play-eval').classList.toggle('flip', G.playerColor === 'b');
  updateEval();
  renderMoveStrip();
  layout();
}

function updateEval(){
  setEvalBar($('#play-eval'), G.evalW);
  const gt = $('#goal-text'), gn = $('#goal-now'), gf = $('#gm-fill');
  if (G.targetP == null){ gt.textContent = 'Evaluating start position…'; gn.textContent = ''; gf.style.width = '0'; return; }
  const sP = playerP(G.startCpW), nP = playerP(G.evalW);
  gt.textContent = `Improve ${fmtEval(sP)} → ${fmtEval(G.targetP)}`;
  gn.textContent = fmtEval(nP);
  gn.className = 'goal-now ' + (nP > sP + 15 ? 'up' : nP < sP - 15 ? 'down' : '');
  const prog = Math.max(0, Math.min(1, (nP - sP) / (G.targetP - sP)));
  gf.style.width = (G.over && G.lastResult === 'success' ? 100 : prog * 100) + '%';
  gf.classList.toggle('done', G.over && G.lastResult === 'success');
}

function setEvalBar(bar, cpW){
  // horizontal bar: White's share of the bar grows from White's side
  let wp = winProb(cpW);
  if (Math.abs(cpW) < 9000) wp = 0.03 + wp * 0.94;
  bar.querySelector('.eb-fill').style.width = (wp * 100).toFixed(1) + '%';
  const num = bar.querySelector('.eb-num');
  const txt = Math.abs(cpW) > 9000 ? 'M' + Math.max(1, 10000 - Math.abs(cpW)) : (cpW > 0 ? '+' : cpW < 0 ? '−' : '') + (Math.abs(cpW) / 100).toFixed(1);
  num.textContent = txt;
  num.className = 'eb-num ' + (cpW >= 0 ? 'w' : 'b');
}

function renderMoveStrip(){
  const strip = $('#play-moves');
  strip.innerHTML = '';
  G.moves.forEach((m, i) => {
    const parts = m.fenBefore.split(' ');
    if (parts[1] === 'w' || i === 0) strip.appendChild(el('span', 'mn', parts[1] === 'w' ? `${parts[5]}.` : `${parts[5]}…`));
    strip.appendChild(el('span', 'mv ' + (m.by === 'p' ? 'p' : 'b') + (i === G.moves.length - 1 ? ' last' : ''), m.san));
  });
  if (!G.moves.length) strip.appendChild(el('span', 'mn', 'No moves yet — the clock is yours.'));
  strip.scrollLeft = strip.scrollWidth;
}

function yourTurn(){
  if (!G || G.over) return;
  G.busy = false;
  playBoard.interactive = true;
  setStatus(G.chess.inCheck() ? 'Check! Your move' : 'Your move', G.chess.inCheck() ? 'check' : '');
}

let promoResolve = null;
function askPromotion(){
  return new Promise(res => {
    promoResolve = res;
    const card = $('#promo-card');
    card.innerHTML = ['q','r','b','n'].map(t => `<button data-p="${t}">${pieceSVG(t, G.playerColor, settings.pieces)}</button>`).join('');
    $('#promo').hidden = false;
    card.onclick = e => { const b = e.target.closest('button'); if (!b) return; $('#promo').hidden = true; promoResolve(b.dataset.p); };
    $('#promo').onclick = e => { if (e.target.id === 'promo'){ $('#promo').hidden = true; promoResolve(null); } };
  });
}

async function onPlayerMove({ from, to, promo }){
  if (!G || G.over || G.busy) return;
  let promotion;
  if (promo){
    promotion = await askPromotion();
    if (!promotion){ playBoard.setPosition(G.chess, lastMoveObj(), false); return; }
  }
  G.busy = true;
  playBoard.interactive = false;
  applyMove({ from, to, promotion }, 'p');
  await afterMove();
}

function lastMoveObj(){ const m = G.moves[G.moves.length - 1]; return m ? { from: m.from, to: m.to } : null; }

function applyMove(mv, by){
  const fenBefore = G.chess.fen();
  const r = G.chess.move(mv);
  const rec = { uci: r.from + r.to + (r.promotion || ''), san: r.san, by, fenBefore, fenAfter: G.chess.fen(), captured: r.captured || null, from: r.from, to: r.to };
  G.moves.push(rec);
  playBoard.setPosition(G.chess, { from: r.from, to: r.to }, true);
  if (G.chess.inCheck()) sfx('check');
  else if (r.promotion) sfx('promote');
  else if (r.captured) sfx('capture');
  else if (r.san.startsWith('O-O')) sfx('castle');
  else sfx('move');
  renderMoveStrip();
  saveActive();
  if (navigator.vibrate && r.captured) try { navigator.vibrate(8); } catch(_){}
}

async function afterMove(){
  const myId = G.id;
  const c = G.chess;
  if (c.isCheckmate()){
    G.evalW = c.turn() === 'w' ? -10000 : 10000;
    updateEval();
    return finish(c.turn() === G.playerColor ? 'fail' : 'success', c.turn() === G.playerColor ? 'mated' : 'mate');
  }
  if (c.isGameOver()){
    G.evalW = 0; updateEval();
    const reason = c.isStalemate() ? 'stalemate' : c.isThreefoldRepetition() ? 'repetition' : c.isInsufficientMaterial() ? 'insufficient' : 'fifty';
    return finish('draw', reason);
  }
  const playerMoves = G.moves.filter(m => m.by === 'p').length;
  if (playerMoves >= MAX_PLAYER_MOVES) return finish('draw', 'limit');

  const botToMove = c.turn() !== G.playerColor;
  if (botToMove) setStatus('Bot is thinking…', 'thinking');
  const ev = await playEngine.evaluate(c.fen(), botToMove ? 250 : 450);
  if (!G || G.id !== myId || G.over) return;
  G.evalW = scoreToWhiteCp(ev.score, c.turn());
  updateEval();
  saveActive();
  if (botToMove) return botMove();
  if (playerP(G.evalW) >= G.targetP) return finish('success', 'goal');
  yourTurn();
}

async function botMove(){
  const myId = G.id;
  setStatus('Bot is thinking…', 'thinking');
  const L = LEVELS[G.level];
  const t0 = performance.now();
  const res = await playEngine.go(G.chess.fen(), { skill: L.skill, depth: L.depth, movetime: L.movetime, multipv: 1 });
  if (!G || G.id !== myId || G.over) return;
  const wait = 380 - (performance.now() - t0);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  if (!G || G.id !== myId || G.over) return;
  const u = res.best;
  if (!u || u === '(none)'){ return afterMove(); }
  applyMove({ from: u.slice(0,2), to: u.slice(2,4), promotion: u[4] }, 'b');
  await afterMove();
}

function finish(result, reason){
  G.over = true; G.busy = false; G.lastResult = result; G.reason = reason;
  playBoard.interactive = false;
  store.saveActive(null);
  // stats
  stats.completed++;
  const ph = G.phase;
  stats.byPhase[ph] = stats.byPhase[ph] || { p: 0, w: 0 };
  stats.byPhase[ph].p++;
  if (result === 'success'){ stats.success++; stats.streak++; stats.bestStreak = Math.max(stats.bestStreak, stats.streak); stats.byPhase[ph].w++; }
  else { stats.streak = 0; if (result === 'draw') stats.draws++; else stats.failed++; }
  store.saveStats(stats);

  const rec = {
    id: G.id, date: Date.now(), phase: G.phase, level: G.level, startFen: G.startFen, playerColor: G.playerColor,
    moves: G.moves.map(m => ({ uci: m.uci, san: m.san, by: m.by, fenBefore: m.fenBefore, fenAfter: m.fenAfter, captured: m.captured, from: m.from, to: m.to })),
    result, reason, startP: playerP(G.startCpW), targetP: G.targetP, endP: playerP(G.evalW), review: null
  };
  G.recId = rec.id;
  history.unshift(rec);
  store.saveHistory(history);

  updateEval();
  setStatus(result === 'success' ? 'Challenge complete' : result === 'draw' ? 'Draw' : 'Checkmated', 'over');
  sfx(result === 'success' ? 'win' : result === 'draw' ? 'draw' : 'lose');
  showSheet(result);
  runAnalysis(rec);
}

function showSheet(result){
  const icon = $('#res-icon');
  const rec = history.find(h => h.id === G.recId);
  const reason = G.reason;
  let title, sub, cls, svg;
  if (result === 'success'){
    cls = 'win'; title = reason === 'mate' ? 'Checkmate!' : 'Position improved';
    sub = reason === 'mate' ? 'You finished the bot off.' : `${fmtEval(playerP(G.startCpW))} → ${fmtEval(playerP(G.evalW))} for you`;
    svg = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  } else if (result === 'draw'){
    cls = 'draw'; title = 'Draw';
    sub = { stalemate: 'Stalemate.', repetition: 'Threefold repetition.', insufficient: 'Insufficient material.', fifty: '50-move rule.', limit: 'Move limit reached.' }[reason] + ' The eval wasn’t improved.';
    svg = '<svg viewBox="0 0 24 24"><path d="M6 10h12M6 14h12"/></svg>';
  } else {
    cls = 'lose'; title = 'Checkmated'; sub = 'The bot found the mate. Study the review.';
    svg = '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>';
  }
  icon.className = 'res-icon ' + cls; icon.innerHTML = svg;
  $('#res-title').textContent = title;
  $('#res-sub').textContent = sub;
  $('#res-streak').innerHTML = `${FLAME}<span>Streak ${stats.streak}</span><span style="color:var(--muted);font-weight:500">· best ${stats.bestStreak}</span>`;
  const ready = rec && rec.review;
  $('#btn-review').disabled = !ready;
  $('#res-anal').classList.toggle('done', !!ready);
  if (ready) $('#ra-text').textContent = rec.review.accuracy != null ? `Accuracy ${rec.review.accuracy}%` : 'Review ready';
  $('#result-sheet').hidden = false;
}
function hideSheet(){ $('#result-sheet').hidden = true; }

// ================= Analysis =================
const analysisJobs = new Map();
function getAnaEngine(){
  if (!anaEngine){ anaEngine = new Engine(); anaEngine._init = anaEngine.init(); }
  return anaEngine._init.then(() => anaEngine);
}

function runAnalysis(rec){
  if (rec.review) return Promise.resolve(rec.review);
  if (analysisJobs.has(rec.id)) return analysisJobs.get(rec.id).promise;
  const job = { progress: 0, listeners: new Set() };
  job.promise = (async () => {
    const eng = await getAnaEngine();
    eng.newGame();
    const rv = await analyzeGame(eng, rec, p => {
      job.progress = p;
      job.listeners.forEach(fn => fn(p));
      if (G && G.recId === rec.id){
        $('#ra-fill').style.width = (p * 100) + '%';
        $('#ra-text').textContent = `Analyzing game… ${Math.round(p * 100)}%`;
      }
    });
    rec.review = rv;
    // aggregate stats once per game
    if (!rec.counted){
      rec.counted = true;
      for (const m of rv.moves){
        if (m.by !== 'p' || !m.cls) continue;
        stats.classes[m.cls] = (stats.classes[m.cls] || 0) + 1;
        if (m.tag){
          stats.tags[m.tag] = (stats.tags[m.tag] || 0) + 1;
          stats.tagsByPhase[m.tag] = stats.tagsByPhase[m.tag] || {};
          stats.tagsByPhase[m.tag][rec.phase] = (stats.tagsByPhase[m.tag][rec.phase] || 0) + 1;
        }
      }
      store.saveStats(stats);
    }
    store.saveHistory(history);
    if (G && G.recId === rec.id){
      $('#btn-review').disabled = false;
      $('#res-anal').classList.add('done');
      $('#ra-text').textContent = rv.accuracy != null ? `Accuracy ${rv.accuracy}%` : 'Review ready';
    }
    analysisJobs.delete(rec.id);
    return rv;
  })().catch(err => { console.error(err); analysisJobs.delete(rec.id); toast('Analysis failed'); throw err; });
  analysisJobs.set(rec.id, job);
  return job.promise;
}

// ================= Review =================
async function openReview(rec, from){
  R = { rec, from, ply: 0, showBest: true };
  $('#review-sub').textContent = `${PHASES[rec.phase].label} · ${new Date(rec.date).toLocaleDateString()}`;
  $('#review-next').hidden = from === 'stats' && !!G && !G.over;
  show('review');
  reviewBoard.setOrientation(rec.playerColor);
  $('#review-eval').classList.toggle('flip', rec.playerColor === 'b');
  if (!rec.review){
    $('#anal-overlay').hidden = false;
    $('#coach').innerHTML = ''; $('#graph').innerHTML = ''; $('#movelist').innerHTML = '';
    reviewBoard.setBadge(null); reviewBoard.setArrows([]);
    reviewBoard.setPosition(new Chess(rec.startFen), null, false);
    const job = analysisJobs.get(rec.id);
    const onP = p => { $('#ao-fill').style.width = (p * 100) + '%'; $('#ao-text').textContent = `Analyzing… ${Math.round(p * 100)}%`; };
    $('#ao-fill').style.width = '0'; $('#ao-text').textContent = 'Analyzing…';
    try {
      if (job){ job.listeners.add(onP); onP(job.progress); }
      const p = runAnalysis(rec);
      if (!job){ const j = analysisJobs.get(rec.id); if (j) j.listeners.add(onP); }
      await p;
    } catch(_) { $('#anal-overlay').hidden = true; return; }
    $('#anal-overlay').hidden = true;
    if (!R || R.rec !== rec) return;
  }
  R.ply = 0;
  renderGraph();
  renderMoveList();
  renderReviewPly(false);
  layout();
}

function reviewNav(dir){
  if (!R || !R.rec.review) return;
  const n = R.rec.moves.length;
  const old = R.ply;
  if (dir === 'first') R.ply = 0;
  else if (dir === 'prev') R.ply = Math.max(0, R.ply - 1);
  else if (dir === 'next') R.ply = Math.min(n, R.ply + 1);
  else if (dir === 'last') R.ply = n;
  if (R.ply !== old){ renderReviewPly(R.ply === old + 1); }
}

function gotoPly(k, keepScroll = false){ if (!R) return; const anim = k === R.ply + 1; R.ply = k; renderReviewPly(anim, keepScroll); }

function renderReviewPly(animate, keepScroll = false){
  const { rec, ply } = R;
  const rv = rec.review;
  const fen = ply === 0 ? rec.startFen : rec.moves[ply - 1].fenAfter;
  const c = new Chess(fen);
  const mv = ply > 0 ? rec.moves[ply - 1] : null;
  const info = ply > 0 ? rv.moves[ply - 1] : null;
  // board decorations
  if (info && info.by === 'p' && info.cls){
    const C = CLASSES[info.cls];
    reviewBoard.setBadge({ sq: mv.to, sym: C.sym, color: C.color }, C.color);
  } else reviewBoard.setBadge(null, null);
  const arrows = [];
  if (info && info.by === 'p' && R.showBest && info.bestUci && info.bestUci !== info.uci && !['best','great','brilliant','forced'].includes(info.cls)){
    arrows.push({ from: info.bestUci.slice(0,2), to: info.bestUci.slice(2,4), color: 'rgba(124,191,78,.92)' });
  }
  if (ply === 0 || (info && info.by === 'b')){
    // show what the player should play next from here
    const nxt = rv.moves[ply];
    if (ply === 0 && nxt && nxt.by === 'p' && nxt.bestUci && R.showBest === 'hint'){
      arrows.push({ from: nxt.bestUci.slice(0,2), to: nxt.bestUci.slice(2,4), color: 'rgba(124,191,78,.92)' });
    }
  }
  reviewBoard.setPosition(c, mv ? { from: mv.from, to: mv.to } : null, animate);
  reviewBoard.setArrows(arrows);
  if (animate && mv){
    if (c.inCheck()) sfx('check'); else if (mv.captured) sfx('capture'); else sfx('move');
  }
  setEvalBar($('#review-eval'), rv.evals[ply].cpW);
  renderCoach();
  // highlight move list + graph
  $$('#movelist .ml').forEach(b => b.classList.toggle('cur', +b.dataset.ply === ply));
  // keep the coach explanation in view unless the user is browsing the move list
  const panel = $('#review-panel');
  const wide = window.innerWidth >= 900 && window.innerHeight >= 520;
  if (!wide) panel.scrollTo({ top: 0, behavior: settings.anim ? 'smooth' : 'auto' });
  else {
    const cur = $(`#movelist .ml[data-ply="${ply}"]`);
    if (cur){
      const pr = panel.getBoundingClientRect(), cr = cur.getBoundingClientRect();
      if (cr.top < pr.top || cr.bottom > pr.bottom) cur.scrollIntoView({ block: 'nearest' });
    }
  }
  const marker = $('#graph .gmark');
  if (marker){ const n = rec.moves.length; marker.setAttribute('x1', (ply / Math.max(1, n) * 1000).toFixed(1)); marker.setAttribute('x2', (ply / Math.max(1, n) * 1000).toFixed(1)); }
}

function badge(cls, extra = ''){
  const C = CLASSES[cls];
  return `<span class="cbadge ${extra}" style="background:${C.color}">${C.sym}</span>`;
}

function evalFor(rec, cpW){ return fmtEval(cpW); }

function renderCoach(){
  const { rec, ply } = R;
  const rv = rec.review;
  const box = $('#coach');
  if (ply === 0){
    const counts = rv.counts;
    const resCls = rec.result === 'success' ? 'win' : rec.result === 'draw' ? 'draw' : 'lose';
    const resTxt = rec.online ? (rec.result === 'success' ? 'Won' : rec.result === 'draw' ? 'Draw' : 'Lost') : rec.result === 'success' ? (rec.reason === 'mate' ? 'Won by mate' : 'Challenge complete') : rec.result === 'draw' ? 'Draw' : 'Checkmated';
    const keys = rv.turning.map(i => {
      const m = rv.moves[i];
      const d = winProb(rv.evals[i + 1].cpW) - winProb(rv.evals[i].cpW);
      const forMe = rec.playerColor === 'w' ? d : -d;
      return `<button data-ply="${i + 1}">${m.cls ? badge(m.cls) : '<span class="cbadge" style="background:var(--faint)">•</span>'}<span>${moveLabel(rec, i)} ${m.san}${m.by === 'b' ? ` <small style="color:var(--muted)">(${rec.online ? 'opponent' : 'bot'})</small>` : ''}</span><span class="d" style="color:${forMe > 0 ? 'var(--ok)' : 'var(--bad)'}">${forMe > 0 ? '▲' : '▼'} ${fmtEval(rv.evals[i + 1].cpW)}</span></button>`;
    }).join('');
    box.innerHTML = `
      <div class="sum-top">
        <div class="acc"><b>${rv.accuracy != null ? Math.round(rv.accuracy) : '—'}</b><span>Accuracy</span></div>
        <div>
          <span class="res ${resCls}" style="font-size:12px;font-weight:800;padding:3px 8px;border-radius:7px">${resTxt}</span>
          <div class="sum-text" style="margin-top:6px">${rv.summary}</div>
        </div>
      </div>
      <div class="counts">${CLASS_ORDER.map(k => `<div class="cnt ${counts[k] ? '' : 'zero'}">${badge(k)}<span>${CLASSES[k].label}</span><b>${counts[k] || 0}</b></div>`).join('')}</div>
      ${keys ? `<div class="keym"><h4>Turning points</h4>${keys}</div>` : ''}
      <div class="coach-cmp" style="margin-top:14px"><button class="cmp-show" id="start-review" style="background:var(--accent);color:var(--accent-ink)">Start review ▸</button></div>`;
    $('#start-review').onclick = () => reviewNav('next');
    $$('.keym button', box).forEach(b => b.onclick = () => gotoPly(+b.dataset.ply));
    return;
  }
  const m = rv.moves[ply - 1];
  const evAfter = fmtEval(rv.evals[ply].cpW);
  if (m.by === 'b'){
    const dP = (rec.playerColor === 'w' ? 1 : -1) * (rv.evals[ply].cpW - rv.evals[ply - 1].cpW);
    const who = rec.online ? 'Your opponent' : 'The bot';
    const lossForBot = m.loss;
    let note;
    if (lossForBot >= 0.2) note = `${who} blundered here — look for a way to punish it!`;
    else if (lossForBot >= 0.1) note = `${who} made a mistake — there was a chance for you here.`;
    else if (lossForBot >= 0.05) note = `A slightly inaccurate move by ${rec.online ? 'your opponent' : 'the bot'}.`;
    else note = `A solid reply by ${rec.online ? 'your opponent' : 'the bot'}.`;
    const nxt = rv.moves[ply];
    let nextHint = '';
    if (nxt && nxt.by === 'p' && nxt.bestSan) nextHint = `<div class="coach-cmp"><button class="cmp-show" id="hint-btn">Show best reply</button></div>`;
    box.innerHTML = `
      <div class="coach-head"><span class="cbadge" style="background:var(--faint)">${rec.playerColor === 'w' ? 'B' : 'W'}</span>
        <div class="coach-title">${rec.online ? escHtml(rec.opp || 'Opponent') : 'Bot'} played ${m.san}</div><span class="coach-eval">${evAfter}</span></div>
      <div class="coach-text">${note}</div>${nextHint}`;
    const hb = $('#hint-btn');
    if (hb) hb.onclick = () => {
      reviewBoard.setArrows([{ from: nxt.bestUci.slice(0,2), to: nxt.bestUci.slice(2,4), color: 'rgba(124,191,78,.92)' }]);
      hb.textContent = `Best reply: ${nxt.bestSan}`; hb.disabled = true;
    };
    return;
  }
  const C = CLASSES[m.cls];
  const article = ['best'].includes(m.cls) ? 'the best move' : m.cls === 'forced' ? 'forced' : (/^[aeiou]/i.test(C.label) ? 'an ' : 'a ') + C.label.toLowerCase() + (['brilliant','great','excellent','good'].includes(m.cls) ? ' move' : '');
  const showCmp = m.bestSan && m.bestSan !== m.san && m.cls !== 'forced';
  box.innerHTML = `
    <div class="coach-head">${badge(m.cls)}<div class="coach-title">${m.san} is ${article}</div><span class="coach-eval">${evAfter}</span></div>
    <div class="coach-text">${m.text || ''}</div>
    ${showCmp ? `<div class="coach-cmp">
      <div class="cmp"><div class="k">You played</div><div class="v">${m.san}<small>${fmtEval(m.cpAfter)}</small></div></div>
      <div class="cmp best"><div class="k">Best move</div><div class="v">${m.bestSan}<small>${fmtEval(m.cpBefore)}</small></div></div>
      ${m.bestLine && m.bestLine.length > 1 ? `<button class="cmp-show" id="line-btn">Play out best line</button>` : ''}
    </div>` : ''}`;
  const lb = $('#line-btn');
  if (lb) lb.onclick = () => playBestLine(m);
}

async function playBestLine(m){
  const rec = R.rec;
  const start = rec.moves[m.i].fenBefore;
  const c = new Chess(start);
  const ply = R.ply;
  const line = rec.review ? null : null;
  // replay from the position before the move using SAN line
  reviewBoard.setBadge(null, null);
  reviewBoard.setArrows([]);
  reviewBoard.setPosition(c, null, false);
  for (const san of m.bestLine){
    await new Promise(r => setTimeout(r, settings.anim ? 650 : 350));
    if (!R || R.ply !== ply) return;
    let r; try { r = c.move(san); } catch(_) { break; }
    reviewBoard.setPosition(c, { from: r.from, to: r.to }, true);
    sfx(r.captured ? 'capture' : 'move');
  }
  const lb = $('#line-btn');
  if (lb){ lb.textContent = 'Back to game position'; lb.onclick = () => renderReviewPly(false); }
}

function renderGraph(){
  const { rec } = R;
  const ev = rec.review.evals;
  const n = ev.length - 1;
  const W = 1000, H = 100;
  const pts = ev.map((e, i) => {
    let wp = winProb(e.cpW);
    return [(i / Math.max(1, n)) * W, (1 - wp) * H];
  });
  const flipColor = rec.playerColor === 'b';
  const area = `M0,${H} ` + pts.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ` L${W},${H} Z`;
  const dots = rec.review.moves.map((m, i) => {
    if (m.by !== 'p' || !['mistake','blunder','miss','brilliant','great'].includes(m.cls)) return '';
    const p = pts[i + 1];
    return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="${CLASSES[m.cls].color}" stroke="#fff" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`;
  }).join('');
  $('#graph').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" id="graph-svg">
      <rect x="0" y="0" width="${W}" height="${H}" fill="#2c2b29"/>
      <path d="${area}" fill="#f3f1ea"/>
      <line x1="0" y1="${H/2}" x2="${W}" y2="${H/2}" stroke="rgba(128,128,128,.6)" stroke-width="1" vector-effect="non-scaling-stroke"/>
      <line class="gmark" x1="0" y1="0" x2="0" y2="${H}" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      ${dots}
    </svg>`;
  // keep dots round despite preserveAspectRatio=none: draw them in a separate overlay
  const svg = $('#graph-svg');
  svg.onclick = (e) => {
    const r = svg.getBoundingClientRect();
    const k = Math.round((e.clientX - r.left) / r.width * n);
    gotoPly(Math.max(0, Math.min(n, k)), true);
  };
  // overlay for round dots
  $$('#graph-svg circle').forEach(c => c.remove());
  const overlay = el('div');
  overlay.style.cssText = 'position:relative;height:0';
  $('#graph').style.position = 'relative';
  rec.review.moves.forEach((m, i) => {
    if (m.by !== 'p' || !['mistake','blunder','miss','brilliant','great'].includes(m.cls)) return;
    const p = pts[i + 1];
    const d = el('span');
    d.style.cssText = `position:absolute;left:calc(10px + (100% - 20px) * ${p[0] / W});top:calc(10px + 72px * ${p[1] / H});width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;background:${CLASSES[m.cls].color};box-shadow:0 0 0 1.5px #fff;pointer-events:none`;
    $('#graph').appendChild(d);
  });
}

function renderMoveList(){
  const { rec } = R;
  const rv = rec.review;
  const list = $('#movelist');
  list.innerHTML = '';
  const addRowStart = (num) => list.appendChild(el('div', 'no', num));
  const first = rec.moves[0];
  rec.moves.forEach((m, i) => {
    const parts = m.fenBefore.split(' ');
    if (parts[1] === 'w'){ addRowStart(parts[5] + '.'); }
    else if (i === 0){ addRowStart(parts[5] + '.'); list.appendChild(el('div', 'ml empty', '…')); }
    const info = rv.moves[i];
    const b = el('button', 'ml' + (m.by === 'b' ? ' bot' : ''));
    b.dataset.ply = i + 1;
    b.innerHTML = (info.cls ? badge(info.cls) : '') + `<span>${m.san}</span>` + (info.turning ? '<i class="tp" title="Turning point"></i>' : '');
    b.onclick = () => gotoPly(i + 1, true);
    list.appendChild(b);
  });
  if (!rec.moves.length) list.innerHTML = '<div class="empty-note" style="grid-column:1/-1;padding:8px">No moves were played.</div>';
}

// ================= Stats =================
let histShown = 20;
function renderStats(){
  const s = stats;
  const rate = s.completed ? Math.round(s.success / s.completed * 100) : 0;
  const tagRows = Object.entries(s.tags).sort((a,b) => b[1] - a[1]).slice(0, 5);
  const phaseOf = tag => {
    const m = s.tagsByPhase[tag] || {};
    const best = Object.entries(m).sort((a,b) => b[1] - a[1])[0];
    return best ? `mostly in ${PHASES[best[0]].label.toLowerCase()} positions` : '';
  };
  const totalCls = CLASS_ORDER.reduce((a, k) => a + (s.classes[k] || 0), 0);
  const body = $('#stats-body');
  body.innerHTML = `
    <div class="tiles">
      <div class="tile"><div class="n">${s.completed}</div><div class="l">Completed</div></div>
      <div class="tile"><div class="n">${s.completed ? rate + '%' : '—'}</div><div class="l">Success rate</div></div>
      <div class="tile"><div class="n">${FLAME}${s.streak}</div><div class="l">Current streak</div></div>
      <div class="tile"><div class="n">${s.bestStreak}</div><div class="l">Best streak</div></div>
    </div>
    <div class="card">
      <h4 class="sec-h">Success by position type</h4>
      ${['o','m','e','r'].map(k => {
        const p = s.byPhase[k] || { p: 0, w: 0 };
        const pct = p.p ? Math.round(p.w / p.p * 100) : 0;
        return `<div class="bar-row"><span>${PHASES[k].label}</span><span class="bar"><i style="width:${pct}%"></i></span><span class="v">${p.p ? pct + '%' : '—'}</span></div>`;
      }).join('')}
    </div>
    <div class="card">
      <h4 class="sec-h">Most common mistakes</h4>
      ${tagRows.length ? tagRows.map(([t, n], i) => `<div class="mist"><span class="rank">${i + 1}</span><span class="t">${TAGS[t] || t}<small>${phaseOf(t)}</small></span><b>${n}</b></div>`).join('') : '<div class="empty-note">Finish a few challenges and your weak spots will show up here.</div>'}
    </div>
    <div class="card">
      <h4 class="sec-h">Move quality</h4>
      ${totalCls ? CLASS_ORDER.map(k => {
        const n = s.classes[k] || 0; const pct = n / totalCls * 100;
        return `<div class="bar-row"><span style="display:flex;gap:6px;align-items:center">${badge(k)}${CLASSES[k].label}</span><span class="bar"><i style="width:${pct}%;background:${CLASSES[k].color}"></i></span><span class="v">${n}</span></div>`;
      }).join('') : '<div class="empty-note">No analysed moves yet.</div>'}
    </div>
    <div class="card" id="hist-card">
      <h4 class="sec-h">Previous games</h4>
      <div id="hist-list"></div>
    </div>
    <div class="card"><button class="danger" id="reset-stats">Reset statistics & history</button></div>`;
  renderHistoryList();
  const rb = $('#reset-stats');
  rb.onclick = () => {
    if (rb.dataset.armed){ store.resetAll(); stats = store.stats(); history = []; if (G && G.over) G = null; renderStats(); toast('Statistics reset'); }
    else { rb.dataset.armed = '1'; rb.textContent = 'Tap again to confirm reset'; setTimeout(() => { if (rb.isConnected){ delete rb.dataset.armed; rb.textContent = 'Reset statistics & history'; } }, 3000); }
  };
}

function histRow(h){
  const b = el('button', 'hist');
  const resCls = h.result === 'success' ? 'win' : h.result === 'draw' ? 'draw' : 'lose';
  const resTxt = h.result === 'success' ? (h.online ? 'Won' : 'Solved') : h.result === 'draw' ? 'Draw' : 'Lost';
  const mist = h.review ? h.review.moves.filter(m => m.by === 'p' && ['mistake','blunder','miss'].includes(m.cls)).length : null;
  const d = new Date(h.date);
  b.innerHTML = `<div class="mini"></div>
    <div class="info"><div class="a">${PHASES[h.phase].label} <span class="res ${resCls}">${resTxt}</span></div>
    <div class="b">${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${h.online ? 'vs ' + escHtml(h.opp || 'opponent') : LEVELS[h.level].name} · ${h.moves.filter(m => m.by === 'p').length} moves${h.review && h.review.accuracy != null ? ` · ${Math.round(h.review.accuracy)}% acc` : ''}${mist ? ` · ${mist} mistake${mist > 1 ? 's' : ''}` : ''}</div></div>
    <span class="chev"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></span>`;
  const mini = new Board(b.querySelector('.mini'), { draw: false });
  mini.applySettings({ coords: false, anim: false, legal: false, pieces: settings.pieces });
  mini.setOrientation(h.playerColor);
  mini.setPosition(new Chess(h.startFen), null, false);
  b.onclick = () => openReview(h, 'stats');
  return b;
}

function renderHistoryList(){
  const list = $('#hist-list');
  if (!history.length){ list.innerHTML = '<div class="empty-note">Your finished challenges will appear here.</div>'; return; }
  list.innerHTML = '';
  history.slice(0, histShown).forEach(h => list.appendChild(histRow(h)));
  if (history.length > histShown){
    const more = el('button', 'more-btn', `Show more (${history.length - histShown})`);
    more.onclick = () => { histShown += 20; renderHistoryList(); };
    list.appendChild(more);
  }
}

// ================= Settings =================
function renderSettings(){
  const body = $('#settings-body');
  const tog = (key, label, sub) => `<button class="tog ${settings[key] ? 'on' : ''}" data-tog="${key}"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><span class="switch"></span></button>`;
  body.innerHTML = `
    <div class="set-group"><h3>Theme</h3>
      <div class="themes">${THEMES.map(t => `<button class="theme-opt ${settings.theme === t.id ? 'on' : ''}" data-theme="${t.id}">
        <span class="sw" style="background:${t.bg}"><i style="top:10px;background:${t.s}"></i><i style="top:22px;right:30px;background:var(--accent)"></i></span>${t.name}</button>`).join('')}</div>
    </div>
    <div class="set-group"><h3>Background</h3>
      <div class="bg-card">
        <div class="bg-row">
          <div class="bg-prev" id="bg-prev" ${backgroundUrl() ? `style="background-image:url('${backgroundUrl()}')"` : ''}>${backgroundUrl() ? '' : 'None'}</div>
          <div class="bg-btns">
            <label class="btn pri" style="display:grid;place-items:center;cursor:pointer">Choose photo…<input type="file" accept="image/*" id="bg-file" hidden></label>
            <button class="btn sec" id="bg-clear" ${backgroundUrl() ? '' : 'disabled'}>Remove photo</button>
          </div>
        </div>
        <div class="bg-slider"><span>Dim</span><input type="range" min="0" max="90" step="5" id="bg-dim" value="${Math.round(settings.bgDim * 100)}"><span class="v" id="bg-dim-v">${Math.round(settings.bgDim * 100)}%</span></div>
        <button class="tog ${settings.bgBlur ? 'on' : ''}" data-tog="bgBlur" style="padding:0;min-height:40px;border:0"><span>Blur photo</span><span class="switch"></span></button>
      </div>
    </div>
    <div class="set-group"><h3>Board <span style="text-transform:none;letter-spacing:0;font-weight:500">· the app's colours follow your board</span></h3>
      <div class="boards">${BOARDS.map(b => `<button class="board-opt ${settings.boardTheme === b.id ? 'on' : ''}" data-board="${b.id}">
        <span class="bsw">${[0,1,2,3,4,5,6,7].map(i => `<i style="background:${(i + Math.floor(i / 4)) % 2 ? b.d : b.l}"></i>`).join('')}</span>${b.name}</button>`).join('')}</div>
    </div>
    <div class="set-group"><h3>Pieces <span style="text-transform:none;letter-spacing:0;font-weight:500">· ${PIECE_STYLES.length} sets</span></h3>
      <div class="pieces-opts">${PIECE_STYLES.map(p => `<button class="piece-opt ${settings.pieces === p.id ? 'on' : ''}" data-pieces="${p.id}">
        <span class="pv"><span>${pieceSVG('n', 'w', p.id)}</span><span>${pieceSVG('q', 'b', p.id)}</span><span>${pieceSVG('k', 'w', p.id)}</span></span>${p.name}</button>`).join('')}</div>
    </div>
    <div class="set-group"><h3>Gameplay</h3>
      <div class="toggles">
        ${tog('sound', 'Sound effects')}
        ${tog('anim', 'Move animations')}
        <div class="set-row" ${settings.anim ? '' : 'style="opacity:.45;pointer-events:none"'}><span>Animation speed</span><div class="seg small" id="speed-seg">${['fast','normal','slow'].map(v => `<button data-speed="${v}" class="${settings.animSpeed === v ? 'on' : ''}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div></div>
        ${tog('legal', 'Legal-move highlights', 'Dots on squares the selected piece can reach')}
        ${tog('coords', 'Board coordinates')}
        ${tog('evalBar', 'Evaluation bar')}
      </div>
    </div>
    <div class="set-group"><h3>Sound pack <span style="text-transform:none;letter-spacing:0;font-weight:500">· tap to hear it</span></h3>
      <div class="packs">${SOUND_PACKS.map(p => `<button class="pack-opt ${settings.soundPack === p.id ? 'on' : ''}" data-pack="${p.id}">
        <span class="pk-play"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg></span>
        <span class="pk-txt"><b>${p.name}</b><small>${p.desc}</small></span></button>`).join('')}</div>
      <div class="bg-card" style="margin-top:8px;padding:10px 14px">
        <div class="bg-slider"><span>Volume</span><input type="range" min="0" max="100" step="5" id="vol" value="${Math.round((settings.volume == null ? 0.8 : settings.volume) * 100)}"><span class="v" id="vol-v">${Math.round((settings.volume == null ? 0.8 : settings.volume) * 100)}%</span></div>
      </div>
    </div>
    <div class="set-group"><h3>Board controls</h3>
      <div class="card about">
        <b>Move:</b> tap a piece then a square, or drag it.<br>
        <b>Arrows (PC):</b> right-click and drag between squares. Right-click a square to circle it. Left-click the board to clear.<br>
        <b>Colours:</b> hold <span class="kbd">Shift</span><i class="dot-c" style="background:#e5484d"></i>
        <span class="kbd">Ctrl</span><i class="dot-c" style="background:#46a758"></i>
        <span class="kbd">Alt</span><i class="dot-c" style="background:#3e8eed"></i> while drawing (default <i class="dot-c" style="background:#f5a524;margin-left:2px"></i>).
      </div>
    </div>
    <div class="set-group"><h3>About</h3>
      <div class="card about">
        <b>Position Trainer</b> — plays and analyses with <b>Stockfish 18</b> running fully on your device (works offline once loaded).
        <br><br><a href="terms.html">Terms &amp; Conditions</a> · <a href="privacy.html">Privacy Policy</a>
        <br><br>${isStandalone() ? 'Installed as an app ✓' : isIOS() ? 'Tip: in Safari tap <b>Share → Add to Home Screen</b> to install.' : 'Tip: in Chrome or Edge use the <b>Install</b> icon in the address bar to install on your PC.'}
      </div>
    </div>`;
  $('#bg-file').onchange = async e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const blob = await saveBackground(f);
      applyBackgroundBlob(blob);
      toast('Background updated');
    } catch(err){ console.error(err); toast('Could not use that image'); }
    renderSettings();
  };
  $('#bg-clear').onclick = async () => { await clearBackground(); renderSettings(); };
  const vol = $('#vol');
  vol.oninput = () => { settings.volume = +vol.value / 100; $('#vol-v').textContent = vol.value + '%'; setVolume(settings.volume); };
  vol.onchange = () => { store.saveSettings(settings); sfx('move'); };
  const dim = $('#bg-dim');
  dim.oninput = () => {
    settings.bgDim = +dim.value / 100;
    $('#bg-dim-v').textContent = dim.value + '%';
    document.documentElement.style.setProperty('--bg-dim', String(settings.bgDim));
  };
  dim.onchange = () => store.saveSettings(settings);
  body.onclick = e => {
    const b = e.target.closest('button'); if (!b || b.id === 'bg-clear') return;
    sfx('tap');
    if (b.dataset.theme) settings.theme = b.dataset.theme;
    else if (b.dataset.board) settings.boardTheme = b.dataset.board;
    else if (b.dataset.pieces) settings.pieces = b.dataset.pieces;
    else if (b.dataset.tog) settings[b.dataset.tog] = !settings[b.dataset.tog];
    else if (b.dataset.speed) settings.animSpeed = b.dataset.speed;
    else if (b.dataset.pack){ settings.soundPack = b.dataset.pack; if (!settings.sound) settings.sound = true; setSoundPack(settings.soundPack); previewPack(settings.soundPack); }
    else return;
    saveSettings();
    renderSettings();
    renderHeroPreview();
  };
}

// ================= Misc =================
function escHtml(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(msg){
  const t = el('div', 'toast', msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

boot();

// debug hook (used by automated tests; harmless in production)
window.__cpt = { get G(){ return G; }, get R(){ return R; }, get stats(){ return stats; }, get history(){ return history; } };
