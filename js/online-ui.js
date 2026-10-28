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
      ON.onUser(u => { renderHomeOnline(); if (u) ON.retryPending(); });
      renderHomeOnline();
      if (ON.user()){ ON.goPresent(); ON.retryPending(); }
    }).catch(err => console.warn('online init failed', err));
  }
  initLiveChannel();
  initFocusTracking();
  renderHomeOnline();
}

// ======================= fair play: one live game, no help =======================
// While a live game runs, the bot, reviews and analysis are locked — in this tab and in any other tab
// of the app in the same browser (BroadcastChannel + a localStorage heartbeat as fallback).
let liveChan = null, otherLiveUntil = 0, liveBeat = null;
const TAB_ID = Math.random().toString(36).slice(2);
function initLiveChannel(){
  try {
    liveChan = new BroadcastChannel('cpt-live');
    liveChan.onmessage = e => { const m = e.data || {}; if (m.tab !== TAB_ID && m.type === 'live'){ otherLiveUntil = m.until; onOtherLive(); } if (m.type === 'over' && m.tab !== TAB_ID){ otherLiveUntil = 0; onOtherLive(); } };
  } catch(_){}
  window.addEventListener('storage', e => {
    if (e.key !== 'cpt.live') return;
    try { const m = JSON.parse(e.newValue || '{}'); if (m.tab !== TAB_ID){ otherLiveUntil = m.until || 0; onOtherLive(); } } catch(_){}
  });
}
function beatLive(on){
  const msg = { type: on ? 'live' : 'over', tab: TAB_ID, until: on ? Date.now() + 6000 : 0 };
  try { liveChan && liveChan.postMessage(msg); } catch(_){}
  try { localStorage.setItem('cpt.live', JSON.stringify(msg)); } catch(_){}
}
function setLiveBeat(on){
  if (on && !liveBeat){ beatLive(true); liveBeat = setInterval(() => beatLive(true), 2000); }
  if (!on && liveBeat){ clearInterval(liveBeat); liveBeat = null; beatLive(false); }
}
function liveHere(){ return !!(M && M.g && M.g.status === 'active'); }
export function liveGameActive(){ return liveHere() || otherLiveUntil > Date.now(); }
function onOtherLive(){
  let lock = $('#live-lock');
  const on = otherLiveUntil > Date.now() && !liveHere();
  if (on && D && D.lockedScreen && D.lockedScreen()){
    if (!lock){
      lock = el('div', 'live-lock'); lock.id = 'live-lock';
      lock.innerHTML = '<div class="ll-card"><h4>Live game in another tab</h4><p>The bot, reviews and analysis are locked while you play an online game. They unlock as soon as it ends.</p></div>';
      document.body.appendChild(lock);
    }
  } else if (lock) lock.remove();
  if (on) setTimeout(onOtherLive, 2500);
}

