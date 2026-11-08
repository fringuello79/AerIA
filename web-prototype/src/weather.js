// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Meteo aeronautico: METAR, TAF e SIGMET internazionali dall'Aviation Weather Center (NOAA),
// che ridistribuisce i bollettini ufficiali emessi dai servizi meteo nazionali (in Italia AM ed ENAV).
// Il programma mostra sempre il testo originale, l'ora di osservazione e l'età del dato.
import { FT, distM, pointInRing } from './geo.js';

export const AWC = 'https://aviationweather.gov/api/data';

// Visibilità in miglia terrestri: l'API restituisce numeri o stringhe come "6+" o "1/2"
export function visibSm(v) {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  const s = String(v).trim().replace('+', '');
  if (/^\d+\s+\d+\/\d+$/.test(s)) { const [w, f] = s.split(/\s+/); const [a, b] = f.split('/'); return Number(w) + Number(a) / Number(b); }
  if (/^\d+\/\d+$/.test(s)) { const [a, b] = s.split('/'); return Number(a) / Number(b); }
  return Number(s);
}

// Base delle nubi rilevanti (BKN, OVC, OVX) in ft dal suolo; Infinity se non c'è «ceiling»
export function ceilingFt(clouds = []) {
  const c = clouds.filter(l => ['BKN', 'OVC', 'OVX'].includes(l.cover) && Number.isFinite(l.base)).map(l => l.base);
  return c.length ? Math.min(...c) : Infinity;
}

// Categoria di volo secondo la convenzione FAA usata dalla fonte (VFR, MVFR, IFR, LIFR).
// Ricalcolata qui per controllare la coerenza con quella fornita dall'API.
export function flightCategory(ceilFt, visSm) {
  if (ceilFt < 500 || visSm < 1) return 'LIFR';
  if (ceilFt < 1000 || visSm < 3) return 'IFR';
  if (ceilFt <= 3000 || visSm <= 5) return 'MVFR';
  return 'VFR';
}
export const CAT_IT = { VFR: 'buone (VFR)', MVFR: 'marginali (MVFR)', IFR: 'strumentali (IFR)', LIFR: 'pessime (LIFR)' };
export const CAT_COL = { VFR: '#1f8a4c', MVFR: '#2f6fdb', IFR: '#c8102e', LIFR: '#a3159f' };

export function parseMetars(json, now = Date.now()) {
  const latest = new Map();
  for (const m of json || []) {
    if (!m || !m.icaoId || !Number.isFinite(m.lat)) continue;
    const prev = latest.get(m.icaoId);
    if (prev && prev.obsTime >= m.obsTime) continue;
    latest.set(m.icaoId, m);
  }
  return [...latest.values()].map(m => {
    const clouds = (m.clouds || []).filter(c => c && c.cover).map(c => ({ cover: c.cover, base: Number(c.base) }));
    const ceil = ceilingFt(clouds), vis = visibSm(m.visib), cat = flightCategory(ceil, vis);
    const elevFt = Number(m.elev) * FT;
    return {
      id: m.icaoId, name: m.name || m.icaoId, lat: m.lat, lon: m.lon, elevFt,
      obsTime: m.obsTime * 1000, ageMin: (now - m.obsTime * 1000) / 60000,
      wdir: m.wdir, wspd: m.wspd, wgst: m.wgst, visSm: vis, qnh: Number(m.altim), temp: m.temp, dewp: m.dewp, wx: m.wxString || '',
      clouds, cloudsAmsl: clouds.map(c => ({ ...c, baseAmsl: c.base + elevFt })),
      ceilFt: ceil, cat, catSource: m.fltCat || '', catMismatch: !!m.fltCat && m.fltCat !== cat,
      raw: m.rawOb || '', rawTaf: m.rawTaf || '', auto: /\bAUTO\b/.test(m.rawOb || ''),
    };
  });
}

// QNH consigliato: stazione più vicina con osservazione recente (meno di 90 minuti)
export function nearestQnh(stations, pos, maxAgeMin = 90) {
  let best = null;
  for (const s of stations) {
    if (!Number.isFinite(s.qnh) || s.ageMin > maxAgeMin) continue;
    const d = distM(pos, s);
    if (!best || d < best.d) best = { s, d };
  }
  return best && { station: best.s, distKm: best.d / 1000, qnh: best.s.qnh };
}

