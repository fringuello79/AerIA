// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Consigliere di quota: per ogni quota di crociera possibile, che cosa cambia (terreno, limite VDS, spazi aerei da
// chiamare o evitare, tempo, carburante, vento) e se la quota rispetta i livelli semicircolari VFR. Propone, non impone:
// il pilota sceglie e un tocco applica la quota. Calcoli a regole, verificabili. Codice originale di fringuello79 di Avezzano.
//
// Ingressi:
// - samples: campioni della rotta pianificata (analyseRoute) con terr, vds, phase e air [{ a, lo, hi }] (ft AMSL)
// - minFt: quota minima dei tratti (rilievo più alto del corridoio + 500 ft, legCorridorMinFt)
// - pilot: 'basico' | 'avanzato' | 'ag'; rule(a, pilot) → { need, level } (entryRule di airspace.js)
// - magTrackDeg: rotta magnetica del tratto più lungo (per i livelli semicircolari)
// - navAt(alt) → { min, fuelL, headKt } oppure null (log di navigazione con il vento alla quota)
export const NEED_ORDER = ['vietato', 'verifica', 'autorizzazione', 'transponder', 'radio', 'evitare'];

// SERA.5005 g) e appendice 3: sopra 3000 ft dal suolo, rotte magnetiche 000–179 → migliaia dispari + 500 ft
// (3500, 5500, 7500…), 180–359 → migliaia pari + 500 ft (4500, 6500…). Indicativo: in Italia sopra l'altitudine di
// transizione si usano i livelli di volo; il RAIT può fissare altro (da confermare).
export function semicircularOk(altFt, magTrackDeg) {
  if (!Number.isFinite(magTrackDeg)) return null;
  if (Math.round(altFt) % 1000 !== 500) return false;
  const east = ((magTrackDeg % 360) + 360) % 360 < 180, odd = Math.floor(altFt / 1000) % 2 === 1;
  return east === odd;
}

export function altitudeOptions({ samples, minFt, pilot, rule, magTrackDeg = NaN, navAt = null, fromFt = 1500, toFt = 9500, stepFt = 500 }) {
  const cruise = samples.filter(s => s.phase === 'cruise');
  const S = cruise.length ? cruise : samples;
  const maxTerr = Math.max(...S.map(s => s.terr).filter(Number.isFinite));
  const vdsMax = pilot === 'basico' ? Math.min(...S.map(s => s.vds).filter(Number.isFinite)) : Infinity;
  const rows = [];
  const lo = Math.max(fromFt, Math.ceil((Number.isFinite(maxTerr) ? maxTerr + 500 : fromFt) / stepFt) * stepFt - 4 * stepFt);
  for (let alt = lo; alt <= toFt; alt += stepFt) {
    const hit = new Map();
    for (const s of S) for (const h of s.air || []) if (alt >= h.lo && alt <= h.hi) hit.set(h.a, true);
    const air = {}; const names = [];
    for (const a of hit.keys()) {
      const r = rule(a, pilot);
      if (!r || r.need === 'nessuno') continue;
      air[r.need] = (air[r.need] || 0) + 1; names.push({ name: a.name, need: r.need });
    }
    names.sort((p, q) => NEED_ORDER.indexOf(p.need) - NEED_ORDER.indexOf(q.need));
    const terrOk = !Number.isFinite(minFt) || alt >= minFt;
    const vdsOk = alt <= vdsMax;
    const nav = navAt ? navAt(alt) : null;
    const blocked = !terrOk || !vdsOk || (air.vietato || 0) > 0;
    rows.push({ alt, terrOk, vdsOk, air, names, nav, semicircular: alt - (Number.isFinite(maxTerr) ? maxTerr : 0) > 3000 ? semicircularOk(alt, magTrackDeg) : null, blocked,
      calls: (air.verifica || 0) * 100 + (air.autorizzazione || 0) * 50 + (air.evitare || 0) * 30 + (air.transponder || 0) * 20 + (air.radio || 0) * 10 });
  }
  // Quota suggerita, tra quelle senza blocchi: prima meno spazi da chiamare o evitare; poi il tempo di volo, più il costo
  // della salita e della discesa in più (circa 2 minuti ogni 1000 ft sopra la più bassa possibile, salita a 500 ft/min).
  const ok = rows.filter(r => !r.blocked);
  const ref = ok.length ? ok[0].alt : 0;
  for (const r of ok) r.score = r.calls * 10 + (r.nav && Number.isFinite(r.nav.min) ? r.nav.min : 0) + 2 * (r.alt - ref) / 1000;
  const best = ok.sort((a, b) => a.score - b.score)[0];
  if (best) best.best = true;
  return { rows, minFt, vdsMax: Number.isFinite(vdsMax) ? vdsMax : null };
}
