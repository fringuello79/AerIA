// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { visibSm, ceilingFt, flightCategory, parseMetars, nearestQnh, parseSigmets } from '../web-prototype/src/weather.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/awc-2026-11-06.json', import.meta.url)));
const NOW = 1793955000 * 1000; // 06/11/2026 08:50 UTC

test('visibilità: formati della fonte', () => {
  assert.equal(visibSm('6+'), 6);
  assert.equal(visibSm('1/2'), 0.5);
  assert.equal(visibSm('1 1/2'), 1.5);
  assert.equal(visibSm(3), 3);
  assert.ok(Number.isNaN(visibSm(null)));
});

test('categorie di volo: soglie FAA', () => {
  assert.equal(flightCategory(Infinity, 6), 'VFR');
  assert.equal(flightCategory(3000, 6), 'MVFR');   // 3000 ft è ancora marginale
  assert.equal(flightCategory(3100, 5), 'MVFR');   // 5 SM è ancora marginale
  assert.equal(flightCategory(900, 6), 'IFR');
  assert.equal(flightCategory(400, 6), 'LIFR');
  assert.equal(flightCategory(5000, 0.5), 'LIFR');
  assert.equal(ceilingFt([{ cover: 'SCT', base: 2000 }, { cover: 'BKN', base: 4000 }]), 4000);
  assert.equal(ceilingFt([{ cover: 'FEW', base: 500 }]), Infinity);
});

test('METAR reali: categoria ricalcolata uguale a quella della fonte', () => {
  const st = parseMetars(fx.metar, NOW);
  assert.equal(st.length, 4);
  for (const s of st) assert.equal(s.catMismatch, false, s.id);
  const lirh = st.find(s => s.id === 'LIRH');
  assert.equal(lirh.qnh, 1021);
  assert.equal(lirh.cat, 'VFR');
  // Base SCT035 sopra un aeroporto a 183 m: 3500 + 600 ≈ 4100 ft sul livello del mare
  assert.ok(Math.abs(lirh.cloudsAmsl[0].baseAmsl - 4100) < 2, String(lirh.cloudsAmsl[0].baseAmsl));
  assert.ok(Math.abs(lirh.ageMin - 55) < 0.1);
  const libp = st.find(s => s.id === 'LIBP');
  assert.equal(libp.auto, true);
  assert.equal(libp.ceilFt, 16000);
  assert.match(lirh.rawTaf, /FEW030CB/);
});

test('QNH: stazione più vicina, scarta i dati vecchi', () => {
  const st = parseMetars(fx.metar, NOW);
  const avezzano = { lon: 13.43, lat: 42.03 };
  const q = nearestQnh(st, avezzano);
  assert.equal(q.station.id, 'LIRH');          // Frosinone ≈ 43 km, Ciampino ≈ 76 km
  assert.ok(q.distKm > 40 && q.distKm < 46, String(q.distKm));
  assert.equal(nearestQnh(parseMetars(fx.metar, NOW + 3 * 3600e3), avezzano), null);
});

test('SIGMET: base mancante = suolo, filtro per area', () => {
  const all = parseSigmets(fx.isigmet);
  assert.equal(all.length, 1);
  assert.equal(all[0].baseFt, 0);
  assert.equal(all[0].topFt, 40000);
  assert.equal(parseSigmets(fx.isigmet, { lonMin: 13, lonMax: 14, latMin: 41.6, latMax: 42.6 }).length, 0);
});

import { weatherWarnings, distToRouteKm, CONVECTIVE } from '../web-prototype/src/weather.js';

test('distanza dalla rotta', () => {
  const route = [{ lon: 13.0, lat: 42.0 }, { lon: 14.0, lat: 42.0 }];
  const d = distToRouteKm({ lon: 13.5, lat: 42.1 }, route);
  assert.ok(Math.abs(d - 11.10) < 0.05, String(d));           // 0,1° di latitudine a 42° ≈ 11,10 km
  assert.ok(Math.abs(distToRouteKm({ lon: 12.9, lat: 42.0 }, route) - 8.28) < 0.1); // 0,1° di longitudine a 42° ≈ 8,27 km
});

