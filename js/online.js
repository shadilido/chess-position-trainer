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
        currentUser = u;
        profileCache = null;
        if (u){ try { profileCache = await ensureProfile(u); } catch(e){ console.error(e); } }
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
    name: cleanName(u.displayName) || (u.isAnonymous ? 'Guest' : (u.email || 'Player').split('@')[0]).slice(0, 20),
    rating: 1200, games: 0, wins: 0, losses: 0, draws: 0,
    guest: !!u.isAnonymous, created: F.serverTimestamp()
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
  await F.set(R(`users/${cred.user.uid}`), { name: cleanName(name), rating: 1200, games: 0, wins: 0, losses: 0, draws: 0, guest: false, nameSet: true, created: F.serverTimestamp() });
  return refreshProfile();
}
export async function signIn(email, pass){ await init(); await F.signInWithEmailAndPassword(auth, email.trim(), pass); return refreshProfile(); }
export async function signInGuest(name){
  await init();
  const cred = await F.signInAnonymously(auth);
  const nm = cleanName(name) || 'Guest' + Math.floor(1000 + Math.random() * 9000);
  await F.updateProfile(cred.user, { displayName: nm });
  await F.update(R(`users/${cred.user.uid}`), { name: nm, guest: true, nameSet: true });
  return refreshProfile();
}
export async function signInGoogle(){
  await init();
  const provider = new F.GoogleAuthProvider();
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return F.signInWithRedirect(auth, provider);
  await F.signInWithPopup(auth, provider);
  return refreshProfile();
}
export async function upgradeGuest(email, pass){
  const credential = F.EmailAuthProvider.credential(email.trim(), pass);
  await F.linkWithCredential(currentUser, credential);
  await F.update(R(`users/${currentUser.uid}`), { guest: false });
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
    'auth/credential-already-in-use': 'That email is already used by another account.'
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

async function createGame(gid, a, b, opts){
  // a, b: {uid,name,rating}; random colours
  const [w, bl] = Math.random() < 0.5 ? [a, b] : [b, a];
  const tc = tcById(opts.tc);
  const game = {
    white: w.uid, black: bl.uid, wName: w.name, bName: bl.name, wRating: w.rating, bRating: bl.rating,
    startFen: opts.startFen, mode: opts.mode, tc: { id: tc.id, base: tc.base, inc: tc.inc },
    clock: { w: tc.base, b: tc.base }, created: F.serverTimestamp(), lastMoveAt: F.serverTimestamp(),
    status: 'active', ply: 0
  };
  await F.set(R(`games/${gid}`), game);
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

export function replay(g){
  const c = new Chess(g.startFen);
  const n = g.ply || 0;
  const moves = g.moves || {};
  for (let i = 0; i < n; i++){
    const u = moves[i]; if (!u) break;
    c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
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
  const t = now();
  return F.runTransaction(R(`games/${gid}`), g => {
    if (!g) return null;
    if (g.status !== 'active' || (g.ply || 0) !== ply) return;   // abort: stale
    const mover = sideToMove(g);
    if (colorOf(g, currentUser.uid) !== mover) return;
    g.moves = g.moves || {};
    if ((g.ply || 0) >= 2){
      const left = g.clock[mover] - (t - g.lastMoveAt);
      if (left <= 0){
        const c = replay(g);
        g.status = 'over'; g.result = hasMatingMaterial(c, other(mover)) ? other(mover) : 'd'; g.reason = 'time';
        g.clock[mover] = 0; g.endedAt = t;
        return g;
      }
      g.clock[mover] = left + (g.tc.inc || 0);
    }
    g.moves[g.ply || 0] = uci;
    g.ply = (g.ply || 0) + 1;
    g.lastMoveAt = t;
    if (g.drawOffer && g.drawOffer !== mover) g.drawOffer = null;
    const c = replay(g);
    const end = endState(c);
    if (end){ g.status = 'over'; g.result = end.result; g.reason = end.reason; g.endedAt = t; }
    return g;
  }, { applyLocally: true });
}

async function finish(gid, fn){
  return F.runTransaction(R(`games/${gid}`), g => {
    if (!g) return null;
    if (g.status !== 'active') return;
    const r = fn(g);
    if (!r) return;
    Object.assign(g, r, { endedAt: now() });
    return g;
  });
}
export const resign = gid => finish(gid, g => { const c = colorOf(g, currentUser.uid); return c ? { status: 'over', result: other(c), reason: 'resign' } : null; });
export const acceptDraw = gid => finish(gid, g => { const c = colorOf(g, currentUser.uid); return c && g.drawOffer === other(c) ? { status: 'over', result: 'd', reason: 'agreement' } : null; });
export const claimAbandon = gid => finish(gid, g => { const c = colorOf(g, currentUser.uid); return c ? { status: 'over', result: c, reason: 'abandon' } : null; });
export const abortGame = gid => finish(gid, g => (g.ply || 0) < 2 && colorOf(g, currentUser.uid) ? { status: 'aborted', result: 'x', reason: 'abort' } : null);
export async function claimTimeout(gid){
  const t = now();
  return finish(gid, g => {
    if ((g.ply || 0) < 2){
      // no first move within 30s → abort
      return (t - g.lastMoveAt > 30000) ? { status: 'aborted', result: 'x', reason: 'nomove' } : null;
    }
    const turn = sideToMove(g);
    const left = g.clock[turn] - (t - g.lastMoveAt);
    if (left > 0) return null;
    const c = replay(g);
    return { status: 'over', result: hasMatingMaterial(c, other(turn)) ? other(turn) : 'd', reason: 'time', clock: Object.assign({}, g.clock, { [turn]: 0 }) };
  });
}
export async function offerDraw(gid){
  return F.runTransaction(R(`games/${gid}`), g => {
    if (!g) return null;
    if (g.status !== 'active') return;
    const c = colorOf(g, currentUser.uid); if (!c) return;
    g.drawOffer = c; return g;
  });
}
export async function declineDraw(gid){ return F.update(R(`games/${gid}`), { drawOffer: null }); }

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
    const tc = g.tc;
    await F.set(R(`games/${nextId}`), {
      white: g.black, black: g.white, wName: g.bName, bName: g.wName, wRating: g.bRating, bRating: g.wRating,
      startFen, mode: g.mode, tc, clock: { w: tc.base, b: tc.base }, created: F.serverTimestamp(), lastMoveAt: F.serverTimestamp(),
      status: 'active', ply: 0
    });
  }
}

// Apply my rating change once per game. Returns {before, after}.
export function ratingDelta(g, color){
  const mine = color === 'w' ? g.wRating : g.bRating, opp = color === 'w' ? g.bRating : g.wRating;
  const score = g.result === 'd' ? 0.5 : g.result === color ? 1 : 0;
  const exp = 1 / (1 + Math.pow(10, (opp - mine) / 400));
  const games = (profileCache && profileCache.games) || 0;
  const K = games < 20 ? 40 : 24;
  return Math.round(K * (score - exp));
}
export async function applyResult(gid, g){
  const color = colorOf(g, currentUser.uid);
  if (!color || g.status !== 'over') return null;
  const flag = await F.runTransaction(R(`games/${gid}/applied/${color}`), v => v ? undefined : true);
  if (!flag.committed) return null;
  const d = ratingDelta(g, color);
  const field = g.result === 'd' ? 'draws' : g.result === color ? 'wins' : 'losses';
  await F.runTransaction(R(`users/${currentUser.uid}`), p => {
    if (!p) return p;
    p.rating = Math.max(100, (p.rating || 1200) + d);
    p.games = (p.games || 0) + 1;
    p[field] = (p[field] || 0) + 1;
    return p;
  });
  await refreshProfile();
  return d;
}
