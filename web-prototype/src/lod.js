// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Livelli di dettaglio del terreno (quadtree), come nei motori cartografici: la regione è divisa in tessere da 1°,
// ognuna si divide in 4 quando la vista è vicina, fino al livello massimo. Una tessera si sostituisce con le sue 4
// figlie solo quando tutte e 4 sono pronte: la superficie non ha mai buchi né doppioni.
// Modulo puro (niente grafica): si prova in Node.

// Tessere radice: celle di 1° allineate ai gradi interi, ritagliate sui confini della regione
export function rootTiles(region) {
  const out = [];
  for (let la = Math.floor(region.latMin); la < region.latMax; la++) for (let lo = Math.floor(region.lonMin); lo < region.lonMax; lo++) {
    const b = { lonMin: Math.max(lo, region.lonMin), lonMax: Math.min(lo + 1, region.lonMax), latMin: Math.max(la, region.latMin), latMax: Math.min(la + 1, region.latMax) };
    if (b.lonMax - b.lonMin > 1e-9 && b.latMax - b.latMin > 1e-9) out.push({ key: `0/${lo}/${la}`, level: 0, b });
  }
  return out;
}

export function childrenOf(t) {
  const { b } = t, lm = (b.lonMin + b.lonMax) / 2, am = (b.latMin + b.latMax) / 2, L = t.level + 1;
  return [
    { key: `${t.key}.0`, level: L, b: { lonMin: b.lonMin, lonMax: lm, latMin: am, latMax: b.latMax } },
    { key: `${t.key}.1`, level: L, b: { lonMin: lm, lonMax: b.lonMax, latMin: am, latMax: b.latMax } },
    { key: `${t.key}.2`, level: L, b: { lonMin: b.lonMin, lonMax: lm, latMin: b.latMin, latMax: am } },
    { key: `${t.key}.3`, level: L, b: { lonMin: lm, lonMax: b.lonMax, latMin: b.latMin, latMax: am } },
  ];
}

// Tessere da disegnare. wantSplit(t) → la vista vuole più dettaglio; isReady(t) → la sua maglia esiste;
// need(t) → chiede di costruirla. Le radici devono essere sempre pronte.
export function selectLod(roots, { wantSplit, isReady, need, maxLevel }) {
  const shown = [];
  const visit = t => {
    if (t.level < maxLevel && wantSplit(t)) {
      const kids = t.children || (t.children = childrenOf(t));
      if (kids.every(isReady)) { kids.forEach(visit); return; }
      kids.forEach(k => { if (!isReady(k)) need(k); });
    }
    shown.push(t);
  };
  roots.forEach(visit);
  return shown;
}
