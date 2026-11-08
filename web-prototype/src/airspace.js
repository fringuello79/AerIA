// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Spazi aerei: lettura (openAIP GeoJSON, OpenAir), limiti verticali, categorie e contatti radio.
import { FT, arcPoints, bearingDist } from './geo.js';

export const FT_PER_HPA = 27; // correzione QNH per i livelli di volo (approssimazione ISA vicino al livello del mare)

// Codici numerici openAIP, verificati sul file Italia del 6/11/2026 confrontando codici e nomi:
// 0 altro, 1 R, 2 Q, 3 P, 4 CTR, 5 TMZ, 6 RMZ, 7 TMA, 8 TRA, 9 TSA, 10 FIR, 13 ATZ, 14 MATZ, 26 CTA, 28 attività, 29 parchi.
// Gli altri codici seguono la documentazione openAIP e non sono ancora stati visti nei dati italiani.
export const OAIP_TYPES = ['OTHER', 'R', 'Q', 'P', 'CTR', 'TMZ', 'RMZ', 'TMA', 'TRA', 'TSA', 'FIR', 'UIR', 'ADIZ', 'ATZ', 'MATZ', 'AWY', 'MTR', 'ALERT', 'WARNING', 'PROTECTED', 'HTZ', 'GSEC', 'TRP', 'TIZ', 'TIA', 'MTA', 'CTA', 'ACCSEC', 'ASRA', 'OFR', 'MRT', 'TFR', 'VFRSEC', 'FIS', 'LTA', 'UTA', 'CTR'];
export const OAIP_CLASS = { 0: 'A', 1: 'B', 2: 'C', 3: 'D', 4: 'E', 5: 'F', 6: 'G', 8: '' };
const OAIP_UNIT = { 0: 'M', 1: 'FT', 6: 'FL' };
const OAIP_DATUM = { 0: 'GND', 1: 'MSL', 2: 'STD' };

export const FIR_TYPES = new Set(['FIR', 'UIR', 'FIS', 'ACCSEC', 'ACC']);
const CONTROLLED_TYPES = new Set(['CTR', 'TMA', 'CTA', 'ATZ', 'MATZ', 'AWY', 'TIZ', 'TIA']);

export const TYPE_LABEL = {
  R: 'Zona regolamentata', Q: 'Zona pericolosa', P: 'Zona proibita', CTR: 'Zona di controllo (CTR)', TMA: 'Area terminale (TMA)',
  CTA: 'Area di controllo (CTA)', ATZ: 'Zona di traffico aeroportuale (ATZ)', MATZ: 'Zona di traffico militare (MATZ)', TMZ: 'Zona transponder obbligatorio (TMZ)',
  RMZ: 'Zona radio obbligatoria (RMZ)', TRA: 'Area riservata temporanea (TRA)', TSA: 'Area segregata temporanea (TSA)', AWY: 'Aerovia', FIR: 'Regione informazioni volo (FIR)',
  FIS: 'Settore FIS', GSEC: 'Settore volo a vela', VFRSEC: 'Settore VFR', ASRA: 'Attività sportive o lavoro aereo', OFR: 'Area protetta: sorvolo limitato', OTHER: 'Altro',
};

export const CAT_COLOR = { P: '#e5384f', R: '#ef7a1a', Q: '#d9a800', CTRL: '#2f7de1', ZONE: '#8a5cf6', PARK: '#12b85a', SPORT: '#0fa3a3', OTHER: '#6f7f91' };
export const CAT_LABEL = {
  P: 'Proibita: non entrare', R: 'Regolamentata o riservata', Q: 'Pericolosa', CTRL: 'Controllato o ATZ',
  ZONE: 'Radio o transponder obbligatori', PARK: 'Parco: sorvolo limitato', SPORT: 'Attività sportive o lavoro aereo', OTHER: 'Altro',
};

export function category(a) {
  const t = a.type, c = a.cls;
  if (t === 'P') return 'P';
  if (t === 'R' || t === 'TRA' || t === 'TSA' || t === 'TFR') return 'R';
  if (t === 'Q' || t === 'WARNING' || t === 'ALERT') return 'Q';
  if (['A', 'B', 'C', 'D', 'E'].includes(c) || CONTROLLED_TYPES.has(t)) return 'CTRL';
  if (t === 'TMZ' || t === 'RMZ') return 'ZONE';
  if (t === 'OFR') return 'PARK';
  if (t === 'ASRA') return 'SPORT';
  return 'OTHER';
}

export function limitText(l) {
  if (!l) return '—';
  if (l.ref === 'GND' && l.value === 0) return 'SFC';
  if (l.unit === 'FL') return `FL ${l.value}`;
  if (l.value >= 99999) return 'UNL';
  return `${l.value} ${l.unit === 'M' ? 'm' : 'ft'} ${l.ref === 'GND' ? 'AGL' : l.ref === 'STD' ? 'STD' : 'AMSL'}`;
}

