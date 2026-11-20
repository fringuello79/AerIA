// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Valori attesi calcolati a parte (a mano o con le formule WGS84 delle lunghezze di un grado, in Python).
import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestOnRing, sideOf, airspacesAround, isNear, isEmphasised, exitTimeS, terrainAlertConfig, filterTerrainEvents,
  call500Step, safeHereFt, safeRouteFt, aglShown, nearSpeech, emphasisIds } from '../web-prototype/src/alerts.js';
import { destPoint, distM } from '../web-prototype/src/geo.js';

const flat = { elevFt: () => 2000 };
// CTR quadrata SFC–3000 ft AMSL tra 13,4 e 13,6 E e tra 41,9 e 42,1 N (anello aperto, come nei test delle regole)
const ctr = { id: 'c', name: 'CTR PROVA', type: 'CTR', cls: 'D', lower: { value: 0, unit: 'FT', ref: 'GND' }, upper: { value: 3000, unit: 'FT', ref: 'MSL' },
  clipped: [[[13.4, 41.9], [13.6, 41.9], [13.6, 42.1], [13.4, 42.1]]], bbox: { lonMin: 13.4, lonMax: 13.6, latMin: 41.9, latMax: 42.1 } };
// zona regolamentata SFC–2000 ft dal suolo nello stesso quadrato
const rz = { ...ctr, id: 'r', name: 'R PROVA', type: 'R', cls: '', upper: { value: 2000, unit: 'FT', ref: 'GND' } };
// spazio di classe G: non chiede nulla, non conta
const g = { ...ctr, id: 'g', name: 'G PROVA', type: 'OTHER', cls: 'G' };
const east = (nm, lat = 42.0) => { const p = destPoint([13.6, lat], 90, nm); return { lon: p[0], lat: p[1] }; };

test('punto più vicino di un anello: lato est e lato di chiusura', () => {
  const p = east(1.5), n = nearestOnRing(p, ctr.clipped[0]);
  assert.ok(Math.abs(n.dM / 1852 - 1.5) < 0.005, `${n.dM / 1852} NM`);
  assert.ok(Math.abs(n.lon - 13.6) < 1e-6 && Math.abs(n.lat - 42.0) < 1e-6);
  // a ovest: il lato più vicino è quello di chiusura (13,4 E), che nell'anello aperto non è scritto
  const w = { lon: 13.35, lat: 42.0 }, m = nearestOnRing(w, ctr.clipped[0]);
  assert.ok(Math.abs(m.lon - 13.4) < 1e-6, `lon ${m.lon}`);
  assert.ok(Math.abs(m.dM - distM(w, { lon: 13.4, lat: 42.0 })) < 1);
});

test('lato rispetto alla traccia', () => {
  assert.equal(sideOf(90, 100), 'davanti');
  assert.equal(sideOf(90, 200), 'a destra');
  assert.equal(sideOf(90, 0), 'a sinistra');
  assert.equal(sideOf(90, 270), 'dietro');
  assert.equal(sideOf(350, 20), 'davanti');   // passaggio per il nord
  assert.equal(sideOf(NaN, 20), '');
});

