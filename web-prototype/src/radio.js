// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Assistente radio in italiano: chiamate compilate dalla rotta pianificata.
// Riferimento: Regolamento ENAC «Regole dell'aria Italia» (RAIT) Ed. 4 Rev. 4 e il suo Allegato A
// («Fraseologia standard in lingua inglese ed italiana»), che dal 2022 sostituisce la circolare ATM-08.
// Ogni scheda indica la sua fonte. Dove la norma prescrive la formula esatta, la frase la riporta;
// dove prescrive solo l'ordine dei dati, la scheda lo dichiara come «modello».
// Enti e frequenze vengono dai dati o dalla norma (130.005 per le chiamate all'aria), mai inventati.
import { category, contactInfo, limitText } from './airspace.js';

const RAIT = 'RAIT Ed. 4 Rev. 4';

// ------------------------------------------------------------------ nominativo
// RAIT.14050 g): «ULTRALIGHT» (in italiano «ULTRALEGGERO») prima del nominativo completo,
// per gli apparecchi VDS avanzati condotti da pilota VDS avanzato. Il nominativo non si abbrevia mai.
export function callsignFor(profile, lang = 'it') {
  const cs = (profile.callsign || 'I-XXXX').trim().toUpperCase();
  if (profile.category !== 'avanzato') return cs;
  return `${lang === 'en' ? 'ULTRALIGHT' : 'ULTRALEGGERO'} ${cs}`;
}

// ------------------------------------------------------------------ pronuncia (SERA.14020 alfabeto; SERA.14035 e 14040 numeri)
const ALFA = { A: 'ALFA', B: 'BRAVO', C: 'CHARLIE', D: 'DELTA', E: 'ECHO', F: 'FOXTROT', G: 'GOLF', H: 'HOTEL', I: 'INDIA', J: 'JULIETT', K: 'KILO', L: 'LIMA', M: 'MIKE', N: 'NOVEMBER', O: 'OSCAR', P: 'PAPA', Q: 'QUEBEC', R: 'ROMEO', S: 'SIERRA', T: 'TANGO', U: 'UNIFORM', V: 'VICTOR', W: 'WHISKEY', X: 'X-RAY', Y: 'YANKEE', Z: 'ZULU' };
const CIFRE = ['ZERO', 'UNO', 'DUE', 'TRE', 'QUATTRO', 'CINQUE', 'SEI', 'SETTE', 'OTTO', 'NOVE'];
const FINO_A_19 = ['', 'UNO', 'DUE', 'TRE', 'QUATTRO', 'CINQUE', 'SEI', 'SETTE', 'OTTO', 'NOVE', 'DIECI', 'UNDICI', 'DODICI', 'TREDICI', 'QUATTORDICI', 'QUINDICI', 'SEDICI', 'DICIASSETTE', 'DICIOTTO', 'DICIANNOVE'];

// cifre pronunciate una per una: «1013» → «UNO ZERO UNO TRE»
export const sayDigits = s => String(s).replace(/\D/g, '').split('').map(d => CIFRE[+d]).join(' ');

// nominativo lettera per lettera con l'alfabeto ICAO; la parola «ULTRALEGGERO» resta intera
export function sayCallsign(cs) {
  return cs.split(/\s+/).map(w => /^ULTRA/.test(w) ? w : w.replace(/[^A-Z0-9]/g, '').split('').map(c => ALFA[c] || CIFRE[+c]).join(' ')).join(' ');
}

// quote in piedi: centinaia e migliaia intere con CENTO e MILA, come in «OTTOCENTO PIEDI», «DODICIMILA PIEDI»
export function sayAltitude(ft) {
  const n = Math.round(ft / 100) * 100, mila = Math.floor(n / 1000), cento = (n % 1000) / 100;
  if (!n) return 'ZERO PIEDI';
  const parts = [];
  if (mila) parts.push(mila === 1 ? 'MILLE' : `${FINO_A_19[mila]}MILA`);
  if (cento) parts.push(cento === 1 ? 'CENTO' : `${FINO_A_19[cento]}CENTO`);
  return `${parts.join(' ')} PIEDI`;
}

// QNH cifra per cifra, salvo «QNH MILLE»
export const sayQnh = q => (Math.round(q) === 1000 ? 'QNH MILLE' : `QNH ${sayDigits(Math.round(q))}`);

// frequenze: cifre, «DECIMALI», cifre; se le ultime due cifre sono zero si dicono solo le prime quattro
export function sayFreq(f) {
  const [a, b = ''] = String(f).split('.');
  const dec = (b + '000').slice(0, 3), d = dec.endsWith('00') ? dec[0] : dec;
  return `${sayDigits(a)} DECIMALI ${sayDigits(d)}`;
}

