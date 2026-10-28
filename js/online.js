// Online layer: Firebase Auth + Realtime Database.
// Accounts, profiles/ratings, matchmaking queue, friend lobbies with codes, and live games with clocks.
import { firebaseConfig } from './firebase-config.js';
import { Chess } from './vendor/chess.js';

const EMU = /[?&]emu=1\b/.test(location.search);
let F = null;            // firebase module
let app, auth, db;
let serverOffset = 0;
let readyPromise = null;
let currentUser = null;
let profileCache = null;
let bannedFlag = false;
const userListeners = new Set();

export function isConfigured(){ return EMU || !!firebaseConfig; }

export async function init(){
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    if (!isConfigured()) throw new Error('not-configured');
    F = await import('./vendor/firebase.js');
    const cfg = EMU
      ? { apiKey: 'demo-key', authDomain: 'demo-cpt.firebaseapp.com', projectId: 'demo-cpt', databaseURL: 'http://127.0.0.1:5050?ns=demo-cpt' }
      : firebaseConfig;
    app = F.initializeApp(cfg);
    auth = F.getAuth(app);
    db = F.getDatabase(app);
    if (EMU){
      F.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      F.connectDatabaseEmulator(db, '127.0.0.1', 5050);
    }
    F.onValue(F.ref(db, '.info/serverTimeOffset'), s => { serverOffset = s.val() || 0; });
    try { await F.getRedirectResult(auth); } catch(_){}
    await new Promise(res => {
      let first = true;
      F.onAuthStateChanged(auth, async u => {
        if (u && u.isAnonymous){ try { await F.signOut(auth); } catch(_){} u = null; }   // guest accounts were removed
        currentUser = u;
        profileCache = null;
        bannedFlag = false;
        if (u){
          try { profileCache = await ensureProfile(u); } catch(e){ console.error(e); }
          try { bannedFlag = (await F.get(R(`banned/${u.uid}`))).exists(); } catch(_){}
        }
        userListeners.forEach(fn => fn(u, profileCache));
        if (first){ first = false; res(); }
      });
    });
    return true;
  })();
  return readyPromise;
}

export const now = () => Date.now() + serverOffset;
export const user = () => currentUser;
export const profile = () => profileCache;
export const isBanned = () => bannedFlag;
export function onUser(fn){ userListeners.add(fn); return () => userListeners.delete(fn); }

const R = p => F.ref(db, p);
// Attach a listener so the local cache holds the real value before a transaction runs
// (otherwise the first attempt would try to write against an empty cache).
function warm(path){ return new Promise(res => { const off = F.onValue(R(path), () => res(off), () => res(() => {})); }); }

// ---------------- accounts ----------------
async function ensureProfile(u){
  const snap = await F.get(R(`users/${u.uid}`));
  if (snap.exists()){
    const p = snap.val();
    if (u.displayName && p.name !== u.displayName && !p.nameSet) { await F.update(R(`users/${u.uid}`), { name: u.displayName }); p.name = u.displayName; }
    return p;
  }
  const p = {
    name: cleanName(u.displayName) || cleanName((u.email || 'Player').split('@')[0]) || 'Player',
    rating: 1200, games: 0, wins: 0, losses: 0, draws: 0,
    created: F.serverTimestamp()
  };
  await F.set(R(`users/${u.uid}`), p);
  p.created = now();
  return p;
}

export function cleanName(n){ return (n || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20); }

export async function refreshProfile(){
  if (!currentUser) return null;
  const s = await F.get(R(`users/${currentUser.uid}`));
  profileCache = s.val();
  userListeners.forEach(fn => fn(currentUser, profileCache));
  return profileCache;
}

