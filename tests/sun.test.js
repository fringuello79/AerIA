// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sunTimes, daylightChecks, localHM } from '../web-prototype/src/sun.js';

// Valori di riferimento calcolati con una libreria indipendente (astral 3, Python), altezza −0,833°:
// Avezzano 42,0306 N 13,4258 E e Roma 41,9 N 12,5 E. Tolleranza 2 minuti.
const REF = [
  ['2026-11-07', 42.0306, 13.4258, '05:46:24', '15:52:56'],
  ['2026-06-21', 42.0306, 13.4258, '03:30:58', '18:45:14'],
  ['2026-12-21', 42.0306, 13.4258, '06:31:15', '15:37:26'],
  ['2026-11-07', 41.9, 12.5, '05:49:50', '15:56:55'],
  ['2026-06-21', 41.9, 12.5, '03:35:08', '18:48:29'],
];
const at = (d, hms) => Date.parse(`${d}T${hms}Z`);

test('sorgere e tramonto entro 2 minuti dal riferimento', () => {
  for (const [d, lat, lon, r, s] of REF) {
    const t = sunTimes(d, lat, lon);
    assert.ok(Math.abs(t.rise - at(d, r)) < 120000, `sorgere ${d} ${lat}`);
    assert.ok(Math.abs(t.set - at(d, s)) < 120000, `tramonto ${d} ${lat}`);
    // VDS: tramonto + 30 min (DPR 133/2010), ma non oltre la fine del crepuscolo civile (SERA, definizione di notte)
    assert.equal(t.dayEnd, Math.min(t.set + 30 * 60000, t.dusk));
    assert.equal(t.dayStart, Math.max(t.rise - 30 * 60000, t.dawn));
  }
});

// Crepuscolo civile (sole a −6°) calcolato con astral 3 (Python), Avezzano. Tolleranza 2 minuti.
const TWI = [['2026-11-07', '05:16:23', '16:22:56'], ['2026-06-21', '02:55:47', '19:20:25'], ['2026-12-21', '05:58:50', '16:09:51'], ['2026-03-20', '04:41:45', '17:46:30']];
test('crepuscolo civile e giorno aeronautico: VDS e aviazione generale', () => {
  for (const [d, dw, dk] of TWI) {
    const v = sunTimes(d, 42.0306, 13.4258, 'basico'), g = sunTimes(d, 42.0306, 13.4258, 'ag');
    assert.ok(Math.abs(g.dawn - at(d, dw)) < 120000, `alba civile ${d}`);
    assert.ok(Math.abs(g.dusk - at(d, dk)) < 120000, `crepuscolo civile ${d}`);
    assert.equal(g.dayEnd, g.dusk);                  // PPL: la notte comincia a fine crepuscolo civile
    assert.ok(v.dayEnd <= g.dayEnd && v.dayStart >= g.dayStart);
  }
  // a giugno il crepuscolo dura più di 30 minuti: per il VDS vale il tramonto + 30
  const giu = sunTimes('2026-06-21', 42.0306, 13.4258, 'basico');
  assert.equal(giu.dayEnd - giu.set, 30 * 60000);
  assert.equal(giu.ruleEnd, 'tramonto + 30 min');
  // all'equinozio finisce prima: vale la fine del crepuscolo civile
  const mar = sunTimes('2026-03-20', 42.0306, 13.4258, 'basico');
  assert.ok(mar.dayEnd - mar.set < 30 * 60000);
  assert.match(mar.ruleEnd, /crepuscolo civile/);
});

test('ora locale italiana con ora solare e legale', () => {
  assert.equal(localHM(at('2026-11-07', '15:53:00')), '16:53'); // CET
  assert.equal(localHM(at('2026-06-21', '18:45:00')), '20:45'); // CEST
});

test('controllo del giorno aeronautico sul piano', () => {
  const dep = { lat: 42.0306, lon: 13.4258, name: 'Avezzano' }, arr = dep;
  // 7/11/2026: tramonto 15:53 UTC, fine del giorno aeronautico 16:23 UTC
  const ok = daylightChecks({ dateStr: '2026-11-07', takeoffMs: at('2026-11-07', '10:00:00'), tripMin: 60, dep, arr, pilot: 'basico' });
  assert.equal(ok.length, 0);
  const late = daylightChecks({ dateStr: '2026-11-07', takeoffMs: at('2026-11-07', '15:40:00'), tripMin: 60, dep, arr, pilot: 'basico' });
  assert.equal(late.length, 1); assert.equal(late[0].lvl, 'crit'); assert.match(late[0].title, /fine del giorno/);
  const ppl = daylightChecks({ dateStr: '2026-11-07', takeoffMs: at('2026-11-07', '15:40:00'), tripMin: 60, dep, arr, pilot: 'ag' });
  assert.equal(ppl[0].lvl, 'warn'); // PPL: serve l'abilitazione notturna, non è un divieto assoluto
  const tight = daylightChecks({ dateStr: '2026-11-07', takeoffMs: at('2026-11-07', '15:00:00'), tripMin: 60, dep, arr, pilot: 'basico', reserveMin: 30 });
  assert.equal(tight.length, 1); assert.equal(tight[0].lvl, 'warn'); assert.match(tight[0].title, /margine/);
  const early = daylightChecks({ dateStr: '2026-11-07', takeoffMs: at('2026-11-07', '05:00:00'), tripMin: 30, dep, arr, pilot: 'basico' });
  assert.match(early[0].title, /Decollo prima/);
});

test('ora locale italiana → UTC, anche nelle notti del cambio d’ora', async () => {
  const { romeToUtcMs } = await import('../web-prototype/src/sun.js');
  const iso = (d, h) => new Date(romeToUtcMs(d, h)).toISOString().slice(0, 16);
  assert.equal(iso('2026-11-07', '16:50'), '2026-11-07T15:50');
  assert.equal(iso('2026-07-01', '12:00'), '2026-07-01T10:00');
  assert.equal(iso('2026-03-29', '01:30'), '2026-03-29T00:30'); // prima del passaggio all'ora legale
  assert.equal(iso('2026-10-25', '01:30'), '2026-10-24T23:30'); // ancora ora legale
  assert.ok(Number.isNaN(romeToUtcMs('2026-01-01', '12:60')));
});
