// Original piece artwork (hand-drawn geometric sets) + a glyph set.
// viewBox 0 0 45 45

const BASE = '<rect x="10" y="35.5" width="25" height="4.5" rx="2.2"/>';

const SHAPES = {
  k: BASE +
     '<path d="M15.5 35.5 L29.5 35.5 L28 21 L17 21 Z"/>' +
     '<rect x="14" y="16.5" width="17" height="5.2" rx="2"/>' +
     '<rect x="21" y="3.5" width="3" height="11" rx="1.2"/>' +
     '<rect x="17" y="6.8" width="11" height="3" rx="1.2"/>',
  q: BASE +
     '<path d="M15.5 35.5 L29.5 35.5 L28 21.5 L17 21.5 Z"/>' +
     '<path d="M13.5 21.5 L15.6 10.5 L19.4 17.2 L22.5 7.5 L25.6 17.2 L29.4 10.5 L31.5 21.5 Z"/>' +
     '<circle cx="15.2" cy="8" r="1.9"/><circle cx="22.5" cy="5" r="1.9"/><circle cx="29.8" cy="8" r="1.9"/>',
  r: BASE +
     '<path d="M16 35.5 L29 35.5 L27.8 19 L17.2 19 Z"/>' +
     '<path d="M13.5 19 V10 h4 v3.2 h3.3 V10 h3.4 v3.2 h3.3 V10 h4 v9 Z"/>',
  b: BASE +
     '<path d="M22.5 10.5 C27.6 14.2 29.3 18.8 29.3 23.5 C29.3 29.4 26.4 32.5 22.5 32.5 C18.6 32.5 15.7 29.4 15.7 23.5 C15.7 18.8 17.4 14.2 22.5 10.5 Z"/>' +
     '<circle cx="22.5" cy="6.4" r="2.4"/>' +
     '<rect x="14.5" y="32.5" width="16" height="3" rx="1.5"/>',
  n: BASE +
     '<path d="M14 35.5 C14 30 17 27.5 19.5 25.5 L18 24.2 C15 25.2 12 26.2 10.2 25 C8.6 24 8.6 21.8 10 20.6 L16.5 13.5 C17.5 11 19 9.5 20.5 8.8 L21.5 5.5 L24.5 8.5 C29.5 10 33 14.5 33.5 21 C34 27 32.5 31 32 35.5 Z"/>',
  p: BASE +
     '<circle cx="22.5" cy="13.2" r="5.2"/>' +
     '<path d="M18 35.5 L27 35.5 L25.6 19.5 L19.4 19.5 Z"/>'
};

const KNIGHT_EYE = '<circle cx="19.6" cy="13.8" r="1.3" class="eye"/>';
const BISHOP_SLIT = '<path d="M20 22.5 L25.3 16" class="slit"/>';

const GLYPHS = { k:'\u265A\uFE0E', q:'\u265B\uFE0E', r:'\u265C\uFE0E', b:'\u265D\uFE0E', n:'\u265E\uFE0E', p:'\u265F\uFE0E' };

export const PIECE_STYLES = [
  { id:'prism',  name:'Prism'   },
  { id:'mono',   name:'Mono'    },
  { id:'glyph',  name:'Classic' }
];

export function pieceSVG(type, color, style){
  type = type.toLowerCase();
  if (style === 'glyph'){
    const fill = color === 'w' ? '#f6f2e7' : '#232019';
    const stroke = color === 'w' ? '#2a2620' : '#c9c2b2';
    return `<svg viewBox="2 1.5 41 41" class="pc"><text x="22.5" y="36" font-size="36" text-anchor="middle" fill="${fill}" stroke="${stroke}" stroke-width="0.9" paint-order="stroke" font-family="serif">${GLYPHS[type]}</text></svg>`;
  }
  let fill, stroke, detail;
  if (style === 'mono'){
    fill = color === 'w' ? '#ffffff' : '#111111';
    stroke = color === 'w' ? '#30302c' : '#000000';
    detail = color === 'w' ? '#30302c' : '#d9d4c8';
  } else { // prism
    fill = color === 'w' ? '#f6f1e3' : '#332e29';
    stroke = color === 'w' ? '#403a31' : '#15120f';
    detail = color === 'w' ? '#403a31' : '#d9d2c2';
  }
  let extra = '';
  if (type === 'n') extra = KNIGHT_EYE.replace('class="eye"', `fill="${detail}"`);
  if (type === 'b') extra = BISHOP_SLIT.replace('class="slit"', `fill="none" stroke="${detail}" stroke-width="2" stroke-linecap="round"`);
  return `<svg viewBox="2 1.5 41 41" class="pc"><g fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round">${SHAPES[type]}</g>${extra}</svg>`;
}