export async function signUp(name, email, pass){
  await init();
  const cred = await F.createUserWithEmailAndPassword(auth, email.trim(), pass);
  await F.updateProfile(cred.user, { displayName: cleanName(name) });
  await F.set(R(`users/${cred.user.uid}`), { name: cleanName(name), rating: 1200, games: 0, wins: 0, losses: 0, draws: 0, nameSet: true, created: F.serverTimestamp() });
  return refreshProfile();
}
export async function signIn(email, pass){ await init(); await F.signInWithEmailAndPassword(auth, email.trim(), pass); return refreshProfile(); }
export async function signInGoogle(){
  await init();
  const provider = new F.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await F.signInWithPopup(auth, provider);
  } catch(e){
    // popups can be blocked (some in-app browsers / home-screen apps): fall back to a full-page redirect
    const c = e && e.code;
    if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment' || c === 'auth/web-storage-unsupported') return F.signInWithRedirect(auth, provider);
    throw e;
  }
  return refreshProfile();
}
export async function resetPassword(email){ await init(); return F.sendPasswordResetEmail(auth, email.trim()); }
export async function logout(){ await init(); return F.signOut(auth); }
export async function setName(name){
  const nm = cleanName(name); if (!nm) return;
  await F.updateProfile(currentUser, { displayName: nm });
  await F.update(R(`users/${currentUser.uid}`), { name: nm, nameSet: true });
  return refreshProfile();
}
export async function deleteAccount(){
  const uid = currentUser.uid;
  await F.remove(R(`users/${uid}`));
  await F.remove(R(`presence/${uid}`));
  await F.deleteUser(currentUser);   // may throw auth/requires-recent-login
}

export function authErrorText(e){
  const c = (e && e.code) || '';
  const map = {
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/missing-password': 'Enter a password.',
    'auth/weak-password': 'Use at least 6 characters for the password.',
    'auth/email-already-in-use': 'An account with that email already exists — sign in instead.',
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'No account with that email.',
    'auth/too-many-requests': 'Too many attempts — wait a minute and try again.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'auth/popup-closed-by-user': 'Google sign-in was closed.',
    'auth/popup-blocked': 'The browser blocked the Google popup. Allow popups and try again.',
    'auth/unauthorized-domain': 'This website isn’t authorised for Google sign-in yet (add it in Firebase → Authentication → Settings → Authorised domains).',
    'auth/operation-not-allowed': 'This sign-in method isn’t switched on in Firebase yet.',
    'auth/requires-recent-login': 'For safety, sign out and sign in again, then delete your account.',
    'auth/credential-already-in-use': 'That email is already used by another account.',
    'auth/account-exists-with-different-credential': 'This email already has an account with a password — sign in with email instead.',
    'auth/cancelled-popup-request': 'Google sign-in was closed.',
    'auth/internal-error': 'Google sign-in failed. Try again, or use email and password.',
    'auth/user-disabled': 'This account has been disabled.',
    'PERMISSION_DENIED': 'Not allowed.'
  };
  return map[c] || (e && e.message) || 'Something went wrong.';
}

// ---------------- presence ----------------
let presenceSet = false;
export function goPresent(){
  if (!currentUser || presenceSet) return;
  presenceSet = true;
  const p = R(`presence/${currentUser.uid}`);
  F.onValue(R('.info/connected'), s => {
    if (s.val() !== true) return;
    try { F.onDisconnect(p).remove(); } catch(_){}
    F.set(p, { at: F.serverTimestamp() });
  });
}
export function watchPresence(uid, cb){
  return F.onValue(R(`presence/${uid}`), s => cb(s.exists()));
}

