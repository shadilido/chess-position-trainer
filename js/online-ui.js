// Online screens: sign-in, account, matchmaking / friend lobby hub, live 1v1 game.
import * as ON from './online.js';
import { Chess } from './vendor/chess.js';
import { Board } from './board.js';
import { pieceSVG } from './pieces.js';
import { play as sfx } from './sound.js';
import { loadPositions, pickPosition } from './positions.js';
import { el } from './util.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let D = null;                 // deps from app.js
let afterLogin = null;        // action to run once signed in
let matchBoard = null;
let M = null;                 // live match state
let searchCancel = null, lobbyCancel = null, joinCancel = null, searchTimer = null;
const pref = { mode: 'random', tc: '5+0' };

const ICON = {
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z"/></svg>',
  friends: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.8"/><path d="M16.5 14.2c3 .2 5 2.3 5 5.3"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
  half: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" class="fill"/></svg>'
};

export function initOnline(deps){
  D = deps;
  // home buttons
  $('#btn-account').addEventListener('click', () => openAccount());
  $('#btn-find').addEventListener('click', () => openHub('match'));
  $('#btn-friend').addEventListener('click', () => openHub('friend'));
  $('#btn-return').addEventListener('click', () => { if (M) D.show('match'); });
  bindAuth();
  bindHub();
  bindMatch();
  // invite links: #join=CODE
  const m = location.hash.match(/join=([A-Za-z0-9]{4,8})/);
  if (m){
    history.replaceState(null, '', location.pathname + location.search);
    const code = ON.normCode(m[1]);
    setTimeout(() => openHub('friend', code), 300);
  }
  if (ON.isConfigured()){
    ON.init().then(() => {
      ON.onUser(() => renderHomeOnline());
      renderHomeOnline();
      if (ON.user()) ON.goPresent();
    }).catch(err => console.warn('online init failed', err));
  }
  renderHomeOnline();
}

// ======================= home =======================
export function renderHomeOnline(){
  const btn = $('#btn-account');
  const u = ON.isConfigured() && ON.user && ON.user();
  const p = ON.profile && ON.profile();
  if (u && p){
    btn.innerHTML = `<span class="av sm">${initial(p.name)}</span>`;
    btn.title = p.name;
    $('#oc-sub').textContent = `${p.name} · rating ${p.rating}`;
  } else {
    btn.innerHTML = ICON.user;
    btn.title = 'Sign in';
    $('#oc-sub').textContent = '1v1 against real players';
  }
  $('#btn-return').hidden = !(M && M.g && M.g.status === 'active');
}
const initial = n => ((n || '?').trim()[0] || '?').toUpperCase();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function needUser(next){
  if (!ON.isConfigured()){ D.show('online'); renderHub(); return false; }
  try { await ON.init(); } catch(e){ D.toast('Could not reach the server'); return false; }
  if (!ON.user()){ afterLogin = next; openAuth(); return false; }
  ON.goPresent();
  return true;
}

