// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNmea, parseGdl90 } from '../web-prototype/src/devices.js';
import { ingestFlarm, ingestGdl90, pruneTraffic, trafficList, trafficAlarm, trafficText, clockOf, offsetLatLon } from '../web-prototype/src/traffic.js';

const cs = s => { let x = 0; for (const ch of s) x ^= ch.charCodeAt(0); return `$${s}*${x.toString(16).toUpperCase().padStart(2, '0')}`; };

test('FLARM: frasi PFLAA e PFLAU', () => {
  const a = parseNmea(cs('PFLAA,2,-1000,500,90,1,DDA85C,45,,30,-1.5,1'));
  assert.equal(a.type, 'PFLAA'); assert.equal(a.alarm, 2); assert.equal(a.northM, -1000); assert.equal(a.eastM, 500);
  assert.equal(a.vertM, 90); assert.equal(a.id, 'DDA85C'); assert.equal(a.gsMs, 30); assert.equal(a.noBearing, false);
  const nb = parseNmea(cs('PFLAA,0,1500,,-60,1,3D1234,,,,,9'));
  assert.equal(nb.noBearing, true);
  const u = parseNmea(cs('PFLAU,3,1,2,1,2,-30,2,-46,355,DDA85C'));
  assert.equal(u.alarm, 2); assert.equal(u.relBrg, -30); assert.equal(u.distM, 355); assert.equal(u.vertM, -46);
  assert.equal(parseNmea(cs('PFLAA,2,-1000,500,90,1,DDA85C,45,,30,-1.5,1').replace(/\*..$/, '*00')), null);
});

test('FLARM: posizione, quota relativa, ore dell\'orologio', () => {
  const own = { lat: 42, lon: 13.5, altFt: 3000, trk: 90 }, store = new Map();
  ingestFlarm(store, parseNmea(cs('PFLAA,2,0,1000,100,1,AAA111,270,,40,0,1')), own, 1000);
  const [t] = trafficList(store, own);
  assert.ok(Math.abs(t.distM - 1000) < 5);
  assert.ok(Math.abs(t.relAltFt - 328.084) < 0.01);
  assert.equal(clockOf(t.relBrg), 12, 'traffico a est con traccia 090: davanti');
  assert.equal(trafficText(t), 'Traffico a ore 12, 1000 metri, 300 piedi sopra');
  assert.equal(trafficText({ relBrg: 60, distM: 3000, relAltFt: -80 }, true), 'Traffico a ore due, 1,6 miglia, stessa quota');
  assert.equal(clockOf(-90), 9); assert.equal(clockOf(175), 6);
  assert.equal(trafficAlarm(trafficList(store, own)).id, 'AAA111');
  pruneTraffic(store, 14000); assert.equal(store.size, 0);
  const p = offsetLatLon({ lat: 42, lon: 13 }, 1852, 0); assert.ok(Math.abs(p.lat - 42 - 1852 / 111320) < 1e-12);
});

test('filtro di quota: fuori fascia nascosto, salvo allarme', () => {
  const own = { lat: 42, lon: 13.5, altFt: 3000, trk: 0 }, store = new Map();
  ingestFlarm(store, parseNmea(cs('PFLAA,0,2000,0,1000,1,B1,0,,40,0,1')), own, 0);   // 3280 ft sopra
  ingestFlarm(store, parseNmea(cs('PFLAA,3,500,0,700,1,B2,0,,40,0,1')), own, 0);     // allarme: sempre visibile
  assert.deepEqual(trafficList(store, own, 2000).map(t => t.id), ['B2']);
  assert.equal(trafficList(store, own).length, 2);
});

test('GDL90: messaggio di traffico (20) letto come quello del proprio aereo', () => {
  const m = new Uint8Array(28);
  m[0] = 20; m[1] = 0x10; m[2] = 0xAB; m[3] = 0xCD; m[4] = 0xEF;
  const lat = Math.round(42.1 / 180 * 0x800000), lon = Math.round(13.5 / 180 * 0x800000);
  [m[5], m[6], m[7]] = [(lat >> 16) & 255, (lat >> 8) & 255, lat & 255];
  [m[8], m[9], m[10]] = [(lon >> 16) & 255, (lon >> 8) & 255, lon & 255];
  const alt = (4500 + 1000) / 25; m[11] = alt >> 4; m[12] = ((alt & 15) << 4) | 0x01; // traccia vera valida
  m[14] = 100 >> 4; m[15] = ((100 & 15) << 4) | 0x0f; m[16] = 0xff;  // 100 kt, variometro -1 (−64 ft/min)
  m[17] = 64; m.set([...'I-ABCD  '].map(c => c.charCodeAt(0)), 19);
  const t = parseGdl90(m);
  assert.equal(t.type, 'TRAFFIC'); assert.equal(t.alert, true); assert.equal(t.address, 'ABCDEF');
  assert.ok(Math.abs(t.lat - 42.1) < 1e-4 && Math.abs(t.lon - 13.5) < 1e-4);
  assert.equal(t.pressAltFt, 4500); assert.equal(t.gsKt, 100); assert.equal(t.vsFpm, -64); assert.equal(t.trk, 90); assert.equal(t.callsign, 'I-ABCD');
  const store = new Map(); ingestGdl90(store, t, { lat: 42.1, lon: 13.49, altFt: 4500, trk: 90 }, 1013.25, 0);
  const [x] = trafficList(store, { lat: 42.1, lon: 13.49, altFt: 4500, trk: 90 });
  assert.equal(x.alarm, 2); assert.equal(x.relAltFt, 0); assert.equal(clockOf(x.relBrg), 12);
});

test('allarmi: livello 1, ostacolo da PFLAU, bersaglio senza direzione, ADS-B senza quota, traccia non valida', async () => {
  const { flarmAlarmText } = await import('../web-prototype/src/traffic.js');
  const own = { lat: 42, lon: 13.5, altFt: 3000, trk: 0 }, store = new Map();
  ingestFlarm(store, parseNmea(cs('PFLAA,1,300,0,700,2,C1,0,,40,0,1')), own, 0); // 2300 ft sopra ma in allarme 1
  assert.deepEqual(trafficList(store, own, 2000).map(t => t.id), ['C1']);
  assert.equal(trafficAlarm(trafficList(store, own)).id, 'C1');
  assert.equal(flarmAlarmText(parseNmea(cs('PFLAU,2,1,2,1,3,-10,3,-20,250,'))), 'Ostacolo a ore 12, 300 metri, stessa quota');
  assert.equal(flarmAlarmText(parseNmea(cs('PFLAU,2,1,2,1,2,,41,,,'))), 'Zona di allerta FLARM');
  assert.equal(flarmAlarmText(parseNmea(cs('PFLAU,2,1,2,1,0,,0,,,'))), null);
  assert.equal(trafficText({ relBrg: NaN, distM: 800, relAltFt: -200 }), 'Traffico vicino, direzione sconosciuta, 800 metri, 200 piedi sotto');
  const s2 = new Map(); ingestGdl90(s2, { valid: true, address: 'AAAAAA', lat: 42.003, lon: 13.5, pressAltFt: NaN, trk: NaN }, own, 1013.25, 0);
  const a = trafficAlarm(trafficList(s2, own)); assert.ok(a, 'ADS-B vicino di quota sconosciuta: allarme');
  assert.match(trafficText(a), /quota sconosciuta/);
});