// ---------------- helpers ----------------
export const TIME_CONTROLS = [
  { id: '3+2', base: 180000, inc: 2000, label: '3 | 2', name: 'Blitz' },
  { id: '5+0', base: 300000, inc: 0, label: '5 min', name: 'Blitz' },
  { id: '10+0', base: 600000, inc: 0, label: '10 min', name: 'Rapid' },
  { id: '15+10', base: 900000, inc: 10000, label: '15 | 10', name: 'Rapid' }
];
export const tcById = id => TIME_CONTROLS.find(t => t.id === id) || TIME_CONTROLS[1];

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(){ let s = ''; for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]; return s; }
export function normCode(c){ return (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1').slice(0, 6); }

function me(){ const p = profileCache || {}; return { uid: currentUser.uid, name: p.name || currentUser.displayName || 'Player', rating: p.rating || 1200 }; }

// names and ratings are copied from the live profiles (the database rules check this)
async function freshPlayer(uid){
  const p = (await F.get(R(`users/${uid}`))).val() || {};
  return { uid, name: p.name || 'Player', rating: p.rating || 1200 };
}
async function writeGame(gid, w, bl, base){
  const [W, B] = await Promise.all([freshPlayer(w), freshPlayer(bl)]);
  const game = Object.assign({}, base, {
    white: W.uid, black: B.uid, wName: W.name, bName: B.name, wRating: W.rating, bRating: B.rating,
    turn: base.startFen.split(' ')[1] === 'b' ? 'b' : 'w',
    clock: { w: base.tc.base, b: base.tc.base }, created: F.serverTimestamp(), lastMoveAt: F.serverTimestamp(),
    status: 'active', ply: 0
  });
  await F.set(R(`games/${gid}`), game);
}
async function createGame(gid, a, b, opts){
  // a, b: {uid,...}; random colours
  const [w, bl] = Math.random() < 0.5 ? [a, b] : [b, a];
  const tc = tcById(opts.tc);
  const base = { startFen: opts.startFen, mode: opts.mode, tc: { id: tc.id, base: tc.base, inc: tc.inc } };
  try { await writeGame(gid, w.uid, bl.uid, base); }
  catch(e){ await writeGame(gid, w.uid, bl.uid, base); }   // a profile changed in between: read again
  return gid;
}

// ---------------- matchmaking ----------------
// Each pool is one queue node. A transaction either claims the closest waiting opponent or adds us.
export function findMatch(opts, onMatched, onError){
  const pool = `${opts.mode}_${opts.tc.replace('+', '-')}`;
  const qref = R(`queue/${pool}`);
  const mine = me();
  const myRef = R(`queue/${pool}/${mine.uid}`);
  let cancelled = false, unsub = null, beat = null;
  const gid = F.push(R('games')).key;
  (async () => {
    let opponent = null;
    try {
      await F.runTransaction(qref, q => {
        q = q || {};
        opponent = null;
        const t = now();
        let best = null;
        for (const [uid, e] of Object.entries(q)){
          if (uid === mine.uid){ continue; }
          if (!e || e.game) continue;
          if (t - (e.ts || 0) > 90000){ delete q[uid]; continue; }
          const d = Math.abs((e.rating || 1200) - mine.rating);
          if (!best || d < best.d) best = { uid, e, d };
        }
        if (best){
          opponent = { uid: best.uid, name: best.e.name, rating: best.e.rating || 1200 };
          q[best.uid] = Object.assign({}, best.e, { game: gid });
          delete q[mine.uid];
        } else {
          q[mine.uid] = { name: mine.name, rating: mine.rating, ts: t };
        }
        return q;
      });
    } catch(e){ onError && onError(e); return; }
    if (cancelled) return;
    if (opponent){
      await createGame(gid, mine, opponent, opts);
      onMatched(gid);
      return;
    }
    try { F.onDisconnect(myRef).remove(); } catch(_){}
    beat = setInterval(() => { if (!cancelled) F.update(myRef, { ts: now() }).catch(() => {}); }, 25000);
    unsub = F.onValue(myRef, async s => {
      const v = s.val();
      if (cancelled || !v || !v.game) return;
      const g = v.game;
      stop();
      F.remove(myRef).catch(() => {});
      // wait for the game record
      const off = F.onValue(R(`games/${g}/status`), st => { if (st.exists()){ off(); onMatched(g); } });
    });
  })();
  function stop(){ cancelled = true; if (unsub) unsub(); if (beat) clearInterval(beat); }
  return () => { stop(); F.runTransaction(myRef, v => (v && v.game) ? v : null).catch(() => {}); };
}

// ---------------- friend lobbies ----------------
export async function createLobby(opts, onGame){
  const mine = me();
  let code = null;
  for (let tries = 0; tries < 6 && !code; tries++){
    const c = newCode();
    const r = await F.runTransaction(R(`lobbies/${c}`), v => {
      if (v) return;  // taken → abort
      return { host: mine.uid, hostName: mine.name, hostRating: mine.rating, mode: opts.mode, tc: opts.tc, created: now() };
    });
    if (r.committed) code = c;
  }
  if (!code) throw new Error('Could not create a lobby, try again.');
  const lref = R(`lobbies/${code}`);
  try { F.onDisconnect(lref).remove(); } catch(_){}
  let done = false;
  const unsub = F.onValue(lref, async s => {
    const v = s.val();
    if (done || !v || !v.guest || v.game) return;
    done = true;
    const gid = F.push(R('games')).key;
    await createGame(gid, mine, { uid: v.guest, name: v.guestName, rating: v.guestRating || 1200 }, { mode: v.mode, tc: v.tc, startFen: opts.startFen });
    await F.update(lref, { game: gid });
    unsub();
    setTimeout(() => F.remove(lref).catch(() => {}), 15000);
    onGame(gid);
  });
  return { code, cancel: () => { done = true; unsub(); F.remove(lref).catch(() => {}); } };
}

export async function joinLobby(code, onGame){
  code = normCode(code);
  const mine = me();
  let why = null;
  const unwarm = await warm(`lobbies/${code}`);
  const r = await F.runTransaction(R(`lobbies/${code}`), v => {
    why = null;
    if (!v) return null;   // not cached yet → the server will retry us with the real value if it exists
    if (v.host === mine.uid){ why = 'own'; return; }
    if (v.guest && v.guest !== mine.uid){ why = 'full'; return; }
    v.guest = mine.uid; v.guestName = mine.name; v.guestRating = mine.rating;
    return v;
  });
  unwarm();
  if (r.committed && !r.snapshot.exists()) why = 'notfound';
  if (!r.committed || why){
    throw new Error(why === 'own' ? 'That’s your own lobby — send the code to a friend.' : why === 'full' ? 'That lobby already has two players.' : 'No lobby with that code. Check it and try again.');
  }
  const info = r.snapshot.val();
  let done = false;
  const unsub = F.onValue(R(`lobbies/${code}/game`), s => {
    if (done || !s.exists()) return;
    done = true; unsub();
    const g = s.val();
    const off = F.onValue(R(`games/${g}/status`), st => { if (st.exists()){ off(); onGame(g); } });
  });
  return { info, cancel: () => { done = true; unsub(); F.runTransaction(R(`lobbies/${code}`), v => { if (v && v.guest === mine.uid && !v.game){ delete v.guest; delete v.guestName; delete v.guestRating; } return v; }).catch(() => {}); } };
}

// ---------------- games ----------------
export function watchGame(gid, cb){ return F.onValue(R(`games/${gid}`), s => cb(s.val())); }
export async function getGame(gid){ return (await F.get(R(`games/${gid}`))).val(); }

// Replays the game. Stops at the first illegal move and records where (c.illegalAt).
export function replay(g){
  const c = new Chess(g.startFen);
  const n = g.ply || 0;
  const moves = g.moves || {};
  c.illegalAt = null;
  for (let i = 0; i < n; i++){
    const u = moves[i];
    let ok = null;
    try { ok = u ? c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }) : null; } catch(_){ ok = null; }
    if (!ok){ c.illegalAt = i; break; }
  }
  return c;
}
export const colorOf = (g, uid) => g.white === uid ? 'w' : g.black === uid ? 'b' : null;
const other = c => c === 'w' ? 'b' : 'w';

