// Custom background photo: picked from Photos / Files, resized, stored in IndexedDB.
const DB_NAME = 'cpt-files', STORE = 'files', KEY = 'background';
let currentUrl = null;

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idb(mode, fn){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const r = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(r && r.result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBackgroundBlob(){
  try { return await idb('readonly', s => s.get(KEY)); } catch(_) { return null; }
}

// Downscale big photos so they load fast and fit in storage.
async function shrink(file, maxSide = 2200){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return await new Promise(res => c.toBlob(b => res(b || file), 'image/jpeg', 0.86));
  } finally { URL.revokeObjectURL(url); }
}

export async function saveBackground(file){
  const blob = await shrink(file);
  await idb('readwrite', s => s.put(blob, KEY));
  return blob;
}

export async function clearBackground(){
  try { await idb('readwrite', s => s.delete(KEY)); } catch(_){}
  applyBackgroundBlob(null);
}

export function applyBackgroundBlob(blob){
  const layer = document.getElementById('bg-layer');
  if (currentUrl){ URL.revokeObjectURL(currentUrl); currentUrl = null; }
  if (blob){
    currentUrl = URL.createObjectURL(blob);
    layer.style.backgroundImage = `url("${currentUrl}")`;
    document.documentElement.classList.add('has-bg');
  } else {
    layer.style.backgroundImage = '';
    document.documentElement.classList.remove('has-bg');
  }
  return currentUrl;
}

export function backgroundUrl(){ return currentUrl; }
