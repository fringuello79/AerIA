// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Profilo verticale pianificato con rampe di salita e discesa (al posto dei gradini sui punti).
//
// Regole (le stesse per profilo, rotta 3D e controlli):
// - Partenza da un campo: si parte dalla quota del campo e si sale col rateo dell'aereo verso la quota del primo tratto.
// - La quota di un punto (casella del tratto che parte da lì) si raggiunge SUL punto, in salita e in discesa: la rampa
//   finisce sul punto (inizio salita o discesa prima del punto), così il nodo del profilo sta alla quota della sua
//   casella e l'intero tratto che parte dal punto è alla sua quota. Se il rateo non basta (tratto corto), si sale al
//   massimo rateo e si continua dopo il punto: il programma lo segnala. Il rateo cala con la quota (dati del manuale).
//   (Fino alla 0.18.1 la salita cominciava sul punto: il nodo stava alla quota del tratto precedente.)
// - Arrivo su un campo: discesa per essere a quota di circuito (campo + circuitFt) sul campo.
// Vento non considerato nelle rampe: la distanza orizzontale usa la velocità di salita o di discesa (IAS ≈ TAS).
import { NM } from './geo.js';

const KT_M_PER_MIN = NM / 60;   // metri al minuto per nodo

// Rateo di salita (ft/min) alla quota h: lineare tra il livello del mare e la quota hiFt, mai sotto minFpm
export function climbRate(climb, hFt) {
  if (!climb) return NaN;
  if (!Number.isFinite(climb.rocHiFpm) || !Number.isFinite(climb.hiFt)) return climb.rocSlFpm;
  const t = Math.max(0, hFt) / climb.hiFt;
  return Math.max(climb.minFpm ?? 100, climb.rocSlFpm + (climb.rocHiFpm - climb.rocSlFpm) * t);
}

/**
 * legs: [{ distM, altFt }] in ordine; depElevFt / arrElevFt: quota dei campi (null se il primo/ultimo punto non è un campo)
 * climb: { rocSlFpm, rocHiFpm, hiFt, kt }  discent: { fpm, kt }  circuitFt: quota del circuito sopra il campo
 * Restituisce { pts: [{d, alt}], altAt(d), events: [{ kind: 'TOC'|'TOD', d, alt }], total }
 */
