// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Fasi del volo, tempi, promemoria e carburante stimato. Solo calcoli a regole, verificabili; nessun disegno.
// Codice originale di fringuello79 di Avezzano.

// ---------------------------------------------------------------- decollo e atterraggio
// Si riconoscono dalla velocità al suolo del GPS: «in volo» dopo 10 s oltre la soglia di decollo, «a terra» dopo
// 20 s sotto la soglia di atterraggio E vicino al suolo (meno di 300 ft sul terreno): con forte vento contrario la
// velocità al suolo in volo può scendere sotto i 25 kt, e senza il controllo della quota sembrerebbe un atterraggio.
// La soglia di decollo (40 kt) è sopra il rullaggio e vicina alla velocità di stallo degli aerei del club.
export const PHASE_DEFAULTS = { takeoffKt: 40, landingKt: 25, takeoffSec: 10, landingSec: 20, landingAglFt: 300 };

export function newPhase() { return { phase: 'terra', since: null, below: null, above: null, takeoffAt: null, landingAt: null, events: [] }; }

// s: stato da newPhase(); fix: { t (ms), gsKt, altFt, aglFt, pos }. Restituisce l'evento ('decollo' | 'atterraggio') o null.
// aglFt non noto (NaN): l'atterraggio si decide dalla sola velocità.
export function phaseStep(s, fix, opt = PHASE_DEFAULTS) {
  const o = { ...PHASE_DEFAULTS, ...opt };
  if (!Number.isFinite(fix.gsKt) || !Number.isFinite(fix.t)) return null;
  if (s.phase === 'terra') {
    if (fix.gsKt >= o.takeoffKt) { s.above ??= fix; if (fix.t - s.above.t >= o.takeoffSec * 1000) {
      s.phase = 'volo'; s.takeoffAt = s.above.t; s.landingAt = null; s.below = null; const e = { kind: 'decollo', t: s.above.t, pos: s.above.pos }; s.above = null; s.events.push(e); return e; } }
    else s.above = null;
  } else if (fix.gsKt <= o.landingKt && !(fix.aglFt > o.landingAglFt)) { s.below ??= fix; if (fix.t - s.below.t >= o.landingSec * 1000) {
      s.phase = 'terra'; s.landingAt = s.below.t; s.above = null; const e = { kind: 'atterraggio', t: s.below.t, pos: s.below.pos }; s.below = null; s.events.push(e); return e; } }
  else s.below = null;
  return null;
}

// ---------------------------------------------------------------- tempi
export const fmtDur = min => (Number.isFinite(min) && min >= 0 ? `${Math.floor(min / 60)}:${String(Math.floor(min % 60)).padStart(2, '0')}` : '—');
export const fmtMS = sec => (Number.isFinite(sec) ? `${sec < 0 ? '−' : ''}${Math.floor(Math.abs(sec) / 60)}:${String(Math.floor(Math.abs(sec) % 60)).padStart(2, '0')}` : '—');

// Promemoria periodico (es. controllo carburante o cambio serbatoio ogni 30 min): { everyMin, startAt, label }.
// Restituisce i secondi al prossimo avviso e quante volte è già scattato.
export function reminderState(r, now) {
  if (!r || !(r.everyMin > 0) || !Number.isFinite(r.startAt)) return null;
  const P = r.everyMin * 60000, el = Math.max(0, now - r.startAt), n = Math.floor(el / P);
  return { count: n, nextSec: ((n + 1) * P - el) / 1000 };
}

// ---------------------------------------------------------------- carburante stimato
// Stima dal tempo di volo e dal consumo orario: NON è una misura. fuelL: carburante al decollo; flowLh: consumo;
// reserveMin: riserva finale. Restituisce litri rimasti, autonomia (min) e autonomia prima della riserva.
export function fuelEstimate({ fuelL, flowLh, flightMin, reserveMin = 30 }) {
  if (!(fuelL > 0) || !(flowLh > 0) || !Number.isFinite(flightMin)) return null;
  const remL = Math.max(0, fuelL - flowLh * flightMin / 60), endMin = remL / flowLh * 60;
  return { remL, endMin, usableMin: endMin - reserveMin };
}
// Avvisi sul carburante stimato in volo: raggiungere l'arrivo e restare sopra la riserva.
export function fuelWarnings(est, toDestMin, reserveMin = 30) {
  if (!est) return [];
  if (est.usableMin <= 0) return [{ lvl: 'crit', kind: 'carburante', title: 'Carburante stimato: sei nella riserva', text: `Autonomia stimata ${Math.round(est.endMin)} min (${Math.round(est.remL)} l). Atterra appena possibile.` }];
  if (Number.isFinite(toDestMin) && toDestMin > est.usableMin) return [{ lvl: 'crit', kind: 'carburante', title: 'Carburante stimato insufficiente per l’arrivo', text: `Servono circa ${Math.round(toDestMin)} min, ne restano ${Math.round(est.usableMin)} prima della riserva di ${reserveMin} min.` }];
  if (est.usableMin < 15) return [{ lvl: 'warn', kind: 'carburante', title: 'Carburante stimato quasi alla riserva', text: `Restano circa ${Math.round(est.usableMin)} min prima della riserva.` }];
  return [];
}