// Remaining time (ms) for each side right now.
export function clocks(g, t = now()){
  const c = { w: g.clock.w, b: g.clock.b };
  if (g.status === 'active' && (g.ply || 0) >= 2){
    const turn = sideToMove(g);
    c[turn] = Math.max(0, c[turn] - (t - g.lastMoveAt));
  }
  return c;
}
export function sideToMove(g){
  if (g.turn === 'w' || g.turn === 'b') return g.turn;
  const first = g.startFen.split(' ')[1];
  return (g.ply || 0) % 2 === 0 ? first : other(first);
}
function hasMatingMaterial(chess, color){
  for (const row of chess.board()) for (const p of row){
    if (p && p.color === color && p.type !== 'k') return true;
  }
  return false;
}
function endState(c){
  if (c.isCheckmate()) return { result: c.turn() === 'w' ? 'b' : 'w', reason: 'mate' };
  if (c.isStalemate()) return { result: 'd', reason: 'stalemate' };
  if (c.isInsufficientMaterial()) return { result: 'd', reason: 'insufficient' };
  if (c.isThreefoldRepetition()) return { result: 'd', reason: 'repetition' };
  if (c.isDrawByFiftyMoves()) return { result: 'd', reason: 'fifty' };
  return null;
}

export async function sendMove(gid, ply, uci){
  const uid = currentUser.uid;
  return F.runTransaction(R(`games/${gid}`), g => {
    if (!g) return null;
    if (g.status !== 'active' || (g.ply || 0) !== ply) return;   // abort: stale
    const t = now();
    const mover = sideToMove(g);
    if (colorOf(g, uid) !== mover) return;
    g.moves = g.moves || {};
    if ((g.ply || 0) >= 2){
      const left = g.clock[mover] - (t - g.lastMoveAt);
      if (left <= 0){
        // my own flag fell: I can only record the loss (a draw claim must come from the opponent)
        const c = replay(g);
        if (!hasMatingMaterial(c, other(mover))) return;
        Object.assign(g, { status: 'over', result: other(mover), reason: 'time', endBy: uid, endedAt: t });
        g.clock[mover] = 0;
        return g;
      }
      g.clock[mover] = Math.round(left + (g.tc.inc || 0));
    }
    g.moves[g.ply || 0] = uci;
    g.ply = (g.ply || 0) + 1;
    g.turn = other(mover);
    g.lastMoveAt = t;
    if (g.drawOffer && g.drawOffer !== mover) g.drawOffer = null;
    const c = replay(g);
    const end = endState(c);
    if (end){ Object.assign(g, { status: 'over', result: end.result, reason: end.reason, endBy: uid, endedAt: t }); }
    return g;
  }, { applyLocally: true });
}