// ------------------------------------------------------------------ enti
function unitName(a) {
  const c = contactInfo(a);
  if (c.unit) return { name: titleCase(c.unit.replace(/[-_]/g, ' ').replace(/\bTWR\b/i, 'Torre').replace(/\bAPP\b/i, 'Avvicinamento').replace(/\bINFORMATION\b/i, 'Informazioni').replace(/\bRDR\b|\bRADAR\b/i, 'Radar')), freq: c.freq, note: c.note, fromData: true };
  return { name: '[ente: vedi carta]', freq: '', note: c.note, fromData: false };
}
const titleCase = s => s.toLowerCase().replace(/\s+/g, ' ').trim().replace(/(^|\s|\/)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

const alt = ft => `${Math.round(ft / 100) * 100} piedi`;
// nome dello spazio controllato come lo dice l'ente
const zoneWord = t => (t === 'CTR' ? 'zona di controllo' : t === 'ATZ' ? 'ATZ' : 'spazio aereo controllato');

export const ARIA_FREQ = '130.005';
// 130.000 MHz dei dati: dal 1° gennaio 2026 sulle radio si seleziona il canale 130.005 (RAIT.6005 d))
export const channelOf = mhz => (Math.abs(parseFloat(mhz) - 130) < 1e-6 ? ARIA_FREQ : String(mhz));

export function buildRadioCards({ profile, from = '[partenza]', to = '[destinazione]', cruiseFt, qnh, hits = [], position = '[posizione]', fields = [] }) {
  const cs = callsignFor(profile), type = profile.acType || '[tipo]';
  const q = Math.round(qnh), basico = profile.category === 'basico';
  const cards = [];

  // come si pronunciano i dati di questo volo
  const fieldFreqs = fields.map(({ a }) => a.freqs.find(x => x.mhz)?.mhz).filter(Boolean).map(channelOf);
  cards.push({ id: 'pronuncia', title: 'Come si pronunciano i tuoi dati', unit: '', freq: '', freqNote: '',
    explain: 'Lettere con l’alfabeto ICAO, numeri cifra per cifra; centinaia e migliaia intere delle quote con «cento» e «mila».',
    say: [
      ['Nominativo', profile.callsign?.trim() ? sayCallsign(cs) : 'inserisci il nominativo nelle impostazioni dell’aereo'],
      ['Quota', sayAltitude(cruiseFt)],
      ['QNH', sayQnh(q)],
      ...[...new Set([...fieldFreqs, ARIA_FREQ])].map(f => [`Frequenza ${f}`, sayFreq(f)]),
      ['Transponder', `7000 «SETTEMILA», 7600 «${sayDigits(7600)}», 7700 «${sayDigits(7700)}»`],
    ],
    fonte: `${RAIT}, SERA.14020 (alfabeto), SERA.14035 e SERA.14040 (numeri); Allegato A per gli esempi.`,
    steps: [] });

  if (basico) {
    cards.push({ id: 'basico', title: 'VDS non avanzato: niente servizi ATS', unit: '', freq: '', freqNote: '',
      explain: 'Gli apparecchi VDS non avanzati non sono destinatari dei servizi della navigazione aerea: resta fuori da spazi controllati e ATZ e ad almeno 5 km dagli aeroporti, salvo autorizzazione ENAC. Con la radio a bordo puoi fare le chiamate all’aria (scheda più sotto) e, in emergenza, MAYDAY e PAN PAN.',
      fonte: 'DPR 133/2010, art. 9 c. 2; RAIT.', steps: [] });
  } else {
    const fis = hits.find(h => ['FIR', 'FIS'].includes(h.a.type));
    const u = fis ? unitName(fis.a) : { name: 'Roma Informazioni', freq: '', note: 'Frequenza del settore FIS: verifica su carta o AIP (dipende dalla zona).', fromData: false };
    cards.push({ id: 'fis', title: 'Prima chiamata al servizio informazioni volo', unit: u.name, freq: u.freq, freqNote: u.note,
      explain: 'Prima chiami l’ente e dici chi sei. Quando l’ente risponde con il tuo nominativo e il suo, dai i dati in quest’ordine: nominativo, tipo, regole di volo, da dove a dove, posizione, quota, richiesta. Se non hai presentato il piano di volo, dillo: «VFR senza piano di volo».',
      fonte: `${RAIT}: SERA.14055 (prima la stazione chiamata, poi la chiamante), Allegato A (parole standard: richiediamo, ricevuto, riportate). Ordine dei dati: modello.`,
      steps: [
        { who: 'pilota', text: `${u.name}, ${cs}.` },
        { who: 'ente', text: `${cs}, ${u.name}.`, example: true },
        { who: 'pilota', text: `${cs}, ${type}, VFR da ${from} a ${to}, ${position}, ${alt(cruiseFt)}, richiediamo informazioni di traffico.` },
        { who: 'ente', text: `${cs}, QNH ${q}, [informazioni di traffico], riportate [punto].`, example: true },
        { who: 'pilota', text: `QNH ${q}, riporteremo [punto], ${cs}.` },
      ] });
  }

  for (const h of hits) {
    const a = h.a, cat = category(a), u = unitName(a);
    const lim = `${limitText(a.lower)}–${limitText(a.upper)}`;
    if (cat === 'P') cards.push({ id: a.id, title: `${a.name}: zona proibita`, unit: '', freq: '', freqNote: '', danger: true,
      explain: `Non esiste una chiamata per entrare in una zona proibita (${lim}). Cambia rotta o quota prima di arrivarci.`, steps: [] });
    else if (cat === 'CTRL' && !basico) {
      const z = zoneWord(a.type);
      cards.push({ id: a.id, title: `Attraversare ${a.name}`, unit: u.name, freq: u.freq, freqNote: u.note,
        explain: `Chiama qualche minuto prima del limite (${lim}). Non entrare finché non hai l’autorizzazione («autorizzati…» oppure «entrate nella ${z}…»). Ripeti sempre autorizzazioni, quote, QNH e codice transponder, con il nominativo alla fine.`,
        fonte: `${RAIT}, Allegato A: «entrate nello spazio aereo controllato (o zona di controllo) via … a …», «lasciate…», «squawk …»; read-back obbligatorio con nominativo. Richiesta del pilota: modello.`,
        steps: [
          { who: 'pilota', text: `${u.name}, ${cs}.` },
          { who: 'ente', text: `${cs}, ${u.name}.`, example: true },
          { who: 'pilota', text: `${cs}, ${type}, VFR da ${from} a ${to}, ${position}, ${alt(cruiseFt)}, richiediamo di attraversare la ${z} da [punto di ingresso] a [punto di uscita].` },
          { who: 'ente', text: `${cs}, entrate nella ${z} via [ingresso] a ${alt(cruiseFt)} o inferiore, QNH ${q}, squawk [codice], riportate [uscita].`, example: true },
          { who: 'pilota', text: `Entriamo nella ${z} via [ingresso] a ${alt(cruiseFt)} o inferiore, QNH ${q}, squawk [codice], riporteremo [uscita], ${cs}.` },
          { who: 'pilota', text: `${cs}, [punto di uscita], ${alt(cruiseFt)}, lasciamo la ${z}.` },
        ] });
    } else if (cat === 'ZONE' && !basico) cards.push({ id: a.id, title: `${a.name}: ${a.type === 'TMZ' ? 'transponder obbligatorio' : 'radio obbligatoria'}`, unit: u.name, freq: u.freq, freqNote: u.note,
      explain: a.type === 'TMZ' ? `Transponder acceso in modo C o S prima di entrare (${lim}).` : `Stabilisci il contatto radio prima di entrare e resta in ascolto finché sei dentro (${lim}).`,
      fonte: a.type === 'TMZ' ? 'SERA.6005 b) e RAIT.6005.' : `SERA.6005 a) e RAIT.6005; testo della chiamata: modello con parole dell’Allegato A.`,
      steps: a.type === 'TMZ' ? [] : [
        { who: 'pilota', text: `${u.name}, ${cs}.` },
        { who: 'pilota', text: `${cs}, ${type}, ${position}, ${alt(cruiseFt)}, entriamo nella RMZ diretti a [punto], riporteremo in uscita.` },
      ] });
    else if (cat === 'R' || cat === 'Q') cards.push({ id: a.id, title: `${a.name}: verificare se è attiva`, unit: basico ? '' : 'Roma Informazioni', freq: '', freqNote: basico ? '' : 'Frequenza del settore FIS: verifica su carta o AIP.',
      explain: `Prima del volo controlla NOTAM e AUP. ${basico ? 'Se non puoi saperlo con certezza, girale intorno.' : 'In volo puoi chiedere lo stato al servizio informazioni.'} Limiti: ${lim}.`,
      fonte: 'Testo della richiesta: modello.',
      steps: basico ? [] : [
        { who: 'pilota', text: `${cs}, richiediamo lo stato di attività della zona ${a.name}.` },
      ] });
  }

  // Chiamate all'aria: dove non c'è copertura radio dell'ente ATS e non è istituita una TIBA (RAIT.6005 d))
  const aria = (title, id, steps, extra = {}) => cards.push({ id, title, unit: 'A tutte le stazioni', freq: ARIA_FREQ,
    freqNote: 'Canale delle chiamate all’aria dal 1° gennaio 2026 (prima 130.000). Se il campo ha una frequenza propria pubblicata, usa quella.',
    explain: 'Chiamata all’aria: un messaggio a tutte le stazioni in ascolto, senza attendere risposta e senza autorizzazioni. Serve a farti trovare dagli altri traffici, quindi dì sempre dove sei e cosa farai.',
    fonte: `${RAIT}, RAIT.6005 d) (chiamate all’aria, canale 130.005); «A tutte le stazioni»: chiamata generale senza risposta (SERA.14001, materiale guida). Verbi del pilota dall’Allegato A (fraseologia AFIS): rulleremo, ci allineeremo, decolleremo, atterreremo, riattacchiamo. L’Allegato A non fissa parola per parola gli annunci sui campi senza ente: è un modello.`,
    steps, ...extra });

  for (const { role, a } of fields) {
    if (a.icao) continue; // negli aeroporti con codice ICAO valgono le procedure dell'ente
    const f = a.freqs.find(x => x.mhz), name = titleCase(a.name), rwy = a.rwy.length ? a.rwy.join(' o ') : '[pista]';
    const steps = role === 'partenza' ? [
      { who: 'pilota', text: `A tutte le stazioni, ${cs}, ${type}, ${name}, rulleremo per la pista ${rwy}.` },
      { who: 'pilota', text: `A tutte le stazioni, ${cs}, ${name}, ci allineeremo e decolleremo pista ${rwy}, poi verso ${to}.` },
      { who: 'pilota', text: `A tutte le stazioni, ${cs}, ${name}, lasciamo il circuito verso ${to}, ${alt(cruiseFt)}.` },
    ] : [
      { who: 'pilota', text: `A tutte le stazioni, ${cs}, ${type}, [distanza] miglia a [direzione] di ${name}, ${alt(cruiseFt)}, atterreremo a ${name}.` },
      { who: 'pilota', text: `A tutte le stazioni, ${cs}, ${name}, sottovento [sinistro o destro] pista ${rwy}.` },
      { who: 'pilota', text: `A tutte le stazioni, ${cs}, ${name}, finale pista ${rwy}.` },
      { who: 'pilota', text: `A tutte le stazioni, ${cs}, ${name}, riattacchiamo.`, example: true },
      { who: 'pilota', text: `A tutte le stazioni, ${cs}, ${name}, pista libera.` },
    ];
    const ch = f && channelOf(f.mhz);
    aria(`Chiamate all’aria: ${role === 'partenza' ? 'partenza da' : 'arrivo a'} ${name}`, `campo-${role}`, steps, f && ch !== ARIA_FREQ ? {
      freq: ch, unit: `${name}, a tutte le stazioni`,
      freqNote: `Frequenza del campo da openAIP: verificala sul manuale dell’aviosuperficie o con il gestore. Senza frequenza propria si usa il canale ${ARIA_FREQ}.` } : {});
  }
  aria('Chiamata all’aria in rotta', 'aria-rotta', [
    { who: 'pilota', text: `A tutte le stazioni, ${cs}, ${type}, ${position}, ${alt(cruiseFt)}, diretti a ${to}.` },
  ], { freqNote: 'Canale delle chiamate all’aria dal 1° gennaio 2026 (prima 130.000 MHz).', explain: 'Dove l’ente ATS non ti sente e non c’è una TIBA, ripeti l’annuncio a intervalli regolari, soprattutto vicino a passi, valli e campi di volo. Nessuna risposta è prevista.' });

  // Emergenza e urgenza (SERA.14095)
  const ente = basico ? '[ente in ascolto]' : '[ente]';
  cards.push({ id: 'mayday', title: 'Emergenza (MAYDAY)', unit: 'Ultima frequenza usata, oppure 121.5', freq: '121.5', freqNote: 'Squawk 7700.', danger: true,
    explain: 'Pericolo grave e imminente. «MAYDAY» tre volte, poi nell’ordine: ente chiamato (se c’è tempo), nominativo, natura dell’emergenza, intenzioni, posizione, quota e prua. Se non rispondono, ripeti su 121.5. Quando il pericolo è finito, devi annullare l’emergenza.',
    fonte: `${RAIT}, SERA.14095 b) (ordine dei dati), Allegato A; codice 7700. La frase di annullamento non è prescritta: modello.`,
    steps: [
      { who: 'pilota', text: `MAYDAY MAYDAY MAYDAY, ${ente}, ${cs}, [natura dell’emergenza], [intenzioni], ${position}, ${alt(cruiseFt)}, prua [gradi].` },
      { who: 'pilota', text: `${ente}, ${cs}, annulliamo l’emergenza, [motivo].`, example: true },
    ] });
  cards.push({ id: 'panpan', title: 'Urgenza (PAN PAN)', unit: 'Ultima frequenza usata', freq: '', freqNote: '',
    explain: 'Situazione urgente ma senza pericolo immediato (per esempio, non sei sicuro della posizione o hai un problema tecnico gestibile). «PAN PAN» tre volte, poi lo stesso ordine del MAYDAY e ogni altra informazione utile.',
    fonte: `${RAIT}, SERA.14095 c), Allegato A.`,
    steps: [{ who: 'pilota', text: `PAN PAN, PAN PAN, PAN PAN, ${ente}, ${cs}, [problema], [intenzioni], ${position}, ${alt(cruiseFt)}, prua [gradi], [altre informazioni].` }] });

  // Avaria radio: trasmissione all'aria (TRANSMITTING BLIND), messaggio ripetuto due volte
  cards.push({ id: 'radiofail', title: 'Avaria radio: trasmissione all’aria', unit: '', freq: '', freqNote: 'Squawk 7600.',
    explain: 'Prima riprova sull’ultima frequenza usata, poi su un’altra frequenza adatta, poi con ogni altro mezzo (anche il telefono). Se non riesci a stabilire il contatto, squawk 7600 e trasmetti comunque: comincia con «trasmissione all’aria» e ripeti il messaggio due volte. Se credi che funzioni solo il trasmettitore: «trasmissione all’aria per avaria al ricevitore», riporti agli orari o sui punti previsti e orario della prossima trasmissione. In volo VFR continua in VMC, atterra sull’aeroporto adeguato più vicino e comunica l’arrivo all’ente ATS con il mezzo più rapido (per esempio il telefono).',
    fonte: `SERA.14083 a) (tentativi di contatto), c) 2) (7600) e c) 3) (volo VFR), in vigore dal 1° maggio 2025; SERA.14085 per la trasmissione all’aria; formule italiane «trasmissione all’aria» (TRANSMITTING BLIND) e «trasmissione all’aria per avaria al ricevitore» (TRANSMITTING BLIND DUE TO RECEIVER FAILURE) dal RAIT.`,
    steps: [
      { who: 'pilota', text: `Trasmissione all’aria, ${ente}, ${cs}, ${position}, ${alt(cruiseFt)}, [intenzioni]. Ripeto: ${cs}, ${position}, ${alt(cruiseFt)}, [intenzioni].` },
      { who: 'pilota', text: `Trasmissione all’aria per avaria al ricevitore, ${ente}, ${cs}, ${position}, ${alt(cruiseFt)}, [intenzioni], prossima trasmissione alle [orario]. Ripeto: …` },
    ] });
  return cards;
}

// Messaggio di soccorso già compilato con i dati del momento (pulsante Emergenza in volo), nell'ordine di SERA.14095 b):
// ente chiamato, nominativo, natura dell'emergenza, intenzioni, posizione, quota, prua. Le parti che il programma non
// può sapere restano tra parentesi quadre. unit/freq: ente e frequenza in uso se noti, altrimenti 121.5.
// Scritto per AerIA VFR da fringuello79 di Avezzano.
export function maydayText({ profile, position, altFt, hdgM, unit = '', freq = '', intention = '[intenzioni]' }) {
  const cs = callsignFor(profile);
  const hdg = Number.isFinite(hdgM) ? `prua ${String(Math.round(((hdgM % 360) + 360) % 360) || 360).padStart(3, '0')}` : 'prua [gradi]';
  return {
    freq: freq || '121.5', unit: unit || 'Frequenza di emergenza', squawk: '7700',
    text: `MAYDAY MAYDAY MAYDAY, ${unit ? `${unit}, ` : ''}${cs}, [natura dell’emergenza], ${intention}, ${position}, ${Number.isFinite(altFt) ? alt(altFt) : '[quota]'}, ${hdg}.`,
  };
}
