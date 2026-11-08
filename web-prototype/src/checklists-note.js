// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Note del programma sulle liste dell'Aeroclub dei Marsi: valori da far verificare al club, trovati confrontando le
// liste con la documentazione pubblica del costruttore (verifica del 7/11/2026). Non cambiano il testo dell'aeroclub:
// compaiono accanto alla riga, in arancio, come «da verificare». Si tolgono quando il club pubblica la revisione.
export const CHECKLIST_NOTES = {
  'acm-golf': {
    ref: {
      'Pressione Carburante': 'Unità da verificare: per il Rotax 912 la pressione del carburante è 0,15–0,4 bar (2,2–5,8 psi), quindi «0.2 - 0.4» sono bar, non psi (Rotax, manuale d’uso 912).',
      'Temperatura Olio': 'I limiti 130 °C (olio) e 135 °C (testate) sono quelli del 912 ULS (Golf/100); per il 912 UL il manuale P96 indica 140 e 150 °C. Il club confermi il motore dell’aereo.',
    },
    alert: 'Rotax e Tecnam indicano lo starter per al massimo 10 secondi, poi 2 minuti di raffreddamento: da verificare con il club.',
    footer: 'Dal 1/2/2026 l’ufficio per i piani di volo è unico, ARO-CBO Italy a Roma, H24, tel. 06 7981 1011 (NOTAM E0064/26, letto su fonti non ufficiali): il numero di Milano risulta chiuso e lo 06 702 2021 non è stato trovato. Verifica sull’AIP (GEN 3.1).',
  },
  'acm-sierra': {
    ref: {
      'Vne': 'Da verificare sul manuale di I-A952: il manuale P2002 Sierra 600 kg (2008) indica 138 KIAS = 256 km/h. Lo stesso per Vno (110 KIAS = 204 km/h) e Vfe (67 KIAS = 124 km/h).',
      'Vx (Flap 0°)': 'Vx più alta di Vy (126 km/h): probabile etichetta scambiata (nel manuale citato Vx = 60 KIAS = 111 km/h).',
    },
    alert: 'Rotax e Tecnam indicano lo starter per al massimo 10 secondi, poi 2 minuti di raffreddamento: da verificare con il club.',
    footer: 'Ufficio unico ARO-CBO Italy, H24, dal 1/2/2026 (NOTAM E0064/26, letto su fonti non ufficiali): il numero coincide. Verifica sull’AIP (GEN 3.1).',
  },
};
export const noteFor = (acId, kind, key) => {
  const n = Object.entries(CHECKLIST_NOTES).find(([k]) => acId === k || String(acId || '').startsWith(`${k}-`))?.[1];
  if (!n) return '';
  return kind === 'ref' ? n.ref?.[key] || '' : n[kind] || '';
};
