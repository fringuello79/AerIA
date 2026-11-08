// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayInfo, holidayName, easter, analyseRoute, lookahead } from '../web-prototype/src/rules.js';
import { destPoint } from '../web-prototype/src/geo.js';
import { Terrain } from '../web-prototype/src/terrain.js';
globalThis.__T = { Terrain };

test('Pasqua calcolata correttamente', () => {
  assert.deepEqual(easter(2026), { month: 4, day: 5 });
  assert.deepEqual(easter(2027), { month: 3, day: 28 });
});

test('festività nazionali e limite VDS', () => {
  assert.equal(holidayName(new Date(2026, 3, 6)), 'Lunedì dell’Angelo');
  assert.equal(holidayName(new Date(2027, 9, 4)), 'San Francesco d’Assisi');
  assert.equal(holidayName(new Date(2025, 9, 4)), null); // prima della L. 151/2025
  // RAIT Ed. 4 Rev. 4, RAIT.5005 d)2)i: 1000 ft ogni giorno (il 500 ft feriale del DPR 2010 è superato)
  assert.equal(dayInfo('2026-11-06').vdsAgl, 1000);   // venerdì
  assert.equal(dayInfo('2026-11-07').vdsAgl, 1000);   // sabato
  assert.equal(dayInfo('2026-12-08').vdsAgl, 1000);   // Immacolata, martedì
  assert.equal(dayInfo('2026-12-08').why, 'Immacolata');
  // RAIT.5005 d)2)ii: zone VDS esistenti con il massimo a 500 ft
  assert.equal(dayInfo('2026-11-07', 'z500').vdsAgl, 500);
  assert.equal(dayInfo('data sbagliata').vdsAgl, 1000);
});

// Terreno piatto a 2000 ft e una CTR quadrata SFC–3000 ft AMSL tra 13.4 e 13.6 E
const flat = { elevFt: () => 2000, maxWithinFt: () => 2000 };
const ctr = { id: 'c', name: 'CTR PROVA', type: 'CTR', cls: 'D', lower: { value: 0, unit: 'FT', ref: 'GND' }, upper: { value: 3000, unit: 'FT', ref: 'MSL' },
  clipped: [[[13.4, 41.9], [13.6, 41.9], [13.6, 42.1], [13.4, 42.1]]], bbox: { lonMin: 13.4, lonMax: 13.6, latMin: 41.9, latMax: 42.1 } };
const day = dayInfo('2026-11-06');

test('analisi della rotta: CTR attraversata sotto il tetto', () => {
  const r = analyseRoute({ route: [{ lon: 13.2, lat: 42 }, { lon: 13.8, lat: 42 }], cruiseFt: 2500, pilot: 'avanzato', qnh: 1013.25, airspaces: [ctr], terrain: flat, day });
  assert.equal(r.hits.length, 1);
  // la CTR inizia a 0,2° di longitudine dalla partenza: 0,2 × 111,32 × cos 42° = 16,55 km = 8,93 NM
  assert.ok(Math.abs(r.hits[0].from / 1852 - 8.93) < 0.15, `ingresso a ${r.hits[0].from / 1852} NM`);
  assert.equal(r.warnings.find(w => w.kind === 'airspace').need, 'autorizzazione');
});

test('analisi della rotta: sopra il tetto nessun conflitto, ma VDS basico troppo alto', () => {
  const r = analyseRoute({ route: [{ lon: 13.2, lat: 42 }, { lon: 13.8, lat: 42 }], cruiseFt: 3500, pilot: 'basico', qnh: 1013.25, airspaces: [ctr], terrain: flat, day });
  assert.equal(r.hits.length, 0);
  assert.ok(r.warnings.some(w => w.kind === 'vds')); // limite 2000 + 500 = 2500 ft
});

test('ogni avviso lungo la rotta indica dove si trova (per «Mostra» sulla carta e nel profilo)', () => {
  const r = analyseRoute({ route: [{ lon: 13.2, lat: 42 }, { lon: 13.8, lat: 42 }], cruiseFt: 3500, pilot: 'basico', qnh: 1013.25, airspaces: [ctr], terrain: flat, day });
  const vds = r.warnings.find(w => w.kind === 'vds');
  assert.ok(Number.isFinite(vds.at) && vds.at >= 0 && vds.at <= r.total);
  const a = analyseRoute({ route: [{ lon: 13.2, lat: 42 }, { lon: 13.8, lat: 42 }], cruiseFt: 2500, pilot: 'avanzato', qnh: 1013.25, airspaces: [ctr], terrain: flat, day });
  const w = a.warnings.find(x => x.kind === 'airspace');
  assert.equal(w.at, a.hits[0].from);
  // terreno più alto della quota: l'avviso indica il punto peggiore
  const t = analyseRoute({ route: [{ lon: 13.2, lat: 42 }, { lon: 13.8, lat: 42 }], cruiseFt: 1500, pilot: 'avanzato', qnh: 1013.25, airspaces: [], terrain: flat, day });
  assert.ok(Number.isFinite(t.warnings.find(x => x.kind === 'terrain').at));
});

