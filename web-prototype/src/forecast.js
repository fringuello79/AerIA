// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Previsione 3D dal modello ICON-2I (ItaliaMeteo-ARPAE, 2,2 km, corse alle 00 e 12 UTC) tramite Open-Meteo.
// Dati su livelli di pressione (1000, 925, 850, 700, 500 hPa): vento, nuvolosità, umidità, temperatura e quota
// geopotenziale. I livelli sotto il terreno sono estrapolati dal modello e vengono scartati.
// Questo modulo calcola; il disegno 3D è in app.js.
import { FT, distM } from './geo.js';

export const OM = 'https://api.open-meteo.com/v1/forecast';
export const MODEL = 'italia_meteo_arpae_icon_2i';
export const LEVELS = [1000, 925, 850, 700, 500];
const SURF = ['precipitation', 'showers', 'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high',
  'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'freezing_level_height', 'cape'];
const PL = ['cloud_cover', 'wind_speed', 'wind_direction', 'geopotential_height', 'relative_humidity', 'temperature'];
export const VARS = [...SURF, ...LEVELS.flatMap(l => PL.map(v => `${v}_${l}hPa`))];

// Griglia regolare sull'area: n×n punti (11×11 = 121 punti, circa 500 «chiamate» Open-Meteo per richiesta)
export function forecastGrid(area, n = 11) {
  const pts = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    pts.push({ lon: +(area.lonMin + (area.lonMax - area.lonMin) * i / (n - 1)).toFixed(4), lat: +(area.latMin + (area.latMax - area.latMin) * j / (n - 1)).toFixed(4) });
  }
  return { n, pts };
}
export function forecastUrl(grid, hours = 12) {
  return `${OM}?latitude=${grid.pts.map(p => p.lat).join(',')}&longitude=${grid.pts.map(p => p.lon).join(',')}`
    + `&hourly=${VARS.join(',')}&models=${MODEL}&forecast_hours=${hours}&timezone=UTC&wind_speed_unit=kn`;
}

// Risposta Open-Meteo (un oggetto per punto, nello stesso ordine della richiesta) → struttura compatta
export function parseOpenMeteo(arr, grid) {
  const list = Array.isArray(arr) ? arr : [arr];
  if (!list.length || !list[0].hourly) throw new Error('Risposta del modello vuota');
  const times = list[0].hourly.time.map(t => Date.parse(t + 'Z'));
  const v = {};
  for (const k of VARS) v[k] = times.map((_, ti) => list.map(p => p.hourly[k]?.[ti] ?? null));
  return {
    model: 'ICON-2I', times, n: grid?.n ?? Math.round(Math.sqrt(list.length)),
    pts: list.map((p, i) => ({ lon: grid ? grid.pts[i].lon : p.longitude, lat: grid ? grid.pts[i].lat : p.latitude, elevM: p.elevation })),
    v,
  };
}
// Campione salvato nei test (un solo orario, griglia qualsiasi)
export function fromCompact(fx) {
  const v = {};
  for (const k of VARS) v[k] = [fx.v[k]];
  return { model: 'ICON-2I', times: [Date.parse(fx.time + 'Z')], n: Math.round(Math.sqrt(fx.lat.length)), pts: fx.lat.map((lat, i) => ({ lon: fx.lon[i], lat, elevM: fx.elev[i] })), v };
}

// Livelli validi (sopra il terreno) di un punto: quota, spessore dello strato che rappresenta, nubi, vento
export function columnAt(fc, i, ti) {
  const g = k => fc.v[k][ti][i];
  const elevM = fc.pts[i].elevM;
  const lv = LEVELS.map(l => ({ hPa: l, zM: g(`geopotential_height_${l}hPa`), cloud: g(`cloud_cover_${l}hPa`), rh: g(`relative_humidity_${l}hPa`),
    kt: g(`wind_speed_${l}hPa`), dir: g(`wind_direction_${l}hPa`), tC: g(`temperature_${l}hPa`) }))
    .filter(l => Number.isFinite(l.zM) && l.zM > elevM);
  // ogni livello rappresenta lo strato tra le metà delle distanze dai livelli vicini (il primo parte dal suolo)
  lv.forEach((l, k) => {
    l.botM = k === 0 ? elevM : (lv[k - 1].zM + l.zM) / 2;
    l.topM = k === lv.length - 1 ? l.zM + (l.zM - l.botM) : (l.zM + lv[k + 1].zM) / 2;
  });
  return {
    elevM, levels: lv, precip: g('precipitation'), showers: g('showers'), cape: g('cape'), freezeM: g('freezing_level_height'),
    wind10: { kt: g('wind_speed_10m'), dir: g('wind_direction_10m'), gust: g('wind_gusts_10m') },
    low: g('cloud_cover_low'), mid: g('cloud_cover_mid'), high: g('cloud_cover_high'),
  };
}

export function nearestPoint(fc, lon, lat) {
  let best = 0, bd = Infinity;
  fc.pts.forEach((p, i) => { const d = distM(p, { lon, lat }); if (d < bd) { bd = d; best = i; } });
  return { i: best, km: bd / 1000 };
}

