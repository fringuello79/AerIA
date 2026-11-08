// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Altimetria: quanto è vera la quota letta sull'altimetro (regolato sul QNH)?
// L'altimetro assume l'atmosfera standard ISA. Con aria più fredda della standard la quota vera è più bassa
// di quella indicata (il caso pericoloso in montagna), con aria più calda è più alta.
// Qui la quota vera si ricava dalle quote geopotenziali dei livelli di pressione del modello ICON-2I.
import { FT, distM } from './geo.js';
import { LEVELS, nearestPoint } from './forecast.js';

const T0 = 288.15, LAPSE = 0.0065, EXP = 5.25588; // ISA: g·M/(R·L)

// Pressione (hPa) alla quale un altimetro regolato su qnh indica hM metri
export const pressureAtIndicated = (hM, qnh) => qnh * (1 - LAPSE * hM / T0) ** EXP;
// Quota indicata (m) da un altimetro regolato su qnh alla pressione p
export const indicatedAtPressure = (p, qnh) => T0 / LAPSE * (1 - (p / qnh) ** (1 / EXP));
// QNH che fa indicare all'altimetro la quota geopotenziale del livello 1000 hPa
export const qnhFromZ1000 = z1000 => 1000 / (1 - LAPSE * z1000 / T0) ** EXP;

// Quota geopotenziale (m) della pressione p in un punto del modello. Si interpola in ln(p) lo scarto tra la quota
// del modello e quella dell'atmosfera standard (non la quota stessa): in un'atmosfera standard il risultato è esatto,
// e lo scarto varia lentamente con la quota. Si usano tutti i livelli, anche quelli sotto il terreno:
// qui serve solo il legame pressione-quota.
const isaZ = p => indicatedAtPressure(p, 1013.25);
export function heightOfPressure(fc, i, ti, p) {
  const lv = LEVELS.map(l => ({ p: l, d: fc.v[`geopotential_height_${l}hPa`][ti][i] - isaZ(l) })).filter(x => Number.isFinite(x.d));
  if (lv.length < 2) return NaN;
  let k = lv.findIndex((x, j) => j < lv.length - 1 && p <= x.p && p >= lv[j + 1].p);
  if (k < 0) k = p > lv[0].p ? 0 : lv.length - 2;             // fuori dall'intervallo: estrapola dai due livelli più vicini
  const a = lv[k], b = lv[k + 1], t = (Math.log(p) - Math.log(a.p)) / (Math.log(b.p) - Math.log(a.p));
  return isaZ(p) + a.d + t * (b.d - a.d);
}

// Quota vera (ft) quando l'altimetro regolato su qnh indica indFt, nel punto di griglia i
export function trueAltitudeFt(fc, i, ti, indFt, qnh) {
  return heightOfPressure(fc, i, ti, pressureAtIndicated(indFt / FT, qnh)) * FT;
}

// Controlli lungo la rotta: QNH impostato rispetto a quello del modello, errore di quota per la temperatura
export function altimetryCheck({ fc, ti, route, cruiseFt, qnh }) {
  if (!fc || route.length < 2) return null;
  const mid = route[Math.floor((route.length - 1) / 2)], nxt = route[Math.floor((route.length - 1) / 2) + 1];
  const c = { lon: (mid.lon + nxt.lon) / 2, lat: (mid.lat + nxt.lat) / 2 };
  const { i } = nearestPoint(fc, c.lon, c.lat);
  const modelQnh = qnhFromZ1000(fc.v.geopotential_height_1000hPa[ti][i]);
  // errore dovuto solo alla temperatura (altimetro regolato sul QNH del modello) ed errore totale con il QNH impostato
  const tempErr = trueAltitudeFt(fc, i, ti, cruiseFt, modelQnh) - cruiseFt;
  const totalErr = trueAltitudeFt(fc, i, ti, cruiseFt, qnh) - cruiseFt;
  const warnings = [];
  if (Math.abs(qnh - modelQnh) >= 2) warnings.push({ lvl: 'warn', kind: 'altimetria', title: 'QNH da controllare',
    text: `Hai impostato ${qnh} hPa; il modello stima ${modelQnh.toFixed(0)} hPa nella zona. Ogni hPa di differenza sposta la quota di circa 27 ft. Chiedi il QNH alla radio.` });
  if (totalErr <= -150) warnings.push({ lvl: 'warn', kind: 'altimetria', title: 'Sei più basso di quanto indica l’altimetro',
    text: `A ${cruiseFt} ft indicati la quota vera prevista è di circa ${Math.round(Math.abs(totalErr) / 10) * 10} ft più bassa${tempErr <= -100 ? ' (aria più fredda della standard)' : ''}: tienine conto per il margine dal terreno.` });
  return { point: i, modelQnh, tempErrFt: tempErr, totalErrFt: totalErr, warnings };
}