test('previsione in volo: tempo di arrivo alla CTR', () => {
  // 5 NM a ovest del bordo della CTR, rotta 090, 100 kt: arrivo in circa 3 minuti
  const edge = [13.4, 42.0], start = destPoint(edge, 270, 5);
  const r = lookahead({ pos: { lon: start[0], lat: start[1] }, trackDeg: 90, gsKt: 100, altFt: 2500, pilot: 'avanzato', qnh: 1013.25, airspaces: [ctr], terrain: flat, day, stepSec: 5 });
  const e = r.events.find(x => x.kind === 'airspace');
  assert.ok(e, 'conflitto previsto');
  assert.ok(Math.abs(e.t - 180) <= 5, `tempo previsto ${e.t} s`);
});

import { legAltFt } from '../web-prototype/src/rules.js';
test('quota per tratto: ogni tratto usa la quota scritta sul suo punto di partenza', () => {
  const route = [{ lon: 13, lat: 42 }, { lon: 13.2, lat: 42, altFt: 3000 }, { lon: 13.4, lat: 42 }];
  assert.equal(legAltFt(route, 0, 5000), 5000);   // primo punto senza quota: crociera
  assert.equal(legAltFt(route, 1, 5000), 3000);
  // terreno finto: 4000 ft solo nel secondo tratto
  const terrain = { elevFt: lon => (lon > 13.25 && lon < 13.35 ? 4000 : 1000), maxWithinFt: () => 4000 };
  const r = analyseRoute({ route, cruiseFt: 5000, pilot: 'avanzato', qnh: 1013, airspaces: [], terrain, day: { vdsAgl: 500 } });
  assert.ok(r.samples.some(s => s.alt === 3000) && r.samples.some(s => s.alt === 5000));
  const w = r.warnings.find(x => x.kind === 'terrain');
  assert.equal(w.lvl, 'crit');                      // a 3000 ft nel secondo tratto si entra nel terreno a 4000
  assert.match(w.text, /\(3000 ft\)/);
  // con la quota di crociera ovunque, solo margine sotto 500 ft? no: 5000 − 4000 = 1000 ft, nessun avviso sul terreno
  const r2 = analyseRoute({ route: route.map(({ altFt, ...p }) => p), cruiseFt: 5000, pilot: 'avanzato', qnh: 1013, airspaces: [], terrain, day: { vdsAgl: 500 } });
  assert.ok(!r2.warnings.some(x => x.kind === 'terrain'));
});

// ---------------------------------------------------------------- rampe di salita e discesa (profilo verticale)
import { verticalProfile } from '../web-prototype/src/vprofile.js';
import { distM as dM } from '../web-prototype/src/geo.js';
test('rampe: decollo da un campo senza falsi allarmi, ma rilievo sopra la rampa segnalato', () => {
  const route = [{ lon: 13.2, lat: 42 }, { lon: 13.8, lat: 42 }];
  const L = dM(route[0], route[1]);
  const mk = depElev => { const p = verticalProfile({ legs: [{ distM: L, altFt: 6000 }], depElevFt: depElev, arrElevFt: 2000, climb: { rocSlFpm: 500, kt: 65 }, descent: { fpm: 500, kt: 97 } });
    return { altAt: p.altAt, depEnd: p.events.find(e => e.kind === 'TOC').d, arrStart: p.events.filter(e => e.kind === 'TOD').at(-1).d, depField: { name: 'A' }, arrField: { name: 'B' } }; };
  const ok = analyseRoute({ route, cruiseFt: 6000, pilot: 'avanzato', qnh: 1013.25, airspaces: [], terrain: flat, day, profile: mk(2000) });
  assert.ok(!ok.warnings.some(w => w.kind === 'terrain'), JSON.stringify(ok.warnings.map(w => w.title)));
  assert.equal(ok.samples[0].alt, 2000, 'si parte dalla quota del campo');
  assert.ok(Math.abs(ok.samples.at(-1).alt - 3000) <= 1, 'si arriva a quota di circuito');
  // una cresta a 3500 ft tra 2 e 4 km dal campo: con 500 ft/min a 65 kt a 3 km si è a circa 2770 ft
  const ridge = { elevFt: (lon, lat) => { const d = dM(route[0], { lon, lat }); return d > 2000 && d < 4000 ? 3500 : 2000; }, maxWithinFt: () => 3500 };
  const bad = analyseRoute({ route, cruiseFt: 6000, pilot: 'avanzato', qnh: 1013.25, airspaces: [], terrain: ridge, day, profile: mk(2000) });
  const w = bad.warnings.find(x => x.kind === 'terrain');
  assert.equal(w.lvl, 'crit');
  assert.match(w.title, /salita dopo il decollo/);
});

