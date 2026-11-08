// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Regole e controlli: festività, limiti VDS, analisi della rotta, previsione dei conflitti in volo.
// Codice a regole verificabile: nessuna decisione di sicurezza è affidata a modelli linguistici.
import { NM, KT, distM, destPoint, pointInRing, bearingDeg } from './geo.js';
import { limitFt, limitText, category, entryRule } from './airspace.js';

// Festività nazionali italiane (con Pasquetta e, dal 2026, il 4 ottobre: L. 151/2025)
export function holidayName(d) {
  const y = d.getFullYear(), md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fixed = { '01-01': 'Capodanno', '01-06': 'Epifania', '04-25': 'Festa della Liberazione', '05-01': 'Festa dei Lavoratori', '06-02': 'Festa della Repubblica',
    '08-15': 'Ferragosto', '11-01': 'Ognissanti', '12-08': 'Immacolata', '12-25': 'Natale', '12-26': 'Santo Stefano' };
  if (y >= 2026) fixed['10-04'] = 'San Francesco d’Assisi';
  if (fixed[md]) return fixed[md];
  const e = easter(y), mon = new Date(y, e.month - 1, e.day + 1);
  if (mon.getMonth() === d.getMonth() && mon.getDate() === d.getDate()) return 'Lunedì dell’Angelo';
  return null;
}
export function easter(y) { // algoritmo gregoriano anonimo
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return { month: Math.floor((h + l - 7 * m + 114) / 31), day: ((h + l - 7 * m + 114) % 31) + 1 };
}

// Limite VDS (apparecchi dell'art. 2 lett. b) del DPR 133/2010): RAIT Ed. 4 Rev. 4 (12/06/2025), RAIT.5005 d)2)i,
// «fino ad un'altezza massima di 300 m (1 000 ft) dal terreno, determinata con riferimento all'ostacolo più elevato nel
// raggio di 5 000 m», ogni giorno, salvo diversa autorizzazione ENAC. Il testo del 2010 del DPR (500 ft nei feriali,
// 1000 ft sabato, domenica e festivi) è superato dal RAIT, che recepisce SERA (verifica del 7/11/2026).
// Eccezione RAIT.5005 d)2)ii: nelle zone VDS esistenti all'entrata in vigore di SERA dove il massimo resta 500 ft
// (override 'z500'). festivo/why restano come informazione sul giorno.
export const VDS_AGL_FT = 1000;
export const VDS_RULE = 'RAIT.5005 d)2)';
export function dayInfo(dateStr, override = 'auto') {
  const d = new Date(dateStr + 'T12:00:00');
  const vdsAgl = override === 'z500' ? 500 : VDS_AGL_FT;
  if (Number.isNaN(d.getTime())) return { festivo: false, why: 'data non valida', vdsAgl };
  const hol = holidayName(d), wd = d.getDay(), festivo = wd === 0 || wd === 6 || !!hol;
  return { festivo, why: hol || (wd === 6 ? 'sabato' : wd === 0 ? 'domenica' : 'giorno feriale'), vdsAgl, zone500: override === 'z500' };
}

// Spazi aerei che contengono il punto, con limiti convertiti in ft AMSL
export function airspacesAt(lon, lat, terrFt, airspaces, qnh) {
  const out = [];
  for (const a of airspaces) {
    const b = a.bbox;
    if (b && (lon < b.lonMin || lon > b.lonMax || lat < b.latMin || lat > b.latMax)) continue;
    if (!a.clipped.some(r => pointInRing([lon, lat], r))) continue;
    out.push({ a, lo: limitFt(a.lower, terrFt, qnh), hi: limitFt(a.upper, terrFt, qnh) });
  }
  return out;
}

const fmtNm = m => (m / NM).toFixed(1);

// Quota del tratto i (dal punto i al punto i+1): quella scritta sul punto di partenza del tratto, altrimenti la crociera
export const legAltFt = (route, i, cruiseFt) => (Number.isFinite(route[i]?.altFt) ? route[i].altFt : cruiseFt);

