// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Planata in emergenza: fin dove si arriva in ogni direzione con l'efficienza del manuale, il vento e un margine.
// Modello: velocità vera di planata costante (quella del manuale), efficienza costante rispetto all'aria. Il vento
// cambia la velocità al suolo e quindi l'efficienza rispetto al suolo: E_suolo = E · GS / TAS. Il margine riduce
// l'efficienza (prudenza per manovre, vento non noto, motore che si ferma in virata). Ci si ferma dove la quota
// scende sotto il terreno più un'altezza minima di arrivo. Codice di fringuello79 di Avezzano.
import { FT, NM, destPoint } from './geo.js';
import { windTriangle } from './navlog.js';

// Efficienza rispetto al suolo planando con rotta brg (gradi veri). wind: { dir, kt } (da dove soffia), tasKt.
export function groundGlideRatio(ratio, brg, tasKt, wind, marginPct = 0) {
  const r = ratio * (1 - Math.max(0, Math.min(90, marginPct)) / 100);
  if (!wind || !(wind.kt > 0) || !(tasKt > 0)) return r;
  const w = windTriangle(brg, tasKt, wind);
  return Number.isFinite(w.gs) && w.gs > 0 ? r * w.gs / tasKt : 0;
}

// Distanza raggiungibile (metri) lungo brg partendo da pos a altFt. terrainFt(lon, lat) → ft; arriveAglFt: quota
// minima sopra il terreno all'arrivo (0 = fino a toccare il suolo).
export function glideReachM({ pos, altFt, ratio, brg, tasKt, wind = null, marginPct = 0, terrainFt, maxNm = 30, stepM = 250, arriveAglFt = 0 }) {
  const e = groundGlideRatio(ratio, brg, tasKt, wind, marginPct);
  if (!(e > 0)) return 0;
  for (let d = stepM; d <= maxNm * NM; d += stepM) {
    const p = destPoint([pos.lon, pos.lat], brg, d / NM), h = altFt - d * FT / e, t = terrainFt(p[0], p[1]);
    // terreno non noto (fuori dai dati): ci si ferma, non lo si considera a livello del mare
    if (!Number.isFinite(t) || !(h > t + arriveAglFt)) return d - stepM;
  }
  return maxNm * NM;
}

// Quota con cui si arriva sopra un punto (campo) a distanza dM con rotta brg; NaN se l'efficienza è nulla.
export function arrivalHeightFt({ altFt, dM, ratio, brg, tasKt, wind = null, marginPct = 0, fieldElevFt = 0 }) {
  const e = groundGlideRatio(ratio, brg, tasKt, wind, marginPct);
  return e > 0 ? altFt - dM * FT / e - fieldElevFt : NaN;
}