async function finish(gid, fn){
  const uid = currentUser.uid;
  return F.runTransaction(R(`games/${gid}`), g => {
    if (!g) return null;
    if (g.status !== 'active') return;
    const r = fn(g);
    if (!r) return;
    Object.assign(g, r, { endBy: uid, endedAt: now() });
    return g;
  });
}
export const resign = gid => finish(gid, g => { const c = colorOf(g, currentUser.uid); return c ? { status: 'over', result: other(c), reason: 'resign' } : null; });
export const acceptDraw = gid => finish(gid, g => { const c = colorOf(g, currentUser.uid); return c && g.drawOffer === other(c) ? { status: 'over', result: 'd', reason: 'agreement' } : null; });
export const claimAbandon = gid => finish(gid, g => { const c = colorOf(g, currentUser.uid); return c ? { status: 'over', result: c, reason: 'abandon' } : null; });
export const abortGame = gid => finish(gid, g => (g.ply || 0) < 2 && colorOf(g, currentUser.uid) ? { status: 'aborted', result: 'x', reason: 'abort' } : null);
export async function claimTimeout(gid){
  return finish(gid, g => {
    const t = now();
    if ((g.ply || 0) < 2){
      // no first move within 30s → abort
      return (t - g.lastMoveAt > 30000) ? { status: 'aborted', result: 'x', reason: 'nomove' } : null;
    }
    const turn = sideToMove(g);
    const left = g.clock[turn] - (t - g.lastMoveAt);
    if (left > 0) return null;
    const c = replay(g);
    const result = hasMatingMaterial(c, other(turn)) ? other(turn) : 'd';
    if (result === 'd' && colorOf(g, currentUser.uid) === turn) return null;   // only the opponent may record a draw on time
    return { status: 'over', result, reason: 'time', clock: Object.assign({}, g.clock, { [turn]: 0 }) };
  });
}
// opponent made an illegal move (only possible with a modified app): the honest side wins, the game is checked
export const claimIllegal = gid => finish(gid, g => { const c = colorOf(g, currentUser.uid); return c ? { status: 'over', result: c, reason: 'illegal' } : null; });
export async function offerDraw(gid){
  return F.runTransaction(R(`games/${gid}`), g => {
    if (!g) return null;
    if (g.status !== 'active') return;
    const c = colorOf(g, currentUser.uid); if (!c) return;
    g.drawOffer = c; return g;
  });
}
export async function declineDraw(gid){
  return F.runTransaction(R(`games/${gid}`), g => {
    if (!g) return null;
    if (g.status !== 'active' || !g.drawOffer) return;
    g.drawOffer = null; return g;
  });
}