// ======================= auth =======================
let authTab = 'in';
function openAuth(tab = 'in'){
  authTab = tab;
  D.show('auth');
  renderAuth();
}
function renderAuth(){
  $$('#auth-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === authTab));
  const up = authTab === 'up';
  $('#fld-name').hidden = !up;
  $('#fld-agree').hidden = !up;
  $('#au-forgot').hidden = up;
  $('#au-submit').textContent = up ? 'Create account' : 'Sign in';
  $('#au-pass').setAttribute('autocomplete', up ? 'new-password' : 'current-password');
  $('#auth-title').textContent = up ? 'Create your account' : 'Sign in to play online';
  $('#au-err').textContent = '';
}
function authBusy(b){ $$('#scr-auth button, #scr-auth input').forEach(x => x.disabled = b); $('#scr-auth').classList.toggle('busy', b); }
function authErr(e){ $('#au-err').textContent = typeof e === 'string' ? e : ON.authErrorText(e); }
async function authDone(){
  authBusy(false);
  ON.goPresent();
  renderHomeOnline();
  sfx('tap');
  const p = ON.profile();
  D.toast(`Signed in as ${p ? p.name : 'player'}`);
  const next = afterLogin; afterLogin = null;
  if (next) next(); else D.show('home');
}
function bindAuth(){
  $('#auth-back').addEventListener('click', () => { afterLogin = null; D.show('home'); });
  $('#auth-tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; authTab = b.dataset.t; renderAuth(); });
  $('#auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#au-name').value, email = $('#au-email').value, pass = $('#au-pass').value;
    if (authTab === 'up'){
      if (!ON.cleanName(name)) return authErr('Pick a display name.');
      if (!$('#au-agree').checked) return authErr('Please accept the Terms and Privacy Policy.');
    }
    if (!email) return authErr('Enter your email.');
    authBusy(true);
    try {
      if (authTab === 'up') await ON.signUp(name, email, pass); else await ON.signIn(email, pass);
      await authDone();
    } catch(err){ authBusy(false); authErr(err); }
  });
  $('#au-forgot').addEventListener('click', async () => {
    const email = $('#au-email').value;
    if (!email) return authErr('Type your email above first, then tap “Forgot password?”.');
    try { await ON.resetPassword(email); $('#au-err').textContent = ''; D.toast('Password reset email sent'); } catch(err){ authErr(err); }
  });
  $('#au-google').addEventListener('click', async () => {
    authBusy(true);
    try { await ON.signInGoogle(); if (ON.user()) await authDone(); } catch(err){ authBusy(false); authErr(err); }
  });
  $('#au-guest').addEventListener('click', async () => {
    authBusy(true);
    try { await ON.signInGuest($('#au-name').value); await authDone(); } catch(err){ authBusy(false); authErr(err); }
  });
}

// ======================= account =======================
async function openAccount(){
  if (!ON.isConfigured()){ D.show('online'); renderHub(); return; }
  try { await ON.init(); } catch(_){ D.toast('Could not reach the server'); return; }
  if (!ON.user()){ afterLogin = () => openAccount(); openAuth(); return; }
  D.show('account');
  renderAccount();
}
function renderAccount(){
  const u = ON.user(), p = ON.profile() || {};
  const body = $('#account-body');
  const guest = u.isAnonymous;
  body.innerHTML = `
    <div class="card acc-card">
      <span class="av lg">${initial(p.name)}</span>
      <div class="acc-id"><b>${esc(p.name)}</b><span>${guest ? 'Guest account' : esc(u.email || 'Google account')}</span></div>
    </div>
    <div class="tiles">
      <div class="tile"><div class="n">${p.rating || 1200}</div><div class="l">Rating</div></div>
      <div class="tile"><div class="n">${p.games || 0}</div><div class="l">Online games</div></div>
      <div class="tile"><div class="n">${p.wins || 0}<small style="font-size:14px;color:var(--muted);font-weight:700"> / ${p.draws || 0} / ${p.losses || 0}</small></div><div class="l">Won / drawn / lost</div></div>
      <div class="tile"><div class="n">${p.games ? Math.round(((p.wins || 0) + 0.5 * (p.draws || 0)) / p.games * 100) + '%' : '—'}</div><div class="l">Score</div></div>
    </div>
    <div class="card">
      <h4 class="sec-h">Display name</h4>
      <div class="join-row"><input id="acc-name" maxlength="20" value="${esc(p.name)}"><button class="btn sec" id="acc-name-save">Save</button></div>
    </div>
    ${guest ? `<div class="card">
      <h4 class="sec-h">Keep your progress</h4>
      <p class="about" style="margin:0 0 10px">Guest accounts are lost if you sign out or clear this browser. Add an email and password to keep your rating.</p>
      <form id="acc-upgrade" class="fld-col">
        <input id="up-email" type="email" placeholder="Email" autocomplete="email">
        <input id="up-pass" type="password" placeholder="Password (6+ characters)" autocomplete="new-password">
        <label class="chk"><input type="checkbox" id="up-agree"> <span>I agree to the <a href="terms.html" target="_blank">Terms</a> and <a href="privacy.html" target="_blank">Privacy Policy</a></span></label>
        <div class="au-err" id="up-err"></div>
        <button class="btn pri wide" type="submit">Save account</button>
      </form></div>` : ''}
    <div class="card acc-actions">
      <button class="btn sec wide" id="acc-signout">Sign out</button>
      <button class="danger" id="acc-delete">Delete account</button>
    </div>
    <p class="legal"><a href="terms.html">Terms &amp; Conditions</a> · <a href="privacy.html">Privacy Policy</a></p>`;
  $('#acc-name-save').onclick = async () => {
    try { await ON.setName($('#acc-name').value); D.toast('Name saved'); renderAccount(); renderHomeOnline(); } catch(e){ D.toast(ON.authErrorText(e)); }
  };
  const up = $('#acc-upgrade');
  if (up) up.onsubmit = async e => {
    e.preventDefault();
    if (!$('#up-agree').checked){ $('#up-err').textContent = 'Please accept the Terms and Privacy Policy.'; return; }
    try { await ON.upgradeGuest($('#up-email').value, $('#up-pass').value); D.toast('Account saved'); renderAccount(); }
    catch(err){ $('#up-err').textContent = ON.authErrorText(err); }
  };
  $('#acc-signout').onclick = async () => {
    if (guest && !$('#acc-signout').dataset.armed){ $('#acc-signout').dataset.armed = 1; $('#acc-signout').textContent = 'Guest progress will be lost — tap again'; return; }
    await ON.logout(); renderHomeOnline(); D.show('home'); D.toast('Signed out');
  };
  const del = $('#acc-delete');
  del.onclick = async () => {
    if (!del.dataset.armed){ del.dataset.armed = 1; del.textContent = 'Tap again to permanently delete your account'; setTimeout(() => { if (del.isConnected){ delete del.dataset.armed; del.textContent = 'Delete account'; } }, 4000); return; }
    try { await ON.deleteAccount(); renderHomeOnline(); D.show('home'); D.toast('Account deleted'); }
    catch(e){ D.toast(ON.authErrorText(e)); }
  };
}

