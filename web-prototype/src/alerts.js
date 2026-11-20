// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Avvisi in volo (dalla 0.23.0): regole pure e verificabili, nessuna decisione affidata a modelli linguistici.
// - spazi aerei vicini e in fascia di quota (per evidenziarli e per l'avviso «vicino»), tempo all'uscita;
// - regolazioni degli avvisi di terreno scelte dal pilota;
// - annuncio dei 500 ft sopra il campo d'arrivo;
// - quote sicure (qui e sulla rotta che resta) e altezza sul terreno mostrata solo se attendibile.
// Codice di fringuello79 di Avezzano.
import { NM, degLengths, pointInRing, bearingDeg, destPoint } from './geo.js';
import { limitFt, entryRule, category } from './airspace.js';

// ---------------------------------------------------------------- spazi aerei attorno all'aereo
// Punto più vicino di un anello [[lon, lat], ...] alla posizione, in un piano locale attorno alla posizione (scarto sotto
// lo 0,1 % entro 10 NM). Restituisce { dM, lon, lat }.
export function nearestOnRing(pos, ring) {
  const L = degLengths(pos.lat), kx = L.lon, ky = L.lat;
  let best = { dM: Infinity, lon: NaN, lat: NaN };
  // anello chiuso o aperto: si prende anche il lato tra l'ultimo e il primo punto (lungo zero se l'anello è chiuso)
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    const ax = (ring[i][0] - pos.lon) * kx, ay = (ring[i][1] - pos.lat) * ky;
    const bx = (ring[j][0] - pos.lon) * kx, by = (ring[j][1] - pos.lat) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    const x = ax + t * dx, y = ay + t * dy, d = Math.hypot(x, y);
    if (d < best.dM) best = { dM: d, lon: pos.lon + x / kx, lat: pos.lat + y / ky };
  }
  return best;
}

// Lato rispetto alla traccia: davanti entro ±30°, dietro oltre ±150°, altrimenti destra o sinistra
export function sideOf(trackDeg, brgDeg) {
  if (!Number.isFinite(trackDeg)) return '';
  const r = ((brgDeg - trackDeg + 540) % 360) - 180;
  return Math.abs(r) <= 30 ? 'davanti' : Math.abs(r) >= 150 ? 'dietro' : r > 0 ? 'a destra' : 'a sinistra';
}

