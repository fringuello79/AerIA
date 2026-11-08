<!-- AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati. -->
# Verifica dei dati e delle regole (7 novembre 2026, versione 0.18.0)

Tre controlli indipendenti, fatti da verificatori che non avevano scritto il codice, più i riscontri diretti sulle fonti
per i punti più gravi. Qui c'è che cosa è stato trovato, che cosa è stato corretto e che cosa resta aperto.

**Fonti non raggiungibili in questa verifica**: AIP ENAV (eAIP, richiede l'accesso), normattiva.it, openAIP,
OurAirports, EUR-Lex. Per questo i dati aeronautici di openAIP **non** sono stati confrontati con l'AIP (età dei dati e fonti NOTAM: vedi
[fonti-dati.md](fonti-dati.md#età-dei-dati-8112026), 8/11/2026): dove un'altra
fonte pubblica (SkyVector, non ufficiale) è diversa, il dato è segnalato «da verificare», non cambiato.

## 1. Regole e costanti

| Che cosa | Prima | Dopo (0.18.0) | Fonte |
|---|---|---|---|
| Limite VDS (apparecchi art. 2 lett. b DPR 133/2010) | 500 ft feriali, 1000 ft sabato, domenica e festivi | **1000 ft ogni giorno** sul rilievo più alto entro 5 km, salvo autorizzazione ENAC; 500 ft scelti a mano nelle zone VDS che lo prevedono | RAIT Ed. 4 Rev. 4 del 12/06/2025, RAIT.5005 d)2)i e ii (letto sul PDF ENAC). Il 500/1000 era il testo del DPR del 2010, superato dal RAIT che recepisce SERA |
| Margine dal terreno lungo la rotta e in volo | terreno sulla sola linea della rotta | rilievo più alto entro **150 m** | SERA.5005 f)2) (raggio di 150 m); motivo: vette fino a 41 m più basse nel punto esatto (vedi § 3) |
| Spazi aerei: classe A | «serve autorizzazione» | VFR vietato | SERA.6001 |
| Spazi aerei: classe E | «serve autorizzazione» | nessuna autorizzazione né radio continua | SERA.6001 |
| ATZ non controllate (AFIS o classe G) | «serve autorizzazione» | zona radio obbligatoria, senza autorizzazione | RAIT.6005 b)1) |
| VDS non avanzato in spazi controllati, ATZ, entro 5 km dagli aeroporti | vietato | vietato, «salvo autorizzazione ENAC» aggiunto | DPR 133/2010 art. 9 |
| Meteo «sotto i minimi VFR» | categorie FAA IFR/LIFR | visibilità sotto 1500 m (SERA.5001, classe G) o base sotto 1000 ft = da risolvere; base sotto 1500 ft o visibilità sotto 5 km = da controllare con il riferimento a SERA.5005 b) (CTR) | SERA.5001, SERA.5005 b) |
| 1000 ft dalle nubi | sempre | citato come vale: sopra 3000 ft AMSL o 1000 ft dal suolo | SERA.5001, RAIT Tab. R5-1 |
| Notte, PPL | tramonto + 30 min («AIP ENR 1.1») | fine del crepuscolo civile (sole a −6°) | SERA art. 2, definizione di notte |
| Giorno, VDS | sorgere − 30 / tramonto + 30 («AIP ENR 1.1») | stesso, citato dal DPR 133/2010 art. 2 lett. h) e art. 9 c. 1, senza uscire dal crepuscolo civile | DPR 133/2010 |
| Fraseologia | «RAIT.14020, 14035, 14055, 14095» | SERA.14020 (alfabeto), 14035 e 14040 (numeri), 14055 (chiamata), 14095 (MAYDAY, PAN PAN); RAIT.14050 g) resta | SERA, Regolamento (UE) 923/2012 |
| Ostacoli | «500 ft entro 600 m richiesti da SERA.5005 f)» | indicato come criterio del programma, con i valori veri di SERA.5005 f) | SERA.5005 f)1) e 2) |
| Ostacoli senza altezza (94 %) | 200 m | pale eoliche 200 m; torri, antenne, ciminiere 300 m | ipotesi prudente dichiarata (esistono tralicci di 269 m) |
| MSA del log | «quota minima di sicurezza» (attenzione) | «MSA del log», criterio di pianificazione (informazione) | non è una norma VFR |

