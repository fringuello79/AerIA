// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Effemeridi: sorgere e tramonto del sole in un punto, e «giorno aeronautico».
// VDS: DPR 133/2010, art. 2 lett. h) e art. 9 c. 1: volo da mezz'ora prima del sorgere a mezz'ora dopo il tramonto,
// secondo le effemeridi. Aviazione generale: SERA art. 2 (97): la notte va dalla fine del crepuscolo civile serale
// all'inizio di quello mattutino (sole 6° sotto l'orizzonte); di notte il PPL serve l'abilitazione al volo notturno.
// Per il VDS il programma usa il più restrittivo dei due (a fine inverno il crepuscolo civile finisce prima dei 30
// minuti). Verifica delle fonti del 7/11/2026: la regola dei 30 minuti non è nell'AIP ENR 1.1, citato in precedenza.
// Calcolo astronomico standard (posizione media del sole, equazione del tempo; altezza −0,833° = rifrazione più
// semidiametro del sole, al livello del mare):
// errore di circa un minuto alle nostre latitudini. Scritto per AerIA VFR — fringuello79 di Avezzano.

const RAD = Math.PI / 180;
export const CIVIL_MARGIN_MIN = 30; // minuti prima del sorgere e dopo il tramonto (DPR 133/2010, VDS)
export const CIVIL_TWILIGHT_DEG = -6; // crepuscolo civile (SERA art. 2, definizione di notte)

// Giorno giuliano a mezzogiorno UTC della data «AAAA-MM-GG»
function julianNoon(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 12) / 86400000 + 2440587.5;
}

// Ora UTC (ms) del passaggio del sole all'altezza h0 (gradi, negativa sotto l'orizzonte), mattino o sera.
function sunEvent(dateStr, lat, lon, h0, rising) {
  let jd = julianNoon(dateStr) - lon / 360; // prima stima: mezzogiorno locale
  for (let it = 0; it < 3; it++) { // tre iterazioni bastano per stare sotto il secondo
    const n = jd - 2451545.0;
    const L = (280.460 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
    const lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
    const eps = (23.439 - 0.0000004 * n) * RAD;
    const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) / RAD;
    const eqt = ((L - ((ra + 360) % 360) + 540) % 360) - 180; // equazione del tempo in gradi
    const cosH = (Math.sin(h0 * RAD) - Math.sin(lat * RAD) * Math.sin(dec)) / (Math.cos(lat * RAD) * Math.cos(dec));
    if (cosH > 1 || cosH < -1) return NaN; // sole sempre sotto o sopra l'orizzonte (non succede in Italia)
    const H = Math.acos(cosH) / RAD;
    const noon = julianNoon(dateStr) - 0.5 + (720 - 4 * lon - 4 * eqt) / 1440; // mezzogiorno vero, giorno giuliano
    jd = noon + (rising ? -H : H) / 360;
  }
  return Math.round((jd - 2440587.5) * 86400000);
}

// { rise, set, dawn, dusk, dayStart, dayEnd, ruleStart, ruleEnd } in millisecondi UTC per la data locale indicata.
// pilot: 'basico' o 'avanzato' (VDS) oppure 'ag' (aviazione generale).
export function sunTimes(dateStr, lat, lon, pilot = 'basico') {
  const rise = sunEvent(dateStr, lat, lon, -0.833, true), set = sunEvent(dateStr, lat, lon, -0.833, false);
  const dawn = sunEvent(dateStr, lat, lon, CIVIL_TWILIGHT_DEG, true), dusk = sunEvent(dateStr, lat, lon, CIVIL_TWILIGHT_DEG, false);
  if (pilot === 'ag') return { rise, set, dawn, dusk, dayStart: dawn, dayEnd: dusk, ruleStart: 'inizio del crepuscolo civile', ruleEnd: 'fine del crepuscolo civile' };
  const a = rise - CIVIL_MARGIN_MIN * 60000, b = set + CIVIL_MARGIN_MIN * 60000;
  return { rise, set, dawn, dusk, dayStart: Math.max(a, dawn), dayEnd: Math.min(b, dusk),
    ruleStart: dawn > a ? 'inizio del crepuscolo civile, dopo il sorgere − 30 min' : 'sorgere − 30 min',
    ruleEnd: dusk < b ? 'fine del crepuscolo civile, prima del tramonto + 30 min' : 'tramonto + 30 min' };
}

