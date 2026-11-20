// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Discesa guidata verso il campo d'arrivo (dalla 0.23.0). Stesso obiettivo della pianificazione (vprofile.js): essere
// alla quota di circuito sopra il campo d'arrivo, scendendo con il rateo del profilo dell'aereo. Distanza lungo la rotta
// che resta (o diretta, con «Diretto»). Regole pure, verificabili con i test. Codice di fringuello79 di Avezzano.

// altFt: quota attuale; targetFt: quota da avere sul campo (campo + circuito); distNm: distanza che resta al campo;
// gsKt: velocità al suolo; rateFpm: rateo di discesa pianificato (positivo).
// Restituisce null se mancano i dati (velocità sotto 20 kt, distanza nulla), altrimenti:
//  todNm      miglia dal punto d'inizio discesa (positive = davanti; negative = già passato)
//  todS       secondi al punto d'inizio discesa alla velocità attuale (negativi se passato)
//  devFt      scarto dal profilo (positivo = sopra), solo dopo l'inizio discesa, altrimenti 0
//  vsrFpm     rateo necessario da adesso per arrivare alla quota obiettivo sul campo (negativo = discesa)
//  state      'crociera' (prima dell'inizio discesa) | 'discesa' (sul profilo o vicino) | 'in quota' (già entro 100 ft)
//  steep      true se il rateo necessario supera di metà quello pianificato (discesa iniziata tardi)
export function descentGuide({ altFt, targetFt, distNm, gsKt, rateFpm }) {
  if (![altFt, targetFt, distNm, gsKt, rateFpm].every(Number.isFinite) || gsKt < 20 || distNm <= 0 || rateFpm <= 0) return null;
  const minToGo = distNm / gsKt * 60;
  const vsrFpm = (targetFt - altFt) / minToGo;
  const excess = altFt - targetFt;
  if (excess <= 100) return { todNm: NaN, todS: NaN, devFt: 0, vsrFpm, state: 'in quota', steep: false };
  const ftPerNm = rateFpm / gsKt * 60;                 // piedi persi per miglio al rateo pianificato
  const todNm = distNm - excess / ftPerNm;
  const todS = todNm / gsKt * 3600;
  const devFt = todNm <= 0 ? altFt - (targetFt + distNm * ftPerNm) : 0;
  return { todNm, todS, devFt, vsrFpm, state: todNm > 0 ? 'crociera' : 'discesa', steep: -vsrFpm > rateFpm * 1.5 };
}

// Annunci a voce legati alla discesa (ognuno una sola volta per campo d'arrivo, lo decide l'app):
//  'tod-1'  tra 60 e 15 s dall'inizio discesa
//  'tod'    da 15 s prima a 60 s dopo l'inizio discesa (se si è passati senza annuncio, lo si dà subito)
export function descentCues(g) {
  if (!g || g.state === 'in quota' || !Number.isFinite(g.todS)) return [];
  if (g.todS <= 60 && g.todS > 15) return ['tod-1'];
  if (g.todS <= 15 && g.todS > -60) return ['tod'];
  return [];
}
