// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Radar meteorologico nazionale della Protezione Civile (Radar-DPC), dato OSSERVATO ogni 5 minuti.
// Licenza CC BY-SA 4.0, citare «Radar-DPC». API: https://radar-api.protezionecivile.it
//
// Formato verificato sui file del 6/11/2026 (SRI e CAPPI_2):
// - GeoTIFF float32, 1200 × 1400 celle da 1 km, compressione LZW, pixel ad area;
// - proiezione Trasversa di Mercatore su ellissoide WGS84, origine 42° N 12,5° E, scala 1, nessuna falsa origine;
// - angolo in alto a sinistra x = −600 km, y = +650 km;
// - SRI: mm/h (il file servito è SRI_adj, corretto con i pluviometri), 0 = niente pioggia, −9999 = non osservato;
// - CAPPI: riflettività in dBZ, −9998 = nessun eco a quella quota, −9999 = non osservato.
//   La quota del CAPPI_2 non è scritta nel file: si presume 2000 m, da confermare con la documentazione.
import { distM } from './geo.js';

export const RADAR_API = 'https://radar-api.protezionecivile.it';
const A = 6378137, F = 1 / 298.257223563, E2 = F * (2 - F), EP2 = E2 / (1 - E2);
const LAT0 = 42 * Math.PI / 180, LON0 = 12.5 * Math.PI / 180;
const Mof = p => A * ((1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256) * p - (3 * E2 / 8 + 3 * E2 ** 2 / 32 + 45 * E2 ** 3 / 1024) * Math.sin(2 * p)
  + (15 * E2 ** 2 / 256 + 45 * E2 ** 3 / 1024) * Math.sin(4 * p) - (35 * E2 ** 3 / 3072) * Math.sin(6 * p));
const M0 = Mof(LAT0);

// Trasversa di Mercatore (formule di Snyder, USGS PP 1395, 8-9…8-13): lon/lat in gradi → x, y in metri
export function tmForward(lon, lat) {
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180;
  const s = Math.sin(p), c = Math.cos(p), t = Math.tan(p);
  const N = A / Math.sqrt(1 - E2 * s * s), T = t * t, C = EP2 * c * c, Aa = (l - LON0) * c;
  const x = N * (Aa + (1 - T + C) * Aa ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5 / 120);
  const y = Mof(p) - M0 + N * t * (Aa ** 2 / 2 + (5 - T + 9 * C + 4 * C * C) * Aa ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6 / 720);
  return { x, y };
}

// Griglia: { x0, y0 (angolo in alto a sinistra), dx, dy (negativo), w, h, data }
export function sampleRadar(g, lon, lat) {
  if (!g) return { v: NaN, code: 'assente' };
  const { x, y } = tmForward(lon, lat);
  const c = Math.floor((x - g.x0) / g.dx), r = Math.floor((y - g.y0) / g.dy);
  if (c < 0 || r < 0 || c >= g.w || r >= g.h) return { v: NaN, code: 'fuori' };
  const v = g.data[r * g.w + c];
  if (v <= -9999) return { v: NaN, code: 'non osservato' };
  if (v <= -9998) return { v: NaN, code: 'nessun eco' };
  return { v, code: 'ok' };
}

// Lettura del GeoTIFF con geotiff.js; rifiuta file con proiezione diversa da quella verificata
export async function parseRadarTiff(buf, GeoTIFF) {
  const tif = await GeoTIFF.fromArrayBuffer(buf), img = await tif.getImage();
  const gk = img.getGeoKeys() || {};
  const lat0 = gk.ProjNatOriginLatGeoKey ?? gk.ProjCenterLatGeoKey, lon0 = gk.ProjNatOriginLongGeoKey ?? gk.ProjCenterLongGeoKey;
  if (lat0 !== 42 || lon0 !== 12.5) throw new Error(`proiezione inattesa (origine ${lat0}, ${lon0})`);
  const [x0, y0] = img.getOrigin(), [dx, dy] = img.getResolution();
  const [data] = await img.readRasters();
  return { x0, y0, dx, dy, w: img.getWidth(), h: img.getHeight(), data };
}

