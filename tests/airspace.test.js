// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAlt, limitFt, fromGeojson, fromOpenAir, entryRule, category, contactInfo } from '../web-prototype/src/airspace.js';
import { bearingDist } from '../web-prototype/src/geo.js';

test('lettura dei limiti OpenAir', () => {
  assert.deepEqual(parseAlt('GND'), { value: 0, unit: 'FT', ref: 'GND' });
  assert.deepEqual(parseAlt('FL 85'), { value: 85, unit: 'FL', ref: 'STD' });
  assert.deepEqual(parseAlt('2500ft AMSL'), { value: 2500, unit: 'FT', ref: 'MSL' });
  assert.deepEqual(parseAlt('1000 ft AGL'), { value: 1000, unit: 'FT', ref: 'GND' });
  assert.deepEqual(parseAlt('300 M AGL'), { value: 300, unit: 'M', ref: 'GND' });
});

test('conversione dei limiti in ft AMSL', () => {
  assert.equal(limitFt({ value: 1500, unit: 'FT', ref: 'GND' }, 2300), 3800);
  assert.equal(limitFt({ value: 4500, unit: 'FT', ref: 'MSL' }, 2300), 4500);
  assert.equal(limitFt({ value: 105, unit: 'FL', ref: 'STD' }, 0, 1013.25), 10500);
  assert.equal(limitFt({ value: 105, unit: 'FL', ref: 'STD' }, 0, 1023.25), 10770); // +10 hPa = +270 ft
  assert.ok(Math.abs(limitFt({ value: 1500, unit: 'M', ref: 'GND' }, 0) - 4921.26) < 0.01);
});

test('codici numerici openAIP verificati sul file italiano', () => {
  const f = (type, icaoClass, name) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[13, 42], [13.1, 42], [13.1, 42.1], [13, 42]]] },
    properties: { name, type, icaoClass, lowerLimit: { value: 0, unit: 1, referenceDatum: 0 }, upperLimit: { value: 95, unit: 6, referenceDatum: 2 } } });
  const list = fromGeojson({ features: [f(4, 3, 'PESCARA CTR Z1'), f(3, 8, 'LI-P80-AVEZZANO'), f(7, 0, 'TMA ROMA Z11'), f(29, 8, 'MONTE VELINO(PARK)'), f(13, 6, "ATZ L'AQUILA")] }, 'test');
  assert.deepEqual(list.map(a => [a.type, a.cls]), [['CTR', 'D'], ['P', ''], ['TMA', 'A'], ['OFR', ''], ['ATZ', 'G']]);
  assert.deepEqual(list.map(category), ['CTRL', 'P', 'CTRL', 'PARK', 'CTRL']);
  assert.deepEqual(list[0].upper, { value: 95, unit: 'FL', ref: 'STD' });
});

test('cerchio OpenAir di 4 NM', () => {
  const [a] = fromOpenAir('AC D\nAN TEST CTR\nAL GND\nAH 2500ft AMSL\nV X=42:03:00 N 013:25:00 E\nDC 4\n', 'test');
  const c = [13 + 25 / 60, 42.05];
  for (const p of a.rings[0]) assert.ok(Math.abs(bearingDist(c, p).nm - 4) < 0.001);
});

test('regole di ingresso per tipo di pilota', () => {
  const ctr = { type: 'CTR', cls: 'D' };
  assert.equal(entryRule(ctr, 'basico').need, 'vietato');
  assert.equal(entryRule(ctr, 'avanzato').need, 'autorizzazione');
  assert.equal(entryRule({ type: 'P', cls: '' }, 'ag').need, 'vietato');
  assert.equal(entryRule({ type: 'TMZ', cls: '' }, 'ag').need, 'transponder');
});

test('nessuna frequenza inventata', () => {
  assert.equal(contactInfo({ freqs: [] }).freq, '');
  assert.equal(contactInfo({ freqs: [{ value: '119.350', name: 'FROSINONE TWR', primary: true }] }).freq, '119.350');
});