// Rematch: both players ask; the second one creates the next game (colours swap, fresh position).
export async function requestRematch(gid, startFen){
  const uid = currentUser.uid;
  let create = null;
  const nextId = F.push(R('games')).key;
  await F.runTransaction(R(`games/${gid}`), g => {
    create = null;
    if (!g) return null;
    if (g.next) return;
    const c = colorOf(g, uid); if (!c) return;
    g.rematch = g.rematch || {};
    g.rematch[c] = true;
    if (g.rematch.w && g.rematch.b){ g.next = nextId; create = g; }
    return g;
  });
  if (create){
    const g = create;
    const base = { startFen, mode: g.mode, tc: { id: g.tc.id, base: g.tc.base, inc: g.tc.inc || 0 } };
    // ratings may have just changed from the previous game: give the result a moment to land
    for (let i = 0; i < 3; i++){
      try { await writeGame(nextId, g.black, g.white, base); break; }
      catch(e){ if (i === 2) throw e; await new Promise(r => setTimeout(r, 800)); }
    }
  }
}

// Elo change for `color` in game g (K = 40 for a player's first 20 games, then 24).
export function ratingDelta(g, color, games){
  const mine = color === 'w' ? g.wRating : g.bRating, opp = color === 'w' ? g.bRating : g.wRating;
  const score = g.result === 'd' ? 0.5 : g.result === color ? 1 : 0;
  const exp = 1 / (1 + Math.pow(10, (opp - mine) / 400));
  if (games == null) games = (profileCache && profileCache.games) || 0;
  const K = games < 20 ? 40 : 24;
  return Math.max(-40, Math.min(40, Math.round(K * (score - exp))));
}
const SELF_EVIDENT = { resign: 1, agreement: 1, time: 1, abandon: 1 };
// A result counts once it can't have been faked: either the rules checked it when it was written,
// or the player who did NOT end the game confirmed it (their app re-checked every move), or 10 quiet minutes passed.
export function isVerified(g){
  if (!g || g.status !== 'over') return false;
  if (g.disputed) return false;
  if (SELF_EVIDENT[g.reason]) return true;
  const other = g.endBy === g.white ? g.black : g.endBy === g.black ? g.white : null;
  if (other && g.ack && g.ack[other]) return true;
  return g.endedAt && now() - g.endedAt > 605000;
}
export const isDisputed = g => !!(g && g.disputed);

// Called by the player who did NOT end the game: re-check the whole game, then confirm or dispute it.
export async function confirmOrDispute(gid, g){
  const uid = currentUser.uid;
  if (!g || g.status !== 'over' || !colorOf(g, uid) || g.endBy === uid) return null;
  if ((g.ack && g.ack[uid]) || (g.disputed && g.disputed[uid])) return null;
  if (SELF_EVIDENT[g.reason]) return 'ok';
  const me = colorOf(g, uid);
  const check = gg => {
    const c = replay(gg);
    // "illegal move" claims are true only if the stored game really has an illegal move made by me
    // (replay stops right before it, so the side to move is whoever tried it)
    if (gg.reason === 'illegal') return c.illegalAt != null && c.turn() === me ? null : 'false-illegal-claim';
    if (c.illegalAt != null) return 'illegal-move';
    const end = endState(c);
    return (!end || end.reason !== gg.reason || end.result !== gg.result) ? 'false-result' : null;
  };
  let problem = check(g);
  // never accuse anyone on a half-synced snapshot: re-read the game (twice) before disputing
  for (let i = 0; i < 2 && problem; i++){
    await new Promise(r => setTimeout(r, 1200));
    const fresh = await getGame(gid).catch(() => null);
    if (fresh && fresh.status === 'over'){ g = fresh; problem = check(g); }
  }
  if (!problem){ await F.set(R(`games/${gid}/ack/${uid}`), true); return 'ok'; }
  await F.set(R(`games/${gid}/disputed/${uid}`), problem);
  const against = g.endBy;
  if (against) await reportPlayer(gid, against, 'auto:' + problem).catch(() => {});
  return problem;
}