// ======================= hub (matchmaking + friends) =======================
let hubTab = 'match';
async function openHub(tab, joinCode){
  hubTab = tab;
  if (!ON.isConfigured()){ D.show('online'); renderHub(); return; }
  const ok = await needUser(() => openHub(tab, joinCode));
  if (!ok) return;
  D.show('online');
  renderHub();
  if (joinCode){ $('#on-code').value = joinCode; doJoin(); }
}
function renderHub(){
  const body = $('#online-body');
  if (!ON.isConfigured()){
    body.innerHTML = `<div class="card notice">
      <h4 class="sec-h">Online play isn’t switched on yet</h4>
      <p class="about">This copy of the app isn’t connected to a server yet. The owner needs to connect a free Firebase project. It takes about 5 minutes: see <b>SETUP-ONLINE.md</b> in the GitHub repository.</p>
      <p class="about">You can still train against the bot offline.</p></div>`;
    return;
  }
  const p = ON.profile() || {};
  body.innerHTML = `
    <button class="card me-card" id="on-me"><span class="av">${initial(p.name)}</span><span class="me-txt"><b>${esc(p.name)}</b><small>Rating ${p.rating || 1200} · ${p.games || 0} games</small></span><span class="chev"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></span></button>
    <div class="field"><div class="field-label">Time control</div>
      <div class="tcs" id="on-tc">${ON.TIME_CONTROLS.map(t => `<button data-tc="${t.id}"><b>${t.label}</b><small>${t.name}</small></button>`).join('')}</div></div>
    <div class="card on-block ${hubTab === 'match' ? 'focus' : ''}" id="on-quick">
      <div class="ob-head"><span class="ob-ic">${ICON.globe}</span><div><h4>Quick match</h4><p>Get paired with a player near your rating. Every game starts from a random position.</p></div></div>
      <button class="btn pri wide" id="on-find">Find match</button>
      <div class="searching" id="on-searching" hidden><div class="spinner"></div><span id="on-search-t">Searching…</span><button class="btn sec" id="on-cancel">Cancel</button></div>
    </div>
    <div class="card on-block ${hubTab === 'friend' ? 'focus' : ''}" id="on-friend">
      <div class="ob-head"><span class="ob-ic">${ICON.friends}</span><div><h4>Play a friend</h4><p>Create a lobby and send the code, or join with a friend’s code.</p></div></div>
      <button class="btn sec wide" id="on-create">Create lobby</button>
      <div class="lobby" id="on-lobby" hidden>
        <div class="lb-label">Your lobby code</div>
        <div class="lb-code" id="lb-code"></div>
        <div class="lb-btns"><button class="btn sec" id="lb-copy">${ICON.copy}<span>Copy link</span></button><button class="btn sec" id="lb-share">${ICON.share}<span>Share</span></button></div>
        <div class="lb-wait"><div class="spinner"></div><span>Waiting for your friend to join…</span></div>
        <button class="link" id="lb-cancel">Close lobby</button>
      </div>
      <div class="or"><span>or join</span></div>
      <form class="join-row" id="on-join-form"><input id="on-code" placeholder="CODE" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn pri" id="on-join" type="submit">Join</button></form>
      <div class="au-err" id="on-join-err"></div>
    </div>`;
  const syncChoices = () => {
    $$('#on-tc button').forEach(b => b.classList.toggle('on', b.dataset.tc === pref.tc));
  };
  syncChoices();
  $('#on-me').onclick = () => openAccount();
  $('#on-tc').onclick = e => { const b = e.target.closest('button'); if (!b || searchCancel || lobbyCancel) return; pref.tc = b.dataset.tc; syncChoices(); };
  $('#on-find').onclick = startSearch;
  $('#on-cancel').onclick = stopSearch;
  $('#on-create').onclick = startLobby;
  $('#lb-cancel').onclick = stopLobby;
  $('#on-join-form').onsubmit = e => { e.preventDefault(); doJoin(); };
  $('#on-code').oninput = e => { e.target.value = ON.normCode(e.target.value); };
}
function bindHub(){
  $('#online-back').addEventListener('click', () => { stopSearch(); stopLobby(); D.show('home'); });
}
async function startFenFor(){
  // every online game starts from a random, balanced, legal position
  await loadPositions();
  // balanced positions only for fairness (|eval| small)
  for (let i = 0; i < 30; i++){
    const p = pickPosition(Math.random() < 0.5 ? 'o' : 'm', []);
    if (Math.abs(p.cp) <= 60) return p.fen;
  }
  return pickPosition('o', []).fen;
}
async function startSearch(){
  stopLobby();
  $('#on-find').hidden = true; $('#on-searching').hidden = false;
  const t0 = Date.now();
  searchTimer = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    const el2 = $('#on-search-t'); if (el2) el2.textContent = `Searching… ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }, 500);
  const startFen = await startFenFor(pref.mode);
  searchCancel = ON.findMatch({ mode: pref.mode, tc: pref.tc, startFen }, gid => { stopSearch(true); sfx('check'); openMatch(gid); },
    err => { stopSearch(); D.toast('Matchmaking failed: ' + (err.message || err)); });
}
function stopSearch(matched){
  if (searchCancel && !matched) searchCancel();
  searchCancel = null;
  clearInterval(searchTimer); searchTimer = null;
  if ($('#on-find')){ $('#on-find').hidden = false; $('#on-searching').hidden = true; }
}
async function startLobby(){
  stopSearch();
  $('#on-create').disabled = true;
  try {
    const startFen = await startFenFor(pref.mode);
    const lb = await ON.createLobby({ mode: pref.mode, tc: pref.tc, startFen }, gid => { lobbyCancel = null; sfx('check'); openMatch(gid); });
    lobbyCancel = lb.cancel;
    $('#on-create').hidden = true;
    $('#on-lobby').hidden = false;
    $('#lb-code').textContent = lb.code;
    const link = `${location.origin}${location.pathname}#join=${lb.code}`;
    $('#lb-copy').onclick = async () => { try { await navigator.clipboard.writeText(link); D.toast('Invite link copied'); } catch(_){ D.toast(link); } };
    $('#lb-share').onclick = async () => {
      if (navigator.share){ try { await navigator.share({ title: 'Chess challenge', text: `Play me in Position Trainer! Code: ${lb.code}`, url: link }); } catch(_){} }
      else { try { await navigator.clipboard.writeText(link); D.toast('Invite link copied'); } catch(_){} }
    };
  } catch(e){ D.toast(e.message || 'Could not create lobby'); }
  finally { const b = $('#on-create'); if (b) b.disabled = false; }
}
function stopLobby(){
  if (lobbyCancel){ lobbyCancel(); lobbyCancel = null; }
  if ($('#on-lobby')){ $('#on-lobby').hidden = true; $('#on-create').hidden = false; }
}
async function doJoin(){
  const code = ON.normCode($('#on-code').value);
  const err = $('#on-join-err');
  err.textContent = '';
  if (code.length !== 6){ err.textContent = 'Codes have 6 characters.'; return; }
  stopSearch(); stopLobby();
  $('#on-join').disabled = true;
  try {
    const j = await ON.joinLobby(code, gid => { joinCancel = null; sfx('check'); openMatch(gid); });
    joinCancel = j.cancel;
    err.textContent = '';
    $('#on-join').textContent = 'Joined ✓';
    D.toast(`Joined ${j.info.hostName}’s lobby, starting…`);
  } catch(e){ err.textContent = e.message || 'Could not join.'; $('#on-join').disabled = false; }
}

