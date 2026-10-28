// Piece artwork — 20 original sets built from 6 hand-drawn shape families
// (Classic/Staunton, Modern, Minimal, Pixel, Letter coins, Icon tokens)
// combined with different materials and effects.
// All gradients / patterns / filters live in one hidden <svg> that is injected once.

// ======================================================================
// Shape family 1: Classic (Staunton-style) — parts are filled+outlined, details are contrast lines
// ======================================================================
const S_BASE = 'M10.8 38.5 C10.8 35.4 12.2 33.4 13.9 32.8 L31.1 32.8 C32.8 33.4 34.2 35.4 34.2 38.5 Z';
const BJ = (a, b) => `M${a} 32.9 H${b}`;
const STAUNTON = {
  p: {
    parts: [ S_BASE,
      'M19.5 21.4 C19.5 26 17.6 29.6 15 32.8 L30 32.8 C27.4 29.6 25.5 26 25.5 21.4 Z',
      'M17.2 19.2 H27.8 V21.8 H17.2 Z',
      'M22.5 8.9 A5.1 5.1 0 1 1 22.49 8.9 Z' ],
    details: [BJ(15.8, 29.2), 'M18.6 21.75 H26.4', 'M18.6 19.3 H26.4']
  },
  r: {
    parts: [ S_BASE,
      'M14.8 32.8 L16.2 17.5 H28.8 L30.2 32.8 Z',
      'M13.2 14.4 H31.8 V17.5 H13.2 Z',
      'M13.2 14.4 V7.6 H17.3 V10.5 H20.5 V7.6 H24.5 V10.5 H27.7 V7.6 H31.8 V14.4 Z' ],
    details: [BJ(14.4, 30.6), 'M14.6 14.45 H30.4', 'M16.2 17.5 H28.8', 'M15.4 29.6 H29.6']
  },
  b: {
    parts: [ S_BASE,
      'M17.8 26.4 C17.8 29.4 16.4 31.4 14.6 32.8 L30.4 32.8 C28.6 31.4 27.2 29.4 27.2 26.4 Z',
      'M15.4 23.7 H29.6 V26.6 H15.4 Z',
      'M22.5 9.4 C27.9 12.6 30.2 17.2 29.2 21.1 C28.7 23 26.5 23.7 22.5 23.7 C18.5 23.7 16.3 23 15.8 21.1 C14.8 17.2 17.1 12.6 22.5 9.4 Z',
      'M22.5 4.5 A2.6 2.6 0 1 1 22.49 4.5 Z' ],
    details: [BJ(15.5, 29.5), 'M16.8 23.8 H28.2', 'M16.8 26.5 H28.2', 'M25.2 13.8 L20.5 19.8']
  },
  n: {
    parts: [ S_BASE,
      'M14.2 32.8 C14.2 28.4 16.3 25.7 19.7 23.7 C17.4 24.2 14.7 25.6 12 25.4 C9.9 25.2 8.6 23.5 9.1 21.6 C9.5 20 11.2 18.6 13.3 16.8 C14.9 14.1 16.2 11.9 18.5 10 L19.1 5.6 L21.8 8.6 L23.3 5 L24.8 9.2 C30.2 10.4 34.2 15.2 34.4 22 C34.6 27 33.2 30.4 32.2 32.8 Z' ],
    details: [BJ(15.2, 30.8), 'M24.8 9.3 C29.3 11.8 31.8 16.2 32 22.6', 'M9.4 23 L12.1 22.7'],
    dots: [[17.1, 15.1, 1.2], [11.2, 20.7, 0.65]]
  },
  q: {
    parts: [ S_BASE,
      'M16.2 23 C16.2 27.6 15 30.6 13.9 32.8 L31.1 32.8 C30 30.6 28.8 27.6 28.8 23 Z',
      'M14.3 19.9 H30.7 V23.2 H14.3 Z',
      'M14.3 19.9 L10.7 10.6 L16.3 16.4 L17.7 8.4 L21.4 15.4 L22.5 7.3 L23.6 15.4 L27.3 8.4 L28.7 16.4 L34.3 10.6 L30.7 19.9 Z',
      'M10.7 8.6 A2 2 0 1 1 10.69 8.6 Z', 'M17.7 6.4 A2 2 0 1 1 17.69 6.4 Z', 'M22.5 5.3 A2 2 0 1 1 22.49 5.3 Z',
      'M27.3 6.4 A2 2 0 1 1 27.29 6.4 Z', 'M34.3 8.6 A2 2 0 1 1 34.29 8.6 Z' ],
    details: [BJ(15, 30), 'M15.6 20 H29.4', 'M15.6 23.1 H29.4', 'M15.5 29.8 H29.5']
  },
  k: {
    parts: [ S_BASE,
      'M16.2 23.6 C16.2 28 15 31 13.9 32.8 L31.1 32.8 C30 31 28.8 28 28.8 23.6 Z',
      'M14.3 20.5 H30.7 V23.8 H14.3 Z',
      'M15.3 20.5 C13.1 15.3 17 10.9 22.5 10.9 C28 10.9 31.9 15.3 29.7 20.5 Z',
      'M21.25 2.9 H23.75 V5.3 H26.1 V7.8 H23.75 V10.9 H21.25 V7.8 H18.9 V5.3 H21.25 Z' ],
    details: [BJ(15, 30), 'M15.6 20.6 H29.4', 'M15.6 23.7 H29.4', 'M15.5 30.2 H29.5', 'M22.5 11.4 V20.3', 'M17 15.8 C20 14.6 25 14.6 28 15.8']
  }
};