Confermati senza modifiche: 130.005 per le chiamate all'aria dal 1/1/2026 (RAIT.6005 d)); ULTRALEGGERO prima del
nominativo (RAIT.14050 g)); avaria radio (SERA.14083, in vigore dal 1/5/2025; SERA.14085); codici 7000, 7600, 7700;
festività (L. 151/2025); declinazione magnetica WMM2025 (errore massimo 0,0003°); geoide EGM96 (errore massimo 0,34 m).

## 2. Liste di controllo dell'aeroclub

Trascritte senza cambiare nulla. I valori confrontati con i manuali pubblici di Tecnam e Rotax che risultano diversi
compaiono nell'app come nota «da verificare» (web-prototype/src/checklists-note.js). Da portare al club, per primi:

1. **Sierra I-A952, Vne 285 km/h**: il manuale P2002 Sierra 600 kg (US-LSA, 2008) indica 138 KIAS = 256 km/h; anche
   Vno (204) e Vfe (124) sono più basse. Da confrontare con il manuale della versione esatta di I-A952 (IAS o CAS).
2. **Golf, pressione carburante «0.2 - 0.4 psi»**: per il Rotax 912 è 0,15–0,4 bar (2,2–5,8 psi): l'unità è bar.
3. **Numeri per chiudere il piano di volo**: dal 1/2/2026 l'ufficio è unico, ARO-CBO Italy, Roma, H24, 06 7981 1011
   (NOTAM E0064/26, letto su fonti non ufficiali); Milano risulta chiuso; 06 702 2021 non trovato.
4. **Sierra, «Vx (Flap 0°) 130 km/h»** più alta di Vy (126): probabile etichetta scambiata.
5. **Starter «max 13 s»** su entrambe: Rotax e Tecnam indicano 10 s, poi 2 minuti di raffreddamento.
6. **Golf, motore**: i limiti di temperatura (olio 130 °C, testate 135 °C) sono del 912 ULS; per il 912 UL il manuale
   indica 140 e 150 °C. Il profilo del programma dice 912 UL: il club confermi.
7. Minori: velocità di stallo del Golf più alte del manuale (lato prudente), riscaldamento a 2800 giri, giri minimi 2000
   sul Golf, prova magneti 300/115 (500/150 nel manuale Rotax del 2023).

Nota: la checklist del Sierra porta le marche **I-A952**; da confermare quale Sierra dell'aeroclub descrive.

## 3. Terreno

- Pacchetto «centro»: nel punto esatto di 330 vette su 17 877 la quota era più bassa di oltre 30 m (Corno Grande
  −41 m, Sirente −32 m), perché la correzione alzava il blocco più alto vicino alla vetta e non quello che la contiene.
  Corretto in due modi: nel programma (rilievo entro 150 m, § 1) e in tools/make_region.py (alzato anche il blocco della
  vetta; il controllo finale ora guarda il punto esatto). Il pacchetto si rigenera con il workflow «Pacchetto dati».
- Pacchetto «marsica» (ripiego se manca «centro»): senza correzione delle vette (Sirente −32 m). Da rigenerare o togliere.

## 4. Dati openAIP (di terzi, non modificati)

Differenze da un'altra fonte pubblica (SkyVector), da verificare sull'AIP ENAV e poi segnalare a openAIP; nell'app un
avviso informativo compare quando la rotta passa entro 10 km:

| Campo | Differenza |
|---|---|
| LIRZ Perugia | quota 636 ft contro 697 ft |
| LIRH Frosinone | posizione spostata di circa 560 m, quota 574 contro 632 ft, mancano TWR e GND |
| LIRE Pratica di Mare | piste e posizione (circa 640 m) |
| LIRF Fiumicino | lunghezza della pista 07/25 |
| LIRM Grazzanise | designatori e lunghezze delle piste |
| LIRG Guidonia | pista 04/22 contro 03/21 |
| LIAF Foligno | due piste chiamate entrambe 17/35 |
| LIBP Pescara, LIRU Urbe | quota più bassa di 20–25 ft |

Spazi aerei: limiti non confrontati con l'AIP; anomalie interne da controllare: «ROMA CTR Z6» con base a 2491 ft,
riferimenti diversi tra ATZ e CTR di Perugia, refusi nei nomi («NETTTUNO», «CITTC DEL VATICANO»). Radioassistenze: 9 su
19 coincidono con l'altra fonte, le altre non verificate.