// ======================= live match =======================
function bindMatch(){
  matchBoard = new Board($('#match-board'), { onMove: onMyMove, getLegal: sq => legalFrom(sq) });
  D.registerBoard(matchBoard);
  $('#match-back').addEventListener('click', () => { D.show('home'); renderHomeOnline(); });
  $('#act-resign').addEventListener('click', onResignClick);
  $('#act-draw').addEventListener('click', async () => {
    if (!M || !M.g || M.g.status !== 'active') return;
    await ON.offerDraw(M.gid); D.toast('Draw offered');
  });
  $('#ms-rematch').addEventListener('click', async () => {
    if (!M) return;
    $('#ms-rematch').disabled = true; $('#ms-rematch').textContent = 'Waiting for opponent…';
    const fen = await startFenFor(M.g.mode);
    await ON.requestRematch(M.gid, fen);
  });
  $('#ms-new').addEventListener('click', () => { closeMatch(); openHub('match'); });
  $('#ms-review').addEventListener('click', () => { if (M && M.rec) D.openReview(M.rec, 'match'); });
}
function legalFrom(sq){
  if (!M || !M.g || M.g.status !== 'active' || M.busy) return [];
  return M.chess.moves({ square: sq, verbose: true }).map(m => ({ to: m.to, promotion: m.promotion, flags: m.flags }));
}
export function openMatch(gid){
  closeMatch();
  M = { gid, g: null, color: null, lastPly: -1, ended: false, busy: false, rec: null, oppOnline: true, oppGoneAt: 0, lastClaim: 0 };
  $('#match-sheet').hidden = true;
  $('#match-note').hidden = true;
  D.show('match');
  matchBoard.setArrows([]);
  M.unsub = ON.watchGame(gid, g => onGame(g));
  M.tick = setInterval(tick, 200);
}
function closeMatch(){
  if (!M) return;
  if (M.unsub) M.unsub();
  if (M.presUnsub) M.presUnsub();
  clearInterval(M.tick);
  M = null;
}
function onGame(g){
  if (!M) return;
  if (!g){ D.toast('Game not found'); return; }
  const first = !M.g;
  M.g = g;
  const uid = ON.user().uid;
  M.color = ON.colorOf(g, uid) || 'w';
  const opp = M.color === 'w' ? 'b' : 'w';
  if (first){
    matchBoard.playerColor = M.color;
    matchBoard.setOrientation(M.color);
    const oppUid = M.color === 'w' ? g.black : g.white;
    M.presUnsub = ON.watchPresence(oppUid, on => { if (!M) return; M.oppOnline = on; M.oppGoneAt = on ? 0 : Date.now(); renderNote(); });
    $('#match-chip').textContent = 'Online';
    $('#match-sub').textContent = `${ON.tcById(g.tc.id).label} · you play ${M.color === 'w' ? 'White' : 'Black'}`;
    D.layout();
  }
  // board
  M.chess = ON.replay(g);
  const ply = g.ply || 0;
  const lastU = ply ? g.moves[ply - 1] : null;
  const animate = ply === M.lastPly + 1;
  matchBoard.setPosition(M.chess, lastU ? { from: lastU.slice(0, 2), to: lastU.slice(2, 4) } : null, animate);
  if (animate && lastU){
    const hist = M.chess.history({ verbose: true });
    const mv = hist[hist.length - 1];
    if (M.chess.inCheck()) sfx('check'); else if (mv && mv.promotion) sfx('promote'); else if (mv && mv.captured) sfx('capture'); else if (mv && mv.san.startsWith('O-O')) sfx('castle'); else sfx('move');
  }
  M.lastPly = ply;
  M.busy = false;
  matchBoard.interactive = g.status === 'active' && ON.sideToMove(g) === M.color;
  // bars
  const meName = M.color === 'w' ? g.wName : g.bName, oppName = M.color === 'w' ? g.bName : g.wName;
  const meR = M.color === 'w' ? g.wRating : g.bRating, oppR = M.color === 'w' ? g.bRating : g.wRating;
  setBar('#pbar-top', oppName, oppR, opp);
  setBar('#pbar-bot', meName + ' (you)', meR, M.color);
  // moves strip
  renderMoves(g);
  // actions
  const active = g.status === 'active';
  $('#act-resign').innerHTML = ply < 2 ? `<span>✕</span>Abort` : `${ICON.flag}<span>Resign</span>`;
  $('#act-resign').disabled = !active;
  $('#act-draw').disabled = !active || ply < 2 || g.drawOffer === M.color;
  $('#act-draw').innerHTML = `${ICON.half}<span>${g.drawOffer === M.color ? 'Draw offered' : 'Offer draw'}</span>`;
  renderNote();
  tick();
  if (g.status !== 'active') onEnded(g);
  if (g.next && M.endedShown && !M.nextScheduled){ M.nextScheduled = true; const next = g.next; setTimeout(() => openMatch(next), 400); }
  // rematch button state
  if (g.status !== 'active' && g.rematch){
    const b = $('#ms-rematch');
    if (g.rematch[opp] && !g.rematch[M.color]){ b.disabled = false; b.textContent = 'Accept rematch'; b.classList.add('pulse'); }
  }
  renderHomeOnline();
}
function setBar(sel, name, rating, color){
  const bar = $(sel);
  bar.querySelector('.pb-av').textContent = initial(name);
  bar.querySelector('.pb-av').className = 'pb-av ' + (color === 'w' ? 'cw' : 'cb');
  bar.querySelector('.pb-name').textContent = name;
  bar.querySelector('.pb-rating').textContent = rating ? `(${rating})` : '';
}
function renderMoves(g){
  const strip = $('#match-moves');
  strip.innerHTML = '';
  const c = new Chess(g.startFen);
  const n = g.ply || 0;
  for (let i = 0; i < n; i++){
    const u = g.moves[i];
    const parts = c.fen().split(' ');
    const r = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    if (parts[1] === 'w' || i === 0) strip.appendChild(el('span', 'mn', parts[1] === 'w' ? `${parts[5]}.` : `${parts[5]}…`));
    strip.appendChild(el('span', 'mv' + (i === n - 1 ? ' last' : ''), r.san));
  }
  if (!n) strip.appendChild(el('span', 'mn', 'Game on, good luck!'));
  strip.scrollLeft = strip.scrollWidth;
}
function fmtClock(ms){
  if (ms >= 3600000) return '60:00';
  const s = Math.ceil(ms / 1000);
  if (ms < 10000) return (ms / 1000).toFixed(1);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function tick(){
  if (!M || !M.g) return;
  const g = M.g;
  const c = ON.clocks(g);
  const opp = M.color === 'w' ? 'b' : 'w';
  const turn = ON.sideToMove(g);
  const setC = (sel, color) => {
    const box = $(sel + ' .pb-clock');
    box.textContent = fmtClock(c[color]);
    box.classList.toggle('run', g.status === 'active' && turn === color && (g.ply || 0) >= 2);
    box.classList.toggle('low', c[color] < 20000);
  };
  setC('#pbar-top', opp); setC('#pbar-bot', M.color);
  if (g.status !== 'active') return;
  const t = ON.now();
  // timeouts: anyone can claim when the clock is truly out (checked again server-side in a transaction)
  const firstMoveLeft = 30000 - (t - g.lastMoveAt);
  const flagged = (g.ply || 0) >= 2 ? c[turn] <= 0 : firstMoveLeft <= 0;
  if (flagged && Date.now() - M.lastClaim > 2000){ M.lastClaim = Date.now(); ON.claimTimeout(M.gid).catch(() => {}); }
  if ((g.ply || 0) < 2) renderNote();
}
function renderNote(){
  if (!M || !M.g) return;
  const g = M.g, note = $('#match-note');
  const opp = M.color === 'w' ? 'b' : 'w';
  let html = '';
  if (g.status === 'active'){
    if (g.drawOffer === opp){
      html = `<span>Your opponent offers a draw.</span><button class="btn sec sm" id="dr-no">Decline</button><button class="btn pri sm" id="dr-yes">Accept</button>`;
    } else if (!M.oppOnline && (g.ply || 0) >= 1){
      const left = Math.max(0, 45 - Math.floor((Date.now() - M.oppGoneAt) / 1000));
      html = left > 0 ? `<span>Opponent disconnected. You can claim the win in ${left}s.</span>` : `<span>Opponent left the game.</span><button class="btn pri sm" id="ab-claim">Claim win</button>`;
      if (left > 0) setTimeout(renderNote, 1000);
    } else if ((g.ply || 0) < 2){
      const left = Math.max(0, Math.ceil((30000 - (ON.now() - g.lastMoveAt)) / 1000));
      const mine = ON.sideToMove(g) === M.color;
      html = `<span>${mine ? 'Your move' : 'Opponent’s first move'}: ${left}s left, or the game is aborted.</span>`;
    }
  }
  note.hidden = !html;
  note.innerHTML = html;
  const y = $('#dr-yes'), n = $('#dr-no'), cl = $('#ab-claim');
  if (y) y.onclick = () => ON.acceptDraw(M.gid);
  if (n) n.onclick = () => ON.declineDraw(M.gid);
  if (cl) cl.onclick = () => ON.claimAbandon(M.gid);
}
let promoResolve = null;
function askPromotion(){
  return new Promise(res => {
    promoResolve = res;
    const card = $('#mpromo-card');
    card.innerHTML = ['q','r','b','n'].map(t => `<button data-p="${t}">${pieceSVG(t, M.color, D.settings().pieces)}</button>`).join('');
    $('#mpromo').hidden = false;
    card.onclick = e => { const b = e.target.closest('button'); if (!b) return; $('#mpromo').hidden = true; promoResolve(b.dataset.p); };
    $('#mpromo').onclick = e => { if (e.target.id === 'mpromo'){ $('#mpromo').hidden = true; promoResolve(null); } };
  });
}
async function onMyMove({ from, to, promo }){
  if (!M || !M.g || M.g.status !== 'active' || M.busy) return;
  let promotion;
  if (promo){
    promotion = await askPromotion();
    if (!promotion){ matchBoard.setPosition(M.chess, null, false); onGame(M.g); return; }
  }
  const test = new Chess(M.chess.fen());
  let mv; try { mv = test.move({ from, to, promotion }); } catch(_){ mv = null; }
  if (!mv) return;
  M.busy = true;
  matchBoard.interactive = false;
  const uci = from + to + (promotion || '');
  try {
    const r = await ON.sendMove(M.gid, M.g.ply || 0, uci);
    if (!r.committed){ M.busy = false; onGame(M.g); }
  } catch(e){ M.busy = false; D.toast('Move not sent, check your connection'); onGame(M.g); }
}
async function onResignClick(){
  if (!M || !M.g || M.g.status !== 'active') return;
  const b = $('#act-resign');
  if ((M.g.ply || 0) < 2){ await ON.abortGame(M.gid); return; }
  if (!b.dataset.armed){ b.dataset.armed = 1; b.innerHTML = `${ICON.flag}<span>Tap again to resign</span>`; setTimeout(() => { if (b.isConnected){ delete b.dataset.armed; if (M && M.g) onGame(M.g); } }, 3000); return; }
  delete b.dataset.armed;
  await ON.resign(M.gid);
}
const REASON = {
  mate: 'by checkmate', resign: 'by resignation', time: 'on time', abandon: 'opponent left',
  agreement: 'by agreement', stalemate: 'by stalemate', repetition: 'by repetition', insufficient: 'insufficient material',
  fifty: '50-move rule', abort: 'game aborted', nomove: 'no first move'
};
async function onEnded(g){
  if (M.endedShown) return;
  M.endedShown = true;
  matchBoard.interactive = false;
  const won = g.result === M.color, draw = g.result === 'd', aborted = g.status === 'aborted';
  const icon = $('#ms-icon');
  icon.className = 'res-icon ' + (aborted || draw ? 'draw' : won ? 'win' : 'lose');
  icon.innerHTML = aborted ? '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>' : draw ? '<svg viewBox="0 0 24 24"><path d="M6 10h12M6 14h12"/></svg>' : won ? '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>';
  $('#ms-title').textContent = aborted ? 'Game aborted' : draw ? 'Draw' : won ? 'You won!' : 'You lost';
  $('#ms-sub').textContent = aborted ? (g.reason === 'nomove' ? 'No first move was made in time. Ratings unchanged.' : 'Ratings unchanged.') : (REASON[g.reason] || '');
  $('#ms-rating').textContent = '';
  $('#ms-rematch').disabled = aborted; $('#ms-rematch').textContent = 'Rematch'; $('#ms-rematch').classList.remove('pulse');
  $('#ms-review').disabled = aborted || !(g.ply > 0);
  $('#match-sheet').hidden = false;
  sfx(aborted || draw ? 'draw' : won ? 'win' : 'lose');
  if (aborted) return;
  // rating + history
  const before = M.color === 'w' ? g.wRating : g.bRating;
  try {
    const d = await ON.applyResult(M.gid, g);
    const delta = d != null ? d : ON.ratingDelta(g, M.color);
    $('#ms-rating').innerHTML = `Rating ${before} → <b>${before + delta}</b> <span class="${delta >= 0 ? 'up' : 'down'}">(${delta >= 0 ? '+' : ''}${delta})</span>`;
  } catch(e){ console.warn(e); }
  M.rec = buildRecord(g);
  D.addHistory(M.rec);
  renderHomeOnline();
}
function buildRecord(g){
  const c = new Chess(g.startFen);
  const moves = [];
  for (let i = 0; i < (g.ply || 0); i++){
    const u = g.moves[i];
    const fenBefore = c.fen();
    const mover = c.turn();
    const r = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    moves.push({ uci: u, san: r.san, by: mover === M.color ? 'p' : 'b', fenBefore, fenAfter: c.fen(), captured: r.captured || null, from: r.from, to: r.to });
  }
  const won = g.result === M.color, draw = g.result === 'd';
  return {
    id: 'on-' + M.gid, date: Date.now(), phase: 'online', online: true, level: null,
    opp: M.color === 'w' ? g.bName : g.wName, oppRating: M.color === 'w' ? g.bRating : g.wRating, tc: g.tc.id,
    startFen: g.startFen, playerColor: M.color, moves,
    result: won ? 'success' : draw ? 'draw' : 'fail', reason: g.reason, review: null
  };
}

export function layoutMatch(){
  const main = $('#match-main'); if (!main || !main.offsetParent) return;
  const used = $('#pbar-top').offsetHeight + $('#pbar-bot').offsetHeight + $('.match-actions').offsetHeight + $('#match-moves').offsetHeight + ($('#match-note').hidden ? 0 : $('#match-note').offsetHeight) + 40;
  const availH = main.clientHeight - used;
  const availW = Math.min(main.clientWidth, window.innerWidth) - 20;
  const size = Math.max(160, Math.floor(Math.min(availW, availH, 640) / 8) * 8);
  $('#scr-match').style.setProperty('--bs', size + 'px');
  $('#scr-match').style.setProperty('--goal-w', size + 'px');
}
export function currentMatch(){ return M; }

// test hooks (harmless in production)
window.__matchFen = () => M && M.chess ? M.chess.fen() : null;
window.__matchTurn = () => M && M.g ? ON.sideToMove(M.g) : null;
window.__matchPly = () => M && M.g ? (M.g.ply || 0) : -1;