// Limite in piedi AMSL in un punto, noto il terreno (ft) in quel punto e il QNH (hPa)
export function limitFt(l, terrFt, qnh = 1013.25) {
  if (!l) return NaN;
  if (l.value >= 99999) return 99999;
  const v = l.unit === 'M' ? l.value * FT : l.unit === 'FL' ? l.value * 100 : l.value;
  if (l.ref === 'GND') return (Number.isFinite(terrFt) ? terrFt : 0) + v;
  if (l.ref === 'STD' || l.unit === 'FL') return v + (qnh - 1013.25) * FT_PER_HPA;
  return v;
}

export function parseAlt(s) {
  const t = String(s).trim().toUpperCase().replace(/\s+/g, ' ');
  if (/^(SFC|GND|0|SURFACE)$/.test(t)) return { value: 0, unit: 'FT', ref: 'GND' };
  if (/UNL|UNLIM/.test(t)) return { value: 99999, unit: 'FT', ref: 'MSL' };
  let m = /FL\s*(\d+)/.exec(t);
  if (m) return { value: Number(m[1]), unit: 'FL', ref: 'STD' };
  m = /(\d+(?:\.\d+)?)\s*(FT|F|M)?\s*(AMSL|MSL|AGL|GND|SFC|ASFC|STD)?/.exec(t);
  if (!m) return null;
  const ref = /AGL|GND|SFC|ASFC/.test(m[3] || '') ? 'GND' : m[3] === 'STD' ? 'STD' : 'MSL';
  return { value: Number(m[1]), unit: m[2] === 'M' ? 'M' : 'FT', ref };
}

function normLimitObj(o) {
  if (!o) return null;
  if (typeof o.unit === 'number') return { value: Number(o.value), unit: OAIP_UNIT[o.unit] ?? 'FT', ref: OAIP_DATUM[o.referenceDatum] ?? 'MSL' };
  const unit = String(o.unit || 'FT').toUpperCase(), ref = String(o.referenceDatum || 'MSL').toUpperCase();
  return { value: Number(o.value), unit: unit === 'FL' ? 'FL' : unit === 'M' ? 'M' : 'FT', ref: ref === 'GND' ? 'GND' : ref === 'STD' ? 'STD' : 'MSL' };
}

export function fromGeojson(gj, source) {
  const out = [];
  for (const f of gj.features || []) {
    const p = f.properties || {}, g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    if (!polys.length) continue;
    let type = p.type, typeCode = null;
    if (typeof type === 'number') { typeCode = type; type = OAIP_TYPES[type] ?? 'OTHER'; }
    type = String(type || 'OTHER').toUpperCase();
    let cls = p.class ?? p.icaoClass;
    if (typeof cls === 'number') cls = OAIP_CLASS[cls] ?? String(cls);
    cls = cls ? String(cls).toUpperCase() : '';
    const lower = normLimitObj(p.lowerCeiling || p.lowerLimit), upper = normLimitObj(p.upperCeiling || p.upperLimit);
    if (!lower || !upper) continue;
    const freqs = (p.frequencies || []).filter(q => q.value).map(q => ({ value: String(q.value), name: q.name || '', primary: !!q.primary, remarks: q.remarks || '' }));
    out.push({ id: p._id || `${source}#${out.length}`, name: p.name || 'Senza nome', cls, type, typeCode, lower, upper, rings: polys.map(pl => pl[0]),
      freqs, remarks: p.remarks || '', transponder: (p.transponderSettings || []).map(t => t.code), updatedAt: p.updatedAt || '', source });
  }
  return out;
}

function parseCoordPair(s) {
  const parts = [...s.matchAll(/(\d+):(\d+(?:\.\d+)?)(?::(\d+(?:\.\d+)?))?\s*([NSEW])/gi)];
  if (parts.length < 2) return null;
  const dec = m => (Number(m[1]) + Number(m[2]) / 60 + Number(m[3] || 0) / 3600) * (/[SW]/i.test(m[4]) ? -1 : 1);
  const [a, b] = parts;
  return [/[EW]/i.test(b[4]) ? dec(b) : dec(a), /[NS]/i.test(a[4]) ? dec(a) : dec(b)];
}