// ======================================================================
// Shape family 2: Modern (geometric)
// ======================================================================
const M_BASE = '<rect x="10" y="35.5" width="25" height="4.5" rx="2.2"/>';
const MODERN = {
  k: M_BASE + '<path d="M15.5 35.5 L29.5 35.5 L28 21 L17 21 Z"/><rect x="14" y="16.5" width="17" height="5.2" rx="2"/><rect x="21" y="3.5" width="3" height="11" rx="1.2"/><rect x="17" y="6.8" width="11" height="3" rx="1.2"/>',
  q: M_BASE + '<path d="M15.5 35.5 L29.5 35.5 L28 21.5 L17 21.5 Z"/><path d="M13.5 21.5 L15.6 10.5 L19.4 17.2 L22.5 7.5 L25.6 17.2 L29.4 10.5 L31.5 21.5 Z"/><circle cx="15.2" cy="8" r="1.9"/><circle cx="22.5" cy="5" r="1.9"/><circle cx="29.8" cy="8" r="1.9"/>',
  r: M_BASE + '<path d="M16 35.5 L29 35.5 L27.8 19 L17.2 19 Z"/><path d="M13.5 19 V10 h4 v3.2 h3.3 V10 h3.4 v3.2 h3.3 V10 h4 v9 Z"/>',
  b: M_BASE + '<path d="M22.5 10.5 C27.6 14.2 29.3 18.8 29.3 23.5 C29.3 29.4 26.4 32.5 22.5 32.5 C18.6 32.5 15.7 29.4 15.7 23.5 C15.7 18.8 17.4 14.2 22.5 10.5 Z"/><circle cx="22.5" cy="6.4" r="2.4"/><rect x="14.5" y="32.5" width="16" height="3" rx="1.5"/>',
  n: M_BASE + '<path d="M14 35.5 C14 30 17 27.5 19.5 25.5 L18 24.2 C15 25.2 12 26.2 10.2 25 C8.6 24 8.6 21.8 10 20.6 L16.5 13.5 C17.5 11 19 9.5 20.5 8.8 L21.5 5.5 L24.5 8.5 C29.5 10 33 14.5 33.5 21 C34 27 32.5 31 32 35.5 Z"/>',
  p: M_BASE + '<circle cx="22.5" cy="13.2" r="5.2"/><path d="M18 35.5 L27 35.5 L25.6 19.5 L19.4 19.5 Z"/>'
};
const MODERN_DETAIL = {
  n: c => `<circle cx="19.6" cy="13.8" r="1.3" fill="${c}"/>`,
  b: c => `<path d="M20 22.5 L25.3 16" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`
};

