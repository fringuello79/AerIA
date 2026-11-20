// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Valori attesi calcolati a mano: a 100 kt e 500 ft/min si perdono 300 ft per miglio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { descentGuide, descentCues } from '../web-prototype/src/descent.js';

const near = (a, b, e = 0.05) => assert.ok(Math.abs(a - b) <= e, `${a} invece di ${b}`);
// campo a 2200 ft, circuito 1000 ft: obiettivo 3200 ft sul campo; crociera 5500 ft (2300 ft da perdere = 7,667 NM)
const base = { altFt: 5500, targetFt: 3200, gsKt: 100, rateFpm: 500 };

test('discesa: prima dell\'inizio', () => {
  const g = descentGuide({ ...base, distNm: 20 });
  assert.equal(g.state, 'crociera');
  near(g.todNm, 12.3333, 0.001);        // 20 − 7,667
  near(g.todS, 444, 0.1);               // 12,333 NM a 100 kt
  near(g.vsrFpm, -191.667, 0.01);       // −2300 ft in 12 minuti
  assert.equal(g.devFt, 0); assert.equal(g.steep, false);
});

test('discesa: inizio passato, sopra il profilo', () => {
  let g = descentGuide({ ...base, distNm: 6 });
  assert.equal(g.state, 'discesa');
  near(g.todNm, -1.6667, 0.001);
  near(g.devFt, 500, 0.01);             // 5500 − (3200 + 6 × 300)
  near(g.vsrFpm, -638.889, 0.01);       // −2300 ft in 3,6 minuti
  assert.equal(g.steep, false);         // sotto 750 ft/min (1,5 × 500)
  g = descentGuide({ ...base, distNm: 4 });
  near(g.devFt, 1100, 0.01); near(g.vsrFpm, -958.333, 0.01);
  assert.equal(g.steep, true);
});

test('discesa: già in quota o dati insufficienti', () => {
  assert.equal(descentGuide({ ...base, altFt: 3250, distNm: 5 }).state, 'in quota');
  assert.equal(descentGuide({ ...base, gsKt: 15, distNm: 5 }), null);
  assert.equal(descentGuide({ ...base, distNm: 0 }), null);
  assert.equal(descentGuide({ ...base, rateFpm: NaN, distNm: 5 }), null);
});

test('annunci di inizio discesa', () => {
  const at = s => descentCues({ state: 'crociera', todS: s });
  assert.deepEqual(at(444), []);
  assert.deepEqual(at(45), ['tod-1']);
  assert.deepEqual(at(10), ['tod']);
  assert.deepEqual(at(-30), ['tod']);
  assert.deepEqual(at(-61), []);
  assert.deepEqual(descentCues({ state: 'in quota', todS: NaN }), []);
  assert.deepEqual(descentCues(null), []);
});
