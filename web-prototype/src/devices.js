// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Strumenti esterni: ricevitori GPS, altimetri barometrici, bussole, FLARM, ricevitori ADS-B.
// Protocolli: NMEA 0183 (anche le frasi proprietarie FLARM e $PGRMZ per l'altitudine barometrica) e GDL90.
// Trasporti: USB (Web Serial, browser Chrome su computer), Bluetooth LE (Web Bluetooth o app Android).
import { FT_PER_HPA } from './airspace.js';

// ---------------------------------------------------------------- NMEA 0183
export function nmeaChecksumOk(line) {
  const m = /^\$([^*]+)\*([0-9A-Fa-f]{2})\s*$/.exec(line.trim());
  if (!m) return false;
  let x = 0;
  for (const ch of m[1]) x ^= ch.charCodeAt(0);
  return x === parseInt(m[2], 16);
}
const latLon = (v, h) => {
  if (!v) return NaN;
  const dot = v.indexOf('.'), deg = Number(v.slice(0, dot - 2)), min = Number(v.slice(dot - 2));
  return (deg + min / 60) * (/[SW]/.test(h) ? -1 : 1);
};

// Restituisce un oggetto con i campi riconosciuti, oppure null se la frase non è valida o non è gestita
export function parseNmea(line) {
  if (!nmeaChecksumOk(line)) return null;
  const body = line.trim().slice(1, line.trim().indexOf('*')), f = body.split(','), id = f[0];
  const t = id.slice(2);
  if (t === 'RMC') {
    if (f[2] !== 'A') return { type: 'RMC', valid: false };
    return { type: 'RMC', valid: true, lat: latLon(f[3], f[4]), lon: latLon(f[5], f[6]), gsKt: Number(f[7]), trk: f[8] === '' ? NaN : Number(f[8]) };
  }
  if (t === 'GGA') {
    const q = Number(f[6]);
    return { type: 'GGA', valid: q > 0, lat: latLon(f[2], f[3]), lon: latLon(f[4], f[5]), sats: Number(f[7]), hdop: Number(f[8]),
      altMslM: Number(f[9]), geoidM: Number(f[11]) };
  }
  if (id === 'PGRMZ') {
    // Altitudine di pressione (riferita a 1013,25 hPa); unità «f» = piedi
    const v = Number(f[1]);
    return { type: 'PGRMZ', valid: Number.isFinite(v), pressAltFt: f[2] && f[2].toLowerCase() === 'm' ? v * 3.28084 : v };
  }
  if (id === 'PFLAA') {
    // FLARM, traffico: livello d'allarme, posizione relativa in metri (nord, est, sopra), identificativo, traccia,
    // velocità al suolo (m/s), variometro (m/s), tipo. Senza direzione nota «est» è vuoto e «nord» è la distanza.
    const num = v => (v === '' || v == null ? NaN : Number(v));
    return { type: 'PFLAA', valid: Number.isFinite(num(f[2])), alarm: num(f[1]) || 0, northM: num(f[2]), eastM: num(f[3]), vertM: num(f[4]),
      idType: f[5], id: f[6] || '', trk: num(f[7]), gsMs: num(f[9]), climbMs: num(f[10]), acType: f[11] || '', noBearing: f[3] === '' };
  }
  if (id === 'PFLAU') {
    // FLARM, stato e traffico più pericoloso: allarme, rilevamento relativo alla traccia, distanza e differenza di quota (m)
    const num = v => (v === '' || v == null ? NaN : Number(v));
    return { type: 'PFLAU', valid: true, rx: num(f[1]) || 0, gpsOk: num(f[3]) > 0, alarm: num(f[5]) || 0, relBrg: num(f[6]),
      alarmType: f[7] ? parseInt(f[7], 16) : 0, vertM: num(f[8]), distM: num(f[9]), id: f[10] || '' }; // tipo: 2 aereo, 3 ostacolo, 4 avviso di traffico, da 0x10 zone
  }
  if (t === 'HDG' || t === 'HDM' || t === 'HDT') {
    return { type: 'HDG', valid: f[1] !== '', headingDeg: Number(f[1]), magnetic: t !== 'HDT' };
  }
  return null;
}

