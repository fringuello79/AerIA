// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Tratto attivo della rotta in volo: quale tratto si sta volando e quando passare al successivo.
// Prima il «prossimo punto» era il primo punto davanti con l'indice più basso, senza memoria: sulle rotte a U o di
// andata e ritorno indicava un punto già passato (collaudo 0.21.0, A3). Qui il tratto attivo ha uno stato.
// Codice originale di fringuello79 di Avezzano.
//
// Regole (verificate nei test):
// - Aggancio (all'avvio, dopo una modifica della rotta o su richiesta): il tratto più vicino, penalizzando quelli già
//   finiti e quelli percorsi in verso contrario alla traccia attuale.
// - Passaggio al tratto successivo: entro 0,5 NM dal punto, oppure oltre la bisettrice della virata sul punto, oppure
//   già allineati sul tratto successivo (virata anticipata, anche di ritorno). Le ultime due solo vicino al punto.
// - L'ultimo tratto resta attivo fino alla fine.
import { NM, degLengths } from './geo.js';

export const SEQ = { captureNm: 0.5, nearNm: 3, nearFrac: 0.5, alignDeg: 30, offDeg: 60, wrongWayNm: 5, doneNm: 2 };

const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// Vettori locali in metri attorno a o (piano tangente, preciso per le distanze di un tratto VFR)
function local(o) {
  const L = degLengths(o.lat);
  return p => ({ x: (p.lon - o.lon) * L.lon, y: (p.lat - o.lat) * L.lat });
}
// Geometria del punto p rispetto al tratto a→b: frazione lungo il tratto, distanza dal segmento, scarto laterale con
// segno (+ a destra della rotta), distanza da b, rotta del tratto (gradi veri, piana)
export function legGeom(a, b, p) {
  const f = local(a), B = f(b), P = f(p), len = Math.hypot(B.x, B.y) || 1e-9;
  const ux = B.x / len, uy = B.y / len, along = P.x * ux + P.y * uy, xt = P.x * uy - P.y * ux;
  const t = along / len, cl = Math.max(0, Math.min(1, t));
  const segDist = Math.hypot(P.x - cl * B.x, P.y - cl * B.y);
  return { t, along, len, xt, segDist, toB: Math.hypot(P.x - B.x, P.y - B.y), trk: (Math.atan2(ux, uy) * 180 / Math.PI + 360) % 360 };
}

const routeSig = route => route.map(p => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(';');

export function newNavSeq() { return { leg: null, sig: '' }; }

// Aggancio: indice del tratto più adatto alla posizione e alla traccia
export function acquireLeg(route, pos, trk) {
  let best = null;
  for (let i = 0; i < route.length - 1; i++) {
    const g = legGeom(route[i], route[i + 1], pos);
    let score = g.segDist;
    if (g.t >= 1) score += SEQ.doneNm * NM;                                   // tratto già finito
    if (Number.isFinite(trk) && angDiff(trk, g.trk) > 90) score += SEQ.wrongWayNm * NM; // percorso al contrario
    if (!best || score < best.score - 1) best = { i, score };
  }
  return best ? best.i : null;
}

// Un passo: aggiorna lo stato e restituisce il tratto attivo { leg, from, to, toIndex, xtM, toNextM, geom } oppure null
export function navStep(st, route, pos, trk) {
  if (!route || route.length < 2 || !pos) return null;
  const sig = routeSig(route);
  if (sig !== st.sig || st.leg === null || st.leg > route.length - 2) { st.sig = sig; st.leg = acquireLeg(route, pos, trk); }
  for (let guard = 0; guard < route.length && st.leg < route.length - 2; guard++) {
    const i = st.leg, a = route[i], b = route[i + 1], c = route[i + 2];
    const g = legGeom(a, b, pos), n = legGeom(b, c, pos);
    const near = g.toB <= Math.max(SEQ.nearNm * NM, SEQ.nearFrac * g.len);
    // bisettrice della virata in b: normale u + v (u = direzione del tratto, v = del successivo)
    const fb = local(b), A = fb(a), C = fb(c), P = fb(pos);
    const la = Math.hypot(A.x, A.y) || 1e-9, lc = Math.hypot(C.x, C.y) || 1e-9;
    const nx = -A.x / la + C.x / lc, ny = -A.y / la + C.y / lc;
    const reversal = Math.hypot(nx, ny) < 0.5;                               // virata oltre circa 150°: bisettrice incerta
    const pastBisector = !reversal && (P.x * nx + P.y * ny) > 0;
    const aligned = Number.isFinite(trk) && angDiff(trk, n.trk) <= SEQ.alignDeg && angDiff(trk, g.trk) >= SEQ.offDeg;
    if (g.toB <= SEQ.captureNm * NM || g.t >= 1 || (near && (pastBisector || aligned))) { st.leg = i + 1; continue; }
    break;
  }
  const i = st.leg, g = legGeom(route[i], route[i + 1], pos);
  return { leg: i, from: route[i], to: route[i + 1], toIndex: i + 1, xtM: g.xt, toNextM: g.toB, geom: g };
}

// Scelta manuale del tratto (per esempio dopo una deviazione): resta finché non si passa al successivo
export function setLeg(st, route, leg) {
  st.sig = routeSig(route);
  st.leg = Math.max(0, Math.min(route.length - 2, leg));
}
