// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Piano di volo: log di navigazione, carburante, peso e centraggio, alternato; salvataggio e GPX.
// Calcoli a regole, verificabili a mano con il computer di navigazione (E6B). Nessun dato dell'aereo è
// inventato: i profili partono dai valori del modulo dell'Aeroclub dei Marsi o da quelli inseriti dal pilota.
import { FT, NM, distM, bearingDeg, degLengths } from './geo.js';
import { VERSION, AUTHOR } from './version.js';

export const KMH_PER_KT = 1.852;
const T0 = 288.15, P0 = 1013.25, LAPSE = 0.0065, EXP = 5.25588;

// ---------------------------------------------------------------- profili aereo
// Profili di riferimento dell'Aeroclub dei Marsi. Fonti, in ordine:
// 1. modulo «Piano di volo» dell'aeroclub e piano compilato AQ01 → BO09 del 12/04/2024 (P2002 Sierra): MTOW 600 kg,
//    limiti del baricentro 0,282 – 0,451 m, bracci, peso a vuoto 370 kg, IAS 180 km/h, densità 0,78 kg/l, riserva 10 l;
// 2. manuali di volo forniti da Ale il 6/11/2026:
//    - P2002 Sierra, Doc. 2002/57 ed. 3 (18/04/2008): serbatoi 2 × 50 l, consumo 19,1 l/h al 70 % e 20,4 l/h al 75 %,
//      Vy 130 km/h, efficienza 12,8 a 123 km/h, vento al traverso dimostrato 15 kt, baricentro 20 – 33 % CMA
//      (1,611 – 1,789 m dalla flangia dell'elica = 0,274 – 0,452 m dalla linea del bordo d'attacco, che sta a 1,337 m).
//      ATTENZIONE: questo manuale vale per MTOW 450 kg e peso a vuoto standard 289 kg, mentre il modulo dell'aeroclub
//      usa 600 kg e 370 kg: l'aereo dell'aeroclub è una versione diversa (o ha un supplemento). Per peso e salita
//      restano i valori del modulo; il diagramma di salita (fino a 450 kg) non si applica.
//    - P96 Golf (copia manualslib del manuale Tecnam, ottobre 1998): MTOW 544 kg, baricentro 22 – 25 % della corda
//      media (1,4 m) = 0,308 – 0,350 m dalla linea del bordo d'attacco, serbatoi 2 × 35 l (opzionale 90 l), consumo
//      912 UL 14 l/h a 4800 giri (95 kt CAS) e 16 l/h a 5000 giri (100 kt), salita 4,5 m/s al livello del mare e
//      1,6 m/s a 3000 m (544 kg, Vy 65 kt), vento al traverso dimostrato 15 kt, planata a 60 kt.
//      Il manuale NON riporta i bracci di pilota, carburante e bagagli né il peso a vuoto del singolo aereo
//      (281 kg è lo standard): servono la scheda di pesata e il foglio di carico dell'aereo dell'aeroclub.
// Sono valori di RIFERIMENTO, non del singolo esemplare: vanno verificati su manuale e scheda di pesata dell'aereo.
const KMH = 1.852;
const ACM_NOTE = 'Valori di riferimento: modulo e piano compilato dell’Aeroclub dei Marsi (pesi, bracci, baricentro) e manuale P2002 Sierra ed. 3/2008 (serbatoi, consumi, Vy, planata, vento al traverso). Il manuale vale per 450 kg: l’aereo dell’aeroclub (600 kg sul modulo) ha un manuale o un supplemento diverso, da verificare. Il rateo di salita del manuale (fino a 450 kg) non si applica: si usa un valore prudente finché non inserisci quello del tuo aereo.';
export const FORM_ACM = {
  id: 'acm-sierra', name: 'P2002 Sierra (riferimento ACM)', reg: '', type: 'Tecnam P2002 Sierra', note: ACM_NOTE, ref: true,
  iasKt: 180 / KMH, speedUnit: 'kmh', fuelFlowLh: 19.5, fuelDensity: 0.78, reserveL: 10, mtowKg: 600, cgMinM: 0.282, cgMaxM: 0.451,
  emptyKg: 370, arms: { empty: 0.30, pilot: 0.52, copilot: 0.52, fuel: 0.21, luggage: 1.09 }, tankL: 100, maxLuggageKg: null,
  climb: { rocSlFpm: null, rocHiFpm: null, hiFt: null, kt: 130 / KMH }, descentFpm: 500, crosswindKt: 15, glideRatio: 12.8, glideKt: 123 / KMH,
};
export const GOLF_ACM = {
  id: 'acm-golf', name: 'P96 Golf (riferimento ACM)', reg: '', type: 'Tecnam P96 Golf', ref: true,
  note: 'Valori del manuale P96 Golf (ottobre 1998, motore 912 UL) e velocità di crociera dell’aeroclub (180 km/h). Consumo 16 l/h a 5000 giri, il valore più alto della tabella vicino ai 180 km/h. Mancano peso a vuoto e bracci di carico, che il manuale non riporta: inseriscili dalla scheda di pesata. Se il vostro Golf è la versione /100 (912 S) il consumo è più alto (fino a 20 l/h) e la salita migliore.',
  iasKt: 180 / KMH, speedUnit: 'kmh', fuelFlowLh: 16, fuelDensity: 0.78, reserveL: 10, mtowKg: 544, cgMinM: 0.308, cgMaxM: 0.350,
  emptyKg: null, arms: { empty: null, pilot: null, copilot: null, fuel: null, luggage: null }, tankL: 70, maxLuggageKg: null,
  climb: { rocSlFpm: 885.8, rocHiFpm: 315.0, hiFt: 9842.5, kt: 65 }, descentFpm: 500, crosswindKt: 15, glideRatio: null, glideKt: 60,
};
// Valori di pianificazione usati quando il profilo non ha i dati: NON sono dati di un aereo, sono ipotesi prudenti
// dichiarate a schermo (salita lenta = rampa più lunga = più tempo vicino al terreno nei controlli).
export const PLANNING_DEFAULTS = { rocFpm: 500, climbKt: 65, descentFpm: 500 };
export const REFERENCE_AIRCRAFT = [FORM_ACM, GOLF_ACM];