// ======================================================================
// Shape family 3: Minimal (bold flat geometry)
// ======================================================================
const MIN_BASE = '<rect x="11.5" y="34" width="22" height="4.6" rx="2.3"/>';
const MINIMAL = {
  p: MIN_BASE + '<circle cx="22.5" cy="25.5" r="8"/>',
  r: MIN_BASE + '<path d="M14 34 V11.5 H18.4 V15.6 H20.4 V11.5 H24.6 V15.6 H26.6 V11.5 H31 V34 Z"/>',
  b: MIN_BASE + '<path d="M22.5 8 C29.5 14 31.6 20.5 31.6 25.6 C31.6 30.8 27.6 34 22.5 34 C17.4 34 13.4 30.8 13.4 25.6 C13.4 20.5 15.5 14 22.5 8 Z"/>',
  n: MIN_BASE + '<path d="M15 34 V26 L10.5 23 L12.5 17.5 L19 12 L19.5 6.5 L23.5 10.5 L30 13.5 L32.5 22 L31.5 34 Z"/>',
  q: MIN_BASE + '<path d="M13 34 L10.5 12.5 L17.3 21 L22.5 8.5 L27.7 21 L34.5 12.5 L32 34 Z"/>',
  k: MIN_BASE + '<path d="M14.2 34 L15.8 17.5 H29.2 L30.8 34 Z"/><path d="M20.9 4.5 H24.1 V8.3 H27.9 V11.5 H24.1 V15.5 H20.9 V11.5 H17.1 V8.3 H20.9 Z"/>'
};
const MIN_DETAIL = {
  b: c => `<path d="M25.6 15.5 L20 23" stroke="${c}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`,
  n: c => `<circle cx="18.6" cy="16.4" r="1.6" fill="${c}"/>`,
  k: c => `<path d="M17.4 23.5 H27.6" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`,
  q: c => `<circle cx="22.5" cy="27" r="2.2" fill="${c}"/>`
};

// ======================================================================
// Shape family 4: Pixel art (16×16 masks, outline added automatically)
// ======================================================================
const PIXEL = {
  p: ['','','','.......##.......','......####......','......####......','.......##.......','......####......','.......##.......','.......##.......','......####......','.....######.....','....########....','....########....'],
  r: ['','','...##..##..##...','...##########...','...##########...','....########....','.....######.....','.....######.....','.....######.....','.....######.....','....########....','....########....','...##########...','...##########...'],
  n: ['','......#.#.......','......####......','.....######.....','....##.#####....','...#########....','..##########....','..###..######...','.......######...','......#######...','.....########...','....#########...','...##########...','...##########...'],
  b: ['','.......##.......','......####......','.....######.....','.....###.##.....','.....##.###.....','.....######.....','......####......','.....######.....','......####......','......####......','.....######.....','....########....','....########....'],
  q: ['','..#....##....#..','..##..####..##..','...##.####.##...','...##########...','....########....','.....######.....','......####......','......####......','.....######.....','.....######.....','....########....','...##########...','...##########...'],
  k: ['','.......##.......','.....######.....','.......##.......','......####......','.....######.....','....########....','.....######.....','......####......','.....######.....','.....######.....','....########....','...##########...','...##########...']
};
function pixelSVG(type, pal){
  const rows = PIXEL[type].map(r => (r || '').padEnd(16, '.'));
  while (rows.length < 16) rows.push('.'.repeat(16));
  const at = (x, y) => y >= 0 && y < 16 && x >= 0 && x < 16 && rows[y][x] === '#';
  const cells = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++){
    let c = null;
    if (at(x, y)){
      c = pal.fill;
      if (!at(x + 1, y) || !at(x, y + 1)) c = pal.shade;          // right/bottom edge shading
      if ((!at(x - 1, y) || !at(x, y - 1)) && at(x + 1, y) && at(x, y + 1)) c = pal.light; // top/left highlight
    } else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) c = pal.outline;
    cells.push(c);
  }
  // merge horizontal runs
  let out = '';
  for (let y = 0; y < 16; y++){
    let x = 0;
    while (x < 16){
      const c = cells[y * 16 + x];
      let w = 1;
      while (x + w < 16 && cells[y * 16 + x + w] === c) w++;
      if (c) out += `<rect x="${x}" y="${y + 0.5}" width="${w}" height="1" fill="${c}"/>`;
      x += w;
    }
  }
  return `<svg viewBox="-0.5 0 17 17" class="pc" shape-rendering="crispEdges">${out}</svg>`;
}