// Nessun tratto dentro le montagne (richiesta di Ale, 6/11 e 7/11/2026). La rotta tra due punti è una linea dritta alla
// quota del tratto; se il rilievo lungo il tratto è troppo alto, il programma ALZA la quota (mai la abbassa) quanto
// basta per passare sopra il punto più alto che si incontra, con margine, e lo segnala.
// Minimo di un tratto: rilievo più alto entro 600 m dalla linea del tratto + 500 ft, arrotondato ai 100 ft superiori.
// SERA.5005 f)2) chiede 500 ft sull'ostacolo più alto entro 150 m: il programma guarda 600 m (come per gli ostacoli,
// features.js) per prudenza e per l'errore laterale di condotta. Gli ostacoli artificiali restano negli avvisi.
// Nodo i (quota della casella del punto i): sul punto si arriva già alla sua quota (vprofile.js), quindi il nodo deve
// stare sopra il minimo del tratto che parte da lì e di quello che ci arriva (in discesa la rampa è nel tratto
// precedente). La salita dal campo di partenza e la discesa verso il campo d'arrivo sono esenti (avvisi dedicati).
export const LEG_CLEAR_FT = 500, LEG_CORRIDOR_M = 600;
// terrain: { maxNearFt(lon, lat, rM) } (o solo elevFt); restituisce { minFt, terrFt, at: {lon, lat} } o null
export function legCorridorMinFt(route, i, terrain, stepM = 150) {
  const a = route[i], b = route[i + 1];
  if (!a || !b) return null;
  const n = Math.max(1, Math.min(400, Math.ceil(distM(a, b) / stepM)));
  let top = -Infinity, at = null;
  for (let k = 0; k <= n; k++) {
    const t = k / n, lon = a.lon + t * (b.lon - a.lon), lat = a.lat + t * (b.lat - a.lat);
    const h = terrain.maxNearFt ? terrain.maxNearFt(lon, lat, LEG_CORRIDOR_M) : terrain.elevFt(lon, lat);
    if (Number.isFinite(h) && h > top) { top = h; at = { lon, lat }; }
  }
  return at ? { minFt: Math.ceil((top + LEG_CLEAR_FT) / 100) * 100, terrFt: Math.round(top), at } : null;
}
// minimo del nodo i: legMins[i] = minimo del tratto i (o null se non pronto)
export function nodeMinFt(legMins, i) {
  const m = [legMins[i], i > 0 ? legMins[i - 1] : null].filter(Boolean);
  if (!m.length) return null;
  return m.reduce((x, y) => (y.minFt > x.minFt ? y : x));
}
// Alza i nodi troppo bassi; restituisce le modifiche { node, fromFt, toFt, leg, terrFt }
export function enforceLegClearance({ route, cruiseFt, legMins }) {
  const changes = [];
  for (let i = 0; i < route.length - 1; i++) {
    const m = nodeMinFt(legMins, i);
    if (!m) continue;
    const cur = legAltFt(route, i, cruiseFt);
    if (cur < m.minFt) { route[i].altFt = m.minFt; changes.push({ node: i, fromFt: cur, toFt: m.minFt, leg: legMins[i] === m ? i : i - 1, terrFt: m.terrFt }); }
  }
  return changes;
}

