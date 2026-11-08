// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newPhase, phaseStep, reminderState, fuelEstimate, fuelWarnings, verticalSpeedFpm, requiredVsFpm, logEntry, fmtDur, fmtMS } from '../web-prototype/src/flight.js';
import { groundGlideRatio, glideReachM, arrivalHeightFt } from '../web-prototype/src/glide.js';
import { maydayText } from '../web-prototype/src/radio.js';

test('decollo e atterraggio riconosciuti dalla velocità al suolo, senza falsi allarmi in rullaggio', () => {
  const s = newPhase(), ev = [];
  const run = (fromSec, toSec, gs) => { for (let t = fromSec; t <= toSec; t++) { const e = phaseStep(s, { t: t * 1000, gsKt: gs, pos: { lon: 13, lat: 42 } }); if (e) ev.push(e); } };
  run(0, 60, 15);          // rullaggio
  run(61, 66, 45);         // corsa di decollo interrotta dopo 6 s
  run(67, 80, 10);
  assert.equal(ev.length, 0);
  run(81, 200, 70);        // decollo vero
  assert.equal(ev[0].kind, 'decollo'); assert.equal(ev[0].t, 81000);
  run(201, 210, 20);       // rallenta per 10 s: non è ancora atterrato
  run(211, 300, 70);
  assert.equal(ev.length, 1);
  run(301, 400, 12);
  assert.equal(ev[1].kind, 'atterraggio'); assert.equal(ev[1].t, 301000);
  assert.equal(s.phase, 'terra');
});

test('promemoria periodico', () => {
  const r = { everyMin: 30, startAt: 0 };
  assert.deepEqual(reminderState(r, 10 * 60000), { count: 0, nextSec: 1200 });
  assert.equal(reminderState(r, 61 * 60000).count, 2);
  assert.equal(reminderState(null, 0), null);
});

test('carburante stimato e avvisi', () => {
  const e = fuelEstimate({ fuelL: 60, flowLh: 20, flightMin: 90, reserveMin: 30 }); // 30 l consumati
  assert.equal(e.remL, 30); assert.equal(e.endMin, 90); assert.equal(e.usableMin, 60);
  assert.equal(fuelWarnings(e, 45).length, 0);
  assert.equal(fuelWarnings(e, 70)[0].lvl, 'crit');           // l'arrivo richiede più dell'autonomia utile
  assert.equal(fuelWarnings(fuelEstimate({ fuelL: 20, flowLh: 20, flightMin: 40 }), NaN)[0].title, 'Carburante stimato: sei nella riserva');
  assert.equal(fuelEstimate({ fuelL: NaN, flowLh: 20, flightMin: 10 }), null);
});

test('variometro dal GPS e rateo necessario', () => {
  const S = []; for (let t = 0; t <= 10; t++) S.push({ t: t * 1000, altFt: 3000 + t * 10 }); // 10 ft/s = 600 ft/min
  assert.ok(Math.abs(verticalSpeedFpm(S) - 600) < 1e-6);
  assert.ok(Number.isNaN(verticalSpeedFpm(S.slice(0, 2))));
  // 10 NM a 100 kt = 6 min per scendere 3000 ft → −500 ft/min
  assert.equal(requiredVsFpm(5000, 2000, 10, 100), -500);
});

test('voce del diario', () => {
  const tr = [{ t: 0, lon: 13.0, lat: 42.0, altFt: 2000 }, { t: 600000, lon: 13.0, lat: 42.1, altFt: 4500 }, { t: 1200000, lon: 13.0, lat: 42.2, altFt: 3000 }];
  const e = logEntry({ takeoffAt: 0, landingAt: 1200000, from: 'LIAP', to: 'Celano', track: tr });
  assert.equal(e.min, 20); assert.equal(e.maxAltFt, 4500); assert.equal(e.off, '00:00'); assert.equal(e.on, '00:20');
  assert.ok(Math.abs(e.distNm - 12.0) < 0.1); // 0,2° di latitudine ≈ 12,0 NM
  assert.equal(fmtDur(75), '1:15'); assert.equal(fmtMS(-65), '−1:05');
});

