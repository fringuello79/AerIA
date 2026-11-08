// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Rampe di salita e discesa: valori attesi calcolati a mano (tempo = dislivello / rateo, distanza = tempo × velocità)
import test from 'node:test';
import assert from 'node:assert/strict';
import { verticalProfile, climbRate } from '../web-prototype/src/vprofile.js';

const NM = 1852;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} invece di ${b} (±${tol})`);
const climb = { rocSlFpm: 500, kt: 60 }, descent = { fpm: 500, kt: 100 };

test('salita dal campo: 2000 → 6000 ft a 500 ft/min e 60 kt = 8 minuti e 8 NM', () => {
  const p = verticalProfile({ legs: [{ distM: 40 * NM, altFt: 6000 }], depElevFt: 2000, climb, descent });
  near(p.altAt(4 * NM), 4000, 1, 'a metà salita');
  near(p.altAt(8 * NM), 6000, 1, 'fine salita');
  near(p.events.find(e => e.kind === 'TOC').d, 8 * NM, 101, 'TOC');
  assert.equal(p.altAt(30 * NM), 6000);
});

test('discesa verso un tratto più basso: alla nuova quota sul punto, inizio 6,67 NM prima', () => {
  const p = verticalProfile({ legs: [{ distM: 30 * NM, altFt: 6000 }, { distM: 20 * NM, altFt: 4000 }], climb, descent });
  const tod = 30 * NM - 2000 / 500 * 100 / 60 * NM;   // 4 minuti a 100 kt
  near(p.altAt(tod - 50), 6000, 1, 'prima del TOD');
  near(p.altAt((tod + 30 * NM) / 2), 5000, 2, 'a metà discesa');
  near(p.altAt(30 * NM), 4000, 1, 'sul punto');
  near(p.events.find(e => e.kind === 'TOD').d, tod, 101, 'TOD');
});

test('salita a un tratto più alto: la quota si raggiunge SUL punto (rampa prima del punto)', () => {
  // 3000 → 5000 ft a 500 ft/min e 60 kt = 4 minuti = 4 NM: la salita va da 6 a 10 NM
  const p = verticalProfile({ legs: [{ distM: 10 * NM, altFt: 3000 }, { distM: 2 * NM, altFt: 5000 }, { distM: 20 * NM, altFt: 5000 }], climb, descent });
  near(p.altAt(5.9 * NM), 3000, 1, 'prima della salita');
  near(p.altAt(8 * NM), 4000, 2, 'a metà salita');
  near(p.altAt(10 * NM), 5000, 2, 'sul punto: quota del tratto che parte da lì');
  near(p.events.find(e => e.kind === 'TOC').d, 10 * NM, 101, 'fine salita sul punto');
});

test('salita impossibile nel tratto corto: massimo rateo, poi si continua dopo il punto', () => {
  // dal campo a 2000 ft, 2 NM a 3000 e poi 6000: servono 8 NM di salita, ce ne sono 2
  const p = verticalProfile({ legs: [{ distM: 2 * NM, altFt: 3000 }, { distM: 20 * NM, altFt: 6000 }], depElevFt: 2000, climb, descent });
  near(p.altAt(2 * NM), 3000, 2, 'sul punto (massimo rateo dal decollo)');
  near(p.altAt(8 * NM), 6000, 2, 'quota raggiunta 6 NM dopo il punto');
});

test('arrivo su un campo: a quota di circuito (campo + 1000 ft) sul campo', () => {
  const p = verticalProfile({ legs: [{ distM: 30 * NM, altFt: 5500 }], arrElevFt: 2200, climb, descent, circuitFt: 1000 });
  near(p.altAt(30 * NM), 3200, 1, 'sul campo');
  const tod = 30 * NM - 2300 / 500 * 100 / 60 * NM;
  near(p.altAt(tod - 50), 5500, 1, 'prima del TOD');
});

test('rateo che cala con la quota: tempo = ln((a+b·h1)/(a+b·h0))/b come nel calcolo esatto', () => {
  // P96 Golf (manuale): 4,5 m/s a 0 m, 1,6 m/s a 3000 m → 886 e 315 ft/min a 0 e 9843 ft
  const c = { rocSlFpm: 885.8, rocHiFpm: 315.0, hiFt: 9842.5, kt: 65 };
  near(climbRate(c, 0), 885.8, 0.01, 'livello del mare');
  near(climbRate(c, 9842.5), 315, 0.01, 'quota massima');
  const b = (315.0 - 885.8) / 9842.5, a = 885.8;
  const tMin = Math.log((a + b * 6000) / (a + b * 2000)) / b;    // da 2000 a 6000 ft
  const p = verticalProfile({ legs: [{ distM: 40 * NM, altFt: 6000 }], depElevFt: 2000, climb: c, descent, stepM: 20 });
  near(p.events.find(e => e.kind === 'TOC').d, tMin * 65 / 60 * NM, 60, 'TOC con rateo variabile');
});

test('profilo senza cambi di quota: due soli vertici, nessun evento', () => {
  const p = verticalProfile({ legs: [{ distM: 5000, altFt: 4000 }, { distM: 7000, altFt: 4000 }], climb, descent });
  assert.equal(p.pts.length, 2);
  assert.equal(p.events.length, 0);
});

test('salita sul campo di partenza e discesa sul campo d’arrivo: tratti verticali sui campi', () => {
  // campo a 2000 ft: si prende quota sul campo fino a 4000 ft, poi salita in linea fino a 6000 (4 NM)
  const p = verticalProfile({ legs: [{ distM: 40 * NM, altFt: 6000 }], depElevFt: 2000, arrElevFt: 2000, climb, descent, circuitFt: 1000, depOverheadFt: 4000, arrOverheadFt: 5000 });
  assert.equal(p.altAt(0), 2000, 'sul campo, a terra');
  near(p.altAt(1), 4000, 2, 'subito dopo: alla quota presa sul campo');
  near(p.altAt(4 * NM), 6000, 2, 'salita in linea da 4000 a 6000 ft in 4 NM');
  assert.ok(p.events.some(e => e.kind === 'SALITA SUL CAMPO' && e.alt === 4000));
  near(p.altAt(40 * NM - 1), 5000, 2, 'arrivo sopra il campo a 5000 ft');
  assert.equal(p.altAt(40 * NM), 3000, 'poi discesa sul campo fino al circuito');
  assert.ok(p.events.some(e => e.kind === 'DISCESA SUL CAMPO'));
  // mai oltre la quota del tratto
  const q = verticalProfile({ legs: [{ distM: 20 * NM, altFt: 5000 }], depElevFt: 2000, climb, descent, depOverheadFt: 9000 });
  near(q.altAt(1), 5000, 1, 'salita sul campo limitata alla quota del tratto');
});

test('partenza e arrivo a terra (land): Celano 2260 ft → campo a 2100 ft, atterraggio dopo il circuito', () => {
  // valori attesi: si parte da 2260 ft; sull'arrivo si scende a 2100 + 1000 = 3100 ft, poi a terra (2100 ft) sul campo
  const p = verticalProfile({ legs: [{ distM: 30 * NM, altFt: 5500 }], depElevFt: 2260, arrElevFt: 2100, climb, descent, circuitFt: 1000, land: true });
  assert.equal(p.altAt(0), 2260);
  assert.equal(p.altAt(30 * NM), 2100);
  near(p.altAt(30 * NM - 1), 3100, 1, 'quota di circuito appena prima del campo');
  assert.ok(p.events.some(e => e.kind === 'ATTERRAGGIO'));
  // senza land resta la quota di circuito (comportamento di prima)
  const q = verticalProfile({ legs: [{ distM: 30 * NM, altFt: 5500 }], depElevFt: 2260, arrElevFt: 2100, climb, descent, circuitFt: 1000 });
  assert.equal(q.altAt(30 * NM), 3100);
});
