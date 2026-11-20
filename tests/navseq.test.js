// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Tratto attivo in volo (navseq.js): i casi del collaudo 0.21.0 (rotta a U, andata e ritorno) e le virate anticipate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newNavSeq, navStep, acquireLeg, legGeom, setLeg } from '../web-prototype/src/navseq.js';
import { destPoint, bearingDeg, NM } from '../web-prototype/src/geo.js';

const P = (lon, lat, name) => ({ lon, lat, name });
// volo simulato: posizioni ogni 10 s lungo una polilinea a 95 kt; restituisce il punto attivo a ogni passo
function fly(route, path, kt = 95) {
  const st = newNavSeq(), out = [];
  for (let k = 0; k < path.length - 1; k++) {
    const a = path[k], b = path[k + 1], trk = bearingDeg(a, b), dNm = legGeom(a, b, b).len / NM;
    const steps = Math.max(1, Math.ceil(dNm / (kt * 10 / 3600)));
    for (let s = 0; s < steps; s++) {
      const q = destPoint([a.lon, a.lat], trk, dNm * s / steps), pos = { lon: q[0], lat: q[1] };
      const r = navStep(st, route, pos, trk);
      out.push(r.to.name);
    }
  }
  return out;
}
const uniq = a => a.filter((x, i) => i === 0 || a[i - 1] !== x);

test('rotta a U: sul tratto P3→P4 il prossimo è P4, mai P1', () => {
  const R = [P(13.40, 42.00, 'P1'), P(13.40, 42.20, 'P2'), P(13.60, 42.20, 'P3'), P(13.60, 42.00, 'P4')];
  const seq = uniq(fly(R, R));
  assert.deepEqual(seq, ['P2', 'P3', 'P4']);
  // aggancio a metà del tratto P3→P4, verso sud (caso riprodotto nel collaudo)
  const st = newNavSeq(), r = navStep(st, R, { lon: 13.60, lat: 42.15 }, 180);
  assert.equal(r.to.name, 'P4');
  assert.ok(Math.abs(r.xtM) < 50);
});

test('andata e ritorno Celano → lago → Celano: al ritorno il prossimo è l\'arrivo, con fuori rotta', () => {
  const R = [P(13.5578, 42.0517, 'Celano'), P(13.55, 42.25, 'Lago'), P(13.5578, 42.0517, 'Arrivo')];
  // virata anticipata di 1 NM prima del punto di ritorno
  const turn = destPoint([13.55, 42.25], 180, 1);
  const path = [R[0], P(turn[0] + 0.004, turn[1]), P(turn[0] - 0.004, turn[1] - 0.002), R[2]];
  const seq = uniq(fly(R, path));
  assert.deepEqual(seq, ['Lago', 'Arrivo']);
  const st = newNavSeq(), r = navStep(st, R, { lon: 13.552, lat: 42.15 }, 182);
  assert.equal(r.to.name, 'Arrivo');
  assert.ok(Number.isFinite(r.xtM));
});

test('virata anticipata di 90°: si passa al tratto successivo prima del punto', () => {
  const R = [P(13.30, 42.00, 'A'), P(13.30, 42.20, 'B'), P(13.55, 42.20, 'C')];
  // si taglia l'angolo 1,5 NM prima di B
  const cut = destPoint([13.30, 42.20], 180, 1.5), cut2 = destPoint([13.30, 42.20], 90, 1.5);
  const seq = fly(R, [R[0], P(cut[0], cut[1]), P(cut2[0], cut2[1]), R[2]]);
  assert.deepEqual(uniq(seq), ['B', 'C']);
});

test('fuori rotta ampio senza avvicinarsi al punto: nessun passaggio prematuro', () => {
  const R = [P(13.30, 42.00, 'A'), P(13.30, 42.30, 'B'), P(13.60, 42.30, 'C')];
  const st = newNavSeq();
  // 4 NM a est della rotta, a metà tratto, verso nord
  const q = destPoint([13.30, 42.15], 90, 4);
  const r = navStep(st, R, { lon: q[0], lat: q[1] }, 0);
  assert.equal(r.to.name, 'B');
  assert.ok(r.xtM > 7000);   // a destra
});

test('aggancio e modifica della rotta', () => {
  const R = [P(13.0, 42.0, 'A'), P(13.0, 42.2, 'B'), P(13.3, 42.2, 'C'), P(13.3, 42.4, 'D')];
  assert.equal(acquireLeg(R, { lon: 13.15, lat: 42.205 }, 90), 1);
  assert.equal(acquireLeg(R, { lon: 13.15, lat: 42.205 }, 270), 1);   // unico tratto vicino: resta quello
  const st = newNavSeq();
  assert.equal(navStep(st, R, { lon: 13.0, lat: 42.1 }, 0).to.name, 'B');
  setLeg(st, R, 2);
  assert.equal(navStep(st, R, { lon: 13.0, lat: 42.1 }, 0).to.name, 'D');
  const R2 = [...R.slice(0, 2), P(13.1, 42.3, 'X'), ...R.slice(2)];   // punto aggiunto: si riaggancia
  assert.equal(navStep(st, R2, { lon: 13.0, lat: 42.1 }, 0).to.name, 'B');
});

test('ultimo tratto: resta attivo oltre l\'arrivo', () => {
  const R = [P(13.0, 42.0, 'A'), P(13.0, 42.1, 'B')];
  const st = newNavSeq();
  assert.equal(navStep(st, R, { lon: 13.0, lat: 42.15 }, 0).to.name, 'B');
});
