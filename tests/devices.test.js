// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nmeaChecksumOk, parseNmea, gdl90Crc, gdl90Frames, parseGdl90, fuse, qnhAltitude, lineSplitter, demoNmeaLines } from '../web-prototype/src/devices.js';

// Frasi d'esempio pubblicate nella documentazione NMEA più diffusa (checksum verificabile a mano)
const GGA = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47';
const RMC = '$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A';

test('NMEA: checksum', () => {
  assert.equal(nmeaChecksumOk(GGA), true);
  assert.equal(nmeaChecksumOk(RMC), true);
  assert.equal(nmeaChecksumOk(GGA.replace('545.4', '545.5')), false);
  assert.equal(parseNmea(GGA.replace('545.4', '545.5')), null);
});

test('NMEA: posizione, velocità, quota', () => {
  const g = parseNmea(GGA);
  assert.ok(Math.abs(g.lat - (48 + 7.038 / 60)) < 1e-9);
  assert.ok(Math.abs(g.lon - (11 + 31 / 60)) < 1e-9);
  assert.equal(g.altMslM, 545.4);
  assert.equal(g.sats, 8);
  const r = parseNmea(RMC);
  assert.equal(r.valid, true);
  assert.equal(r.gsKt, 22.4);
  assert.equal(r.trk, 84.4);
});

test('NMEA: altitudine di pressione e prua dal flusso dimostrativo', () => {
  const lines = demoNmeaLines(42.03, 13.43, 5000);
  const p = lines.map(parseNmea);
  assert.ok(p.every(Boolean), 'tutte le frasi generate devono superare il checksum');
  assert.equal(p[2].type, 'PGRMZ');
  assert.equal(p[2].pressAltFt, 4880);
  assert.equal(p[3].type, 'HDG');
  assert.ok(Math.abs(p[0].lat - 42.03) < 1e-5 && Math.abs(p[0].lon - 13.43) < 1e-5);
});

test('righe spezzate in più frammenti', () => {
  const got = [];
  const split = lineSplitter(l => got.push(l));
  split(GGA.slice(0, 20)); split(GGA.slice(20) + '\r\n' + RMC.slice(0, 5)); split(RMC.slice(5) + '\n');
  assert.deepEqual(got, [GGA, RMC]);
});

test('GDL90: CRC del messaggio heartbeat della specifica FAA', () => {
  // Esempio della specifica GDL90 (560-1058-00 Rev A, §2.2.3): 7E 00 81 41 DB D0 08 02 B3 8B 7E
  const frame = [0x7e, 0x00, 0x81, 0x41, 0xdb, 0xd0, 0x08, 0x02, 0xb3, 0x8b, 0x7e];
  const msgs = gdl90Frames(frame);
  assert.equal(msgs.length, 1);
  assert.equal(gdl90Crc([0x00, 0x81, 0x41, 0xdb, 0xd0, 0x08, 0x02]), 0x8bb3);
  assert.equal(parseGdl90(msgs[0]).gpsValid, true);
});

test('GDL90: escape e messaggio corrotto scartato', () => {
  const msg = [0x0b, 0x7e, 0x10, 0x00, 0x0a];
  const crc = gdl90Crc(msg);
  const esc = b => (b === 0x7e || b === 0x7d ? [0x7d, b ^ 0x20] : [b]);
  const body = [...msg, crc & 0xff, crc >> 8].flatMap(esc);
  const ok = gdl90Frames([0x7e, ...body, 0x7e]);
  assert.equal(ok.length, 1);
  assert.equal(parseGdl90(ok[0]).geoAltFt, 0x7e10 * 5);
  body[3] ^= 1;
  assert.equal(gdl90Frames([0x7e, ...body, 0x7e]).length, 0);
});

test('GDL90: ownship, posizione e quota di pressione', () => {
  // Costruito secondo la specifica: lat 42.0 → 42/180*2^23, alt 5000 ft → (5000+1000)/25 = 240
  const m = new Uint8Array(28);
  m[0] = 10;
  const enc = (v, i) => { let x = Math.round(v / 180 * 0x800000); if (x < 0) x += 0x1000000; m[i] = x >> 16; m[i + 1] = (x >> 8) & 255; m[i + 2] = x & 255; };
  enc(42.0, 5); enc(13.5, 8);
  m[11] = 240 >> 4; m[12] = (240 & 15) << 4;
  m[14] = 90 >> 4; m[15] = (90 & 15) << 4; m[17] = 64;
  const o = parseGdl90(m);
  assert.ok(Math.abs(o.lat - 42) < 1e-4 && Math.abs(o.lon - 13.5) < 1e-4);
  assert.equal(o.pressAltFt, 5000);
  assert.equal(o.gsKt, 90);
  assert.equal(o.trk, 90);
});

test('fusione: barometrica prima del GPS, avviso se divergono', () => {
  assert.equal(qnhAltitude(5000, 1013.25), 5000);
  assert.equal(qnhAltitude(5000, 1023.25), 5270);
  const a = fuse({ gps: { valid: true, lat: 42, lon: 13, altFt: 5300 }, baro: { pressAltFt: 5000 }, qnh: 1023.25 });
  assert.equal(a.altFt, 5270);
  assert.match(a.altSource, /barometrica/);
  assert.equal(a.notes.length, 0);
  const b = fuse({ gps: { valid: true, lat: 42, lon: 13, altFt: 5400 }, baro: { pressAltFt: 5000 }, qnh: 1013.25 });
  assert.equal(b.notes.length, 1);          // 400 ft: QNH probabilmente sbagliato
  assert.equal(fuse({ gps: { valid: true, altFt: 5300 }, baro: { pressAltFt: 5000 }, qnh: 1013.25 }).notes.length, 0); // 300 ft: entro la soglia
  const c = fuse({ gps: { valid: true, lat: 42, lon: 13, altFt: 5300 }, qnh: 1013 });
  assert.equal(c.altSource, 'GPS');
});
