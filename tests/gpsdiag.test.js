// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gpsDiagnosis } from '../web-prototype/src/gpsdiag.js';

const ok = { gpsPresente: true, gpsAcceso: true, reteAccesa: true, precisa: true, approssimativa: true, attivo: true, visti: 18, usati: 9, fixGps: 120, fixRete: 3, etaGpsS: 0.4, attesaS: 300, errore: '' };

test('diagnosi del GPS: permessi', () => {
  assert.equal(gpsDiagnosis(null), null);
  let d = gpsDiagnosis({ ...ok, precisa: false, approssimativa: false });
  assert.equal(d.short, 'permesso negato'); assert.equal(d.action, 'app');
  d = gpsDiagnosis({ ...ok, precisa: false });
  assert.equal(d.short, 'solo approssimativa'); assert.equal(d.lvl, 'crit'); assert.equal(d.action, 'app');
});

test('diagnosi del GPS: tablet senza GPS, GPS spento, errore', () => {
  assert.equal(gpsDiagnosis({ ...ok, gpsPresente: false, fixGps: 0 }).short, 'tablet senza GPS');
  assert.equal(gpsDiagnosis({ ...ok, gpsAcceso: false }).action, 'posizione');
  assert.equal(gpsDiagnosis({ ...ok, errore: 'SecurityException: x' }).short, 'errore');
});

test('diagnosi del GPS: in attesa della prima posizione', () => {
  let d = gpsDiagnosis({ ...ok, fixGps: 0, attesaS: 20, visti: 6, usati: 0 });
  assert.equal(d.lvl, 'warn'); assert.equal(d.short, 'attesa GPS 0/6 sat');
  assert.match(d.text, /meno di un minuto/);
  // app precedente (senza la forza del segnale): consiglio generico
  d = gpsDiagnosis({ ...ok, fixGps: 0, attesaS: 75, visti: 3, usati: 0 });
  assert.equal(d.lvl, 'crit'); assert.match(d.text, /cielo libero/);
  // caso del tablet di prova (22/11): 28 visti, nessuno usato, segnali deboli → al chiuso
  d = gpsDiagnosis({ ...ok, fixGps: 0, attesaS: 135, visti: 28, usati: 0, forti: 1 });
  assert.match(d.text, /Segnale troppo debole: 1 satelliti abbastanza forti su 28 visti/);
  // segnali forti ma ancora nessuna posizione: avvio a freddo, non si dà la colpa al cielo
  d = gpsDiagnosis({ ...ok, fixGps: 0, attesaS: 135, visti: 28, usati: 0, forti: 12 });
  assert.match(d.text, /orbite/); assert.doesNotMatch(d.text, /debole|cielo libero/);
});

test('diagnosi del GPS: rete, persa, buona', () => {
  assert.equal(gpsDiagnosis({ ...ok, etaGpsS: 12 }, 1, 'rete').short, 'dalla rete');
  assert.equal(gpsDiagnosis(ok, 14, 'gps').short, 'persa 14 s');
  assert.deepEqual([gpsDiagnosis(ok, 0.5, 'gps').lvl, gpsDiagnosis(ok, 0.5, 'gps').short], ['ok', 'GPS 9 sat']);
  assert.equal(gpsDiagnosis({ ...ok, usati: 3 }, 0.5, 'gps').lvl, 'warn');
});
