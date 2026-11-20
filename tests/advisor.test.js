// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Consigliere di quota (advisor.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { altitudeOptions, semicircularOk } from '../web-prototype/src/advisor.js';

test('livelli semicircolari VFR (SERA, appendice 3)', () => {
  assert.equal(semicircularOk(5500, 90), true);     // verso est: dispari + 500
  assert.equal(semicircularOk(4500, 90), false);
  assert.equal(semicircularOk(4500, 270), true);    // verso ovest: pari + 500
  assert.equal(semicircularOk(5000, 270), false);
  assert.equal(semicircularOk(5500, NaN), null);
});

test('consigliere: terreno, limite VDS, spazi aerei e quota migliore', () => {
  const ctr = { name: 'CTR', id: 'ctr' }, park = { name: 'Parco', id: 'p' }, r = { name: 'Zona R', id: 'r' };
  const rule = (a, pilot) => ({ ctr: { need: 'autorizzazione' }, p: { need: 'evitare' }, r: { need: pilot === 'ag' ? 'verifica' : 'vietato' } }[a.id]);
  const samples = [
    { phase: 'cruise', terr: 3000, vds: 6000, air: [{ a: park, lo: 3000, hi: 4300 }, { a: ctr, lo: 6000, hi: 9000 }] },
    { phase: 'cruise', terr: 2500, vds: 5500, air: [{ a: r, lo: 0, hi: 3900 }] },
  ];
  const nav = alt => ({ min: 30 - alt / 1000, fuelL: 10, headKt: 5 });
  const vds = altitudeOptions({ samples, minFt: 3500, pilot: 'basico', rule, magTrackDeg: 90, navAt: nav });
  const row = a => vds.rows.find(x => x.alt === a);
  assert.equal(row(3000).terrOk, false);                 // sotto il minimo dei tratti
  assert.equal(row(3500).blocked, true);                 // dentro la zona R: vietata al VDS
  assert.equal(row(4500).air.evitare, undefined);        // sopra il parco (4300) e sotto la CTR
  assert.equal(row(5500).vdsOk, true); assert.equal(row(6000).vdsOk, false);   // limite VDS = 5500 (minimo dei campioni)
  assert.equal(vds.rows.find(x => x.best).alt, 4500);    // nessuno spazio; salire a 5500 costa più di quanto fa guadagnare
  const ppl = altitudeOptions({ samples, minFt: 3500, pilot: 'ag', rule, magTrackDeg: 90, navAt: nav });
  const p = a => ppl.rows.find(x => x.alt === a);
  assert.equal(p(6500).air.autorizzazione, 1);           // dentro la CTR: serve l'autorizzazione
  assert.equal(p(3500).air.verifica, 1);
  // sopra la CTR (9000 ft) si arriverebbe prima, ma la salita in più costa più del tempo guadagnato
  assert.equal(ppl.rows.find(x => x.best).alt, 4500);
  assert.equal(ppl.rows.at(-1).alt, 9500);               // non oltre 9500 ft se non richiesto
});