// Spazi aerei entro radiusNm dalla posizione, fuori dai quali si è (lateralmente). Per ognuno: distanza dal bordo,
// punto del bordo più vicino, limiti verticali in quel punto e scarto verticale gapFt (0 se la quota è dentro i
// limiti, altrimenti i piedi che mancano al limite più vicino). I limiti riferiti al suolo usano il terreno nel
// punto del bordo. Gli spazi che non chiedono nulla al pilota (entryRule 'nessuno') non contano.
// Uso: evidenza sulla carta (entro 5 NM e 1000 ft) e avviso «vicino» (entro 2 NM e dentro l'incertezza della quota).
export function airspacesAround({ pos, altFt, trackDeg = NaN, airspaces, terrain, qnh, pilot, radiusNm = 5 }) {
  const out = [], rM = radiusNm * NM, L = degLengths(pos.lat), dLon = rM / L.lon, dLat = rM / L.lat;
  for (const a of airspaces) {
    const b = a.bbox;
    if (b && (pos.lon < b.lonMin - dLon || pos.lon > b.lonMax + dLon || pos.lat < b.latMin - dLat || pos.lat > b.latMax + dLat)) continue;
    const rings = a.clipped || [];
    if (!rings.length) continue;
    const rule = entryRule(a, pilot);
    if (rule.need === 'nessuno') continue;
    if (rings.some(r => pointInRing([pos.lon, pos.lat], r))) continue;   // dentro: lo gestisce il volo (tempo all'uscita)
    let n = { dM: Infinity };
    for (const r of rings) { const m = nearestOnRing(pos, r); if (m.dM < n.dM) n = m; }
    if (!(n.dM <= rM)) continue;
    const t = terrain.elevFt(n.lon, n.lat), tf = Number.isFinite(t) ? t : 0;
    const lo = limitFt(a.lower, tf, qnh), hi = limitFt(a.upper, tf, qnh);
    const gapFt = altFt < lo ? lo - altFt : altFt > hi ? altFt - hi : 0;
    const brg = bearingDeg(pos, n);
    out.push({ a, rule, distNm: n.dM / NM, at: { lon: n.lon, lat: n.lat }, lo, hi, gapFt, side: sideOf(trackDeg, brg), brg });
  }
  return out.sort((x, y) => x.distNm - y.distNm);
}
export const NEAR_NM = 2, EMPH_NM = 5, EMPH_BAND_FT = 1000;
// Avviso «vicino»: entro 2 NM dal bordo e con la quota dentro i limiti (o entro l'incertezza della quota)
export const isNear = (x, uncFt = 0) => x.distNm <= NEAR_NM && x.gapFt <= uncFt;
// Evidenza sulla carta: entro 5 NM e a meno di 1000 ft dai limiti
export const isEmphasised = x => x.distNm <= EMPH_NM && x.gapFt <= EMPH_BAND_FT;
// Insieme degli spazi evidenziati con isteresi: entra entro 5 NM e 1000 ft, esce solo oltre 6 NM o 1300 ft. Senza,
// ai margini lo spazio si accenderebbe e spegnerebbe di continuo (e ogni cambio ridisegna gli spazi). Al massimo max.
export function emphasisIds(prevIds, around, max = 8) {
  const keep = x => isEmphasised(x) || (prevIds?.has(x.a.id) && x.distNm <= EMPH_NM + 1 && x.gapFt <= EMPH_BAND_FT + 300);
  return new Set(around.filter(keep).slice(0, max).map(x => x.a.id));
}

// Testo da leggere a voce per l'avviso «vicino» (una volta per spazio e per volo, lo decide l'app)
const WHAT = { P: 'Zona proibita', R: 'Zona regolamentata', Q: 'Zona pericolosa', CTRL: 'Spazio controllato', ZONE: 'Zona radio', PARK: 'Area protetta', SPORT: 'Zona di attività' };
export function nearSpeech(x) {
  const d = x.distNm < 0.95 ? 'meno di un miglio' : `${(Math.round(x.distNm * 2) / 2).toString().replace('.', ',')} miglia`;
  return `${WHAT[category(x.a)] || 'Zona'} ${x.a.name} vicino, a ${d}${x.side && x.side !== 'davanti' ? ` ${x.side}` : x.side === 'davanti' ? ' davanti' : ''}.`;
}

// Tempo all'uscita da uno spazio in cui si è, proseguendo diritti alla quota attuale: passi di stepS secondi fino a
// maxS. null se non si esce entro maxS o se la velocità è troppo bassa per dirlo (sotto 20 kt).
export function exitTimeS({ pos, trackDeg, gsKt, altFt, a, terrain, qnh, maxS = 1800, stepS = 5 }) {
  if (!(gsKt >= 20) || !Number.isFinite(trackDeg)) return null;
  const inside = (lon, lat) => {
    if (!(a.clipped || []).some(r => pointInRing([lon, lat], r))) return false;
    const t = terrain.elevFt(lon, lat), tf = Number.isFinite(t) ? t : 0;
    return altFt >= limitFt(a.lower, tf, qnh) && altFt <= limitFt(a.upper, tf, qnh);
  };
  const nmPerS = gsKt / 3600;
  for (let t = stepS; t <= maxS; t += stepS) {
    const p = destPoint([pos.lon, pos.lat], trackDeg, nmPerS * t);
    if (!inside(p[0], p[1])) return t;
  }
  return null;
}

