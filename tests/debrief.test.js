// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFlight, projectOnRoute } from '../web-prototype/src/debrief.js';
import { parseChecklists, isEmergency, checklistText } from '../web-prototype/src/checklist.js';
import { pointReminderStep } from '../web-prototype/src/flight.js';

const route = [{ lon: 13.0, lat: 42.0 }, { lon: 13.5, lat: 42.0 }];

test('proiezione sulla rotta', () => {
  const p = projectOnRoute({ lon: 13.25, lat: 42.01 }, route);
  assert.ok(Math.abs(p.xtM - 1113.2) < 2);
  assert.ok(Math.abs(p.alongM - 20690) < 60);
});

test('revisione: terreno, limite VDS, fuori rotta, quota pianificata, spazio aereo', () => {
  // volo da ovest a est a 3000 ft; terreno 1000 ft tranne una cresta a 2800 ft tra 13,20 e 13,22
  const T = [];
  for (let i = 0; i <= 50; i++) {
    const lon = 13.0 + i * 0.01, lat = i >= 30 && i <= 34 ? 42.04 : 42.0;
    T.push({ lon, lat, altFt: i >= 40 && i <= 42 ? 3800 : 3000, t: i * 10000 });
  }
  const terrainFt = lon => (lon >= 13.195 && lon <= 13.225 ? 2800 : 1000);
  const r = analyzeFlight({ track: T, route, terrainFt, vdsLimFt: () => 3500, fields: [{ lon: 13.0, lat: 42.0, elevFt: 1000 }],
    airspaceAt: (lon, lat, alt) => (lon > 13.45 ? [{ name: 'LI-R99', need: 'vietato' }] : []), planAltFt: () => 3000 });
  const k = r.episodes.map(e => `${e.kind}:${e.lvl}`);
  assert.ok(k.includes('terreno:crit'), k.join());
  const terr = r.episodes.find(e => e.kind === 'terreno');
  assert.equal(Math.round(terr.worst), 200); assert.equal(terr.i0, 20); assert.equal(terr.i1, 22);
  const vds = r.episodes.find(e => e.kind === 'vds'); assert.equal(vds.i0, 40); assert.equal(vds.i1, 42); assert.equal(vds.worst, 300);
  const rot = r.episodes.find(e => e.kind === 'rotta'); assert.equal(rot.lvl, 'warn'); assert.ok(rot.worst > 2);
  assert.ok(r.episodes.some(e => e.kind === 'quota' && e.worst === 800));
  const sp = r.episodes.find(e => e.kind === 'spazio'); assert.equal(sp.lvl, 'crit'); assert.match(sp.title, /LI-R99/);
  assert.equal(r.episodes[0].lvl, 'crit');
  assert.ok(r.distNm > 26 && r.distNm < 28, String(r.distNm)); // 22,3 NM in linea retta più la deviazione di 0,04° andata e ritorno
  assert.equal(r.maxAltFt, 3800);
  // vicino al campo di partenza il margine basso non conta
  const low = analyzeFlight({ track: [{ lon: 13.0, lat: 42.0, altFt: 1100, t: 0 }, { lon: 13.01, lat: 42.0, altFt: 1300, t: 5000 }], terrainFt: () => 1000, fields: [{ lon: 13.0, lat: 42.0, elevFt: 1000 }] });
  assert.equal(low.episodes.length, 0);
});

test('liste di controllo: formato del testo', () => {
  const L = parseChecklists('# Prima dell\'avviamento\nCinture ..... ALLACCIATE\n- Carburante ..... APERTO\n\n# EMERGENZA: piantata motore\nVelocità ..... PLANATA');
  assert.equal(L.length, 2); assert.equal(L[0].items[1], 'Carburante ..... APERTO');
  assert.equal(L.filter(isEmergency).length, 1);
  assert.deepEqual(parseChecklists(checklistText(L)), L);
  assert.deepEqual(parseChecklists(''), []);
});