// Analisi completa della rotta pianificata
// uncFt: incertezza verticale considerata (precisione di condotta più errore dell'altimetro). Una quota
// pianificata entro uncFt da un limite produce l'avviso «vicino al limite».
// profile (facoltativo): profilo verticale con rampe (vprofile.js) = { altAt(d), depEnd, arrStart, depField, arrField }.
// Nei tratti di salita dal campo di partenza e di discesa verso il campo di arrivo il margine dal terreno è per forza
// piccolo vicino al campo: lì si segnala solo il terreno sopra la rampa (oltre 1 km dal campo) o un margine sotto i
// 300 ft (oltre 3 km dal campo). Altrove valgono le regole normali.
export function analyseRoute({ route, cruiseFt, pilot, qnh, airspaces, terrain, day, uncFt = 200, profile = null }) {
  const res = { samples: [], total: 0, hits: [], warnings: [], legs: [] };
  if (route.length < 2) return res;
  for (let i = 0; i < route.length - 1; i++) { const d = distM(route[i], route[i + 1]); res.legs.push({ dist: d, trk: bearingDeg(route[i], route[i + 1]) }); res.total += d; }
  const step = Math.max(150, res.total / 500);
  const hits = new Map(), nearHits = new Map();
  let acc = 0;
  for (let i = 0; i < res.legs.length; i++) {
    const L = res.legs[i].dist, n = Math.max(1, Math.ceil(L / step));
    for (let k = (i === 0 ? 0 : 1); k <= n; k++) {
      const t = k / n, lon = route[i].lon + t * (route[i + 1].lon - route[i].lon), lat = route[i].lat + t * (route[i + 1].lat - route[i].lat);
      // terr: rilievo più alto entro 150 m (quote minime SERA.5005(f)), per i margini; terrC: terreno sulla linea,
      // per i limiti degli spazi aerei riferiti al suolo
      const dist = acc + t * L, terrC = terrain.elevFt(lon, lat), terr = terrain.maxNearFt ? terrain.maxNearFt(lon, lat) : terrC, alt = profile ? Math.round(profile.altAt(dist)) : legAltFt(route, i, cruiseFt);
      const phase = (profile?.depField || profile?.depGround) && dist < profile.depEnd ? 'dep' : (profile?.arrField || profile?.arrGround) && dist > profile.arrStart ? 'arr' : 'cruise';
      const s = { dist, lon, lat, terr, alt, phase, vds: pilot === 'basico' ? terrain.maxWithinFt(lon, lat) + day.vdsAgl : NaN, air: airspacesAt(lon, lat, terrC, airspaces, qnh) };
      for (const h of s.air) if (alt >= h.lo && alt <= h.hi) {
        const x = hits.get(h.a) || { a: h.a, from: dist, to: dist };
        x.to = dist; hits.set(h.a, x);
      } else if (alt >= h.lo - uncFt && alt <= h.hi + uncFt) {
        const gap = alt < h.lo ? h.lo - alt : alt - h.hi;
        const x = nearHits.get(h.a) || { a: h.a, from: dist, gap, side: alt < h.lo ? 'sotto' : 'sopra', limit: alt < h.lo ? h.lo : h.hi };
        if (gap < x.gap) Object.assign(x, { gap, side: alt < h.lo ? 'sotto' : 'sopra', limit: alt < h.lo ? h.lo : h.hi });
        nearHits.set(h.a, x);
      }
      res.samples.push(s);
    }
    acc += L;
  }
  res.hits = [...hits.values()].sort((p, q) => p.from - q.from);
  const W = res.warnings;
  const cruiseS = res.samples.filter(s => s.phase === 'cruise');
  const worst = cruiseS.length ? cruiseS.reduce((b, s) => (s.alt - s.terr < b.alt - b.terr ? s : b), cruiseS[0]) : { alt: Infinity, terr: 0, dist: 0 };
  const minClear = worst.alt - worst.terr;
  // salita dal campo e discesa verso il campo
  for (const [ph, field, from] of [['dep', profile?.depField, 0], ['arr', profile?.arrField, res.total]]) {
    if (!field) continue;
    const S = res.samples.filter(s => s.phase === ph && Number.isFinite(s.terr));
    const inside = S.filter(s => Math.abs(s.dist - from) > 1000 && s.alt < s.terr);
    const low = S.filter(s => Math.abs(s.dist - from) > 3000 && s.alt - s.terr < 300);
    const what = ph === 'dep' ? 'salita dopo il decollo' : 'discesa verso l’arrivo';
    if (inside.length) { const w = inside.reduce((b, s) => (s.alt - s.terr < b.alt - b.terr ? s : b));
      W.push({ lvl: 'crit', kind: 'terrain', at: w.dist, title: `Terreno sopra la ${what}`, text: `A ${fmtNm(w.dist)} NM il terreno (${Math.round(w.terr)} ft) è sopra la quota della rampa (${w.alt} ft) con il rateo pianificato.`,
        plain: `Con il rateo pianificato, nella ${what} incontri il rilievo a ${fmtNm(w.dist)} miglia dalla partenza. ${ph === 'dep' ? 'Cambia percorso o prevedi di salire sopra il campo prima di partire.' : 'Cambia percorso o pianifica la discesa più tardi e più ripida.'}` }); }
    else if (low.length) { const w = low.reduce((b, s) => (s.alt - s.terr < b.alt - b.terr ? s : b));
      W.push({ lvl: 'warn', kind: 'terrain', at: w.dist, title: `Margine dal terreno sotto 300 ft nella ${what}`, text: `Minimo ${Math.round(w.alt - w.terr)} ft a ${fmtNm(w.dist)} NM, oltre 3 km dal campo.`,
        plain: `Nella ${what} passi a soli ${Math.round(w.alt - w.terr)} piedi dal terreno a ${fmtNm(w.dist)} miglia dalla partenza.` }); }
  }
  if (minClear < 0) W.push({ lvl: 'crit', kind: 'terrain', at: worst.dist, title: 'La rotta passa dentro il terreno', text: `A ${fmtNm(worst.dist)} NM il terreno è a ${Math.round(worst.terr)} ft, sopra la quota pianificata (${worst.alt} ft).`,
    plain: `Alla quota scelta (${worst.alt} ft) incontri una montagna a ${fmtNm(worst.dist)} miglia dalla partenza. Sali o cambia percorso.` });
  else if (minClear < 500) W.push({ lvl: 'warn', kind: 'terrain', at: worst.dist, title: 'Margine dal terreno sotto 500 ft', text: `Minimo ${Math.round(minClear)} ft a ${fmtNm(worst.dist)} NM. Ostacoli artificiali non inclusi.`,
    plain: `Passi a soli ${Math.round(minClear)} piedi dal terreno a ${fmtNm(worst.dist)} miglia dalla partenza. Cavi e tralicci non sono ancora nella carta.` });
  if (pilot === 'basico') {
    const over = res.samples.filter(s => s.alt > s.vds + 0.5);
    if (over.length) {
      const o = over.reduce((b, s) => (s.alt - s.vds > b.alt - b.vds ? s : b));
      W.push({ lvl: 'crit', kind: 'vds', at: o.dist, title: `Oltre il limite VDS di ${day.vdsAgl} ft`, text: `Fino a ${Math.round(o.alt - o.vds)} ft sopra il limite a ${fmtNm(o.dist)} NM (rilievo più alto entro 5 km; ${day.zone500 ? 'zona VDS con limite di 500 ft, RAIT.5005 d)2)ii' : 'RAIT.5005 d)2)i, salvo autorizzazione ENAC'}).`,
        plain: `Con il VDS puoi stare al massimo ${day.vdsAgl} piedi sopra il rilievo più alto entro 5 km. In un punto sei ${Math.round(o.alt - o.vds)} piedi troppo alto: scendi.` });
    }
  }
  for (const h of res.hits) {
    const r = entryRule(h.a, pilot), where = `da ${fmtNm(h.from)} a ${fmtNm(h.to)} NM, ${limitText(h.a.lower)}–${limitText(h.a.upper)}`;
    W.push({ lvl: r.level, kind: 'airspace', need: r.need, airspace: h.a, at: h.from, title: `${h.a.name}`, text: `${where}. ${r.text}`,
      plain: `Tra ${fmtNm(h.from)} e ${fmtNm(h.to)} miglia attraversi «${h.a.name}». ${r.text}` });
  }
  for (const n of nearHits.values()) {
    if (hits.has(n.a)) continue;
    const r = entryRule(n.a, pilot);
    if (r.need === 'nessuno') continue;
    W.push({ lvl: 'warn', kind: 'airspace-near', airspace: n.a, at: n.from, title: `Vicino al limite di ${n.a.name}`,
      text: `A ${fmtNm(n.from)} NM passi ${Math.round(n.gap)} ft ${n.side} il limite (${Math.round(n.limit)} ft): meno dell'incertezza di ±${uncFt} ft. ${r.text}`,
      plain: `A ${fmtNm(n.from)} miglia passi solo ${Math.round(n.gap)} piedi ${n.side} «${n.a.name}». Con gli errori di quota potresti finirci dentro: ${n.side === 'sotto' ? 'scendi' : 'sali'} un po'.` });
  }
  if (!W.some(w => w.lvl !== 'info')) W.unshift({ lvl: 'ok', kind: 'none', title: 'Nessun conflitto con i dati caricati', text: 'Vale solo per i dati caricati e per la quota pianificata.',
    plain: 'Con i dati caricati la rotta è libera. Controlla comunque NOTAM e meteo prima di partire.' });
  return res;
}