export function parseSigmets(json, area) {
  return (json || []).filter(s => Array.isArray(s.coords) && s.coords.length >= 3).map(s => ({
    id: `${s.icaoId}-${s.seriesId}-${s.validTimeFrom}`, fir: s.firName || s.firId, hazard: s.hazard, qualifier: s.qualifier || '',
    baseFt: Number.isFinite(s.base) ? s.base : 0, topFt: Number.isFinite(s.top) ? s.top : 45000,
    from: s.validTimeFrom * 1000, to: s.validTimeTo * 1000, ring: s.coords.map(c => [c.lon, c.lat]), raw: s.rawSigmet || '',
  })).filter(s => !area || s.ring.some(([x, y]) => x >= area.lonMin - 1 && x <= area.lonMax + 1 && y >= area.latMin - 1 && y <= area.latMax + 1));
}
export const HAZARD_IT = { TS: 'temporali', TURB: 'turbolenza', ICE: 'ghiaccio', MTW: 'onde orografiche', VA: 'cenere vulcanica', TC: 'ciclone tropicale', DS: 'tempesta di polvere', SS: 'tempesta di sabbia', RDOACT: 'nube radioattiva' };

// Scarica i dati (serve la connessione). area = rettangolo di interesse; si allarga di 1° per prendere le stazioni vicine.
export async function fetchWeather(area, fetchFn = fetch) {
  const bbox = [area.latMin - 1, area.lonMin - 1, area.latMax + 1, area.lonMax + 1].map(v => v.toFixed(2)).join(',');
  const [m, s] = await Promise.all([
    fetchFn(`${AWC}/metar?bbox=${bbox}&format=json&taf=true`).then(r => { if (!r.ok) throw new Error(`METAR: errore ${r.status}`); return r.json(); }),
    fetchFn(`${AWC}/isigmet?format=json`).then(r => (r.ok ? r.json() : [])).catch(() => []),
  ]);
  return { stations: parseMetars(m), sigmets: parseSigmets(s, area), fetched: Date.now(), raw: m };
}

// ---------------------------------------------------------------- controlli a regole sulla rotta
// Distanza minima (km) di un punto da una spezzata di punti {lon, lat}, campionata ogni ~0,5 km
export function distToRouteKm(p, route) {
  if (!route.length) return Infinity;
  let best = distM(p, route[0]);
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1], n = Math.max(1, Math.ceil(distM(a, b) / 500));
    for (let k = 1; k <= n; k++) best = Math.min(best, distM(p, { lon: a.lon + (b.lon - a.lon) * k / n, lat: a.lat + (b.lat - a.lat) * k / n }));
  }
  return best / 1000;
}

// Temporale (TS, anche VCTS, TSRA) o nubi convettive (CB, TCU) nel testo del bollettino
export const CONVECTIVE = /(?:^|\s)[+-]?(?:VC)?TS|\d{3}(?:CB|TCU)\b/;
export const NEAR_KM = 25;      // oltre questa distanza un METAR non descrive il tempo sulla rotta
export const MAX_AGE_MIN = 90;  // METAR ogni 30 o 60 minuti: oltre 90 è scaduto

