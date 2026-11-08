// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Liste di controllo per aereo. Il programma non inventa liste: contiene solo quelle ufficiali dell'Aeroclub dei Marsi
// (checklists-acm.js, trascritte in automatico dai documenti originali); le altre il pilota le copia dal manuale di
// volo del suo aereo e si salvano sul dispositivo. Formato del testo delle liste personali:
//   # Titolo della lista          (una riga che comincia con «#»)
//   Voce ..... VALORE            (una voce per riga; righe vuote ignorate)
// Una lista il cui titolo contiene «emergenza» compare anche nel pannello Emergenza.
import { ACM_CHECKLISTS } from './checklists-acm.js';

export function parseChecklists(text) {
  const lists = []; let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) { cur = { title: line.replace(/^#+\s*/, '') || 'Lista', items: [] }; lists.push(cur); continue; }
    if (!cur) { cur = { title: 'Lista', items: [] }; lists.push(cur); }
    cur.items.push(line.replace(/^[-*•]\s*/, ''));
  }
  return lists.filter(l => l.items.length);
}
export const isEmergency = l => /emergenz/i.test(l.title);
// Testo della lista di nuovo in formato modificabile
export const checklistText = lists => lists.map(l => `# ${l.title}\n${l.items.join('\n')}`).join('\n\n');

// ---------------------------------------------------------------- liste dell'aeroclub (dai documenti originali)
// Documento dell'aeroclub per un aereo: profilo di riferimento o sua copia personale («acm-golf-…»).
export function clubDoc(acId) {
  return ACM_CHECKLISTS.find(d => acId === d.aircraft || String(acId || '').startsWith(`${d.aircraft}-`)) || null;
}
// Elenco unico mostrato nel pannello: prima le liste dell'aeroclub (non modificabili), poi la tabella del motore e
// delle velocità, poi le liste personali scritte dal pilota. Voci: { t, v, c } spuntabili; { h } sottotitolo;
// { alert, t, note } riquadro d'attenzione.
export function allLists(acId, userText) {
  const doc = clubDoc(acId), out = [];
  if (doc) {
    doc.lists.forEach((l, i) => out.push({ title: l.title, items: l.items, club: true, last: i === doc.lists.length - 1 }));
    if (doc.ref?.length) out.push({ title: doc.refTitle || 'Dati del motore e velocità', ref: doc.ref, club: true, items: [] });
  }
  for (const l of parseChecklists(userText)) out.push({ title: l.title, items: l.items.map(t => ({ t })), club: false });
  return { doc, lists: out };
}
export const isCheckable = it => !!it.t && !it.h && !it.alert;
