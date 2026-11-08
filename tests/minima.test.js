// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTaf, tafAt, bestRunwayCrosswind, runwayDeg, minimaWarnings, MINIMA_DEFAULT } from '../web-prototype/src/minima.js';

// TAF costruito per la prova (formato ICAO): base, BECMG, TEMPO, PROB30 TEMPO, FM
const NOW = Date.UTC(2026, 10, 7, 5, 30);
const RAW = 'TAF LIRP 070500Z 0706/0806 24010KT 9999 FEW040 BECMG 0710/0712 27018G30KT TEMPO 0712/0718 4000 SHRA BKN012 PROB30 TEMPO 0718/0722 TSRA BKN008CB FM072200 18005KT CAVOK';
const at = (h, m = 0) => Date.UTC(2026, 10, 7, h, m);

test('TAF: periodo di validità e gruppi', () => {
  const t = parseTaf(RAW, NOW);
  assert.equal(t.id, 'LIRP');
  assert.equal(t.from, at(6)); assert.equal(t.to, Date.UTC(2026, 10, 8, 6));
  assert.deepEqual(t.groups.map(g => g.type), ['BASE', 'BECMG', 'TEMPO', 'PROB TEMPO', 'FM']);
  assert.equal(t.groups[0].to, at(22), 'la base finisce dove comincia il gruppo FM');
  assert.deepEqual(t.groups[0].cond, { wdir: 240, wspd: 10, wgst: null, visM: 10000, ceilFt: Infinity });
  assert.equal(t.groups[3].prob, 30);
  assert.equal(t.groups[3].cond.ceilFt, 800);
});

test('TAF: condizioni a orari diversi', () => {
  const t = parseTaf(RAW, NOW);
  let c = tafAt(t, at(8));
  assert.equal(c.prevailing.length, 1); assert.equal(c.prevailing[0].wspd, 10); assert.equal(c.possible.length, 0);
  c = tafAt(t, at(11)); // BECMG in corso: valgono entrambe
  assert.deepEqual(c.prevailing.map(x => x.wspd), [10, 18]);
  c = tafAt(t, at(13)); // BECMG completato, TEMPO in corso
  assert.equal(c.prevailing[0].wspd, 18); assert.equal(c.prevailing[0].wgst, 30);
  assert.equal(c.possible[0].visM, 4000); assert.equal(c.possible[0].ceilFt, 1200);
  c = tafAt(t, at(23)); // FM: tutto sostituito
  assert.equal(c.prevailing[0].wspd, 5); assert.equal(c.prevailing[0].cavok, true); assert.equal(c.possible.length, 0);
  assert.equal(tafAt(t, at(5)), null, 'fuori validità');
});

test('TAF: giorno a cavallo del mese e vento in m/s', () => {
  const t = parseTaf('TAF LIBP 301100Z 3012/0112 VRB03MPS 0800 FG VV002', Date.UTC(2026, 10, 30, 11));
  assert.equal(t.to, Date.UTC(2026, 11, 1, 12));
  const c = t.groups[0].cond;
  assert.equal(c.wdir, null); assert.equal(c.wspd, 6); assert.equal(c.visM, 800); assert.equal(c.ceilFt, 200);
});

test('traverso sulla pista migliore', () => {
  assert.equal(runwayDeg('08'), 80); assert.equal(runwayDeg('36'), 360); assert.equal(runwayDeg('26L'), 260);
  const x = bestRunwayCrosswind(170, 20, ['08', '14']); // pista 14/32: 30° → 10 kt
  assert.equal(x.rwy, '14'); assert.ok(Math.abs(x.cross - 10) < 0.01);
  assert.ok(Math.abs(bestRunwayCrosswind(170, 20, ['08']).cross - 20 * Math.sin(90 * Math.PI / 180)) < 0.01);
});

