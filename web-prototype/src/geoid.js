// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Ondulazione del geoide N (m): quota sul mare = quota GPS sull'ellissoide − N.
// I browser e Android forniscono la quota sull'ellissoide WGS84 (specifica W3C Geolocation, Location.getAltitude).
export function geoidN(g, lon, lat) {
  if (!g) return NaN;
  const fx = (lon - g.lon0) / g.step, fy = (lat - g.lat0) / g.step;
  if (fx < 0 || fy < 0 || fx > g.nx - 1 || fy > g.ny - 1) return NaN;
  const i = Math.min(Math.floor(fx), g.nx - 2), j = Math.min(Math.floor(fy), g.ny - 2), tx = fx - i, ty = fy - j;
  const v = (a, b) => g.n[(j + b) * g.nx + i + a];
  return (v(0, 0) * (1 - tx) + v(1, 0) * tx) * (1 - ty) + (v(0, 1) * (1 - tx) + v(1, 1) * tx) * ty;
}
