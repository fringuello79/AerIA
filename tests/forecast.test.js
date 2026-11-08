// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromCompact, parseOpenMeteo, columnAt, windAtAlt, windComponents, forecastWarnings, forecastGrid, forecastUrl, nearestPoint, LEVELS, VARS } from '../web-prototype/src/forecast.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/icon2i-2026-11-06T09.json', import.meta.url)));
const fc = fromCompact(fx);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} invece di ${b}`);

test('richiesta: griglia 11×11 sull’area e tutte le variabili', () => {
  const g = forecastGrid({ lonMin: 13, lonMax: 14, latMin: 41.6, latMax: 42.6 });
  assert.equal(g.pts.length, 121);
  assert.deepEqual(g.pts[0], { lon: 13, lat: 41.6 });
  assert.deepEqual(g.pts[120], { lon: 14, lat: 42.6 });
  const u = forecastUrl(g);
  assert.match(u, /models=italia_meteo_arpae_icon_2i/);
  assert.match(u, /wind_speed_unit=kn/);
  assert.equal(VARS.length, 11 + LEVELS.length * 6);
});

test('lettura della risposta Open-Meteo (un oggetto per punto)', () => {
  const arr = fx.lat.map((lat, i) => ({ latitude: lat, longitude: fx.lon[i], elevation: fx.elev[i],
    hourly: Object.fromEntries([['time', [fx.time]], ...VARS.map(k => [k, [fx.v[k][i]]])]) }));
  const p = parseOpenMeteo(arr);
  assert.equal(p.times[0], Date.parse('2026-11-06T09:00Z'));
  assert.equal(p.v.precipitation[0][1], 1.6);
  assert.equal(p.pts[8].elevM, 1324);
});

test('livelli sotto il terreno scartati (valori attesi calcolati a parte in Python)', () => {
  // Nel campione il livello 1000 hPa è sotto il terreno in 34 punti su 36, 925 hPa in 17, 850 hPa in 4
  const count = l => fc.pts.filter((_, i) => !columnAt(fc, i, 0).levels.some(x => x.hPa === l)).length;
  assert.equal(count(1000), 34); assert.equal(count(925), 17); assert.equal(count(850), 4); assert.equal(count(700), 0);
  const c = columnAt(fc, 8, 0);                 // 41,8 N 13,4 E, terreno 1324 m
  assert.deepEqual(c.levels.map(l => l.hPa), [850, 700, 500]);
  assert.equal(c.levels[0].botM, 1324);          // il primo strato parte dal suolo
  assert.equal(c.levels[0].topM, 2316.5);
  assert.equal(c.levels[1].topM, 4413);
  assert.equal(c.levels[1].cloud, 100);
});

test('vento in quota: interpolazione delle componenti', () => {
  const c = columnAt(fc, 8, 0);
  const w = windAtAlt(c, 6000);
  near(w.kt, 7.162, 0.01, 'velocità'); near(w.dir, 183.54, 0.05, 'direzione');
  const at850 = windAtAlt(c, 1528 * 3.28084);
  near(at850.kt, 4.9, 0.01); near(at850.dir, 166, 0.01);
  // venti opposti uguali si annullano a metà strada: la media delle direzioni sarebbe sbagliata
  const opp = { elevM: 0, wind10: { kt: 10, dir: 90 }, levels: [{ zM: 1000, kt: 10, dir: 270 }] };
  near(windAtAlt(opp, (10 + 1000) / 2 * 3.28084).kt, 0, 1e-9);
});

test('componenti del vento rispetto alla rotta', () => {
  const h = windComponents(90, { kt: 20, dir: 90 });
  near(h.head, 20, 1e-9); near(h.cross, 0, 1e-9);
  const x = windComponents(90, { kt: 20, dir: 180 });      // vento da destra
  near(x.head, 0, 1e-9); near(x.cross, 20, 1e-9);
  near(windComponents(0, { kt: 15, dir: 180 }).tail, 15, 1e-9);
});

test('avvisi sulla rotta con il campione reale', () => {
  // Frosinone nord → Sora: zona con pioggia prevista fino a 1,9 mm/h
  const route = [{ lon: 13.2, lat: 41.65 }, { lon: 13.4, lat: 41.8 }];
  const w = forecastWarnings({ fc, ti: 0, route, cruiseFt: 6000 });
  const rain = w.find(x => x.title === 'Pioggia prevista sulla rotta');
  assert.ok(rain, JSON.stringify(w));
  assert.match(rain.text, /1,9 mm/);
  // a 6000 ft (1829 m) lo strato 850 hPa del punto 41,8/13,4 ha nubi 70 %
  assert.ok(w.some(x => x.title === 'Nubi previste alla tua quota'));
  assert.ok(!w.some(x => /convezione/.test(x.title)), 'CAPE nullo nel campione');
  // a 3000 ft sopra il Fucino nord-est: niente pioggia nel campione
  const w2 = forecastWarnings({ fc, ti: 0, route: [{ lon: 13.6, lat: 42.2 }, { lon: 14.0, lat: 42.2 }], cruiseFt: 5000 });
  assert.ok(!w2.some(x => /Pioggia/.test(x.title)), JSON.stringify(w2));
  assert.equal(nearestPoint(fc, 13.41, 41.79).i, 8);
});
