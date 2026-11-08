// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Minimi personali del pilota (base delle nubi, visibilità, vento, raffiche, vento al traverso) confrontati con il
// METAR attuale e con il TAF all'ora di partenza e di arrivo. Sono limiti scelti dal pilota, più prudenti dei minimi
// di legge: il programma non decide se partire, dice solo dove le condizioni li superano.
import { distM } from './geo.js';

const KM_PER_SM = 1.609344;

// Minimi proposti: modificabili dal pilota nelle impostazioni. Il traverso parte dal valore dimostrato dell'aereo.
export const MINIMA_DEFAULT = { ceilFt: 1500, visKm: 8, windKt: 20, gustKt: 25, xwindKt: null };

// ---------------------------------------------------------------- TAF
// Condizioni di un gruppo: vento (gradi, nodi, raffiche), visibilità in metri, base delle nubi rilevanti (BKN, OVC, VV)
function parseCond(tokens) {
  const c = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let m;
    if ((m = /^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/.exec(t))) {
      const k = m[4] === 'MPS' ? 1.943844 : 1;
      c.wdir = m[1] === 'VRB' ? null : Number(m[1]); c.wspd = Math.round(Number(m[2]) * k); c.wgst = m[3] ? Math.round(Number(m[3]) * k) : null;
    } else if (t === 'CAVOK') { c.visM = 10000; c.ceilFt = Infinity; c.cavok = true; }
    else if (/^\d{4}$/.test(t)) c.visM = t === '9999' ? 10000 : Number(t);
    else if (/^\d$/.test(t) && (m = /^(\d)\/(\d)SM$/.exec(tokens[i + 1] || ''))) { c.visM = Math.round((Number(t) + Number(m[1]) / Number(m[2])) * KM_PER_SM * 1000); i++; } // «1 1/2SM»
    else if ((m = /^M?(\d{1,2})(?:\/(\d))?SM$/.exec(t))) c.visM = Math.round((m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1])) * KM_PER_SM * 1000);
    else if ((m = /^P6SM$/.exec(t))) c.visM = 10000;
    else if ((m = /^(BKN|OVC)(\d{3})/.exec(t)) || (m = /^(VV)(\d{3})$/.exec(t))) c.ceilFt = Math.min(c.ceilFt ?? Infinity, Number(m[2]) * 100);
    else if (/^(BKN|OVC|VV)\/\/\//.test(t)) c.ceilFt = 0; // base non misurata o cielo oscurato: per prudenza al suolo
    else if (/^(FEW|SCT)\d{3}/.test(t) || t === 'NSC' || t === 'SKC' || t === 'NCD') c.ceilFt = c.ceilFt ?? Infinity;
    else if (/^[+-]?(VC)?(TS|SH|RA|SN|DZ|FG|BR|HZ|GR|GS|FZ|PL|SG)/.test(t)) c.wx = c.wx ? `${c.wx} ${t}` : t;
    else if (t === 'NSW') c.wx = '';
  }
  return c;
}

// Data assoluta di un gruppo «giorno ora» (DDHH, con ore 24) vicino all'emissione del bollettino
function dayHour(dd, hh, ref, mm = 0) {
  const d = new Date(ref);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), Number(dd), Number(hh), Number(mm));
  // il giorno può essere del mese dopo (bollettino emesso il 30 per il 1°) o di quello prima
  if (t < ref - 15 * 86400000) t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, Number(dd), Number(hh), Number(mm));
  if (t > ref + 15 * 86400000) t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, Number(dd), Number(hh), Number(mm));
  return t;
}