// depOverheadFt / arrOverheadFt (facoltativi): quota da prendere SUL campo di partenza prima di partire (salita in
// spirale) o da cui scendere sul campo d'arrivo, quando le montagne vicine non lasciano salire o scendere in linea.
export function verticalProfile({ legs, depElevFt = null, arrElevFt = null, climb, descent, circuitFt = 1000, stepM = 100, depOverheadFt = null, arrOverheadFt = null, land = false }) {
  const starts = []; let total = 0;
  for (const l of legs) { starts.push(total); total += l.distM; }
  const targetAt = d => { let i = 0; while (i < legs.length - 1 && d >= starts[i + 1]) i++; return legs[i].altFt; };
  const descM = ft => ft / descent.fpm * descent.kt * KT_M_PER_MIN;   // metri orizzontali per scendere di ft piedi
  // tetti per le discese: essere alla quota del tratto j sul punto j, alla quota di circuito sull'arrivo
  const caps = [];
  for (let j = 1; j < legs.length; j++) caps.push({ d: starts[j], alt: legs[j].altFt });
  const arrCirc = Number.isFinite(arrElevFt) ? arrElevFt + circuitFt : null;
  if (Number.isFinite(arrElevFt)) caps.push({ d: total, alt: Number.isFinite(arrOverheadFt) ? Math.max(arrCirc, arrOverheadFt) : arrCirc });
  const capAt = d => {
    let c = Infinity;
    for (const k of caps) if (k.d >= d - 1e-6) c = Math.min(c, k.alt + (k.d - d) / descM(1));
    return c;
  };
  // pavimenti per le salite: essere alla quota del tratto j sul punto j. Pendenza col rateo alla quota d'arrivo (il più
  // basso della salita), così la rampa è sempre fattibile e resta una linea dritta
  const floors = [];
  for (let j = 1; j < legs.length; j++) if (legs[j].altFt > legs[j - 1].altFt) floors.push({ d: starts[j], alt: legs[j].altFt, mPerFt: climb.kt * KT_M_PER_MIN / climbRate(climb, legs[j].altFt) });
  const floorAt = d => { let f = -Infinity; for (const k of floors) if (k.d >= d - 1e-6) f = Math.max(f, k.alt - (k.d - d) / k.mPerFt); return f; };
  const pts = [], events = [];
  let alt = Number.isFinite(depElevFt) ? depElevFt : legs[0].altFt, phase = alt < legs[0].altFt ? 'climb' : 'level';
  let d = 0;
  pts.push({ d: 0, alt });
  // salita sul campo di partenza: segmento verticale sul campo fino alla quota indicata (mai oltre quella del tratto)
  if (Number.isFinite(depElevFt) && Number.isFinite(depOverheadFt) && depOverheadFt > alt + 1) {
    alt = Math.min(depOverheadFt, legs[0].altFt); pts.push({ d: 0, alt }); events.push({ kind: 'SALITA SUL CAMPO', d: 0, alt });
  }
  // passi regolari più i punti di virata, così i cambi di quota cadono esattamente sui punti
  const marks = [...starts.slice(1), total];
  let guard = 0;
  while (d < total - 1e-6) {
    // protezione: un profilo non può richiedere più di un milione di passi (mai bloccare l'app)
    if (++guard > 1e6) throw new Error(`profilo verticale non convergente a ${Math.round(d)} m su ${Math.round(total)} (quota ${Math.round(alt)} ft)`);
    let next = Math.min(d + stepM, marks.find(m => m > d + 1e-6) ?? total);
    const tgt = targetAt(d);
    if (Math.abs(tgt - alt) < 1e-6) alt = tgt;   // arrotondamenti: alla quota del tratto si è arrivati
    // il passo si ferma esattamente dove finisce una salita o una discesa, o dove inizia una rampa anticipata
    if (alt < tgt) next = Math.min(next, d + (tgt - alt) / climbRate(climb, alt) * climb.kt * KT_M_PER_MIN + 1e-9);
    else if (alt > tgt) next = Math.min(next, d + (alt - tgt) * descM(1) + 1e-9);
    if (alt <= tgt + 0.01) for (const k of caps) { const ds = k.d - (alt - k.alt) * descM(1); if (ds > d + 1e-6 && ds < next) next = ds; }
    for (const k of floors) { const ds = k.d - (k.alt - alt) * k.mPerFt; if (ds > d + 1e-6 && ds < next) next = ds; }
    const dd = next - d;
    let a = alt;
    const goal = Math.max(tgt, floorAt(next));
    if (a < goal) { const roc = climbRate(climb, a); a = Math.min(goal, a + roc * dd / (climb.kt * KT_M_PER_MIN)); }
    else if (a > tgt) a = Math.max(tgt, floorAt(next), a - dd / descM(1));
    const cap = capAt(next);
    if (a > cap) a = Math.max(cap, alt - dd / descM(1));     // discesa anticipata (TOD), mai più ripida del rateo scelto
    const ph = a > alt + 0.01 ? 'climb' : a < alt - 0.01 ? 'descent' : 'level';
    if (phase === 'climb' && ph !== 'climb') events.push({ kind: 'TOC', d, alt });
    if (phase !== 'descent' && ph === 'descent') events.push({ kind: 'TOD', d, alt });
    phase = ph; alt = a; d = next;
    pts.push({ d, alt });
  }
  // discesa sul campo d'arrivo: segmento verticale sul campo fino alla quota di circuito
  if (Number.isFinite(arrCirc) && alt > arrCirc + 1) { events.push({ kind: 'DISCESA SUL CAMPO', d: total, alt }); pts.push({ d: total, alt: arrCirc }); }
  // atterraggio (land): dalla quota di circuito a terra sul campo, così l'arrivo è sempre a quota zero sul terreno
  if (land && Number.isFinite(arrElevFt)) { events.push({ kind: 'ATTERRAGGIO', d: total, alt: Math.min(alt, arrCirc) }); pts.push({ d: total, alt: arrElevFt }); }
  // semplificazione: solo i vertici dove cambia la pendenza (i tratti verticali sul campo restano)
  const simp = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = simp.at(-1), b = pts[i], c = pts[i + 1];
    if (b.d - a.d < 1e-9 || c.d - b.d < 1e-9) { simp.push(b); continue; }
    const s1 = (b.alt - a.alt) / (b.d - a.d), s2 = (c.alt - b.alt) / (c.d - b.d);
    if (Math.abs(s1 - s2) > 1e-6) simp.push(b);
  }
  simp.push(pts.at(-1));
  const altAt = x => {
    if (x <= 0) return simp[0].alt;
    if (x >= total) return simp.at(-1).alt;
    for (let i = 1; i < simp.length; i++) if (x <= simp[i].d && simp[i].d - simp[i - 1].d > 1e-9) { const a = simp[i - 1], b = simp[i]; return a.alt + (b.alt - a.alt) * (x - a.d) / (b.d - a.d); }
    return simp.at(-1).alt;
  };
  return { pts: simp, altAt, events, total, starts };
}