// ---------------------------------------------------------------- GDL90
const CRC_TABLE = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = (i << 8) & 0xffff;
    for (let b = 0; b < 8; b++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
    t[i] = crc;
  }
  return t;
})();
export function gdl90Crc(bytes) {
  let crc = 0;
  for (const b of bytes) crc = (CRC_TABLE[crc >> 8] ^ ((crc << 8) & 0xffff) ^ b) & 0xffff;
  return crc;
}
// Divide un flusso in messaggi (tra due 0x7E), toglie l'escape 0x7D e verifica il CRC (trasmesso LSB per primo)
export function gdl90Frames(buf) {
  const out = [];
  let cur = null, esc = false;
  for (const b of buf) {
    if (b === 0x7e) {
      if (cur && cur.length >= 3) {
        const msg = cur.slice(0, -2), crc = cur.at(-2) | (cur.at(-1) << 8);
        if (gdl90Crc(msg) === crc) out.push(Uint8Array.from(msg));
      }
      cur = []; esc = false; continue;
    }
    if (!cur) continue;
    if (b === 0x7d) { esc = true; continue; }
    cur.push(esc ? b ^ 0x20 : b); esc = false;
  }
  return out;
}
const s24 = (a, b, c) => { const v = (a << 16) | (b << 8) | c; return v & 0x800000 ? v - 0x1000000 : v; };
export function parseGdl90(msg) {
  const id = msg[0];
  if (id === 0) return { type: 'HEARTBEAT', gpsValid: !!(msg[1] & 0x80) };
  if (id === 10 && msg.length >= 28) {
    const lat = s24(msg[5], msg[6], msg[7]) * 180 / 0x800000, lon = s24(msg[8], msg[9], msg[10]) * 180 / 0x800000;
    const altRaw = (msg[11] << 4) | (msg[12] >> 4);
    const gs = (msg[14] << 4) | (msg[15] >> 4);
    return { type: 'OWNSHIP', lat, lon, pressAltFt: altRaw === 0xfff ? NaN : altRaw * 25 - 1000, gsKt: gs === 0xfff ? NaN : gs, trk: msg[17] * 360 / 256,
      valid: !(lat === 0 && lon === 0) };
  }
  if (id === 20 && msg.length >= 28) {
    // Traffico (stesso formato del rapporto sul proprio aereo): posizione, altitudine di pressione, velocità, nominativo
    const lat = s24(msg[5], msg[6], msg[7]) * 180 / 0x800000, lon = s24(msg[8], msg[9], msg[10]) * 180 / 0x800000;
    const altRaw = (msg[11] << 4) | (msg[12] >> 4), gs = (msg[14] << 4) | (msg[15] >> 4);
    let vv = ((msg[15] & 0x0f) << 8) | msg[16]; if (vv & 0x800) vv -= 0x1000;
    const cs = String.fromCharCode(...msg.slice(19, 27)).trim();
    return { type: 'TRAFFIC', alert: (msg[1] >> 4) === 1, address: ((msg[2] << 16) | (msg[3] << 8) | msg[4]).toString(16).toUpperCase().padStart(6, '0'),
      lat, lon, pressAltFt: altRaw === 0xfff ? NaN : altRaw * 25 - 1000, gsKt: gs === 0xfff ? NaN : gs, vsFpm: vv === -2048 ? NaN : vv * 64,
      trk: (msg[12] & 0x03) === 0 ? NaN : msg[17] * 360 / 256, emitter: msg[18], callsign: cs, valid: !(lat === 0 && lon === 0) }; // tipo di traccia 0: non valida
  }
  if (id === 11 && msg.length >= 5) { let v = (msg[1] << 8) | msg[2]; if (v & 0x8000) v -= 0x10000; return { type: 'GEOALT', geoAltFt: v * 5 }; }
  return { type: `MSG${id}` };
}

// ---------------------------------------------------------------- fusione delle fonti
// Altitudine di pressione → quota sul QNH. Errore tipico con temperatura lontana dalla ISA: circa 4 % per ogni 10 °C.
export const qnhAltitude = (pressAltFt, qnh) => pressAltFt + (qnh - 1013.25) * FT_PER_HPA;

export function fuse({ gps, baro, heading, qnh }) {
  const out = { notes: [] };
  if (gps && gps.valid) { out.lat = gps.lat; out.lon = gps.lon; out.gsKt = gps.gsKt; out.trk = gps.trk; }
  const baroAlt = baro && Number.isFinite(baro.pressAltFt) ? qnhAltitude(baro.pressAltFt, qnh) : NaN;
  const gpsAlt = gps && Number.isFinite(gps.altFt) ? gps.altFt : NaN;
  if (Number.isFinite(baroAlt)) { out.altFt = baroAlt; out.altSource = 'barometrica (strumento esterno)'; }
  else if (Number.isFinite(gpsAlt)) { out.altFt = gpsAlt; out.altSource = 'GPS'; }
  if (Number.isFinite(baroAlt) && Number.isFinite(gpsAlt) && Math.abs(baroAlt - gpsAlt) > 300) {
    out.notes.push(`Quota barometrica e GPS differiscono di ${Math.round(Math.abs(baroAlt - gpsAlt))} ft: controlla il QNH impostato.`);
  }
  if (heading && Number.isFinite(heading.headingDeg)) { out.heading = heading.headingDeg; out.headingMagnetic = heading.magnetic; }
  return out;
}

