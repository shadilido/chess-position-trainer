// Interactive chessboard: tap-tap + drag, legal-move hints, last move, check, arrows, animation.
import { FILES, sqToRC, rcToSq } from './util.js';
import { pieceSVG } from './pieces.js';

export class Board {
  constructor(root, opts = {}){
    this.root = root;
    this.orientation = 'w';
    this.interactive = false;
    this.playerColor = 'w';
    this.onMove = opts.onMove || (() => {});
    this.getLegal = opts.getLegal || (() => []);   // (fromSq) => [{to, promotion, flags}]
    this.settings = { coords: true, legal: true, anim: true, pieces: 'prism' };
    this.position = {};   // sq -> {type,color}
    this.lastMove = null;
    this.checkSq = null;
    this.selected = null;
    this.legalTargets = [];
    this.arrows = [];
    this.badge = null;      // {sq, sym, color}
    this.lastTint = null;   // css color for last-move highlight
    this._build();
  }

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
    this.svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgLayer.setAttribute('viewBox', '0 0 800 800');
    this.svgLayer.setAttribute('class', 'b-arrows');
    this.root.append(this.sqLayer, this.hlLayer, this.pcLayer, this.svgLayer, this.bdLayer);
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

  // position: chess.js board() array or fen
  setPosition(chess, lastMove = null, animate = true){
    const pos = {};
    const b = chess.board();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++){
      const p = b[r][c]; if (p) pos[rcToSq(r,c)] = { type: p.type, color: p.color };
    }
    this.position = pos;
    this.lastMove = lastMove;
    this.checkSq = null;
    if (chess.inCheck()){
      const t = chess.turn();
      for (const [sq,p] of Object.entries(pos)) if (p.type === 'k' && p.color === t) this.checkSq = sq;
    }
    this.selected = null; this.legalTargets = [];
    this.render(animate && this.settings.anim && !!lastMove);
  }

  setArrows(arr){ this.arrows = arr || []; this._drawArrows(); }

  _xy(sq){
    const { r, c } = sqToRC(sq);
    const flip = this.orientation === 'b';
    return { x: flip ? 7 - c : c, y: flip ? 7 - r : r };
  }

  _sqFromPoint(clientX, clientY){
    const rect = this.root.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / rect.width * 8);
    const y = Math.floor((clientY - rect.top) / rect.height * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    const flip = this.orientation === 'b';
    return rcToSq(flip ? 7 - y : y, flip ? 7 - x : x);
  }

  render(animate){
    // coordinates
    const flip = this.orientation === 'b';
    const sqs = this.sqLayer.children;
    for (let i = 0; i < 64; i++){
      const y = Math.floor(i / 8), x = i % 8;
      const el = sqs[i];
      el.innerHTML = '';
      if (this.settings.coords){
        if (x === 0){
          const rank = flip ? y + 1 : 8 - y;
          el.insertAdjacentHTML('beforeend', `<span class="co rk">${rank}</span>`);
        }
        if (y === 7){
          const file = FILES[flip ? 7 - x : x];
          el.insertAdjacentHTML('beforeend', `<span class="co fl">${file}</span>`);
        }
      }
    }
    // highlights
    this.hlLayer.innerHTML = '';
    const addHl = (sq, cls) => {
      const { x, y } = this._xy(sq);
      const d = document.createElement('div');
      d.className = 'hl ' + cls;
      d.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
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
    // pieces
    this.pcLayer.innerHTML = '';
    this.pieceEls = {};
    for (const [sq, p] of Object.entries(this.position)){
      const { x, y } = this._xy(sq);
      const d = document.createElement('div');
      d.className = 'piece';
      d.dataset.sq = sq;
      d.innerHTML = pieceSVG(p.type, p.color, this.settings.pieces);
      d.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
      this.pcLayer.appendChild(d);
      this.pieceEls[sq] = d;
    }
    if (animate && this.lastMove) this._animate(this.lastMove);
    this._drawArrows();
    this._drawBadge();
  }

  setBadge(b, tint){ this.badge = b; this.lastTint = tint || null; }

  _drawBadge(){
    this.bdLayer.innerHTML = '';
    if (!this.badge) return;
    const { x, y } = this._xy(this.badge.sq);
    const d = document.createElement('div');
    d.className = 'bd-cell';
    d.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
    d.innerHTML = `<span class="bd" style="background:${this.badge.color}">${this.badge.sym}</span>`;
    this.bdLayer.appendChild(d);
  }

  _animate(m){
    const moves = [[m.from, m.to]];
    // castling rook
    const p = this.position[m.to];
    if (p && p.type === 'k' && Math.abs(FILES.indexOf(m.from[0]) - FILES.indexOf(m.to[0])) === 2){
      const rank = m.to[1];
      if (m.to[0] === 'g') moves.push(['h' + rank, 'f' + rank]);
      else moves.push(['a' + rank, 'd' + rank]);
    }
    for (const [from, to] of moves){
      const el = this.pieceEls[to]; if (!el) continue;
      const a = this._xy(from), b = this._xy(to);
      el.style.transition = 'none';
      el.style.transform = `translate(${a.x * 100}%, ${a.y * 100}%)`;
      el.getBoundingClientRect();
      el.style.transition = '';
      el.classList.add('moving');
      requestAnimationFrame(() => {
        el.style.transform = `translate(${b.x * 100}%, ${b.y * 100}%)`;
        setTimeout(() => el.classList.remove('moving'), 220);
      });
    }
  }

  _drawArrows(){
    const svg = this.svgLayer;
    svg.innerHTML = '';
    for (const a of this.arrows){
      const f = this._xy(a.from), t = this._xy(a.to);
      const x1 = f.x * 100 + 50, y1 = f.y * 100 + 50, x2 = t.x * 100 + 50, y2 = t.y * 100 + 50;
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len;
      const head = 34, w = 15;
      const ex = x2 - ux * head, ey = y2 - uy * head;
      const sx = x1 + ux * 22, sy = y1 + uy * 22;
      const px = -uy, py = ux;
      const pts = [
        [sx + px * w / 2, sy + py * w / 2], [ex + px * w / 2, ey + py * w / 2], [ex + px * w * 1.4, ey + py * w * 1.4],
        [x2 - ux * 6, y2 - uy * 6],
        [ex - px * w * 1.4, ey - py * w * 1.4], [ex - px * w / 2, ey - py * w / 2], [sx - px * w / 2, sy - py * w / 2]
      ].map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', pts);
      poly.setAttribute('fill', a.color || 'rgba(255,170,0,.8)');
      poly.setAttribute('opacity', a.opacity || '0.85');
      svg.appendChild(poly);
    }
  }

  _select(sq){
    this.selected = sq;
    this.legalTargets = sq ? this.getLegal(sq) : [];
    this.render(false);
  }

  _tryMove(from, to){
    const cands = this.legalTargets.filter(m => m.to === to);
    if (!cands.length) return false;
    const needsPromo = cands.some(m => m.promotion);
    this.selected = null; this.legalTargets = [];
    this.onMove({ from, to, promo: needsPromo });
    return true;
  }

  _bindPointer(){
    let drag = null;
    const root = this.root;
    root.addEventListener('pointerdown', (e) => {
      if (!this.interactive) return;
      if (e.button !== undefined && e.button !== 0) return;
      const sq = this._sqFromPoint(e.clientX, e.clientY);
      if (!sq) return;
      const p = this.position[sq];
      // tap target while selected
      if (this.selected && sq !== this.selected && this.legalTargets.some(m => m.to === sq)){
        e.preventDefault();
        this._tryMove(this.selected, sq);
        return;
      }
      if (p && p.color === this.playerColor){
        e.preventDefault();
        const wasSelected = this.selected === sq;
        if (!wasSelected) this._select(sq);
        const el = this.pieceEls[sq];
        drag = { from: sq, el, startX: e.clientX, startY: e.clientY, moved: false, wasSelected, id: e.pointerId };
        try { root.setPointerCapture(e.pointerId); } catch(_){}
      } else {
        if (this.selected){ this._select(null); }
      }
    });
    root.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      e.preventDefault();
      if (!drag.moved){
        drag.moved = true;
        drag.el = this.pieceEls[drag.from];
        if (drag.el) drag.el.classList.add('dragging');
      }
      if (!drag.el) return;
      const rect = root.getBoundingClientRect();
      const sz = rect.width / 8;
      const x = (e.clientX - rect.left) / sz - 0.5, y = (e.clientY - rect.top) / sz - 0.5;
      drag.el.style.transform = `translate(${x * 100}%, ${y * 100}%) scale(1.12)`;
      const over = this._sqFromPoint(e.clientX, e.clientY);
      this._hover(over);
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      this._hover(null);
      if (d.moved){
        const to = this._sqFromPoint(e.clientX, e.clientY);
        if (to && to !== d.from && this._tryMove(d.from, to)) return;
        this.render(false); // snap back, keep selection
      } else if (d.wasSelected){
        this._select(null);
      }
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', (e) => { if (drag){ drag = null; this._hover(null); this.render(false); } });
    root.addEventListener('contextmenu', e => e.preventDefault());
  }

  _hover(sq){
    if (this._hoverEl){ this._hoverEl.remove(); this._hoverEl = null; }
    if (!sq) return;
    const { x, y } = this._xy(sq);
    const d = document.createElement('div');
    d.className = 'hl hover';
    d.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
    this.hlLayer.appendChild(d);
    this._hoverEl = d;
  }
}
