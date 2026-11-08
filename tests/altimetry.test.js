// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromCompact, LEVELS } from '../web-prototype/src/forecast.js';
import { pressureAtIndicated, indicatedAtPressure, qnhFromZ1000, heightOfPressure, trueAltitudeFt, altimetryCheck } from '../web-prototype/src/altimetry.js';
import { parseMetars } from '../web-prototype/src/weather.js';

const fc = fromCompact(JSON.parse(readFileSync(new URL('./fixtures/icon2i-2026-11-06T09.json', import.meta.url))));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} invece di ${b}`);

test('atmosfera standard: valori di tabella ISA', () => {
  near(pressureAtIndicated(0, 1013.25), 1013.25, 1e-9);
  near(pressureAtIndicated(1500, 1013.25), 845.6, 0.1);   // tabella ISA: 1500 m → 845,6 hPa
  near(pressureAtIndicated(3000, 1013.25), 701.1, 0.1);   // 3000 m → 701,1 hPa
  near(indicatedAtPressure(pressureAtIndicated(2345, 1020), 1020), 2345, 1e-6);
  near(qnhFromZ1000(110.9), 1013.25, 0.05);               // in ISA il livello 1000 hPa è a circa 111 m
});

test('in un’atmosfera standard la quota vera coincide con quella indicata', () => {
  const isa = { times: [0], pts: [{ lon: 13, lat: 42, elevM: 0 }], v: {} };
  for (const l of LEVELS) isa.v[`geopotential_height_${l}hPa`] = [[indicatedAtPressure(l, 1013.25)]];
  // si interpola lo scarto dall'ISA, quindi qui il risultato deve essere esatto
  for (const ft of [500, 1000, 3500, 6000, 9000, 15000]) near(trueAltitudeFt(isa, 0, 0, ft, 1013.25), ft, 0.01, `${ft} ft`);
});

test('campione ICON-2I: QNH del modello coerente con i METAR della stessa ora', () => {
  const q = fc.pts.map((_, i) => qnhFromZ1000(fc.v.geopotential_height_1000hPa[0][i]));
  const mean = q.reduce((a, b) => a + b) / q.length;
  near(mean, 1021.26, 0.01);
  // METAR del 6/11/2026: LIRH e LIQN Q1021, LIRA Q1019
  const fx = JSON.parse(readFileSync(new URL('./fixtures/awc-2026-11-06.json', import.meta.url)));
  const m = parseMetars(fx.metar).filter(s => ['LIRH', 'LIQN'].includes(s.id));
  for (const s of m) near(mean, s.qnh, 1.5, s.id);
});

test('quota vera nel punto 41,8 N 13,4 E (valori calcolati a parte in Python)', () => {
  near(heightOfPressure(fc, 8, 0, 1000), 171, 1e-9);
  near(trueAltitudeFt(fc, 8, 0, 6000, qnhFromZ1000(171)), 6056.56, 0.05, 'aria più calda: +57 ft');
  near(trueAltitudeFt(fc, 8, 0, 6000, 1013), 6255.69, 0.05, 'QNH 1013 invece di 1020,5: +256 ft');
});

test('controlli: QNH sbagliato e aria fredda', () => {
  const route = [{ lon: 13.3, lat: 41.75 }, { lon: 13.5, lat: 41.85 }];
  const ok = altimetryCheck({ fc, ti: 0, route, cruiseFt: 6000, qnh: 1021 });
  assert.equal(ok.warnings.length, 0, JSON.stringify(ok.warnings));
  const bad = altimetryCheck({ fc, ti: 0, route, cruiseFt: 6000, qnh: 1013 });
  assert.ok(bad.warnings.some(w => w.title === 'QNH da controllare'));
  // QNH impostato troppo alto: l'altimetro legge più del vero, quindi si è più bassi
  const hi = altimetryCheck({ fc, ti: 0, route, cruiseFt: 6000, qnh: 1030 });
  assert.ok(hi.warnings.some(w => /più basso/.test(w.title)) && hi.totalErrFt < -150, String(hi.totalErrFt));
  // aria fredda costruita: quote dei livelli ridotte del 7 % (circa 20 °C sotto la standard)
  const cold = { times: [0], pts: [{ lon: 13.4, lat: 41.8, elevM: 0 }], v: {} };
  for (const l of LEVELS) cold.v[`geopotential_height_${l}hPa`] = [[indicatedAtPressure(l, 1013.25) * 0.93]];
  const c = altimetryCheck({ fc: cold, ti: 0, route, cruiseFt: 6000, qnh: 1013 });
  assert.ok(c.totalErrFt < -350, String(c.totalErrFt));
  assert.ok(c.warnings.some(w => /fredda/.test(w.text)));
});
