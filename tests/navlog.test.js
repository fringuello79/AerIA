// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { windTriangle, tasFromIas, decl, decimalYear, computeNavlog, alternateLeg, fuelPlan, weightBalance, planChecks,
  planToJson, planFromJson, routeToGpx, routeFromGpx, msaForLeg, clock, fmtHM, FORM_ACM, GOLF_ACM, KMH_PER_KT } from '../web-prototype/src/navlog.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} invece di ${b}`);
const D = JSON.parse(readFileSync(new URL('../web-prototype/data/marsica/declination.json', import.meta.url)));

test('triangolo del vento: casi da manuale (computer E6B)', () => {
  let w = windTriangle(90, 100, { dir: 180, kt: 20 });      // vento da destra al traverso
  near(w.wca, 11.537, 0.001); near(w.th, 101.537, 0.001); near(w.gs, 97.98, 0.01);
  w = windTriangle(90, 100, { dir: 90, kt: 20 });           // vento in prua
  near(w.wca, 0, 1e-9); near(w.gs, 80, 1e-9);
  w = windTriangle(90, 100, { dir: 270, kt: 20 });          // vento in coda
  near(w.gs, 120, 1e-9);
  w = windTriangle(360, 90, { dir: 315, kt: 30 });          // da sinistra a 45°
  near(w.wca, -13.633, 0.001); near(w.th, 346.367, 0.001); near(w.gs, 66.251, 0.001);   // 90·cos 13,633° − 30·cos 45°
  assert.ok(Number.isNaN(windTriangle(0, 20, { dir: 90, kt: 30 }).gs), 'traverso più forte della velocità');
});

test('velocità vera: atmosfera standard', () => {
  near(tasFromIas(100, 0), 100, 1e-9);
  near(tasFromIas(100, 5000), 107.73, 0.02);                // σ a 5000 ft = 0,8617
  near(tasFromIas(100, 10000), 116.37, 0.02);               // σ a 10 000 ft = 0,7385
  assert.ok(tasFromIas(100, 5000, 1013.25, 20) > tasFromIas(100, 5000), 'aria più calda: TAS maggiore');
});

test('declinazione magnetica: griglia WMM2025 contro la libreria magvar (indipendente)', () => {
  const y = decimalYear(new Date('2027-03-01T00:00:00Z'));
  for (const [lon, lat, ref] of [[13, 41.6, 4.17], [13.55778, 42.05167, 4.29], [14, 42.6, 4.41], [13.6, 41.85, 4.28], [13.2, 42.3, 4.25]]) {
    near(decl(D, lon, lat, y), ref, 0.02, `${lon},${lat}`);
  }
});

test('orari', () => {
  assert.equal(clock('09:30', 45), '10:15'); assert.equal(clock('23:50', 20), '00:10'); assert.equal(clock('', 5), '');
  assert.equal(fmtHM(75), '1:15'); assert.equal(fmtHM(59.6), '1:00');
});

const ac = { ...FORM_ACM, iasKt: 90, fuelFlowLh: 18, emptyKg: 330, fuelDensity: 0.72 };
const route = [{ lon: 13.55778, lat: 42.05167, name: 'CELANO' }, { lon: 13.309, lat: 42.379, name: 'LIAP' }];

test('log di navigazione: Celano → L’Aquila Preturo senza vento', () => {
  const plan = { route, aircraft: ac, cruiseFt: 4500, qnh: 1013.25, toTime: '10:00', legs: [] };
  const n = computeNavlog(plan, { decl: () => 4.3 });
  const l = n.legs[0];
  near(l.distKm, 41.76, 0.03, 'distanza');               // geodetica WGS84 (pyproj): 41,761 km
  near(l.tcT, 330.6, 0.3, 'rotta vera');                  // pyproj: 330,6°
  near(l.tcM, l.tcT - 4.3, 1e-9, 'rotta magnetica = vera − declinazione est');
  near(l.tasKt, tasFromIas(90, 4500), 1e-9);
  near(l.timeMin, l.distKm / 1.852 / l.tasKt * 60, 1e-9);
  assert.equal(l.eto, clock('10:00', l.timeMin));
  near(l.fuelL, l.timeMin / 60 * 18, 1e-9);
});

test('log di navigazione: vento per tratto inserito a mano ha la precedenza', () => {
  const plan = { route, aircraft: ac, cruiseFt: 4500, qnh: 1013.25, toTime: '10:00', legs: [{ windDir: 330, windKt: 20 }] };
  const n = computeNavlog(plan, { decl: () => 4.3, windAt: () => ({ dir: 150, kt: 20, src: 'modello' }) });
  assert.equal(n.legs[0].wind.src, 'manuale');
  assert.ok(n.legs[0].gsKt < n.legs[0].tasKt - 19, 'vento quasi in prua');
});