export function fromOpenAir(text, source) {
  const out = [];
  let cur = null, center = null, dir = 1;
  const flush = () => {
    if (cur && cur.ring.length >= 3 && cur.lower && cur.upper) { cur.rings = [[...cur.ring, cur.ring[0]]]; delete cur.ring; out.push(cur); }
    cur = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\*.*$/, '').trim();
    if (!line) continue;
    const key = line.slice(0, 2).toUpperCase(), val = line.slice(2).trim();
    if (key === 'AC') {
      flush(); center = null; dir = 1;
      const v = val.toUpperCase(), isClass = /^[A-G]$/.test(v);
      cur = { id: `${source}#${out.length}`, name: 'Senza nome', cls: isClass ? v : '', type: isClass ? '' : (v === 'GP' ? 'GSEC' : v), typeCode: null,
        lower: null, upper: null, ring: [], freqs: [], remarks: '', transponder: [], updatedAt: '', source };
    } else if (!cur) continue;
    else if (key === 'AN') cur.name = val;
    else if (key === 'AY') cur.type = val.toUpperCase();
    else if (key === 'AL') cur.lower = parseAlt(val);
    else if (key === 'AH') cur.upper = parseAlt(val);
    else if (key === 'AF') cur.freqs.push({ value: val, name: '', primary: true, remarks: '' });
    else if (key === 'AG') { if (cur.freqs[0]) cur.freqs[0].name = val; }
    else if (key === 'DP') { const p = parseCoordPair(val); if (p) cur.ring.push(p); }
    else if (line[0].toUpperCase() === 'V') {
      const m = /^V\s*([XD])\s*=\s*(.+)$/i.exec(line);
      if (m && m[1].toUpperCase() === 'X') center = parseCoordPair(m[2]);
      if (m && m[1].toUpperCase() === 'D') dir = m[2].trim().startsWith('-') ? -1 : 1;
    } else if (key === 'DC' && center) cur.ring.push(...arcPoints(center, Number(val), 0, 360, 1).slice(0, -1));
    else if (key === 'DA' && center) { const [r, a0, a1] = val.split(',').map(Number); cur.ring.push(...arcPoints(center, r, a0, a1, dir)); }
    else if (key === 'DB' && center) {
      const [s1, s2] = val.split(','), p1 = parseCoordPair(s1), p2 = parseCoordPair(s2);
      if (p1 && p2) { const b1 = bearingDist(center, p1), b2 = bearingDist(center, p2); cur.ring.push(...arcPoints(center, b1.nm, b1.brg, b2.brg, dir)); }
    }
  }
  flush();
  return out;
}

// Che cosa serve per entrare, secondo la categoria e il tipo di pilota/apparecchio.
// pilot: 'basico' (VDS non avanzato), 'avanzato' (VDS avanzato con pilota avanzato), 'ag' (aviazione generale)
export function entryRule(a, pilot) {
  const cat = category(a);
  if (cat === 'P') return { level: 'crit', need: 'vietato', text: 'Zona proibita: non si entra.' };
  if (cat === 'R') return { level: 'crit', need: 'verifica', text: 'Zona regolamentata o riservata: entra solo se non è attiva o se sei autorizzato. Verifica NOTAM e AUP.' };
  if (cat === 'Q') return { level: 'warn', need: 'verifica', text: 'Zona pericolosa: verifica l’attività (NOTAM) prima di attraversarla.' };
  if (cat === 'CTRL') {
    if (pilot === 'basico') return { level: 'crit', need: 'vietato', text: 'Spazio controllato o ATZ: vietato al VDS non avanzato, salvo autorizzazione ENAC (DPR 133/2010, art. 9).' };
    // SERA.6001: classe A vietata al VFR; B, C, D con autorizzazione; E senza autorizzazione né radio continua.
    // RAIT.6005 b)1): le ATZ non controllate (con AFIS o in classe G) sono RMZ: contatto radio, nessuna autorizzazione.
    if (a.cls === 'A') return { level: 'crit', need: 'vietato', text: 'Classe A: il volo VFR non è ammesso (SERA.6001).' };
    if (a.type === 'ATZ' && !['B', 'C', 'D'].includes(a.cls)) return { level: 'warn', need: 'radio', text: 'ATZ non controllata: è una zona radio obbligatoria (RAIT.6005 b)): chiama l’ente e resta in ascolto; non serve autorizzazione.' };
    if (a.cls === 'E') return { level: 'info', need: 'verifica', text: 'Classe E: il VFR non richiede autorizzazione né contatto radio continuo (SERA.6001); verifica se è anche zona radio o transponder.' };
    return { level: 'warn', need: 'autorizzazione', text: `Spazio controllato${a.cls ? ` di classe ${a.cls}` : ''}: serve l’autorizzazione dell’ente prima di entrare (SERA.6001).` };
  }
  if (cat === 'ZONE') {
    if (a.type === 'TMZ') return { level: 'warn', need: 'transponder', text: 'Zona transponder obbligatorio: transponder acceso in modo C o S.' };
    return { level: 'warn', need: 'radio', text: 'Zona radio obbligatoria: chiama l’ente prima di entrare e resta in ascolto.' };
  }
  if (cat === 'PARK') return { level: 'warn', need: 'evitare', text: 'Area protetta: sorvolo limitato sotto il tetto indicato.' };
  if (cat === 'SPORT') return { level: 'warn', need: 'verifica', text: 'Attività aerea (acrobazia, paracadutismo, aeromodelli, lavoro aereo): attenzione e verifica NOTAM.' };
  return { level: 'info', need: 'nessuno', text: 'Nessun obbligo particolare nei dati caricati.' };
}

// Ente e frequenza solo se presenti nei dati: mai inventati.
export function contactInfo(a) {
  const f = a.freqs?.find(q => q.primary) || a.freqs?.[0];
  if (!f) return { unit: '', freq: '', note: 'Frequenza non presente nei dati: verifica su carta VFR o AIP.' };
  const note = (f.remarks || '').replace(/See AIP for area of responsibility\.?/i, 'Verifica sull’AIP il settore di competenza.');
  return { unit: f.name, freq: f.value, note };
}