// ======================================================================
// Shared defs (gradients, patterns, filters)
// ======================================================================
const DEFS = `
<linearGradient id="cpt-wood-w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e2b8"/><stop offset=".55" stop-color="#e2b877"/><stop offset="1" stop-color="#c9954f"/></linearGradient>
<linearGradient id="cpt-wood-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9a6238"/><stop offset=".6" stop-color="#6a3c1d"/><stop offset="1" stop-color="#40220e"/></linearGradient>
<linearGradient id="cpt-marble-w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#e9ebee"/><stop offset=".55" stop-color="#d5d9de"/><stop offset="1" stop-color="#f4f5f7"/></linearGradient>
<linearGradient id="cpt-marble-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#565c66"/><stop offset=".45" stop-color="#2c3036"/><stop offset=".55" stop-color="#3d424a"/><stop offset="1" stop-color="#121417"/></linearGradient>
<linearGradient id="cpt-silver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#c4cad2"/><stop offset=".6" stop-color="#eef1f4"/><stop offset="1" stop-color="#9aa2ad"/></linearGradient>
<linearGradient id="cpt-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0a6"/><stop offset=".45" stop-color="#d9a52e"/><stop offset=".6" stop-color="#f3cf5f"/><stop offset="1" stop-color="#8f6100"/></linearGradient>
<linearGradient id="cpt-ruby" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0546c"/><stop offset=".55" stop-color="#c0142f"/><stop offset="1" stop-color="#6e0517"/></linearGradient>
<linearGradient id="cpt-ice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4feff"/><stop offset=".6" stop-color="#bfeafa"/><stop offset="1" stop-color="#86cfee"/></linearGradient>
<linearGradient id="cpt-fire" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd25e"/><stop offset=".45" stop-color="#f26a24"/><stop offset="1" stop-color="#8a150c"/></linearGradient>
<linearGradient id="cpt-jade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dcf7e4"/><stop offset=".55" stop-color="#93d6a8"/><stop offset="1" stop-color="#5aa875"/></linearGradient>
<linearGradient id="cpt-onyx" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a423f"/><stop offset=".6" stop-color="#171b1a"/><stop offset="1" stop-color="#050606"/></linearGradient>
<linearGradient id="cpt-glass-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".55"/><stop offset="1" stop-color="#dfe9ff" stop-opacity=".75"/></linearGradient>
<linearGradient id="cpt-glass-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4a66" stop-opacity=".92"/><stop offset=".5" stop-color="#111827" stop-opacity=".7"/><stop offset="1" stop-color="#0b1020" stop-opacity=".9"/></linearGradient>
<radialGradient id="cpt-3d-w" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#e6e6e6"/><stop offset="1" stop-color="#a9a9a9"/></radialGradient>
<radialGradient id="cpt-3d-b" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#7a7a7a"/><stop offset=".55" stop-color="#2b2b2b"/><stop offset="1" stop-color="#050505"/></radialGradient>
<radialGradient id="cpt-coin-w" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fffdf6"/><stop offset="1" stop-color="#e3dcc8"/></radialGradient>
<radialGradient id="cpt-coin-b" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#4a4540"/><stop offset="1" stop-color="#1c1916"/></radialGradient>
<pattern id="cpt-hatch" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.4" height="2.4" fill="#ffffff"/><rect width="1.05" height="2.4" fill="#1a1a1a"/></pattern>
<filter id="cpt-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceGraphic" stdDeviation=".9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="cpt-sketch" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="1" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.3" xChannelSelector="R" yChannelSelector="G"/></filter>
<filter id="cpt-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx=".5" dy="1.3" stdDeviation=".9" flood-color="#000" flood-opacity=".45"/></filter>
`;
let defsReady = false;
function ensureDefs(){
  if (defsReady || typeof document === 'undefined') return;
  defsReady = true;
  const holder = document.createElement('div');
  holder.innerHTML = `<svg id="cpt-piece-defs" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true"><defs>${DEFS}</defs></svg>`;
  document.body.appendChild(holder.firstChild);
}

