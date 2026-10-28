// Interactive chessboard
//  - tap-tap or drag-and-drop to move (touch + mouse), legal-move hints, last move, check
//  - right-click + drag to draw arrows, right-click a square to mark it (PC); Shift/Ctrl/Alt change colour
//  - animated moves: slide (incl. castling rook), capture fade, drop settle, promotion pop
import { FILES, sqToRC, rcToSq } from './util.js';
import { pieceSVG } from './pieces.js';

const SVGNS = 'http://www.w3.org/2000/svg';
export const DRAW_COLORS = {
  base:  'rgba(245,165,36,.9)',   // amber
  shift: 'rgba(229,72,77,.9)',    // red
  ctrl:  'rgba(70,167,88,.9)',    // green
  alt:   'rgba(62,142,237,.9)'    // blue
};
const SPEEDS = { fast: 120, normal: 210, slow: 340 };

export class Board {
  constructor(root, opts = {}){
    this.root = root;
    this.orientation = 'w';
    this.interactive = false;
    this.playerColor = 'w';
    this.onMove = opts.onMove || (() => {});
    this.getLegal = opts.getLegal || (() => []);
    this.onIllegal = opts.onIllegal || (() => {});   // (fromSq) => [{to, promotion, flags}]
    this.drawEnabled = opts.draw !== false;
    this.settings = { coords: true, legal: true, anim: true, pieces: 'prism', animSpeed: 'normal' };
    this.position = {};   // sq -> {type,color}
    this.lastMove = null;
    this.checkSq = null;
    this.selected = null;
    this.legalTargets = [];
    this.arrows = [];       // engine / app arrows
    this.userArrows = [];   // drawn by the player
    this.userMarks = new Map();
    this.badge = null;      // {sq, sym, color}
    this.lastTint = null;   // css color for last-move highlight
    this._dropped = null;   // move that was just made by drag-and-drop (no slide needed)
    this._build();
  }

  get moveMs(){ return SPEEDS[this.settings.animSpeed] || SPEEDS.normal; }

