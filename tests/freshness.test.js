// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { airacCycle, cyclesBehind, freshnessWarnings, staleAirspaceInfo } from '../web-prototype/src/freshness.js';

test('cicli AIRAC: date note della tabella ICAO', () => {
  // valori attesi: 2001 = 2 gen 2020, 2501 = 23 gen 2025, 2601 = 22 gen 2026, 2611 = 29 ott 2026, 2613 = 24 dic 2026
  assert.deepEqual(airacCycle('2020-01-02'), { id: '2001', effective: '2020-01-02', next: '2020-01-30' });
  assert.equal(airacCycle('2025-01-23').id, '2501');
  assert.equal(airacCycle('2025-01-22').id, '2413');          // il giorno prima vale ancora l'ultimo del 2024
  assert.equal(airacCycle('2024-12-26').id, '2413');
  assert.equal(airacCycle('2026-01-22').id, '2601');
  assert.deepEqual(airacCycle('2026-11-08'), { id: '2611', effective: '2026-10-29', next: '2026-11-26' });
  assert.equal(airacCycle('2026-11-26').id, '2612');
  assert.equal(airacCycle('2026-12-24').id, '2613');
  assert.equal(airacCycle('2027-01-21').id, '2701');
  assert.equal(airacCycle('2020-12-31').id, '2014');           // il 2020 ha 14 cicli
});

test('cicli trascorsi dallo scarico dei dati', () => {
  assert.equal(cyclesBehind('2026-11-06', '2026-11-08'), 0);
  assert.equal(cyclesBehind('2026-11-06', '2026-11-25'), 0);
  assert.equal(cyclesBehind('2026-11-06', '2026-11-26'), 1);
  assert.equal(cyclesBehind('2026-10-28', '2026-10-29'), 1);
  assert.equal(cyclesBehind('2026-11-06', '2027-01-21'), 3);
  assert.equal(cyclesBehind('2026-11-06', '2026-11-01'), 0);   // volo prima dello scarico
});

const meta = { airspaces: { source: 'openAIP', downloaded: '2026-11-06' } };
const lv = (w, t) => w.find(x => x.title.startsWith(t))?.lvl;

test('avvisi sull’età dei dati secondo il giorno del volo', () => {
  let w = freshnessWarnings({ meta, flightDate: '2026-11-10', today: '2026-11-08' });
  assert.equal(lv(w, 'Dati del ciclo AIRAC 2611'), 'info');
  assert.equal(lv(w, 'NOTAM e attivazioni'), 'warn');
  w = freshnessWarnings({ meta, flightDate: '2026-11-28', today: '2026-11-08' });
  assert.equal(lv(w, 'Spazi aerei del ciclo AIRAC precedente'), 'warn');
  assert.match(w[0].text, /2612/);
  w = freshnessWarnings({ meta, flightDate: '', today: '2027-01-02' });
  assert.equal(lv(w, 'Spazi aerei vecchi di 2 cicli'), 'crit');
  w = freshnessWarnings({ meta: null, today: '2026-11-08', demo: true });
  assert.equal(w.length, 1); assert.equal(w[0].lvl, 'crit');
});

test('spazi aerei non modificati da tempo: solo informazione', () => {
  const as = [{ name: 'CTA ROMA Z4 MARSICA', updatedAt: '2023-04-24T11:12:56Z' }, { name: 'ATZ L\'AQUILA', updatedAt: '2026-09-02T00:00:00Z' }];
  const w = staleAirspaceInfo(as, '2026-11-08');
  assert.equal(w.length, 1); assert.equal(w[0].lvl, 'info'); assert.match(w[0].title, /^1 spazio aereo/); assert.match(w[0].text, /24\/04\/2023/);
  assert.deepEqual(staleAirspaceInfo(as.slice(1), '2026-11-08'), []);
});
