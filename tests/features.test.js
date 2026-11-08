// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aerodromeKind, featureWarnings, fieldAt, obstacleTopFt } from '../web-prototype/src/features.js';
import { geoidN } from '../web-prototype/src/geoid.js';

const feats = JSON.parse(readFileSync(new URL('../web-prototype/data/marsica/features.json', import.meta.url)));
const geoid = JSON.parse(readFileSync(new URL('../web-prototype/data/marsica/geoid.json', import.meta.url)));
const byName = n => feats.airports.find(a => a.name === n);

test('pacchetto: aeroporti e aviosuperfici della zona riconosciuti', () => {
  assert.equal(aerodromeKind(byName('FROSINONE')), 'aeroporto');              // LIRH, militare
  assert.equal(aerodromeKind(byName('L AQUILA / PRETURO')), 'aeroporto');     // LIAP
  assert.equal(aerodromeKind(byName('CELANO')), 'aviosuperficie');
  assert.equal(aerodromeKind(byName('COLLEROTONDO')), 'chiuso');
  const cel = byName('CELANO');
  assert.deepEqual(cel.freqs[0], { mhz: '130.000', name: 'INFO' });
  assert.deepEqual(cel.rwy, ['08']);
  assert.equal(feats.obstacles.length, 86);
});

test('VDS non avanzato: 5 km dagli aeroporti', () => {
  // Sora → Ceccano passando 2 km a est di Frosinone (LIRH 13,2945 E 41,6487 N)
  const route = [{ lon: 13.32, lat: 41.75 }, { lon: 13.32, lat: 41.60 }];
  const w = featureWarnings({ route, cruiseFt: 2500, pilot: 'basico', feats });
  const f = w.find(x => x.kind === 'aeroporto');
  assert.ok(f && f.lvl === 'crit', JSON.stringify(w));
  assert.match(f.text, /a 2,1 km/);
  // stesso percorso con VDS avanzato: nessun limite dei 5 km (valgono spazi aerei e ATZ)
  assert.ok(!featureWarnings({ route, cruiseFt: 2500, pilot: 'avanzato', feats }).some(x => x.kind === 'aeroporto'));
  // a 6 km di distanza: nessun avviso
  const far = [{ lon: 13.375, lat: 41.75 }, { lon: 13.375, lat: 41.60 }];
  assert.ok(!featureWarnings({ route: far, cruiseFt: 2500, pilot: 'basico', feats }).some(x => x.kind === 'aeroporto' && /FROSINONE/.test(x.title)));
});

test('aviosuperficie sulla rotta: avviso di traffico con frequenza', () => {
  const route = [{ lon: 13.50, lat: 42.05 }, { lon: 13.62, lat: 42.05 }];       // sopra Celano
  const w = featureWarnings({ route, cruiseFt: 3000, pilot: 'avanzato', feats });
  const c = w.find(x => x.title === 'Traffico possibile: CELANO');
  assert.ok(c, JSON.stringify(w));
  assert.match(c.text, /130\.000/);
  assert.equal(fieldAt(feats, { lon: 13.558, lat: 42.052 }).name, 'CELANO');
  assert.equal(fieldAt(feats, { lon: 13.45, lat: 42.03 }), null);
});

test('ostacoli: pale eoliche di Collarmele senza altezza, ipotesi prudente dichiarata', () => {
  const route = [{ lon: 13.66, lat: 42.05 }, { lon: 13.71, lat: 42.06 }];
  const top = obstacleTopFt({ elevM: 1203, heightM: null, kind: 'pala eolica' });
  assert.ok(Math.abs(top - (1203 + 200) * 3.28084) < 1e-6);
  // torri, antenne e ciminiere senza altezza: 300 m (esistono tralicci oltre i 200 m)
  assert.ok(Math.abs(obstacleTopFt({ elevM: 1000, heightM: null, kind: 'torre o antenna' }) - 1300 * 3.28084) < 1e-6);
  assert.ok(Math.abs(obstacleTopFt({ elevM: 1000, heightM: 50, kind: 'torre o antenna' }) - 1050 * 3.28084) < 1e-6);
  const w = featureWarnings({ route, cruiseFt: 4500, pilot: 'avanzato', feats }).find(x => x.kind === 'ostacoli');
  assert.ok(w, 'a 4500 ft sopra le pale a 1200 m');
  assert.equal(w.lvl, 'crit');
  assert.match(w.text, /senza altezza/);
  assert.ok(!featureWarnings({ route, cruiseFt: 5500, pilot: 'avanzato', feats }).some(x => x.kind === 'ostacoli'));
});

test('geoide: la griglia EGM96 coincide con le ondulazioni calcolate da openAIP (entro 0,5 m)', () => {
  // valori «elevationGeoid.geoidHeight» dell'export openAIP del 6/11/2026 (non arrotondati)
  const ref = [[13.226, 41.654, 49.0956], [13.996, 42.49, 44.6971], [13.84194, 42.11, 48.3699], [13.094, 41.716, 49.1682],
    [14, 42.315, 46.0545], [13.94, 42.5, 44.9682], [13.49917, 41.68722, 49.1998], [13.042, 42.094, 49.6474], [13.29222, 41.6425, 48.9995]];
  for (const [lon, lat, n] of ref) assert.ok(Math.abs(geoidN(geoid, lon, lat) - n) < 0.5, `${lon},${lat}: ${geoidN(geoid, lon, lat)} invece di ${n}`);
});

test('codice LIAH per l\'aviosuperficie di Celano (alias di ricerca, non un dato openAIP)', async () => {
  const { aliasesFor } = await import('../web-prototype/src/features.js');
  assert.deepEqual(aliasesFor({ name: 'CELANO', lat: 42.05167, lon: 13.55778 }), ['LIAH']);
  assert.deepEqual(aliasesFor({ name: 'CELANO', lat: 42.3, lon: 13.55778 }), []);
  assert.deepEqual(aliasesFor({ name: 'AVEZZANO', lat: 42.05167, lon: 13.55778 }), []);
});

test('campi con dati da verificare: avviso informativo solo se la rotta passa vicino', async () => {
  const { fieldDoubtWarnings, FIELD_DOUBTS } = await import('../web-prototype/src/features.js');
  const f = { airports: [{ icao: 'LIRH', name: 'FROSINONE', lon: 13.2945, lat: 41.64873, freqs: [] }, { icao: 'LIAP', name: "L'AQUILA", lon: 13.31, lat: 42.38, freqs: [] }], obstacles: [] };
  const w = fieldDoubtWarnings([{ lon: 13.2, lat: 41.6 }, { lon: 13.4, lat: 41.7 }], f);
  assert.equal(w.length, 1);
  assert.equal(w[0].lvl, 'info');
  assert.match(w[0].text, /AIP ENAV/);
  assert.equal(fieldDoubtWarnings([{ lon: 14.5, lat: 41.6 }, { lon: 14.6, lat: 41.7 }], f).length, 0);
  assert.ok(!('LIAP' in FIELD_DOUBTS));
});
