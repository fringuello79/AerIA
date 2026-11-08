// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmForward, sampleRadar, radarWarnings, rainColor, dbzColor } from '../web-prototype/src/radar.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/radar-2026-11-06T1340.json', import.meta.url)));
const T = Date.parse('2026-11-06T13:40:00Z');
const sri = { ...fx.products.SRI, time: T }, cappi = { ...fx.products.CAPPI_2, time: T };

test('proiezione del radar: confronto con pyproj su tutta l’Italia (scarto < 0,5 m)', () => {
  for (const [lon, lat, x, y] of fx.projectionRef) {
    const p = tmForward(lon, lat);
    assert.ok(Math.abs(p.x - x) < 0.5 && Math.abs(p.y - y) < 0.5, `${lon},${lat}: ${p.x.toFixed(3)},${p.y.toFixed(3)} invece di ${x},${y}`);
  }
});

test('lettura dei valori e dei codici speciali', () => {
  assert.deepEqual(sampleRadar(sri, 13.43, 42.03), { v: 0, code: 'ok' });            // Avezzano: niente pioggia (rasterio: 0,0)
  assert.equal(sampleRadar(cappi, 13.43, 42.03).code, 'nessun eco');                  // rasterio: −9998
  assert.equal(sampleRadar(sri, 10, 40).code, 'fuori');
  // il massimo di pioggia del ritaglio, cercato a parte, si ritrova dalle sue coordinate
  const i = sri.data.indexOf(Math.max(...sri.data)), r = Math.floor(i / sri.w), c = i % sri.w;
  assert.equal(sri.data[i], 19.2);
  assert.equal(r * sri.w + c, i);
});

test('colori: nulla sotto le soglie', () => {
  assert.equal(rainColor(0), null); assert.equal(rainColor(0.1), null); assert.ok(rainColor(5));
  assert.equal(dbzColor(10), null); assert.ok(dbzColor(50));
});

test('avvisi sulla rotta con il radar reale', () => {
  // cella con la pioggia più forte del ritaglio: si ricava il centro in coordinate TM e si cerca il punto geografico
  const i = sri.data.indexOf(Math.max(...sri.data)), r = Math.floor(i / sri.w), c = i % sri.w;
  const xc = sri.x0 + (c + 0.5) * sri.dx, yc = sri.y0 + (r + 0.5) * sri.dy;
  let best = null;
  for (let lon = 13; lon <= 14; lon += 0.002) for (let lat = 41.6; lat <= 42.6; lat += 0.002) {
    const p = tmForward(lon, lat), d = Math.hypot(p.x - xc, p.y - yc);
    if (!best || d < best.d) best = { lon, lat, d };
  }
  assert.ok(best.d < 200, String(best.d));
  const route = [{ lon: best.lon - 0.05, lat: best.lat }, { lon: best.lon + 0.05, lat: best.lat }];
  const w = radarWarnings({ route, sri, cappi, now: T + 10 * 60000 });
  const crit = w.find(x => x.title === 'Pioggia intensa in atto sulla rotta');
  assert.ok(crit, JSON.stringify(w));
  assert.match(crit.text, /19,2 mm\/h/);
  assert.match(crit.text, /10 min fa/);
  // Avezzano → Celano: niente pioggia nel ritaglio
  const dry = radarWarnings({ route: [{ lon: 13.43, lat: 42.03 }, { lon: 13.55, lat: 42.05 }], sri, cappi, now: T });
  assert.ok(!dry.some(x => /Pioggia/.test(x.title)), JSON.stringify(dry));
  // dato vecchio segnalato
  assert.match(radarWarnings({ route, sri, cappi, now: T + 45 * 60000 })[0].text, /vecchio/);
});