// Applies both players' rating changes (the rules let either player do it, each exactly once),
// so a loss can't be dodged by closing the app. Returns my delta, or null if not (yet) applicable.
export async function applyResults(gid){
  if (!currentUser) return null;
  const g = await getGame(gid);
  if (!g || !isVerified(g)) return null;
  const mine = colorOf(g, currentUser.uid);
  let myDelta = null;
  for (const color of ['w', 'b']){
    const uid = color === 'w' ? g.white : g.black;
    if (g.applied && g.applied[uid]) continue;
    for (let attempt = 0; attempt < 3; attempt++){
      const p = (await F.get(R(`users/${uid}`))).val();
      if (!p) break;
      const d = ratingDelta(g, color, p.games || 0);
      const field = g.result === 'd' ? 'draws' : g.result === color ? 'wins' : 'losses';
      const np = Object.assign({}, p, { rating: Math.max(100, (p.rating || 1200) + d), games: (p.games || 0) + 1, last: gid });
      np[field] = (p[field] || 0) + 1;
      try {
        await F.update(R('/'), { [`users/${uid}`]: np, [`games/${gid}/applied/${uid}`]: true });
        if (color === mine) myDelta = np.rating - (p.rating || 1200);
        break;
      } catch(e){
        const done = (await F.get(R(`games/${gid}/applied/${uid}`))).exists();
        if (done) break;
        await new Promise(r => setTimeout(r, 400 + Math.random() * 600));
      }
    }
  }
  forgetPending(gid);
  await refreshProfile();
  return myDelta;
}
// games whose rating couldn't be applied yet (waiting for confirmation): retried on the next start
const PKEY = 'cpt.pendingRatings';
function pendingList(){ try { return JSON.parse(localStorage.getItem(PKEY) || '[]'); } catch(_){ return []; } }
export function rememberPending(gid){ try { const l = pendingList().filter(x => x !== gid); l.push(gid); localStorage.setItem(PKEY, JSON.stringify(l.slice(-20))); } catch(_){} }
function forgetPending(gid){ try { localStorage.setItem(PKEY, JSON.stringify(pendingList().filter(x => x !== gid))); } catch(_){} }
export async function retryPending(){
  for (const gid of pendingList()){
    try {
      const g = await getGame(gid);
      if (!g || g.disputed || g.status !== 'over' || (g.applied && g.applied[g.white] && g.applied[g.black])) { forgetPending(gid); continue; }
      await confirmOrDispute(gid, g);
      await applyResults(gid);
    } catch(_){}
  }
}

// ---------------- fair play ----------------
export async function sendFocus(gid, color, f){
  try { await F.set(R(`games/${gid}/focus/${color}`), { n: f.n | 0, ms: Math.round(f.ms) }); } catch(_){}
}
export async function submitFairPlay(gid, oppUid, s){
  return F.set(R(`fairplay/${oppUid}/${gid}`), {
    by: currentUser.uid, n: s.n, match: s.match, acpl: s.acpl, away: s.away || 0, flag: !!s.flag, at: F.serverTimestamp()
  });
}
// How often other players' apps flagged this account (counts distinct reporters, so one person can't brand someone)
export async function fairPlaySummary(uid){
  try {
    const v = (await F.get(R(`fairplay/${uid}`))).val() || {};
    const rows = Object.values(v);
    const flagged = rows.filter(r => r && r.flag);
    return { games: rows.length, flagged: flagged.length, reporters: new Set(flagged.map(r => r.by)).size };
  } catch(_){ return { games: 0, flagged: 0, reporters: 0 }; }
}
export async function reportPlayer(gid, against, reason, note){
  const r = F.push(R('reports'));
  const v = { by: currentUser.uid, against, gid, reason: String(reason).slice(0, 40), at: F.serverTimestamp() };
  if (note) v.note = String(note).slice(0, 300);
  await F.set(r, v);
}