test('carburante: somme e autonomia', () => {
  const f = fuelPlan({ tripFuelL: 12, tripMin: 40, altFuelL: 6, altMin: 20, reserveMin: 30, extraL: 10, fuelFlowLh: 18, density: 0.72 });
  near(f.rve.L, 9, 1e-9); near(f.min.L, 27, 1e-9); near(f.tof.L, 37, 1e-9); near(f.tof.kg, 26.64, 1e-9);
  near(f.min.min, 90, 1e-9); near(f.enduranceMin, 37 / 18 * 60, 1e-9);
});

test('peso e centraggio con i bracci del modulo', () => {
  const wb = weightBalance(ac, { pilotKg: 80, copilotKg: 75, luggageKg: 10, fuelL: 60 }, 20);
  // a mano: 330·0,30 + 80·0,52 + 75·0,52 + 43,2·0,21 + 10·1,09 = 99 + 41,6 + 39 + 9,072 + 10,9 = 199,572 kg·m su 538,2 kg
  near(wb.to.kg, 538.2, 1e-9); near(wb.to.moment, 199.572, 1e-9); near(wb.to.cg, 0.37081, 1e-5);
  near(wb.ldg.kg, 538.2 - 14.4, 1e-9);
  assert.equal(wb.issues.length, 0);
  const heavy = weightBalance(ac, { pilotKg: 110, copilotKg: 110, luggageKg: 20, fuelL: 60 });
  assert.ok(heavy.issues.some(i => /oltre il massimo/.test(i.title)));
  const aft = weightBalance(ac, { pilotKg: 60, copilotKg: 0, luggageKg: 100, fuelL: 10 });
  assert.ok(aft.issues.some(i => /Baricentro fuori limiti al decollo/.test(i.title)), JSON.stringify(aft.to));
  assert.ok(weightBalance({ ...ac, emptyKg: null }, {}).issues.some(i => /Peso a vuoto mancante/.test(i.title)));
});

test('controlli: carburante a bordo insufficiente', () => {
  const plan = { route, aircraft: ac, cruiseFt: 4500, qnh: 1013.25, toTime: '10:00', legs: [] };
  const nav = computeNavlog(plan, {});
  const fuel = fuelPlan({ tripFuelL: nav.tripFuelL, tripMin: nav.totalMin, fuelFlowLh: 18 });
  const wb = weightBalance(ac, { pilotKg: 80, fuelL: 5 });
  assert.ok(planChecks({ fuel, wb, fuelOnBoardL: 5, nav }).some(w => w.title === 'Carburante insufficiente'));
  assert.ok(!planChecks({ fuel, wb, fuelOnBoardL: 40, nav }).some(w => w.title === 'Carburante insufficiente'));
});

test('alternato: tratto dalla destinazione', () => {
  const plan = { route, aircraft: ac, cruiseFt: 4500, qnh: 1013.25, toTime: '10:00', legs: [], alternate: { lon: 13.51806, lat: 42.30083, name: 'AVIOSUPERFICIE L AQUILA' } };
  const a = alternateLeg(plan, {});
  assert.equal(a.to, 'AVIOSUPERFICIE L AQUILA');
  near(a.distKm, 19.29, 0.02);                            // pyproj: 19,293 km
});

test('salvataggio e GPX: andata e ritorno', () => {
  const plan = { route, aircraft: ac, cruiseFt: 4500 };
  assert.deepEqual(planFromJson(planToJson(plan)), plan);
  assert.throws(() => planFromJson('{"a":1}'));
  const g = routeToGpx([...route, { lon: 13.5, lat: 42.2, name: 'A & B <C>' }]);
  const back = routeFromGpx(g);
  assert.equal(back.length, 3); assert.equal(back[2].name, 'A & B <C>'); near(back[1].lat, 42.379, 1e-6);
  // GPX con soli waypoint, come quelli di molti programmi
  const w = routeFromGpx('<gpx><wpt lat="42.0" lon="13.0"><name>X</name></wpt><wpt lat="42.1" lon="13.1"/></gpx>');
  assert.deepEqual(w.map(p => p.name), ['X', 'P2']);
});

test('quota minima di sicurezza: campionamento fitto trova la cima', () => {
  // terreno finto: un picco stretto (2000 ft) a 3 km dalla rotta, altrove 0
  const peak = { lon: 13.5, lat: 42.03 };
  const terrain = { elevFt: (lon, lat) => (Math.abs(lon - peak.lon) < 0.004 && Math.abs(lat - peak.lat) < 0.003 ? 2000 : 0) };
  near(msaForLeg(terrain, { lon: 13.4, lat: 42.0 }, { lon: 13.6, lat: 42.0 }), 3000, 0);
});

// Piano compilato a mano dall'Aeroclub dei Marsi: AQ01 → BO09, 12/04/2024, P2002 Sierra
test('modulo compilato AQ01 → BO09: carburante e autonomia coincidono', () => {
  const f = fuelPlan({ tripFuelL: 45, tripMin: 111, altFuelL: 10, altMin: NaN, reserveL: 10, extraL: 15, fuelFlowLh: FORM_ACM.fuelFlowLh, density: FORM_ACM.fuelDensity });
  near(f.min.L, 65, 1e-9);                    // modulo: MIN FUEL 65
  near(f.tof.L, 80, 1e-9);                    // modulo: T.O.F. 80
  near(f.tof.kg, 62.4, 1e-9);                 // modulo: 62,4 kg (densità 0,78)
  assert.equal(fmtHM(f.enduranceMin), '4:06'); // modulo: 04 h 06′
});