// ---------------------------------------------------------------- avvisi di terreno: regolazioni del pilota
// margin: 'auto' (300 ft; 150 ft per il VDS non avanzato, che vola per norma basso sul rilievo) o un numero di piedi.
// aheadS: anticipo massimo dell'avviso di attenzione (60, 90 o 120 s). L'avviso grave resta entro 60 s (o entro
// l'anticipo, se più corto). onlyCrit: solo gli avvisi gravi (si è dentro il rilievo o l'ostacolo).
export const TERRAIN_MARGINS = [150, 300, 500, 1000], TERRAIN_AHEAD = [60, 90, 120];
export function terrainAlertConfig(s = {}, pilot = '') {
  const m = Number(s.margin), a = Number(s.aheadS);
  const warnAglFt = TERRAIN_MARGINS.includes(m) ? m : pilot === 'basico' ? 150 : 300;
  const warnS = TERRAIN_AHEAD.includes(a) ? a : 120;
  return { warnAglFt, warnS, critS: Math.min(60, warnS), onlyCrit: s.sens === 'gravi', auto: !TERRAIN_MARGINS.includes(m) };
}
// Toglie gli avvisi di attenzione di terreno e ostacoli se il pilota vuole solo quelli gravi
export function filterTerrainEvents(events, cfg) {
  if (!cfg.onlyCrit) return events;
  return events.filter(e => !['terrain', 'obstacle'].includes(e.kind) || e.lvl === 'crit');
}

// ---------------------------------------------------------------- «cinquecento» sul campo d'arrivo
// Annuncio una volta quando, entro 5 NM dal campo d'arrivo, si scende a 500 ft o meno sopra il campo. Si riarma solo
// risalendo oltre 600 ft (isteresi di 100 ft: le oscillazioni della quota GPS non lo ripetono).
export const CALL500_FT = 500, CALL500_REARM_FT = 600, CALL500_NM = 5;
export function call500Step(st, aboveFt, distNm) {
  const s = { armed: st?.armed ?? false };
  if (!Number.isFinite(aboveFt)) return { st: s, fire: false };
  if (aboveFt > CALL500_REARM_FT) { s.armed = true; return { st: s, fire: false }; }
  if (s.armed && aboveFt <= CALL500_FT && distNm <= CALL500_NM) { s.armed = false; return { st: s, fire: true }; }
  return { st: s, fire: false };
}

// ---------------------------------------------------------------- quote sicure
// Quota sicura qui: 1000 ft sopra il rilievo e gli ostacoli più alti entro 5 km, arrotondata ai 100 ft superiori.
export const SAFE_MARGIN_FT = 1000, SAFE_RADIUS_KM = 5;
export function safeHereFt(maxTerrFt, maxObstFt = -Infinity) {
  const top = Math.max(Number.isFinite(maxTerrFt) ? maxTerrFt : -Infinity, Number.isFinite(maxObstFt) ? maxObstFt : -Infinity);
  return Number.isFinite(top) ? Math.ceil((top + SAFE_MARGIN_FT) / 100) * 100 : NaN;
}
// Quota sicura sulla rotta che resta: il più alto dei minimi dei tratti (rilievo entro 600 m + 500 ft, come in
// pianificazione) dal tratto attivo fino all'arrivo. legMins[i] = { minFt } o null se non pronto.
export function safeRouteFt(legMins, fromLeg) {
  const m = legMins.slice(Math.max(0, fromLeg)).filter(x => x && Number.isFinite(x.minFt)).map(x => x.minFt);
  return m.length ? Math.max(...m) : NaN;
}

// ---------------------------------------------------------------- altezza sul terreno
// Si mostra solo se la quota è abbastanza precisa: se l'incertezza verticale è almeno metà dell'altezza, il dato non
// dice nulla di utile e si scrive «incerto». Sotto il terreno del modello resta visibile (in rosso nell'app).
export function aglShown(aglFt, uncFt = 0) {
  if (!Number.isFinite(aglFt)) return { text: '—', ok: false };
  const u = Number.isFinite(uncFt) ? Math.max(0, uncFt) : 0;
  if (aglFt > 0 && u > 0 && u >= aglFt / 2) return { text: 'incerto', ok: false, uncFt: Math.round(u) };
  return { text: `${Math.round(aglFt)} ft`, ok: true, uncFt: Math.round(u) };
}
