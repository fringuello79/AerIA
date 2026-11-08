<!-- AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati. -->
# Assistente radio

La scheda **Radio** prepara le chiamate per la rotta pianificata, in italiano, già compilate con
nominativo, tipo di aereo, partenza, destinazione, posizione, quota e QNH. Ogni scheda riporta la sua fonte.

## Fonti (verificate il 7/11/2026)
| Fonte | Che cosa se ne ricava | Stato |
|---|---|---|
| ENAC, Regolamento «Regole dell'aria Italia» (RAIT) Ed. 4 Rev. 4 | RAIT.6005 d): chiamate all'aria su 130.000, dal 1° gennaio 2026 canale **130.005**; RAIT.14050 g): «ULTRALIGHT» (ULTRALEGGERO) prima del nominativo completo; RAIT.14001: la fraseologia è nell'Allegato A | letto sul testo vigente |
| RAIT Ed. 4, Allegato A «Fraseologia standard in lingua inglese ed italiana» | sostituisce la circolare ENAC ATM-08B (abrogata nel 2022) | indice letto; tabelle lette nella ATM-08B che le ha generate |
| Regolamento (UE) 923/2012 SERA, come modificato dal 2024/404 | SERA.14083 (avaria radio, in vigore dal 1° maggio 2025): tentativi di contatto, 7600, volo VFR; SERA.14085: trasmissione all'aria | letto |
| RAIT Ed. 3, Sezione 14 (testo storico) | formule italiane: «TRASMISSIONE ALL'ARIA», «TRASMISSIONE ALL'ARIA PER AVARIA AL RICEVITORE»; ordine di MAYDAY e PAN PAN; parole standard (RICEVUTO, AFFERMO, NEGATIVO, RIPETETE, RIPETO, RICHIEDIAMO…); alfabeto e numeri | letto, da riscontrare sull'Allegato A vigente |
| ENAC circolare ATM-08B (2022, abrogata) | esempi di numeri (QNH MILLE, OTTOCENTO PIEDI, UNO UNO OTTO DECIMALI ZERO), fraseologia AFIS lato pilota (RULLEREMO, CI ALLINEEREMO, DECOLLEREMO, ATTERREREMO, RIATTACCHIAMO), «A TUTTE LE STAZIONI» | letto |

Non ci sono circolari dell'Aero Club d'Italia sulla fraseologia: per i VDS valgono le stesse norme ENAC.

## Termini
- **Chiamata all'aria**: è il termine del RAIT.6005 d) per i messaggi periodici a tutti i traffici, dove l'ente ATS
  non ti sente e non c'è una TIBA. Lo usava già il decreto sulle aviosuperfici pubblicato in Gazzetta Ufficiale nel 1988 (130.0 MHz).
  Nell'app ne derivano le schede dei campi senza ente e la scheda «in rotta».
- **Trasmissione all'aria**: è la traduzione ufficiale di TRANSMITTING BLIND, cioè trasmettere senza contatto
  bilaterale in caso di avaria. Il messaggio si ripete due volte; con il solo ricevitore guasto:
  «trasmissione all'aria per avaria al ricevitore». «Trasmetto alla cieca» non è un termine della norma ed è stato tolto.
- **ULTRALEGGERO / ULTRALIGHT**: il RAIT.14050 g) Ed. 4 dà la parola inglese e quella italiana tra parentesi,
  come per tutte le parole standard; l'app usa «ULTRALEGGERO» nelle chiamate in italiano. Le indicazioni ENAV del 2012
  usavano «ULTRALIGHT» anche in italiano: in caso di dubbio chiedi all'istruttore o all'ente.

## Regole dell'app
- La chiamata iniziale nomina prima la stazione chiamata, poi la chiamante (SERA.14055). L'ente risponde con il tuo
  nominativo e il suo: non esiste un «avanti» nella fraseologia standard.
- Il read-back ripete autorizzazioni, quote, QNH e codici e finisce con il nominativo.
- **Enti e frequenze compaiono solo se sono nei dati** (openAIP) oppure nella norma (130.005, 121.5).
- **VDS non avanzato**: niente chiamate per entrare in spazi controllati; restano chiamate all'aria, MAYDAY e PAN PAN.
- Zone proibite: nessuna chiamata, solo l'indicazione di evitarle.
- Dove la norma fissa la formula, la frase la riporta; dove fissa solo l'ordine dei dati o non dice nulla
  (annunci sui campi senza ente, richiesta di attraversamento, annullamento del MAYDAY), la scheda scrive «modello».
- Scheda «Come si pronunciano i tuoi dati»: nominativo con l'alfabeto ICAO, quota con CENTO e MILA, QNH cifra per
  cifra (salvo QNH MILLE), frequenze con DECIMALI (le ultime due cifre zero non si dicono).

## Da fare
- Riscontrare ogni frase sul PDF del RAIT Ed. 4 Rev. 4, Allegato A (pagine 43-112), con paragrafo e pagina.
- Punti di riporto VFR (VRP) dall'AIP, per descrivere la posizione come si fa davvero alla radio.
- Versione inglese.
