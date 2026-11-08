// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { geoidN } from '../web-prototype/src/geoid.js';

const g = JSON.parse(readFileSync(new URL('../web-prototype/data/marsica/geoid.json', import.meta.url)));

// Valori di riferimento calcolati con un'implementazione indipendente da quella che ha creato la griglia:
// egm96-universal 1.1.1 (griglia EGM96 15' dell'NGA, verificata dall'autore contro il programma Fortran ufficiale).
const REF = [
  [41.6, 13, 48.722],
  [41.6, 13.25, 49.076],
  [41.6, 13.5, 49.294],
  [41.6, 13.75, 49.300],
  [41.6, 14, 49.052],
  [41.85, 13, 49.108],
  [41.85, 13.25, 49.522],
  [41.85, 13.5, 49.694],
  [41.85, 13.75, 49.490],
  [41.85, 14, 48.932],
  [42.1, 13, 49.340],
  [42.1, 13.25, 49.548],
  [42.1, 13.5, 49.376],
  [42.1, 13.75, 48.748],
  [42.1, 14, 47.832],
  [42.35, 13, 49.300],
  [42.35, 13.25, 49.084],
  [42.35, 13.5, 48.378],
  [42.35, 13.75, 47.270],
  [42.35, 14, 46.086],
  [42.6, 13, 48.854],
  [42.6, 13.25, 48.208],
  [42.6, 13.5, 47.082],
  [42.6, 13.75, 45.694],
  [42.6, 14, 44.466]
];

test('geoide: griglia del pacchetto contro implementazione indipendente (scarto < 0,2 m)', () => {
  let max = 0;
  for (const [lat, lon, n] of REF) max = Math.max(max, Math.abs(geoidN(g, lon, lat) - n));
  assert.ok(max < 0.2, `scarto massimo ${max.toFixed(3)} m`);
});

test('geoide: fuori dalla griglia non si inventa nulla', () => {
  assert.ok(Number.isNaN(geoidN(g, 12.9, 42)));
  assert.ok(Number.isNaN(geoidN(null, 13.5, 42)));
});

test('geoide: in Marsica la quota GPS non corretta è alta di circa 150-165 ft', () => {
  const nFt = geoidN(g, 13.43, 42.03) * 3.28084;
  assert.ok(nFt > 150 && nFt < 165, String(nFt));
});