// ---------------------------------------------------------------- trasporti
const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';  // Nordic UART: usato da molti dispositivi BLE NMEA
const NUS_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

export function transportsAvailable() {
  const nativeBle = !!(globalThis.Capacitor?.isNativePlatform?.() && globalThis.Capacitor?.Plugins?.BluetoothLe);
  return {
    usb: typeof navigator !== 'undefined' && 'serial' in navigator,
    ble: nativeBle || (typeof navigator !== 'undefined' && 'bluetooth' in navigator),
    nativeBle,
  };
}

// Riassembla righe NMEA da frammenti di testo
export function lineSplitter(onLine) {
  let buf = '';
  return chunk => {
    buf += chunk;
    let i;
    while ((i = buf.search(/\r?\n/)) >= 0) { const line = buf.slice(0, i); buf = buf.slice(buf[i] === '\r' ? i + 2 : i + 1); if (line.startsWith('$')) onLine(line); }
    if (buf.length > 4096) buf = '';
  };
}

export async function connectUsb(onLine, baudRate = 9600) {
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate });
  const dec = new TextDecoder(), split = lineSplitter(onLine), reader = port.readable.getReader();
  let open = true;
  (async () => { while (open) { const { value, done } = await reader.read(); if (done) break; split(dec.decode(value)); } })().catch(() => {});
  return { name: `USB (${baudRate} baud)`, close: async () => { open = false; try { await reader.cancel(); await port.close(); } catch { /* già chiusa */ } } };
}

export async function connectBle(onLine) {
  const dec = new TextDecoder(), split = lineSplitter(onLine);
  const cap = globalThis.Capacitor;
  if (cap?.isNativePlatform?.() && cap.Plugins?.BluetoothLe) {
    const B = cap.Plugins.BluetoothLe;
    await B.initialize({ androidNeverForLocation: false });
    const dev = await B.requestDevice({ optionalServices: [NUS_SERVICE] });
    await B.connect({ deviceId: dev.deviceId });
    const key = `notification|${dev.deviceId}|${NUS_SERVICE}|${NUS_TX}`;
    const handle = await B.addListener(key, ev => split(dec.decode(hexToBytes(ev.value))));
    await B.startNotifications({ deviceId: dev.deviceId, service: NUS_SERVICE, characteristic: NUS_TX });
    return { name: `Bluetooth: ${dev.name || dev.deviceId}`, close: async () => { try { await handle.remove(); await B.disconnect({ deviceId: dev.deviceId }); } catch { /* già scollegato */ } } };
  }
  const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [NUS_SERVICE] });
  const srv = await dev.gatt.connect();
  const ch = await (await srv.getPrimaryService(NUS_SERVICE)).getCharacteristic(NUS_TX);
  ch.addEventListener('characteristicvaluechanged', e => split(dec.decode(e.target.value)));
  await ch.startNotifications();
  return { name: `Bluetooth: ${dev.name || 'dispositivo'}`, close: async () => { try { dev.gatt.disconnect(); } catch { /* già scollegato */ } } };
}
export function hexToBytes(v) {
  if (v instanceof DataView) return new Uint8Array(v.buffer);
  const s = String(v).replace(/[^0-9a-f]/gi, '');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Flusso NMEA registrato per provare la catena senza dispositivi (pressione standard, rotta 090)
export function demoNmeaLines(lat, lon, altFt, t = 0) {
  const pad = (n, w) => String(n).padStart(w, '0');
  const fmt = (v, degW) => { const a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60; return `${pad(d, degW)}${m.toFixed(4).padStart(7, '0')}`; };
  const cs = s => { let x = 0; for (const ch of s) x ^= ch.charCodeAt(0); return x.toString(16).toUpperCase().padStart(2, '0'); };
  const lo = lon + t * 0.0004;
  const rmc = `GPRMC,120000,A,${fmt(lat, 2)},N,${fmt(lo, 3)},E,90.0,90.0,061126,,`;
  const gga = `GPGGA,120000,${fmt(lat, 2)},N,${fmt(lo, 3)},E,1,09,0.9,${(altFt / 3.28084).toFixed(1)},M,47.0,M,,`;
  const rmz = `PGRMZ,${Math.round(altFt - 120)},f,3`;
  const hdg = `HCHDM,${(88 + Math.sin(t) * 2).toFixed(1)},M`;
  return [rmc, gga, rmz, hdg].map(s => `$${s}*${cs(s)}`);
}