  _build(){
    // render into an inner element so the host keeps its own sizing
    this.host = this.root;
    this.host.innerHTML = '';
    this.root = document.createElement('div');
    this.root.className = 'board';
    this.host.appendChild(this.root);
    this.sqLayer = document.createElement('div'); this.sqLayer.className = 'b-squares';
    this.hlLayer = document.createElement('div'); this.hlLayer.className = 'b-hl';
    this.pcLayer = document.createElement('div'); this.pcLayer.className = 'b-pieces';
    this.bdLayer = document.createElement('div'); this.bdLayer.className = 'b-badges';
    this.fxLayer = document.createElement('div'); this.fxLayer.className = 'b-fx';
    this.svgLayer = document.createElementNS(SVGNS, 'svg');
    this.svgLayer.setAttribute('viewBox', '0 0 800 800');
    this.svgLayer.setAttribute('class', 'b-arrows');
    this.root.append(this.sqLayer, this.hlLayer, this.fxLayer, this.pcLayer, this.svgLayer, this.bdLayer);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++){
      const d = document.createElement('div');
      d.className = 'sq ' + (((r + c) % 2) ? 'dk' : 'lt');
      this.sqLayer.appendChild(d);
    }
    this._bindPointer();
  }

  applySettings(s){
    Object.assign(this.settings, s);
    this.render(false);
  }

  setOrientation(color){ this.orientation = color; this.render(false); }

  setPosition(chess, lastMove = null, animate = true){
    const old = this.position;
    const pos = {};
    const b = chess.board();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++){
      const p = b[r][c]; if (p) pos[rcToSq(r,c)] = { type: p.type, color: p.color };
    }
    const changed = JSON.stringify(old) !== JSON.stringify(pos);
    this.position = pos;
    this.lastMove = lastMove;
    this.checkSq = null;
    if (chess.inCheck()){
      const t = chess.turn();
      for (const [sq,p] of Object.entries(pos)) if (p.type === 'k' && p.color === t) this.checkSq = sq;
    }
    this.selected = null; this.legalTargets = [];
    if (changed){ this.userArrows = []; this.userMarks.clear(); }

    const anim = animate && this.settings.anim && !!lastMove && changed;
    const dropped = anim && this._dropped && this._dropped.from === lastMove.from && this._dropped.to === lastMove.to;
    this._dropped = null;
    // what got captured (for the fade-out effect)
    let captured = null;
    if (anim){
      const mover = old[lastMove.from];
      if (old[lastMove.to] && (!mover || old[lastMove.to].color !== mover.color)) captured = { sq: lastMove.to, p: old[lastMove.to] };
      else if (mover && mover.type === 'p' && lastMove.from[0] !== lastMove.to[0] && !old[lastMove.to]){
        const epSq = lastMove.to[0] + lastMove.from[1];
        if (old[epSq]) captured = { sq: epSq, p: old[epSq] };
      }
    }
    this.render(false);
    if (anim){
      const promoted = old[lastMove.from] && pos[lastMove.to] && old[lastMove.from].type !== pos[lastMove.to].type;
      if (dropped) this._settle(lastMove.to);
      else this._slide(lastMove);
      if (captured) this._captureFx(captured, dropped ? 0 : this.moveMs * 0.55);
      if (promoted) this._pop(lastMove.to, dropped ? 0 : this.moveMs);
    }
  }

  setArrows(arr){ this.arrows = arr || []; this._drawArrows(); }
  clearDrawings(){ if (this.userArrows.length || this.userMarks.size){ this.userArrows = []; this.userMarks.clear(); this._drawArrows(); } }

  _xy(sq){
    const { r, c } = sqToRC(sq);
    const flip = this.orientation === 'b';
    return { x: flip ? 7 - c : c, y: flip ? 7 - r : r };
  }
  _tf(x, y, extra = ''){ return `translate(${x * 100}%, ${y * 100}%)${extra}`; }

  _sqFromPoint(clientX, clientY){
    const rect = this.root.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / rect.width * 8);
    const y = Math.floor((clientY - rect.top) / rect.height * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    const flip = this.orientation === 'b';
    return rcToSq(flip ? 7 - y : y, flip ? 7 - x : x);
  }

  render(){
    // coordinates
    const flip = this.orientation === 'b';
    const sqs = this.sqLayer.children;
    for (let i = 0; i < 64; i++){
      const y = Math.floor(i / 8), x = i % 8;
      const el = sqs[i];
      el.innerHTML = '';
      if (this.settings.coords){
        if (x === 0) el.insertAdjacentHTML('beforeend', `<span class="co rk">${flip ? y + 1 : 8 - y}</span>`);
        if (y === 7) el.insertAdjacentHTML('beforeend', `<span class="co fl">${FILES[flip ? 7 - x : x]}</span>`);
      }
    }
    this._renderHighlights();
    // pieces
    this.pcLayer.innerHTML = '';
    this.pieceEls = {};
    for (const [sq, p] of Object.entries(this.position)){
      const { x, y } = this._xy(sq);
      const d = document.createElement('div');
      d.className = 'piece';
      d.dataset.sq = sq;
      d.innerHTML = pieceSVG(p.type, p.color, this.settings.pieces);
      d.style.transform = this._tf(x, y);
      this.pcLayer.appendChild(d);
      this.pieceEls[sq] = d;
    }
    this._drawArrows();
    this._drawBadge();
  }

  _renderHighlights(){
    this.hlLayer.innerHTML = '';
    this._hoverEl = null;
    const addHl = (sq, cls) => {
      const { x, y } = this._xy(sq);
      const d = document.createElement('div');
      d.className = 'hl ' + cls;
      d.style.transform = this._tf(x, y);
      this.hlLayer.appendChild(d);
      return d;
    };
    if (this.lastMove){
      for (const s of [this.lastMove.from, this.lastMove.to]){
        const h = addHl(s, 'last');
        if (this.lastTint) h.style.background = `color-mix(in srgb, ${this.lastTint} 48%, transparent)`;
      }
    }
    if (this.checkSq) addHl(this.checkSq, 'check');
    if (this.selected) addHl(this.selected, 'sel');
    if (this.selected && this.settings.legal){
      const seen = new Set();
      for (const m of this.legalTargets){
        if (seen.has(m.to)) continue; seen.add(m.to);
        addHl(m.to, this.position[m.to] || (m.flags && m.flags.includes('e')) ? 'cap' : 'dot');
      }
    }
  }

  setBadge(b, tint){ this.badge = b; this.lastTint = tint || null; }

  _drawBadge(){
    this.bdLayer.innerHTML = '';
    if (!this.badge) return;
    const { x, y } = this._xy(this.badge.sq);
    const d = document.createElement('div');
    d.className = 'bd-cell';
    d.style.transform = this._tf(x, y);
    d.innerHTML = `<span class="bd" style="background:${this.badge.color}">${this.badge.sym}</span>`;
    this.bdLayer.appendChild(d);
    if (this.settings.anim && d.animate){
      d.firstChild.animate([{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1.15)', opacity: 1, offset: .7 }, { transform: 'scale(1)' }],
        { duration: 260, delay: this.moveMs * 0.6, easing: 'ease-out', fill: 'backwards' });
    }
  }

  // ---------- animation ----------
  _slide(m){
    const moves = [[m.from, m.to]];
    const p = this.position[m.to];
    if (p && p.type === 'k' && Math.abs(FILES.indexOf(m.from[0]) - FILES.indexOf(m.to[0])) === 2){
      const rank = m.to[1];
      if (m.to[0] === 'g') moves.push(['h' + rank, 'f' + rank]);
      else moves.push(['a' + rank, 'd' + rank]);
    }
    for (const [from, to] of moves){
      const el = this.pieceEls[to]; if (!el) continue;
      const a = this._xy(from), b = this._xy(to);
      el.classList.add('moving');
      if (el.animate){
        const an = el.animate([{ transform: this._tf(a.x, a.y) }, { transform: this._tf(b.x, b.y) }],
          { duration: this.moveMs, easing: 'cubic-bezier(.25,.85,.3,1)' });
        an.onfinish = an.oncancel = () => el.classList.remove('moving');
      } else el.classList.remove('moving');
    }
  }

  _settle(sq){
    const el = this.pieceEls[sq]; if (!el || !el.animate) return;
    const { x, y } = this._xy(sq);
    el.animate([{ transform: this._tf(x, y, ' scale(1.1)') }, { transform: this._tf(x, y, ' scale(1)') }], { duration: 140, easing: 'ease-out' });
  }

  _pop(sq, delay){
    const el = this.pieceEls[sq]; if (!el || !el.animate) return;
    const { x, y } = this._xy(sq);
    el.animate([{ transform: this._tf(x, y, ' scale(1)') }, { transform: this._tf(x, y, ' scale(1.25)'), offset: .5 }, { transform: this._tf(x, y, ' scale(1)') }],
      { duration: 300, delay, easing: 'ease-out' });
  }

  _captureFx(c, delay){
    const { x, y } = this._xy(c.sq);
    const g = document.createElement('div');
    g.className = 'piece ghost';
    g.innerHTML = pieceSVG(c.p.type, c.p.color, this.settings.pieces);
    g.style.transform = this._tf(x, y);
    this.fxLayer.appendChild(g);
    if (!g.animate){ g.remove(); return; }
    const an = g.animate([
      { transform: this._tf(x, y, ' scale(1)'), opacity: 1 },
      { transform: this._tf(x, y, ' scale(.55)'), opacity: 0 }
    ], { duration: Math.max(140, this.moveMs * 0.8), delay, easing: 'ease-in', fill: 'both' });
    an.onfinish = an.oncancel = () => g.remove();
  }

  // ---------- arrows & marks ----------
  _center(sq){ const { x, y } = this._xy(sq); return [x * 100 + 50, y * 100 + 50]; }

  _arrowEl(from, to, color, opts = {}){
    const [x1, y1] = this._center(from), [x2, y2] = this._center(to);
    const dxs = Math.abs(x2 - x1) / 100, dys = Math.abs(y2 - y1) / 100;
    let pts = [[x1, y1], [x2, y2]];
    // knight moves get an L-shaped arrow (long leg first)
    if ((dxs === 1 && dys === 2) || (dxs === 2 && dys === 1)){
      pts = dys > dxs ? [[x1, y1], [x1, y2], [x2, y2]] : [[x1, y1], [x2, y1], [x2, y2]];
    }
    const w = opts.width || 16, headL = opts.head || 36, headW = w * 1.45;
    // shorten start
    const [p0, p1] = pts;
    const l0 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const s = 20;
    pts[0] = [p0[0] + (p1[0] - p0[0]) / l0 * s, p0[1] + (p1[1] - p0[1]) / l0 * s];
    // head
    const n = pts.length, pa = pts[n - 2], pb = pts[n - 1];
    const L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    const ux = (pb[0] - pa[0]) / L, uy = (pb[1] - pa[1]) / L, px = -uy, py = ux;
    const tip = [pb[0] - ux * 8, pb[1] - uy * 8];
    const base = [tip[0] - ux * headL, tip[1] - uy * headL];
    const shaft = [...pts.slice(0, n - 1), base];
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('opacity', opts.opacity || '1');
    if (opts.cls) g.setAttribute('class', opts.cls);
    const pl = document.createElementNS(SVGNS, 'polyline');
    pl.setAttribute('points', shaft.map(p => p.map(v => v.toFixed(1)).join(',')).join(' '));
    pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', color);
    pl.setAttribute('stroke-width', w); pl.setAttribute('stroke-linejoin', 'round');
    const hd = document.createElementNS(SVGNS, 'polygon');
    hd.setAttribute('points', [
      [base[0] + px * headW, base[1] + py * headW], tip, [base[0] - px * headW, base[1] - py * headW]
    ].map(p => p.map(v => v.toFixed(1)).join(',')).join(' '));
    hd.setAttribute('fill', color);
    g.append(pl, hd);
    return g;
  }

  _drawArrows(preview){
    const svg = this.svgLayer;
    svg.innerHTML = '';
    for (const [sq, color] of this.userMarks){
      const [cx, cy] = this._center(sq);
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', 44);
      c.setAttribute('fill', 'none'); c.setAttribute('stroke', color); c.setAttribute('stroke-width', 7);
      if (this._newMark === sq) c.setAttribute('class', 'arr-in');
      svg.appendChild(c);
    }
    for (const a of this.arrows) svg.appendChild(this._arrowEl(a.from, a.to, a.color || DRAW_COLORS.base, { opacity: a.opacity || '0.9' }));
    for (const a of this.userArrows) svg.appendChild(this._arrowEl(a.from, a.to, a.color, { cls: a === this._newArrow ? 'arr-in' : '' }));
    if (preview && preview.from !== preview.to) svg.appendChild(this._arrowEl(preview.from, preview.to, preview.color, { opacity: '.55' }));
    this._newArrow = null; this._newMark = null;
  }

  _toggleDrawing(from, to, color){
    if (from === to){
      if (this.userMarks.get(from) === color) this.userMarks.delete(from);
      else { this.userMarks.set(from, color); this._newMark = from; }
    } else {
      const i = this.userArrows.findIndex(a => a.from === from && a.to === to);
      if (i >= 0 && this.userArrows[i].color === color) this.userArrows.splice(i, 1);
      else {
        if (i >= 0) this.userArrows.splice(i, 1);
        const a = { from, to, color };
        this.userArrows.push(a); this._newArrow = a;
      }
    }
    this._drawArrows();
  }

  // ---------- input ----------
  _select(sq){
    this.selected = sq;
    this.legalTargets = sq ? this.getLegal(sq) : [];
    this._renderHighlights();
  }

  _tryMove(from, to, viaDrag){
    const cands = this.legalTargets.filter(m => m.to === to);
    if (!cands.length) return false;
    const needsPromo = cands.some(m => m.promotion);
    this.selected = null; this.legalTargets = [];
    this._dropped = viaDrag ? { from, to } : null;
    this.onMove({ from, to, promo: needsPromo });
    return true;
  }

  _bindPointer(){
    let drag = null, draw = null;
    const root = this.root;

    const colorFor = e => e.shiftKey ? DRAW_COLORS.shift : (e.ctrlKey || e.metaKey) ? DRAW_COLORS.ctrl : e.altKey ? DRAW_COLORS.alt : DRAW_COLORS.base;

    root.addEventListener('pointerdown', (e) => {
      const sq = this._sqFromPoint(e.clientX, e.clientY);
      if (!sq) return;
      // right button: draw arrows / marks (works any time, PC)
      if (e.button === 2){
        if (!this.drawEnabled) return;
        e.preventDefault();
        draw = { from: sq, to: sq, color: colorFor(e), id: e.pointerId };
        try { root.setPointerCapture(e.pointerId); } catch(_){}
        return;
      }
      if (e.button !== undefined && e.button !== 0) return;
      this.clearDrawings();
      if (!this.interactive) return;
      const p = this.position[sq];
      // tap a target while a piece is selected
      if (this.selected && sq !== this.selected && this.legalTargets.some(m => m.to === sq)){
        e.preventDefault();
        this._tryMove(this.selected, sq, false);
        return;
      }
      if (p && p.color === this.playerColor){
        e.preventDefault();
        const wasSelected = this.selected === sq;
        if (!wasSelected) this._select(sq);
        drag = { from: sq, startX: e.clientX, startY: e.clientY, moved: false, wasSelected, id: e.pointerId, touch: e.pointerType === 'touch' };
        try { root.setPointerCapture(e.pointerId); } catch(_){}
      } else if (this.selected){
        this._select(null);
      }
    });

    root.addEventListener('pointermove', (e) => {
      if (draw && e.pointerId === draw.id){
        const sq = this._sqFromPoint(e.clientX, e.clientY);
        if (sq && sq !== draw.to){ draw.to = sq; this._drawArrows(draw); }
        return;
      }
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < (drag.touch ? 7 : 4)) return;
      e.preventDefault();
      if (!drag.moved){
        drag.moved = true;
        drag.el = this.pieceEls[drag.from];
        if (drag.el){ drag.el.getAnimations && drag.el.getAnimations().forEach(a => a.cancel()); drag.el.classList.add('dragging'); }
        this.root.classList.add('is-dragging');
      }
      if (!drag.el) return;
      const rect = root.getBoundingClientRect();
      const sz = rect.width / 8;
      // on touch, lift the piece above the finger so it stays visible
      const lift = drag.touch ? 0.55 : 0;
      const scale = drag.touch ? 1.45 : 1.08;
      const x = (e.clientX - rect.left) / sz - 0.5, y = (e.clientY - rect.top) / sz - 0.5 - lift;
      drag.el.style.transform = this._tf(x, y, ` scale(${scale})`);
      this._hover(this._sqFromPoint(e.clientX, e.clientY));
    });

    const end = (e) => {
      if (draw && e.pointerId === draw.id){
        const d = draw; draw = null;
        const to = this._sqFromPoint(e.clientX, e.clientY) || d.to;
        this._toggleDrawing(d.from, to, d.color);
        return;
      }
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      this._hover(null);
      this.root.classList.remove('is-dragging');
      if (d.moved){
        const to = this._sqFromPoint(e.clientX, e.clientY);
        if (d.el) d.el.classList.remove('dragging');
        if (to && to !== d.from && this._tryMove(d.from, to, true)) return;
        if (to && to !== d.from) this.onIllegal();
        // illegal drop: glide back home, keep the piece selected
        if (d.el){
          const { x, y } = this._xy(d.from);
          const cur = d.el.style.transform;
          d.el.style.transform = this._tf(x, y);
          if (d.el.animate && this.settings.anim) d.el.animate([{ transform: cur }, { transform: this._tf(x, y) }], { duration: 160, easing: 'ease-out' });
        }
      } else if (d.wasSelected){
        this._select(null);
      }
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', (e) => {
      if (draw && e.pointerId === draw.id){ draw = null; this._drawArrows(); }
      if (drag && e.pointerId === drag.id){ drag = null; this._hover(null); this.root.classList.remove('is-dragging'); this.render(); }
    });
    root.addEventListener('contextmenu', e => e.preventDefault());
  }

  _hover(sq){
    if (this._hoverSq === sq && this._hoverEl) return;
    if (this._hoverEl){ this._hoverEl.remove(); this._hoverEl = null; }
    this._hoverSq = sq;
    if (!sq) return;
    const { x, y } = this._xy(sq);
    const d = document.createElement('div');
    d.className = 'hl hover';
    d.style.transform = this._tf(x, y);
    this.hlLayer.appendChild(d);
    this._hoverEl = d;
  }
}