// ---------------------------------------------------------------- triangolo del vento
// tc: rotta vera (°), tas (kt), wind: { dir (da dove soffia, °), kt }. Restituisce correzione, prua vera, velocità al suolo.
export function windTriangle(tc, tas, wind) {
  if (!wind || !(wind.kt > 0)) return { wca: 0, th: tc, gs: tas };
  const th = (wind.dir - tc) * Math.PI / 180, cross = wind.kt * Math.sin(th);
  if (Math.abs(cross) >= tas) return { wca: NaN, th: NaN, gs: NaN }; // vento al traverso più forte della velocità
  const wca = Math.asin(cross / tas) * 180 / Math.PI;
  const gs = tas * Math.cos(wca * Math.PI / 180) - wind.kt * Math.cos(th);
  return { wca, th: (tc + wca + 360) % 360, gs };
}

// IAS → TAS (IAS considerata uguale alla CAS: errore d'installazione dell'anemometro non noto)
export function tasFromIas(iasKt, altFt, qnh = P0, oatC = null) {
  const pa = altFt - (qnh - P0) * 27;                       // altitudine di pressione (ft)
  const p = P0 * (1 - LAPSE * (pa / FT) / T0) ** EXP;
  const T = oatC == null ? T0 - LAPSE * pa / FT : oatC + 273.15;
  const sigma = (p / P0) / (T / T0);
  return iasKt / Math.sqrt(sigma);
}

