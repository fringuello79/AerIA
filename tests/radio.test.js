// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRadioCards, callsignFor, sayCallsign, sayAltitude, sayQnh, sayFreq, ARIA_FREQ, channelOf } from '../web-prototype/src/radio.js';

const ctr = { id: 'c', name: 'PESCARA CTR Z1', type: 'CTR', cls: 'D', lower: { value: 0, unit: 'FT', ref: 'GND' }, upper: { value: 4500, unit: 'FT', ref: 'MSL' }, freqs: [] };
const p80 = { id: 'p', name: 'LI-P80-AVEZZANO', type: 'P', cls: '', lower: { value: 0, unit: 'FT', ref: 'GND' }, upper: { value: 1500, unit: 'FT', ref: 'GND' }, freqs: [] };

test('VDS avanzato: ULTRALEGGERO in italiano, ULTRALIGHT in inglese (RAIT.14050 g)', () => {
  assert.equal(callsignFor({ callsign: 'i-a123', category: 'avanzato' }), 'ULTRALEGGERO I-A123');
  assert.equal(callsignFor({ callsign: 'i-a123', category: 'avanzato' }, 'en'), 'ULTRALIGHT I-A123');
  assert.equal(callsignFor({ callsign: 'I-ABCD', category: 'ag' }), 'I-ABCD');
});

test('VDS basico: nessuna chiamata per entrare negli spazi controllati', () => {
  const cards = buildRadioCards({ profile: { category: 'basico', callsign: 'I-A123' }, cruiseFt: 2500, qnh: 1013, hits: [{ a: ctr }] });
  assert.ok(!cards.some(c => c.id === 'c'));
  assert.ok(cards.some(c => c.id === 'mayday'));
});

test('attraversamento CTR: struttura completa e frequenza non inventata', () => {
  const cards = buildRadioCards({ profile: { category: 'avanzato', callsign: 'I-A123', acType: 'Tecnam P92' }, cruiseFt: 3000, qnh: 1018, hits: [{ a: ctr }, { a: p80 }] });
  const c = cards.find(x => x.id === 'c');
  assert.equal(c.freq, '');
  assert.match(c.freqNote, /non presente/);
  assert.match(c.steps[2].text, /ULTRALEGGERO I-A123, Tecnam P92, VFR .*richiediamo di attraversare la zona di controllo/);
  assert.match(c.steps[4].text, /QNH 1018/);
  const p = cards.find(x => x.id === 'p');
  assert.equal(p.steps.length, 0);
  assert.ok(p.danger);
});

test('pronuncia: alfabeto ICAO, numeri e frequenze come negli esempi dell\'Allegato A', () => {
  assert.equal(sayCallsign('ULTRALEGGERO I-A123'), 'ULTRALEGGERO INDIA ALFA UNO DUE TRE');
  assert.equal(sayCallsign('I-XJ'), 'INDIA X-RAY JULIETT');
  assert.equal(sayAltitude(800), 'OTTOCENTO PIEDI');
  assert.equal(sayAltitude(12000), 'DODICIMILA PIEDI');
  assert.equal(sayAltitude(1000), 'MILLE PIEDI');
  assert.equal(sayAltitude(2500), 'DUEMILA CINQUECENTO PIEDI');
  assert.equal(sayAltitude(17100), 'DICIASSETTEMILA CENTO PIEDI');
  assert.equal(sayQnh(1009), 'QNH UNO ZERO ZERO NOVE');
  assert.equal(sayQnh(1000), 'QNH MILLE');
  assert.equal(sayFreq('118.0'), 'UNO UNO OTTO DECIMALI ZERO');
  assert.equal(sayFreq('100.3'), 'UNO ZERO ZERO DECIMALI TRE');
  assert.equal(sayFreq('130.005'), 'UNO TRE ZERO DECIMALI ZERO ZERO CINQUE');
  assert.equal(sayFreq('122.525'), 'UNO DUE DUE DECIMALI CINQUE DUE CINQUE');
});

const field = { name: 'CELANO', icao: '', rwy: ['08', '26'], freqs: [] };
const all = cat => buildRadioCards({ profile: { category: cat, callsign: 'I-A123', acType: 'P92' }, to: 'Celano', cruiseFt: 3000, qnh: 1013, hits: [{ a: ctr }], fields: [{ role: 'arrivo', a: field }] });

test('chiamate all\'aria sui campi senza ente: canale 130.005, a tutte le stazioni, nessuna risposta', () => {
  for (const cat of ['basico', 'avanzato']) {
    const c = all(cat).find(x => x.id === 'campo-arrivo');
    assert.match(c.title, /^Chiamate all’aria: arrivo a Celano/);
    assert.equal(c.freq, ARIA_FREQ);
    assert.ok(c.steps.every(s => s.who === 'pilota' && s.text.startsWith('A tutte le stazioni, ')));
    assert.ok(c.steps.some(s => /sottovento .*pista 08 o 26/.test(s.text)));
    assert.match(c.fonte, /RAIT\.6005 d\)/);
  }
  const conFreq = buildRadioCards({ profile: { category: 'avanzato', callsign: 'I-A123' }, cruiseFt: 3000, qnh: 1013, fields: [{ role: 'partenza', a: { ...field, freqs: [{ mhz: '130.125' }] } }] });
  assert.equal(conFreq.find(x => x.id === 'campo-partenza').freq, '130.125');
  assert.ok(all('avanzato').some(c => c.id === 'aria-rotta'));
});

test('avaria radio: «trasmissione all\'aria», messaggio ripetuto, variante avaria al ricevitore, 7600', () => {
  const c = all('avanzato').find(x => x.id === 'radiofail');
  assert.match(c.steps[0].text, /^Trasmissione all’aria, .*Ripeto: /);
  assert.match(c.steps[1].text, /^Trasmissione all’aria per avaria al ricevitore, /);
  assert.match(c.freqNote, /7600/);
  for (const card of all('avanzato')) assert.ok(!/cieca|avanti/i.test(JSON.stringify(card)), card.id);
});

test('MAYDAY: ordine SERA.14095 (ente, nominativo, natura, intenzioni, posizione, quota, prua)', () => {
  const t = all('avanzato').find(x => x.id === 'mayday').steps[0].text;
  assert.match(t, /^MAYDAY MAYDAY MAYDAY, \[ente\], ULTRALEGGERO I-A123, \[natura dell’emergenza\], \[intenzioni\], .*3000 piedi, prua \[gradi\]\.$/);
  assert.ok(all('avanzato').every(c => c.fonte || c.steps.length === 0 || c.id === 'p'));
});

test('130.000 dei dati diventa il canale 130.005; le altre frequenze restano', () => {
  assert.equal(channelOf('130.000'), '130.005');
  assert.equal(channelOf('130.125'), '130.125');
  const c = buildRadioCards({ profile: { category: 'avanzato', callsign: 'I-A123' }, cruiseFt: 3000, qnh: 1013, fields: [{ role: 'arrivo', a: { ...field, freqs: [{ mhz: '130.000' }] } }] });
  assert.equal(c.find(x => x.id === 'campo-arrivo').freq, '130.005');
});
