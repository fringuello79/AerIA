// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rootTiles, childrenOf, selectLod } from '../web-prototype/src/lod.js';

const region = { lonMin: 9.5, lonMax: 16, latMin: 40, latMax: 45 };
const area = b => (b.lonMax - b.lonMin) * (b.latMax - b.latMin);

test('radici: coprono la regione con celle di 1° ritagliate', () => {
  const r = rootTiles(region);
  assert.equal(r.length, 7 * 5);                       // lon 9..15 (7 colonne), lat 40..44 (5 righe)
  assert.ok(Math.abs(r.reduce((s, t) => s + area(t.b), 0) - area(region)) < 1e-9);
  assert.deepEqual(r[0].b, { lonMin: 9.5, lonMax: 10, latMin: 40, latMax: 41 });
});

test('figlie: quattro quarti senza sovrapposizioni', () => {
  const t = rootTiles(region)[10], k = childrenOf(t);
  assert.equal(k.length, 4);
  assert.ok(Math.abs(k.reduce((s, c) => s + area(c.b), 0) - area(t.b)) < 1e-12);
  assert.ok(k.every(c => c.level === 1 && c.key.startsWith(t.key + '.')));
});

// vista vicina ad Avezzano: si divide se il centro della tessera è entro 2 lati dalla vista
const view = { lon: 13.43, lat: 42.03 };
const wantSplit = t => { const b = t.b, cx = (b.lonMin + b.lonMax) / 2, cy = (b.latMin + b.latMax) / 2, s = b.latMax - b.latMin; return Math.hypot(cx - view.lon, cy - view.lat) < 2 * s; };

test('selezione: copertura esatta, dettaglio fine vicino alla vista, nessuna tessera doppia', () => {
  const ready = new Set(), roots = rootTiles(region);
  roots.forEach(r => ready.add(r.key));
  let shown = selectLod(roots, { wantSplit, isReady: t => ready.has(t.key), need: t => ready.add(t.key), maxLevel: 4 });
  // al primo passo le figlie non sono pronte: si vedono le radici
  assert.equal(shown.length, roots.length);
  for (let i = 0; i < 6; i++) shown = selectLod(roots, { wantSplit, isReady: t => ready.has(t.key), need: t => ready.add(t.key), maxLevel: 4 });
  assert.ok(Math.abs(shown.reduce((s, t) => s + area(t.b), 0) - area(region)) < 1e-9, 'copertura esatta');
  assert.equal(new Set(shown.map(t => t.key)).size, shown.length);
  const at = shown.find(t => view.lon >= t.b.lonMin && view.lon < t.b.lonMax && view.lat >= t.b.latMin && view.lat < t.b.latMax);
  assert.equal(at.level, 4, 'livello massimo sotto la vista');
  const far = shown.find(t => 9.7 >= t.b.lonMin && 9.7 < t.b.lonMax && 44.8 >= t.b.latMin && 44.8 < t.b.latMax);
  assert.equal(far.level, 0, 'lontano resta grossolano');
});

test('una figlia mancante tiene la madre intera', () => {
  const roots = rootTiles(region), ready = new Set(roots.map(r => r.key));
  const r = roots.find(t => view.lon >= t.b.lonMin && view.lon < t.b.lonMax && view.lat >= t.b.latMin && view.lat < t.b.latMax);
  childrenOf(r).slice(0, 3).forEach(k => ready.add(k.key));
  const shown = selectLod(roots, { wantSplit, isReady: t => ready.has(t.key), need: () => {}, maxLevel: 4 });
  assert.ok(shown.some(t => t.key === r.key));
  assert.ok(!shown.some(t => t.key.startsWith(r.key + '.')));
});