// ======================================================================
// Renderers
// ======================================================================
const VB_CLASSIC = '3.5 2 38 38';
const VB_MODERN = '2.5 2 40 40';

function classic(type, o){
  const P = STAUNTON[type];
  let s = `<svg viewBox="${VB_CLASSIC}" class="pc">`;
  const body = (fill, stroke, sw, extra = '') => {
    let g = `<g fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"${extra}>`;
    for (const d of P.parts) g += `<path d="${d}"/>`;
    return g + '</g>';
  };
  if (o.hardShadow) s += `<g transform="translate(1.1 1.1)">${body(o.hardShadow, o.hardShadow, o.sw || 1.5)}</g>`;
  s += `<g${o.filter ? ` filter="url(#${o.filter})"` : ''}>`;
  s += body(o.fill, o.stroke, o.sw || 1.5);
  if (o.det){
    s += `<g fill="none" stroke="${o.det}" stroke-width="${o.detW || 1.15}" stroke-linecap="round">`;
    for (const d of P.details) s += `<path d="${d}"/>`;
    s += '</g>';
    for (const [cx, cy, r] of (P.dots || [])) s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${o.det}"/>`;
  }
  return s + '</g></svg>';
}

function modern(type, o){
  let s = `<svg viewBox="${VB_MODERN}" class="pc">`;
  if (o.hardShadow) s += `<g transform="translate(1.3 1.3)" fill="${o.hardShadow}" stroke="${o.hardShadow}" stroke-width="${o.sw || 1.4}" stroke-linejoin="round">${MODERN[type]}</g>`;
  s += `<g${o.filter ? ` filter="url(#${o.filter})"` : ''}>`;
  s += `<g fill="${o.fill}" stroke="${o.stroke}" stroke-width="${o.sw || 1.4}" stroke-linejoin="round">${MODERN[type]}</g>`;
  if (o.gloss) s += `<ellipse cx="19.5" cy="15" rx="3.2" ry="5.5" fill="#fff" opacity=".35" transform="rotate(18 19.5 15)"/>`;
  if (MODERN_DETAIL[type] && o.det) s += MODERN_DETAIL[type](o.det);
  return s + '</g></svg>';
}

function minimal(type, o){
  let s = `<svg viewBox="${VB_MODERN}" class="pc"><g fill="${o.fill}" stroke="${o.stroke}" stroke-width="${o.sw || 2}" stroke-linejoin="round">${MINIMAL[type]}</g>`;
  if (MIN_DETAIL[type]) s += MIN_DETAIL[type](o.det);
  return s + '</svg>';
}

const LETTER = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: 'P' };
function letterCoin(type, o){
  return `<svg viewBox="${VB_MODERN}" class="pc"><g filter="url(#cpt-shadow)">
    <circle cx="22.5" cy="22" r="15.6" fill="${o.fill}" stroke="${o.ring}" stroke-width="2"/>
    <circle cx="22.5" cy="22" r="12.4" fill="none" stroke="${o.ring}" stroke-width=".8" opacity=".6"/>
    <text x="22.5" y="22.4" text-anchor="middle" dominant-baseline="central" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="16" fill="${o.ink}">${LETTER[type]}</text>
  </g></svg>`;
}

