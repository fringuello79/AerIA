// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Geometria di base. Nessuna dipendenza: usata dall'app e dai test (node --test).
export const FT = 3.28084;   // piedi per metro
export const NM = 1852;      // metri per miglio nautico
export const KT = NM / 3600; // metri al secondo per nodo

const RAD = Math.PI / 180;

// Lunghezza in metri di un grado di latitudine e di longitudine alla latitudine data (ellissoide WGS84).
// Prima si usavano 110,54 km per grado di latitudine (valore dell'equatore): in Italia l'errore era dello 0,5 %.
export function degLengths(latDeg) {
  const p = latDeg * RAD;
  return {
    lat: 111132.954 - 559.822 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p),
    lon: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p),
  };
}

// Proiezione locale equirettangolare in km attorno a un'origine: precisa a meno dello 0,1 % entro 100 km.
export function makeProjection(origin) {
  const L = degLengths(origin.lat), kx = L.lon / 1000, kz = L.lat / 1000;
  return {
    origin,
    toLocal: (lon, lat) => ({ x: (lon - origin.lon) * kx, z: -(lat - origin.lat) * kz }),
    fromLocal: (x, z) => ({ lon: origin.lon + x / kx, lat: origin.lat - z / kz }),
  };
}

// Distanza in metri (piana alla latitudine media: scarto sotto lo 0,05 % fino a 100 km rispetto alla geodetica)
export function distM(a, b) {
  const L = degLengths((a.lat + b.lat) / 2);
  return Math.hypot((b.lon - a.lon) * L.lon, (b.lat - a.lat) * L.lat);
}

// Rotta vera da a verso b, in gradi 0-360 (piana alla latitudine media, come distM)
export function bearingDeg(a, b) {
  const L = degLengths((a.lat + b.lat) / 2);
  return (Math.atan2((b.lon - a.lon) * L.lon, (b.lat - a.lat) * L.lat) / RAD + 360) % 360;
}

// Punto a distanza (NM) e rotta (gradi) da [lon, lat]
export function destPoint(c, bearing, distNm) {
  const d = distNm * NM, b = bearing * RAD, L = degLengths(c[1]);
  return [c[0] + d * Math.sin(b) / L.lon, c[1] + d * Math.cos(b) / L.lat];
}

export function bearingDist(c, p) {
  const L = degLengths(c[1]), dx = (p[0] - c[0]) * L.lon, dy = (p[1] - c[1]) * L.lat;
  return { brg: (Math.atan2(dx, dy) / RAD + 360) % 360, nm: Math.hypot(dx, dy) / NM };
}

// Arco di raggio r (NM) da a0 ad a1 (gradi), dir +1 orario, -1 antiorario
export function arcPoints(c, r, a0, a1, dir = 1) {
  let span = dir > 0 ? (a1 - a0 + 360) % 360 : -((a0 - a1 + 360) % 360);
  if (span === 0) span = dir * 360;
  const steps = Math.max(2, Math.ceil(Math.abs(span) / 5));
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push(destPoint(c, a0 + span * i / steps, r));
  return pts;
}

// Ritaglio Sutherland–Hodgman di un anello [lon, lat] sul rettangolo dell'area
export function clipRing(ring, a) {
  const closed = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1];
  let pts = closed ? ring.slice(0, -1) : ring.slice();
  const inter = (p, q, k, v) => { const t = (v - p[k]) / (q[k] - p[k]); return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]; };
  const edges = [
    [p => p[0] >= a.lonMin, (p, q) => inter(p, q, 0, a.lonMin)],
    [p => p[0] <= a.lonMax, (p, q) => inter(p, q, 0, a.lonMax)],
    [p => p[1] >= a.latMin, (p, q) => inter(p, q, 1, a.latMin)],
    [p => p[1] <= a.latMax, (p, q) => inter(p, q, 1, a.latMax)],
  ];
  for (const [inside, cut] of edges) {
    const res = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      if (inside(p)) { res.push(p); if (!inside(q)) res.push(cut(p, q)); }
      else if (inside(q)) res.push(cut(p, q));
    }
    pts = res;
    if (pts.length < 3) return [];
  }
  return pts;
}

// Aggiunge vertici così che nessun lato superi maxKm (serve per seguire il terreno sui limiti AGL)
export function densify(pts, maxKm) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    out.push(p);
    const n = Math.floor(distM({ lon: p[0], lat: p[1] }, { lon: q[0], lat: q[1] }) / 1000 / maxKm);
    for (let k = 1; k <= n; k++) { const t = k / (n + 1); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
  }
  return out;
}

export function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

export function ringBBox(ring) {
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  for (const [x, y] of ring) { if (x < lonMin) lonMin = x; if (x > lonMax) lonMax = x; if (y < latMin) latMin = y; if (y > latMax) latMax = y; }
  return { lonMin, lonMax, latMin, latMax };
}

// Direzione cardinale in italiano (8 settori) per descrivere una posizione a voce
export function cardinal(deg) {
  return ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ovest', 'ovest', 'nord-ovest'][Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}