// ---------------------------------------------------------------- nessun tratto dentro le montagne
import { legCorridorMinFt, nodeMinFt, enforceLegClearance, LEG_CLEAR_FT, LEG_CORRIDOR_M } from '../web-prototype/src/rules.js';
test('tratto sopra il punto più alto incontrato: 500 ft sul rilievo entro 600 m, arrotondato ai 100 ft', () => {
  assert.equal(LEG_CLEAR_FT, 500); assert.equal(LEG_CORRIDOR_M, 600);
  // pianura a 2000 ft con una cresta a 5130 ft a metà del tratto A→B (non sui punti)
  const ridge = { maxNearFt: (lon, lat, r) => { assert.equal(r, 600); return Math.abs(lon - 13.5) < 0.004 ? 5130 : 2000; } };
  const route = [{ name: 'A', lon: 13.3, lat: 42 }, { name: 'B', lon: 13.7, lat: 42 }, { name: 'C', lon: 13.9, lat: 42.1 }];
  const m0 = legCorridorMinFt(route, 0, ridge), m1 = legCorridorMinFt(route, 1, ridge);
  assert.equal(m0.minFt, 5700);            // 5130 + 500 = 5630 → 5700
  assert.equal(m0.terrFt, 5130);
  assert.ok(Math.abs(m0.at.lon - 13.5) < 0.005, 'punto più alto a metà del tratto');
  assert.equal(m1.minFt, 2500);
  // nodo B: sopra il minimo del tratto che parte da B e di quello che ci arriva (la discesa sta nel tratto prima)
  assert.equal(nodeMinFt([m0, m1], 1).minFt, 5700);
  assert.equal(nodeMinFt([m0, m1], 0).minFt, 5700);
  assert.equal(nodeMinFt([null, null], 1), null);
  // il programma alza i nodi bassi, mai li abbassa
  route[1].altFt = 9000;
  const ch = enforceLegClearance({ route, cruiseFt: 4500, legMins: [m0, m1] });
  assert.deepEqual(ch.map(c => [c.node, c.fromFt, c.toFt, c.leg, c.terrFt]), [[0, 4500, 5700, 0, 5130]]);
  assert.equal(route[0].altFt, 5700);
  assert.equal(route[1].altFt, 9000, 'un nodo più alto resta');
  assert.deepEqual(enforceLegClearance({ route, cruiseFt: 4500, legMins: [m0, m1] }), [], 'seconda volta: niente da cambiare');
  // terreno non ancora pronto: nessuna modifica
  assert.deepEqual(enforceLegClearance({ route: [{ lon: 13.3, lat: 42 }, { lon: 13.7, lat: 42 }], cruiseFt: 1000, legMins: [null] }), []);
  // senza maxNearFt si usa il terreno sulla linea
  assert.equal(legCorridorMinFt(route, 1, { elevFt: () => 3001 }).minFt, 3600);
});

test('in volo un avviso di terreno «attenzione» non nasconde quello grave più avanti', () => {
  // terreno a 2000 ft che sale a 4000 ft dopo 3 NM verso est; aereo a 2200 ft (200 ft sul terreno)
  const start = [13.0, 42.0];
  const hill = { elevFt: (lon) => (lon > 13.0 + 3 / (60 * Math.cos(42 * Math.PI / 180)) ? 4000 : 2000), maxWithinFt: () => 4000 };
  const r = lookahead({ pos: { lon: start[0], lat: start[1] }, trackDeg: 90, gsKt: 100, altFt: 2200, pilot: 'avanzato', qnh: 1013.25, airspaces: [], terrain: hill, day: dayInfo('2026-11-06'), stepSec: 5 });
  const t = r.events.filter(e => e.kind === 'terrain');
  assert.equal(t.length, 2);
  assert.equal(t[0].lvl, 'warn'); assert.equal(t[0].t, 0);
  assert.equal(t[1].lvl, 'crit'); assert.ok(Math.abs(t[1].distNm - 3) < 0.2);
});