// Vento a una quota (ft sul mare): interpolazione lineare in quota delle componenti u e v tra i livelli validi.
// Sotto il primo livello valido si usa il vento a 10 m, sopra l'ultimo il vento dell'ultimo livello.
const toUV = (kt, dir) => [-kt * Math.sin(dir * Math.PI / 180), -kt * Math.cos(dir * Math.PI / 180)];
const fromUV = (u, v) => ({ kt: Math.hypot(u, v), dir: (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360 });
export function windAtAlt(col, altFt) {
  const z = altFt / FT;
  const pts = [{ zM: col.elevM + 10, kt: col.wind10.kt, dir: col.wind10.dir }, ...col.levels].filter(p => Number.isFinite(p.kt) && Number.isFinite(p.dir));
  if (!pts.length) return null;
  if (z <= pts[0].zM) return { kt: pts[0].kt, dir: pts[0].dir };
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    if (z <= b.zM) {
      const t = (z - a.zM) / (b.zM - a.zM), [ua, va] = toUV(a.kt, a.dir), [ub, vb] = toUV(b.kt, b.dir);
      return fromUV(ua + t * (ub - ua), va + t * (vb - va));
    }
  }
  const l = pts.at(-1);
  return { kt: l.kt, dir: l.dir };
}
// Componenti rispetto alla rotta: vento in coda positivo, al traverso positivo da destra
export function windComponents(trackDeg, w) {
  const a = (w.dir - trackDeg) * Math.PI / 180;
  return { head: w.kt * Math.cos(a), cross: w.kt * Math.sin(a), tail: -w.kt * Math.cos(a) };
}

// Avvisi a regole lungo la rotta, alla quota pianificata, per un orario della previsione
export function forecastWarnings({ fc, ti, route, cruiseFt }) {
  const out = [];
  if (!fc || route.length < 2) return out;
  const z = cruiseFt / FT, when = new Date(fc.times[ti]).toISOString().slice(11, 16) + ' UTC';
  const seen = new Set(), flags = { cloud: 0, rain: 0, wind: 0, cape: 0, ice: 0 };
  let maxWind = 0, maxGust = 0, maxRain = 0, maxCape = 0;
  for (let k = 0; k < route.length - 1; k++) {
    const a = route[k], b = route[k + 1], n = Math.max(2, Math.ceil(distM(a, b) / 2000));
    for (let s = 0; s <= n; s++) {
      const p = { lon: a.lon + (b.lon - a.lon) * s / n, lat: a.lat + (b.lat - a.lat) * s / n };
      const { i } = nearestPoint(fc, p.lon, p.lat);
      if (seen.has(i)) continue;
      seen.add(i);
      const col = columnAt(fc, i, ti);
      const layer = col.levels.find(l => z >= l.botM && z < l.topM);
      if (layer && layer.cloud >= 50) flags.cloud++;
      if (layer && layer.cloud >= 50 && Number.isFinite(col.freezeM) && z >= col.freezeM - 300) flags.ice++;
      if (col.precip >= 0.5) { flags.rain++; maxRain = Math.max(maxRain, col.precip); }
      const w = windAtAlt(col, cruiseFt);
      if (w && w.kt >= 25) { flags.wind++; maxWind = Math.max(maxWind, w.kt); }
      if (col.wind10.gust >= 25) { flags.wind++; maxGust = Math.max(maxGust, col.wind10.gust); }
      if (col.cape >= 500) { flags.cape++; maxCape = Math.max(maxCape, col.cape); }
    }
  }
  const src = `previsione ICON-2I per le ${when}`;
  if (flags.ice) out.push({ lvl: 'warn', kind: 'previsione', title: 'Rischio di ghiaccio alla tua quota', text: `Nubi previste vicino o sopra lo zero termico lungo la rotta (${src}).` });
  if (flags.cloud) out.push({ lvl: 'warn', kind: 'previsione', title: 'Nubi previste alla tua quota', text: `Nuvolosità di almeno metà cielo nello strato della quota pianificata in ${flags.cloud} ${flags.cloud === 1 ? 'cella' : 'celle'} lungo la rotta (${src}).` });
  if (flags.rain) out.push({ lvl: 'warn', kind: 'previsione', title: 'Pioggia prevista sulla rotta', text: `Fino a ${maxRain.toFixed(1).replace('.', ',')} mm in un'ora (${src}).` });
  if (flags.wind) out.push({ lvl: 'warn', kind: 'previsione', title: 'Vento forte previsto', text: `${maxWind ? `Fino a ${Math.round(maxWind)} kt alla quota pianificata. ` : ''}${maxGust ? `Raffiche al suolo fino a ${Math.round(maxGust)} kt. ` : ''}(${src})` });
  if (flags.cape) out.push({ lvl: 'warn', kind: 'previsione', title: 'Possibile convezione', text: `Energia convettiva (CAPE) fino a ${Math.round(maxCape)} J/kg: possibili cumuli torreggianti e temporali (${src}).` });
  return out;
}
