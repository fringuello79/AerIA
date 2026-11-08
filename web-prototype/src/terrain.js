// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Modello del terreno: griglie di quote (Copernicus GeoTIFF, SRTM .hgt, pacchetti dati) o rilievo dimostrativo.
import { FT, NM, destPoint } from './geo.js';

// Rilievo INVENTATO: una piana a 650 m tra creste. Serve solo a mostrare il funzionamento.
export function demoElevM(lon, lat) {
  const g = (cx, cy, sx, sy, h) => h * Math.exp(-(((lon - cx) / sx) ** 2 + ((lat - cy) / sy) ** 2));
  return 650 + g(13.30, 42.17, 0.10, 0.05, 1700) + g(13.62, 42.16, 0.08, 0.07, 1400) + g(13.70, 41.93, 0.09, 0.09, 1600)
    + g(13.30, 41.90, 0.12, 0.06, 1100) + g(13.48, 42.25, 0.20, 0.03, 900) + 40 * Math.sin(lon * 90) * Math.cos(lat * 70);
}

// Griglia: centri dei campioni da (cx0, cy0) con passo dx, dy (dy negativo: da nord a sud).
// Restituisce undefined fuori dalla griglia, NaN dove il dato manca.
// Griglie «massimo per blocco» (pacchetti): si restituisce il valore del blocco che contiene il punto, che non è mai
// più basso del terreno vero in quel blocco. L'interpolazione tra blocchi vicini potrebbe scendere sotto la cima.
export function gridElev(t, lon, lat) {
  const fx = (lon - t.cx0) / t.dx, fy = (lat - t.cy0) / t.dy;
  if (fx < -0.5 || fy < -0.5 || fx > t.w - 0.5 || fy > t.h - 0.5) return undefined;
  if (t.blockMax) {
    const s = t.data[Math.min(t.h - 1, Math.max(0, Math.round(fy))) * t.w + Math.min(t.w - 1, Math.max(0, Math.round(fx)))];
    return (s === t.nodata || s < -1000) ? NaN : s;
  }
  const x0 = Math.max(0, Math.min(t.w - 2, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(t.h - 2, Math.floor(fy)));
  const dx = Math.min(1, Math.max(0, fx - x0)), dy = Math.min(1, Math.max(0, fy - y0));
  const v = (x, y) => { const s = t.data[y * t.w + x]; return (s === t.nodata || !Number.isFinite(s) || s < -1000) ? NaN : s; };
  const a = v(x0, y0), b = v(x0 + 1, y0), c = v(x0, y0 + 1), d = v(x0 + 1, y0 + 1);
  const vals = [a, b, c, d].filter(Number.isFinite);
  if (!vals.length) return NaN;
  if (vals.length < 4) return vals.reduce((q, r) => q + r, 0) / vals.length;
  return a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy;
}

export function tileKey(lat, lon) {
  return (lat >= 0 ? 'N' : 'S') + String(Math.abs(lat)).padStart(2, '0') + (lon >= 0 ? 'E' : 'W') + String(Math.abs(lon)).padStart(3, '0');
}

export function parseHgt(name, buf) {
  const m = /([NS])(\d{2})([EW])(\d{3})/i.exec(name);
  if (!m) throw new Error(`Il nome «${name}» non indica la tessera (serve per esempio N42E013.hgt).`);
  const lat = (m[1].toUpperCase() === 'N' ? 1 : -1) * Number(m[2]);
  const lon = (m[3].toUpperCase() === 'E' ? 1 : -1) * Number(m[4]);
  const n = Math.round(Math.sqrt(buf.byteLength / 2));
  if (n * n * 2 !== buf.byteLength || (n !== 1201 && n !== 3601)) throw new Error(`«${name}» non è una tessera SRTM valida (${buf.byteLength} byte). Se è compressa, estrai prima il file .hgt.`);
  const dv = new DataView(buf), data = new Int16Array(n * n);
  for (let i = 0; i < n * n; i++) data[i] = dv.getInt16(i * 2, false);
  return { key: `SRTM ${tileKey(lat, lon)}`, source: 'SRTM (NASA/USGS)', cx0: lon, cy0: lat + 1, dx: 1 / (n - 1), dy: -1 / (n - 1), w: n, h: n, data, nodata: -32768,
    bounds: { lonMin: lon, lonMax: lon + 1, latMin: lat, latMax: lat + 1 } };
}

// GeoTIFF in gradi (EPSG:4326), per esempio Copernicus DEM GLO-30. GeoTIFF = libreria geotiff.js.
export async function parseTiff(name, buf, GeoTIFF) {
  if (!GeoTIFF) throw new Error('Il lettore GeoTIFF non si è caricato: ricarica la pagina.');
  const tiff = await GeoTIFF.fromArrayBuffer(buf);
  const img = await tiff.getImage();
  const geo = img.getGeoKeys ? img.getGeoKeys() : {};
  if (geo.GeographicTypeGeoKey && geo.GeographicTypeGeoKey !== 4326) throw new Error(`«${name}» non è in coordinate geografiche WGS84 (EPSG:4326).`);
  const [ox, oy] = img.getOrigin(), [rx, ry] = img.getResolution();
  if (Math.abs(rx) > 0.01) throw new Error(`«${name}» non sembra una griglia in gradi (passo ${rx}).`);
  const w = img.getWidth(), h = img.getHeight();
  const data = await img.readRasters({ interleave: true });
  const [x0, y0, x1, y1] = img.getBoundingBox();
  // PixelIsPoint (GTRasterTypeGeoKey = 2, come Copernicus): l'aggancio è il centro del primo campione
  const half = geo.GTRasterTypeGeoKey === 2 ? 0 : 0.5;
  return { key: name.replace(/\.tiff?$/i, ''), source: /copernicus/i.test(name) ? 'Copernicus DEM GLO-30' : 'GeoTIFF', cx0: ox + rx * half, cy0: oy + ry * half, dx: rx, dy: ry, w, h, data,
    nodata: img.getGDALNoData() ?? -32767,
    bounds: { lonMin: Math.min(x0, x1), lonMax: Math.max(x0, x1), latMin: Math.min(y0, y1), latMax: Math.max(y0, y1) } };
}

// Griglia di un pacchetto dati: Int16 little-endian in metri, descritta da meta.terrain
export function gridFromPack(meta, buf) {
  const t = meta;
  const data = buf instanceof Int16Array ? buf : new Int16Array(buf);
  if (data.length !== t.w * t.h) throw new Error(`Pacchetto terreno incompleto: ${data.length} campioni invece di ${t.w * t.h}.`);
  return { key: t.key || t.name, source: t.source, cx0: t.cx0, cy0: t.cy0, dx: t.dx, dy: t.dy, w: t.w, h: t.h, data, nodata: t.nodata ?? -32768, bounds: t.bounds, blockMax: !!t.blockMax };
}

function b64bytes(b64) {
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
async function gunzip(u8) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Questo dispositivo non sa decomprimere i pacchetti (manca DecompressionStream): aggiorna il browser o WebView.');
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}
// Quote di un file del pacchetto: «int16le-base64» oppure «int16le-rowdelta-gzip-base64»
// (differenze per riga, gzip, base64: vedi tools/make_region.py). w = campioni per riga.
export async function decodePackGrid(json, w, h) {
  const u8 = json.encoding === 'int16le-rowdelta-gzip-base64' ? await gunzip(b64bytes(json.data)) : b64bytes(json.data);
  if (u8.byteLength !== w * h * 2) throw new Error(`Griglia del terreno incompleta: ${u8.byteLength} byte invece di ${w * h * 2}.`);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = new Int16Array(w * h);
  if (json.encoding === 'int16le-base64') { for (let i = 0; i < w * h; i++) out[i] = dv.getInt16(i * 2, true); return out; }
  if (json.encoding !== 'int16le-rowdelta-gzip-base64') throw new Error(`Codifica del terreno sconosciuta: ${json.encoding}`);
  for (let r = 0; r < h; r++) {
    let acc = 0;
    for (let c = 0, i = r * w; c < w; c++, i++) { acc = (acc + dv.getInt16(i * 2, true)) << 16 >> 16; out[i] = acc; }
  }
  return out;
}
const overlaps = (a, b) => a.lonMin < b.lonMax && a.lonMax > b.lonMin && a.latMin < b.latMax && a.latMax > b.latMin;

export class Terrain {
  constructor() { this.grids = []; this.demo = true; this.tiles = null; }
  setDemo() { this.grids = []; this.cell = new Map(); this.demo = true; this.tiles = null; this.regionBounds = null; this.name = ''; }
  // le griglie più fini hanno la precedenza (le tessere da 3" prima della griglia d'insieme da 30")
  add(grid) {
    if (this.demo) { this.grids = []; this.demo = false; }
    this.grids = this.grids.filter(g => g.key !== grid.key); this.grids.push(grid);
    this.grids.sort((a, b) => Math.abs(a.dx) - Math.abs(b.dx));
    // indice per cella di 1°: la ricerca della quota non scorre tutte le tessere (decine di migliaia di chiamate per
    // ogni maglia del 3D). Si indicizzano solo griglie che stanno dentro una cella; vince la più fine (ordine sopra).
    this.cell = new Map();
    for (const g of this.grids) {
      const b = g.bounds; if (!b || b.lonMax - b.lonMin > 1.01 || b.latMax - b.latMin > 1.01) continue;
      const k = Math.floor(b.latMin + 1e-6) * 1000 + Math.floor(b.lonMin + 1e-6);
      if (!this.cell.has(k)) this.cell.set(k, g);
    }
  }
  // Tessere da caricare quando servono: recs = indice del pacchetto, load(rec) → griglia
  setTiles(recs, load) { this.tiles = { recs, load, pending: new Map() }; }
  // Carica le tessere che toccano l'area b (bounds in gradi). Restituisce quante ne ha caricate.
  async ensure(b) {
    if (!this.tiles) return 0;
    const want = this.tiles.recs.filter(r => overlaps(r.bounds, b) && !this.grids.some(g => g.key === r.key));
    const jobs = want.map(r => {
      if (!this.tiles.pending.has(r.key)) this.tiles.pending.set(r.key, this.tiles.load(r).then(g => { this.add(g); return 1; }).finally(() => this.tiles.pending.delete(r.key)));
      return this.tiles.pending.get(r.key);
    });
    return (await Promise.all(jobs)).length;
  }
  // tessere fini che toccano l'area e non sono ancora caricate (i calcoli usano intanto la griglia d'insieme, più prudente)
  missing(b) { return this.tiles ? this.tiles.recs.filter(r => overlaps(r.bounds, b) && !this.grids.some(g => g.key === r.key)).map(r => r.key) : []; }
  elevM(lon, lat) {
    if (this.demo) return demoElevM(lon, lat);
    const c = this.cell?.get(Math.floor(lat) * 1000 + Math.floor(lon));
    if (c) { const e = gridElev(c, lon, lat); if (e !== undefined) return e; }
    for (const g of this.grids) { const e = gridElev(g, lon, lat); if (e !== undefined) return e; }
    return NaN;
  }
  elevFt(lon, lat) { const m = this.elevM(lon, lat); return Number.isFinite(m) ? m * FT : NaN; }
  // Rilievo più alto entro rM metri (centro + 8 direzioni a metà raggio e al raggio). Con rM = 150 è il raggio delle
  // quote minime VFR di SERA.5005(f): «150 m sopra l'ostacolo più alto entro 150 m dall'aereo». Serve anche a non
  // perdere una vetta che il modello a blocchi da 90 m mette nel blocco accanto alla linea della rotta.
  maxNearFt(lon, lat, rM = 150) {
    let mx = this.elevFt(lon, lat);
    const kLat = rM / 111200, kLon = rM / (111320 * Math.cos(lat * Math.PI / 180));
    for (const f of [0.5, 1]) for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, v = this.elevFt(lon + Math.sin(a) * kLon * f, lat + Math.cos(a) * kLat * f);
      if (Number.isFinite(v) && !(v <= mx)) mx = v;
    }
    return mx;
  }
  // Rilievo più alto entro r km (campionamento su 4 anelli × 16 direzioni + centro): serve per il limite VDS
  maxWithinFt(lon, lat, rKm = 5) {
    let mx = this.elevFt(lon, lat);
    for (const f of [0.25, 0.5, 0.75, 1]) for (let k = 0; k < 16; k++) {
      const p = destPoint([lon, lat], k * 22.5, rKm * f * 1000 / NM);
      const v = this.elevFt(p[0], p[1]);
      if (Number.isFinite(v) && !(v <= mx)) mx = v;
    }
    return mx;
  }
  bounds() {
    if (this.demo) return { lonMin: 13.05, lonMax: 13.95, latMin: 41.75, latMax: 42.35 };
    if (this.regionBounds) return this.regionBounds;
    const b = this.grids.map(g => g.bounds);
    return { lonMin: Math.min(...b.map(x => x.lonMin)), lonMax: Math.max(...b.map(x => x.lonMax)), latMin: Math.min(...b.map(x => x.latMin)), latMax: Math.max(...b.map(x => x.latMax)) };
  }
  label() {
    if (this.demo) return 'dimostrativo (inventato)';
    if (this.tiles) { const n = this.grids.filter(g => g.key !== 'overview').length; return `${this.name || 'pacchetto'} (${n}/${this.tiles.recs.length} tessere fini caricate)`; }
    return this.grids.map(g => g.key).join(', ');
  }
}