test('modulo compilato AQ01 → BO09: peso e centraggio', () => {
  const wb = weightBalance(FORM_ACM, { pilotKg: 75, copilotKg: 70, luggageKg: 10, fuelL: 80 });
  // momenti del modulo: 111; 39; 36,4; 13,10; 11
  assert.deepEqual(wb.items.map(i => Math.round(i.moment * 10) / 10), [111, 39, 36.4, 13.1, 10.9]);
  near(wb.to.cg, 0.358, 0.001);               // modulo: C.G. 0,36 ✓
  // il modulo riporta T.O.W. 593,50 kg; la somma delle voci scritte (370 + 75 + 70 + 62,4 + 10) dà 587,4 kg
  near(wb.to.kg, 587.4, 1e-9);
  assert.equal(wb.issues.length, 0);
});

test('modulo compilato AQ01 → BO09: tempi dei tratti senza vento con IAS = velocità al suolo', () => {
  // distanze (km) e velocità (km/h) del modulo; il modulo non applica vento né correzione IAS → TAS
  const legs = [[25, 120], [57.5, 180], [10, 180], [65, 180], [16.5, 180], [37.5, 180], [20, 180], [42.5, 180], [50, 180]];
  const min = legs.map(([d, v]) => d / v * 60);
  assert.deepEqual(min.map(Math.round), [13, 19, 3, 22, 6, 13, 7, 14, 17]); // modulo: 13 19 3 22 6 13 6 14 16
  near(min.reduce((a, b) => a + b), 112.17, 0.01);                            // 1:52; modulo: T.T. 1:51
});

test('profili di riferimento: Sierra completo, Golf da completare', () => {
  near(FORM_ACM.iasKt * KMH_PER_KT, 180, 1e-9);
  assert.equal(weightBalance(GOLF_ACM, { pilotKg: 80 }).issues[0].title, 'Dati di peso e centraggio mancanti');
});

// ---------------------------------------------------------------- dati dei manuali e vento sulla pista (6/11/2026)
import { runwayWind, crosswindChecks, FORM_ACM as SIERRA } from "../web-prototype/src/navlog.js";

test('profili: limiti del baricentro coerenti con i manuali (linea del bordo d’attacco)', () => {
  // Sierra: manuale 1,611 – 1,789 m dalla flangia, linea di riferimento a 1,337 m → 0,274 – 0,452 m; il modulo (0,282 – 0,451) sta dentro
  assert.ok(SIERRA.cgMinM >= 1.611 - 1.337 - 1e-9 && SIERRA.cgMaxM <= 1.789 - 1.337 + 1e-9);
  // Golf: 22 – 25 % di 1,4 m
  assert.ok(Math.abs(GOLF_ACM.cgMinM - 0.22 * 1.4) < 1e-9 && Math.abs(GOLF_ACM.cgMaxM - 0.25 * 1.4) < 1e-9);
  // salita del Golf: 4,5 m/s e 1,6 m/s a 0 e 3000 m
  assert.ok(Math.abs(GOLF_ACM.climb.rocSlFpm - 4.5 * 196.85) < 0.1 && Math.abs(GOLF_ACM.climb.rocHiFpm - 1.6 * 196.85) < 0.1);
  assert.ok(Math.abs(GOLF_ACM.climb.hiFt - 3000 / 0.3048) < 0.1);
  // consumo del Sierra dal modulo (19,5 l/h) tra i valori del manuale al 70 % e al 75 %
  assert.ok(SIERRA.fuelFlowLh >= 19.1 && SIERRA.fuelFlowLh <= 20.4);
});

test('vento sulla pista: componenti come nel diagramma dei manuali Tecnam (30°, 20 kt → 17,3 e 10 kt)', () => {
  // esempio dei manuali: vento a 30° dall'asse, 20 kt → contrario 17,5 kt (letto sul grafico), traverso 10 kt
  const r = runwayWind(30 + 220, 20, [{ des: '22', trueHdg: 220 }, { des: '04', trueHdg: 40 }]);
  assert.equal(r.best.des, '22');
  assert.ok(Math.abs(r.best.head - 17.32) < 0.01 && Math.abs(r.best.cross - 10) < 0.01);
  assert.equal(r.best.side, 'da destra');
  assert.equal(r.list.find(x => x.des === '04').head < 0, true);
  assert.deepEqual(crosswindChecks('arrivo', r, 15), []);
  const strong = runwayWind(310, 25, [{ des: '22', trueHdg: 220 }, { des: '04', trueHdg: 40 }]);   // vento a 90°
  assert.equal(crosswindChecks('arrivo', strong, 15)[0].lvl, 'crit');
  assert.equal(runwayWind(NaN, 10, [{ des: '22', trueHdg: 220 }]), null);
});