test('spazi attorno: distanza, scarto verticale, vicino ed evidenza', () => {
  const base = { trackDeg: 0, airspaces: [ctr, g], terrain: flat, qnh: 1013.25, pilot: 'avanzato' };
  let r = airspacesAround({ ...base, pos: east(1.5), altFt: 2500 });
  assert.equal(r.length, 1);                      // la classe G non conta
  assert.ok(Math.abs(r[0].distNm - 1.5) < 0.005);
  assert.equal(r[0].gapFt, 0); assert.equal(r[0].side, 'a sinistra');
  assert.equal(isNear(r[0]), true); assert.equal(isEmphasised(r[0]), true);
  // 400 ft sopra il tetto: vicino solo se l'incertezza della quota arriva a 400 ft; evidenziato (entro 1000 ft)
  r = airspacesAround({ ...base, pos: east(1.5), altFt: 3400 });
  assert.equal(r[0].gapFt, 400);
  assert.equal(isNear(r[0], 100), false); assert.equal(isNear(r[0], 400), true); assert.equal(isEmphasised(r[0]), true);
  // 1500 ft sopra: né vicino né evidenziato
  r = airspacesAround({ ...base, pos: east(1.5), altFt: 4500 });
  assert.equal(isEmphasised(r[0]), false);
  // a 3 NM: evidenziato ma non vicino; a 6 NM fuori dal raggio di 5 NM
  r = airspacesAround({ ...base, pos: east(3), altFt: 2500 });
  assert.equal(isNear(r[0]), false); assert.equal(isEmphasised(r[0]), true);
  assert.equal(airspacesAround({ ...base, pos: east(6), altFt: 2500 }).length, 0);
  // dentro lo spazio: non compare (lo gestisce il volo con il tempo all'uscita)
  assert.equal(airspacesAround({ ...base, pos: { lon: 13.5, lat: 42.0 }, altFt: 2500 }).length, 0);
});

test('spazi attorno: limite dal suolo calcolato col terreno sul bordo', () => {
  // R SFC–2000 ft GND, terreno 2000 ft: tetto a 4000 ft AMSL. A 3900 ft si è dentro i limiti (scarto 0)
  const r = airspacesAround({ pos: east(1), altFt: 3900, trackDeg: 270, airspaces: [rz], terrain: flat, qnh: 1013.25, pilot: 'avanzato' });
  assert.equal(r[0].hi, 4000); assert.equal(r[0].gapFt, 0); assert.equal(r[0].side, 'davanti');
});

test('tempo all\'uscita da uno spazio', () => {
  // da 13,5 E verso est a 120 kt: il bordo a 13,6 E è a 0,1° × 82,85 km/° = 8285 m = 4,474 NM, cioè 134,2 s.
  // Passi di 5 s: il primo punto fuori è a 135 s.
  const base = { pos: { lon: 13.5, lat: 42.0 }, trackDeg: 90, altFt: 2500, a: ctr, terrain: flat, qnh: 1013.25 };
  assert.equal(exitTimeS({ ...base, gsKt: 120 }), 135);
  assert.equal(exitTimeS({ ...base, gsKt: 10 }), null);           // troppo lenti per dirlo
  assert.equal(exitTimeS({ ...base, gsKt: 120, maxS: 100 }), null);
  // verso nord: il bordo a 42,1 N è a 0,1° × 111,05 km/° = 11,1 km = 5,996 NM → 179,9 s → 180 s
  assert.equal(exitTimeS({ ...base, trackDeg: 0, gsKt: 120 }), 180);
});

test('regolazioni degli avvisi di terreno', () => {
  assert.deepEqual(terrainAlertConfig({}, 'avanzato'), { warnAglFt: 300, warnS: 120, critS: 60, onlyCrit: false, auto: true });
  assert.equal(terrainAlertConfig({}, 'basico').warnAglFt, 150);
  assert.equal(terrainAlertConfig({ margin: 500 }, 'basico').warnAglFt, 500);
  assert.equal(terrainAlertConfig({ margin: '1000' }).warnAglFt, 1000);
  assert.equal(terrainAlertConfig({ margin: 'x' }).warnAglFt, 300);
  assert.deepEqual([terrainAlertConfig({ aheadS: 60 }).warnS, terrainAlertConfig({ aheadS: 60 }).critS], [60, 60]);
  assert.deepEqual([terrainAlertConfig({ aheadS: 90 }).warnS, terrainAlertConfig({ aheadS: 90 }).critS], [90, 60]);
  assert.equal(terrainAlertConfig({ aheadS: 45 }).warnS, 120);   // valore non previsto: predefinito
  const ev = [{ kind: 'terrain', lvl: 'warn' }, { kind: 'terrain', lvl: 'crit' }, { kind: 'obstacle', lvl: 'warn' }, { kind: 'airspace', lvl: 'warn' }];
  assert.equal(filterTerrainEvents(ev, terrainAlertConfig({})).length, 4);
  assert.deepEqual(filterTerrainEvents(ev, terrainAlertConfig({ sens: 'gravi' })).map(e => `${e.kind}-${e.lvl}`), ['terrain-crit', 'airspace-warn']);
});

