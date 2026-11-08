// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACM_CHECKLISTS } from '../web-prototype/src/checklists-acm.js';
import { allLists, clubDoc, isCheckable } from '../web-prototype/src/checklist.js';

// Conteggi controllati a vista sui documenti originali (docs/checklist/): se cambiano, è cambiata la trascrizione
test('liste dell’aeroclub: P96 Golf Rev3, nove fasi come nel documento', () => {
  const g = clubDoc('acm-golf');
  assert.equal(g.rev, 'Rev3 del 23/08/2026');
  assert.deepEqual(g.lists.map(l => l.items.filter(isCheckable).length), [12, 12, 10, 12, 2, 3, 4, 6, 10]);
  assert.deepEqual(g.lists[0].items.slice(0, 2), [{ h: 'CONTROLLI MOTORE' }, { t: 'RUBINETTI CARBURANTE', v: 'ENTR. APERTI', c: 'r' }]);
  assert.deepEqual(g.lists[1].items.at(-1), { t: "VIA DALL'ELICA!", note: 'STARTER ( MAX 13 SECONDI )', alert: true });
  assert.ok(g.ref.some(([k, v]) => k === 'MAX vento laterale' && v === '15 KTS'));
  assert.equal(g.ref.length, 29);
  assert.match(g.footer[0][1], /ARO CIAMPINO/);
});

test('liste dell’aeroclub: P2002 Sierra I-A952 V 1.0, nove fasi', () => {
  const s = clubDoc('acm-sierra');
  assert.match(s.title, /I-A952/);
  assert.equal(s.rev, 'V 1.0 EN – 22/10/2026');
  assert.deepEqual(s.lists.map(l => l.items.filter(isCheckable).length), [12, 12, 11, 14, 3, 4, 6, 8, 6]);
  assert.deepEqual(s.lists[3].items[1], { h: 'Engine at 4000 RPM:', c: 'b' });
  assert.ok(s.ref.some(([k, v]) => k === 'Vbg (best glide)' && v === '123 Km/h'));
  assert.equal(s.ref.length, 26);
});

test('liste: copie personali del profilo, liste aggiunte dal pilota, nessuna lista per altri aerei', () => {
  assert.equal(clubDoc('acm-golf-1762500000000').aircraft, 'acm-golf');
  assert.equal(clubDoc('ac1762500000000'), null);
  const { lists } = allLists('acm-sierra', '# Mia lista\nVoce 1');
  assert.equal(lists.length, 9 + 1 + 1);
  assert.equal(lists.at(-1).club, false);
  assert.equal(lists[9].ref.length, 26);
  assert.equal(allLists('ac1', '').lists.length, 0);
  // ogni voce spuntabile ha un valore; i colori sono solo quelli dei documenti
  for (const d of ACM_CHECKLISTS) for (const l of d.lists) for (const it of l.items) {
    if (isCheckable(it)) assert.ok(it.v, `${l.title}: ${it.t}`);
    if (it.c) assert.ok(['r', 'y', 'g', 'b'].includes(it.c));
  }
});

test('note «da verificare» del programma: solo su righe che esistono nei documenti', async () => {
  const { CHECKLIST_NOTES, noteFor } = await import('../web-prototype/src/checklists-note.js');
  for (const [ac, n] of Object.entries(CHECKLIST_NOTES)) {
    const d = clubDoc(ac);
    for (const k of Object.keys(n.ref || {})) assert.ok(d.ref.some(([kk]) => kk === k), `${ac}: ${k}`);
  }
  assert.match(noteFor('acm-golf-123', 'ref', 'Pressione Carburante'), /bar/);
  assert.equal(noteFor('acm-golf', 'ref', 'Vne'), '');
  assert.equal(noteFor('ac1', 'footer'), '');
});
