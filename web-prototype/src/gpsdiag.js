// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Perché manca la posizione (dalla 0.23.1). Dallo stato del modulo nativo della posizione (PosizionePlugin.java) si
// ricava una spiegazione per il pilota, con che cosa fare. Regole pure, verificate dai test. Codice di fringuello79
// di Avezzano.

// st: stato del modulo nativo { gpsPresente, gpsAcceso, reteAccesa, precisa, approssimativa, attivo, visti, usati,
// fixGps, fixRete, etaGpsS, attesaS, errore }; ageS: secondi dall'ultima posizione usata; fonte: 'gps' | 'rete' | ''.
// Restituisce { lvl: 'ok'|'warn'|'crit', short, text, action } dove action è '' | 'app' (impostazioni dell'app) |
// 'posizione' (impostazioni della posizione di Android).
export const SKY_S = 60;      // dopo un minuto senza posizione con pochi satelliti: «serve il cielo libero»
export function gpsDiagnosis(st, ageS = 0, fonte = '') {
  if (!st) return null;
  const sat = `${st.visti || 0} satelliti visti, ${st.usati || 0} usati`;
  if (!st.precisa && !st.approssimativa) return { lvl: 'crit', short: 'permesso negato', action: 'app', text: 'L’app non ha il permesso di usare la posizione: Impostazioni → App → AerIA VFR → Autorizzazioni → Posizione → «Consenti solo mentre l’app è in uso» e «Usa posizione precisa».' };
  if (!st.precisa) return { lvl: 'crit', short: 'solo approssimativa', action: 'app', text: 'Hai concesso solo la posizione approssimativa: Android la dà ogni pochi minuti e con chilometri di errore, inutile per volare. Impostazioni → App → AerIA VFR → Autorizzazioni → Posizione → attiva «Usa posizione precisa».' };
  if (st.errore) return { lvl: 'crit', short: 'errore', action: '', text: `Il GPS del tablet non è partito (${st.errore}). Ferma e riavvia il GPS; se si ripete, riavvia il tablet.` };
  if (!st.gpsPresente) return { lvl: 'crit', short: 'tablet senza GPS', action: '', text: `Questo tablet non ha il ricevitore GPS: la posizione arriva solo dalla rete Wi-Fi (a terra, imprecisa; in volo niente). Per volare serve un GPS esterno via Bluetooth (Impostazioni → Strumenti esterni).${st.fixRete ? ' Ora la posizione viene dalla rete.' : ''}` };
  if (!st.gpsAcceso) return { lvl: 'crit', short: 'GPS spento', action: 'posizione', text: 'La posizione di Android è spenta: accendila (tendina in alto → «Posizione», o Impostazioni → Posizione).' };
  if (!st.fixGps) {
    // forti = satelliti con segnale ≥ 25 dB-Hz (dalla 0.23.2; assente nelle app precedenti)
    const wait = Math.round(st.attesaS || 0), known = Number.isFinite(st.forti), forti = st.forti || 0;
    let why;
    if (wait < SKY_S) why = ' Attendi all’aperto: la prima posizione arriva di solito in meno di un minuto.';
    else if (known && forti < 4) why = ` Segnale troppo debole: ${forti} satelliti abbastanza forti su ${st.visti || 0} visti. Succede al chiuso o vicino a una finestra: esci all’aperto, lontano da edifici e alberi.`;
    else if (known) why = ` Il segnale è buono (${forti} satelliti forti): il GPS sta scaricando i dati delle orbite, come dopo tanto tempo senza usarlo. Tieni l’app aperta all’aperto: la prima volta può servire fino a 10–15 minuti, poi la posizione arriva in pochi secondi.`;
    else why = ' Serve il cielo libero (all’aperto, lontano da edifici; in casa il GPS di solito non riceve). La prima posizione può richiedere qualche minuto se il GPS non è stato usato a lungo.';
    return { lvl: wait >= SKY_S ? 'crit' : 'warn', short: `attesa GPS ${st.usati || 0}/${st.visti || 0} sat`, action: '', text: `In attesa della prima posizione dal GPS da ${wait} s: ${sat}${known ? ` (${forti} con segnale forte)` : ''}.${why}${st.fixRete ? ' Intanto c’è una posizione dalla rete, imprecisa (non usarla in volo).' : ''}` };
  }
  if (fonte === 'rete') return { lvl: 'warn', short: 'dalla rete', action: '', text: `Il GPS non dà posizione da ${Math.round(st.etaGpsS)} s (${sat}): si usa quella della rete, imprecisa. Controlla che il tablet veda il cielo.` };
  if (ageS > 10) return { lvl: 'crit', short: `persa ${Math.round(ageS)} s`, action: '', text: `Il GPS ha smesso di dare la posizione da ${Math.round(ageS)} s (${sat}). Di solito è il cielo coperto dal tettuccio o dal cruscotto: sposta il tablet vicino al vetro.` };
  return { lvl: (st.usati || 0) < 4 ? 'warn' : 'ok', short: `GPS ${st.usati || 0} sat`, action: '', text: `GPS del tablet: ${sat}.` };
}