// Leaving the game screen during your own turn is recorded (shown to your opponent after the game).
const FOCUS = { away: false, since: 0, n: 0, ms: 0 };
function initFocusTracking(){
  const leave = () => {
    if (!M || !M.g || M.g.status !== 'active' || ON.sideToMove(M.g) !== M.color || FOCUS.away) return;
    FOCUS.away = true; FOCUS.since = Date.now();
  };
  const back = () => {
    if (!FOCUS.away) return;
    FOCUS.away = false;
    const dt = Date.now() - FOCUS.since;
    if (dt < 1500 || !M || !M.g) return;          // ignore tiny blips (notification banners etc.)
    FOCUS.n++; FOCUS.ms += dt;
    ON.sendFocus(M.gid, M.color, FOCUS);
  };
  document.addEventListener('visibilitychange', () => document.hidden ? leave() : back());
  window.addEventListener('blur', leave);
  window.addEventListener('focus', back);
  window.addEventListener('pagehide', leave);
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
const BANNED_HTML = `<div class="card notice banned"><h4 class="sec-h">Account suspended</h4>
  <p class="about">This account was suspended for breaking the fair-play rules (for example using an engine or outside help during games). You can still train against the bot offline. If you think this is a mistake, open an issue on the project’s GitHub page.</p></div>`;

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
  body.innerHTML = `
    <div class="card acc-card">
      <span class="av lg">${initial(p.name)}</span>
      <div class="acc-id"><b>${esc(p.name)}</b><span>${esc(u.email || 'Google account')}</span></div>
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
    ${ON.isBanned() ? BANNED_HTML : `<div class="card"><h4 class="sec-h">Fair play</h4><p class="about" style="margin:0">Your account is in good standing. Online games are checked automatically for engine use, and results are verified by both players’ apps.</p></div>`}
    <div class="card acc-actions">
      <button class="btn sec wide" id="acc-signout">Sign out</button>
      <button class="danger" id="acc-delete">Delete account</button>
    </div>
    <p class="legal"><a href="terms.html">Terms &amp; Conditions</a> · <a href="privacy.html">Privacy Policy</a></p>`;
  $('#acc-name-save').onclick = async () => {
    try { await ON.setName($('#acc-name').value); D.toast('Name saved'); renderAccount(); renderHomeOnline(); } catch(e){ D.toast(ON.authErrorText(e)); }
  };
  $('#acc-signout').onclick = async () => {
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
  if (ON.isBanned()){ body.innerHTML = BANNED_HTML; return; }
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
  if (window.__forceStartFen) return window.__forceStartFen;   // test hook
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
  searchCancel = ON.findMatch({ mode: pref.mode, tc: pref.tc, startFen }, gid => { stopSearch(true); openMatch(gid); },
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
    const lb = await ON.createLobby({ mode: pref.mode, tc: pref.tc, startFen }, gid => { lobbyCancel = null; openMatch(gid); });
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
    const j = await ON.joinLobby(code, gid => { joinCancel = null; openMatch(gid); });
    joinCancel = j.cancel;
    err.textContent = '';
    $('#on-join').textContent = 'Joined ✓';
    D.toast(`Joined ${j.info.hostName}’s lobby, starting…`);
  } catch(e){ err.textContent = e.message || 'Could not join.'; $('#on-join').disabled = false; }
}

// ======================= live match =======================
function bindMatch(){
  matchBoard = new Board($('#match-board'), { onMove: onMyMove, getLegal: sq => legalFrom(sq), onIllegal: () => sfx('illegal') });
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
  $('#ms-report').addEventListener('click', () => { const b = $('#report-box'); b.hidden = !b.hidden; });
  $('#rb-opts').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b || !M || !M.g) return;
    const opp = M.color === 'w' ? M.g.black : M.g.white;
    $('#report-box').hidden = true;
    try { await ON.reportPlayer(M.gid, opp, b.dataset.r); M.reported = true; $('#ms-report').textContent = 'Report sent, thank you'; $('#ms-report').disabled = true; }
    catch(_){ D.toast('Could not send the report'); }
  });
}
function legalFrom(sq){
  if (!M || !M.g || M.g.status !== 'active' || M.busy) return [];
  return M.chess.moves({ square: sq, verbose: true }).map(m => ({ to: m.to, promotion: m.promotion, flags: m.flags }));
}
export function openMatch(gid){
  closeMatch();
  M = { gid, g: null, color: null, lastPly: -1, ended: false, busy: false, rec: null, oppOnline: true, oppGoneAt: 0, lastClaim: 0, lowWarned: false, offerSeen: null, oppFlagged: false };
  FOCUS.away = false; FOCUS.n = 0; FOCUS.ms = 0;
  $('#match-sheet').hidden = true;
  $('#report-box').hidden = true;
  $('#ms-fair').hidden = true;
  $('#ms-report').disabled = false; $('#ms-report').textContent = 'Report opponent';
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
  setLiveBeat(false);
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
    if (g.status === 'active' && (g.ply || 0) < 2) sfx('start');
    // warn if this opponent has been flagged by several different players
    const gidNow = M.gid;
    ON.fairPlaySummary(oppUid).then(fp => {
      if (!M || M.gid !== gidNow) return;
      M.oppFlagged = fp.flagged >= 3 && fp.reporters >= 2;
      if (M.oppFlagged && M.g) onGame(M.g);
    });
  }
  setLiveBeat(g.status === 'active');
  // board
  M.chess = ON.replay(g);
  if (M.chess.illegalAt != null && M.chess.turn() !== M.color && g.status === 'active' && !M.illegalClaimed){
    // only a modified app can send an illegal move: after re-checking the stored game, win it and report it
    M.illegalClaimed = true;
    const mm = M, opp2 = M.color === 'w' ? g.black : g.white;
    setTimeout(async () => {
      const fresh = await ON.getGame(mm.gid).catch(() => null);
      const rc = fresh && ON.replay(fresh);
      if (!fresh || fresh.status !== 'active' || rc.illegalAt == null || rc.turn() === mm.color){ mm.illegalClaimed = false; return; }
      ON.claimIllegal(mm.gid).catch(() => {});
      ON.reportPlayer(mm.gid, opp2, 'auto:illegal-move').catch(() => {});
    }, 1500);
  }
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
  setBar('#pbar-top', oppName, oppR, opp, M.oppFlagged);
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
  if (g.status === 'active' && g.drawOffer === opp && M.offerSeen !== g.ply){ M.offerSeen = g.ply; sfx('notify'); }
  if (g.status !== 'active') onEnded(g);
  if (g.status === 'over' && M.endedShown && M.awaitingConfirm && ON.isVerified(g)){ M.awaitingConfirm = false; settleRating(g); }
  if (g.next && M.endedShown && !M.nextScheduled){ M.nextScheduled = true; const next = g.next; setTimeout(() => openMatch(next), 400); }
  // rematch button state
  if (g.status !== 'active' && g.rematch){
    const b = $('#ms-rematch');
    if (g.rematch[opp] && !g.rematch[M.color]){ b.disabled = false; b.textContent = 'Accept rematch'; b.classList.add('pulse'); }
  }
  renderHomeOnline();
}
function setBar(sel, name, rating, color, flagged){
  const bar = $(sel);
  bar.querySelector('.pb-av').textContent = initial(name);
  bar.querySelector('.pb-av').className = 'pb-av ' + (color === 'w' ? 'cw' : 'cb');
  bar.querySelector('.pb-name').textContent = name;
  bar.querySelector('.pb-rating').innerHTML = (rating ? `(${rating})` : '') + (flagged ? '<span class="fp-badge" title="Flagged by several players for possible engine use">⚠ flagged</span>' : '');
}
function renderMoves(g){
  const strip = $('#match-moves');
  strip.innerHTML = '';
  const c = new Chess(g.startFen);
  const n = g.ply || 0;
  for (let i = 0; i < n; i++){
    const u = g.moves[i];
    const parts = c.fen().split(' ');
    let r = null; try { r = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch(_){}
    if (!r){ strip.appendChild(el('span', 'mv', '(illegal move)')); break; }
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
  const lowAt = Math.min(20000, g.tc.base * 0.1);
  if (!M.lowWarned && (g.ply || 0) >= 2 && turn === M.color && c[M.color] < lowAt && c[M.color] > 0){ M.lowWarned = true; sfx('lowtime'); }
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
      const left = Math.max(0, 46 - Math.floor((Date.now() - M.oppGoneAt) / 1000), 46 - Math.floor((ON.now() - g.lastMoveAt) / 1000));
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
  if (cl) cl.onclick = () => ON.claimAbandon(M.gid).catch(() => D.toast('Your opponent is back, keep playing'));
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
  fifty: '50-move rule', abort: 'game aborted', nomove: 'no first move', illegal: 'illegal move (checked by both apps)'
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
  const mm = M;
  // history + background analysis (also powers the fair-play check)
  M.rec = buildRecord(g);
  D.addHistory(M.rec);
  renderHomeOnline();
  showOppFocus(g);
  // re-check the game if the opponent ended it, then apply ratings
  try { await ON.confirmOrDispute(M.gid, g); } catch(e){ console.warn(e); }
  if (M !== mm) return;
  const fresh = await ON.getGame(M.gid).catch(() => null) || g;
  if ((fresh.ply || 0) !== (g.ply || 0)){ M.rec = buildRecord(fresh); D.addHistory(M.rec); }
  if (ON.isDisputed(fresh)){ $('#ms-rating').textContent = 'This game was flagged as invalid, so ratings stay the same. It has been reported.'; }
  else if (ON.isVerified(fresh)) await settleRating(fresh);
  else { M.awaitingConfirm = true; ON.rememberPending(M.gid); $('#ms-rating').textContent = 'Rating updates as soon as your opponent’s app confirms the result.'; }
  runFairPlay(mm, fresh);
}
async function settleRating(g){
  if (!M) return;
  const gid = M.gid, color = M.color;
  const before = color === 'w' ? g.wRating : g.bRating;
  try {
    let delta = await ON.applyResults(gid);
    if (delta == null){
      // already applied (by the opponent's app): read the real numbers
      const p = await ON.refreshProfile();
      delta = p ? p.rating - before : ON.ratingDelta(g, color);
    }
    if (!M || M.gid !== gid) return;
    $('#ms-rating').innerHTML = `Rating ${before} → <b>${before + delta}</b> <span class="${delta >= 0 ? 'up' : 'down'}">(${delta >= 0 ? '+' : ''}${delta})</span>`;
  } catch(e){ console.warn(e); }
  renderHomeOnline();
}
function showOppFocus(g){
  const opp = M.color === 'w' ? 'b' : 'w';
  const f = g.focus && g.focus[opp];
  if (f && f.n >= 3){
    M.fairNote = `Your opponent left the game screen <b>${f.n}×</b> during their turns (${Math.round(f.ms / 1000)}s in total).`;
    renderFair();
  }
}
function renderFair(){
  if (!M) return;
  const box = $('#ms-fair');
  const parts = [M.fairCheck, M.fairNote].filter(Boolean);
  box.hidden = !parts.length;
  box.className = 'ms-fair' + (M.fairFlag ? ' warn' : M.fairCheck ? ' ok' : '');
  box.innerHTML = parts.join('<br>');
}
// Engine-match check of the opponent's moves (non-obvious moves only). Strong, human play scores far lower
// than an engine copying its first choice; a flag is only shown to others after several different players flag the same account.
async function runFairPlay(mm, g){
  if (!D.analyze || !mm.rec) return;
  let rv;
  try { rv = await D.analyze(mm.rec); } catch(_){ return; }
  if (!rv) return;
  const rows = rv.moves.filter(m => m.by !== 'p' && m.fp && !m.fp.obvious);
  const n = rows.length;
  if (n < 8) return;
  const match = rows.filter(m => m.fp.top).length / n;
  const acpl = rows.reduce((a, m) => a + Math.min(1000, m.fp.cpLoss), 0) / n;
  const opp = mm.color === 'w' ? 'b' : 'w';
  const away = (g.focus && g.focus[opp] && g.focus[opp].n) || 0;
  const flag = n >= 12 && ((match >= 0.9 && acpl <= 15) || (match >= 0.8 && acpl <= 8 && n >= 20) || (away >= 3 && match >= 0.8 && acpl <= 20));
  const oppUid = mm.color === 'w' ? g.black : g.white;
  ON.submitFairPlay(mm.gid, oppUid, { n, match: Math.round(match * 100) / 100, acpl: Math.round(acpl), away, flag }).catch(() => {});
  if (flag) ON.reportPlayer(mm.gid, oppUid, 'auto:engine-match').catch(() => {});
  if (M !== mm) return;
  M.fairFlag = flag;
  M.fairCheck = flag
    ? `⚠ <b>Unusually engine-like play</b>: your opponent matched Stockfish’s first choice on ${Math.round(match * 100)}% of ${n} non-obvious moves. The game was flagged for review.`
    : `<b>Fair play ✓</b> Your opponent’s play looks human (engine match ${Math.round(match * 100)}% on ${n} non-obvious moves).`;
  renderFair();
}
function buildRecord(g){
  const c = new Chess(g.startFen);
  const moves = [];
  for (let i = 0; i < (g.ply || 0); i++){
    const u = g.moves[i];
    const fenBefore = c.fen();
    const mover = c.turn();
    let r = null; try { r = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch(_){}
    if (!r) break;
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
window.__matchGid = () => M ? M.gid : null;