// Divide il TAF in gruppi: base, FM (cambia tutto), BECMG (cambio graduale), TEMPO e PROB (possibili)
export function parseTaf(raw, now = Date.now()) {
  if (!raw) return null;
  const tok = raw.replace(/=/g, ' ').trim().split(/\s+/);
  let i = 0;
  while (i < tok.length && /^(TAF|AMD|COR|RTD)$/.test(tok[i])) i++;
  const id = tok[i++];
  let issued = now;
  if (/^\d{6}Z$/.test(tok[i])) { issued = dayHour(tok[i].slice(0, 2), tok[i].slice(2, 4), now, tok[i].slice(4, 6)); i++; }
  const vm = /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/.exec(tok[i] || '');
  if (!vm) return null;
  const from = dayHour(vm[1], vm[2], issued), to = dayHour(vm[3], vm[4], issued);
  i++;
  const groups = []; let cur = { type: 'BASE', from, to, tokens: [] };
  const push = () => { groups.push({ type: cur.type, from: cur.from, to: cur.to, prob: cur.prob || null, cond: parseCond(cur.tokens) }); };
  while (i < tok.length) {
    const t = tok[i];
    let m;
    if ((m = /^FM(\d{2})(\d{2})(\d{2})$/.exec(t))) { push(); cur = { type: 'FM', from: dayHour(m[1], m[2], issued, m[3]), to, tokens: [] }; i++; continue; }
    if (t === 'BECMG' || t === 'TEMPO' || /^PROB(30|40)$/.test(t)) {
      push();
      let type = t, prob = null;
      if (/^PROB/.test(t)) { prob = Number(t.slice(4)); type = 'PROB'; if (tok[i + 1] === 'TEMPO') { i++; type = 'PROB TEMPO'; } }
      const pm = /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/.exec(tok[i + 1] || '');
      cur = { type, prob, from: pm ? dayHour(pm[1], pm[2], issued) : from, to: pm ? dayHour(pm[3], pm[4], issued) : to, tokens: [] };
      i += pm ? 2 : 1; continue;
    }
    if (/^(TX|TN)/.test(t)) { i++; continue; }
    cur.tokens.push(t); i++;
  }
  push();
  // la fine di ogni FM è l'inizio del successivo
  const fms = groups.filter(g => g.type === 'BASE' || g.type === 'FM');
  for (let k = 0; k < fms.length - 1; k++) fms[k].to = fms[k + 1].from;
  return { id, issued, from, to, groups, raw };
}

// Condizioni all'ora t: quelle prevalenti (base, FM, BECMG già completati; durante un BECMG valgono entrambe)
// e quelle possibili (TEMPO e PROB in corso). Restituisce null fuori dal periodo di validità.
export function tafAt(taf, t) {
  if (!taf || t < taf.from || t > taf.to) return null;
  const fm = taf.groups.filter(g => (g.type === 'BASE' || g.type === 'FM') && g.from <= t).at(-1) || taf.groups[0];
  const prevailing = [{ ...fm.cond }];
  for (const g of taf.groups) {
    if (g.type !== 'BECMG' || g.from < fm.from) continue;
    if (t >= g.to) Object.assign(prevailing[0], g.cond);                   // cambio completato
    else if (t >= g.from) prevailing.push({ ...prevailing[0], ...g.cond }); // in corso: vale il peggiore dei due
  }
  const possible = taf.groups.filter(g => ['TEMPO', 'PROB', 'PROB TEMPO'].includes(g.type) && t >= g.from && t < g.to)
    .map(g => ({ ...g.cond, label: g.type === 'TEMPO' ? 'temporaneamente' : `probabilità ${g.prob} %${g.type === 'PROB TEMPO' ? ', temporaneamente' : ''}` }));
  return { prevailing, possible };
}

// ---------------------------------------------------------------- vento sulla pista
// Componente al traverso (nodi) sulla pista migliore: quella con meno traverso (a parità, più vento in prua).
// Il traverso è lo stesso sulle due testate di una pista.
export function bestRunwayCrosswind(wdir, wkt, runways = []) {
  if (wdir == null || !Number.isFinite(wkt) || !runways.length) return null;
  let best = null;
  for (const r of runways) {
    const deg = runwayDeg(r);
    if (deg == null) continue;
    const a = (wdir - deg) * Math.PI / 180, head = wkt * Math.cos(a), cross = Math.abs(wkt * Math.sin(a));
    if (!best || cross < best.cross - 0.5 || (Math.abs(cross - best.cross) <= 0.5 && Math.abs(head) > Math.abs(best.head))) best = { rwy: r, head, cross };
  }
  return best;
}
// «08», «26L», «08/26» → orientamento in gradi (la prima delle due testate)
export function runwayDeg(r) {
  const m = /^(\d{1,2})(?!\d)/.exec(String(r).trim());
  return m && Number(m[1]) >= 1 && Number(m[1]) <= 36 ? (Number(m[1]) % 36) * 10 || 360 : null;
}
// ---------------------------------------------------------------- confronto
function checkCond(c, mins, rwys, src) {
  const out = [];
  if (Number.isFinite(c.ceilFt) && Number.isFinite(mins.ceilFt) && c.ceilFt < mins.ceilFt) out.push(`base delle nubi ${c.ceilFt} ft (tuo minimo ${mins.ceilFt})`);
  if (Number.isFinite(c.visM) && Number.isFinite(mins.visKm) && c.visM < mins.visKm * 1000) out.push(`visibilità ${c.visM >= 1000 ? `${(c.visM / 1000).toFixed(c.visM % 1000 ? 1 : 0).replace('.', ',')} km` : `${c.visM} m`} (tuo minimo ${String(mins.visKm).replace('.', ',')} km)`);
  if (Number.isFinite(c.wspd) && Number.isFinite(mins.windKt) && c.wspd > mins.windKt) out.push(`vento ${c.wspd} kt (tuo massimo ${mins.windKt})`);
  if (Number.isFinite(c.wgst) && Number.isFinite(mins.gustKt) && c.wgst > mins.gustKt) out.push(`raffiche ${c.wgst} kt (tuo massimo ${mins.gustKt})`);
  if (Number.isFinite(mins.xwindKt)) {
    const vmax = Math.max(c.wspd || 0, c.wgst || 0);
    if (c.wdir == null && Number.isFinite(c.wspd) && vmax > mins.xwindKt) out.push(`vento variabile ${c.wspd} kt${c.wgst ? ` con raffiche ${c.wgst}` : ''}: al traverso può arrivare a ${vmax} kt (tuo massimo ${mins.xwindKt})`);
    const x = bestRunwayCrosswind(c.wdir, Math.max(c.wspd || 0, c.wgst || 0), rwys);
    if (x && x.cross > mins.xwindKt) out.push(`traverso ${Math.round(x.cross)} kt sulla pista ${x.rwy}${c.wgst ? ' con le raffiche' : ''} (tuo massimo ${mins.xwindKt})`);
  }
  return out.map(t => `${src}: ${t}`);
}

