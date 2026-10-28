// Stockfish (WASM, lite single-thread) wrapper with a serialized command queue.
export class Engine {
  constructor(url = 'engine/stockfish-18-lite-single.js'){
    this.url = url;
    this.w = null;
    this.ready = false;
    this._listeners = [];
    this._chain = Promise.resolve();
    this._skill = 20;
    this._multipv = 1;
  }

  _post(cmd){ this.w.postMessage(cmd); }

  _waitFor(pred, timeout = 20000){
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { off(); reject(new Error('engine timeout')); }, timeout);
      const fn = (line) => {
        const r = pred(line);
        if (r !== undefined){ clearTimeout(timer); off(); resolve(r); }
      };
      const off = () => { this._listeners = this._listeners.filter(l => l !== fn); };
      this._listeners.push(fn);
    });
  }

  async init(){
    this.w = new Worker(this.url);
    this.w.onmessage = (e) => {
      const line = typeof e.data === 'string' ? e.data : (e.data && e.data.data) || '';
      for (const l of [...this._listeners]) l(line);
    };
    this.w.onerror = (e) => console.error('engine worker error', e.message || e);
    const p = this._waitFor(l => l.includes('uciok') ? true : undefined, 30000);
    this._post('uci');
    await p;
    this._post('setoption name Use NNUE value true');
    const r = this._waitFor(l => l.includes('readyok') ? true : undefined, 30000);
    this._post('isready');
    await r;
    this.ready = true;
  }

  newGame(){ if (this.w) this._post('ucinewgame'); }

  stop(){ if (this.w) this._post('stop'); }

  // opts: {movetime?, depth?, nodes?, multipv=1, skill=20}
  // resolves {best, ponder, lines: [{multipv, depth, score:{cp,mate}, pv:[uci...]}]}  (score = side-to-move POV)
  go(fen, opts = {}){
    const job = () => new Promise((resolve, reject) => {
      const multipv = opts.multipv || 1;
      const skill = opts.skill == null ? 20 : opts.skill;
      if (skill !== this._skill){ this._post('setoption name Skill Level value ' + skill); this._skill = skill; }
      if (multipv !== this._multipv){ this._post('setoption name MultiPV value ' + multipv); this._multipv = multipv; }
      const lines = {};
      const timer = setTimeout(() => { off(); this._post('stop'); reject(new Error('go timeout')); }, 60000);
      const fn = (line) => {
        if (line.startsWith('info ') && line.includes(' pv ')){
          const inf = parseInfo(line);
          if (inf) lines[inf.multipv] = inf;
        } else if (line.startsWith('bestmove')){
          clearTimeout(timer); off();
          const parts = line.split(/\s+/);
          resolve({ best: parts[1], ponder: parts[3] || null, lines: Object.values(lines).sort((a,b)=>a.multipv-b.multipv) });
        }
      };
      const off = () => { this._listeners = this._listeners.filter(l => l !== fn); };
      this._listeners.push(fn);
      this._post('position fen ' + fen);
      let cmd = 'go';
      if (opts.depth) cmd += ' depth ' + opts.depth;
      if (opts.nodes) cmd += ' nodes ' + opts.nodes;
      if (opts.movetime) cmd += ' movetime ' + opts.movetime;
      if (cmd === 'go') cmd = 'go movetime 300';
      this._post(cmd);
    });
    const run = this._chain.then(job, job);
    // keep the chain alive even if a job fails
    this._chain = run.catch(() => {});
    return run;
  }

  // Strong evaluation of a position. Returns {score:{cp,mate}, best, pv}
  async evaluate(fen, movetime = 300){
    const res = await this.go(fen, { movetime, multipv: 1, skill: 20 });
    const l = res.lines[0];
    return { score: l ? l.score : { cp: 0 }, best: res.best, pv: l ? l.pv : [] };
  }
}

function parseInfo(line){
  const t = line.split(/\s+/);
  const inf = { multipv: 1, depth: 0, score: null, pv: [] };
  for (let i = 0; i < t.length; i++){
    if (t[i] === 'depth') inf.depth = +t[i+1];
    else if (t[i] === 'multipv') inf.multipv = +t[i+1];
    else if (t[i] === 'score'){
      if (t[i+1] === 'cp') inf.score = { cp: +t[i+2], mate: null };
      else if (t[i+1] === 'mate') inf.score = { cp: null, mate: +t[i+2] };
    } else if (t[i] === 'pv'){ inf.pv = t.slice(i+1); break; }
  }
  if (!inf.score || !inf.pv.length) return null;
  return inf;
}
