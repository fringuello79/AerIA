// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Aggiornamento automatico: all'avvio (e ogni 6 ore) l'app, se c'è rete e l'aereo è a terra, legge le pagine di
// rilascio pubblicate su GitHub e, se trova una versione più nuova, la propone. L'APK si scarica, se ne controlla
// l'impronta SHA-256 pubblicata e lo installa Android, sempre con la conferma del pilota. Senza rete non succede
// nulla: il programma funziona con i dati del pacchetto installato.

// Canali in ordine: il primo è il repository pubblico che contiene solo le versioni pubblicate (il codice resta
// privato); il secondo è il repository del programma, usabile solo se un giorno diventerà pubblico.
export const UPDATE_CHANNELS = [
  'https://api.github.com/repos/fringuello79/AerIA/releases?per_page=10',
];
export const CHECK_EVERY_MS = 6 * 3600e3;

// «v0.18.0», «0.18.0+57» → [0, 18, 0]; null se non è un numero di versione
export function parseVersion(s) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[+-].*)?$/.exec(String(s || '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
export function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) return NaN;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

// Impronta SHA-256: campo «digest» dell'allegato (GitHub) o riga «SHA-256: …» nelle note del rilascio
export function sha256Of(rel, asset) {
  const d = /^sha256:([0-9a-f]{64})$/i.exec(asset?.digest || '');
  if (d) return d[1].toLowerCase();
  const re = new RegExp(`${String(asset?.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*?([0-9a-f]{64})|SHA-?256[^0-9a-f]*([0-9a-f]{64})`, 'i');
  const m = re.exec(rel?.body || '');
  return m ? (m[1] || m[2]).toLowerCase() : '';
}

// Dall'elenco dei rilasci (API GitHub) la versione più alta, non bozza, con un APK allegato, più nuova di «current».
export function pickUpdate(releases, current) {
  let best = null;
  for (const rel of Array.isArray(releases) ? releases : []) {
    if (!rel || rel.draft) continue;
    const ver = parseVersion(rel.tag_name) && rel.tag_name.replace(/^v/, '');
    if (!ver) continue;
    const apk = (rel.assets || []).find(a => /\.apk$/i.test(a.name || '') && a.browser_download_url);
    if (!apk) continue;
    if (!(compareVersions(ver, current) > 0)) continue;
    if (best && !(compareVersions(ver, best.version) > 0)) continue;
    best = {
      version: ver, url: apk.browser_download_url, name: apk.name, size: apk.size || 0,
      sha256: sha256Of(rel, apk), notes: notesOf(rel.body), page: rel.html_url || '', date: rel.published_at || '',
    };
  }
  return best;
}

// Note brevi per la finestra: le prime righe dell'elenco delle novità, senza la parte tecnica
export function notesOf(body, max = 6) {
  const lines = String(body || '').split(/\r?\n/).map(l => l.trim())
    .filter(l => /^[-*•]\s+/.test(l) && !/sha-?256/i.test(l))
    .map(l => l.replace(/^[-*•]\s+/, '').replace(/\*\*/g, ''));
  return lines.slice(0, max);
}

// Quando controllare: solo con rete, a terra, non prima dell'intervallo (salvo controllo chiesto dal pilota)
export function shouldCheck({ online, airborne, lastCheck, now, manual = false, enabled = true }) {
  if (!online || airborne) return false;
  if (manual) return true;
  if (!enabled) return false;
  return !(lastCheck > 0) || now - lastCheck >= CHECK_EVERY_MS;
}
