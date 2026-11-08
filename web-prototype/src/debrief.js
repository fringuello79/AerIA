// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Rivedere il volo dopo l'atterraggio: la traccia registrata a confronto con il terreno, il limite VDS, gli spazi aerei
// e la rotta pianificata. Solo calcoli a regole sui punti della traccia; le soglie sono quelle degli avvisi in volo.
import { NM, distM } from './geo.js';

export const DEBRIEF = { aglWarnFt: 500, aglCritFt: 300, fieldNm: 2, fieldAglFt: 1000, xtWarnNm: 1, xtCritNm: 2, altDevFt: 500 };

// Proiezione di p sulla spezzata della rotta: distanza dalla rotta (m) e distanza percorsa lungo la rotta (m)
export function projectOnRoute(p, route) {
  let best = null, acc = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1], k = Math.cos(a.lat * Math.PI / 180) * 111320;
    const bx = (b.lon - a.lon) * k, by = (b.lat - a.lat) * 111320, px = (p.lon - a.lon) * k, py = (p.lat - a.lat) * 111320;
    const L2 = bx * bx + by * by, u = L2 ? Math.max(0, Math.min(1, (px * bx + py * by) / L2)) : 0;
    const d = Math.hypot(px - u * bx, py - u * by), L = distM(a, b);
    if (!best || d < best.xtM) best = { xtM: d, alongM: acc + u * L, leg: i };
    acc += L;
  }
  return best || { xtM: NaN, alongM: NaN, leg: -1 };
}

// track: [{ lon, lat, altFt, t }]; terrainFt(lon, lat); vdsLimFt(lon, lat) o null; fields: [{ lon, lat, elevFt }];
// airspaceAt(lon, lat, altFt) → [{ name, need }] (need: 'vietato' | 'autorizzazione' | 'verifica'); planAltFt(alongM) o null.
const RANK = { crit: 0, warn: 1, info: 2 };
export function analyzeFlight({ track, route = [], terrainFt, vdsLimFt = null, fields = [], airspaceAt = null, planAltFt = null, from = -Infinity, to = Infinity, opt = {} }) {
  const o = { ...DEBRIEF, ...opt };
  // punti in ordine di tempo e senza doppioni (la simulazione accelerata e il GPS possono mescolare gli orologi)
  const T = track.filter(p => p.t >= from && p.t <= to && Number.isFinite(p.altFt) && Number.isFinite(p.t)).sort((a, b) => a.t - b.t)
    .filter((p, i, a) => i === 0 || p.t !== a[i - 1].t);
  const series = [], open = new Map(), episodes = [];
  const close = (k, i) => { const e = open.get(k); if (e) { e.i1 = i; e.to = T[i].t; episodes.push(e); open.delete(k); } };
  let distNm = 0, maxAltFt = -Infinity, minAgl = Infinity, maxXt = 0;
  for (let i = 0; i < T.length; i++) {
    const p = T[i], terr = terrainFt(p.lon, p.lat), agl = p.altFt - terr; // terreno non noto (NaN): nessun controllo del margine
    if (i) distNm += distM(T[i - 1], p) / NM;
    maxAltFt = Math.max(maxAltFt, p.altFt);
    const nf = fields.some(f => distM(f, p) <= o.fieldNm * NM && p.altFt - (Number.isFinite(f.elevFt) ? f.elevFt : Number.isFinite(terr) ? terr : -Infinity) < o.fieldAglFt);
    const lim = vdsLimFt ? vdsLimFt(p.lon, p.lat) : NaN;
    const pr = route.length > 1 ? projectOnRoute(p, route) : null, xt = pr ? pr.xtM / NM : NaN;
    const plan = pr && planAltFt ? planAltFt(pr.alongM) : NaN;
    series.push({ t: p.t, altFt: p.altFt, terrFt: terr, limFt: lim, planFt: plan, nearField: nf });
    if (!nf) { if (Number.isFinite(agl)) minAgl = Math.min(minAgl, agl); if (Number.isFinite(xt)) maxXt = Math.max(maxXt, xt); }
    const hits = {};
    if (!nf && Number.isFinite(agl) && agl < o.aglWarnFt) hits.terreno = { lvl: agl < o.aglCritFt ? 'crit' : 'warn', v: agl };
    if (Number.isFinite(lim) && p.altFt > lim) hits.vds = { lvl: 'crit', v: p.altFt - lim, lim };
    if (!nf && xt > o.xtWarnNm) hits.rotta = { lvl: xt > o.xtCritNm ? 'warn' : 'info', v: xt };
    if (!nf && Number.isFinite(plan) && Math.abs(p.altFt - plan) > o.altDevFt) hits.quota = { lvl: 'info', v: p.altFt - plan };
    if (airspaceAt) for (const a of airspaceAt(p.lon, p.lat, p.altFt)) if (['vietato', 'autorizzazione', 'verifica'].includes(a.need)) hits[`spazio:${a.name}`] = { lvl: a.need === 'vietato' ? 'crit' : 'warn', v: 0, a };
    for (const [k, h] of Object.entries(hits)) {
      const e = open.get(k);
      if (!e) open.set(k, { kind: k.split(':')[0], key: k, lvl: h.lvl, from: p.t, i0: i, worst: h.v, worstI: i, a: h.a, lim: h.lim });
      else {
        if (RANK[h.lvl] < RANK[e.lvl]) e.lvl = h.lvl; // sale di livello (info → warn → crit), mai scende
        const worse = k === 'terreno' ? h.v < e.worst : Math.abs(h.v) > Math.abs(e.worst);
        if (worse) { e.worst = h.v; e.worstI = i; }
      }
    }
    for (const k of [...open.keys()]) if (!hits[k]) close(k, i - 1);
  }
  for (const k of [...open.keys()]) close(k, T.length - 1);
  for (const e of episodes) Object.assign(e, episodeText(e, T, o));
  episodes.sort((a, b) => RANK[a.lvl] - RANK[b.lvl] || a.from - b.from);
  return { samples: T, series, episodes, durMin: T.length ? (T.at(-1).t - T[0].t) / 60000 : 0, distNm,
    maxAltFt: Number.isFinite(maxAltFt) ? maxAltFt : NaN, minAglFt: Number.isFinite(minAgl) ? minAgl : NaN, maxXtNm: maxXt };
}

