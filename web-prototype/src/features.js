// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Aeroporti, aviosuperfici, ostacoli, punti di riporto e radioassistenze (fonte openAIP; ostacoli da OpenStreetMap).
// Controlli a regole sulla rotta pianificata.
import { FT, distM } from './geo.js';
import { distToRouteKm } from './weather.js';
import { legAltFt } from './rules.js';
import { channelOf } from './radio.js';

// Aeroporto ai fini del limite dei 5 km per il VDS non avanzato: ha un codice ICAO oppure è di un tipo
// che openAIP usa solo per aeroporti (0 aeroporto, 3 internazionale, 5 militare, 9 IFR). Esclusi i chiusi (8).
// Le aviosuperfici e i campi di volo senza codice ICAO non contano per il limite, ma generano un avviso di traffico.
export function aerodromeKind(a) {
  if (a.type === 8) return 'chiuso';
  if (a.icao || [0, 3, 5, 9].includes(a.type)) return 'aeroporto';
  if (a.type === 4 || a.type === 7) return 'elisuperficie';
  return 'aviosuperficie';
}

export const VDS_AIRPORT_KM = 5;
// Criterio del programma per gli ostacoli: 500 ft sopra l'ostacolo più alto entro 600 m dalla rotta. Fuori dai centri
// abitati è più prudente di SERA.5005 f)2) (500 ft entro 150 m); sopra i centri abitati SERA.5005 f)1) chiede 1000 ft
// entro 600 m, e i centri abitati non sono ancora controllati (per il VDS il loro sorvolo è vietato, DPR 133/2010 art. 9).
export const OBST_RADIUS_M = 600;
export const OBST_MARGIN_FT = 500;
// Ostacolo senza altezza nei dati (94 % nel pacchetto): ipotesi prudente dichiarata, non un dato. Pale eoliche 200 m
// (le più alte installate in Italia centrale stanno sotto); torri, antenne, ciminiere e altri 300 m, perché esistono
// tralicci oltre i 200 m (verifica dei dati del 7/11/2026: ripetitore di 269 m in Emilia-Romagna).
export const UNKNOWN_HEIGHT_M = 200;
export const unknownHeightM = o => (o?.kind === 'pala eolica' ? 200 : 300);
export const obstacleHeightM = o => o.heightM ?? unknownHeightM(o);
export const obstacleTopFt = o => (o.elevM + obstacleHeightM(o)) * FT;
const fmtKm = km => km.toFixed(1).replace('.', ',');

export function featureWarnings({ route, cruiseFt, pilot, feats }) {
  const W = [];
  if (!feats || route.length < 2) return W;
  for (const a of feats.airports) {
    const kind = aerodromeKind(a), d = distToRouteKm(a, route), freq = a.freqs.find(f => f.mhz);
    if (kind === 'aeroporto' && pilot === 'basico' && d < VDS_AIRPORT_KM) {
      W.push({ lvl: 'crit', kind: 'aeroporto', title: `Entro 5 km da ${a.icao ? a.icao + ' ' : ''}${a.name}`,
        text: `La rotta passa a ${fmtKm(d)} km dall'aeroporto. Il VDS non avanzato deve restarne ad almeno 5 km, salvo autorizzazione ENAC (DPR 133/2010, art. 9).`,
        plain: `Passi a ${fmtKm(d)} km dall'aeroporto di ${a.name}: con un VDS non avanzato devi restarne ad almeno 5 km. Allarga la rotta.` });
    } else if (kind === 'aviosuperficie' && d < 3 && cruiseFt < a.elevM * FT + 2000) {
      W.push({ lvl: 'info', kind: 'aviosuperficie', title: `Traffico possibile: ${a.name}`,
        text: `Passi a ${fmtKm(d)} km da ${a.typeName} (${Math.round(a.elevM * FT)} ft)${freq ? `, frequenza ${channelOf(freq.mhz)}` : ''}. Attenzione al traffico in circuito.${freq ? ` Frequenza da openAIP${channelOf(freq.mhz) !== String(freq.mhz) ? ' (130.000: dal 1° gennaio 2026 si seleziona il canale 130.005)' : ''}: verificala.` : ''}` });
    }
  }
  // ostacoli entro 600 m dalla rotta con margine verticale insufficiente
  const close = [];
  for (const o of feats.obstacles) {
    // tratto per tratto, ciascuno con la sua quota: conta il tratto con il margine minore
    let best = null;
    for (let i = 0; i < route.length - 1; i++) {
      const dKm = distToRouteKm(o, [route[i], route[i + 1]]);
      if (dKm * 1000 > OBST_RADIUS_M) continue;
      const top = obstacleTopFt(o), clear = legAltFt(route, i, cruiseFt) - top;
      if (!best || clear < best.clear) best = { o, dKm, top, clear };
    }
    if (best && best.clear < OBST_MARGIN_FT) close.push(best);
  }
  if (close.length) {
    const worst = close.reduce((b, x) => (x.clear < b.clear ? x : b));
    const unknown = close.filter(x => x.o.heightM == null).length;
    W.push({ lvl: worst.clear < 0 ? 'crit' : 'warn', kind: 'ostacoli', title: `${close.length} ${close.length === 1 ? 'ostacolo' : 'ostacoli'} vicino alla rotta`,
      text: `Il più critico (${worst.o.kind}${worst.o.name ? ' ' + worst.o.name : ''}) è a ${Math.round(worst.dKm * 1000)} m dalla rotta, con la sommità a circa ${Math.round(worst.top / 10) * 10} ft: `
        + `${worst.clear < 0 ? `sei ${Math.round(-worst.clear)} ft sotto la sommità` : `margine ${Math.round(worst.clear)} ft`}, meno dei 500 ft che il programma richiede entro 600 m (SERA.5005 f) chiede 500 ft entro 150 m, e 1000 ft entro 600 m sopra i centri abitati).`
        + (unknown ? ` ${unknown} senza altezza nei dati: considerati alti 200 m (pale eoliche) o 300 m (torri, antenne, ciminiere) per prudenza.` : ''),
      plain: `Vicino alla rotta ci sono ${close.length === 1 ? 'un ostacolo' : `${close.length} ostacoli`} (${[...new Set(close.map(x => x.o.kind))].join(', ')}). Sali di almeno ${Math.max(100, Math.ceil((OBST_MARGIN_FT - worst.clear) / 100) * 100)} piedi o allarga la rotta.` });
  }
  return W;
}

