// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Traffico da strumenti esterni: FLARM (frasi $PFLAA e $PFLAU) e ricevitori ADS-B in GDL90 (messaggio di traffico).
// Il programma mostra il traffico ricevuto e ripete l'allarme dello strumento; non calcola rotte di collisione proprie
// oltre a una soglia semplice per i ricevitori che non danno un livello d'allarme. Guardare fuori resta la difesa principale.
import { FT, NM, bearingDeg, distM } from './geo.js';
import { FT_PER_HPA } from './airspace.js';

const M_PER_DEG = 111320;

// Posizione a partire da quella propria e dagli scostamenti in metri verso nord ed est
export function offsetLatLon(own, northM, eastM) {
  return { lat: own.lat + northM / M_PER_DEG, lon: own.lon + eastM / (M_PER_DEG * Math.cos(own.lat * Math.PI / 180)) };
}

// Ore dell'orologio dal rilevamento relativo alla propria traccia: 0° = ore 12, 90° = ore 3
export function clockOf(relDeg) {
  const h = Math.round((((relDeg % 360) + 360) % 360) / 30) % 12;
  return h === 0 ? 12 : h;
}
const ORE = ['', 'una', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici'];

// Messaggio breve per voce e finestra: «Traffico a ore due, 800 metri, 300 piedi sopra»
export function trafficText({ relBrg, distM: d, relAltFt }, speech = false, what = 'Traffico') {
  const h = Number.isFinite(relBrg) ? clockOf(relBrg) : null, dist = !Number.isFinite(d) ? '' : d < 1852 ? `${Math.round(d / 100) * 100} metri` : `${(d / NM).toFixed(1).replace('.', ',')} miglia`;
  const v = !Number.isFinite(relAltFt) ? 'quota sconosciuta' : Math.abs(relAltFt) < 150 ? 'stessa quota' : `${Math.round(Math.abs(relAltFt) / 100) * 100} piedi ${relAltFt > 0 ? 'sopra' : 'sotto'}`;
  return [h ? `${what} a ore ${speech ? ORE[h] : h}` : `${what} vicino, direzione sconosciuta`, dist, v].filter(Boolean).join(', ');
}

// Aggiornamento dell'archivio del traffico. own = { lat, lon, altFt, trk }
export function ingestFlarm(store, m, own, now) {
  if (!own || !m.valid) return;
  const key = `F${m.idType || ''}-${m.id || `${Math.round(m.northM / 200)}_${Math.round(m.eastM / 200)}`}`; // senza identificativo: per posizione
  const relAltFt = Number.isFinite(m.vertM) ? m.vertM * FT : NaN;
  if (m.noBearing || !Number.isFinite(m.eastM)) {
    // solo distanza (trasponditore in modo C senza posizione): niente simbolo sulla carta, solo l'elenco e l'allarme
    store.set(key, { key, src: 'FLARM', id: m.id, pos: null, distM: m.northM, relAltFt, altFt: own.altFt + relAltFt, alarm: m.alarm, t: now, acType: m.acType });
    return;
  }
  const pos = offsetLatLon(own, m.northM, m.eastM);
  store.set(key, { key, src: 'FLARM', id: m.id, pos, distM: Math.hypot(m.northM, m.eastM), relAltFt, altFt: own.altFt + relAltFt,
    trk: m.trk, gsKt: Number.isFinite(m.gsMs) ? m.gsMs * 1.943844 : NaN, vsFpm: Number.isFinite(m.climbMs) ? m.climbMs * 196.85 : NaN,
    alarm: m.alarm, t: now, acType: m.acType });
}
// Traffico ADS-B (GDL90): l'altitudine è di pressione, si riporta al QNH come la propria
export function ingestGdl90(store, m, own, qnh, now) {
  if (!m.valid) return;
  const key = `A-${m.address}`, pos = { lat: m.lat, lon: m.lon };
  const altFt = Number.isFinite(m.pressAltFt) ? m.pressAltFt + (qnh - 1013.25) * FT_PER_HPA : NaN;
  const d = own ? distM(own, pos) : NaN, relAltFt = own && Number.isFinite(altFt) ? altFt - own.altFt : NaN;
  store.set(key, { key, src: 'ADS-B', id: m.callsign || m.address, pos, distM: d, relAltFt, altFt, trk: m.trk, gsKt: m.gsKt, vsFpm: m.vsFpm,
    alarm: m.alert ? 2 : 0, t: now });
}
// Toglie il traffico non più ricevuto (FLARM trasmette ogni secondo; ADS-B più di rado)
// Allarme della frase $PFLAU (anche ostacoli e zone di allerta, che non arrivano con $PFLAA)
export function flarmAlarmText(u, speech = false) {
  if (!u || !(u.alarm >= 1)) return null;
  const what = u.alarmType === 3 ? 'Ostacolo' : u.alarmType >= 0x10 ? 'Zona di allerta FLARM' : 'Traffico';
  if (u.alarmType >= 0x10) return `${what}${Number.isFinite(u.distM) ? `, ${Math.round(u.distM / 100) * 100} metri` : ''}`;
  return trafficText({ relBrg: u.relBrg, distM: u.distM, relAltFt: Number.isFinite(u.vertM) ? u.vertM * FT : NaN }, speech, what);
}
export function pruneTraffic(store, now, maxAgeMs = 12000) {
  for (const [k, v] of store) if (now - v.t > (v.src === 'ADS-B' ? 2 * maxAgeMs : maxAgeMs)) store.delete(k);
}

// Elenco ordinato per vicinanza, con posizione relativa alla propria traccia; bandFt = fascia di quota mostrata (±)
export function trafficList(store, own, bandFt = Infinity) {
  const out = [];
  for (const v of store.values()) {
    if (Number.isFinite(v.relAltFt) && Math.abs(v.relAltFt) > bandFt && !(v.alarm >= 1)) continue; // in allarme si vede sempre
    const d = v.pos && own ? distM(own, v.pos) : v.distM;
    const relBrg = v.pos && own ? bearingDeg(own, v.pos) - (own.trk || 0) : NaN;
    out.push({ ...v, distM: d, relBrg });
  }
  return out.sort((a, b) => (b.alarm - a.alarm) || (a.distM - b.distM));
}

// Allarme da mostrare: quello dello strumento (livelli 1, 2, 3: impatto tra 15–20, 10–15, 0–8 secondi); per l'ADS-B,
// che non dà un livello, traffico entro 1 miglio e 500 ft (o di quota sconosciuta). Restituisce il più urgente, oppure null.
export function trafficAlarm(list) {
  const near = list.filter(v => v.alarm >= 1 || (v.src === 'ADS-B' && v.distM < NM && !(Math.abs(v.relAltFt) >= 500)));
  return near.sort((a, b) => (b.alarm - a.alarm) || (a.distM - b.distM))[0] || null;
}