// ---------------------------------------------------------------- promemoria legati a un punto
// r = { lon, lat, mode: 'prima' | 'sopra' | 'traverso', min, text }. Stato per promemoria: { fired, rel, d, trk, passedNm }.
// Il «passaggio al traverso» è il rilevamento relativo che supera i 90° in volo quasi diritto (traccia cambiata di
// meno di 20° dal passo precedente): una virata non lo simula.
// - prima: scatta quando mancano «min» minuti al traverso del punto (distanza lungo la traccia / velocità al suolo)
// - sopra: entro 0,5 NM; se il punto si passa di lato entro 5 NM scatta al traverso (passedNm = distanza)
// - traverso: al passaggio al traverso, entro 15 NM
// Un promemoria «prima» non ancora scattato scatta comunque al traverso (passedNm). Una volta sola per volo.
export function pointReminderStep(r, st, own) {
  if (st.fired || !own || !Number.isFinite(own.lat)) return false;
  const R = 6371008.8, p1 = own.lat * Math.PI / 180, p2 = r.lat * Math.PI / 180, dl = (r.lon - own.lon) * Math.PI / 180;
  const d = 2 * R * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2)) / 1852;
  const brg = (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * 180 / Math.PI + 360) % 360;
  const rel = Math.abs(((brg - (own.trk || 0) + 540) % 360) - 180);   // 0 = davanti, 180 = dietro
  const turn = Number.isFinite(st.trk) ? Math.abs(((own.trk - st.trk + 540) % 360) - 180) : 0;
  const abeam = Number.isFinite(st.rel) && st.rel < 90 && rel >= 90 && turn <= 20;
  let fire = false;
  if (r.mode === 'prima') {
    const along = d * Math.cos(rel * Math.PI / 180);                   // NM al traverso del punto, lungo la traccia
    fire = (own.gsKt > 20 && rel < 90 && along / own.gsKt * 60 <= (r.min || 0)) || (abeam && d <= 15);
  } else if (r.mode === 'sopra') fire = d <= 0.5 || (abeam && d <= 5);
  else if (r.mode === 'traverso') fire = abeam && d <= 15;
  if (fire && abeam && d > 0.5 && r.mode !== 'traverso') st.passedNm = d;
  st.rel = rel; st.d = d; st.trk = own.trk;
  if (fire) st.fired = true;
  return fire;
}

// ---------------------------------------------------------------- variometro dal GPS
// Velocità verticale (ft/min) come pendenza della retta dei minimi quadrati sugli ultimi winSec secondi di quota.
export function verticalSpeedFpm(samples, winSec = 10) {
  if (!samples?.length) return NaN;
  const tEnd = samples.at(-1).t, S = samples.filter(s => tEnd - s.t <= winSec * 1000 && Number.isFinite(s.altFt));
  if (S.length < 3 || tEnd - S[0].t < 3000) return NaN;
  const n = S.length, mt = S.reduce((a, s) => a + s.t, 0) / n, ma = S.reduce((a, s) => a + s.altFt, 0) / n;
  let num = 0, den = 0;
  for (const s of S) { num += (s.t - mt) * (s.altFt - ma); den += (s.t - mt) ** 2; }
  return den ? num / den * 60000 : NaN;
}

// ---------------------------------------------------------------- discesa verso un punto
// Rateo di discesa necessario per arrivare a targetFt a distanza distNm con velocità al suolo gsKt (ft/min).
export function requiredVsFpm(altFt, targetFt, distNm, gsKt) {
  if (!(distNm > 0) || !(gsKt > 0)) return NaN;
  return (targetFt - altFt) / (distNm / gsKt * 60);
}

// ---------------------------------------------------------------- diario dei voli
// Voce del diario da decollo e atterraggio; from/to: nomi dei campi più vicini (o coordinate).
export function logEntry({ takeoffAt, landingAt, from, to, track = [], aircraft = '' }) {
  const seg = track.filter(p => p.t >= takeoffAt && p.t <= landingAt);
  let distM = 0;
  for (let i = 1; i < seg.length; i++) { const a = seg[i - 1], b = seg[i], R = 6371008.8, p1 = a.lat * Math.PI / 180, p2 = b.lat * Math.PI / 180;
    const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((b.lon - a.lon) * Math.PI / 360) ** 2; distM += 2 * R * Math.asin(Math.sqrt(h)); }
  return { date: new Date(takeoffAt).toISOString().slice(0, 10), off: new Date(takeoffAt).toISOString().slice(11, 16), on: new Date(landingAt).toISOString().slice(11, 16),
    min: Math.round((landingAt - takeoffAt) / 60000), from, to, aircraft, maxAltFt: seg.length ? Math.max(...seg.map(p => p.altFt)) : null, distNm: Math.round(distM / 1852 * 10) / 10 };
}