export const decl = (g, lon, lat, year) => {
  if (!g) return NaN;
  const fx = (lon - g.lon0) / g.step, fy = (lat - g.lat0) / g.step;
  const i = Math.max(0, Math.min(g.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(g.ny - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - i)), ty = Math.max(0, Math.min(1, fy - j));
  const bil = arr => { const v = (a, b) => arr[(j + b) * g.nx + i + a]; return (v(0, 0) * (1 - tx) + v(1, 0) * tx) * (1 - ty) + (v(0, 1) * (1 - tx) + v(1, 1) * tx) * ty; };
  return bil(g.d) + bil(g.rate) * (year - g.epoch);
};
export const decimalYear = d => d.getUTCFullYear() + (d - Date.UTC(d.getUTCFullYear(), 0, 1)) / (365.25 * 86400000);

const pad = n => String(n).padStart(2, '0');
export const fmtHM = min => { if (!Number.isFinite(min)) return '—'; const t = Math.round(min); return `${Math.floor(t / 60)}:${pad(t % 60)}`; };
export function clock(hhmm, addMin) {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm || '') || !Number.isFinite(addMin)) return '';
  const [h, m] = hhmm.split(':').map(Number), t = Math.round(h * 60 + m + addMin);
  return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`;
}
const round5 = x => Math.round(x / 5) * 5;

// ---------------------------------------------------------------- log di navigazione
// env: { windAt(lon, lat, altFt) → {dir, kt, src} | null, oatAt(lon, lat, altFt) → °C | null, decl(lon, lat) → °,
//        msaFt(a, b) → ft | NaN, alternateNear(p) → { name, km } | null, freqsNear(p) → [stringhe] }
export function computeNavlog(plan, env) {
  const ac = plan.aircraft, legs = [], r = plan.route;
  let cum = 0, cumKm = 0, fuel = 0;
  for (let k = 0; k < r.length - 1; k++) {
    const a = r[k], b = r[k + 1], o = (plan.legs && plan.legs[k]) || {};
    const levelFt = Number(o.levelFt) || plan.cruiseFt;
    const ias = Number(o.iasKt) || ac.iasKt;
    const mid = { lon: (a.lon + b.lon) / 2, lat: (a.lat + b.lat) / 2 };
    const tc = bearingDeg(a, b), var_ = env.decl ? env.decl(mid.lon, mid.lat) : NaN;
    const distKm = distM(a, b) / 1000;
    const wind = o.windDir != null && o.windKt != null && o.windDir !== '' && o.windKt !== '' ? { dir: Number(o.windDir), kt: Number(o.windKt), src: 'manuale' }
      : (env.windAt ? env.windAt(mid.lon, mid.lat, levelFt) : null);
    const oat = env.oatAt ? env.oatAt(mid.lon, mid.lat, levelFt) : null;
    const tas = ias ? tasFromIas(ias, levelFt, plan.qnh, oat) : NaN;
    const w = Number.isFinite(tas) ? windTriangle(tc, tas, wind) : { wca: NaN, th: NaN, gs: NaN };
    const timeMin = Number.isFinite(w.gs) && w.gs > 0 ? distKm / KMH_PER_KT / w.gs * 60 : NaN;
    cum += timeMin; cumKm += distKm;
    const fuelL = ac.fuelFlowLh ? timeMin / 60 * ac.fuelFlowLh : NaN;
    fuel += fuelL;
    const mag = x => (Number.isFinite(var_) ? (x - var_ + 360) % 360 : NaN);
    legs.push({
      from: a.name || `P${k + 1}`, to: b.name || `P${k + 2}`, levelFt, iasKt: ias, tasKt: tas, oatC: oat,
      tcT: tc, tcM: mag(tc), var: var_, distKm, distNm: distKm * 1000 / NM, wind, wca: w.wca, thT: w.th, thM: mag(w.th), gsKt: w.gs,
      timeMin, cumMin: cum, cumKm, eto: clock(plan.toTime, cum), fuelL, cumFuelL: fuel,
      msaFt: env.msaFt ? env.msaFt(a, b) : NaN, alternate: env.alternateNear ? env.alternateNear(b) : null, freqs: env.freqsNear ? env.freqsNear(b) : [],
    });
  }
  return { legs, totalKm: cumKm, totalMin: cum, tripFuelL: fuel };
}

// Tratto verso l'alternato: dall'ultimo punto all'alternato, alla quota e velocità di crociera, con il vento dell'ambiente
export function alternateLeg(plan, env) {
  if (!plan.alternate || plan.route.length < 1) return null;
  const sub = { ...plan, route: [plan.route.at(-1), plan.alternate], legs: [{}] };
  const r = computeNavlog(sub, env);
  return r.legs[0];
}

// ---------------------------------------------------------------- carburante
// Riserva finale predefinita: 30 minuti (VFR diurno, Part-NCO); il pilota la può cambiare.
// La riserva si può dare in minuti (30 nel VFR diurno Part-NCO) oppure in litri, come fa l'Aeroclub dei Marsi (10 litri).
export function fuelPlan({ tripFuelL, tripMin, altFuelL = 0, altMin = 0, reserveMin = 30, reserveL = null, extraL = 0, fuelFlowLh, density = 0.72 }) {
  const flow = fuelFlowLh;
  const row = (L, min) => ({ L, kg: L * density, min: Number.isFinite(min) ? min : (flow ? L / flow * 60 : NaN) });
  const rL = Number(reserveL);
  const leg = row(tripFuelL, tripMin), alt = row(altFuelL, altMin);
  const rve = reserveL != null && reserveL !== '' && Number.isFinite(rL) ? row(rL, flow ? rL / flow * 60 : NaN) : row(flow ? reserveMin / 60 * flow : NaN, reserveMin);
  const minL = leg.L + alt.L + rve.L, min = row(minL, leg.min + alt.min + rve.min);
  const extra = row(Number(extraL) || 0, flow ? (Number(extraL) || 0) / flow * 60 : NaN);
  const tof = row(minL + extra.L, min.min + extra.min);
  return { leg, alt, rve, min, extra, tof, enduranceMin: flow ? tof.L / flow * 60 : NaN };
}

// ---------------------------------------------------------------- peso e centraggio
export function weightBalance(ac, { pilotKg = 0, copilotKg = 0, luggageKg = 0, fuelL = 0 }, burnL = 0) {
  if (![ac.mtowKg, ac.cgMinM, ac.cgMaxM, ...Object.values(ac.arms)].every(Number.isFinite)) {
    return { items: [], to: { kg: NaN, moment: NaN, cg: NaN }, ldg: { kg: NaN, moment: NaN, cg: NaN },
      issues: [{ lvl: 'warn', title: 'Dati di peso e centraggio mancanti', text: 'Inserisci peso massimo, limiti del baricentro e bracci dal manuale dell’aereo.' }] };
  }
  const items = [
    ['empty', 'Peso a vuoto', ac.emptyKg],
    ['pilot', 'Pilota', Number(pilotKg) || 0],
    ['copilot', 'Copilota', Number(copilotKg) || 0],
    ['fuel', 'Carburante', (Number(fuelL) || 0) * ac.fuelDensity],
    ['luggage', 'Bagagli', Number(luggageKg) || 0],
  ].map(([k, label, kg]) => ({ k, label, kg, arm: ac.arms[k], moment: kg * ac.arms[k] }));
  const sum = list => { const kg = list.reduce((s, x) => s + x.kg, 0), m = list.reduce((s, x) => s + x.moment, 0); return { kg, moment: m, cg: m / kg }; };
  const to = sum(items);
  const ldgItems = items.map(x => x.k === 'fuel' ? { ...x, kg: Math.max(0, x.kg - burnL * ac.fuelDensity), moment: Math.max(0, x.kg - burnL * ac.fuelDensity) * x.arm } : x);
  const ldg = sum(ldgItems);
  const issues = [];
  if (!(ac.emptyKg > 0)) issues.push({ lvl: 'warn', title: 'Peso a vuoto mancante', text: 'Inserisci il peso a vuoto e il suo braccio dalla scheda di pesata dell’aereo: senza, peso e centraggio non sono calcolabili.' });
  else {
    if (to.kg > ac.mtowKg) issues.push({ lvl: 'crit', title: 'Peso al decollo oltre il massimo', text: `${Math.round(to.kg)} kg contro un massimo di ${ac.mtowKg} kg: togli ${Math.ceil(to.kg - ac.mtowKg)} kg.` });
    for (const [name, s] of [['al decollo', to], ['all’atterraggio', ldg]]) {
      if (s.cg < ac.cgMinM || s.cg > ac.cgMaxM) issues.push({ lvl: 'crit', title: `Baricentro fuori limiti ${name}`, text: `${s.cg.toFixed(3).replace('.', ',')} m, limiti ${String(ac.cgMinM).replace('.', ',')} – ${String(ac.cgMaxM).replace('.', ',')} m.` });
    }
    if (ac.maxLuggageKg && luggageKg > ac.maxLuggageKg) issues.push({ lvl: 'crit', title: 'Bagagli oltre il limite', text: `${luggageKg} kg contro ${ac.maxLuggageKg} kg.` });
    if (ac.tankL && fuelL > ac.tankL) issues.push({ lvl: 'crit', title: 'Carburante oltre la capacità', text: `${fuelL} l contro ${ac.tankL} l.` });
  }
  return { items, to, ldg, issues };
}

// ---------------------------------------------------------------- controlli del piano
export function planChecks({ fuel, wb, fuelOnBoardL, nav, ac = null }) {
  const W = [...wb.issues];
  if (ac?.tankL && Number.isFinite(fuel.min?.L) && fuel.min.L > ac.tankL) W.push({ lvl: 'crit', title: 'Il volo richiede più carburante di quanto ne stia nei serbatoi', text: `Minimo necessario ${Math.ceil(fuel.min.L)} l, capacità ${ac.tankL} l: serve uno scalo intermedio.` });
  if (!Number.isFinite(nav.totalMin)) W.push({ lvl: 'warn', title: 'Velocità mancante', text: 'Inserisci la velocità indicata di crociera (IAS) dell’aereo.' });
  if (!Number.isFinite(fuel.tof.L)) W.push({ lvl: 'warn', title: 'Consumo mancante', text: 'Inserisci il consumo orario (litri/ora) dal manuale dell’aereo.' });
  else if (Number.isFinite(fuelOnBoardL) && fuelOnBoardL < fuel.min.L) W.push({ lvl: 'crit', title: 'Carburante insufficiente', text: `A bordo ${Math.round(fuelOnBoardL)} l, minimo necessario ${Math.ceil(fuel.min.L)} l (tratta, alternato e riserva).` });
  if (nav.legs.some(l => Number.isNaN(l.gsKt) && Number.isFinite(l.tasKt))) W.push({ lvl: 'crit', title: 'Vento più forte della velocità', text: 'In un tratto il vento al traverso supera la velocità vera: rotta non percorribile.' });
  for (const l of nav.legs) if (Number.isFinite(l.msaFt) && l.levelFt < l.msaFt) W.push({ lvl: 'info', title: `Quota sotto la MSA del log: ${l.from} → ${l.to}`, text: `${l.levelFt} ft pianificati, MSA del log ${l.msaFt} ft (rilievo più alto entro 5 NM più 1000 ft). È un criterio di pianificazione, non una norma VFR: le altezze minime VFR sono in SERA.5005 f).` });
  return W;
}

// ---------------------------------------------------------------- salvataggio e scambio
export function planToJson(plan) {
  return JSON.stringify({ format: 'airplanning-piano', version: 1, app: `AerIA VFR ${VERSION}`, author: AUTHOR, savedAt: new Date().toISOString(), plan }, null, 2);
}
export function planFromJson(text) {
  const o = JSON.parse(text);
  if (o.format !== 'airplanning-piano' || !o.plan || !Array.isArray(o.plan.route)) throw new Error('Non è un file di piano di volo AerIA VFR');
  for (const p of o.plan.route) if (!Number.isFinite(p.lon) || !Number.isFinite(p.lat)) throw new Error('Coordinate non valide nel file');
  return o.plan;
}
const xmlEsc = s => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
export function routeToGpx(route, name = 'AerIA VFR') {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="AerIA VFR ${VERSION}" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><author><name>${xmlEsc(AUTHOR)}</name></author></metadata>\n<rte><name>${xmlEsc(name)}</name>\n`
    + route.map((p, i) => `<rtept lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><name>${xmlEsc(p.name || `P${i + 1}`)}</name></rtept>`).join('\n') + '\n</rte>\n</gpx>\n';
}
// Lettura GPX senza DOM (funziona anche nei test): rotta, altrimenti waypoint, altrimenti traccia
export function routeFromGpx(text) {
  const pick = tag => [...text.matchAll(new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}>)`, 'g'))].map(m => {
    const lat = Number(/lat="([^"]+)"/.exec(m[1])?.[1]), lon = Number(/lon="([^"]+)"/.exec(m[1])?.[1]);
    const name = (/<name>([\s\S]*?)<\/name>/.exec(m[2] || '')?.[1] || '').replace(/&lt;|&gt;|&amp;|&quot;|&apos;/g, e => ({ '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" }[e])).trim();
    return { lat, lon, name };
  }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  const r = pick('rtept');
  const pts = r.length ? r : pick('wpt').length ? pick('wpt') : pick('trkpt');
  if (pts.length < 2) throw new Error('Il file GPX non contiene almeno due punti');
  return pts.map((p, i) => ({ ...p, name: p.name || `P${i + 1}` }));
}

// MSA del log (criterio di pianificazione, non norma VFR): rilievo più alto entro 5 NM dalla rotta + 1000 ft, ai 100 ft.
// Campionamento fitto (500 m) attorno a punti ogni 1,5 km della rotta: con un passo largo si perderebbero le cime.
export function msaForLeg(terrain, a, b, corridorNm = 5, stepKm = 0.5) {
  const n = Math.max(2, Math.ceil(distM(a, b) / 1500)), rKm = corridorNm * NM / 1000, k = Math.ceil(rKm / stepKm);
  let max = -Infinity;
  for (let s = 0; s <= n; s++) {
    const p = { lon: a.lon + (b.lon - a.lon) * s / n, lat: a.lat + (b.lat - a.lat) * s / n };
    const L = degLengths(p.lat), dLat = stepKm * 1000 / L.lat, dLon = stepKm * 1000 / L.lon;
    for (let i = -k; i <= k; i++) for (let j = -k; j <= k; j++) {
      if ((i * i + j * j) * stepKm * stepKm > rKm * rKm) continue;
      const v = terrain.elevFt(p.lon + i * dLon, p.lat + j * dLat);
      if (Number.isFinite(v) && v > max) max = v;
    }
  }
  return Number.isFinite(max) ? Math.ceil((max + 1000) / 100) * 100 : NaN;
}
export { round5 };

// ---------------------------------------------------------------- vento sulla pista
// windDir: direzione DA cui soffia il vento, gradi veri (METAR e modelli); rwys: [{ des, trueHdg }] (openAIP, gradi veri).
// Restituisce per ogni pista la componente in prua (positiva = vento contrario, negativa = in coda) e al traverso
// (valore assoluto, lato), e la pista migliore (più vento contrario).
export function runwayWind(windDir, windKt, rwys) {
  if (!Number.isFinite(windDir) || !Number.isFinite(windKt) || !rwys?.length) return null;
  const list = rwys.filter(r => Number.isFinite(r.trueHdg)).map(r => {
    const a = (windDir - r.trueHdg) * Math.PI / 180;
    return { des: r.des, head: windKt * Math.cos(a), cross: Math.abs(windKt * Math.sin(a)), side: Math.sin(a) >= 0 ? 'da destra' : 'da sinistra' };
  });
  if (!list.length) return null;
  return { list, best: list.reduce((b, r) => (r.head > b.head ? r : b)) };
}
export function crosswindChecks(where, rw, limitKt) {
  if (!rw) return [];
  const b = rw.best, out = [];
  if (Number.isFinite(limitKt) && b.cross > limitKt) out.push({ lvl: 'crit', title: `Vento al traverso oltre il limite: ${where}`, text: `Sulla pista migliore (${b.des}) ${Math.round(b.cross)} kt al traverso ${b.side}, limite dimostrato dell’aereo ${limitKt} kt.` });
  else if (Number.isFinite(limitKt) && b.cross > limitKt * 0.8) out.push({ lvl: 'warn', title: `Vento al traverso vicino al limite: ${where}`, text: `Pista ${b.des}: ${Math.round(b.cross)} kt al traverso ${b.side} (limite dimostrato ${limitKt} kt).` });
  if (b.head < -5) out.push({ lvl: 'warn', title: `Vento in coda su tutte le piste: ${where}`, text: `Sulla pista migliore (${b.des}) ${Math.round(-b.head)} kt in coda: corsa di decollo e di atterraggio più lunghe.` });
  return out;
}
