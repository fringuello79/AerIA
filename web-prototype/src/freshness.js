// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Età dei dati aeronautici, con regole verificabili.
// Le modifiche permanenti all'AIP entrano in vigore solo alle date del ciclo AIRAC (ICAO Annesso 15; Reg. (UE)
// 2017/373, AIS.TR.500): ogni 28 giorni a partire da una data di riferimento. Dati scaricati prima dell'inizio del
// ciclo in vigore nel giorno del volo possono non contenere modifiche già valide.
// Il programma non ha ancora NOTAM né attivazioni delle zone (AUP/UUP): lo dice sempre, come avviso.

const DAY = 86400e3;
// AIRAC 2001: 2 gennaio 2020 (tabella ICAO delle date AIRAC). I cicli seguenti si ottengono sommando 28 giorni.
const AIRAC_REF = Date.UTC(2020, 0, 2);
const CYCLE = 28 * DAY;

const utcDay = d => {
  if (typeof d === 'string') { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); if (!m) return NaN; return Date.UTC(+m[1], +m[2] - 1, +m[3]); }
  const t = new Date(d); return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
};
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const it = ms => { const s = iso(ms); return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`; };

// Ciclo AIRAC in vigore in una data (stringa AAAA-MM-GG o istante): { id: '2611', effective, next }
export function airacCycle(date) {
  const t = utcDay(date);
  if (!Number.isFinite(t)) return null;
  const k = Math.floor((t - AIRAC_REF) / CYCLE);
  const eff = AIRAC_REF + k * CYCLE;
  const y = new Date(eff).getUTCFullYear();
  // primo ciclo dell'anno: il primo con data di inizio dal 1° gennaio
  const k0 = Math.ceil((Date.UTC(y, 0, 1) - AIRAC_REF) / CYCLE);
  const n = k - k0 + 1;
  return { id: `${String(y).slice(2)}${String(n).padStart(2, '0')}`, effective: iso(eff), next: iso(eff + CYCLE) };
}

// Cicli AIRAC iniziati dopo «downloaded» e fino a «date» compresa (0 = dati dello stesso ciclo)
export function cyclesBehind(downloaded, date) {
  const a = utcDay(downloaded), b = utcDay(date);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.floor((b - AIRAC_REF) / CYCLE) - Math.floor((a - AIRAC_REF) / CYCLE);
}

// Avvisi sull'età dei dati per il giorno del volo (flightDate) visto da oggi (today).
// meta: pack.json del pacchetto caricato; null se sono dati dimostrativi.
export function freshnessWarnings({ meta, flightDate, today, demo = false }) {
  const W = [];
  const day = flightDate || today;
  const cyc = airacCycle(day);
  if (demo || !meta?.airspaces?.downloaded) {
    W.push({ lvl: 'crit', kind: 'dati', title: 'Dati dimostrativi, non reali', text: 'Spazi aerei e terreno sono inventati per la prova: non usarli per volare.' });
    return W;
  }
  const dl = meta.airspaces.downloaded;
  const behind = cyclesBehind(dl, day);
  const src = `${meta.airspaces.source || 'fonte'}, scaricati il ${it(utcDay(dl))}`;
  if (cyc && behind >= 2) {
    W.push({ lvl: 'crit', kind: 'dati', title: `Spazi aerei vecchi di ${behind} cicli AIRAC`,
      text: `Dati ${src}. Nel giorno del volo vale il ciclo ${cyc.id} (dal ${it(utcDay(cyc.effective))}): da allora sono entrati in vigore ${behind} emendamenti dell'AIP che questi dati possono non contenere. Aggiorna il programma prima di pianificare; nel frattempo usa la carta e l'AIP ufficiali.`,
      plain: `Gli spazi aerei sono stati scaricati il ${it(utcDay(dl))}: sono passati ${behind} aggiornamenti ufficiali. Aggiorna il programma; intanto usa la carta ufficiale.` });
  } else if (cyc && behind === 1) {
    W.push({ lvl: 'warn', kind: 'dati', title: `Spazi aerei del ciclo AIRAC precedente`,
      text: `Dati ${src}. Nel giorno del volo vale il ciclo ${cyc.id} (dal ${it(utcDay(cyc.effective))}): le sue modifiche possono mancare. Aggiorna il programma o confronta con la carta e l'AIP ufficiali.`,
      plain: `Gli spazi aerei sono di prima dell'ultimo aggiornamento ufficiale (${it(utcDay(cyc.effective))}). Aggiorna il programma o controlla sulla carta ufficiale.` });
  } else if (cyc) {
    W.push({ lvl: 'info', kind: 'dati', title: `Dati del ciclo AIRAC ${cyc.id}`,
      text: `Spazi aerei ${src}, dopo l'inizio del ciclo ${cyc.id} (${it(utcDay(cyc.effective))}); il prossimo inizia il ${it(utcDay(cyc.next))}. Sono dati comunitari, non ufficiali: la carta e l'AIP ENAV restano il riferimento.` });
  }
  W.push({ lvl: 'warn', kind: 'dati', title: 'NOTAM e attivazioni delle zone non caricati',
    text: 'Il programma non riceve ancora NOTAM né attivazioni delle zone (AUP/UUP): una zona R attiva, un campo chiuso o un ostacolo temporaneo non compaiono. Prima del volo fai il briefing ufficiale (ENAV Self Briefing o ARO-CBO).',
    plain: 'NOTAM e zone attive non sono nel programma: prima del volo controllali sul briefing ufficiale ENAV.' });
  return W;
}

// Spazi aerei lungo la rotta non modificati alla fonte da oltre «years» anni: solo informazione, non è un errore
export function staleAirspaceInfo(airspaces, today, years = 2) {
  const lim = utcDay(today) - years * 365.25 * DAY;
  const old = airspaces.filter(a => a.updatedAt && utcDay(a.updatedAt) < lim);
  if (!old.length) return [];
  const oldest = old.reduce((m, a) => (a.updatedAt < m ? a.updatedAt : m), old[0].updatedAt);
  return [{ lvl: 'info', kind: 'dati', title: `${old.length} ${old.length === 1 ? 'spazio aereo lungo la rotta' : 'spazi aerei lungo la rotta'} senza modifiche da oltre ${years} anni`,
    text: `Ultima modifica alla fonte: dal ${it(utcDay(oldest))}. È normale se nel frattempo non sono cambiati, ma non è una conferma: limiti e frequenze vanno confrontati con l'AIP in vigore. ${old.slice(0, 4).map(a => a.name).join('; ')}${old.length > 4 ? '…' : ''}` }];
}