// Previsione in volo: dove sarò nei prossimi minuti su questa rotta e velocità, e che cosa incontrerò.
// uncFt: incertezza della quota misurata (GPS o barometrica). Se entro l'incertezza si sarebbe dentro uno
// spazio aereo, l'evento è «potresti essere dentro» (livello attenzione).
export function lookahead({ pos, trackDeg, gsKt, altFt, minutes = 5, stepSec = 10, pilot, qnh, airspaces, terrain, day, uncFt = 0, obstacles = [], obstacleTopFt = null, vsFpm = 0, floorFt = -Infinity, warnAglFt = 300 }) {
  const events = [], seen = new Set();
  const nowInside = new Set(airspacesAt(pos.lon, pos.lat, terrain.elevFt(pos.lon, pos.lat), airspaces, qnh).filter(h => altFt >= h.lo && altFt <= h.hi).map(h => h.a));
  const v = Math.max(gsKt, 0) * KT;
  // Traiettoria verticale: con un variometro affidabile (oltre ±100 ft/min) la quota prevista segue la salita o la
  // discesa. La salita conta per il 75 % e al massimo 1500 ft/min (prudenza: il rateo cala salendo), la discesa per
  // intero fino a 2000 ft/min. Si proietta solo per 2 minuti in salita e 1 minuto in discesa (dopo si suppone il volo
  // livellato) e mai sotto floorFt (quota del campo, in circuito e in finale): altrimenti ogni avvicinamento normale
  // finirebbe «dentro il terreno».
  // Senza variometro si suppone il volo livellato. warnAglFt: margine sotto cui scatta l'attenzione (300 ft; 150 ft per
  // il VDS non avanzato, che vola per norma a 500 ft sul rilievo e riceverebbe avvisi continui).
  const vs = Number.isFinite(vsFpm) && Math.abs(vsFpm) > 100 ? (vsFpm > 0 ? Math.min(1500, 0.75 * vsFpm) : Math.max(-2000, vsFpm)) : 0;
  for (let t = 0; t <= minutes * 60; t += stepSec) {
    const p = destPoint([pos.lon, pos.lat], trackDeg, v * t / NM), terrC = terrain.elevFt(p[0], p[1]), terr = terrain.maxNearFt ? terrain.maxNearFt(p[0], p[1]) : terrC, a = Math.max(floorFt, altFt + vs * Math.min(t, vs > 0 ? 120 : 60) / 60); // quota prevista a t
    // terreno: il primo punto con poco margine (attenzione) e, se più avanti si finisce dentro il rilievo, anche quello
    // (grave). Prima il solo avviso di attenzione nascondeva quello grave che veniva dopo.
    if (Number.isFinite(terr) && a - terr < warnAglFt + uncFt) {
      const lvl = a < terr ? 'crit' : 'warn';
      if (!seen.has('terrain') || (lvl === 'crit' && !seen.has('terrain-crit'))) {
        seen.add('terrain'); if (lvl === 'crit') seen.add('terrain-crit');
        events.push({ kind: 'terrain', t, distNm: v * t / NM, lvl, clearance: a - terr });
      }
    }
    // ostacoli entro 600 m dal punto previsto con meno di 500 ft di margine (più l'incertezza della quota)
    if (obstacleTopFt && !seen.has('obstacle-crit')) for (const o of obstacles) {
      if (Math.abs(o.lat - p[1]) > 0.006 || Math.abs(o.lon - p[0]) > 0.008 || distM(o, { lon: p[0], lat: p[1] }) > 600) continue;
      const top = obstacleTopFt(o);
      if (a - top < 500 + uncFt) {
        const lvl = a < top ? 'crit' : 'warn';
        if (lvl === 'warn' && seen.has('obstacle')) continue;
        seen.add('obstacle'); if (lvl === 'crit') seen.add('obstacle-crit');
        events.push({ kind: 'obstacle', t, distNm: v * t / NM, lvl, clearance: a - top, obstacle: o }); break;
      }
    }
    if (pilot === 'basico' && !seen.has('vds') && t <= 120) {
      const lim = terrain.maxWithinFt(p[0], p[1]) + day.vdsAgl;
      if (a > lim) { seen.add('vds'); events.push({ kind: 'vds', t, distNm: v * t / NM, lvl: 'crit', over: a - lim, limit: lim }); }
    }
    for (const h of airspacesAt(p[0], p[1], terrC, airspaces, qnh)) {
      if (a < h.lo - uncFt || a > h.hi + uncFt || nowInside.has(h.a)) continue;
      // «vicino al limite» e «dentro» sono eventi distinti: il primo non deve nascondere il secondo che viene dopo
      const marginal = a < h.lo || a > h.hi, key = marginal ? h.a : `${h.a.id}-dentro`;
      if (seen.has(key) || seen.has(`${h.a.id}-dentro`)) continue;
      seen.add(key);
      const r = entryRule(h.a, pilot);
      if (r.need === 'nessuno') continue;
      events.push({ kind: 'airspace', t, distNm: v * t / NM, lvl: marginal ? 'warn' : r.level, airspace: h.a, rule: r, marginal,
        gap: marginal ? (a < h.lo ? h.lo - a : a - h.hi) : 0 });
    }
    if (v === 0 && !vs) break;
  }
  return { events, inside: [...nowInside] };
}

// Testo breve da leggere a voce, in italiano semplice
export function eventSpeech(e) {
  const mm = Math.floor(e.t / 60), ss = Math.round((e.t % 60) / 10) * 10;
  const quando = e.t < 15 ? 'adesso' : `tra ${mm ? mm + (mm === 1 ? ' minuto' : ' minuti') : ''}${mm && ss ? ' e ' : ''}${ss ? ss + ' secondi' : ''}`;
  if (e.kind === 'terrain') return `Attenzione terreno ${quando}. Sali.`;
  if (e.kind === 'obstacle') return `Ostacolo ${quando}. Sali.`;
  if (e.kind === 'vds') return `Limite VDS superato ${quando}. Scendi di ${Math.round(e.over / 100) * 100} piedi.`;
  const a = e.airspace, cat = category(a);
  const what = cat === 'P' ? 'zona proibita' : cat === 'R' ? 'zona regolamentata' : cat === 'Q' ? 'zona pericolosa' : cat === 'CTRL' ? 'spazio controllato' : 'zona';
  return e.marginal ? `Vicino al limite di ${what} ${a.name} ${quando}.` : `${what} ${a.name} ${quando}.`;
}