test('minimi: METAR e TAF di partenza e arrivo', () => {
  const route = [{ lon: 13.55778, lat: 42.05167 }, { lon: 12.70, lat: 42.93 }];
  const st = (id, lon, lat, extra) => ({ id, name: id, lon, lat, ageMin: 20, visSm: 6, ceilFt: Infinity, wdir: 240, wspd: 8, wgst: null, rawTaf: '', ...extra });
  const stations = [
    st('LIAQ', 13.5, 42.08, { ceilFt: 1200, rawTaf: '' }),                // partenza: base sotto il minimo
    st('LIAF', 12.71, 42.93, { rawTaf: RAW.replace('LIRP', 'LIAF') }),     // arrivo: TAF con TEMPO
  ];
  const mins = { ...MINIMA_DEFAULT, xwindKt: 12 };
  const W = minimaWarnings({ route, stations, minima: mins, depMs: at(12), arrMs: at(13), now: NOW, rwys: p => (p === route[0] ? ['08'] : ['17']) });
  const dep = W.find(w => /partenza/.test(w.title)), arr = W.filter(w => /arrivo/.test(w.title));
  assert.equal(dep.lvl, 'crit'); assert.match(dep.text, /base delle nubi 1200 ft \(tuo minimo 1500\)/);
  const c = arr.find(w => w.lvl === 'crit'), p = arr.find(w => w.lvl === 'warn');
  assert.match(c.text, /raffiche 30 kt/); assert.match(c.text, /traverso \d+ kt sulla pista 17/);
  assert.match(p.text, /temporaneamente: visibilità 4 km/);
  assert.match(p.text, /base delle nubi 1200 ft/);
  // condizioni buone: nessun avviso
  assert.deepEqual(minimaWarnings({ route, stations: [st('LIAQ', 13.5, 42.08)], minima: mins, depMs: at(8), arrMs: at(9), now: NOW }).filter(w => w.lvl !== 'info'), []);
});

test('minimi: casi limite (VRB con raffiche, VV///, 1 1/2SM, M1/4SM, TAF che non copre l\'arrivo)', () => {
  let c = parseTaf('TAF LIRP 070500Z 0706/0812 VRB08G25KT 0500 FG VV/// TEMPO 0710/0712 1 1/2SM BKN///', NOW).groups;
  assert.equal(c[0].cond.ceilFt, 0); assert.equal(c[0].cond.wgst, 25);
  assert.equal(c[1].cond.visM, 2414); assert.equal(c[1].cond.ceilFt, 0);
  assert.equal(parseTaf('TAF KXXX 070500Z 0706/0812 M1/4SM', NOW).groups[0].cond.visM, 402);
  const route = [{ lon: 13.5, lat: 42.0 }, { lon: 13.6, lat: 42.0 }];
  const s = { id: 'LIXX', name: 'x', lon: 13.5, lat: 42.0, ageMin: 10, visSm: 6, ceilFt: Infinity, wdir: 'VRB', wspd: 8, wgst: 25, rawTaf: '' };
  const W = minimaWarnings({ route, stations: [s], minima: { ...MINIMA_DEFAULT, xwindKt: 15 }, depMs: at(8), arrMs: at(9), now: at(8) });
  assert.ok(W.some(w => w.lvl === 'crit' && /vento variabile 8 kt con raffiche 25: al traverso può arrivare a 25 kt/.test(w.text)), JSON.stringify(W));
  const old = { ...s, wgst: null, ageMin: 200, rawTaf: 'TAF LIXX 070500Z 0706/0712 24005KT 9999 FEW040' };
  const W2 = minimaWarnings({ route, stations: [old], minima: MINIMA_DEFAULT, depMs: at(8), arrMs: at(13), now: at(8) });
  assert.ok(W2.some(w => w.lvl === 'warn' && /non verificabili in arrivo/.test(w.title) && /il TAF non copre le 13:00 UTC/.test(w.text)), JSON.stringify(W2));
  assert.equal(runwayDeg('9'), 90); assert.equal(runwayDeg('090'), null);
});