function episodeText(e, T, o = DEBRIEF) {
  const sec = Math.round((T[e.i1].t - T[e.i0].t) / 1000), dur = e.i1 === e.i0 ? 'in un punto della traccia' : sec < 60 ? `per ${sec} s` : `per ${Math.round(sec / 60)} min`;
  const at = new Date(T[e.worstI].t).toISOString().slice(11, 16);
  if (e.kind === 'terreno') return { title: `Margine dal terreno ${Math.round(e.worst)} ft`, text: `Alle ${at} UTC, ${dur}, lontano dai campi (sotto ${e.lvl === 'crit' ? o.aglCritFt : o.aglWarnFt} ft sul terreno).` };
  if (e.kind === 'vds') return { title: `Sopra il limite VDS di ${Math.round(e.worst)} ft`, text: `Alle ${at} UTC, ${dur}.` };
  if (e.kind === 'rotta') return { title: `Fuori rotta di ${e.worst.toFixed(1).replace('.', ',')} NM`, text: `Alle ${at} UTC, ${dur}.` };
  if (e.kind === 'quota') return { title: `${Math.round(Math.abs(e.worst) / 100) * 100} ft ${e.worst > 0 ? 'sopra' : 'sotto'} la quota pianificata`, text: `Alle ${at} UTC, ${dur}.` };
  if (e.kind === 'spazio') {
    const n = e.a.need;
    return { title: `${n === 'vietato' ? 'Dentro una zona vietata' : n === 'verifica' ? 'Dentro una zona regolamentata' : 'Dentro uno spazio controllato'}: ${e.a.name}`,
      text: `Alle ${at} UTC, ${dur}.${n === 'autorizzazione' ? ' Verifica di aver avuto l’autorizzazione.' : n === 'verifica' ? ' Verifica che non fosse attiva o di essere autorizzato.' : ''}` };
  }
  return { title: e.kind, text: '' };
}