test('«cinquecento» sul campo d\'arrivo: una volta, con isteresi e solo vicino al campo', () => {
  const seq = [[0, 0.5], [300, 0.8], [800, 2], [550, 3], [480, 3], [450, 3], [520, 3], [620, 3], [490, 3], [700, 8], [400, 8], [400, 4]];
  let st, fired = [];
  for (const [h, d] of seq) { const r = call500Step(st, h, d); st = r.st; fired.push(r.fire); }
  // decollo: non armato finché non si supera 600 ft; scendendo a 480 ft annuncia; 520 non riarma; 620 riarma; a 8 NM no
  assert.deepEqual(fired, [false, false, false, false, true, false, false, false, true, false, false, true]);
  assert.equal(call500Step(undefined, NaN, 1).fire, false);
});

test('quote sicure', () => {
  // 1000 ft sopra il punto più alto entro 5 km, arrotondata ai 100 ft superiori
  assert.equal(safeHereFt(2340), 3400);
  assert.equal(safeHereFt(2340, 2600), 3600);
  assert.equal(safeHereFt(3000), 4000);
  assert.ok(Number.isNaN(safeHereFt(NaN)));
  const legs = [{ minFt: 3000 }, null, { minFt: 4500 }, { minFt: 3500 }];
  assert.equal(safeRouteFt(legs, 0), 4500);
  assert.equal(safeRouteFt(legs, 3), 3500);
  assert.ok(Number.isNaN(safeRouteFt(legs, 4)));
});

test('altezza sul terreno mostrata solo se attendibile', () => {
  assert.equal(aglShown(800, 250).text, '800 ft');
  assert.equal(aglShown(400, 250).text, 'incerto');
  assert.equal(aglShown(500, 250).text, 'incerto');    // incertezza pari a metà dell'altezza
  assert.equal(aglShown(501, 250).text, '501 ft');
  assert.equal(aglShown(-50, 250).text, '-50 ft');    // sotto il terreno del modello: resta visibile
  assert.equal(aglShown(120, 0).text, '120 ft');      // simulazione: nessuna incertezza
  assert.equal(aglShown(NaN, 100).text, '—');
});

test('testo a voce dell\'avviso «vicino»', () => {
  assert.equal(nearSpeech({ a: ctr, distNm: 1.6, side: 'a sinistra' }), 'Spazio controllato CTR PROVA vicino, a 1,5 miglia a sinistra.');
  assert.equal(nearSpeech({ a: rz, distNm: 0.4, side: 'davanti' }), 'Zona regolamentata R PROVA vicino, a meno di un miglio davanti.');
  assert.equal(nearSpeech({ a: ctr, distNm: 2, side: '' }), 'Spazio controllato CTR PROVA vicino, a 2 miglia.');
});

test('spazi evidenziati con isteresi', () => {
  const x = (id, distNm, gapFt) => ({ a: { id }, distNm, gapFt });
  // entra entro 5 NM e 1000 ft
  let ids = emphasisIds(new Set(), [x('a', 4.9, 0), x('b', 5.5, 0), x('c', 3, 1200)]);
  assert.deepEqual([...ids], ['a']);
  // già evidenziato: resta fino a 6 NM e 1300 ft, poi esce
  ids = emphasisIds(ids, [x('a', 5.8, 1250)]); assert.deepEqual([...ids], ['a']);
  ids = emphasisIds(ids, [x('a', 6.2, 0)]); assert.deepEqual([...ids], []);
  // al massimo 8
  assert.equal(emphasisIds(new Set(), Array.from({ length: 12 }, (_, i) => x(`s${i}`, 1, 0))).size, 8);
});