// Campo di partenza o arrivo: l'aeroporto o l'aviosuperficie più vicina al punto, entro 1,5 km
export function fieldAt(feats, p) {
  if (!feats || !p) return null;
  let best = null;
  for (const a of feats.airports) { const d = distM(a, p); if (aerodromeKind(a) !== 'chiuso' && d < 1500 && (!best || d < best.d)) best = { a, d }; }
  return best && best.a;
}

// Codici dei campi che non sono nei dati openAIP. Ogni voce dice da dove viene: va riscontrata su una fonte ufficiale.
// Servono solo alla ricerca e alla descrizione del campo; non cambiano regole né chiamate radio.
export const FIELD_ALIASES = [
  { code: 'LIAH', name: /CELANO/i, lat: 42.05167, lon: 13.55778,
    source: 'indicato dall’Aeroclub dei Marsi (7/11/2026) come codice registrato dell’aviosuperficie di Celano; non trovato nelle fonti pubbliche consultate' },
];
export function aliasesFor(a) {
  return FIELD_ALIASES.filter(x => x.name.test(a.name || '') && Math.abs(a.lat - x.lat) < 0.01 && Math.abs(a.lon - x.lon) < 0.01).map(x => x.code);
}

// Campi i cui dati openAIP differiscono da un'altra fonte pubblica (SkyVector, non ufficiale): verifica del 7/11/2026.
// Non correggono nulla (senza l'AIP ENAV non si sa quale dato sia giusto): fanno comparire un avviso «da verificare»
// quando la rotta usa il campo o gli passa vicino. Una volta controllati sull'AIP vanno segnalati a openAIP.
export const FIELD_DOUBTS = {
  LIRZ: 'quota 636 ft nei dati, 697 ft in un\'altra fonte',
  LIRH: 'posizione spostata di circa 560 m e quota 574 ft nei dati (632 ft in un\'altra fonte); mancano TWR e GND',
  LIRE: 'piste e posizione (circa 640 m) diverse da un\'altra fonte',
  LIRF: 'lunghezza della pista 07/25 diversa da un\'altra fonte',
  LIRM: 'designatori e lunghezze delle piste diversi da un\'altra fonte',
  LIRG: 'pista 04/22 nei dati, 03/21 in un\'altra fonte',
  LIAF: 'due piste con lo stesso nome 17/35 (in un\'altra fonte 17/35 e 17L/35R)',
  LIBP: 'quota 23 ft nei dati, 48 ft in un\'altra fonte',
  LIRU: 'quota 33 ft nei dati, 55 ft in un\'altra fonte',
};
export function fieldDoubtWarnings(route, feats) {
  const W = [];
  if (!feats || route.length < 2) return W;
  for (const a of feats.airports) {
    const why = a.icao && FIELD_DOUBTS[a.icao];
    if (!why || distToRouteKm(a, route) > 10) continue;
    W.push({ lvl: 'info', kind: 'dati', title: `Dati da verificare: ${a.icao} ${a.name}`,
      text: `${why}. Prima del volo controlla quota, piste e frequenze sull'AIP ENAV (AD 2): sono i dati da usare.` });
  }
  return W;
}