test('promemoria sui punti: prima, sopra, al traverso', () => {
  const pt = { lon: 13.5, lat: 42.0 };
  // in volo verso est a 90 kt
  let st = {}, r = { ...pt, mode: 'prima', min: 5 };
  assert.equal(pointReminderStep(r, st, { lon: 13.2, lat: 42.0, trk: 90, gsKt: 90 }), false); // 13,4 NM → 9 min
  assert.equal(pointReminderStep(r, st, { lon: 13.4, lat: 42.0, trk: 90, gsKt: 90 }), true);  // 4,5 NM → 3 min
  assert.equal(pointReminderStep(r, st, { lon: 13.45, lat: 42.0, trk: 90, gsKt: 90 }), false, 'una volta sola');
  st = {}; r = { ...pt, mode: 'sopra' };
  assert.equal(pointReminderStep(r, st, { lon: 13.48, lat: 42.012, trk: 90, gsKt: 90 }), false); // 1 NM, davanti
  assert.equal(pointReminderStep(r, st, { lon: 13.52, lat: 42.012, trk: 90, gsKt: 90 }), true);  // passato a 0,7 NM
  st = {}; r = { ...pt, mode: 'traverso' };
  assert.equal(pointReminderStep(r, st, { lon: 13.4, lat: 42.1, trk: 90, gsKt: 90 }), false);
  assert.equal(pointReminderStep(r, st, { lon: 13.51, lat: 42.1, trk: 90, gsKt: 90 }), true);
});

test('revisione: punti fuori ordine, terreno sconosciuto, livello che sale, campo senza quota', () => {
  const T = [{ lon: 13.2, lat: 42.0, altFt: 3000, t: 20000 }, { lon: 13.0, lat: 42.0, altFt: 3000, t: 0 }, { lon: 13.0, lat: 42.0, altFt: 3000, t: 0 }, { lon: 13.1, lat: 42.0, altFt: 3000, t: 10000 }];
  const r = analyzeFlight({ track: T, terrainFt: () => NaN });
  assert.deepEqual(r.samples.map(p => p.t), [0, 10000, 20000]);
  assert.ok(r.durMin > 0); assert.ok(Number.isNaN(r.minAglFt)); assert.equal(r.episodes.length, 0);
  // fuori rotta da 1,2 a 3 NM: l'episodio sale da «info» a «warn»
  const X = [1.2, 2.0, 3.0].map((nm, i) => ({ lon: 13.1 + i * 0.01, lat: 42.0 + nm * 1852 / 111320, altFt: 5000, t: i * 10000 }));
  const e = analyzeFlight({ track: X, route, terrainFt: () => 1000 }).episodes.find(x => x.kind === 'rotta');
  assert.equal(e.lvl, 'warn'); assert.ok(e.worst > 2.9);
  const f = analyzeFlight({ track: [{ lon: 13.0, lat: 42.0, altFt: 1050, t: 0 }], terrainFt: () => 1000, fields: [{ lon: 13.0, lat: 42.0, elevFt: NaN }] });
  assert.equal(f.episodes.length, 0, 'campo senza quota: si usa il terreno');
});

test('promemoria: punto passato di lato, virata che non è un traverso', () => {
  const pt = { lon: 13.5, lat: 42.0 };
  // «sopra»: il punto passa a 2 NM di lato in volo diritto → scatta al traverso con la distanza
  let st = {}, r = { ...pt, mode: 'sopra' };
  pointReminderStep(r, st, { lon: 13.48, lat: 42.033, trk: 90, gsKt: 90 });
  assert.equal(pointReminderStep(r, st, { lon: 13.52, lat: 42.033, trk: 90, gsKt: 90 }), true);
  assert.ok(st.passedNm > 1.9 && st.passedNm < 2.3, String(st.passedNm)); // distanza al primo punto dopo il traverso
  // «2 minuti prima» con il punto a 4 NM di lato a 100 kt: scatta lungo la traccia
  st = {}; r = { ...pt, mode: 'prima', min: 2 };
  assert.equal(pointReminderStep(r, st, { lon: 13.4, lat: 42.0667, trk: 90, gsKt: 100 }), false);
  assert.equal(pointReminderStep(r, st, { lon: 13.46, lat: 42.0667, trk: 90, gsKt: 100 }), true);
  // «traverso» a ore 2 a 3 NM: una virata di 40° a sinistra non lo fa scattare
  st = {}; r = { ...pt, mode: 'traverso' };
  pointReminderStep(r, st, { lon: 13.47, lat: 41.98, trk: 30, gsKt: 90 });
  assert.equal(pointReminderStep(r, st, { lon: 13.47, lat: 41.98, trk: 350, gsKt: 90 }), false);
});