test('planata: vento contrario, in coda e margine', () => {
  const tas = 123 / 1.852; // P2002 Sierra, 123 km/h
  assert.equal(groundGlideRatio(12.8, 90, tas, null, 0), 12.8);
  assert.ok(Math.abs(groundGlideRatio(12.8, 90, tas, null, 20) - 10.24) < 1e-9);
  const head = groundGlideRatio(12.8, 90, tas, { dir: 90, kt: 20 }), tail = groundGlideRatio(12.8, 270, tas, { dir: 90, kt: 20 });
  assert.ok(Math.abs(head - 12.8 * (tas - 20) / tas) < 1e-9);
  assert.ok(Math.abs(tail - 12.8 * (tas + 20) / tas) < 1e-9);
  // 3000 ft su terreno a quota 0, aria calma: 3000 / 3,28084 × 12,8 = 11 704 m → 11 500 m a passi di 250 m
  const flat = () => 0, pos = { lon: 13, lat: 42 };
  assert.equal(glideReachM({ pos, altFt: 3000, ratio: 12.8, brg: 0, tasKt: tas, terrainFt: flat }), 11500);
  // con una cresta a 1500 ft dopo 3 km ci si ferma prima
  const ridge = (lo, la) => (la > 42.027 ? 1500 : 0);
  assert.ok(glideReachM({ pos, altFt: 3000, ratio: 12.8, brg: 0, tasKt: tas, terrainFt: ridge }) < 6000);
  const h = arrivalHeightFt({ altFt: 3000, dM: 5000, ratio: 12.8, brg: 0, tasKt: tas, fieldElevFt: 500 });
  assert.ok(Math.abs(h - (3000 - 5000 * 3.28084 / 12.8 - 500)) < 1e-9);
  assert.equal(groundGlideRatio(12.8, 90, tas, { dir: 90, kt: 80 }), 0); // vento più forte della velocità: non si avanza
});

test('messaggio di soccorso compilato', () => {
  const m = maydayText({ profile: { callsign: 'i-a123', acType: 'P2002', category: 'avanzato' }, position: '4 miglia a nord di Celano', altFt: 4480, hdgM: 0 });
  assert.equal(m.freq, '121.5'); assert.equal(m.squawk, '7700');
  // ordine di SERA.14095 b): ente, nominativo, natura, intenzioni, posizione, quota, prua
  assert.equal(m.text, 'MAYDAY MAYDAY MAYDAY, ULTRALEGGERO I-A123, [natura dell’emergenza], [intenzioni], 4 miglia a nord di Celano, 4500 piedi, prua 360.');
  const n = maydayText({ profile: { callsign: 'I-B', category: 'ag' }, position: 'x', altFt: NaN, hdgM: NaN, unit: 'Pescara Avvicinamento', freq: '119.250' });
  assert.equal(n.freq, '119.250'); assert.equal(n.text, 'MAYDAY MAYDAY MAYDAY, Pescara Avvicinamento, I-B, [natura dell’emergenza], [intenzioni], x, [quota], prua [gradi].');
});

test('con forte vento contrario in volo non si «atterra»: serve anche essere vicino al suolo', () => {
  const s = newPhase(), ev = [];
  for (let t = 0; t < 30; t++) { const e = phaseStep(s, { t: t * 1000, gsKt: 70, aglFt: 2000 }); if (e) ev.push(e); }
  for (let t = 30; t < 120; t++) { const e = phaseStep(s, { t: t * 1000, gsKt: 22, aglFt: 2000 }); if (e) ev.push(e); }
  assert.deepEqual(ev.map(e => e.kind), ['decollo']);
  for (let t = 120; t < 160; t++) { const e = phaseStep(s, { t: t * 1000, gsKt: 10, aglFt: 20 }); if (e) ev.push(e); }
  assert.deepEqual(ev.map(e => e.kind), ['decollo', 'atterraggio']);
});