// Ora locale italiana «HH:MM» di un istante UTC (ora legale compresa, dal sistema)
export function localHM(ms, tz = 'Europe/Rome') {
  if (!Number.isFinite(ms)) return '—';
  return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: tz, hourCycle: 'h23' }).format(new Date(ms));
}
export const utcHM = ms => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(11, 16) : '—');

// Controllo del piano: decollo e arrivo previsti rispetto al giorno aeronautico.
// takeoffMs: istante del decollo (UTC); tripMin: durata del volo; dep, arr: { lat, lon, name }; pilot: 'basico'|'avanzato'|'ag'
export function daylightChecks({ dateStr, takeoffMs, tripMin, dep, arr, pilot, reserveMin = 30 }) {
  const out = [];
  if (!dateStr || !dep || !arr || !Number.isFinite(takeoffMs) || !Number.isFinite(tripMin)) return out;
  const sd = sunTimes(dateStr, dep.lat, dep.lon, pilot), sa = sunTimes(dateStr, arr.lat, arr.lon, pilot);
  const landMs = takeoffMs + tripMin * 60000, vds = pilot !== 'ag';
  const lvl = vds ? 'crit' : 'warn', who = vds ? 'Il volo VDS è ammesso solo di giorno.' : 'Di notte serve l’abilitazione al volo notturno (VFR notturno).';
  if (takeoffMs < sd.dayStart) out.push({ lvl, kind: 'sole', title: 'Decollo prima dell’inizio del giorno aeronautico',
    text: `Decollo alle ${localHM(takeoffMs)}, il giorno aeronautico a ${dep.name || 'partenza'} inizia alle ${localHM(sd.dayStart)} (${sd.ruleStart}; sorgere ${localHM(sd.rise)}). ${who}`,
    plain: `Partiresti alle ${localHM(takeoffMs)}, prima delle ${localHM(sd.dayStart)}: è ancora notte per le regole. ${who}` });
  if (landMs > sa.dayEnd) out.push({ lvl, kind: 'sole', title: 'Arrivo dopo la fine del giorno aeronautico',
    text: `Arrivo previsto alle ${localHM(landMs)}, il giorno aeronautico a ${arr.name || 'destinazione'} finisce alle ${localHM(sa.dayEnd)} (${sa.ruleEnd}; tramonto ${localHM(sa.set)}). ${who}`,
    plain: `Arriveresti alle ${localHM(landMs)}, ma alle ${localHM(sa.dayEnd)} per le regole è già notte. Parti prima o accorcia il volo. ${who}` });
  else if (landMs + reserveMin * 60000 > sa.dayEnd) out.push({ lvl: 'warn', kind: 'sole', title: 'Poco margine sulla fine del giorno',
    text: `Arrivo alle ${localHM(landMs)}; con ${reserveMin} min di riserva si va oltre le ${localHM(sa.dayEnd)} (fine del giorno aeronautico).`,
    plain: `Arrivi alle ${localHM(landMs)}: se dovessi usare la riserva o andare all’alternato arriveresti dopo le ${localHM(sa.dayEnd)}, quando è già notte.` });
  return out;
}

// Ora locale italiana «HH:MM» del giorno dateStr → istante UTC (ms). Gestisce ora solare e legale, anche nelle notti
// del cambio d'ora (seconda stima sull'istante corretto). Orari non validi → NaN.
export function romeToUtcMs(dateStr, hhmm, tz = 'Europe/Rome') {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m || !dateStr || +m[1] > 23 || +m[2] > 59) return NaN;
  const wall = Date.parse(`${dateStr}T${m[1].padStart(2, '0')}:${m[2]}:00Z`);
  if (!Number.isFinite(wall)) return NaN;
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const offset = ms => { const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value])); return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) - ms; };
  const first = wall - offset(wall);
  return wall - offset(first);
}