export function weatherWarnings({ route, stations = [], sigmets = [], cruiseFt, now = Date.now() }) {
  const out = [];
  if (route.length < 2) return out;
  const near = stations.map(s => ({ s, d: distToRouteKm(s, route) })).filter(x => x.d <= NEAR_KM).sort((a, b) => a.d - b.d);
  if (!near.length) out.push({ lvl: 'warn', kind: 'meteo', title: 'Nessuna osservazione vicino alla rotta',
    text: `Nessun METAR entro ${NEAR_KM} km. Il tempo sulla rotta non è osservato: in montagna può essere molto diverso da quello degli aeroporti in pianura.` });
  for (const { s, d } of near) {
    const where = `${s.id} (${s.name.split(',')[0]}, ${Math.round(d)} km dalla rotta)`;
    if (s.ageMin > MAX_AGE_MIN) { out.push({ lvl: 'warn', kind: 'meteo', title: `METAR scaduto: ${s.id}`, text: `Osservazione di ${Math.round(s.ageMin)} minuti fa: non usarla.` }); continue; }
    // Le categorie VFR/MVFR/IFR/LIFR sono una convenzione della fonte (FAA), non norme europee: i valori di legge sono
    // SERA.5001 (visibilità: 5 km; 1500 m in classe G sotto 3000 ft a 140 kt o meno) e SERA.5005 b) (decollo e
    // atterraggio VFR in una CTR: base almeno 1500 ft e visibilità almeno 5 km).
    const visKm = Number.isFinite(s.visSm) ? s.visSm * 1.609344 : NaN, ceil = s.ceilFt;
    const meteoTxt = `base nubi ${Number.isFinite(ceil) ? ceil + ' ft' : 'non indicata'}, visibilità ${Number.isFinite(visKm) ? visKm.toFixed(1).replace('.', ',') + ' km' : '—'}`;
    if (visKm < 1.5 || ceil < 1000) out.push({ lvl: 'crit', kind: 'meteo', title: `Condizioni strumentali a ${s.id}`,
      text: `${where}: ${meteoTxt}. ${visKm < 1.5 ? 'Visibilità sotto i 1500 m: sotto il minimo VFR anche in classe G (SERA.5001).' : 'Base sotto 1000 ft (categoria IFR della fonte).'} Nelle CTR il VFR non decolla né atterra con base sotto 1500 ft o visibilità sotto 5 km (SERA.5005 b)).` });
    else if (ceil < 1500 || visKm < 5) out.push({ lvl: 'warn', kind: 'meteo', title: `Base o visibilità basse a ${s.id}`,
      text: `${where}: ${meteoTxt}. Nelle CTR il VFR non decolla né atterra sotto 1500 ft e 5 km (SERA.5005 b)); in classe G, sotto 3000 ft, servono almeno 1500 m a 140 kt o meno (SERA.5001).` });
    else if (s.cat === 'MVFR') out.push({ lvl: 'warn', kind: 'meteo', title: `Condizioni ${CAT_IT[s.cat]} a ${s.id}`, text: `${where}: ${meteoTxt}. Categoria della fonte (convenzione FAA, non una norma): valuta con attenzione.` });
    if (CONVECTIVE.test(s.raw)) out.push({ lvl: 'crit', kind: 'meteo', title: `Temporali o cumulonembi a ${s.id}`, text: `${where}: il METAR riporta ${/TS/.test(s.raw) ? 'temporale' : 'cumulonembi o cumuli torreggianti'}.` });
    if (!CONVECTIVE.test(s.raw) && CONVECTIVE.test(s.rawTaf)) out.push({ lvl: 'warn', kind: 'meteo', title: `Temporali o cumulonembi previsti a ${s.id}`, text: `${where}: il TAF li prevede (leggi il testo per orari e probabilità).` });
    const base = Math.min(...s.cloudsAmsl.filter(c => ['BKN', 'OVC', 'OVX'].includes(c.cover)).map(c => c.baseAmsl));
    const baseTxt = `Base nubi circa ${Math.round(base / 100) * 100} ft sul mare (${s.ceilFt} ft sull'aeroporto)`;
    if (Number.isFinite(base) && Math.abs(cruiseFt - base) < 1000) out.push({ lvl: 'warn', kind: 'meteo', title: `Quota vicina alle nubi a ${s.id}`,
      text: `${baseTxt}: la quota pianificata di ${cruiseFt} ft è a meno di 1000 ft dalle nubi. Sopra 3000 ft sul mare (o 1000 ft dal suolo) il VFR deve restare 1000 ft sotto le nubi (SERA.5001); più in basso, in classe G, basta restarne fuori in vista del suolo.` });
    else if (Number.isFinite(base) && cruiseFt >= base + 1000) out.push({ lvl: 'warn', kind: 'meteo', title: `Quota sopra uno strato di nubi a ${s.id}`,
      text: `${baseTxt}: a ${cruiseFt} ft voleresti sopra uno strato coperto o quasi, con il rischio di perdere il contatto visivo con il suolo.` });
  }
  for (const g of sigmets) {
    if (now < g.from || now > g.to || cruiseFt < g.baseFt || cruiseFt > g.topFt) continue;
    const hit = route.some((p, i) => {
      if (pointInRing([p.lon, p.lat], g.ring)) return true;
      const q = route[i + 1];
      return q && [0.25, 0.5, 0.75].some(t => pointInRing([p.lon + (q.lon - p.lon) * t, p.lat + (q.lat - p.lat) * t], g.ring));
    });
    if (hit) out.push({ lvl: 'crit', kind: 'meteo', title: `SIGMET ${HAZARD_IT[g.hazard] || g.hazard}`, text: `La rotta attraversa un SIGMET valido (${g.fir}) da ${g.baseFt} a ${g.topFt} ft.` });
  }
  return out;
}