export async function fetchRadar(type, fetchFn = fetch, GeoTIFF = globalThis.GeoTIFF) {
  const last = await (await fetchFn(`${RADAR_API}/findLastProductByType?type=${type}`)).json();
  const time = last.lastProducts[0].time;
  const d = await (await fetchFn(`${RADAR_API}/downloadProduct`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productType: type, productDate: time }) })).json();
  const buf = await (await fetchFn(d.url)).arrayBuffer();
  return { ...(await parseRadarTiff(buf, GeoTIFF)), type, time };
}

// Scala dei colori: pioggia (mm/h) e riflettività (dBZ)
export function rainColor(mmh) {
  if (!(mmh > 0.2)) return null;
  if (mmh < 1) return [0.55, 0.78, 0.96];
  if (mmh < 4) return [0.18, 0.44, 0.86];
  if (mmh < 10) return [0.98, 0.78, 0.1];
  if (mmh < 30) return [0.93, 0.36, 0.08];
  return [0.75, 0.05, 0.55];
}
export function dbzColor(dbz) {
  if (!(dbz >= 15)) return null;
  if (dbz < 25) return [0.55, 0.78, 0.96];
  if (dbz < 35) return [0.18, 0.44, 0.86];
  if (dbz < 45) return [0.98, 0.78, 0.1];
  return [0.85, 0.1, 0.1];
}

// Avvisi lungo la rotta: massimo entro 2 km da ogni punto (5×5 celle intorno al punto)
export function radarWarnings({ route, sri, cappi, now = Date.now() }) {
  const W = [];
  if (!sri || route.length < 2) return W;
  let maxR = 0, maxZ = -Infinity, unobs = 0, n = 0;
  for (let k = 0; k < route.length - 1; k++) {
    const a = route[k], b = route[k + 1], steps = Math.max(1, Math.ceil(distM(a, b) / 1000));
    for (let s = 0; s <= steps; s++) {
      const p = { lon: a.lon + (b.lon - a.lon) * s / steps, lat: a.lat + (b.lat - a.lat) * s / steps };
      n++;
      const { x, y } = tmForward(p.lon, p.lat);
      for (let dyc = -2; dyc <= 2; dyc++) for (let dxc = -2; dxc <= 2; dxc++) {
        const c = Math.floor((x - sri.x0) / sri.dx) + dxc, r = Math.floor((y - sri.y0) / sri.dy) + dyc;
        if (c < 0 || r < 0 || c >= sri.w || r >= sri.h) continue;
        const v = sri.data[r * sri.w + c];
        if (v <= -9998) { if (dxc === 0 && dyc === 0) unobs++; continue; }
        maxR = Math.max(maxR, v);
        if (cappi) { const z = cappi.data[r * cappi.w + c]; if (z > -9998) maxZ = Math.max(maxZ, z); }
      }
    }
  }
  const age = Math.round((now - sri.time) / 60000), when = `dato radar di ${age} min fa`;
  const old = age > 20 ? ' Il dato è vecchio: aggiornalo.' : '';
  if (maxR >= 10) W.push({ lvl: 'crit', kind: 'radar', title: 'Pioggia intensa in atto sulla rotta', text: `Il radar misura fino a ${maxR.toFixed(1).replace('.', ',')} mm/h entro 2 km dalla rotta (${when}). Possibili temporali: non partire o cambia rotta.${old}` });
  else if (maxR >= 1) W.push({ lvl: 'warn', kind: 'radar', title: 'Pioggia in atto sulla rotta', text: `Il radar misura fino a ${maxR.toFixed(1).replace('.', ',')} mm/h entro 2 km dalla rotta (${when}): visibilità ridotta.${old}` });
  if (maxZ >= 45) W.push({ lvl: 'crit', kind: 'radar', title: 'Eco radar forte sulla rotta', text: `Riflettività fino a ${Math.round(maxZ)} dBZ in quota (${when}): tipica dei temporali.${old}` });
  if (unobs > n / 2) W.push({ lvl: 'info', kind: 'radar', title: 'Rotta non coperta dal radar', text: 'Su gran parte della rotta il radar non ha dati: l’assenza di avvisi non significa assenza di pioggia.' });
  return W;
}