function iconToken(type, o){
  const P = STAUNTON[type];
  let icon = '';
  for (const d of P.parts) icon += `<path d="${d}"/>`;
  return `<svg viewBox="${VB_MODERN}" class="pc"><g filter="url(#cpt-shadow)">
    <circle cx="22.5" cy="22" r="15.8" fill="${o.fill}" stroke="${o.ring}" stroke-width="2.2"/>
    <circle cx="22.5" cy="22" r="13" fill="none" stroke="${o.ring}" stroke-width=".9"/>
    <g transform="translate(22.5 22.3) scale(.58) translate(-22.5 -21.5)" fill="${o.ink}" stroke="${o.ink}" stroke-width="1.2" stroke-linejoin="round">${icon}</g>
  </g></svg>`;
}

// ======================================================================
// The 20 sets
// ======================================================================
const W = 'w';
const SETS = {
  staunton: { name: 'Classic', r: (t, c) => classic(t, c === W
      ? { fill: '#ffffff', stroke: '#161616', det: '#161616', detW: 1.2 }
      : { fill: '#161616', stroke: '#161616', det: '#ededed', detW: 1.05 }) },
  prism:    { name: 'Modern', r: (t, c) => modern(t, c === W
      ? { fill: '#f6f1e3', stroke: '#403a31', det: '#403a31' }
      : { fill: '#332e29', stroke: '#15120f', det: '#d9d2c2' }) },
  mono:     { name: 'Flat', r: (t, c) => modern(t, c === W
      ? { fill: '#ffffff', stroke: '#30302c', det: '#30302c' }
      : { fill: '#111111', stroke: '#000000', det: '#d9d4c8' }) },
  wood:     { name: 'Wood', r: (t, c) => classic(t, c === W
      ? { fill: 'url(#cpt-wood-w)', stroke: '#5a3a1a', det: '#6b4520', filter: 'cpt-shadow' }
      : { fill: 'url(#cpt-wood-b)', stroke: '#24130a', det: '#e2bb88', detW: 1, filter: 'cpt-shadow' }) },
  marble:   { name: 'Marble', r: (t, c) => classic(t, c === W
      ? { fill: 'url(#cpt-marble-w)', stroke: '#4a4f57', det: '#7a8089', filter: 'cpt-shadow' }
      : { fill: 'url(#cpt-marble-b)', stroke: '#0b0c0e', det: '#aeb4bd', detW: 1, filter: 'cpt-shadow' }) },
  metal:    { name: 'Gold & Silver', r: (t, c) => classic(t, c === W
      ? { fill: 'url(#cpt-silver)', stroke: '#4a5058', det: '#5d646d', filter: 'cpt-shadow' }
      : { fill: 'url(#cpt-gold)', stroke: '#4d3400', det: '#6b4a00', filter: 'cpt-shadow' }) },
  neon:     { name: 'Neon', r: (t, c) => classic(t, c === W
      ? { fill: '#062a33', stroke: '#2ee6ff', det: '#2ee6ff', sw: 1.6, detW: 1, filter: 'cpt-glow' }
      : { fill: '#2b0626', stroke: '#ff40d8', det: '#ff40d8', sw: 1.6, detW: 1, filter: 'cpt-glow' }) },
  glass:    { name: 'Glass', r: (t, c) => modern(t, c === W
      ? { fill: 'url(#cpt-glass-w)', stroke: 'rgba(30,45,70,.85)', det: 'rgba(30,45,70,.9)', gloss: true }
      : { fill: 'url(#cpt-glass-b)', stroke: 'rgba(0,0,0,.85)', det: 'rgba(220,230,255,.85)', gloss: true }) },
  ruby:     { name: 'Ruby', r: (t, c) => classic(t, c === W
      ? { fill: '#fbf6ec', stroke: '#7a1022', det: '#7a1022' }
      : { fill: 'url(#cpt-ruby)', stroke: '#3d0410', det: '#ffd5dc', detW: 1 }) },
  ink:      { name: 'Ink', r: (t, c) => classic(t, c === W
      ? { fill: '#ffffff', stroke: '#1a1a1a', det: '#1a1a1a', sw: 1.25, detW: 1 }
      : { fill: 'url(#cpt-hatch)', stroke: '#1a1a1a', det: '#1a1a1a', sw: 1.35, detW: 1.1 }) },
  sketch:   { name: 'Sketch', r: (t, c) => classic(t, c === W
      ? { fill: '#fdfbf5', stroke: '#2b2b2b', det: '#2b2b2b', sw: 1.35, filter: 'cpt-sketch' }
      : { fill: '#3a3a3a', stroke: '#111111', det: '#f0f0f0', sw: 1.35, filter: 'cpt-sketch' }) },
  pixel:    { name: 'Pixel', r: (t, c) => pixelSVG(t, c === W
      ? { fill: '#f2f2f2', light: '#ffffff', shade: '#bdbdbd', outline: '#1c1c1c' }
      : { fill: '#3b3b46', light: '#5d5d6c', shade: '#25252d', outline: '#0b0b0f' }) },
  minimal:  { name: 'Minimal', r: (t, c) => minimal(t, c === W
      ? { fill: '#fafafa', stroke: '#1b1b1b', det: '#1b1b1b', sw: 2.2 }
      : { fill: '#1b1b1b', stroke: '#1b1b1b', det: '#fafafa', sw: 2.2 }) },
  letters:  { name: 'Letters', r: (t, c) => letterCoin(t, c === W
      ? { fill: 'url(#cpt-coin-w)', ring: '#2a2a2a', ink: '#1d1d1d' }
      : { fill: 'url(#cpt-coin-b)', ring: '#0a0a0a', ink: '#f4efe2' }) },
  tokens:   { name: 'Tokens', r: (t, c) => iconToken(t, c === W
      ? { fill: 'url(#cpt-coin-w)', ring: '#b08d57', ink: '#2a241c' }
      : { fill: 'url(#cpt-coin-b)', ring: '#b08d57', ink: '#efe6d2' }) },
  shaded:   { name: 'Shaded 3D', r: (t, c) => classic(t, c === W
      ? { fill: 'url(#cpt-3d-w)', stroke: '#4d4d4d', det: '#6a6a6a', filter: 'cpt-shadow' }
      : { fill: 'url(#cpt-3d-b)', stroke: '#000000', det: '#9a9a9a', detW: 1, filter: 'cpt-shadow' }) },
  candy:    { name: 'Candy', r: (t, c) => modern(t, c === W
      ? { fill: '#bff5e8', stroke: '#2e8b7a', det: '#2e8b7a', gloss: true }
      : { fill: '#e0457b', stroke: '#7a1238', det: '#ffe3ee', gloss: true }) },
  icefire:  { name: 'Ice & Fire', r: (t, c) => classic(t, c === W
      ? { fill: 'url(#cpt-ice)', stroke: '#1f6f8f', det: '#1f6f8f', filter: 'cpt-shadow' }
      : { fill: 'url(#cpt-fire)', stroke: '#3a0800', det: '#fff0c2', detW: 1, filter: 'cpt-shadow' }) },
  comic:    { name: 'Comic', r: (t, c) => modern(t, c === W
      ? { fill: '#ffe066', stroke: '#111111', det: '#111111', sw: 2.1, hardShadow: '#111111' }
      : { fill: '#4361ee', stroke: '#111111', det: '#ffffff', sw: 2.1, hardShadow: '#111111' }) },
  jade:     { name: 'Jade & Onyx', r: (t, c) => modern(t, c === W
      ? { fill: 'url(#cpt-jade)', stroke: '#2a6b44', det: '#2a6b44' }
      : { fill: 'url(#cpt-onyx)', stroke: '#000000', det: '#d4af37' }) }
};

export const PIECE_STYLES = Object.entries(SETS).map(([id, s]) => ({ id, name: s.name }));

export function pieceSVG(type, color, style){
  ensureDefs();
  type = type.toLowerCase();
  const set = SETS[style] || SETS.staunton;
  return set.r(type, color);
}