test('la previsione segue la salita o la discesa misurata (variometro)', () => {
  const start = [13.0, 42.0];
  const hill = { elevFt: (lon) => (lon > 13.0 + 3 / (60 * Math.cos(42 * Math.PI / 180)) ? 4000 : 1500), maxWithinFt: () => 4000 };
  const run = vsFpm => lookahead({ pos: { lon: start[0], lat: start[1] }, trackDeg: 90, gsKt: 100, altFt: 2200, pilot: 'avanzato', qnh: 1013.25, airspaces: [], terrain: hill, day: dayInfo('2026-11-06'), stepSec: 5, vsFpm })
    .events.filter(e => e.kind === 'terrain' && e.lvl === 'crit');
  assert.equal(run(0).length, 1);            // livellato: dentro la cresta a 3 NM
  assert.equal(run(2000).length, 0);         // sale a 1500 ft/min (limite prudente): a 3 NM è a 4900 ft
  assert.equal(run(1000).length, 1);         // sale a 750 ft/min utili: a 3 NM è a circa 3550 ft, non basta
  assert.equal(run(50).length, 1);           // rumore del variometro ignorato
});

test('avvicinamento al campo: la discesa non va sotto la quota del campo; l’avviso marginale non nasconde l’ingresso', () => {
  // campo e pianura a 2000 ft; finale a 1000 ft sul campo, 70 kt, −400 ft/min
  const flat2 = { elevFt: () => 2000, maxWithinFt: () => 2000 }, d = dayInfo('2026-11-06');
  const base = { pos: { lon: 13, lat: 42 }, trackDeg: 90, gsKt: 70, altFt: 3000, pilot: 'avanzato', qnh: 1013.25, airspaces: [], terrain: flat2, day: d, stepSec: 5, vsFpm: -400 };
  assert.equal(lookahead({ ...base, floorFt: 2000 }).events.filter(e => e.lvl === 'crit').length, 0);
  // senza il pavimento la discesa è proiettata solo per 1 minuto: 3000 − 400 = 2600 ft, nessun evento grave
  assert.equal(lookahead(base).events.filter(e => e.lvl === 'crit').length, 0);
  // VDS non avanzato a 500 ft sul terreno con 250 ft di incertezza: nessun avviso continuo (soglia 150 ft)
  const vds = lookahead({ ...base, altFt: 2500, vsFpm: 0, pilot: 'basico', uncFt: 250, warnAglFt: 150 }).events.filter(e => e.kind === 'terrain');
  assert.equal(vds.length, 0);
  // CTR con base a 3000 ft: in salita a 300 ft/min da 2600 ft, incertezza 250 ft → prima «vicino», poi «dentro»
  const ctr2 = { ...ctr, lower: { value: 3000, unit: 'FT', ref: 'MSL' }, upper: { value: 6000, unit: 'FT', ref: 'MSL' }, clipped: [[[12.9, 41.9], [13.5, 41.9], [13.5, 42.1], [12.9, 42.1]]], bbox: { lonMin: 12.9, lonMax: 13.5, latMin: 41.9, latMax: 42.1 } };
  const ev = lookahead({ ...base, altFt: 2600, gsKt: 80, vsFpm: 400, pilot: 'basico', airspaces: [ctr2], uncFt: 250, terrain: { elevFt: () => 1000, maxWithinFt: () => 2600 } }).events.filter(e => e.kind === 'airspace');
  assert.equal(ev.length, 2); assert.equal(ev[0].marginal, true); assert.equal(ev[1].marginal, false); assert.equal(ev[1].lvl, 'crit');
});

test('margine dal terreno: conta la vetta entro 150 m dalla rotta (SERA.5005(f))', () => {
  // terreno a 2000 ft con una cima di 3400 ft a 100 m a nord della linea della rotta (a metà del tratto)
  const peak = { lon: 13.5, lat: 42 + 100 / 111200 };
  const elevFt = (lon, lat) => (Math.abs(lon - peak.lon) < 0.0006 && Math.abs(lat - peak.lat) < 0.0006 ? 3400 : 2000);
  const near = { elevFt, maxWithinFt: () => 3400 };
  const { Terrain } = globalThis.__T;
  const T = Object.assign(Object.create(Terrain.prototype), { demo: false, grids: [], elevFt });
  assert.equal(T.maxNearFt(13.5, 42), 3400);              // la cima è entro 150 m
  assert.equal(T.maxNearFt(13.5, 42 - 0.01), 2000);       // a 1,1 km no
  const opts = { route: [{ lon: 13.2, lat: 42 }, { lon: 13.8, lat: 42 }], cruiseFt: 3600, pilot: 'avanzato', qnh: 1013.25, airspaces: [], day };
  const without = analyseRoute({ ...opts, terrain: near });
  const withNear = analyseRoute({ ...opts, terrain: Object.assign(near, { maxNearFt: (lon, lat) => T.maxNearFt(lon, lat) }) });
  const minClr = r => Math.min(...r.samples.map(s => s.alt - s.terr));
  assert.ok(minClr(without) >= 1500, 'sulla sola linea la cima non si vede');
  assert.equal(minClr(withNear), 200, 'con il raggio di 150 m sì');
  assert.ok(withNear.warnings.some(w => w.kind === 'terrain'));
});