test('convezione: TS, VCTS, CB, TCU, non le parole qualsiasi', () => {
  for (const s of ['METAR X 0820Z 9999 TSRA BKN030CB', 'METAR X VCTS', 'SCT035TCU', 'FEW030CB']) assert.ok(CONVECTIVE.test(s), s);
  for (const s of ['METAR LIRH 060755Z 09003KT 9999 SCT035 12/09 Q1021', 'TEMPO RA BR', 'CAVOK']) assert.ok(!CONVECTIVE.test(s), s);
});

test('avvisi meteo sulla rotta con i METAR reali', () => {
  const st = parseMetars(fx.metar, NOW);
  // Rotta Avezzano → Sora: passa a circa 12 km da Frosinone
  const route = [{ lon: 13.43, lat: 42.03 }, { lon: 13.4, lat: 41.75 }];
  const w = weatherWarnings({ route, stations: st, cruiseFt: 4500, now: NOW });
  assert.ok(w.some(x => /previsti a LIRH/.test(x.title)), 'il TAF di LIRH prevede FEW030CB');
  assert.ok(!w.some(x => x.lvl === 'crit'), JSON.stringify(w));
  // In Marsica (Celano → Pescina) nessun aeroporto entro 25 km
  const w2 = weatherWarnings({ route: [{ lon: 13.55, lat: 42.08 }, { lon: 13.65, lat: 42.03 }], stations: st, cruiseFt: 4500, now: NOW });
  assert.equal(w2[0].title, 'Nessuna osservazione vicino alla rotta');
  // Stessi dati tre ore dopo: METAR scaduto
  const w3 = weatherWarnings({ route, stations: parseMetars(fx.metar, NOW + 3 * 3600e3), cruiseFt: 4500, now: NOW });
  assert.ok(w3.some(x => /scaduto/.test(x.title)));
});

test('avvisi meteo: casi limite costruiti', () => {
  const route = [{ lon: 13.0, lat: 42.0 }, { lon: 13.2, lat: 42.0 }];
  const base = { id: 'TEST', name: 'Prova', lat: 42.0, lon: 13.1, ageMin: 10, raw: '', rawTaf: '', visSm: 6 };
  const ifr = { ...base, cat: 'IFR', ceilFt: 800, cloudsAmsl: [{ cover: 'OVC', base: 800, baseAmsl: 1800 }] };
  const w = weatherWarnings({ route, stations: [ifr], cruiseFt: 3000, now: 0 });
  assert.ok(w.some(x => x.lvl === 'crit' && /strumentali/.test(x.title)));
  assert.ok(!w.some(x => /vicina alle nubi/.test(x.title)), '1200 ft sopra lo strato: separazione sufficiente');
  assert.ok(w.some(x => /sopra uno strato/.test(x.title)), 'ma si vola sopra uno strato coperto');
  const low = { ...base, cat: 'VFR', ceilFt: 4000, cloudsAmsl: [{ cover: 'BKN', base: 4000, baseAmsl: 5000 }] };
  assert.ok(weatherWarnings({ route, stations: [low], cruiseFt: 4500, now: 0 }).some(x => /vicina alle nubi/.test(x.title)));
  assert.ok(!weatherWarnings({ route, stations: [low], cruiseFt: 3900, now: 0 }).some(x => /vicina alle nubi/.test(x.title)));
  const sig = { fir: 'TEST', hazard: 'TURB', baseFt: 0, topFt: 10000, from: 0, to: 1e15, ring: [[12.9, 41.9], [13.3, 41.9], [13.3, 42.1], [12.9, 42.1], [12.9, 41.9]] };
  assert.ok(weatherWarnings({ route, stations: [], sigmets: [sig], cruiseFt: 4500, now: 1 }).some(x => /SIGMET turbolenza/.test(x.title)));
  assert.ok(!weatherWarnings({ route, stations: [], sigmets: [{ ...sig, baseFt: 6000 }], cruiseFt: 4500, now: 1 }).some(x => /SIGMET/.test(x.title)));
  assert.ok(!weatherWarnings({ route, stations: [], sigmets: [{ ...sig, to: 0 }], cruiseFt: 4500, now: 1 }).some(x => /SIGMET/.test(x.title)), 'scaduto');
});
