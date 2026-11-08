// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { distM, destPoint, bearingDist, pointInRing, clipRing, bearingDeg, cardinal } from '../web-prototype/src/geo.js';

test('un grado di latitudine a 42-43° N vale 111,08 km (geodetica WGS84 con pyproj: 111 083 m)', () => {
  // il vecchio test fissava 110 540 m, il valore all'equatore: era sbagliato dello 0,5 % e l'errore era nel codice
  assert.ok(Math.abs(distM({ lon: 13, lat: 42 }, { lon: 13, lat: 43 }) - 111083) < 30);
});

test('destPoint e bearingDist sono inversi', () => {
  const c = [13.43, 42.03], p = destPoint(c, 135, 10);
  const r = bearingDist(c, p);
  assert.ok(Math.abs(r.brg - 135) < 0.01, `rotta ${r.brg}`);
  assert.ok(Math.abs(r.nm - 10) < 0.001, `distanza ${r.nm}`);
});

test('rotta vera verso est = 90°', () => {
  assert.ok(Math.abs(bearingDeg({ lon: 13, lat: 42 }, { lon: 13.5, lat: 42 }) - 90) < 0.01);
  assert.equal(cardinal(90), 'est');
  assert.equal(cardinal(350), 'nord');
});

test('punto dentro e fuori da un quadrato', () => {
  const sq = [[13, 42], [14, 42], [14, 43], [13, 43], [13, 42]];
  assert.equal(pointInRing([13.5, 42.5], sq), true);
  assert.equal(pointInRing([14.5, 42.5], sq), false);
});

test('ritaglio di un poligono sul rettangolo dell area', () => {
  const big = [[12, 41], [15, 41], [15, 44], [12, 44], [12, 41]];
  const c = clipRing(big, { lonMin: 13, lonMax: 14, latMin: 42, latMax: 43 });
  const xs = c.map(p => p[0]), ys = c.map(p => p[1]);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [13, 14, 42, 43]);
  assert.deepEqual(clipRing([[20, 20], [21, 20], [21, 21]], { lonMin: 13, lonMax: 14, latMin: 42, latMax: 43 }), []);
});

import { distM as _distM, bearingDeg as _brg } from '../web-prototype/src/geo.js';
test('distanze e rotte contro la geodetica WGS84 (pyproj, Karney): scarto sotto lo 0,05 %', () => {
  // valori calcolati a parte con pyproj.Geod(ellps="WGS84").inv
  for (const [a, b, d, az] of [[[13.55778, 42.05167], [13.309, 42.379], 41760.56, 330.618], [[13.309, 42.379], [13.51806, 42.30083], 19292.75, 116.678],
    [[13.0, 42.0], [14.0, 42.0], 82850.29, 89.665], [[13.43, 42.03], [13.55, 42.05], 10181.17, 77.357]]) {
    const A = { lon: a[0], lat: a[1] }, B = { lon: b[0], lat: b[1] };
    assert.ok(Math.abs(_distM(A, B) - d) / d < 5e-4, `distanza ${_distM(A, B)} invece di ${d}`);
    assert.ok(Math.abs(_brg(A, B) - az) < 0.4, `rotta ${_brg(A, B)} invece di ${az}`);
  }
});