// Stazione meteo che descrive un campo: la più vicina entro 25 km
export function stationFor(p, stations, maxKm = 25) {
  let best = null;
  for (const s of stations) { const d = distM(p, s) / 1000; if (d <= maxKm && (!best || d < best.d)) best = { s, d }; }
  return best;
}

// Avvisi: confronto per partenza (METAR adesso e TAF all'ora di decollo) e arrivo (TAF all'ora di arrivo;
// METAR se l'arrivo è entro un'ora). rwys(p) restituisce le testate pista del campo vicino al punto, se note.
export function minimaWarnings({ route, stations = [], minima, depMs, arrMs, now = Date.now(), rwys = () => [] }) {
  const W = [];
  if (!minima || route.length < 2 || !stations.length) return W;
  const ends = [{ role: 'partenza', p: route[0], t: depMs }, { role: 'arrivo', p: route.at(-1), t: arrMs }];
  for (const { role, p, t } of ends) {
    const st = stationFor(p, stations);
    if (!st) { W.push({ lvl: 'info', kind: 'minimi', title: `Minimi non verificabili in ${role}`, text: `Nessun METAR entro 25 km dal campo di ${role}.` }); continue; }
    const s = st.s, r = rwys(p), crit = [], warn = [];
    const useMetar = s.ageMin <= 90 && (role === 'partenza' || !Number.isFinite(t) || t - now < 3600000);
    if (useMetar) {
      const vis = Number.isFinite(s.visSm) ? (s.visSm >= 6 ? 10000 : Math.round(s.visSm * KM_PER_SM * 1000)) : NaN;
      crit.push(...checkCond({ ceilFt: s.ceilFt, visM: vis, wdir: Number.isFinite(Number(s.wdir)) ? Number(s.wdir) : null, wspd: Number(s.wspd), wgst: Number.isFinite(Number(s.wgst)) ? Number(s.wgst) : null }, minima, r, 'METAR'));
    }
    const taf = parseTaf(s.rawTaf, now), at = taf && Number.isFinite(t) ? tafAt(taf, t) : null;
    const hh = Number.isFinite(t) ? new Date(t).toISOString().slice(11, 16) : '';
    if (at) {
      for (const c of at.prevailing) crit.push(...checkCond(c, minima, r, `TAF alle ${hh} UTC`));
      for (const c of at.possible) warn.push(...checkCond(c, minima, r, `TAF alle ${hh} UTC, ${c.label}`));
    }
    const where = `${s.id}${st.d > 3 ? ` (${Math.round(st.d)} km dal campo di ${role})` : ''}`;
    // senza dati per l'ora del volo i minimi non sono verificati: dirlo, perché il silenzio sembrerebbe un via libera
    if (!at && !useMetar && Number.isFinite(t)) W.push({ lvl: 'warn', kind: 'minimi', title: `Minimi non verificabili in ${role} (${s.id})`,
      text: `${where}: ${taf ? `il TAF non copre le ${hh} UTC` : 'nessun TAF'} e il METAR ${s.ageMin > 90 ? 'è scaduto' : 'non vale per quell’ora'}.` });
    if (crit.length) W.push({ lvl: 'crit', kind: 'minimi', title: `Sotto i tuoi minimi in ${role} (${s.id})`, text: `${where}: ${[...new Set(crit)].join('; ')}.` });
    if (warn.length) W.push({ lvl: 'warn', kind: 'minimi', title: `Possibile sotto i tuoi minimi in ${role} (${s.id})`, text: `${where}: ${[...new Set(warn)].join('; ')}.` });
  }
  return W;
}
