// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// AerIA VFR — interfaccia: pianificazione, volo con GPS o simulazione, assistente radio.
// Ausilio dimostrativo: non usare per la navigazione.
import * as THREE from 'three';
import { OrbitControls } from '../OrbitControls.js';
import { Line2 } from '../lines/Line2.js';
import { LineMaterial } from '../lines/LineMaterial.js';
import { LineGeometry } from '../lines/LineGeometry.js';
import { FT, NM, KT, makeProjection, distM, bearingDeg, destPoint, clipRing, densify, ringBBox, cardinal } from './geo.js';
import { Terrain, parseHgt, parseTiff, gridFromPack, decodePackGrid } from './terrain.js';
import { verticalProfile } from './vprofile.js';
import { rootTiles, selectLod } from './lod.js';
import { VERSION, AUTHOR, DONATE_URL, SPONSORS_URL, PROJECT_URL, TABELLA_K } from './version.js';
import { fromGeojson, fromOpenAir, limitFt, limitText, category, CAT_COLOR, CAT_LABEL, TYPE_LABEL, FIR_TYPES, entryRule, contactInfo } from './airspace.js';
import { legAltFt, dayInfo, analyseRoute, lookahead, eventSpeech, airspacesAt, legCorridorMinFt, nodeMinFt, enforceLegClearance, LEG_CLEAR_FT, LEG_CORRIDOR_M } from './rules.js';
import { buildRadioCards, maydayText, channelOf } from './radio.js';
import { parseMetars as parseMetarsFor, fetchWeather, nearestQnh, weatherWarnings, CAT_COL, CAT_IT, HAZARD_IT, NEAR_KM, CONVECTIVE, distToRouteKm } from './weather.js';
import { parseNmea, fuse, connectBle, connectUsb, transportsAvailable, demoNmeaLines } from './devices.js';
import { geoidN } from './geoid.js';
import { altimetryCheck } from './altimetry.js';
import { initNavlog, renderNavlog, computePlan } from './navlogui.js';
import { PLANNING_DEFAULTS, runwayWind, crosswindChecks, tasFromIas, windTriangle, computeNavlog, decl as declOf, decimalYear, KMH_PER_KT } from './navlog.js';
import { fetchRadar, parseRadarTiff, sampleRadar, radarWarnings, rainColor, dbzColor } from './radar.js';
import { freshnessWarnings, staleAirspaceInfo, airacCycle } from './freshness.js';
import { featureWarnings, fieldAt, aerodromeKind, obstacleTopFt, unknownHeightM, VDS_AIRPORT_KM, aliasesFor, fieldDoubtWarnings } from './features.js';
import { sunTimes, localHM, daylightChecks, romeToUtcMs } from './sun.js';
import { glideReachM, arrivalHeightFt } from './glide.js';
import { newPhase, phaseStep, fmtDur, fmtMS, reminderState, fuelEstimate, fuelWarnings, verticalSpeedFpm, requiredVsFpm, logEntry, pointReminderStep } from './flight.js';
import { MINIMA_DEFAULT, minimaWarnings } from './minima.js';
import { ingestFlarm, pruneTraffic, trafficList, trafficAlarm, trafficText, flarmAlarmText } from './traffic.js';
import { analyzeFlight } from './debrief.js';
import { parseChecklists, checklistText, isEmergency, allLists, isCheckable } from './checklist.js';
import { UPDATE_CHANNELS, pickUpdate, shouldCheck, compareVersions } from './update.js';
import { ACM_CHECKLISTS } from './checklists-acm.js';
import { noteFor } from './checklists-note.js';
import { forecastGrid, forecastUrl, parseOpenMeteo, fromCompact, columnAt, windAtAlt, windComponents, forecastWarnings, nearestPoint } from './forecast.js';

// ---------------------------------------------------------------- stato
const terrain = new Terrain();
const state = {
  airspaces: [], airSource: '', airDemo: true, attribution: [],
  proj: null, area: null,
  route: [], routeDemo: false, selected: null, addMode: false,
  mode: 'beginner', view: 'plan', theme: 'day', labelsTouched: false,
  analysis: null,
  fly: { active: false, source: null, pos: null, altFt: 0, gsKt: 0, trk: 0, watch: null, timer: null, sim: null, spoken: new Map(), events: [], last: null, top: false, ph: newPhase(), alts: [], extra: [], simClock: 0, fixT: 0, follow: true, followK: 1 },
  timers: { reminder: null, chrono: null, fuelL: NaN, remindCount: -1, autoRemind: false }, emerg: false, showTimers: false, terrPlan: false,
  voice: false,
  dim: '3d', hitKey: '', geoid: null, feats: null, decl: null, nl: initNavlog(),
  wx: null, wxErr: '', wxBusy: false, wxShow: true,
  radar: { sri: null, cappi: null, err: '', busy: false },
  fc: null, fcTi: 0, fcErr: '', fcBusy: false, fcLayers: { cloud: true, rain: true, wind: true },
  ext: { conn: null, demo: null, gps: null, baro: null, heading: null, seen: {}, lines: 0 },
  basemap: null, focus: null, profile: null, track: [], direct: null, panels: {}, profMark: null,
};
const $ = id => document.getElementById(id);
// caratteri di sistema: Roboto su Android, Segoe UI su Windows, San Francisco su iPad
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif';
const ic = (name, extra = '') => `<svg class="ic"${extra}><use href="#i-${name}"/></svg>`;
const ui = {
  cruise: $('cruise'), qnh: $('qnh'), exag: $('exag'), ceiling: $('ceiling'), pilot: $('pilot'), date: $('date'), dayOverride: $('dayOverride'),
  showFir: $('showFir'), showLabels: $('showLabels'), callsign: $('callsign'), acType: $('acType'), simSpeed: $('simSpeed'),
};
ui.date.value = new Date().toISOString().slice(0, 10);
const qnh = () => Number(ui.qnh.value) || 1013.25;
const cruise = () => Number(ui.cruise.value) || 0;
const day = () => dayInfo(ui.date.value, ui.dayOverride.value);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const css = name => getComputedStyle(document.body).getPropertyValue(name).trim();

// Preferenze del singolo dispositivo (comodità, non dati di volo)
const prefs = (() => { try { return JSON.parse(localStorage.getItem('airplanning.prefs') || '{}'); } catch { return {}; } })();
function savePrefs() { try { localStorage.setItem('airplanning.prefs', JSON.stringify({ mode: state.mode, theme: state.theme, dim: state.dim, callsign: ui.callsign.value, acType: ui.acType.value, pilot: ui.pilot.value, panels: state.panels, inst: state.inst, glideMargin: state.glideMargin, remindMin: state.remindMin, minima: state.minima, trafficBand: state.trafficBand, showTrail: state.showTrail, airCeil: state.airCeil })); } catch { /* memoria non disponibile */ } }
if (prefs.callsign) ui.callsign.value = prefs.callsign;
if (prefs.acType) ui.acType.value = prefs.acType;
if (prefs.pilot) ui.pilot.value = prefs.pilot;
state.glideMargin = Number.isFinite(prefs.glideMargin) ? prefs.glideMargin : 20; // % di efficienza tolta per prudenza
state.remindMin = Number.isFinite(prefs.remindMin) ? prefs.remindMin : 30;
state.showTrail = prefs.showTrail !== false;
// spazi aerei mostrati fino a questa quota: «auto» = crociera + 2500 ft. Quelli più alti si nascondono (restano nei
// controlli): non coprono più quelli sotto e non impediscono di toccarli.
state.airCeil = prefs.airCeil || 'auto';   // scia dell'aereo (accesa salvo scelta diversa)
// minimi meteo personali (proposti, modificabili); traverso vuoto = quello dimostrato dell'aereo
state.minima = { on: true, ...MINIMA_DEFAULT, ...(prefs.minima || {}) };
// traffico FLARM / ADS-B: fascia di quota mostrata (± ft), allarme sospeso fino a, traffico ricevuto
state.trafficBand = Number.isFinite(prefs.trafficBand) ? prefs.trafficBand : 2000;
state.traffic = new Map(); state.trafficMuteUntil = 0; state.trafficShown = null;
// promemoria legati ai punti della rotta, liste di controllo, revisione del volo
state.ptRem = []; state.showChecks = false; state.review = null;

// ---------------------------------------------------------------- profilo verticale con rampe (vprofile.js)
const currentAircraft = () => state.nl.aircraft.find(a => a.id === state.nl.st.aircraftId) || state.nl.aircraft[0];
// rilievo più alto entro 600 m lungo la rotta, ogni 200 m, nei primi e negli ultimi 40 km (per le salite e discese
// vicino ai campi); null finché il terreno dettagliato non è caricato. In memoria per geometria della rotta.
const rampCache = { key: '', val: null };
function rampTerrain(total) {
  const R = state.route, key = R.map(p => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  if (rampCache.key === key) return rampCache.val;
  if (terrain.missing(boundsAround(R, 1)).length) return null;
  const out = [];
  for (let d = 0; d <= total; d += 200) {
    if (d > 40000 && d < total - 40000) continue;
    const q = routePointAt(d), t = terrain.maxNearFt(q.lon, q.lat, LEG_CORRIDOR_M);
    if (Number.isFinite(t)) out.push({ d, t });
  }
  rampCache.key = key; rampCache.val = out;
  return out;
}
// quota a terra di un punto: quella scritta dal pilota, altrimenti il campo (openAIP), altrimenti il terreno del modello
function groundFtOf(p, field) {
  if (Number.isFinite(p.groundFt)) return p.groundFt;
  if (field && Number.isFinite(field.elevM)) return Math.round(field.elevM * FT);
  const g = terrain.elevFt(p.lon, p.lat);
  return Number.isFinite(g) ? Math.round(g) : null;
}
function planProfile() {
  const R = state.route;
  if (R.length < 2) return null;
  const ac = currentAircraft(), c = ac.climb || {};
  // rateo del manuale se c'è, altrimenti un valore prudente dichiarato (salita lenta = rampa lunga)
  const climb = Number.isFinite(c.rocSlFpm) && c.rocSlFpm > 0
    ? { rocSlFpm: c.rocSlFpm, rocHiFpm: c.rocHiFpm, hiFt: c.hiFt, kt: c.kt || PLANNING_DEFAULTS.climbKt, src: `${Math.round(c.rocSlFpm)} ft/min al livello del mare${Number.isFinite(c.rocHiFpm) ? `, ${Math.round(c.rocHiFpm)} a ${Math.round(c.hiFt)} ft` : ''} (${ac.name})` }
    : { rocSlFpm: PLANNING_DEFAULTS.rocFpm, kt: c.kt || PLANNING_DEFAULTS.climbKt, src: `${PLANNING_DEFAULTS.rocFpm} ft/min, valore prudente: inserisci il rateo del tuo aereo nel piano di volo` };
  const descent = { fpm: ac.descentFpm || PLANNING_DEFAULTS.descentFpm, kt: ac.iasKt || 90 };
  const dep = fieldAt(state.feats, R[0]), arr = fieldAt(state.feats, R.at(-1));
  const circuitFt = ui.pilot.value === 'basico' ? Math.min(1000, day().vdsAgl) : 1000;
  const legs = R.slice(0, -1).map((p, i) => ({ distM: distM(p, R[i + 1]), altFt: legAltFt(R, i, cruise()) }));
  // partenza e arrivo sempre a terra (campo noto o terreno del punto, oppure la quota scritta dal pilota); la
  // partenza è in aria solo se il pilota segna «già in volo» (piano fatto in volo)
  const airStart = !!R[0].airborne;
  const base = { legs, depElevFt: airStart ? null : groundFtOf(R[0], dep), arrElevFt: groundFtOf(R.at(-1), arr), climb, descent, circuitFt, land: true };
  const depG = Number.isFinite(base.depElevFt), arrG = Number.isFinite(base.arrElevFt);
  let vp = verticalProfile(base);
  // Montagne vicino ai campi: se la salita dopo il decollo (o la discesa verso l'arrivo) in linea dritta passerebbe a
  // meno di 500 ft dal rilievo più alto entro 600 m, si prende quota SUL campo prima di partire (o si scende sul
  // campo). Oltre 1,5 km dal campo; quota arrotondata ai 100 ft superiori. Il tempo in spirale non è nei tempi del log.
  let depOver = null, arrOver = null;
  if ((depG || arrG) && !terrain.demo) {
    const T = rampTerrain(vp.total);
    for (let it = 0; it < 3 && T; it++) {
      const toc = vp.events.find(e => e.kind === 'TOC'), tod = vp.events.filter(e => e.kind === 'TOD').at(-1);
      let needD = 0, needA = 0;
      for (const q of T) {
        if (depG && toc && q.d > 1500 && q.d <= toc.d) needD = Math.max(needD, q.t + LEG_CLEAR_FT - vp.altAt(q.d));
        if (arrG && tod && q.d < vp.total - 1500 && q.d >= tod.d) needA = Math.max(needA, q.t + LEG_CLEAR_FT - vp.altAt(q.d));
      }
      if (needD <= 1 && needA <= 1) break;
      if (needD > 1) depOver = Math.ceil(((depOver ?? base.depElevFt) + needD) / 100) * 100;
      if (needA > 1) arrOver = Math.ceil(((arrOver ?? base.arrElevFt + circuitFt) + needA) / 100) * 100;
      vp = verticalProfile({ ...base, depOverheadFt: depOver, arrOverheadFt: arrOver });
    }
  }
  const toc = vp.events.find(e => e.kind === 'TOC'), tods = vp.events.filter(e => e.kind === 'TOD');
  return { ...vp, climb, descent, circuitFt, depField: dep, arrField: arr, depGround: depG, arrGround: arrG, depElevFt: base.depElevFt, arrElevFt: base.arrElevFt, depOverheadFt: depOver, arrOverheadFt: arrOver,
    depEnd: depG ? (toc ? toc.d : 0) : 0, arrStart: arrG ? (tods.length ? tods.at(-1).d : vp.total) : vp.total };
}
// Nessun tratto dentro le montagne (rules.js): ogni nodo (quota del punto) almeno 500 ft sopra il rilievo più alto entro
// 600 m dai tratti che toccano il punto; i nodi troppo bassi vengono ALZATI e la modifica è segnalata. Si aspetta il
// terreno dettagliato del tratto (la griglia d'insieme alzerebbe troppo). Calcolo in memoria per coppia di punti.
const legMinCache = new Map();
function legMins() {
  const R = state.route;
  if (R.length < 2 || terrain.demo) return [];
  return R.slice(0, -1).map((a, i) => {
    const b = R[i + 1], key = `${a.lon.toFixed(6)},${a.lat.toFixed(6)},${b.lon.toFixed(6)},${b.lat.toFixed(6)}`;
    if (legMinCache.has(key)) return legMinCache.get(key);
    const box = boundsAround([a, b], 1);
    if (terrain.missing(box).length) { ensureTerrainFor(box); return null; }
    const m = legCorridorMinFt(R, i, terrain);
    if (legMinCache.size > 500) legMinCache.clear();
    legMinCache.set(key, m);
    return m;
  });
}
const nodeMin = i => nodeMinFt(legMins(), Math.min(i, state.route.length - 2));
function applyClearance() {
  const R = state.route;
  if (R.length < 2 || terrain.demo) return false;
  const ch = enforceLegClearance({ route: R, cruiseFt: cruise(), legMins: legMins() });
  for (const c of ch) R[c.node].autoRaised = { ...c, name: R[c.node].name || `P${c.node + 1}`, legName: `${R[c.leg].name || `P${c.leg + 1}`} → ${R[c.leg + 1].name || `P${c.leg + 2}`}` };
  return ch.length > 0;
}
function clearanceWarnings() {
  const out = [];
  state.route.forEach((p, i) => {
    const a = p.autoRaised;
    if (!a) return;
    if (p.altFt !== a.toFt) { delete p.autoRaised; return; }
    out.push({ lvl: 'warn', kind: 'terrain', title: `Quota di ${a.name} alzata a ${a.toFt} ft`,
      text: `Sul tratto ${a.legName} il rilievo più alto entro ${LEG_CORRIDOR_M} m dalla rotta è ${a.terrFt} ft: il programma tiene la rotta almeno ${LEG_CLEAR_FT} ft sopra (SERA.5005 f) chiede 500 ft entro 150 m). Era ${a.fromFt} ft.`,
      plain: `Ho alzato ${a.name} a ${a.toFt} piedi per passare sopra il rilievo più alto del tratto, a ${a.terrFt} piedi.` });
  });
  const pr = state.profile, R = state.route;
  if (pr?.depOverheadFt) out.push({ lvl: 'warn', kind: 'terrain', title: `Sali sul campo fino a ${pr.depOverheadFt} ft prima di partire`,
    text: `Dopo il decollo da ${R[0].name || 'P1'}, salendo in linea col rateo dell'aereo passeresti a meno di ${LEG_CLEAR_FT} ft dal rilievo: prendi quota sopra il campo (in spirale, rispettando il circuito) fino a ${pr.depOverheadFt} ft, poi prosegui. Il tempo della salita sul campo non è nei tempi del log.`,
    plain: `Dopo il decollo sali sopra il campo fino a ${pr.depOverheadFt} piedi prima di partire: le montagne vicine non lasciano salire in linea.` });
  if (pr?.arrOverheadFt) out.push({ lvl: 'warn', kind: 'terrain', title: `Arriva sul campo a ${pr.arrOverheadFt} ft e scendi lì`,
    text: `Scendendo in linea verso ${R.at(-1).name || 'l\'arrivo'} passeresti a meno di ${LEG_CLEAR_FT} ft dal rilievo: arriva sopra il campo a ${pr.arrOverheadFt} ft e scendi lì fino alla quota di circuito.` });
  // quota di un punto non raggiungibile sul punto col rateo dell'aereo (tratto troppo corto per la salita)
  if (pr && R.length > 2) {
    let acc = 0;
    for (let i = 1; i < R.length - 1; i++) {
      acc += distM(R[i - 1], R[i]);
      const want = legAltFt(R, i, cruise()), got = pr.altAt(acc);
      if (want - got > 100) out.push({ lvl: 'warn', kind: 'terrain', title: `${R[i].name || `P${i + 1}`}: quota raggiunta dopo il punto`,
        text: `Col rateo di salita dell'aereo su ${R[i].name || `P${i + 1}`} arrivi a ${Math.round(got / 100) * 100} ft invece di ${want} ft: la salita continua dopo il punto. Allunga il tratto prima o abbassa la quota.` });
    }
  }
  return out;
}

// punto della rotta a distanza d (metri) dalla partenza
function routePointAt(d) {
  const R = state.route;
  let acc = 0;
  for (let i = 0; i < R.length - 1; i++) {
    const L = distM(R[i], R[i + 1]);
    if (d <= acc + L || i === R.length - 2) { const t = L ? Math.max(0, Math.min(1, (d - acc) / L)) : 0; return { lon: R[i].lon + t * (R[i + 1].lon - R[i].lon), lat: R[i].lat + t * (R[i + 1].lat - R[i].lat), leg: i }; }
    acc += L;
  }
  return { ...R[0], leg: 0 };
}

// ---------------------------------------------------------------- scena 3D
const view = $('view');
// Qualità grafica a gradini: risoluzione del disegno (pixel per punto dello schermo) e numero di celle del terreno.
// «Automatica» misura la fluidità mentre si muove la carta e scende di un gradino quando il dispositivo non regge
// (meno di 25 immagini al secondo), risale quando c'è margine. I calcoli di sicurezza non cambiano: usano sempre il
// terreno a piena risoluzione, la qualità riguarda solo il disegno.
const QLEVELS = [
  { pr: 1.5, mesh: 'alta' }, { pr: 1.25, mesh: 'alta' }, { pr: 1.0, mesh: 'alta' }, { pr: 1.0, mesh: 'media' },
  { pr: 0.85, mesh: 'media' }, { pr: 0.85, mesh: 'bassa' }, { pr: 0.7, mesh: 'bassa' },
];
const QFIXED = { alta: 0, media: 3, bassa: 6 };
const quality = (() => {
  let q = {}; try { q = JSON.parse(localStorage.getItem('airplanning.grafica') || '{}'); } catch { /* nessuna preferenza */ }
  const mode = ['auto', 'alta', 'media', 'bassa'].includes(q.mode) ? q.mode : 'auto';
  // primo avvio: dispositivi con poca memoria o pochi processori partono da un gradino medio
  const weak = (navigator.deviceMemory && navigator.deviceMemory <= 3) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  const level = mode === 'auto' ? (Number.isInteger(q.level) ? Math.max(0, Math.min(QLEVELS.length - 1, q.level)) : weak ? 3 : 1) : QFIXED[mode];
  return { mode, level, samples: [], fast: 0, changes: 0 };
})();
const saveQuality = () => { try { localStorage.setItem('airplanning.grafica', JSON.stringify({ mode: quality.mode, level: quality.level })); } catch { /* memoria piena */ } };
const qPr = () => Math.min(QLEVELS[quality.level].pr, window.devicePixelRatio || 1);
// l'antialiasing si decide all'avvio (non si cambia dopo): spento sui gradini bassi, dove costa di più
const renderer = new THREE.WebGLRenderer({ antialias: quality.level <= 2, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(qPr());
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#000', 140, 320);
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;
// luce da nord-ovest, alta 45° circa: la convenzione delle carte in rilievo (ombreggiatura leggibile per tutti)
scene.add(new THREE.HemisphereLight('#eef4ff', '#4a4232', 0.85));
const sun = new THREE.DirectionalLight('#fff6e8', 1.9);
sun.position.set(-60, 75, -60);
scene.add(sun);
const groups = { terrain: new THREE.Group(), radar: new THREE.Group(), air: new THREE.Group(), feat: new THREE.Group(), wx: new THREE.Group(), fc: new THREE.Group(), route: new THREE.Group(), labels: new THREE.Group(), plane: new THREE.Group() };
// Disegno su richiesta: la scena si ridisegna solo quando qualcosa cambia (camera, dati, rotta, volo), non 60 volte
// al secondo. Sul tablet è la differenza tra un'app fluida e una che scalda e si blocca.
let dirty = true, lastRender = 0, lastInteract = 0;
const invalidate = () => { dirty = true; };
// Svuotare un gruppo libera anche la memoria della scheda grafica (geometrie, materiali, immagini delle etichette):
// prima restava occupata e cresceva a ogni spostamento della carta.
function disposeTree(o) {
  o.traverse(c => {
    c.geometry?.dispose();
    for (const m of [c.material].flat()) { if (!m) continue; if (m.map && !m.map.userData.cached) m.map.dispose(); m.dispose(); }
  });
}
function wrapGroup(g) {
  const add = g.add.bind(g), remove = g.remove.bind(g);
  g.add = (...a) => { dirty = true; return add(...a); };
  g.remove = (...a) => { dirty = true; for (const o of a) disposeTree(o); return remove(...a); };
  g.clear = () => { dirty = true; for (const o of [...g.children]) { disposeTree(o); remove(o); } return g; };
  return g;
}
Object.values(groups).forEach(g => scene.add(wrapGroup(g)));
// In volo la carta segue l'aereo (prua in alto). Appena il pilota la muove col dito (rotazione, spostamento, zoom) la
// carta resta dove la porta lui: si esplora liberamente. Il pulsante col mirino (sotto la bussola) torna a seguire
// l'aereo, alla distanza scelta col dito. Prima la carta tornava subito sulla prua e non si poteva guardare intorno.
// Un tocco senza movimento (per esempio su uno spazio aereo) non sgancia la carta: conta solo se la vista è cambiata.
controls.addEventListener('start', () => {
  lastInteract = performance.now();
  const f = state.fly;
  if (state.view === 'fly' && f.pos && f.follow) f.hold = { pos: cam().position.clone(), tgt: controls.target.clone(), zoom: cam().zoom };
});
controls.addEventListener('end', () => {
  const f = state.fly, h = f.hold; if (!h) return;
  f.hold = null;
  const d = Math.max(0.1, h.pos.distanceTo(h.tgt));
  if (cam().position.distanceTo(h.pos) > d * 0.01 || controls.target.distanceTo(h.tgt) > d * 0.01 || Math.abs(cam().zoom - h.zoom) > 1e-3) setFollow(false);
});
function setFollow(on) {
  const f = state.fly;
  if (on) { const d = cam().position.distanceTo(controls.target); if (state.dim !== '2d' && f.pos && Number.isFinite(d)) f.followK = Math.min(6, Math.max(0.3, d / Math.hypot(13, 5))); }
  f.follow = on; f.camGoal = null;
  $('recenterBtn').setAttribute('aria-pressed', String(on));
  $('recenterBtn').title = on ? 'Segui l\'aereo (prua in alto)' : 'Carta libera: tocca per tornare sull\'aereo con la prua in alto';
  if (on) followCamera();
  dirty = true;
}
controls.addEventListener('change', () => { dirty = true; lastInteract = performance.now(); });
// Lavori pesanti (dettaglio del terreno, ridisegno dell'area) uno per fotogramma e solo a carta ferma
const jobs = new Map();
const queueJob = (key, fn) => { jobs.set(key, fn); };
// Linee spesse in pixel (come nei navigatori professionali): leggibili a ogni distanza, a differenza delle linee WebGL da 1 pixel
const fatLines = new Set();
function fatMat(o) {
  const m = new LineMaterial({ worldUnits: false, ...o });
  m.resolution.set(view.clientWidth || 1, view.clientHeight || 1);
  fatLines.add(m); m.addEventListener('dispose', () => fatLines.delete(m));
  return m;
}
function fatLine(points, mat) {
  const g = new LineGeometry(); g.setPositions(points.flatMap(v => [v.x, v.y, v.z]));
  const l = new Line2(g, mat); l.computeLineDistances(); return l;
}
// Carta 2D: camera ortogonale dall'alto, nord in alto, senza prospettiva (le distanze si leggono come su una carta)
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000);
const fogObj = scene.fog;
let orthoHalf = 30;
const cam = () => (state.dim === '2d' ? ortho : camera);
// area visibile della carta: i pannelli le stanno sopra; vp = dimensioni «piene» della proiezione spostata
const vp = { fw: 1, fh: 1, x: 0, y: 0 };
function setOrthoFrustum() {
  const a = vp.fw / vp.fh;
  Object.assign(ortho, { left: -orthoHalf * a, right: orthoHalf * a, top: orthoHalf, bottom: -orthoHalf });
  ortho.updateProjectionMatrix();
}
function setDim(d) {
  const was = state.dim, tgt = controls.target.clone();
  state.dim = d;
  document.querySelectorAll('[data-dim]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dim === d)));
  document.body.classList.toggle('dim-2d', d === '2d');
  if (d === '2d') {
    if (was !== '2d') { orthoHalf = state.view === 'fly' && state.fly.active ? 12 : Math.max(3, camera.position.distanceTo(tgt) * Math.tan(22.5 * Math.PI / 180)); ortho.zoom = 1; }
    controls.object = ortho; controls.enableRotate = false;
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN; controls.touches.ONE = THREE.TOUCH.PAN;
    controls.minPolarAngle = 0; controls.maxPolarAngle = 0.0001; controls.minAzimuthAngle = 0; controls.maxAzimuthAngle = 0;
    ortho.position.set(tgt.x, tgt.y + 600, tgt.z + 0.06);
    scene.fog = null; setOrthoFrustum(); state.dim = d; applySceneTheme();
  } else {
    if (was === '2d') { const dist = orthoHalf / ortho.zoom / Math.tan(22.5 * Math.PI / 180); camera.position.set(tgt.x, tgt.y + dist * 0.53, tgt.z + dist * 0.85); }
    controls.object = camera; controls.enableRotate = true;
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE; controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI * 0.495; controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity;
    scene.fog = fogObj; applySceneTheme();
  }
  controls.update(); savePrefs(); buildForecast(); buildRoute();
  if (state.fly.camGoal) state.fly.camGoal = null;
  followCamera();
  $('hint').textContent = hintText();
}
const hintText = () => Number.isInteger(state.selWp) ? `Punto ${state.selWp + 1} selezionato: trascinalo per spostarlo · tocca la carta per deselezionarlo`
  : Number.isInteger(state.selAlt) ? `Quota del tratto ${state.selAlt + 1} → ${state.selAlt + 2} selezionata: trascina la maniglia in su o in giù · tocca la carta per deselezionarla`
  : state.addMode ? 'Tocca la carta per aggiungere un punto in fondo alla rotta · trascina la linea per piegarla con un nuovo punto'
  : state.dim === '2d' ? 'Trascina per spostare · tieni premuto per la colonna d\'aria del punto · trascina la linea della rotta per piegarla'
    : 'Trascina per ruotare · tocca un punto per selezionarlo, poi trascinalo · tieni premuto per la colonna d\'aria · «Annulla» rimette l\'ultima modifica';
const yOf = ft => ft / FT / 1000 * Number(ui.exag.value);
renderer.localClippingEnabled = true;
function applySceneTheme() {
  // cielo come sfumatura CSS dietro la carta 3D; la foschia ha il colore dell'orizzonte
  fogObj.color = new THREE.Color(css('--horizon') || css('--scene'));
  scene.background = state.dim === '2d' ? new THREE.Color(css('--scene')) : null;
  dirty = true;
}

function hypso(m) {
  // tinte ipsometriche tenui (stile carte svizzere): pianura verde, colline ocra, montagna grigia, vette bianche
  const stops = [[0, '#4d7a50'], [300, '#6a9558'], [700, '#9fae6c'], [1100, '#bfb68f'], [1600, '#ab9b84'], [2100, '#a6a099'], [2500, '#e6e4df'], [2900, '#ffffff']];
  for (let i = 1; i < stops.length; i++) if (m <= stops[i][0]) {
    const t = (m - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
    return new THREE.Color(stops[i - 1][1]).lerp(new THREE.Color(stops[i][1]), Math.max(0, t));
  }
  return new THREE.Color('#ffffff');
}

// Acqua: mare (quota del modello ≤ 0) e laghi della base cartografica (OpenStreetMap)
const WATER = new THREE.Color('#7fb2d9');
function lakesIn(b) {
  const L = state.basemap?.lakes || [];
  return L.filter(l => { if (!l.bb) l.bb = ringBBox(l.ring); return l.bb.lonMax >= b.lonMin && l.bb.lonMin <= b.lonMax && l.bb.latMax >= b.latMin && l.bb.latMin <= b.latMax; });
}
function inRing(ring, lon, lat) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// Altezza (nella scena) del terreno come è disegnato, cioè sui triangoli delle maglie, non sul modello del terreno:
// tra un vertice e l'altro il triangolo può stare più in alto di una linea dritta. Le linee disegnate (rotta, scia,
// aereo) si tengono sempre almeno LIFT sopra: non entrano mai nel rilievo. È solo disegno: i controlli usano il terreno.
const LIFT_FT = 60;
function meshTopY(lon, lat) {
  let best = -Infinity;
  for (const m of terrainMeshes()) {
    const g = m.userData.grid, b = g?.b, A = m.geometry?.attributes?.position?.array;
    if (!b || !A || lon < b.lonMin || lon > b.lonMax || lat < b.latMin || lat > b.latMax) continue;
    const fx = (lon - b.lonMin) / (b.lonMax - b.lonMin) * g.nx, fy = (b.latMax - lat) / (b.latMax - b.latMin) * g.ny;
    const i = Math.max(0, Math.min(g.nx - 1, Math.floor(fx))), j = Math.max(0, Math.min(g.ny - 1, Math.floor(fy))), u = fx - i, v = fy - j;
    const h = (ii, jj) => A[(jj * (g.nx + 1) + ii) * 3 + 1];
    // stessi triangoli dell'indice: (i,j)-(i,j+1)-(i+1,j) e (i+1,j)-(i,j+1)-(i+1,j+1)
    const y = u + v <= 1 ? h(i, j) + u * (h(i + 1, j) - h(i, j)) + v * (h(i, j + 1) - h(i, j))
      : h(i + 1, j + 1) + (1 - u) * (h(i, j + 1) - h(i + 1, j + 1)) + (1 - v) * (h(i + 1, j) - h(i + 1, j + 1));
    if (y > best) best = y;
  }
  return best;
}
// y disegnata per una quota: mai sotto il terreno disegnato
const yAbove = (lon, lat, ft) => { const t = meshTopY(lon, lat); return Number.isFinite(t) ? Math.max(yOf(ft), t + yOf(LIFT_FT)) : yOf(ft); };
// Terreno colorato rispetto a una quota: in volo quella dell'aereo, in pianificazione quella scelta dal pilota.
// Rosso dove il rilievo arriva a meno di 100 ft sotto la quota (o la supera), giallo tra 100 e 1000 ft sotto.
// Il colore si calcola nella scheda grafica (shader) dalla quota di ogni punto: nessuna geometria da rifare.
const hazU = { uHaz: { value: new THREE.Vector4(0, 0, 0, 0) } };
function hazardMaterial(opts) {
  const m = new THREE.MeshLambertMaterial(opts);
  m.onBeforeCompile = sh => {
    sh.uniforms.uHaz = hazU.uHaz;
    sh.vertexShader = 'varying float vWY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = 'uniform vec4 uHaz;\nvarying float vWY;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  if (uHaz.w > 0.5) {
    if (vWY > uHaz.x - uHaz.y) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.13, 0.16), 0.78);
    else if (vWY > uHaz.x - uHaz.z) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.86, 0.0), 0.72);
  }`);
  };
  return m;
}
// on: false spegne; altFt: quota di riferimento
function setHazard(on, altFt = 0) {
  const v = hazU.uHaz.value, y = yOf(altFt), y100 = yOf(100), y1000 = yOf(1000), w = on ? 1 : 0;
  if (v.x === y && v.y === y100 && v.z === y1000 && v.w === w) return;
  v.set(y, y100, y1000, w); dirty = true;
}
// ---------------------------------------------------------------- terreno a livelli di dettaglio (lod.js)
// Come nei motori cartografici: tessere da 1° che si dividono in 4 vicino alla vista, fino a 1/16° (circa 7 km, celle
// di 80–110 m: il dettaglio dei dati a 90 m). Ogni tessera ha la stessa griglia N × N: lontano poche celle grandi,
// vicino molte piccole. Si aggiornano anche mentre la carta si muove, poche per fotogramma (budget di tempo), e restano
// in memoria (fino a 360) per tornare indietro senza ricalcolo. Bordi «a gonna» (pareti verso il basso) nascondono
// le fessure tra tessere di livello diverso; normali calcolate con un anello di campioni in più, così la luce è
// continua da una tessera all'altra. Colori: tabella precalcolata (niente oggetti colore per ogni vertice).
const LOD = { roots: [], cache: new Map(), shown: [], want: new Map(), mat: null, N: 64, px: 5, maxLevel: 4, routeSig: '', builds: 0, ms: 0, focal: 860, frustum: new THREE.Frustum(), pm: new THREE.Matrix4(), box: new THREE.Box3() };
// N celle per lato; px = dimensione massima di una cella sullo schermo prima di dividere la tessera
const QLOD = { alta: { N: 64, px: 7 }, media: { N: 48, px: 9 }, bassa: { N: 32, px: 12 } };
const HYPSO = (() => { const t = new Uint8Array(3601 * 3); for (let m = 0; m <= 3600; m++) { const c = hypso(m); t[m * 3] = c.r * 255 + 0.5; t[m * 3 + 1] = c.g * 255 + 0.5; t[m * 3 + 2] = c.b * 255 + 0.5; } return t; })();
const WATER8 = [WATER.r * 255 + 0.5 | 0, WATER.g * 255 + 0.5 | 0, WATER.b * 255 + 0.5 | 0];
const lodIndex = new Map();
// indice condiviso da tutte le tessere con la stessa N: griglia, poi 4 gonne (ognuna con le due facce)
function gridIndex(N) {
  if (lodIndex.has(N)) return lodIndex.get(N);
  const W = N + 1, S = W * W, idx = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const v = j * W + i; idx.push(v, v + W, v + 1, v + 1, v + W, v + W + 1); }
  const border = [i => i, i => N * W + i, j => j * W, j => j * W + N];
  border.forEach((bv, s) => { for (let k = 0; k < N; k++) {
    const a = bv(k), b = bv(k + 1), a2 = S + s * W + k, b2 = a2 + 1;
    idx.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2);
  } });
  const attr = new THREE.BufferAttribute(new Uint32Array(idx), 1);
  lodIndex.set(N, attr); return attr;
}
function tileGeometry(b, N) {
  const P = state.proj, W = N + 1, A = N + 3, ex = Number(ui.exag.value), lakes = lakesIn(b);
  const dLon = (b.lonMax - b.lonMin) / N, dLat = (b.latMax - b.latMin) / N;
  // quote con un anello in più (per le normali al bordo)
  const E = new Float32Array(A * A);
  for (let j = 0; j < A; j++) for (let i = 0; i < A; i++) {
    const m = terrain.elevM(b.lonMin + (i - 1) * dLon, b.latMax - (j - 1) * dLat);
    E[j * A + i] = Number.isFinite(m) ? m : 0;
  }
  const S = W * W, nV = S + 4 * W;
  const pos = new Float32Array(nV * 3), nor = new Int8Array(nV * 3), col = new Uint8Array(nV * 3);
  const o = P.toLocal(b.lonMin, b.latMax), sx = P.toLocal(b.lonMin + dLon, b.latMax).x - o.x, sz = P.toLocal(b.lonMin, b.latMax - dLat).z - o.z;
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const v = j * W + i, e = j + 1, f = i + 1, m = E[e * A + f], lon = b.lonMin + i * dLon, lat = b.latMax - j * dLat;
    pos[v * 3] = o.x + i * sx; pos[v * 3 + 1] = m / 1000 * ex; pos[v * 3 + 2] = o.z + j * sz;
    const gx = (E[e * A + f + 1] - E[e * A + f - 1]) / 1000 * ex / (2 * sx), gz = (E[(e + 1) * A + f] - E[(e - 1) * A + f]) / 1000 * ex / (2 * sz);
    const L = 127 / Math.hypot(gx, 1, gz); nor[v * 3] = Math.round(-gx * L); nor[v * 3 + 1] = Math.round(L); nor[v * 3 + 2] = Math.round(-gz * L);
    const water = (!terrain.demo && m <= 0) || (lakes.length && lakes.some(l => lon >= l.bb.lonMin && lon <= l.bb.lonMax && lat >= l.bb.latMin && lat <= l.bb.latMax && inRing(l.ring, lon, lat)));
    if (water) col.set(WATER8, v * 3); else { const h = Math.max(0, Math.min(3600, Math.round(m))) * 3; col[v * 3] = HYPSO[h]; col[v * 3 + 1] = HYPSO[h + 1]; col[v * 3 + 2] = HYPSO[h + 2]; }
  }
  // gonne: copia del bordo abbassata di circa una cella (in scala verticale), stessa normale e colore
  const drop = Math.max(Math.abs(sx), Math.abs(sz)) * 0.9 * ex;
  const border = [i => i, i => N * W + i, j => j * W, j => j * W + N];
  border.forEach((bv, s) => { for (let k = 0; k < W; k++) {
    const src = bv(k), dst = S + s * W + k;
    pos[dst * 3] = pos[src * 3]; pos[dst * 3 + 1] = pos[src * 3 + 1] - drop; pos[dst * 3 + 2] = pos[src * 3 + 2];
    nor.copyWithin(dst * 3, src * 3, src * 3 + 3); col.copyWithin(dst * 3, src * 3, src * 3 + 3);
  } });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  geo.setIndex(gridIndex(N));
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  return geo;
}
function lodBuild(t) {
  const t0 = performance.now();
  const old = LOD.cache.get(t.key);
  const mesh = new THREE.Mesh(tileGeometry(t.b, LOD.N), LOD.mat);
  mesh.userData.grid = { nx: LOD.N, ny: LOD.N, b: t.b }; mesh.userData.tile = t; mesh.matrixAutoUpdate = false;
  if (old) { if (old.mesh.parent) THREE.Group.prototype.remove.call(groups.terrain, old.mesh); old.mesh.geometry.dispose(); }
  LOD.cache.set(t.key, { mesh, used: performance.now(), stale: false, tile: t });
  LOD.builds++; LOD.ms += performance.now() - t0;
}
function buildTerrain() {
  for (const m of [...groups.terrain.children]) THREE.Group.prototype.remove.call(groups.terrain, m);
  for (const c of LOD.cache.values()) c.mesh.geometry.dispose();
  dirty = true;
  LOD.cache.clear(); LOD.want.clear(); LOD.shown = []; LOD.routeSig = '';
  const q = QLOD[QLEVELS[quality.level].mesh]; LOD.N = q.N; LOD.px = q.px;
  if (!LOD.mat) LOD.mat = hazardMaterial({ vertexColors: true });
  if (!state.proj) return;
  LOD.roots = rootTiles(state.area);
  for (const r of LOD.roots) lodBuild(r);     // le radici sempre pronte: la superficie non ha mai buchi
  lodUpdate(30);
}
// la vista vuole più dettaglio su questa tessera? Errore sullo schermo: una cella della tessera, vista dalla camera,
// non deve superare LOD.px pixel. Tessere fuori dall'inquadratura non si dividono (non si vedono).
const tileKm = b => Math.max((b.lonMax - b.lonMin) * 111.32 * Math.cos((b.latMin + b.latMax) * Math.PI / 360), (b.latMax - b.latMin) * 111.2);
function lodWantSplit(t) {
  const P = state.proj, b = t.b, s = tileKm(b), cell = s / LOD.N;
  const p0 = P.toLocal(b.lonMin, b.latMax), p1 = P.toLocal(b.lonMax, b.latMin);
  if (state.dim === '2d') {
    const v = viewKm(), tg = controls.target, half = v * 0.6 * Math.max(1, camera.aspect || 1);
    if (p1.x < tg.x - half || p0.x > tg.x + half || p1.z < tg.z - half || p0.z > tg.z + half) return false;
    return cell * (renderer.domElement.clientHeight || 800) / v > LOD.px;
  }
  const B = LOD.box; B.min.set(p0.x, yOf(-200), p0.z); B.max.set(p1.x, yOf(16000), p1.z);
  if (!LOD.frustum.intersectsBox(B)) return false;
  const d = Math.max(0.05, B.distanceToPoint(cam().position));
  return cell * LOD.focal / d > LOD.px;
}
// a ogni fotogramma: scelta delle tessere, poi costruzione delle mancanti più vicine entro il budget (ms)
function lodUpdate(budgetMs) {
  if (!state.proj || !LOD.roots.length) return;
  LOD.want.clear();
  const C = cam(); C.updateMatrixWorld(); LOD.pm.multiplyMatrices(C.projectionMatrix, C.matrixWorldInverse); LOD.frustum.setFromProjectionMatrix(LOD.pm);
  LOD.focal = (renderer.domElement.clientHeight || 800) / (2 * Math.tan((camera.fov || 50) * Math.PI / 360));
  const ready = t => { const c = LOD.cache.get(t.key); return !!c; };
  const shown = selectLod(LOD.roots, { wantSplit: lodWantSplit, isReady: ready, need: t => LOD.want.set(t.key, t), maxLevel: LOD.maxLevel });
  const now = performance.now();
  // le tessere fini (dal livello 2) aspettano i dati a 90 m della loro cella: intanto resta la madre
  const todo = [...LOD.want.values()].filter(t => { if (t.level >= 2 && terrain.missing(t.b).length) { ensureTerrainFor(t.b); return false; } return true; });
  for (const c of LOD.cache.values()) if (c.stale) todo.push(c.tile);
  if (todo.length) {
    const cp = cam().position, P = state.proj;
    const dist = t => { const c = P.toLocal((t.b.lonMin + t.b.lonMax) / 2, (t.b.latMin + t.b.latMax) / 2); return Math.hypot(cp.x - c.x, cp.z - c.z) / tileKm(t.b); };
    todo.sort((a, b) => dist(a) - dist(b));
    const t0 = performance.now();
    for (const t of todo) { if (performance.now() - t0 > budgetMs) break; lodBuild(t); }
  }
  // scena: via le tessere non più mostrate (restano in memoria), dentro le nuove
  const keep = new Set(shown.map(t => { const c = LOD.cache.get(t.key); c.used = now; return c.mesh; }));
  let changed = false;
  for (const m of [...groups.terrain.children]) if (!keep.has(m)) { THREE.Group.prototype.remove.call(groups.terrain, m); changed = true; }
  for (const m of keep) if (m.parent !== groups.terrain) { THREE.Group.prototype.add.call(groups.terrain, m); changed = true; }
  LOD.shown = shown.map(t => LOD.cache.get(t.key).mesh);
  if (changed) {
    dirty = true;
    // le linee (rotta, scia, aereo) seguono il terreno disegnato: si rifanno se sotto la rotta è cambiato qualcosa
    const rb = state.route.length ? boundsAround(state.route, 2) : null;
    const sig = rb ? shown.filter(t => t.b.lonMax >= rb.lonMin && t.b.lonMin <= rb.lonMax && t.b.latMax >= rb.latMin && t.b.latMin <= rb.latMax).map(t => t.key).join('|') : '';
    if (sig !== LOD.routeSig || state.fly.pos) { LOD.routeSig = sig; queueJob('routeOnTerrain', () => { buildRoute(); buildTrail(); buildPlane(); }); }
  }
  // memoria: oltre 360 tessere si tolgono le meno usate da almeno 5 s (mai radici, mai quelle in vista)
  if (LOD.cache.size > 360) {
    const old = [...LOD.cache.values()].filter(c => c.tile.level > 0 && c.mesh.parent !== groups.terrain && now - c.used > 5000).sort((a, b) => a.used - b.used);
    for (const c of old.slice(0, LOD.cache.size - 300)) { c.mesh.geometry.dispose(); LOD.cache.delete(c.tile.key); }
  }
}
// dati più fini arrivati in un'area: le tessere che la toccano si rifanno (intanto si vedono le vecchie)
function lodInvalidate(b) {
  for (const c of LOD.cache.values()) { const t = c.tile.b; if (!b || (t.lonMax >= b.lonMin && t.lonMin <= b.lonMax && t.latMax >= b.latMin && t.latMin <= b.latMax)) c.stale = true; }
}
function viewKm() { return state.dim === '2d' ? (ortho.top - ortho.bottom) / ortho.zoom : camera.position.distanceTo(controls.target); }
const terrainMeshes = () => LOD.shown;

// ---------------------------------------------------------------- caricamento delle tessere fini quando servono
let terrainReloadT = null;
function ensureTerrainFor(b) {
  if (!b || !terrain.missing(b).length) return;
  terrain.ensure(b).then(n => {
    if (!n) return;
    clearTimeout(terrainReloadT);
    terrainReloadT = setTimeout(() => { computeAirspaceLimits(); lodInvalidate(b); buildAirspaces(); buildFeatures(); buildBasemap(); buildRoute(); buildPlane(); refresh(); }, 60);
  }).catch(e => showFlyMsg(`Terreno dettagliato non caricato: ${e.message}`));
}
function boundsAround(points, km) {
  if (!points.length) return null;
  const lat = points.reduce((q, p) => q + p.lat, 0) / points.length, dLat = km / 111.2, dLon = km / (111.32 * Math.cos(lat * Math.PI / 180));
  return { lonMin: Math.min(...points.map(p => p.lon)) - dLon, lonMax: Math.max(...points.map(p => p.lon)) + dLon, latMin: Math.min(...points.map(p => p.lat)) - dLat, latMax: Math.max(...points.map(p => p.lat)) + dLat };
}
// rotta più 10 km: copre anche il rilievo entro 5 km (limite VDS) e la quota minima di sicurezza (5 NM)
const ensureTerrainForRoute = () => ensureTerrainFor(boundsAround(state.route, 10));

// ---------------------------------------------------------------- area di lavoro: ciò che si disegna in 3D
// Con il pacchetto dell'Italia centrale si disegnano spazi aerei, campi e base cartografica entro 90 km dal centro
// della vista (più tutto ciò che la rotta attraversa); i controlli usano sempre TUTTI i dati.
const FOCUS_KM = 90;
function updateFocus(force) {
  if (!state.proj) return false;
  const t = controls.target, c = state.proj.fromLocal(t.x, t.z), f = state.focus;
  if (!force && f && distM(f.c, c) < FOCUS_KM * 1000 * 0.3) return false;
  state.focus = { c, b: boundsAround([c], FOCUS_KM) };
  return true;
}
const inFocus = p => { const b = state.focus?.b; return !b || (p.lon >= b.lonMin && p.lon <= b.lonMax && p.lat >= b.latMin && p.lat <= b.latMax); };
const bboxInFocus = bb => { const b = state.focus?.b; return !b || !bb || (bb.lonMax >= b.lonMin && bb.lonMin <= b.lonMax && bb.latMax >= b.latMin && bb.latMin <= b.latMax); };

// Immagini delle etichette in cache: la stessa scritta non si ridisegna a ogni ricostruzione della scena
const texCache = new Map();
function cachedTex(key, draw) {
  let t = texCache.get(key);
  if (!t) {
    if (texCache.size > 3000) { for (const v of texCache.values()) { v.tex.userData.cached = false; v.tex.dispose(); } texCache.clear(); }
    const c = document.createElement('canvas'), meta = draw(c, c.getContext('2d'));
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.userData.cached = true;
    tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    t = { tex, w: c.width, h: c.height, ...meta }; texCache.set(key, t);
  }
  return t;
}
const roundRect = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); };
// Etichetta rettangolare: fondo chiaro, bordo sottile, testo scuro o colorato; dimensione fissa in pixel (scaleLabels)
function makeLabel(text, color, scale = 1, style = 'box') {
  const t = cachedTex(`L|${style}|${color}|${text}`, (c, ctx) => {
    const font = `600 30px ${FONT}`; ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 26, h = 42;
    c.width = w + 4; c.height = h + 4; ctx.font = font;
    roundRect(ctx, 2, 2, w, h, 6);
    if (style === 'dark') { ctx.fillStyle = 'rgba(17,24,39,0.86)'; ctx.fill(); ctx.fillStyle = '#ffffff'; }
    else { ctx.fillStyle = 'rgba(255,255,255,0.93)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(15,27,40,0.18)'; ctx.stroke(); ctx.fillStyle = color; }
    ctx.textBaseline = 'middle'; ctx.fillText(text, 15, 2 + h / 2 + 1);
    return {};
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.tex, depthTest: false, transparent: true }));
  // dimensione fissa sullo schermo (in pixel), qualunque sia lo zoom: vedi scaleLabels()
  s.userData.px = [t.w / t.h * 20 * scale, 20 * scale]; s.renderOrder = 10;
  return s;
}

const AIR_CEIL = [['auto', 'crociera + 2500 ft'], ['5000', '5000 ft'], ['7500', '7500 ft'], ['10000', '10000 ft'], ['12000', '12000 ft (sotto FL 125)'], ['all', 'tutti']];
const airCeilFt = () => state.airCeil === 'all' ? Infinity : state.airCeil === 'auto' ? cruise() + 2500 : Number(state.airCeil) || cruise() + 2500;
const ceilOptions = () => AIR_CEIL.map(([v, t]) => `<option value="${v}"${v === state.airCeil ? ' selected' : ''}>${t}</option>`).join('');
function setAirCeil(v) { state.airCeil = v; savePrefs(); ui.ceiling.value = v; const m = $('ceilMap'); if (m) m.value = v; schedule('limits'); }
// Spazi aerei da mostrare: fino alla quota scelta (sopra, nascosti ma sempre nei controlli)
function visibleAirspaces() {
  const ceil = airCeilFt();
  return state.airspaces.filter(a => a.clipped.length && !a.suspect && (ui.showFir.checked && state.mode === 'expert' || !FIR_TYPES.has(a.type)) && a.minLowerFt < ceil);
}
// Per i controlli si usano sempre tutti gli spazi (anche quelli nascosti), tranne FIR e dati sospetti
const checkAirspaces = () => state.airspaces.filter(a => a.clipped.length && !a.suspect && !FIR_TYPES.has(a.type));

function prepareAirspaces() {
  const a = state.area;
  for (const s of state.airspaces) {
    s.clipped = [];
    for (const ring of s.rings) {
      const b = ringBBox(ring);
      if (b.lonMax < a.lonMin || b.lonMin > a.lonMax || b.latMax < a.latMin || b.latMin > a.latMax) continue;
      const c = clipRing(ring, a);
      if (c.length >= 3) s.clipped.push(densify(c, 1.0));
    }
    s.bbox = s.clipped.length ? ringBBox(s.clipped.flat()) : null;
  }
  computeAirspaceLimits();
}
function computeAirspaceLimits() {
  for (const s of state.airspaces) {
    s.minLowerFt = Infinity;
    let maxGap = -Infinity;
    for (const ring of s.clipped) for (const p of ring) {
      const t = terrain.elevFt(p[0], p[1]);
      s.minLowerFt = Math.min(s.minLowerFt, limitFt(s.lower, t, qnh()));
      if (Number.isFinite(t)) maxGap = Math.max(maxGap, limitFt(s.upper, t, qnh()) - Math.max(t, limitFt(s.lower, t, qnh())));
    }
    // Dato sospetto: il volume non esiste da nessuna parte (tetto sotto il terreno o sotto la base)
    s.suspect = s.clipped.length > 0 && Number.isFinite(maxGap) && maxGap <= 0;
  }
}

// Spazi «rilevanti»: attraversati dalla rotta, in arrivo durante il volo, o selezionati. Sono evidenziati;
// gli altri restano visibili ma tenui, per ridurre il disordine senza nascondere nulla che conti.
function relevantAirspaces() {
  const set = new Set();
  if (state.analysis) for (const h of state.analysis.hits) set.add(h.a);
  for (const e of state.fly.events || []) if (e.airspace) set.add(e.airspace);
  for (const a of state.fly.inside || []) set.add(a);
  if (state.selected) set.add(state.selected);
  return set;
}
// Superficie di un limite AGL drappeggiata sul rilievo: griglia sul poligono (celle di 0,35–1,5 km), celle interne
// intere, celle sul bordo ritagliate sul poligono; quota di ogni vertice = terreno + limite. Restituisce triangoli
// (x, y, z in fila). floor: superficie di fondo (mai sotto il terreno).
function drapedCap(ring, lim, ceil, floor) {
  const P = state.proj, bb = ringBBox(ring), q = qnh();
  const wKm = (bb.lonMax - bb.lonMin) * 111.32 * Math.cos((bb.latMin + bb.latMax) * Math.PI / 360), hKm = (bb.latMax - bb.latMin) * 111.2;
  const cellKm = Math.max(0.35, Math.min(1.5, Math.max(wKm, hKm) / 60));
  const nx = Math.max(1, Math.ceil(wKm / cellKm)), ny = Math.max(1, Math.ceil(hKm / cellKm));
  const dLon = (bb.lonMax - bb.lonMin) / nx, dLat = (bb.latMax - bb.latMin) / ny, out = [];
  const vtx = (lon, lat) => { const t = terrain.elevFt(lon, lat), tf = Number.isFinite(t) ? t : 0, l = P.toLocal(lon, lat);
    let ft = Math.min(limitFt(lim, tf, q), ceil); if (floor) ft = Math.max(ft, tf);
    out.push(l.x, yOf(ft), l.z); };
  const inside = new Uint8Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) inside[j * (nx + 1) + i] = inRing(ring, bb.lonMin + i * dLon, bb.latMin + j * dLat) ? 1 : 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x0 = bb.lonMin + i * dLon, y0 = bb.latMin + j * dLat, x1 = x0 + dLon, y1 = y0 + dLat, k = j * (nx + 1) + i;
    const n = inside[k] + inside[k + 1] + inside[k + nx + 1] + inside[k + nx + 2];
    if (n === 4) { [[x0, y0], [x1, y0], [x1, y1], [x0, y0], [x1, y1], [x0, y1]].forEach(([lo, la]) => vtx(lo, la)); continue; }
    const piece = clipRing(ring, { lonMin: x0, lonMax: x1, latMin: y0, latMax: y1 });
    if (piece.length < 3) continue;
    const tris = THREE.ShapeUtils.triangulateShape(piece.map(p => new THREE.Vector2(p[0], p[1])), []);
    for (const t of tris) for (const v of t) vtx(piece[v][0], piece[v][1]);
  }
  return out;
}
function buildAirspaces() {
  groups.air.clear(); groups.labels.clear();
  if (!state.proj) return;
  const P = state.proj, ceil = airCeilFt();
  const rel = relevantAirspaces(), anyRel = rel.size > 0;
  const vis = visibleAirspaces().filter(a => rel.has(a) || bboxInFocus(a.bbox));
  if (!state.labelsTouched) ui.showLabels.checked = state.mode === 'expert' && vis.length <= 25;
  // Fluidità: gli spazi «normali» (non evidenziati né selezionati) finiscono in tre sole maglie condivise (pareti,
  // cieli, contorni) invece di 3–4 oggetti ciascuno: da circa 600 disegni per fotogramma a pochi. Ogni triangolo sa a
  // quale spazio appartiene (faceMap), così il tocco li distingue lo stesso.
  const B = { wPos: [], wCol: [], wMap: [], cPos: [], cCol: [], cMap: [], lPos: [], lCol: [] };
  for (const a of vis) {
    const color = new THREE.Color(CAT_COLOR[category(a)]), hot = rel.has(a), sel = state.selected === a;
    // opacità: evidenziato 0,38 (0,5 se selezionato), normale 0,22, attenuato 0,1 quando c'è qualcosa da evidenziare
    const op = sel ? 0.5 : hot ? 0.38 : anyRel ? 0.1 : 0.22;
    for (const ring of a.clipped) {
      const loc = ring.map(p => P.toLocal(p[0], p[1]));
      const terr = ring.map(p => terrain.elevFt(p[0], p[1]));
      // Limiti sopra il terreno (AGL, per esempio parchi «SFC–3300 ft AGL»): seguono il rilievo punto per punto, anche
      // all'interno, non solo sul bordo. Prima il cielo era piatto alla quota del bordo + 3300 ft e le cime interne
      // (Monte Velino) lo bucavano. L'esagerazione verticale vale uguale per terreno e spazi, quindi le distanze tornano.
      // Il tetto si taglia alla quota «Spazi fino a» solo se è in quota assoluta (MSL o FL), mai se è AGL.
      const aglTop = a.upper?.ref === 'GND' && a.upper.value > 0 && a.upper.value < 99999;
      const floating = !(a.lower.ref === 'GND' && a.lower.value === 0), aglBot = floating && a.lower?.ref === 'GND';
      const bot = ring.map((p, i) => Math.max(limitFt(a.lower, terr[i], qnh()), Number.isFinite(terr[i]) ? terr[i] : 0));
      const top = ring.map((p, i) => aglTop ? limitFt(a.upper, terr[i], qnh()) : Math.min(limitFt(a.upper, terr[i], qnh()), ceil));
      // pareti sfumate: piene in alto, quasi trasparenti in basso (si legge il volume senza «impastare» la carta)
      const pos = [], al = [], aTop = Math.min(0.75, op * 2.1), aBot = op * 0.25;
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length;
        if (top[i] <= bot[i] && top[j] <= bot[j]) continue;
        const A = [loc[i].x, yOf(bot[i]), loc[i].z], B = [loc[j].x, yOf(bot[j]), loc[j].z];
        const C = [loc[j].x, yOf(Math.max(top[j], bot[j])), loc[j].z], D = [loc[i].x, yOf(Math.max(top[i], bot[i])), loc[i].z];
        pos.push(...A, ...B, ...C, ...A, ...C, ...D); al.push(aBot, aBot, aTop, aBot, aTop, aTop);
      }
      // cielo (e fondo, se il volume è sospeso): velo leggero, più marcato se lo spazio conta per la rotta
      const cap = [];
      const flat = (aglTop && (!floating || aglBot)) ? null : THREE.ShapeUtils.triangulateShape(loc.map(p => new THREE.Vector2(p.x, p.z)), []);
      if (aglTop) cap.push(...drapedCap(ring, a.upper, Infinity, false));
      else for (const t of flat) cap.push(...t.flatMap(k => [loc[k].x, yOf(top[k]), loc[k].z]));
      if (floating) {
        if (aglBot) cap.push(...drapedCap(ring, a.lower, Infinity, true));
        else for (const t of flat) cap.push(...t.flatMap(k => [loc[k].x, yOf(bot[k]), loc[k].z]));
      }
      const capA = sel ? 0.3 : hot ? 0.16 : op * 0.4;
      if (!hot && !sel) {
        // nelle maglie condivise
        B.wPos.push(...pos); for (const x of al) B.wCol.push(color.r, color.g, color.b, x); for (let k = 0; k < pos.length / 9; k++) B.wMap.push(a);
        B.cPos.push(...cap); for (let k = 0; k < cap.length / 3; k++) B.cCol.push(color.r, color.g, color.b, capA); for (let k = 0; k < cap.length / 9; k++) B.cMap.push(a);
        const seg = arr => { for (let i = 0; i < loc.length; i++) { const j = (i + 1) % loc.length; B.lPos.push(loc[i].x, yOf(arr[i]), loc[i].z, loc[j].x, yOf(arr[j]), loc[j].z); B.lCol.push(color.r, color.g, color.b, color.r, color.g, color.b); } };
        seg(top); if (floating) seg(bot);
      } else {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(al.flatMap(x => [color.r, color.g, color.b, x]), 4));
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        mesh.userData.airspace = a; mesh.renderOrder = hot ? 3 : 2;
        groups.air.add(mesh);
        const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cap, 3));
        const capMesh = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: capA, side: THREE.DoubleSide, depthWrite: false }));
        capMesh.userData.airspace = a; capMesh.renderOrder = 2; groups.air.add(capMesh);
      }
      const lineMat = new THREE.LineBasicMaterial({ color, transparent: !hot, opacity: hot ? 1 : anyRel ? 0.35 : 0.8 });
      const outline = arr => new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(loc.map((p, i) => new THREE.Vector3(p.x, yOf(arr[i]), p.z))), lineMat);
      if (hot || sel) { groups.air.add(outline(top)); if (floating) groups.air.add(outline(bot)); }
      // spazi che contano per la rotta: bordo superiore spesso
      if (hot) { const pts = loc.map((p, i) => new THREE.Vector3(p.x, yOf(top[i]), p.z)); pts.push(pts[0]); const fl = fatLine(pts, fatMat({ color, linewidth: sel ? 4 : 3 })); fl.renderOrder = 3; groups.air.add(fl); }
      if (hot) {
        // spigoli verticali ogni 3 km circa e impronta sul terreno: aiutano a capire dove inizia e finisce il volume
        const edges = [];
        for (let i = 0; i < ring.length; i += 8) if (top[i] > bot[i]) edges.push(new THREE.Vector3(loc[i].x, yOf(bot[i]), loc[i].z), new THREE.Vector3(loc[i].x, yOf(top[i]), loc[i].z));
        groups.air.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edges), lineMat));
        if (floating) groups.air.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(loc.map((p, i) => new THREE.Vector3(p.x, yOf((Number.isFinite(terr[i]) ? terr[i] : 0) + 60), p.z))),
          new THREE.LineDashedMaterial({ color, dashSize: 0.5, gapSize: 0.35 })).computeLineDistances());
      }
      let cx = 0, cz = 0; loc.forEach(p => { cx += p.x; cz += p.z; });
      const lab = makeLabel(`${a.name} · ${limitText(a.lower)}–${limitText(a.upper)}`, CAT_COLOR[category(a)]);
      lab.position.set(cx / loc.length, yOf(Math.max(...top)) + 0.9, cz / loc.length);
      lab.userData.hot = hot;
      lab.visible = hot || ui.showLabels.checked;
      groups.labels.add(lab);
    }
  }
  if (B.wPos.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(B.wPos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(B.wCol, 4));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false })); m.userData.faceMap = B.wMap; m.renderOrder = 2; groups.air.add(m);
  }
  if (B.cPos.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(B.cPos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(B.cCol, 4));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false })); m.userData.faceMap = B.cMap; m.renderOrder = 2; groups.air.add(m);
  }
  if (B.lPos.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(B.lPos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(B.lCol, 3));
    groups.air.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: anyRel ? 0.35 : 0.8 })));
  }
  renderLegend(vis);
}

// Colori della rotta: magenta, il colore convenzionale della rotta attiva nella strumentazione aeronautica
const ROUTE = { day: { line: '#c8008c', halo: '#ffffff', curtain: '#c8008c', shadow: '#4a1238' }, night: { line: '#ff5ad1', halo: '#1a0614', curtain: '#ff5ad1', shadow: '#000000' } };
const CLR = { crit: '#e11d2e', warn: '#f59e0b' };
const routeCol = () => ROUTE[state.theme === 'day' ? 'day' : 'night'];
// simboli disegnati una volta (cache): punto di virata, campo di partenza/arrivo, maniglia della quota, freccia
function symbolTex(kind) {
  return cachedTex(`S|${kind}|${state.theme}`, (c, ctx) => {
    const S = 64; c.width = S; c.height = S; const r = routeCol(), m = S / 2;
    ctx.lineWidth = 7;
    if (kind === 'wp' || kind === 'field') {
      ctx.beginPath(); ctx.arc(m, m, 22, 0, Math.PI * 2);
      ctx.fillStyle = kind === 'field' ? r.line : '#ffffff'; ctx.fill();
      ctx.strokeStyle = kind === 'field' ? '#ffffff' : r.line; ctx.stroke();
      ctx.beginPath(); ctx.arc(m, m, 6, 0, Math.PI * 2); ctx.fillStyle = kind === 'field' ? '#ffffff' : r.line; ctx.fill();
    } else if (kind === 'alt') {
      ctx.beginPath(); ctx.arc(m, m, 24, 0, Math.PI * 2); ctx.fillStyle = '#1d4ed8'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(m, 12); ctx.lineTo(m + 10, 26); ctx.lineTo(m - 10, 26); ctx.fill();
      ctx.beginPath(); ctx.moveTo(m, S - 12); ctx.lineTo(m + 10, S - 26); ctx.lineTo(m - 10, S - 26); ctx.fill();
    } else if (kind === 'plane') {
      // sagoma di aereo vista dall'alto, muso verso destra: giallo con bordo scuro (visibile sul terreno e sulla rotta)
      ctx.save(); ctx.translate(m, m); ctx.scale(1.05, 1.05);
      ctx.beginPath();
      ctx.moveTo(26, 0); ctx.lineTo(18, -3); ctx.lineTo(4, -4); ctx.lineTo(-2, -24); ctx.lineTo(-9, -24); ctx.lineTo(-6, -4); ctx.lineTo(-18, -4); ctx.lineTo(-23, -11); ctx.lineTo(-27, -11);
      ctx.lineTo(-25, 0); ctx.lineTo(-27, 11); ctx.lineTo(-23, 11); ctx.lineTo(-18, 4); ctx.lineTo(-6, 4); ctx.lineTo(-9, 24); ctx.lineTo(-2, 24); ctx.lineTo(4, 4); ctx.lineTo(18, 3); ctx.closePath();
      ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = '#111827'; ctx.stroke(); ctx.fillStyle = '#ffd400'; ctx.fill();
      ctx.restore();
    } else if (kind === 'wpSel' || kind === 'altSel') {
      // punto o maniglia selezionati: anello arancione spesso intorno, si capisce cosa si sta per spostare
      ctx.beginPath(); ctx.arc(m, m, 27, 0, Math.PI * 2); ctx.fillStyle = '#f59e0b'; ctx.fill();
      ctx.beginPath(); ctx.arc(m, m, 19, 0, Math.PI * 2); ctx.fillStyle = kind === 'altSel' ? '#1d4ed8' : '#ffffff'; ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = kind === 'altSel' ? '#ffffff' : r.line; ctx.stroke();
      if (kind === 'altSel') { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(m, 16); ctx.lineTo(m + 8, 27); ctx.lineTo(m - 8, 27); ctx.fill(); ctx.beginPath(); ctx.moveTo(m, S - 16); ctx.lineTo(m + 8, S - 27); ctx.lineTo(m - 8, S - 27); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(m, m, 6, 0, Math.PI * 2); ctx.fillStyle = r.line; ctx.fill(); }
    } else if (kind === 'traffic' || kind === 'trafficAlarm') {
      // traffico: punta di freccia (verso destra = direzione di volo), ciano o rosso se in allarme
      ctx.save(); ctx.translate(m, m);
      ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(-18, -16); ctx.lineTo(-9, 0); ctx.lineTo(-18, 16); ctx.closePath();
      ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff'; ctx.stroke(); ctx.fillStyle = kind === 'traffic' ? '#0891b2' : '#dc2626'; ctx.fill();
      ctx.restore();
    } else if (kind === 'arrow') {
      // freccia «›» bianca su disco magenta, rivolta verso destra (ruotata sullo schermo come il tratto)
      ctx.beginPath(); ctx.arc(m, m, 20, 0, Math.PI * 2); ctx.fillStyle = r.line; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(m - 6, m - 10); ctx.lineTo(m + 6, m); ctx.lineTo(m - 6, m + 10); ctx.stroke();
    }
    return {};
  });
}
function symbol(kind, px) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: symbolTex(kind).tex, depthTest: false, transparent: true }));
  s.userData.px = [px, px]; return s;
}
// Margine dal terreno lungo la rotta, ogni 250 m: rosso se la rotta è nel terreno, arancio sotto 500 ft
// (fuori dalle rampe vicino ai campi, come i controlli dell'assistente)
function routeSamples(pr) {
  const out = [], step = 250, total = pr.total;
  for (let d = 0; d <= total + 1; d += step) {
    const dd = Math.min(d, total), q = routePointAt(dd), alt = pr.altAt(dd), terr = terrain.elevFt(q.lon, q.lat);
    const nearField = (pr.depGround && dd < pr.depEnd) || (pr.arrGround && dd > pr.arrStart);
    const clr = Number.isFinite(terr) ? alt - terr : Infinity;
    out.push({ d: dd, lon: q.lon, lat: q.lat, alt, terr: Number.isFinite(terr) ? terr : 0, lvl: clr < 0 && dd > 1000 && dd < total - 1000 ? 'crit' : clr < 500 && !nearField ? 'warn' : '' });
    if (dd >= total) break;
  }
  return out;
}
function buildRoute() {
  groups.route.clear();
  if (!state.route.length || !state.proj) return;
  const P = state.proj, cr = cruise(), col = routeCol(), is3d = state.dim !== '2d';
  const R = state.route, pr = state.route.length > 1 ? (state.profile = planProfile()) : null;
  // la rotta è una linea dritta tra i vertici del profilo (punti, inizio e fine di salite e discese) alla quota
  // pianificata: non segue il rilievo. Se il rilievo è troppo alto, si alza la quota (rules.js, applyClearance)
  const toV = (lon, lat, ft) => { const l = P.toLocal(lon, lat); return new THREE.Vector3(l.x, yOf(ft), l.z); };
  let acc = 0; const wpD = R.map((p, i) => (i ? (acc += distM(R[i - 1], p)) : 0));
  if (pr) {
    // vertici del profilo nell'ordine (i tratti verticali di salita o discesa sul campo restano) più i punti di virata
    const V = pr.pts.map(q => ({ d: q.d, alt: q.alt }));
    for (const d of wpD) if (!V.some(v => Math.abs(v.d - d) < 0.5)) V.push({ d, alt: pr.altAt(d) });
    V.sort((x, y) => x.d - y.d);
    // sui campi (a terra) la linea si appoggia sul terreno disegnato, che lì può essere appena più alto della quota del campo
    const pts = V.map((v, k) => { const q = routePointAt(v.d), onField = (k === 0 && pr.depGround) || (k === V.length - 1 && pr.arrGround);   // a terra su partenza e arrivo
      if (!onField) return toV(q.lon, q.lat, v.alt); const l = P.toLocal(q.lon, q.lat); return new THREE.Vector3(l.x, yAbove(q.lon, q.lat, v.alt), l.z); });
    const S = routeSamples(pr);
    // 1. parete trasparente dalla rotta al terreno (solo 3D): mostra a colpo d'occhio quanto si è alti sul rilievo
    if (is3d) {
      const pos = [], colr = [], cMain = new THREE.Color(col.curtain), cC = new THREE.Color(CLR.crit), cW = new THREE.Color(CLR.warn);
      for (let i = 0; i < S.length - 1; i++) {
        const a = S[i], b = S[i + 1], A = P.toLocal(a.lon, a.lat), B = P.toLocal(b.lon, b.lat);
        const c = a.lvl === 'crit' || b.lvl === 'crit' ? cC : a.lvl === 'warn' || b.lvl === 'warn' ? cW : cMain, top = c === cMain ? 0.26 : 0.42;
        const v = [[A.x, yOf(a.terr), A.z, 0.03], [B.x, yOf(b.terr), B.z, 0.03], [B.x, yOf(Math.max(b.alt, b.terr)), B.z, top], [A.x, yOf(Math.max(a.alt, a.terr)), A.z, top]];
        for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(v[k][0], v[k][1], v[k][2]); colr.push(c.r, c.g, c.b, v[k][3]); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 4));
      const curtain = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      curtain.renderOrder = 4; groups.route.add(curtain);
      // ombra della rotta sul terreno
      const sh = fatLine(S.map(q => { const l = P.toLocal(q.lon, q.lat), t = meshTopY(q.lon, q.lat); return new THREE.Vector3(l.x, (Number.isFinite(t) ? t : yOf(q.terr)) + yOf(25), l.z); }), fatMat({ color: col.shadow, linewidth: 2.5, transparent: true, opacity: 0.55, depthWrite: false }));
      sh.renderOrder = 4; groups.route.add(sh);
    }
    // 2. rotta: traccia tenue e continua «in trasparenza» dove il rilievo la nasconde (prima tratteggiata: muovendo la
    // carta i trattini sembravano scorrere, 8/11/2026), poi bordo chiaro e linea magenta spessa
    const xr = fatLine(pts, fatMat({ color: col.line, linewidth: 2, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false }));
    xr.renderOrder = 5; groups.route.add(xr);
    const halo = fatLine(pts, fatMat({ color: col.halo, linewidth: 9 }));
    halo.renderOrder = 6; groups.route.add(halo);
    const line = fatLine(pts, fatMat({ color: col.line, linewidth: 5 }));
    line.renderOrder = 7; groups.route.add(line);
    // tratti troppo bassi sopra la linea, in rosso o arancio
    let run = [];
    const flush = lvl => { if (run.length > 1) { const l = fatLine(run, fatMat({ color: CLR[lvl], linewidth: 5 })); l.renderOrder = 8; groups.route.add(l); } run = []; };
    let cur = '';
    S.forEach(q => { if (q.lvl !== cur) { if (cur) { run.push(toV(q.lon, q.lat, q.alt)); flush(cur); } cur = q.lvl; } if (cur) run.push(toV(q.lon, q.lat, q.alt)); });
    if (cur) flush(cur);
    // 3. freccia di direzione: una sola, piccola, a un terzo di ogni tratto (lontana dall'etichetta a metà)
    for (let i = 0; i < R.length - 1; i++) {
      const L = wpD[i + 1] - wpD[i];
      {
        const d = wpD[i] + L / 3, q = routePointAt(d), q2 = routePointAt(Math.min(wpD[i + 1], d + 200));
        const arw = symbol('arrow', 13); arw.userData.anchor = toV(q.lon, q.lat, pr.altAt(d)); arw.userData.dir = [arw.userData.anchor, toV(q2.lon, q2.lat, pr.altAt(Math.min(wpD[i + 1], d + 200)))];
        arw.userData.noBig = true; arw.renderOrder = 11; groups.route.add(arw);
      }
      // etichetta del tratto: rotta magnetica, distanza e tempo senza vento (come la «bolla» dei navigatori)
      const mid = (wpD[i] + wpD[i + 1]) / 2, q = routePointAt(mid), trkM = Math.round((bearingDeg(R[i], R[i + 1]) - declAt(R[i].lon, R[i].lat) + 360) % 360) || 360;
      const ias = currentAircraft().iasKt, min = ias ? Math.round(L / NM / ias * 60) : null;
      const lab = makeLabel(`${String(trkM).padStart(3, '0')}° · ${(L / NM).toFixed(1)} NM${min ? ` · ${min}′` : ''}`, col.line, 0.72);
      lab.userData.anchor = toV(q.lon, q.lat, pr.altAt(mid)); lab.userData.offPx = -22; lab.userData.maxKm = 140; groups.route.add(lab);
    }
    for (const e of pr.events) {
      const q = routePointAt(e.d), lab = makeLabel(e.kind, '#ffffff', 0.62, 'dark');
      lab.userData.anchor = toV(q.lon, q.lat, e.alt); lab.userData.offPx = 16; groups.route.add(lab);
    }
  }
  R.forEach((p, i) => {
    const g = terrain.elevFt(p.lon, p.lat), a = pr ? pr.altAt(wpD[i]) : cr, top = toV(p.lon, p.lat, a);
    if (is3d) {
      const drop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([toV(p.lon, p.lat, g || 0), top]),
        new THREE.LineDashedMaterial({ color: col.line, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.7 }));
      drop.computeLineDistances(); groups.route.add(drop);
    }
    // nodo trascinabile (sposta il punto): cerchio bianco con bordo magenta, pieno per partenza e arrivo
    const end = (i === 0 || i === R.length - 1) && R.length > 1;
    const sel = state.selWp === i;
    const s = symbol(sel ? 'wpSel' : end ? 'field' : 'wp', sel ? 38 : 26); s.userData.anchor = top; s.userData.wp = i; s.renderOrder = sel ? 14 : 12; groups.route.add(s);
    // maniglia della quota del tratto (solo 3D): sopra il punto, si trascina in su e in giù
    if (is3d && i < R.length - 1) {
      const hs = state.selAlt === i;
      const h = symbol(hs ? 'altSel' : 'alt', hs ? 36 : 26); h.userData.anchor = top; h.userData.offPx = 40; h.userData.altHandle = i; h.renderOrder = hs ? 14 : 12; groups.route.add(h);
    }
    const name = p.name || `P${i + 1}`;
    const lab = makeLabel(`${name}${pr && i < R.length - 1 ? ` · ${Math.round(legAltFt(R, i, cr))} ft` : ''}`, '#0f1b28', 0.85);
    lab.center.set(-0.12, 0.5); lab.userData.anchor = top; lab.userData.offPx = is3d && i < R.length - 1 ? 40 : 0; lab.renderOrder = 12; groups.route.add(lab);
  });
}

// Simbolo dell'aereo: sagoma orientata sulla traccia, con linea verticale fino al terreno. La posizione e la prua
// disegnate inseguono quelle vere in modo morbido (smoothPlane, a ogni fotogramma): niente scatti a ogni posizione GPS.
const planeObj = { sprite: null, stem: null };
function buildPlane() {
  groups.plane.clear(); planeObj.sprite = planeObj.stem = null;
  const f = state.fly;
  if (!f.pos || !state.proj) return;
  const P = state.proj;
  // posizione disegnata: parte da quella vera (o ci salta se è lontana, per esempio al primo aggancio)
  const d = f.disp;
  if (!d || Math.abs(d.lon - f.pos.lon) + Math.abs(d.lat - f.pos.lat) > 0.05) f.disp = { lon: f.pos.lon, lat: f.pos.lat, alt: f.altFt, trk: f.trk };
  const m = symbol('plane', 44);
  m.userData.anchor = new THREE.Vector3(); m.userData.dir = [m.userData.anchor, new THREE.Vector3()];
  m.userData.noBig = true; m.renderOrder = 20;
  groups.plane.add(m);
  const stem = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#e5384f' }));
  groups.plane.add(stem);
  planeObj.sprite = m; planeObj.stem = stem; placePlane();
  // vettore della traccia: dove sarà l'aereo tra 1 e 2 minuti alla velocità e rotta attuali (tacca a ogni minuto)
  if (f.gsKt > 20) {
    const l = P.toLocal(f.pos.lon, f.pos.lat), y = yAbove(f.pos.lon, f.pos.lat, f.altFt), t = f.trk * Math.PI / 180;
    const at = min => { const q = destPoint([f.pos.lon, f.pos.lat], f.trk, f.gsKt * min / 60), p = P.toLocal(q[0], q[1]); return new THREE.Vector3(p.x, y, p.z); };
    const v = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(l.x, y, l.z), at(2)]), new THREE.LineDashedMaterial({ color: '#0891b2', dashSize: 0.25, gapSize: 0.15, depthTest: false }));
    v.computeLineDistances(); v.renderOrder = 19; groups.plane.add(v);
    for (const min of [1, 2]) { const c = at(min), w = 0.12 * Math.max(1, viewKm() / 25);
      const tick = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(c.x - Math.cos(t) * w, y, c.z - Math.sin(t) * w), new THREE.Vector3(c.x + Math.cos(t) * w, y, c.z + Math.sin(t) * w)]), new THREE.LineBasicMaterial({ color: '#0891b2', depthTest: false }));
      tick.renderOrder = 19; groups.plane.add(tick); }
  }
}
function placePlane() {
  const f = state.fly, d = f.disp, m = planeObj.sprite;
  if (!m || !d || !state.proj) return;
  const l = state.proj.toLocal(d.lon, d.lat), y = yAbove(d.lon, d.lat, d.alt), t = d.trk * Math.PI / 180;
  m.userData.anchor.set(l.x, y, l.z); m.userData.dir[1].set(l.x + Math.sin(t), y, l.z - Math.cos(t));
  const g = meshTopY(d.lon, d.lat), a = planeObj.stem.geometry.attributes.position;
  a.setXYZ(0, l.x, Number.isFinite(g) ? g : yOf(terrain.elevFt(d.lon, d.lat) || 0), l.z); a.setXYZ(1, l.x, y, l.z); a.needsUpdate = true;
  planeObj.stem.geometry.computeBoundingSphere();
}
// a ogni fotogramma: posizione verso quella vera (stimata avanti con velocità e rotta dall'ultima posizione, al massimo
// 2 secondi), prua girata dolcemente (costante di tempo 0,7 s) dalla parte più breve
function smoothPlane(dtMs) {
  const f = state.fly, d = f.disp;
  if (!f.pos || !d || !planeObj.sprite) return false;
  let tl = f.pos.lon, tt = f.pos.lat;
  if (f.active && f.gsKt > 20 && f.fixPerf) {
    const sec = Math.min(2, (performance.now() - f.fixPerf) / 1000) * (f.source === 'sim' ? Number($('simSpeed').value) || 1 : 1);
    const q = destPoint([f.pos.lon, f.pos.lat], f.trk, f.gsKt * sec / 3600); tl = q[0]; tt = q[1];
  }
  const dh = ((f.trk - d.trk + 540) % 360) - 180;
  if (Math.abs(d.lon - tl) < 1e-7 && Math.abs(d.lat - tt) < 1e-7 && Math.abs(d.alt - f.altFt) < 1 && Math.abs(dh) < 0.1) return false;
  const kp = 1 - Math.exp(-dtMs / 250), kh = 1 - Math.exp(-dtMs / 700);
  d.lon += (tl - d.lon) * kp; d.lat += (tt - d.lat) * kp; d.alt += (f.altFt - d.alt) * kp; d.trk = (d.trk + dh * kh + 360) % 360;
  placePlane();
  return true;
}
// Scia dell'aereo: la traccia di questo volo, sempre appena sopra il terreno disegnato; si accende e spegne
function buildTrail() {
  const G = groups.trail; if (!G) return;
  G.clear();
  if (!state.showTrail || !state.proj) return;
  const from = state.fly.sessionT || 0, P = state.proj;
  const pts = state.track.filter(p => p.t >= from).slice(-6000).map(p => { const l = P.toLocal(p.lon, p.lat); return new THREE.Vector3(l.x, yAbove(p.lon, p.lat, p.altFt), l.z); });
  if (state.fly.pos && state.fly.disp && pts.length) { const d = state.fly.disp, l = P.toLocal(d.lon, d.lat); pts.push(new THREE.Vector3(l.x, yAbove(d.lon, d.lat, d.alt), l.z)); }
  if (pts.length < 2) return;
  const line = fatLine(pts, fatMat({ color: state.theme === 'day' ? '#0369a1' : '#38bdf8', linewidth: 3.5, transparent: true, opacity: 0.9 }));
  line.renderOrder = 9; G.add(line); dirty = true;
}

// ---------------------------------------------------------------- profilo verticale (pianificato o «davanti a te» in volo)
const pcv = $('profile');
function drawProfile(samples, total, altFt, marks = [], opt = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = pcv.clientWidth, H = pcv.clientHeight;
  pcv.width = W * dpr; pcv.height = H * dpr;
  const ctx = pcv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const fs = Math.round(parseFloat(css('--fs')) * 0.72);
  ctx.font = `${fs}px ${FONT}`;
  const muted = css('--muted'), line = css('--line'), ink = css('--ink');
  if (!samples || samples.length < 2) {
    ctx.fillStyle = muted;
    ctx.fillText(state.view === 'fly' ? 'Profilo davanti a te: avvia il GPS o la simulazione.' : 'Profilo verticale: aggiungi almeno due punti di rotta.', 16, 30);
    return;
  }
  const maxT = Math.max(...samples.map(s => s.terr).filter(Number.isFinite));
  const yMax = opt.yMax || Math.ceil(Math.max(altFt + 1500, maxT + 1500, altFt + 3000) / 1000) * 1000;
  const L = 64, R = 16, T = 22, B = 26;
  state.profGeom = { L, R, T, B, W, H, yMax, total };
  const X = d => L + (W - L - R) * d / total, Y = f => T + (H - T - B) * (1 - Math.max(0, Math.min(yMax, f)) / yMax);
  ctx.strokeStyle = line; ctx.fillStyle = muted; ctx.lineWidth = 1;
  for (let f = 0; f <= yMax; f += yMax > 8000 ? 2000 : 1000) { ctx.beginPath(); ctx.moveTo(L, Y(f)); ctx.lineTo(W - R, Y(f)); ctx.stroke(); ctx.fillText(`${f} ft`, 6, Y(f) + 4); }
  const totNm = total / NM, stepNm = totNm > 40 ? 10 : totNm > 15 ? 5 : totNm > 6 ? 2 : 1;
  for (let n = 0; n <= totNm + 1e-9; n += stepNm) ctx.fillText(`${n} NM`, X(n * NM) - 12, H - 8);
  for (let i = 0; i < samples.length - 1; i++) {
    const s = samples[i], x0 = Math.round(X(s.dist)), x1 = Math.round(X(samples[i + 1].dist));
    for (const h of s.air) { ctx.fillStyle = CAT_COLOR[category(h.a)] + '55'; ctx.fillRect(x0, Y(Math.min(h.hi, yMax)), x1 - x0, Y(Math.max(h.lo, 0)) - Y(Math.min(h.hi, yMax))); }
  }
  const fcCols = state.fc && state.wxShow && Number.isFinite(samples[0].lon) ? samples.map(s => columnAt(state.fc, nearestPoint(state.fc, s.lon, s.lat).i, state.fcTi)) : null;
  if (fcCols) {
    for (let i = 0; i < samples.length - 1; i++) {
      const c = fcCols[i], x0 = Math.round(X(samples[i].dist)), x1 = Math.round(X(samples[i + 1].dist));
      if (state.fcLayers.cloud) for (const lv of c.levels) if (lv.cloud >= 20) {
        ctx.fillStyle = `rgba(110,122,138,${(Math.min(1, (lv.cloud - 15) / 85) * 0.55).toFixed(2)})`;
        ctx.fillRect(x0, Y(lv.topM * FT), x1 - x0, Y(lv.botM * FT) - Y(lv.topM * FT));
      }
      if (state.fcLayers.rain && c.precip >= 0.1) {
        const base = c.levels.find(lv => lv.cloud >= 50);
        ctx.fillStyle = c.precip >= 1 ? 'rgba(14,165,183,0.4)' : 'rgba(14,165,183,0.2)';
        ctx.fillRect(x0, Y((base ? base.botM : c.elevM + 1500) * FT), x1 - x0, Y(c.elevM * FT) - Y((base ? base.botM : c.elevM + 1500) * FT));
      }
    }
    ctx.setLineDash([3, 4]); ctx.strokeStyle = '#0a8fa3'; ctx.lineWidth = 2; ctx.beginPath();
    fcCols.forEach((c, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(samples[i].dist), Y(c.freezeM * FT)));
    ctx.stroke(); ctx.setLineDash([]);
    if (fcCols[0].freezeM * FT < yMax) { ctx.fillStyle = '#0a8fa3'; ctx.fillText('0 °C', W - R - 34, Y(fcCols.at(-1).freezeM * FT) - 4); }
  }
  ctx.beginPath(); ctx.moveTo(X(0), Y(0));
  samples.forEach(s => ctx.lineTo(X(s.dist), Y(Number.isFinite(s.terr) ? s.terr : 0)));
  ctx.lineTo(X(total), Y(0)); ctx.closePath(); ctx.fillStyle = css('--terrain-fill'); ctx.fill();
  if (ui.pilot.value === 'basico') {
    ctx.setLineDash([7, 5]); ctx.strokeStyle = '#d98a00'; ctx.lineWidth = 2; ctx.beginPath();
    samples.forEach((s, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(s.dist), Y(s.vds)));
    ctx.stroke(); ctx.setLineDash([]);
  }
  // rotta magenta con bordo, come sulla carta; in rosso i tratti nel terreno, in arancio quelli sotto 500 ft
  const routeC = css('--route'), haloC = css('--route-halo'), withAlt = Number.isFinite(samples[0].alt);
  const pathTo = () => { ctx.beginPath(); if (withAlt) samples.forEach((s, i) => (i ? ctx.lineTo(X(s.dist), Y(s.alt)) : ctx.moveTo(X(s.dist), Y(s.alt)))); else { ctx.moveTo(X(0), Y(altFt)); ctx.lineTo(X(total), Y(altFt)); } };
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  pathTo(); ctx.strokeStyle = haloC; ctx.lineWidth = 7; ctx.stroke();
  pathTo(); ctx.strokeStyle = routeC; ctx.lineWidth = 3.5; ctx.stroke();
  if (withAlt) for (let i = 0; i < samples.length - 1; i++) {
    const s = samples[i], n = samples[i + 1], c = s.alt - s.terr;
    const lvl = c < 0 && s.dist > 1000 && s.dist < total - 1000 ? '#e11d2e' : c < 500 && s.phase === 'cruise' ? '#f59e0b' : null;
    if (!lvl) continue;
    ctx.strokeStyle = lvl; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(X(s.dist), Y(s.alt)); ctx.lineTo(X(n.dist), Y(n.alt)); ctx.stroke();
  }
  // punto segnalato dall'assistente («Mostra»)
  if (Number.isFinite(state.profMark) && state.view === 'plan' && state.profMark <= total) {
    ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(X(state.profMark), T); ctx.lineTo(X(state.profMark), H - B); ctx.stroke(); ctx.setLineDash([]);
  }
  // nodo selezionato o trascinato: etichetta con nome e quota accanto al nodo
  const pd = state.profDrag;
  const ps = state.view === 'plan' && Number.isInteger(state.profSel) ? state.profSel : null;
  const lab = pd ? pd.node : ps;
  if (lab !== null && lab !== undefined && marks[lab]) {
    const m = marks[lab], x = X(m.dist), y = Y(m.alt), isDepField = lab === 0 && opt.depField, isArr = lab === marks.filter(k => !k.small).length - 1 && opt.arrField;
    const v = pd ? pd.v : legAltFt(state.route, Math.min(lab, state.route.length - 2), cruise());
    const txt = isArr ? `${m.name}: arrivo a terra, ${Math.round(m.alt)} ft (si cambia nella lista)`
      : `${m.name}: ${isDepField ? `a terra ${Math.round(m.alt)} ft · dopo il decollo ${v} ft` : `${v} ft`}${pd ? (pd.atMin ? ` · minimo (${LEG_CLEAR_FT} ft sopra il rilievo)` : '') : ' · trascina su o giù'}`;
    ctx.font = `700 ${fs}px ${FONT}`;
    const tw = ctx.measureText(txt).width + 14, tx = Math.min(W - R - tw, Math.max(L, x - tw / 2)), ty = Math.max(T, y - 40);
    ctx.fillStyle = '#f59e0b'; roundRect(ctx, tx, ty, tw, 22, 6); ctx.fill();
    ctx.fillStyle = '#111827'; ctx.fillText(txt, tx + 7, ty + 15);
  }
  for (const m of marks) {
    const a = Number.isFinite(m.alt) ? m.alt : altFt;
    // quota del punto non raggiungibile col rateo dell'aereo: tratteggio rosso dalla linea al nodo
    if (m.short) { ctx.strokeStyle = CLR.crit; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(X(m.dist), Y(m.line)); ctx.lineTo(X(m.dist), Y(a)); ctx.stroke(); ctx.setLineDash([]); }
    if (m.sel || m.drag) { ctx.beginPath(); ctx.arc(X(m.dist), Y(a), 14, 0, Math.PI * 2); ctx.fillStyle = '#f59e0b'; ctx.fill(); }
    ctx.beginPath(); ctx.arc(X(m.dist), Y(a), m.small ? 3 : m.drag || m.sel ? 8.5 : 7.5, 0, Math.PI * 2);
    if (m.small) { ctx.fillStyle = ink; ctx.fill(); } else { ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = m.short ? CLR.crit : routeC; ctx.stroke(); }
    ctx.fillStyle = m.small ? muted : ink;
    ctx.font = `${m.small ? 400 : 600} ${fs}px ${FONT}`;
    ctx.fillText(m.name, X(m.dist) - 8, Y(a) + (m.small ? 16 : -10));
  }
  ctx.font = `${fs}px ${FONT}`;
  ctx.fillStyle = ink;
  const varies = samples.some(s => Number.isFinite(s.alt) && s.alt !== samples[0].alt);
  const leg = `${state.view === 'fly' ? 'Davanti a te, ' + totNm.toFixed(0) + ' NM' : 'Profilo (tocca un punto per selezionarlo, poi trascinalo su o giù: cambia la sua quota)'} · magenta: ${state.view === 'fly' ? 'quota attuale ' + Math.round(altFt) + ' ft' : varies ? 'quota pianificata (TOC fine salita, TOD inizio discesa)' : 'quota pianificata ' + Math.round(altFt) + ' ft'}`
    + (ui.pilot.value === 'basico' ? ` · tratteggio arancio: limite VDS ${day().vdsAgl} ft` : '')
    + (fcCols ? ' · grigio: nubi · verde acqua: pioggia · 0 °C' : '');
  ctx.fillText(leg, L, 14);
}

// ---------------------------------------------------------------- pannelli
// quanti spazi della zona sono nascosti perché più alti della quota scelta
const hiddenHigh = () => { const c = airCeilFt(); return c === Infinity ? 0 : state.airspaces.filter(a => a.clipped?.length && !a.suspect && !FIR_TYPES.has(a.type) && a.minLowerFt >= c && bboxInFocus(a.bbox)).length; };
function renderLegend(vis) {
  const cats = [...new Set(vis.map(category))];
  let wx = state.radar.sri && state.wxShow ? '<div><i style="background:linear-gradient(90deg,#8cc7f5,#2f70db,#f9c71a,#ed5c14)"></i>Pioggia osservata dal radar</div>' : '';
  wx += state.wx && state.wxShow ? '<div><i style="background:#1f8a4c"></i>Meteo aeroporto (colore = condizioni)</div>' : '';
  if (state.fc && state.wxShow) wx += (state.fcLayers.cloud ? '<div><i style="background:#dfe5ec;border:1px solid #9aa7b4"></i>Nubi previste</div>' : '')
    + (state.fcLayers.rain ? '<div><i style="background:#0ea5b7"></i>Pioggia prevista (colonne)</div>' : '')
    + (state.fcLayers.wind ? '<div><i style="background:#b88a00"></i>Vento alla tua quota (verde &lt;10, rosso ≥30 kt)</div>' : '');
  const ft = state.feats ? '<div><i style="background:#1d4ed8;border-radius:50%"></i>Aeroporto' + (ui.pilot.value === 'basico' ? ' (tratteggio: 5 km)' : '') + '</div><div><i style="background:#7c3aed;border-radius:50%"></i>Aviosuperficie</div><div><i style="background:#d9480f;width:3px"></i>Ostacolo (tratteggio: altezza non nota)</div>' : '';
  // legenda richiudibile: chiusa all'inizio se ha molte voci, così non copre la carta
  const items = (cats.map(c => `<div><i style="background:${CAT_COLOR[c]}"></i>${esc(CAT_LABEL[c])}</div>`).join('') || '<div>Nessuno spazio aereo da mostrare</div>') + ft + wx;
  const n = (items.match(/<div>/g) || []).length, L = $('legend');
  if (state.legendOpen === undefined && n > 0) state.legendOpen = n <= 6;
  L.classList.toggle('closed', !state.legendOpen);
  L.innerHTML = `<div class="lh" role="button" tabindex="0" aria-expanded="${!!state.legendOpen}">${state.legendOpen ? '▾' : '▸'} Legenda</div><label class="ceil">Spazi fino a <select id="ceilMap" aria-label="Mostra gli spazi aerei fino a">${ceilOptions()}</select></label>${hiddenHigh() ? `<span class="ceilnote">${hiddenHigh()} più alti nascosti</span>` : ''}` + items;
  L.firstElementChild.onclick = () => { state.legendOpen = !state.legendOpen; renderLegend(visibleAirspaces()); };
  $('ceilMap').onchange = e => setAirCeil(e.target.value);
}
function renderChips() {
  const n = state.airspaces.filter(a => a.clipped.length).length;
  $('chips').innerHTML = `<span class="chip" title="Versione del programma">AerIA VFR ${VERSION}</span><span class="chip ${terrain.demo ? 'demo' : 'real'}">Terreno: ${esc(terrain.label())}</span>`
    + `<span class="chip ${state.airDemo ? 'demo' : 'real'}">Spazi aerei: ${esc(state.airSource)} · ${n}</span>`;
  $('banner').textContent = terrain.demo || state.airDemo ? 'Contiene dati inventati: non usare per il volo' : 'Prototipo: non usare per la navigazione';
  $('attrib').textContent = state.attribution.join(' · ');
}
function sunLine() {
  const R = state.route, p = R[0] || (state.area ? { lat: (state.area.latMin + state.area.latMax) / 2, lon: (state.area.lonMin + state.area.lonMax) / 2 } : null);
  if (!p || !ui.date.value) return '';
  const s = sunTimes(ui.date.value, p.lat, p.lon, ui.pilot.value);
  return `<span class="sunl">Sole${R[0] ? ` a ${esc(R[0].name || 'P1')}` : ''}: sorge ${localHM(s.rise)}, tramonta ${localHM(s.set)} · giorno aeronautico <b>${localHM(s.dayStart)}–${localHM(s.dayEnd)}</b> (ora italiana)</span>`;
}
function renderDay() {
  const d = day(), p = ui.pilot.value;
  $('daytype').innerHTML = ic('sun') + '<span>' + (p === 'basico'
    ? `Limite VDS <b>${d.vdsAgl} ft</b> sul rilievo più alto entro 5 km, ogni giorno (${d.zone500 ? 'zona VDS con limite di 500 ft, RAIT.5005 d)2)ii' : 'RAIT.5005 d)2)i, salvo autorizzazione ENAC'})`
    : p === 'avanzato' ? 'VDS avanzato: spazio aereo aperto al VFR, con le autorizzazioni previste'
      : 'PPL/LAPL VFR: classi di spazio aereo, quote minime e autorizzazioni') + '</span>' + sunLine();
}
function legInfo(i) {
  const R = state.route, a = R[i], b = R[i + 1], d = distM(a, b), ias = currentAircraft().iasKt;
  const trkM = Math.round((bearingDeg(a, b) - declAt(a.lon, a.lat) + 360) % 360) || 360;
  return { d, trkM, min: ias ? Math.round(d / NM / ias * 60) : null };
}
// Mentre si scrive in un campo (tastiera del tablet aperta) l'elenco non si ridisegna: il campo verrebbe sostituito,
// perderebbe il fuoco e la tastiera si chiuderebbe subito. Si ridisegna quando si esce dal campo.
const editing = el => !!el && el.contains(document.activeElement) && document.activeElement.matches('input, select, textarea');
function renderWaypoints() {
  if (editing($('wpList'))) { state.wpPending = true; return; }
  state.wpPending = false;
  const R = state.route;
  const depF = R.length > 1 && fieldAt(state.feats, R[0]);
  $('wpList').innerHTML = (R.length ? '<div class="th"><span>#</span><span>Punto</span><span style="text-align:right">Quota (ft)</span><span></span></div>' : '') + R.map((p, i) => {
    const g = terrain.elevFt(p.lon, p.lat), last = i === R.length - 1, end = R.length > 1 && (i === 0 || last);
    // quota del tratto che parte da questo punto: vuota = quota di crociera
    const onGround = R.length > 1 && (last || (i === 0 && !p.airborne));
    const fld = i === 0 ? depF : last ? fieldAt(state.feats, p) : null;
    // partenza e arrivo: quota a terra (campo o terreno), modificabile; la partenza ha anche la quota dopo il decollo
    const gIn = `<input class="alt gnd" aria-label="Quota a terra di ${esc(p.name || `P${i + 1}`)} (campo o terreno), in piedi" data-ground="${i}" inputmode="numeric" placeholder="${groundFtOf({ ...p, groundFt: undefined }, fld) ?? ''}" value="${Number.isFinite(p.groundFt) ? p.groundFt : ''}">`;
    const alt = last ? (R.length > 1 ? gIn : '') : `<input class="alt" aria-label="${i === 0 && onGround ? 'Quota da raggiungere dopo il decollo' : i === 0 ? 'Quota attuale (già in volo)' : `Quota al punto ${esc(p.name || `P${i + 1}`)}`}, in piedi" data-alt="${i}" inputmode="numeric" placeholder="${cruise()}" value="${Number.isFinite(p.altFt) ? p.altFt : ''}">`;
    const mv = R.length > 1 ? `<span class="mv"><button type="button" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Sposta prima ${esc(p.name || `P${i + 1}`)}">${ic('up')}</button><button type="button" data-down="${i}" ${last ? 'disabled' : ''} aria-label="Sposta dopo ${esc(p.name || `P${i + 1}`)}">${ic('down')}</button></span>` : '';
    const m = last || R.length < 2 ? null : nodeMin(i);
    const li = last ? null : legInfo(i);
    return `<div class="wp${end ? ' end' : ''}"><span class="no">${i + 1}</span><input aria-label="Nome del punto ${i + 1}" data-wp="${i}" value="${esc(p.name || `P${i + 1}`)}">${alt}<button class="x" type="button" data-del="${i}" aria-label="Togli il punto ${i + 1}">${ic('close')}</button>
      <div class="meta">${i === 0 && R.length > 1 ? `${onGround ? `a terra ${gIn}<span class="u">ft</span> · ` : ''}<label class="air"><input type="checkbox" data-air ${p.airborne ? 'checked' : ''}> già in volo</label> · ` : ''}${last && R.length > 1 ? 'arrivo a terra (quota a destra) · ' : ''}terreno ${Number.isFinite(g) ? Math.round(g) + ' ft' : '—'}${fld ? ` · campo ${Math.round(fld.elevM * FT)} ft` : ''}${i === 0 && onGround ? ' · casella: quota dopo il decollo' : ''}${m ? ` · <b title="${LEG_CLEAR_FT} ft sopra il rilievo più alto entro ${LEG_CORRIDOR_M} m dai tratti del punto (${m.terrFt} ft)">min ${m.minFt} ft</b>` : ''}</div>${mv}
      ${li ? `<div class="leg">↓ ${String(li.trkM).padStart(3, '0')}° M · ${(li.d / NM).toFixed(1)} NM${li.min ? ` · ${li.min} min` : ''}</div>` : ''}</div>`;
  }).join('') + (R.length > 1 ? `<p class="note beginner-only" style="margin-top:8px">Sulla carta trascina il cerchio di un punto per spostarlo e la maniglia blu per cambiarne la quota (3D); nel profilo in basso tocca un punto e trascinalo su o giù. La quota di un punto si raggiunge sul punto; la rotta tra due punti è dritta e resta almeno ${LEG_CLEAR_FT} ft sopra il rilievo più alto che incontra.</p>
    ${state.profile ? `<p class="note" style="margin-top:4px">Salite e discese con ${esc(state.profile.climb.src)}, discesa ${state.profile.descent.fpm} ft/min${state.profile.arrGround ? `, sull'arrivo circuito a ${state.profile.circuitFt} ft e atterraggio` : ''}. Tempi senza vento a ${Math.round(currentAircraft().iasKt) || '—'} kt. Aereo: ${esc(currentAircraft().name)} (si cambia nel «Piano di volo»).</p>` : ''}` : '') || '<p class="note" style="margin-top:8px">Nessun punto.</p>';
}
// Log della rotta con gli stessi dati della vista «Piano di volo» (vento previsto, IAS e quote dei tratti)
function planNav() {
  if (state.route.length < 2) return null;
  const ctx = navCtx(), st = state.nl.st, ac = currentAircraft(), unit = st.speedUnit || ac.speedUnit || 'kt', route = ctx.route();
  const year = decimalYear(new Date((ui.date.value || new Date().toISOString().slice(0, 10)) + 'T12:00:00Z'));
  const legs = route.slice(0, -1).map((p, k) => { const l = (st.legs || [])[k] || {};
    return { ...l, levelFt: Number.isFinite(p.altFt) ? p.altFt : undefined, ...(l.ias !== '' && l.ias != null ? { iasKt: Number(l.ias) / (unit === 'kmh' ? KMH_PER_KT : 1) } : {}) }; });
  const nav = computeNavlog({ route, aircraft: ac, cruiseFt: cruise(), qnh: qnh(), toTime: st.toTime, legs }, { decl: (lon, lat) => declOf(state.decl, lon, lat, year), windAt: ctx.windAt, oatAt: ctx.oatAt });
  nav.withWind = !!ctx.windAt || (st.legs || []).some(l => l && l.windKt !== '' && l.windKt != null);
  return nav;
}
function routeTimeMin() {
  const n = state.nav;
  if (n && Number.isFinite(n.totalMin)) return Math.round(n.totalMin);
  const ias = currentAircraft().iasKt;
  return ias && state.analysis ? Math.round(state.analysis.total / NM / ias * 60) : null;
}
// Decollo previsto (UTC, ms) dal piano di volo: ora UTC o locale secondo la scelta del modulo
function takeoffMs() {
  const st = state.nl.st, d = ui.date.value;
  if (!st.toTime || !d) return NaN;
  return st.timeRef === 'locale' ? romeToUtcMs(d, st.toTime) : Date.parse(`${d}T${st.toTime.padStart(5, '0')}:00Z`);
}
function daylightWarnings() {
  const R = state.route, t = routeTimeMin();
  if (R.length < 2 || !t || !ui.date.value) return [];
  const dep = { ...R[0], name: R[0].name || 'partenza' }, arr = { ...R.at(-1), name: R.at(-1).name || 'arrivo' }, reserve = Number(state.nl.st.reserveMin) || 30;
  const to = takeoffMs();
  if (Number.isFinite(to)) return daylightChecks({ dateStr: ui.date.value, takeoffMs: to, tripMin: t, dep, arr, pilot: ui.pilot.value, reserveMin: reserve });
  const sa = sunTimes(ui.date.value, arr.lat, arr.lon, ui.pilot.value), last = sa.dayEnd - t * 60000;
  const how = state.nav && Number.isFinite(state.nav.totalMin) ? (state.nav.withWind ? ' col vento previsto' : ' senza vento') : ' senza vento (col vento previsto il tempo non è calcolabile: vedi il piano di volo)';
  return [{ lvl: 'info', kind: 'sole', title: `Decollo entro le ${localHM(last)} per arrivare di giorno`,
    text: `Fine del giorno aeronautico a ${arr.name}: ${localHM(sa.dayEnd)} (${sa.ruleEnd}; tramonto ${localHM(sa.set)}). Volo di ${t} min${how}, riserva esclusa. Ora di decollo nel «Piano di volo» per il controllo completo.`,
    plain: `Per arrivare prima che sia notte (alle ${localHM(sa.dayEnd)} a ${arr.name}) devi decollare entro le ${localHM(last)}. Se hai bisogno della riserva, parti prima.` }];
}
const hm = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
function renderSummary(an) {
  const bub = $('bubble'), wc = $('warnCount');
  if (state.route.length < 2) {
    $('summary').innerHTML = ''; wc.innerHTML = '';
    bub.innerHTML = '<span class="c"><small>ROTTA</small><span>nessuna</span></span>'; return;
  }
  const d = day(), p = ui.pilot.value, ac = currentAircraft();
  const avoid = an.warnings.filter(w => w.kind === 'airspace' && (w.need === 'vietato')).length;
  const calls = an.warnings.filter(w => w.kind === 'airspace' && ['autorizzazione', 'radio'].includes(w.need)).length;
  const crit = an.warnings.filter(w => w.lvl === 'crit').length, warn = an.warnings.filter(w => w.lvl === 'warn').length;
  // «senza problemi» solo se non c'è nulla da controllare: un avviso di attenzione non è un via libera
  const head = crit ? `${crit} ${crit === 1 ? 'problema da risolvere' : 'problemi da risolvere'}` : warn ? `${warn} ${warn === 1 ? 'punto da controllare' : 'punti da controllare'}` : 'Nessun problema con i dati caricati';
  const nm = (an.total / NM).toFixed(1), t = routeTimeMin(), pl = state.planRes;
  const trip = Number.isFinite(pl?.nav?.tripFuelL) && pl.nav.tripFuelL > 0 ? pl.nav.tripFuelL : t && ac.fuelFlowLh ? ac.fuelFlowLh * t / 60 : NaN;
  const fuel = Number.isFinite(trip) ? Math.ceil(trip) : null, minL = pl?.fuel?.min?.L;
  // carburante a bordo (Piano di volo → Carburante a bordo): autonomia e margine sul minimo (volo, alternato, riserva)
  let onboard = '';
  if (pl && pl.fuelEntered) {
    const L = Number(pl.st.load.fuelL), endu = ac.fuelFlowLh ? Math.round(L / ac.fuelFlowLh * 60) : NaN, spare = Number.isFinite(minL) ? L - minL : NaN;
    onboard = `<tr><td>A bordo</td><td>${Math.round(L)} l${Number.isFinite(endu) ? ` · autonomia ${hm(endu)}` : ''}${Number.isFinite(spare) ? (spare >= 0 ? ` · <b style="color:var(--ok)">+${Math.floor(spare)} l</b> sul minimo` : ` · <b style="color:var(--crit)">mancano ${Math.ceil(-spare)} l</b>`) : ''}</td></tr>`;
  } else if (fuel) onboard = `<tr><td>A bordo</td><td><span class="note">non indicato: «Piano di volo» → «Carburante a bordo»</span></td></tr>`;
  const badges = (crit ? `<span class="badge crit" title="Da risolvere">${crit}</span>` : '') + (warn ? `<span class="badge warn" title="Da controllare">${warn}</span>` : '') + (!crit && !warn ? `<span class="badge ok">${ic('check', ' style="width:14px;height:14px"')}</span>` : '');
  bub.innerHTML = `<span class="c"><small>DIST</small><span>${nm} NM</span></span>${t ? `<span class="c"><small>TEMPO</small><span>${hm(t)}</span></span>` : ''}${fuel ? `<span class="c opt"><small>CARB.</small><span>${fuel} l</span></span>` : ''}<span class="c k">${badges}</span>`;
  wc.innerHTML = `<span class="cnt">${badges}</span>`;
  $('summary').innerHTML = `<div class="sumtab"><div class="head" style="color:${crit ? 'var(--crit)' : warn ? 'var(--warn)' : 'var(--ok)'}">${head}</div><table>
      <tr><td>Rotta</td><td>${nm} NM${t ? ` · ${hm(t)} ${state.nav?.withWind ? 'col vento previsto' : 'senza vento'}` : ''}</td></tr>
      ${fuel ? `<tr><td>Carburante</td><td>${fuel} l per il volo (${ac.fuelFlowLh} l/h)${Number.isFinite(minL) ? ` · minimo con alternato e riserva ${Math.ceil(minL)} l` : ''}</td></tr>` : ''}
      ${onboard}
      ${p === 'basico' ? `<tr><td>Limite VDS</td><td>${d.vdsAgl} ft sul rilievo</td></tr>` : ''}
      ${avoid ? `<tr><td>Da evitare</td><td>${avoid} ${avoid === 1 ? 'zona' : 'zone'}</td></tr>` : ''}
      ${calls ? `<tr><td>Da chiamare</td><td>${calls} ${calls === 1 ? 'ente' : 'enti'} (scheda «Radio»)</td></tr>` : ''}
    </table></div>`;
}
function warnHtml(w, i) {
  const text = state.mode === 'beginner' ? (w.plain || w.text) : w.text;
  const loc = i !== undefined && (Number.isFinite(w.at) || w.airspace) ? `<button class="loc" type="button" data-loc="${i}" title="Mostra sulla carta e nel profilo" aria-label="Mostra sulla carta">${ic('target')}</button>` : '';
  return `<div class="warn ${w.lvl}" data-w="${i ?? ''}"><b>${esc(w.title)}</b><span class="wt">${esc(text)}</span>${loc}</div>`;
}
function dataQualityHtml() {
  // solo quelli vicini alla rotta (20 km) o, senza rotta, nell'area mostrata: gli altri non riguardano questo volo
  const rb = boundsAround(state.route, 20);
  const near = a => (rb ? a.bbox && a.bbox.lonMax >= rb.lonMin && a.bbox.lonMin <= rb.lonMax && a.bbox.latMax >= rb.latMin && a.bbox.latMin <= rb.latMax : bboxInFocus(a.bbox));
  const sus = state.airspaces.filter(a => a.suspect && near(a));
  if (!sus.length) return '';
  const names = sus.slice(0, 5).map(a => `${esc(a.name)} (${esc(limitText(a.lower))}–${esc(limitText(a.upper))})`).join('; ');
  return `<div class="warn warn"><b>Dati da verificare: ${sus.length} ${sus.length === 1 ? 'spazio aereo' : 'spazi aerei'}</b><span class="wt">Il tetto risulta sotto il terreno, quindi non si vedono: possibile errore della fonte (MSL al posto di AGL). Controlla sulla carta ufficiale. ${names}${sus.length > 5 ? '…' : ''}</span></div>`;
}
function renderWarnings(an) {
  const box = $('warnings');
  const always = '<div class="warn info"><b>Non ancora controllato</b><span class="wt">Ostacoli solo quelli presenti in openAIP/OpenStreetMap: mancano cavi ed elettrodotti e molte antenne.</span></div>' + dataQualityHtml();
  if (state.view === 'fly') { renderFlyWarnings(); return; }
  if (state.route.length < 2) { box.innerHTML = '<div class="warn info"><b>Pronto</b><span class="wt">Disegna una rotta con almeno due punti: controllo spazi aerei, terreno e limiti VDS lungo il percorso.</span></div>' + always; return; }
  const groupsW = [['crit', 'Da risolvere'], ['warn', 'Da controllare'], ['ok', ''], ['info', 'Informazioni']];
  box.innerHTML = groupsW.map(([lvl, label]) => {
    const items = an.warnings.map((w, i) => [w, i]).filter(([w]) => (lvl === 'info' ? !['crit', 'warn', 'ok'].includes(w.lvl) : w.lvl === lvl));
    return items.length ? (label ? `<div class="wgroup">${label} · ${items.length}</div>` : '') + items.map(([w, i]) => warnHtml(w, i)).join('') : '';
  }).join('') + `<div class="wgroup">Limiti dei dati</div>` + always;
}
// «Mostra»: porta la carta sul punto della rotta (o sullo spazio aereo) e lo segna nel profilo
function focusWarning(i) {
  const w = state.analysis?.warnings[i];
  if (!w) return;
  if (w.airspace) { state.selected = w.airspace; buildAirspaces(); renderInfo(); }
  if (Number.isFinite(w.at) && state.route.length > 1) { const q = routePointAt(w.at); lookAt(q.lon, q.lat); state.profMark = w.at; drawProfileNow(); }
  else if (w.airspace?.bbox) { const b = w.airspace.bbox; lookAt((b.lonMin + b.lonMax) / 2, (b.latMin + b.latMax) / 2); }
}
$('warnings').addEventListener('click', e => {
  const l = e.target.closest('[data-loc]');
  if (l) { focusWarning(Number(l.dataset.loc)); return; }
  e.target.closest('.warn')?.classList.toggle('open');
});
function renderInfo() {
  const a = state.selected, box = $('info');
  if (!a) { box.innerHTML = '<h2>Spazio aereo selezionato</h2><p class="note">Tocca un volume nella carta per vederne i dettagli.</p>'; return; }
  const c = contactInfo(a), r = entryRule(a, ui.pilot.value);
  const typeTxt = (TYPE_LABEL[a.type] || a.type || '—') + (a.typeCode !== null && a.typeCode !== undefined && state.mode === 'expert' ? ` (codice openAIP ${a.typeCode})` : '');
  box.innerHTML = `<h2>Spazio aereo selezionato</h2><dl>
    <dt>Nome</dt><dd>${esc(a.name)}</dd><dt>Tipo</dt><dd>${esc(typeTxt)}</dd><dt>Classe</dt><dd>${esc(a.cls || '—')}</dd>
    <dt>Da</dt><dd>${esc(limitText(a.lower))}</dd><dt>A</dt><dd>${esc(limitText(a.upper))}</dd>
    <dt>Per te</dt><dd>${esc(r.text)}</dd>
    <dt>Radio</dt><dd>${c.freq ? `${esc(c.unit)} ${esc(c.freq)}` : esc(c.note)}</dd>
    ${a.transponder?.length ? `<dt>Transponder</dt><dd>${esc(a.transponder.join(', '))}</dd>` : ''}
    <dt>Fonte</dt><dd>${esc(a.source)}${a.updatedAt ? `, modificato il ${esc(a.updatedAt.slice(0, 10))}` : ''}</dd>
  </dl>${state.pickList?.length > 1 && state.pickList.includes(a) ? `<p class="note"><b>${state.pickList.indexOf(a) + 1} di ${state.pickList.length}</b> spazi in quel punto, dal più basso: ${state.pickList.map(x => esc(x.name)).join(' · ')}. Tocca di nuovo lo stesso punto per il successivo.</p>` : ''}<p class="note">I livelli di volo sono convertiti in quota con il QNH impostato (${qnh()} hPa).</p>`;
}

// ---------------------------------------------------------------- schede radio
function radioHits() {
  const out = [];
  if (state.analysis) for (const h of state.analysis.hits) out.push(h);
  const start = state.route[0] || (state.fly.pos ?? null);
  if (start) for (const a of state.airspaces) if (FIR_TYPES.has(a.type) && a.clipped.length && airspacesAt(start.lon, start.lat, 0, [a], qnh()).length) out.unshift({ a });
  return out;
}
function positionText() {
  const f = state.fly;
  const ref = f.pos || state.route[0];
  if (!ref) return '[posizione]';
  // posizione rispetto al punto di rotta più vicino: «5 miglia a nord di Celano»
  let best = null;
  for (const [i, p] of state.route.entries()) { const d = distM(p, ref); if (!best || d < best.d) best = { d, p, i }; }
  if (!best || best.d < 300) return best ? `sopra ${best.p.name || `P${best.i + 1}`}` : '[posizione]';
  return `${(best.d / NM).toFixed(0)} miglia a ${cardinal(bearingDeg(best.p, ref))} di ${best.p.name || `P${best.i + 1}`}`;
}
function renderRadio() {
  const r = state.route;
  const cards = buildRadioCards({
    profile: { callsign: ui.callsign.value, acType: ui.acType.value, category: ui.pilot.value === 'ag' ? 'ag' : ui.pilot.value },
    from: r[0]?.name || '[partenza]', to: r.at(-1)?.name || '[destinazione]', cruiseFt: state.fly.active ? state.fly.altFt : cruise(), qnh: qnh(),
    hits: radioHits(), position: positionText(),
    fields: [['partenza', fieldAt(state.feats, r[0])], ['arrivo', r.length > 1 ? fieldAt(state.feats, r.at(-1)) : null]].filter(x => x[1]).map(([role, a]) => ({ role, a })),
  });
  const intro = `<div class="box beginner-only"><b>Come si usa.</b> Ogni scheda è una chiamata. Le parti tra parentesi quadre le completi tu. Le frasi in corsivo sono esempi: ascolta quello che l'ente dice davvero e ripeti autorizzazioni, quote, QNH e codici. Le formule seguono il Regolamento ENAC «Regole dell'aria Italia» e il suo Allegato A; sotto ogni scheda trovi la fonte e, quando la norma fissa solo l'ordine dei dati, l'indicazione «modello». Non sostituiscono l'addestramento con l'istruttore.</div>`;
  $('cards').innerHTML = `<h2 style="font:700 1.4em var(--display);margin:0">Chiamate radio per questo volo</h2>` + intro + cards.map(c => `
    <div class="card ${c.danger ? 'danger' : ''}">
      <h3>${esc(c.title)}</h3>
      ${c.unit || c.freq ? `<div><span class="freq">${esc(c.freq || '')}</span> ${esc(c.unit || '')}</div>` : ''}
      ${c.freqNote ? `<p class="note">${esc(c.freqNote)}</p>` : ''}
      <p class="${c.steps.length ? 'beginner-only' : ''}">${esc(c.explain)}</p>
      ${c.say ? `<dl class="spell">${c.say.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
      ${c.steps.map(s => `<div class="line ${s.who} ${s.example ? 'example' : ''}"><span class="who">${s.who === 'pilota' ? 'Tu' : 'Ente'}</span><span class="say">${esc(s.text)}</span></div>`).join('')}
      ${c.fonte ? `<p class="fonte">Fonte: ${esc(c.fonte)}</p>` : ''}
    </div>`).join('');
}

// ---------------------------------------------------------------- volo: GPS o simulazione
function routeLegs() {
  const r = state.route, legs = [];
  for (let i = 0; i < r.length - 1; i++) legs.push({ a: r[i], b: r[i + 1], d: distM(r[i], r[i + 1]), trk: bearingDeg(r[i], r[i + 1]), i });
  return legs;
}
function nextWaypoint() {
  const f = state.fly, r = state.route;
  if (state.direct && f.pos) return { p: { lon: state.direct.lon, lat: state.direct.lat, name: `Diretto ${state.direct.icao || titleCaseIt(state.direct.name)}` }, i: -1, d: distM(f.pos, state.direct), direct: true };
  if (!f.pos || r.length < 2) return null;
  if (f.source === 'sim' && f.sim) { const leg = routeLegs()[f.sim.leg]; return leg ? { p: leg.b, i: leg.i + 1 } : null; }
  // GPS: il primo punto davanti a sé (angolo rispetto alla rotta < 90°), altrimenti il più vicino
  let best = null;
  r.forEach((p, i) => {
    const d = distM(f.pos, p), ang = Math.abs(((bearingDeg(f.pos, p) - f.trk + 540) % 360) - 180);
    if (ang < 90 && (!best || i < best.i)) best = { p, i, d };
  });
  return best;
}
// ---------------------------------------------------------------- strumenti di volo a scelta
// Ogni casella della barra si tocca per scegliere il dato. L'elenco e l'ordine restano nel dispositivo.
const INST = [
  ['gs', 'Velocità al suolo'], ['alt', 'Quota'], ['agl', 'Sopra il terreno'], ['trk', 'Rotta seguita (M)'],
  ['next', 'Prossimo punto'], ['brg', 'Rotta al prossimo punto (M)'], ['ete', 'Tempo al prossimo punto'], ['eta', 'Ora al prossimo punto'],
  ['dest', 'Distanza all’arrivo'], ['destete', 'Tempo all’arrivo'], ['desteta', 'Ora di arrivo'], ['xtk', 'Fuori rotta'],
  ['vs', 'Variometro'], ['vsr', 'Rateo per l’arrivo'], ['vds', 'Limite VDS qui'], ['light', 'Luce del giorno'],
  ['ftime', 'Tempo di volo'], ['remind', 'Promemoria'], ['fuel', 'Carburante stimato'], ['gpsacc', 'Precisione GPS'],
  ['qnhnear', 'QNH più vicino'], ['wind', 'Vento previsto qui'], ['utc', 'Ora UTC'], ['none', 'Casella vuota'],
];
// ultima casella predefinita: limite VDS per il VDS non avanzato, luce del giorno per gli altri
const instDefault = () => ['gs', 'alt', 'agl', 'trk', 'next', 'ete', 'xtk', ui.pilot.value === 'basico' ? 'vds' : 'light'];
state.inst = Array.isArray(prefs.inst) && prefs.inst.length === 8 && prefs.inst.every(k => INST.some(x => x[0] === k)) ? prefs.inst : null; // null = predefinite
const deg3 = x => String(Math.round(((x % 360) + 360) % 360) || 360).padStart(3, '0');
// tempi brevi in minuti e secondi (7:05), oltre l'ora in ore e minuti (1 h 25)
const minSec = m => (!Number.isFinite(m) ? '—' : m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.floor(m % 60)).padStart(2, '0')}` : `${Math.floor(Math.round(m * 60) / 60)}:${String(Math.round(m * 60) % 60).padStart(2, '0')}`);
// Valori di tutti gli strumenti: [etichetta, valore, classe]
function instValues(c) {
  const f = state.fly, pilot = ui.pilot.value, dec = declAt(f.pos.lon, f.pos.lat), now = c.now, nw = c.nw;
  const destP = state.route.length > 1 ? state.route.at(-1) : null, dDest = destP ? distM(f.pos, destP) / NM : NaN;
  const eteDest = f.gsKt > 20 && Number.isFinite(dDest) ? dDest / f.gsKt * 60 : NaN;
  const arrF = destP ? fieldAt(state.feats, destP) : null, tgt = arrF ? arrF.elevM * FT + 1000 : NaN;
  const st = sunTimes(ui.date.value || new Date(now).toISOString().slice(0, 10), f.pos.lat, f.pos.lon, ui.pilot.value), lightMin = (st.dayEnd - now) / 60000;
  const tm = state.timers, rem = reminderState(tm.reminder, now), fe = c.fuel;
  const q = state.wx ? nearestQnh(state.wx.stations, f.pos) : null;
  const w = c.wind;
  return {
    gs: ['Velocità al suolo', `${Math.round(f.gsKt)} kt`],
    alt: [f.source === 'sim' ? 'Quota simulata' : f.altLabel || 'Quota GPS', `${Math.round(f.altFt / 10) * 10} ft`, f.altFt < c.terr ? 'crit' : ''],
    agl: ['Sopra il terreno', Number.isFinite(c.terr) ? `${Math.round(f.altFt - c.terr)} ft` : '—', c.airborne && f.altFt - c.terr < 500 && !c.nearField ? 'crit' : ''],
    trk: ['Rotta seguita', f.gsKt > 5 ? `${deg3(f.trk - dec)}° M` : '—'],
    next: [nw ? `Prossimo: ${nw.p.name || 'P' + (nw.i + 1)}` : 'Prossimo punto', nw ? `${c.distNw.toFixed(1)} NM` : '—'],
    brg: [nw ? `Rotta per ${nw.p.name || 'P' + (nw.i + 1)}` : 'Rotta al prossimo', nw ? `${deg3(bearingDeg(f.pos, nw.p) - dec)}° M` : '—'],
    ete: ['Tempo al punto', minSec(c.ete)],
    eta: ['Ora al prossimo', Number.isFinite(c.ete) ? localHM(now + c.ete * 60000) : '—'],
    dest: [destP ? `All’arrivo: ${destP.name || 'arrivo'}` : 'Distanza all’arrivo', Number.isFinite(dDest) ? `${dDest.toFixed(1)} NM` : '—'],
    destete: ['Tempo all’arrivo', minSec(eteDest)],
    desteta: ['Ora di arrivo', Number.isFinite(eteDest) ? localHM(now + eteDest * 60000) : '—', Number.isFinite(eteDest) && now + eteDest * 60000 > st.dayEnd ? 'crit' : ''],
    // con «diretto» attivo il fuori rotta non ha senso: la casella mostra la rotta magnetica diretta
    xtk: nw?.direct ? ['Rotta diretta', `${deg3(bearingDeg(f.pos, nw.p) - dec)}° M`] : [c.xt === null || Math.abs(c.xt) < 0.05 ? 'Fuori rotta' : `Fuori rotta a ${c.xt > 0 ? 'destra' : 'sinistra'}`, c.xt === null ? '—' : Math.abs(c.xt) < 0.05 ? 'in rotta' : `${Math.abs(c.xt).toFixed(1)} NM`, c.xt !== null && Math.abs(c.xt) > 1 ? 'crit' : ''],
    vs: ['Variometro', Number.isFinite(c.vs) ? `${c.vs > 0 ? '+' : c.vs < 0 ? '−' : ''}${Math.abs(Math.round(c.vs / 10) * 10)} ft/min` : '—'],
    vsr: [arrF ? `Rateo per ${arrF.icao || titleCaseIt(arrF.name)} +1000 ft` : 'Rateo per l’arrivo', Number.isFinite(tgt) && f.gsKt > 20 ? (f.altFt <= tgt ? 'in quota' : `−${Math.round(-requiredVsFpm(f.altFt, tgt, dDest, f.gsKt) / 10) * 10} ft/min`) : '—'],
    vds: ['Limite VDS qui', pilot === 'basico' ? `${Math.round(c.vdsLim / 10) * 10} ft` : 'non VDS', pilot === 'basico' && f.altFt > c.vdsLim ? 'crit' : ''],
    light: ['Luce restante', lightMin > 0 ? `${fmtDur(lightMin)} h` : 'notte', lightMin < 30 ? 'crit' : ''],
    ftime: ['Tempo di volo', f.ph.takeoffAt ? fmtDur((now - f.ph.takeoffAt) / 60000) : 'a terra'],
    remind: [tm.reminder ? `Promemoria: ${tm.reminder.label}` : 'Promemoria', rem ? fmtMS(rem.nextSec) : 'spento', rem && rem.nextSec < 60 ? 'crit' : ''],
    fuel: ['Carburante stimato', fe ? `${Math.round(fe.remL)} l · ${fmtDur(fe.endMin)}` : 'non impostato', fe && fe.usableMin < 15 ? 'crit' : ''],
    gpsacc: ['Precisione GPS (quota)', Number.isFinite(f.gpsAltAcc) ? `±${Math.round(f.gpsAltAcc)} ft` : f.source === 'sim' ? 'simulazione' : '—'],
    qnhnear: [q ? `QNH ${q.id}` : 'QNH più vicino', q ? `${q.qnh} hPa` : '—'],
    wind: [w ? `Vento (${w.src})` : 'Vento previsto qui', w ? `${deg3(w.dir)}/${Math.round(w.kt)} kt` : '—'],
    utc: ['Ora UTC', new Date(now).toISOString().slice(11, 16)],
    none: ['', ''],
  };
}
function renderInstruments(c) {
  const v = instValues(c);
  $('instruments').innerHTML = (state.inst || instDefault()).map((k, i) => { const [l, val, cls] = v[k] || ['', '']; return `<button type="button" class="${cls || ''}${k === 'none' ? ' empty' : ''}" data-slot="${i}" title="Tocca per scegliere il dato"><small>${esc(l)}</small><strong>${esc(val)}</strong></button>`; }).join('');
}
$('instruments').addEventListener('click', e => {
  const b = e.target.closest('[data-slot]'); if (!b) return;
  const slot = Number(b.dataset.slot), menu = $('instMenu'), r = b.getBoundingClientRect(), vr = $('view').getBoundingClientRect();
  menu.innerHTML = `<b>Casella ${slot + 1}: scegli il dato</b><div class="grid">${INST.map(([k, l]) => `<button type="button" class="${(state.inst || instDefault())[slot] === k ? 'on' : ''}" data-k="${k}">${esc(l)}</button>`).join('')}</div><button type="button" class="btn" data-k="__reset">Caselle predefinite</button>`;
  menu.dataset.slot = slot; menu.style.display = 'block';
  menu.style.left = `${Math.max(8, Math.min(r.left - vr.left, vr.width - menu.offsetWidth - 8))}px`; menu.style.top = `${r.bottom - vr.top + 6}px`;
});
$('instMenu').addEventListener('click', e => {
  const k = e.target.dataset.k, menu = $('instMenu');
  if (!k) return;
  if (k === '__reset') state.inst = null; else { state.inst = [...(state.inst || instDefault())]; state.inst[Number(menu.dataset.slot)] = k; }
  menu.style.display = 'none'; savePrefs(); flyTick();
});
document.addEventListener('pointerdown', e => { const m = $('instMenu'); if (m.style.display === 'block' && !m.contains(e.target) && !e.target.closest('#instruments')) m.style.display = 'none'; });

// Vento nel punto: previsione ICON-2I alla quota se c'è, altrimenti il METAR più vicino (vento al suolo, meno adatto in quota)
function windHere(pos, altFt) {
  if (state.fc) { const w = windAtAlt(columnAt(state.fc, nearestPoint(state.fc, pos.lon, pos.lat).i, state.fcTi), altFt); if (w && Number.isFinite(w.dir) && Number.isFinite(w.kt)) return { dir: w.dir, kt: w.kt, src: 'ICON-2I' }; }
  // METAR: vento medio, non la raffica (in coda la raffica allungherebbe la planata in modo ottimistico)
  if (!state.wx) return null;
  const s = state.wx.stations.filter(x => x.ageMin <= 90 && Number.isFinite(x.wspd) && Number.isFinite(Number(x.wdir))).map(x => ({ x, d: distM(x, pos) })).sort((a, b) => a.d - b.d)[0];
  return s && s.d <= 25000 ? { dir: Number(s.x.wdir), kt: s.x.wspd, src: `METAR ${s.x.id}, al suolo` } : null;
}
// Vicino a un campo e basso: niente colori né avvisi di «attenzione» per il terreno (decollo, circuito, atterraggio)
const FIELD_ZONE_NM = 2, FIELD_ZONE_AGL = 1000;
function nearFieldLow(pos, altFt) {
  const n = nearestFields(pos, 1)[0];
  return !!n && n.d / NM < FIELD_ZONE_NM && altFt - n.a.elevM * FT < FIELD_ZONE_AGL;
}

function flyTick() {
  const f = state.fly;
  if (!f.pos) return;
  const d = day(), pilot = ui.pilot.value, now = f.source === 'sim' ? f.simClock : (f.fixT || Date.now());
  const terr = terrain.elevFt(f.pos.lon, f.pos.lat);
  // fasi del volo: in simulazione si parte già in volo
  if (f.source === 'sim' && f.ph.phase === 'terra') { f.ph.phase = 'volo'; f.ph.takeoffAt = now; onTakeoff(now); }
  else if (f.source !== 'sim') { const ev = phaseStep(f.ph, { t: now, gsKt: f.gsKt, altFt: f.altFt, aglFt: f.altFt - terr, pos: f.pos }); if (ev?.kind === 'decollo') onTakeoff(ev.t); else if (ev?.kind === 'atterraggio') onLanding(ev.t); }
  const airborne = f.ph.phase === 'volo';
  f.alts.push({ t: now, altFt: f.altFt }); while (f.alts.length > 40) f.alts.shift();
  // incertezza verticale: precisione dichiarata dal GPS (minimo 100 ft), 150 ft per la barometrica esterna, zero in simulazione
  const unc = f.source === 'sim' ? 0 : /barometrica/i.test(f.altLabel || '') ? 150 : Math.max(100, Number.isFinite(f.gpsAltAcc) ? f.gpsAltAcc : 250);
  const vsNow = verticalSpeedFpm(f.alts), nearField = nearFieldLow(f.pos, f.altFt), nf = nearestFields(f.pos, 1)[0];
  // in zona del campo la quota prevista non scende sotto quella del campo; VDS non avanzato: attenzione a 150 ft
  const la = lookahead({ pos: f.pos, trackDeg: f.trk, gsKt: f.gsKt, altFt: f.altFt, minutes: 5, stepSec: 10, pilot, qnh: qnh(), airspaces: checkAirspaces(), terrain, day: d, uncFt: unc, obstacles: state.feats?.obstacles || [], obstacleTopFt, vsFpm: airborne ? vsNow : 0,
    floorFt: nearField && nf ? nf.a.elevM * FT : -Infinity, warnAglFt: pilot === 'basico' ? 150 : 300 });
  // A terra nessun avviso di terreno o ostacolo; vicino a un campo e sotto 1000 ft sul campo restano solo quelli gravi
  // (si è dentro il terreno o l'ostacolo), così decollo e atterraggio non suonano di continuo.
  f.events = la.events.filter(e => !['terrain', 'obstacle'].includes(e.kind) || (airborne && (e.lvl === 'crit' || !nearField)));
  f.inside = la.inside;
  const vdsLim = pilot === 'basico' ? terrain.maxWithinFt(f.pos.lon, f.pos.lat) + d.vdsAgl : NaN;
  const nw = nextWaypoint();
  const distNw = nw ? distM(f.pos, nw.p) / NM : NaN, ete = nw && f.gsKt > 5 ? distNw / f.gsKt * 60 : NaN;
  const xt = nw && !nw.direct && nw.i > 0 ? crossTrackM(state.route[nw.i - 1], nw.p, f.pos) / NM : null;
  const ac = currentAircraft(), tm = state.timers;
  const fuel = f.ph.takeoffAt ? fuelEstimate({ fuelL: tm.fuelL, flowLh: ac.fuelFlowLh, flightMin: (now - f.ph.takeoffAt) / 60000, reserveMin: Number(state.nl.st.reserveMin) || 30 }) : null;
  const destP = state.route.length > 1 ? state.route.at(-1) : null;
  f.extra = [...fuelWarnings(fuel, destP && f.gsKt > 20 ? distM(f.pos, destP) / NM / f.gsKt * 60 : NaN, Number(state.nl.st.reserveMin) || 30)];
  const ctx = { now, nw, distNw, ete, xt, terr, vdsLim, airborne, nearField, fuel, vs: vsNow, wind: windHere(f.pos, f.altFt) };
  f.wind = ctx.wind;
  renderInstruments(ctx);
  checkReminder(now);
  checkPointReminders(now, airborne);
  updateTraffic();
  // terreno colorato rispetto all'aereo, solo in volo e fuori dalla zona del campo
  setHazard(airborne && !nearField, f.altFt);
  // avviso grande per l'evento più vicino e grave
  const top = f.events.filter(e => e.lvl === 'crit').sort((a, b) => a.t - b.t)[0];
  const big = $('alertbig');
  if (top && top.t <= 120) { big.style.display = 'block'; big.textContent = eventSpeech(top); }
  else if (f.remindMsg && now - f.remindMsg.t < 20000) { big.style.display = 'block'; big.textContent = f.remindMsg.text; }
  else big.style.display = 'none';
  // voce: ogni evento una sola volta (ripetuto se si riavvicina sotto i 30 s)
  if (state.voice) for (const e of f.events) {
    if (e.t > 120 || e.lvl === 'info') continue;
    const key = e.airspace ? e.airspace.id : `${e.kind}-${e.lvl}`, prev = f.spoken.get(key);
    if (prev === undefined || (prev > 40 && e.t <= 30)) { f.spoken.set(key, e.t); say(eventSpeech(e)); }
  }
  for (const w of f.extra) if (!f.spoken.has(w.title)) { f.spoken.set(w.title, 0); if (state.voice) say(w.title); }
  updateHighlight();
  f.fixPerf = performance.now(); buildPlane(); recordTrack(now); buildTrail();
  ensureTerrainFor(boundsAround([f.pos], 25));
  if (!f.glideAt || Date.now() - f.glideAt > 3000) { f.glideAt = Date.now(); buildGlide(); renderNearest(); renderEmergency(); }
  buildDirect();
  if (state.view === 'fly') { renderFlyWarnings(); drawAheadProfile(); }
  if (state.view === 'radio') renderRadio();
  renderTimers();
  followCamera();
}
function say(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text); u.lang = 'it-IT'; u.rate = 1.0; window.speechSynthesis.speak(u);
}
function renderFlyWarnings() {
  const f = state.fly, box = $('warnings');
  if (!f.pos) { box.innerHTML = '<div class="warn info"><b>In attesa della posizione</b>Premi «Avvia GPS» per usare il GPS del dispositivo, oppure «Simula» per provare lungo la rotta pianificata.</div>'; return; }
  const items = f.events.map(e => {
    const mm = Math.floor(e.t / 60), ss = String(Math.round(e.t % 60)).padStart(2, '0'), when = e.t < 15 ? 'adesso' : `tra ${mm}:${ss}`;
    const title = e.kind === 'terrain' ? 'Terreno' : e.kind === 'obstacle' ? `Ostacolo (${e.obstacle.kind})` : e.kind === 'vds' ? 'Limite VDS' : (e.marginal ? 'Vicino a ' : '') + e.airspace.name;
    const text = e.kind === 'obstacle' ? `Margine ${Math.round(e.clearance)} ft sulla sommità${e.obstacle.heightM == null ? ` (altezza non nota, considerata ${unknownHeightM(e.obstacle)} m)` : ''}.` : e.kind === 'airspace' ? (e.marginal ? `Potresti entrarci: sei a ${Math.round(e.gap)} ft dal limite, meno dell'incertezza della quota. ` : '') + e.rule.text : e.kind === 'vds' ? `Saresti ${Math.round(e.over)} ft sopra il limite.` : `Margine ${Math.round(e.clearance)} ft.`;
    const c = e.airspace ? contactInfo(e.airspace) : null;
    return `<div class="warn ${e.lvl}"><b>${esc(title)} ${when}</b>${esc(text)}${c && c.freq ? ` Chiama ${esc(c.unit)} ${esc(c.freq)}.` : ''}</div>`;
  });
  const inside = (f.inside || []).map(a => `<div class="warn info"><b>Sei dentro: ${esc(a.name)}</b>${esc(limitText(a.lower))}–${esc(limitText(a.upper))}</div>`);
  const extra = (f.extra || []).map(w => `<div class="warn ${w.lvl}"><b>${esc(w.title)}</b>${esc(w.text)}</div>`);
  const zone = f.ph.phase !== 'volo' ? '<div class="warn info"><b>A terra</b>Avvisi di terreno e ostacoli spenti finché non decolli (velocità al suolo oltre 40 kt per 10 s).</div>'
    : nearFieldLow(f.pos, f.altFt) ? '<div class="warn info"><b>Zona del campo</b>Entro 2 NM da un campo e sotto 1000 ft: restano solo gli avvisi di terreno gravi e il rilievo non si colora.</div>' : '';
  box.innerHTML = extra.join('') + (items.join('') || '<div class="warn ok"><b>Nessun conflitto nei prossimi 5 minuti</b>Alla quota e rotta attuali, con i dati caricati.</div>') + inside.join('') + zone;
}
function drawAheadProfile() {
  const f = state.fly;
  if (!f.pos) { drawProfile(null); return; }
  const total = 10 * NM, n = 120, samples = [], pilot = ui.pilot.value, d = day();
  for (let k = 0; k <= n; k++) {
    const dist = total * k / n, p = destPoint([f.pos.lon, f.pos.lat], f.trk, dist / NM), terr = terrain.elevFt(p[0], p[1]);
    samples.push({ dist, lon: p[0], lat: p[1], terr, vds: pilot === 'basico' ? terrain.maxWithinFt(p[0], p[1]) + d.vdsAgl : NaN, air: airspacesAt(p[0], p[1], terr, checkAirspaces(), qnh()) });
  }
  drawProfile(samples, total, f.altFt);
}
function followCamera() {
  const f = state.fly;
  if (!f.pos || state.view !== 'fly' || state.review || !f.follow || f.hold) return; // in revisione o a carta libera non si muove
  const l = state.proj.toLocal(f.pos.lon, f.pos.lat), y = yOf(f.altFt), t = f.trk * Math.PI / 180, K = f.followK || 1;
  const target = new THREE.Vector3(l.x + Math.sin(t) * 4 * K, y, l.z - Math.cos(t) * 4 * K);
  // 2D: carta orientata a nord, aereo al centro. 3D: da dietro e un po' sopra, nella direzione della rotta.
  if (state.dim === '2d') { target.set(l.x, y, l.z); }
  const camPos = state.dim === '2d' ? new THREE.Vector3(l.x, y + 600, l.z + 0.06) : new THREE.Vector3(l.x - Math.sin(t) * 9 * K, y + 5 * K, l.z + Math.cos(t) * 9 * K);
  // al primo punto la camera salta sull'aereo, poi lo segue in modo morbido (vedi ciclo di disegno)
  if (!f.camGoal || f.camGoal.pos.distanceTo(camPos) > 30 * K) { controls.target.copy(target); cam().position.copy(camPos); }
  f.camGoal = { pos: camPos, target };
}
function stopFly() {
  const f = state.fly;
  if (f.watch !== null) navigator.geolocation?.clearWatch(f.watch);
  clearInterval(f.timer);
  Object.assign(f, { active: false, source: null, watch: null, timer: null, sim: null, camGoal: null, follow: true });
  $('recenterBtn')?.setAttribute('aria-pressed', 'true');
  f.ph = newPhase(); f.alts = []; f.extra = []; f.remindMsg = null; f.fixT = 0;
  setHazard(state.terrPlan, cruise());
  $('gpsBtn').textContent = 'Avvia GPS'; $('simBtn').textContent = 'Simula';
  $('gpsBtn').classList.add('primary'); $('simBtn').classList.remove('on');
}
function startGps() {
  const f = state.fly;
  if (f.active && f.source !== 'ext') { stopFly(); return; }
  if (f.active) stopFly();
  if (!('geolocation' in navigator)) { showFlyMsg('Questo dispositivo non offre il GPS al programma.'); return; }
  f.active = true; f.source = 'gps'; f.spoken.clear(); f.sessionT = Date.now(); keepAwake(true);
  $('gpsBtn').textContent = 'Ferma GPS'; $('gpsBtn').classList.remove('primary');
  f.watch = navigator.geolocation.watchPosition(p => {
    const c = p.coords, pos = { lon: c.longitude, lat: c.latitude };
    // rotta e velocità dal GPS; se mancano, si calcolano dai due ultimi punti
    if (f.last && (!Number.isFinite(c.speed) || !Number.isFinite(c.heading))) {
      const dt = (p.timestamp - f.last.t) / 1000, d = distM(f.last.pos, pos);
      if (dt > 0 && d > 3) { f.gsKt = d / dt / KT; f.trk = bearingDeg(f.last.pos, pos); }
    } else if (Number.isFinite(c.speed)) { f.gsKt = c.speed / KT; if (Number.isFinite(c.heading)) f.trk = c.heading; }
    // La Geolocation API e Android danno la quota sull'ellissoide WGS84: si toglie l'ondulazione del geoide (EGM96).
    if (Number.isFinite(c.altitude)) {
      const N = geoidN(state.geoid, pos.lon, pos.lat);
      f.gpsAltFt = (c.altitude - (Number.isFinite(N) ? N : 0)) * FT;
      f.gpsAltOk = Number.isFinite(N);
      f.gpsAltAcc = Number.isFinite(c.altitudeAccuracy) ? c.altitudeAccuracy * FT : NaN;
    }
    f.pos = pos; f.last = { pos, t: p.timestamp }; f.fixT = p.timestamp;
    applyAltitude();
    flyTick();
  }, err => {
    stopFly();
    showFlyMsg(err.code === 1 ? 'Il permesso di usare la posizione è stato negato. In questa pagina web il GPS può essere bloccato: usa l’app Android oppure la simulazione.' : 'Il GPS non risponde. Prova all’aperto, oppure usa la simulazione.');
  }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
}
function startSim() {
  const f = state.fly;
  if (f.active && f.source !== 'ext') { stopFly(); return; }
  if (f.active) stopFly();
  const legs = routeLegs();
  if (!legs.length) { showFlyMsg('Per simulare serve una rotta con almeno due punti (scheda «Pianifica»).'); return; }
  f.active = true; f.source = 'sim'; f.spoken.clear(); f.sessionT = Date.now(); keepAwake(true); f.simClock = Date.now();
  f.sim = { leg: 0, along: 0 }; f.gsKt = state.mode === 'beginner' ? 80 : 90;
  const pr = state.profile || planProfile(), legStart = legs.map((l, k) => legs.slice(0, k).reduce((q, x) => q + x.d, 0));
  f.altFt = pr ? pr.altAt(0) : legAltFt(state.route, 0, cruise());
  $('simBtn').textContent = 'Ferma sim.'; $('simBtn').classList.add('on');
  const tickMs = 1000;
  f.timer = setInterval(() => {
    const speed = Number(ui.simSpeed.value) || 1;
    f.simClock += tickMs * speed;
    let adv = f.gsKt * KT * (tickMs / 1000) * speed;
    while (adv > 0 && f.sim.leg < legs.length) {
      const L = legs[f.sim.leg], rest = L.d - f.sim.along;
      if (adv < rest) { f.sim.along += adv; adv = 0; } else { adv -= rest; f.sim.leg++; f.sim.along = 0; }
    }
    if (f.sim.leg >= legs.length) { stopFly(); showFlyMsg('Simulazione terminata: sei arrivato all’ultimo punto.'); return; }
    const L = legs[f.sim.leg], t = f.sim.along / L.d;
    f.pos = { lon: L.a.lon + t * (L.b.lon - L.a.lon), lat: L.a.lat + t * (L.b.lat - L.a.lat) };
    f.trk = L.trk; f.altFt = pr ? pr.altAt(legStart[f.sim.leg] + f.sim.along) : legAltFt(state.route, f.sim.leg, cruise());
    flyTick();
  }, tickMs);
}
// Quota mostrata: barometrica da strumento esterno (se recente) altrimenti GPS corretto per il geoide
function applyAltitude() {
  const f = state.fly, e = state.ext, now = Date.now();
  const baro = e.baro && now - e.seen.baro < 5000 ? e.baro : null;
  const gps = Number.isFinite(f.gpsAltFt) ? { valid: true, altFt: f.gpsAltFt } : null;
  const r = fuse({ gps, baro, qnh: qnh() });
  if (Number.isFinite(r.altFt)) f.altFt = r.altFt;
  f.altLabel = r.altSource === 'GPS' ? (f.gpsAltOk === false ? 'Quota GPS (non corretta)' : 'Quota GPS') : 'Quota barometrica';
  if (r.altSource === 'GPS' && Number.isFinite(f.gpsAltAcc)) f.altLabel += ` ±${Math.round(f.gpsAltAcc / 10) * 10}`;
  if (state.ext.demo && r.altSource !== 'GPS') f.altLabel += ' (simulata)';
  f.altNotes = r.notes;
}

// ---------------------------------------------------------------- strumenti esterni (Bluetooth, USB)
function onExtLine(line) {
  const m = parseNmea(line), e = state.ext, now = Date.now();
  e.lines++;
  if (!m) return;
  if (m.type === 'RMC' && m.valid) { e.gps = { ...(e.gps || {}), valid: true, lat: m.lat, lon: m.lon, gsKt: m.gsKt, trk: m.trk }; e.seen.gps = now; }
  if (m.type === 'GGA' && m.valid) { e.gps = { ...(e.gps || {}), valid: true, lat: m.lat, lon: m.lon, altFt: m.altMslM * FT, sats: m.sats }; e.seen.gps = now; } // GGA: quota già sul mare
  if (m.type === 'PGRMZ' && m.valid) { e.baro = m; e.seen.baro = now; }
  if (m.type === 'HDG' && m.valid) { e.heading = m; e.seen.heading = now; }
  const f = state.fly;
  if (m.type === 'PFLAA' && f.pos) { ingestFlarm(state.traffic, m, { ...f.pos, altFt: f.altFt, trk: f.trk }, now); e.seen.traffic = now; }
  if (m.type === 'PFLAU') { e.flarm = m; e.seen.flarm = now; if (m.alarm >= 1 && f.active) updateTraffic(); }
  // posizione da GPS esterno se non c'è il GPS interno attivo; aggiornamento al massimo una volta al secondo
  if (e.gps && (f.source === 'ext' || !f.active) && (!e.lastTick || now - e.lastTick > 900)) {
    if (!f.active) { f.active = true; f.source = 'ext'; f.spoken.clear(); f.sessionT = Date.now(); }
    f.pos = { lon: e.gps.lon, lat: e.gps.lat };
    if (Number.isFinite(e.gps.gsKt)) f.gsKt = e.gps.gsKt;
    if (Number.isFinite(e.gps.trk)) f.trk = e.gps.trk;
    f.gpsAltFt = e.gps.altFt; f.gpsAltOk = true; f.gpsAltAcc = NaN;
    e.lastTick = now; applyAltitude(); flyTick();
  } else if (f.active && f.source === 'gps' && e.baro) applyAltitude();
  renderDevices();
}
async function connectDevice(kind) {
  const e = state.ext;
  try {
    await disconnectDevice();
    e.conn = kind === 'usb' ? await connectUsb(onExtLine) : await connectBle(onExtLine);
  } catch (err) {
    e.err = err && err.name === 'NotFoundError' ? 'Nessun dispositivo scelto.' : `Collegamento non riuscito: ${err.message || err}`;
  }
  renderDevices();
}
async function disconnectDevice() {
  const e = state.ext;
  if (e.demo) { clearInterval(e.demo); e.demo = null; }
  if (e.conn) { await e.conn.close(); e.conn = null; }
  Object.assign(e, { gps: null, baro: null, heading: null, seen: {}, lines: 0, err: '' });
  if (state.fly.source === 'ext') stopFly();
  renderDevices();
}
function startDeviceDemo() {
  disconnectDevice().then(() => {
    const e = state.ext, start = state.route[0] || { lat: 42.03, lon: 13.43 };
    let t = 0;
    e.conn = { name: 'Dati simulati (nessun dispositivo reale)', close: async () => {} };
    e.demo = setInterval(() => { for (const l of demoNmeaLines(start.lat, start.lon, cruise(), t)) onExtLine(l); t += 1; }, 1000);
    renderDevices();
  });
}
function renderDevices() {
  const e = state.ext, av = transportsAvailable(), now = Date.now();
  $('bleBtn').disabled = !av.ble; $('usbBtn').disabled = !av.usb;
  const age = k => (e.seen[k] ? `${Math.round((now - e.seen[k]) / 1000)} s fa` : 'nessun dato');
  const rows = [];
  if (e.err) rows.push(`<div class="warn crit"><b>Strumento esterno</b>${esc(e.err)}</div>`);
  if (e.conn) {
    rows.push(`<div class="box"><b>${esc(e.conn.name)}</b> · ${e.lines} righe ricevute</div>`);
    rows.push(`<div class="note">Posizione: ${e.gps ? `${e.gps.lat.toFixed(4)}, ${e.gps.lon.toFixed(4)}${e.gps.sats ? ` · ${e.gps.sats} satelliti` : ''}` : '—'} (${age('gps')})</div>`);
    rows.push(`<div class="note">Altitudine di pressione: ${e.baro ? `${Math.round(e.baro.pressAltFt)} ft a 1013 hPa` : '—'} (${age('baro')})</div>`);
    if (e.seen.flarm || e.seen.traffic) rows.push(`<div class="note">FLARM: ${e.flarm ? `${e.flarm.rx} traffici ricevuti${e.flarm.gpsOk ? '' : ', GPS del FLARM non valido'}` : '—'} (${age(e.seen.traffic ? 'traffic' : 'flarm')})</div>`);
    rows.push(`<div class="note">Prua: ${e.heading ? `${Math.round(e.heading.headingDeg)}° ${e.heading.magnetic ? 'magnetica' : 'vera'}` : '—'} (${age('heading')})</div>`);
    for (const n of state.fly.altNotes || []) rows.push(`<div class="warn warn"><b>Controllo incrociato</b>${esc(n)}</div>`);
    rows.push(`<button class="btn danger" type="button" id="devOff">Scollega</button>`);
  } else rows.push(`<p class="note">${av.ble || av.usb ? 'Nessuno strumento collegato.' : 'Su questo dispositivo il collegamento diretto non è disponibile: usa l’app Android (Bluetooth) o Chrome su computer (USB e Bluetooth).'}</p>`);
  $('devStatus').innerHTML = rows.join('');
  $('devOff')?.addEventListener('click', disconnectDevice);
}

// ---------------------------------------------------------------- meteo
// ---------------------------------------------------------------- aeroporti, ostacoli, punti di riporto, radioassistenze
function buildFeatures() {
  groups.feat.clear();
  const F = state.feats, P = state.proj, a = state.area;
  if (!F || !P) return;
  const inA = p => p.lon >= a.lonMin && p.lon <= a.lonMax && p.lat >= a.latMin && p.lat <= a.latMax && inFocus(p);
  const basico = ui.pilot.value === 'basico', expert = state.mode === 'expert';
  for (const ap of F.airports) {
    const kind = aerodromeKind(ap);
    if (!inA(ap) || kind === 'chiuso' || (kind === 'elisuperficie' && !expert)) continue;
    const l = P.toLocal(ap.lon, ap.lat), y = yOf(ap.elevM * FT) + 0.05, col = kind === 'aeroporto' ? '#1d4ed8' : '#7c3aed';
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.75, 24), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, depthTest: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(l.x, y, l.z); ring.renderOrder = 8; groups.feat.add(ring);
    if (kind === 'aeroporto' && basico) {
      // cerchio dei 5 km: distanza minima per il VDS non avanzato, tracciato sul terreno
      const pts = [];
      for (let k = 0; k <= 72; k++) { const q = destPointLL(ap, k * 5, VDS_AIRPORT_KM / 1.852), lq = P.toLocal(q.lon, q.lat); pts.push(new THREE.Vector3(lq.x, yOf((terrain.elevFt(q.lon, q.lat) || 0) + 80), lq.z)); }
      const c = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: col, dashSize: 0.6, gapSize: 0.4 }));
      c.computeLineDistances(); groups.feat.add(c);
    }
    const freq = ap.freqs.find(f => f.mhz);
    const lab = makeLabel(`${ap.icao || titleCaseIt(ap.name)}${freq && (expert || kind !== 'aeroporto') ? ' ' + freq.mhz : ''}`, col, 0.8);
    lab.position.set(l.x, y + 0.9, l.z); lab.userData.maxKm = kind === 'aeroporto' ? 160 : 60; groups.feat.add(lab);
  }
  // ostacoli: segmento verticale dal suolo alla sommità; tratteggiato fino all'altezza prudente se non è nota
  const known = [], unknown = [];
  for (const o of F.obstacles) {
    if (!inA(o)) continue;
    const l = P.toLocal(o.lon, o.lat), y0 = yOf(o.elevM * FT), y1 = yOf(obstacleTopFt(o));
    (o.heightM == null ? unknown : known).push(new THREE.Vector3(l.x, y0, l.z), new THREE.Vector3(l.x, y1, l.z));
  }
  if (known.length) groups.feat.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(known), new THREE.LineBasicMaterial({ color: '#d9480f' })));
  if (unknown.length) { const u = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(unknown), new THREE.LineDashedMaterial({ color: '#d9480f', dashSize: 0.08, gapSize: 0.06 })); u.computeLineDistances(); groups.feat.add(u); }
  // punti di riporto (VDS avanzato e aviazione generale) e radioassistenze (solo esperto)
  if (!basico) for (const r of F.reportingPoints) {
    if (!inA(r)) continue;
    const l = P.toLocal(r.lon, r.lat), y = yOf((terrain.elevFt(r.lon, r.lat) || 0)) + 0.05;
    const tri = new THREE.Mesh(new THREE.CircleGeometry(0.5, 3), new THREE.MeshBasicMaterial({ color: r.compulsory ? '#111827' : '#6b7280', side: THREE.DoubleSide, depthTest: false }));
    tri.rotation.x = -Math.PI / 2; tri.position.set(l.x, y, l.z); tri.renderOrder = 8; groups.feat.add(tri);
    const lab = makeLabel(r.name, '#111827', 0.7); lab.position.set(l.x, y + 0.7, l.z); lab.userData.maxKm = 40; groups.feat.add(lab);
  }
  if (expert) for (const n of F.navaids) {
    if (!inA(n)) continue;
    const l = P.toLocal(n.lon, n.lat), y = yOf((terrain.elevFt(n.lon, n.lat) || 0)) + 0.05;
    const hex = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.6, 6), new THREE.MeshBasicMaterial({ color: '#0f766e', side: THREE.DoubleSide, depthTest: false }));
    hex.rotation.x = -Math.PI / 2; hex.position.set(l.x, y, l.z); hex.renderOrder = 8; groups.feat.add(hex);
    const lab = makeLabel(`${n.ident} ${n.mhz}`, '#0f766e', 0.75); lab.position.set(l.x, y + 0.8, l.z); lab.userData.maxKm = 90; groups.feat.add(lab);
  }
}
// ---------------------------------------------------------------- base cartografica (OpenStreetMap): località, vette, strade, ferrovie, fiumi
groups.base = wrapGroup(new THREE.Group()); scene.add(groups.base);
function makeTownLabel(text, rank) {
  const size = [0, 22, 26, 30][rank];
  const t = cachedTex(`T|${rank}|${text}`, (c, ctx) => {
    const font = `${rank === 3 ? 700 : 500} ${size}px ${FONT}`;
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 12;
    c.width = w; c.height = size + 12; ctx.font = font; ctx.lineJoin = 'round';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(text, 6, size + 2);
    ctx.fillStyle = '#1f2937'; ctx.fillText(text, 6, size + 2);
    return {};
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.tex, depthTest: false, transparent: true }));
  sp.userData.px = [t.w / t.h * (size * 0.7), size * 0.7]; sp.renderOrder = 7;
  return sp;
}
function buildBasemap() {
  groups.base.clear();
  const B = state.basemap, P = state.proj, fb = state.focus?.b;
  if (!B || !P || !fb || state.mode === 'beginner' && state.view === 'fly') return;
  const a = state.area, inB = (lon, lat) => lon >= fb.lonMin && lon <= fb.lonMax && lat >= fb.latMin && lat <= fb.latMax && lon >= a.lonMin && lon <= a.lonMax && lat >= a.latMin && lat <= a.latMax;
  const yAt = (lon, lat, add) => yOf((terrain.elevFt(lon, lat) || 0) + add);
  // linee drappeggiate sul terreno, spezzate ogni 600 m circa per seguirne la forma
  const lines = (polys, color, add, dashed) => {
    const v = [];
    for (const pl of polys) for (let i = 0; i < pl.length - 1; i++) {
      const [x0, y0] = pl[i], [x1, y1] = pl[i + 1];
      if (!inB(x0, y0) && !inB(x1, y1)) continue;
      const n = Math.max(1, Math.ceil(Math.hypot((x1 - x0) * 82, (y1 - y0) * 111) / 0.6));
      for (let k = 0; k < n; k++) {
        const ta = k / n, tb = (k + 1) / n, la = [x0 + (x1 - x0) * ta, y0 + (y1 - y0) * ta], lb = [x0 + (x1 - x0) * tb, y0 + (y1 - y0) * tb];
        const pa = P.toLocal(...la), pb = P.toLocal(...lb);
        v.push(pa.x, yAt(...la, add), pa.z, pb.x, yAt(...lb, add), pb.z);
      }
    }
    if (!v.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const m = new THREE.LineSegments(g, dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.3, gapSize: 0.25 }) : new THREE.LineBasicMaterial({ color }));
    if (dashed) m.computeLineDistances();
    m.renderOrder = 1; groups.base.add(m);
  };
  lines(B.rivers || [], '#3b82c4', 60);
  lines(B.rail || [], '#4b5563', 80, true);
  lines(B.roads?.primary || [], '#d6a400', 80);
  lines(B.roads?.trunk || [], '#e07b00', 90);
  lines(B.roads?.motorway || [], '#d1453b', 100);
  // località: città sempre, paesi entro la vista, frazioni solo vicino (vedi scaleLabels)
  const c = state.focus.c, near = p => distM(c, p) / 1000;
  const pl = (B.places || []).filter(p => inB(p.lon, p.lat));
  const pick = [...pl.filter(p => p.k === 3), ...pl.filter(p => p.k === 2).sort((x, y) => near(x) - near(y)).slice(0, 260), ...pl.filter(p => p.k === 1 && near(p) < 35).sort((x, y) => near(x) - near(y)).slice(0, 220)];
  for (const p of pick) {
    const l = P.toLocal(p.lon, p.lat), lab = makeTownLabel(p.n, p.k);
    lab.position.set(l.x, yAt(p.lon, p.lat, 250), l.z); lab.userData.maxKm = [0, 22, 70, 400][p.k]; groups.base.add(lab);
  }
  // vette con quota: le più alte vicino al centro della vista
  const pk = (B.peaks || []).filter(p => inB(p.lon, p.lat) && p.ele >= 1200 && near(p) < 60).sort((x, y) => y.ele - x.ele).slice(0, 80);
  for (const p of pk) {
    const l = P.toLocal(p.lon, p.lat), y = yOf(p.ele * FT);
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.35, 3), new THREE.MeshBasicMaterial({ color: '#57534e' }));
    tri.position.set(l.x, y + 0.18, l.z); groups.base.add(tri);
    const lab = makeTownLabel(`${p.n} ${p.ele}`, 1); lab.position.set(l.x, y + 0.7, l.z); lab.userData.maxKm = 30; groups.base.add(lab);
  }
}
const titleCaseIt = s => s.toLowerCase().replace(/(^|\s|\/)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const destPointLL = (p, brg, nm) => { const q = destPoint([p.lon, p.lat], brg, nm); return { lon: q[0], lat: q[1] }; };

// ---------------------------------------------------------------- radar della Protezione Civile (osservato)
async function loadRadar() {
  const R = state.radar;
  if (R.busy) return;
  R.busy = true; R.err = '';
  try {
    const [sri, cappi] = await Promise.all([fetchRadar('SRI'), fetchRadar('CAPPI_2').catch(() => null)]);
    Object.assign(R, { sri, cappi });
  } catch (e) {
    R.err = navigator.onLine === false ? 'Nessuna connessione.' : 'Radar non raggiungibile da qui (nell’app Android dovrebbe funzionare: da provare sul tablet).';
  }
  R.busy = false;
  buildRadar(); refresh();
}
function buildRadar() {
  groups.radar.clear();
  const R = state.radar, a = state.area, P = state.proj;
  if (!R.sri || !P || !state.wxShow) return;
  // pioggia al suolo: griglia propria (circa 1,5 km) sopra il terreno, colorata dove il radar misura pioggia
  const wKm = (a.lonMax - a.lonMin) * 111.32 * Math.cos(P.origin.lat * Math.PI / 180), hKm = (a.latMax - a.latMin) * 111.2;
  const nx = Math.max(60, Math.min(300, Math.round(wKm / 1.5))), ny = Math.max(2, Math.round(nx * hKm / wKm));
  const nV = (nx + 1) * (ny + 1), geo = new THREE.BufferGeometry(), p2 = new Float32Array(nV * 3), col = new Float32Array(nV * 4);
  let any = false, k = 0;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++, k++) {
    const lon = a.lonMin + (a.lonMax - a.lonMin) * i / nx, lat = a.latMax - (a.latMax - a.latMin) * j / ny, l = P.toLocal(lon, lat);
    p2[k * 3] = l.x; p2[k * 3 + 1] = yOf((terrain.elevFt(lon, lat) || 0) + 80); p2[k * 3 + 2] = l.z;
    const c = rainColor(sampleRadar(R.sri, lon, lat).v);
    if (c) { col.set([...c, 0.6], k * 4); any = true; }
  }
  if (any) {
    geo.setAttribute('position', new THREE.BufferAttribute(p2, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    // solo i triangoli con pioggia: la copia intera del terreno dimezzerebbe la fluidità
    const idx = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v = j * (nx + 1) + i, q = [v, v + nx + 1, v + 1, v + nx + 2];
      if (q.some(x => col[x * 4 + 3])) idx.push(v, v + nx + 1, v + 1, v + 1, v + nx + 1, v + nx + 2);
    }
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    m.renderOrder = 1; groups.radar.add(m);
  }
  // riflettività in quota (CAPPI_2, quota presunta 2000 m): solo in modalità esperto
  if (R.cappi && state.mode === 'expert') {
    const n = 100, posC = [], colC = [], idx = [], zFt = 2000 * FT;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const lon = a.lonMin + (a.lonMax - a.lonMin) * i / n, lat = a.latMax - (a.latMax - a.latMin) * j / n, l = P.toLocal(lon, lat);
      posC.push(l.x, yOf(zFt), l.z);
      const c = (terrain.elevFt(lon, lat) || 0) < zFt ? dbzColor(sampleRadar(R.cappi, lon, lat).v) : null;
      colC.push(...(c || [0, 0, 0]), c ? 0.45 : 0);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const q = j * (n + 1) + i; idx.push(q, q + n + 1, q + 1, q + 1, q + n + 1, q + n + 2); }
    if (colC.some((v, i) => i % 4 === 3 && v > 0)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(posC, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(colC, 4)); g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      m.renderOrder = 6; groups.radar.add(m);
    }
  }
  renderLegend(visibleAirspaces());
}
function radarPanel() {
  const R = state.radar;
  if (!R.sri) return R.err ? `<div class="warn warn"><b>Radar non disponibile</b>${esc(R.err)}</div>` : '';
  const t = new Date(R.sri.time), age = Math.round((Date.now() - R.sri.time) / 60000);
  return `<div class="box"><b>Radar Protezione Civile</b>: pioggia osservata alle ${t.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })}
    (<span class="${age > 20 ? 'old' : ''}">${age} min fa</span>)${R.cappi && state.mode === 'expert' ? '; in quota la riflettività CAPPI a circa 2000 m (quota non dichiarata dalla fonte)' : ''}.
    <p class="note">Il radar vede la pioggia, non le nubi senza pioggia. Fonte: Radar-DPC, Dipartimento della Protezione Civile (CC BY-SA 4.0).</p></div>`;
}

// ---------------------------------------------------------------- previsione 3D (ICON-2I)
async function loadForecast() {
  if (!state.area || state.fcBusy) return;
  state.fcBusy = true; state.fcErr = '';
  try {
    const grid = forecastGrid(state.area, 11);
    const r = await fetch(forecastUrl(grid, 12));
    if (!r.ok) throw new Error(`errore ${r.status}`);
    setForecastData(parseOpenMeteo(await r.json(), grid));
  } catch (e) {
    state.fcErr = navigator.onLine === false ? 'Nessuna connessione.' : 'Il servizio di previsione non è raggiungibile da qui (nell’app Android funziona).';
  }
  state.fcBusy = false;
  buildForecast(); refresh();
}
function setForecastData(fc) {
  state.fc = fc; state.fc.fetched = Date.now();
  // orario della previsione: il più vicino all'ora attuale
  const now = Date.now();
  state.fcTi = fc.times.reduce((best, t, i) => (Math.abs(t - now) < Math.abs(fc.times[best] - now) ? i : best), 0);
}
const fcColorWind = kt => (kt < 10 ? '#1f8a4c' : kt < 20 ? '#b88a00' : kt < 30 ? '#d9620b' : '#c8102e');
function buildForecast() {
  groups.fc.clear();
  const fc = state.fc, P = state.proj, a = state.area;
  if (!fc || !P || !state.wxShow) return;
  const ti = state.fcTi, cr = cruise(), L = state.fcLayers;
  // dimensione della cella della griglia, in km
  const dLon = (a.lonMax - a.lonMin) / (fc.n - 1), dLat = (a.latMax - a.latMin) / (fc.n - 1);
  const c0 = P.toLocal(a.lonMin, a.latMin), c1 = P.toLocal(a.lonMin + dLon, a.latMin + dLat);
  const cw = Math.abs(c1.x - c0.x), ch = Math.abs(c1.z - c0.z);
  const showTopFt = Math.max(cr + 3000, airCeilFt() === Infinity ? 15000 : airCeilFt());
  const rain = [[], [], []];
  const dummy = new THREE.Object3D();
  fc.pts.forEach((p, i) => {
    if (p.lon < a.lonMin - 1e-6 || p.lon > a.lonMax + 1e-6 || p.lat < a.latMin - 1e-6 || p.lat > a.latMax + 1e-6) return;
    const col = columnAt(fc, i, ti), l = P.toLocal(p.lon, p.lat);
    if (L.rain && col.precip >= 0.1) {
      const base = col.levels.find(lv => lv.cloud >= 50);
      const topM = base ? base.botM : col.elevM + 1500;
      const k = col.precip >= 4 ? 2 : col.precip >= 1 ? 1 : 0;
      // la colonna parte dal terreno vero del punto (il modello meteo ha un rilievo più liscio, più basso sulle cime e
      // più alto nelle valli) e arriva alla base delle nubi, sempre almeno 200 m sopra il terreno
      const gM = Number.isFinite(terrain.elevM(p.lon, p.lat)) ? terrain.elevM(p.lon, p.lat) : col.elevM;
      rain[k].push({ x: l.x, z: l.z, y0: yOf(gM * FT), y1: yOf(Math.max(topM, gM + 200) * FT) });
    }
    if (L.wind && i % 2 === 0 && Math.floor(i / fc.n) % 2 === 0) {
      const w = windAtAlt(col, cr);
      if (w && w.kt >= 1) {
        const to = (w.dir + 180) * Math.PI / 180, len = Math.min(9, 1 + w.kt / 3), y = yOf(cr);
        const tip = new THREE.Vector3(l.x + Math.sin(to) * len / 2, y, l.z - Math.cos(to) * len / 2), tail = new THREE.Vector3(l.x - Math.sin(to) * len / 2, y, l.z + Math.cos(to) * len / 2);
        const pts = [tail, tip, tip, new THREE.Vector3(tip.x - Math.sin(to - 0.45) * 1.4, y, tip.z + Math.cos(to - 0.45) * 1.4),
          tip, new THREE.Vector3(tip.x - Math.sin(to + 0.45) * 1.4, y, tip.z + Math.cos(to + 0.45) * 1.4)];
        groups.fc.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: fcColorWind(w.kt) })));
        if (state.mode === 'expert') { const lab = makeLabel(`${Math.round(w.kt)} kt`, fcColorWind(w.kt), 0.75); lab.position.set(tail.x, y + 0.6, tail.z); groups.fc.add(lab); }
      }
    }
  });
  // nubi: per ogni livello due superfici (base e sommità dello strato) con trasparenza proporzionale alla copertura
  if (L.cloud) {
    const n = fc.n, cols = fc.pts.map((_, i) => columnAt(fc, i, ti));
    for (const hPa of [1000, 925, 850, 700, 500]) {
      for (const edge of ['botM', 'topM']) {
        const pos = [], colr = [];
        let any = false;
        fc.pts.forEach((p, i) => {
          const lv = cols[i].levels.find(x => x.hPa === hPa), l = P.toLocal(p.lon, p.lat);
          // Strati tutti sopra la quota di crociera: solo la base, più tenue (guardando dall'alto coprirebbero tutto).
          // Carta 2D: solo lo strato alla quota di crociera.
          const above = lv && lv.botM * FT > cr, atCruise = lv && cr >= lv.botM * FT && cr < lv.topM * FT;
          const show = lv && lv.cloud >= 20 && lv.botM * FT <= showTopFt && !(above && edge === 'topM') && (state.dim !== '2d' || atCruise);
          const zFt = lv ? Math.min(lv[edge] * FT, showTopFt) : cols[i].elevM * FT;
          pos.push(l.x, yOf(zFt), l.z);
          const al = show ? Math.min(1, (lv.cloud - 15) / 85) * (above ? 0.22 : 0.5) : 0;
          if (al > 0) any = true;
          colr.push(0.93, 0.95, 0.97, al);
        });
        if (!any) continue;
        const idx = [];
        for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const q = j * n + i; idx.push(q, q + 1, q + n, q + 1, q + n + 1, q + n); }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 4));
        geo.setIndex(idx);
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        m.renderOrder = 6; groups.fc.add(m);
      }
    }
  }
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  rain.forEach((list, k) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(cyl, new THREE.MeshBasicMaterial({ color: ['#67d4dd', '#0ea5b7', '#0b6b78'][k], transparent: true, opacity: 0.35, depthWrite: false }), list.length);
    list.forEach((c, j) => { dummy.position.set(c.x, (c.y0 + c.y1) / 2, c.z); dummy.scale.set(Math.min(cw, ch) * 0.5, c.y1 - c.y0, Math.min(cw, ch) * 0.5); dummy.updateMatrix(); m.setMatrixAt(j, dummy.matrix); });
    m.renderOrder = 5; groups.fc.add(m);
  });
  renderLegend(visibleAirspaces());
}
function forecastPanel() {
  const fc = state.fc;
  if (!fc) return state.fcErr ? `<div class="warn warn"><b>Previsione non disponibile</b>${esc(state.fcErr)}</div>` : '';
  const loc = t => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
  const opts = fc.times.map((t, i) => `<option value="${i}" ${i === state.fcTi ? 'selected' : ''}>${loc(t)} (${new Date(t).toISOString().slice(11, 16)} UTC)</option>`).join('');
  // vento alla quota di crociera su ogni tratto (punto di griglia più vicino al centro del tratto)
  const legs = [];
  for (let k = 0; k < state.route.length - 1; k++) {
    const A = state.route[k], B = state.route[k + 1], mid = { lon: (A.lon + B.lon) / 2, lat: (A.lat + B.lat) / 2 };
    const w = windAtAlt(columnAt(fc, nearestPoint(fc, mid.lon, mid.lat).i, state.fcTi), cruise());
    if (!w) continue;
    const c = windComponents(bearingDeg(A, B), w);
    legs.push(`<div>${esc(A.name || `P${k + 1}`)} → ${esc(B.name || `P${k + 2}`)}: <b>${String(Math.round(w.dir)).padStart(3, '0')}°/${Math.round(w.kt)} kt</b> · ${c.head >= 0 ? `contrario ${Math.round(c.head)} kt` : `in coda ${Math.round(-c.head)} kt`} · traverso ${Math.round(Math.abs(c.cross))} kt da ${c.cross >= 0 ? 'destra' : 'sinistra'}</div>`);
  }
  const chk = (k, t) => `<label style="display:flex;align-items:center;gap:6px"><input type="checkbox" data-fcl="${k}" ${state.fcLayers[k] ? 'checked' : ''}> ${t}</label>`;
  return `<div class="box"><b>Previsione ICON-2I</b> (ItaliaMeteo, 2,2 km)
      <label class="field">Ora <select id="fcTime">${opts}</select></label>
      <div class="row">${chk('cloud', 'nubi')}${chk('rain', 'pioggia')}${chk('wind', 'vento alla tua quota')}</div>
      ${legs.length ? `<div class="note" style="margin-top:6px">Vento previsto a ${cruise()} ft:</div>${legs.join('')}` : ''}
      ${state.alt ? `<div style="margin-top:6px">Altimetro: a ${cruise()} ft indicati con QNH ${qnh()} la quota vera prevista è <b>${Math.round((cruise() + state.alt.totalErrFt) / 10) * 10} ft</b>
        (${state.alt.totalErrFt >= 0 ? '+' : '−'}${Math.round(Math.abs(state.alt.totalErrFt))} ft). QNH stimato dal modello: ${state.alt.modelQnh.toFixed(0)} hPa.</div>` : ''}
      <p class="note">Nubi e vento sono valori medi del modello su celle di circa 10 km e su 5 livelli di pressione: indicano dove aspettarsi nubi, non la posizione di una singola nube. È una previsione: confrontala con METAR e osservazioni. Livelli sotto il terreno esclusi.
      Dati: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a> (CC BY 4.0), modello ICON-2I di ItaliaMeteo-ARPAE.</p></div>`;
}

const LS_WX = 'airplanning.meteo';
function cachedWeather() { try { const c = JSON.parse(localStorage.getItem(LS_WX) || 'null'); return c && Array.isArray(c.raw) && Date.now() - c.at < 36 * 3600e3 ? c : null; } catch { return null; } }
function agoText(t) { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `di ${m} min fa` : m < 48 * 60 ? `di ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min fa` : `del ${new Date(t).toLocaleDateString('it-IT')}`; }
async function loadWeather() {
  if (!state.area || state.wxBusy) return;
  loadForecast(); loadRadar();
  state.wxBusy = true; state.wxErr = ''; renderWeather();
  try {
    state.wx = await fetchWeather(state.area);
    // copia per l'uso senza rete: METAR e TAF grezzi, riletti all'ora attuale (età e validità ricalcolate)
    try { localStorage.setItem(LS_WX, JSON.stringify({ at: state.wx.fetched, raw: state.wx.raw })); } catch { /* memoria piena */ }
    delete state.wx.raw;
  }
  catch (e) {
    state.wxErr = navigator.onLine === false ? 'Nessuna connessione.'
      : 'Il servizio meteo non è raggiungibile da qui. Nell’app Android funziona; in questa pagina di prova il browser blocca le richieste verso altri siti.';
    const c = cachedWeather();
    if (c && !state.wx) {
      state.wx = { stations: parseMetarsFor(c.raw, Date.now()), sigmets: [], fetched: c.at, cached: true };
      state.wxErr += ` Uso il meteo salvato ${agoText(c.at)}: i METAR più vecchi di 90 minuti non valgono e non entrano nei controlli; i TAF valgono solo per il periodo che coprono. Nessun SIGMET.`;
    }
  }
  state.wxBusy = false;
  buildWeather(); refresh();
}
const wxColor = s => CAT_COL[s.cat] || '#666';
function buildWeather() {
  groups.wx.clear();
  const w = state.wx, a = state.area, P = state.proj;
  if (!w || !P || !state.wxShow) return;
  const now = Date.now();
  for (const s of w.stations) {
    if (s.lon < a.lonMin || s.lon > a.lonMax || s.lat < a.latMin || s.lat > a.latMax) continue; // fuori dalla carta: solo nell'elenco
    const l = P.toLocal(s.lon, s.lat), g = Number.isFinite(s.elevFt) ? s.elevFt : terrain.elevFt(s.lon, s.lat) || 0, col = new THREE.Color(wxColor(s));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, yOf(2500), 10), new THREE.MeshBasicMaterial({ color: col }));
    pole.position.set(l.x, yOf(g) + yOf(2500) / 2, l.z); groups.wx.add(pole);
    // strati di nubi: dischi di 8 km di raggio alla base riportata. Il METAR descrive solo i dintorni dell'aeroporto.
    for (const c of s.cloudsAmsl) {
      const op = { FEW: 0.18, SCT: 0.32, BKN: 0.55, OVC: 0.75, OVX: 0.75 }[c.cover] ?? 0.3;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(8, 48), new THREE.MeshBasicMaterial({ color: '#f4f6f8', transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.set(l.x, yOf(c.baseAmsl), l.z); disc.renderOrder = 4; groups.wx.add(disc);
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([...Array(48).keys()].map(k => new THREE.Vector3(l.x + 8 * Math.cos(k / 48 * 2 * Math.PI), yOf(c.baseAmsl), l.z + 8 * Math.sin(k / 48 * 2 * Math.PI)))),
        new THREE.LineBasicMaterial({ color: '#7d8a96' }));
      groups.wx.add(ring);
    }
    // vento: freccia verso dove soffia, lunga 1 km ogni 2 nodi
    if (Number.isFinite(s.wdir) && s.wspd > 0) {
      const to = (s.wdir + 180) * Math.PI / 180, len = Math.min(12, s.wspd / 2), y = yOf(g) + yOf(2500);
      const tip = new THREE.Vector3(l.x + Math.sin(to) * len, y, l.z - Math.cos(to) * len);
      const pts = [new THREE.Vector3(l.x, y, l.z), tip,
        tip, new THREE.Vector3(tip.x - Math.sin(to - 0.5) * 1.2, y, tip.z + Math.cos(to - 0.5) * 1.2),
        tip, new THREE.Vector3(tip.x - Math.sin(to + 0.5) * 1.2, y, tip.z + Math.cos(to + 0.5) * 1.2)];
      groups.wx.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#1b3a5c' })));
    }
    const lab = makeLabel(`${s.id} ${s.cat} · Q${s.qnh} · ${Math.round(s.ageMin)}′`, wxColor(s), 0.9);
    lab.position.set(l.x, yOf(g) + yOf(2500) + 1, l.z); groups.wx.add(lab);
  }
  // SIGMET in corso: volumi rossi dalla base alla sommità (tagliati al limite della carta)
  for (const g of w.sigmets) {
    if (now < g.from || now > g.to) continue;
    const c = clipRing(g.ring, a);
    if (c.length < 3) continue;
    const loc = c.map(p => P.toLocal(p[0], p[1])), y0 = yOf(g.baseFt), y1 = yOf(Math.min(g.topFt, 15000)), pos = [];
    for (let i = 0; i < loc.length; i++) { const A = loc[i], B = loc[(i + 1) % loc.length]; pos.push(A.x, y0, A.z, B.x, y0, B.z, B.x, y1, B.z, A.x, y0, A.z, B.x, y1, B.z, A.x, y1, A.z); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    groups.wx.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#d0021b', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })));
    groups.wx.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(loc.map(p => new THREE.Vector3(p.x, y1, p.z))), new THREE.LineBasicMaterial({ color: '#d0021b' })));
  }
  renderLegend(visibleAirspaces());
}
function renderWeather() {
  const box = $('wx');
  if (!box) return;
  const w = state.wx, now = Date.now();
  const head = `<div class="row"><button class="btn" type="button" id="wxBtn" ${state.wxBusy ? 'disabled' : ''}>${state.wxBusy ? 'Scarico…' : w ? 'Aggiorna' : 'Scarica METAR e TAF'}</button>
    <label class="btn" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="wxShowTmp" ${state.wxShow ? 'checked' : ''}> sulla carta</label></div>`;
  if (!w) { box.innerHTML = head + radarPanel() + forecastPanel() + (state.wxErr ? `<div class="warn warn"><b>METAR non disponibili</b>${esc(state.wxErr)}</div>` : '<p class="note">Serve la connessione. Osservazioni: Aviation Weather Center (NOAA), che ridistribuisce i bollettini ufficiali.</p>'); bindWx(); return; }
  const ref = state.route[0] || state.fly.pos || { lon: (state.area.lonMin + state.area.lonMax) / 2, lat: (state.area.latMin + state.area.latMax) / 2 };
  const q = nearestQnh(w.stations, ref);
  const list = w.stations.map(s => ({ s, d: state.route.length > 1 ? distToRouteKm(s, state.route) : distM(ref, s) / 1000 })).sort((x, y) => x.d - y.d).slice(0, state.mode === 'beginner' ? 3 : 8);
  const fetched = new Date(w.fetched).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  box.innerHTML = head + radarPanel() + forecastPanel()
    + (state.wxErr ? `<div class="warn warn"><b>${w.cached ? 'Senza rete: meteo salvato' : 'Ultimo aggiornamento non riuscito'}</b>${esc(state.wxErr)}</div>` : '')
    + (q ? `<div class="box">QNH più vicino: <b>${q.qnh} hPa</b> a ${esc(q.station.id)} (${Math.round(q.distKm)} km, ${Math.round(q.station.ageMin)} min fa)
        ${Math.round(qnh()) !== q.qnh ? `<button class="btn" type="button" id="useQnh" style="margin-top:6px">Usa ${q.qnh}</button>` : ''}</div>` : '<div class="warn warn"><b>Nessun QNH recente</b>Chiedilo alla radio.</div>')
    + list.map(({ s, d }) => `<div class="wxs" style="border-color:${wxColor(s)}">
        <div><b>${esc(s.id)}</b> ${esc(s.name.split(',')[0])} · ${Math.round(d)} km · <span style="color:${wxColor(s)};font-weight:700">${esc(CAT_IT[s.cat] || s.cat)}</span>
        · <span class="${s.ageMin > 90 ? 'old' : ''}">${Math.round(s.ageMin)} min fa</span>${s.auto ? ' · automatico' : ''}${s.catMismatch ? ' · <b>categoria diversa dalla fonte</b>' : ''}</div>
        <code>${esc(s.raw)}</code>${s.rawTaf ? `<details><summary>TAF</summary><code>${esc(s.rawTaf).replace(/\b(TEMPO|BECMG|PROB\d0)\b/g, '<b>$1</b>')}</code></details>` : ''}</div>`).join('')
    + `<p class="note">${w.cached ? `Scaricato ${agoText(w.fetched)}. SIGMET non disponibili senza rete.` : `Aggiornato alle ${fetched}.`} ${w.cached ? '' : w.sigmets.length ? `SIGMET sulla zona: ${w.sigmets.map(g => HAZARD_IT[g.hazard] || g.hazard).join(', ')}.` : 'Nessun SIGMET per la zona in questa fonte.'}
       AIRMET e GAMET (previsioni per i voli a bassa quota) non sono in questa fonte: consultali su ENAV o Aeronautica Militare.
       Le nubi sulla carta valgono solo intorno all’aeroporto: tra le montagne il tempo può essere diverso.</p>`;
  bindWx();
}
function bindWx() {
  $('wxBtn')?.addEventListener('click', loadWeather);
  $('wxShowTmp')?.addEventListener('input', e => { state.wxShow = e.target.checked; buildWeather(); buildForecast(); buildRadar(); renderLegend(visibleAirspaces()); });
  $('fcTime')?.addEventListener('input', e => { state.fcTi = Number(e.target.value); buildForecast(); refresh(); });
  document.querySelectorAll('[data-fcl]').forEach(c => c.addEventListener('input', () => { state.fcLayers[c.dataset.fcl] = c.checked; buildForecast(); }));
  $('useQnh')?.addEventListener('click', () => { const q = nearestQnh(state.wx.stations, state.route[0] || state.fly.pos || state.wx.stations[0]); if (q) { ui.qnh.value = q.qnh; ui.qnh.dispatchEvent(new Event('input')); } });
}

function showFlyMsg(msg) { $('warnings').innerHTML = `<div class="warn warn"><b>Attenzione</b><span class="wt">${esc(msg)}</span></div>`; openRight(); }

// ---------------------------------------------------------------- ricostruzione e aggiornamenti
// Aggiornamenti raggruppati: più modifiche ravvicinate (per esempio cifre digitate) producono un solo ricalcolo
const pending = new Set(); let pendingT = 0;
function schedule(...what) {
  what.forEach(w => pending.add(w));
  clearTimeout(pendingT);
  pendingT = setTimeout(() => {
    const p = new Set(pending); pending.clear();
    if (p.has('terrain')) { buildTerrain(); buildBasemap(); buildRadar(); buildPlane(); buildWeather(); }
    if (p.has('limits')) computeAirspaceLimits();
    if (p.has('air') || p.has('terrain') || p.has('limits')) buildAirspaces();
    if (p.has('feat') || p.has('terrain')) buildFeatures();
    if (p.has('route') || p.has('terrain')) buildRoute();
    if (p.has('fc') || p.has('terrain')) buildForecast();
    if (p.has('refresh') || p.has('terrain') || p.has('limits')) refresh();
    else if (p.has('profile')) drawProfileNow();
  }, 90);
}
function setArea() {
  state.area = terrain.bounds();
  const a = state.area;
  state.proj = makeProjection({ lon: (a.lonMin + a.lonMax) / 2, lat: (a.latMin + a.latMax) / 2 });
}
function rebuildAll(resetCam) {
  setArea(); prepareAirspaces();
  if (resetCam) resetCamera();
  updateFocus(true); buildTerrain(); buildBasemap(); buildRadar(); buildAirspaces(); buildFeatures(); buildRoute(); buildPlane(); buildWeather(); buildForecast();
  refresh();
}
// ---------------------------------------------------------------- annulla l'ultima modifica della rotta
// La rotta si fotografa a ogni modifica conclusa (non durante un trascinamento o mentre si scrive): «Annulla»
// torna alla fotografia precedente. Fino a 50 passi.
const hist = { stack: [], cur: null };
const routeSig = () => JSON.stringify(state.route);
function recordHistory() {
  if (drag.wp !== null || drag.alt !== null || state.profDrag || editing($('wpList'))) return;
  const sig = routeSig();
  if (hist.cur === null) { hist.cur = sig; return; }
  if (sig === hist.cur) return;
  hist.stack.push(hist.cur); if (hist.stack.length > 50) hist.stack.shift();
  hist.cur = sig; updateUndo();
}
function updateUndo() {
  const n = hist.stack.length;
  for (const id of ['undoWp', 'mapUndo']) { const b = $(id); if (b) { b.disabled = !n; b.title = n ? `Annulla l'ultima modifica della rotta (${n})` : 'Niente da annullare'; } }
}
function undoRoute() {
  if (!hist.stack.length) return;
  const prev = hist.stack.pop();
  state.route = JSON.parse(prev); hist.cur = prev; state.routeDemo = false;
  state.selWp = state.selAlt = state.profSel = null;
  buildRoute(); buildForecast(); refresh(); updateUndo();
  $('hint').textContent = 'Ultima modifica annullata · ' + hintText();
}
function refresh() {
  if (applyClearance()) buildRoute();
  state.profile = planProfile();
  // selezioni non più valide (punto tolto, rotta cambiata)
  if (Number.isInteger(state.selWp) && state.selWp >= state.route.length) state.selWp = null;
  if (Number.isInteger(state.selAlt) && state.selAlt >= state.route.length - 1) state.selAlt = null;
  if (Number.isInteger(state.profSel) && state.profSel >= state.route.length) state.profSel = null;
  recordHistory();
  renderChips(); renderDay(); renderWaypoints(); renderInfo();
  ensureTerrainForRoute();
  state.analysis = analyseRoute({ route: state.route, cruiseFt: cruise(), pilot: ui.pilot.value, qnh: qnh(), airspaces: checkAirspaces(), terrain, day: day(), profile: state.profile });
  try { state.nav = planNav(); } catch { state.nav = null; }
  state.analysis.warnings.push(...daylightWarnings());
  if (state.profile) state.analysis.warnings.push(...runwayWindWarnings());
  state.analysis.warnings.unshift(...clearanceWarnings());
  if (state.radar.sri) state.analysis.warnings.push(...radarWarnings({ route: state.route, sri: state.radar.sri, cappi: state.radar.cappi }));
  if (state.feats) state.analysis.warnings.push(...featureWarnings({ route: state.route, cruiseFt: cruise(), pilot: ui.pilot.value, feats: state.feats }), ...fieldDoubtWarnings(state.route, state.feats));
  state.alt = state.fc ? altimetryCheck({ fc: state.fc, ti: state.fcTi, route: state.route, cruiseFt: cruise(), qnh: qnh() }) : null;
  if (state.alt) state.analysis.warnings.push(...state.alt.warnings);
  if (state.fc) state.analysis.warnings.push(...forecastWarnings({ fc: state.fc, ti: state.fcTi, route: state.route, cruiseFt: cruise() }));
  if (state.wx) state.analysis.warnings.push(...weatherWarnings({ route: state.route, stations: state.wx.stations, sigmets: state.wx.sigmets, cruiseFt: cruise() }));
  if (state.wx && state.minima.on) state.analysis.warnings.push(...personalMinimaWarnings());
  // età dei dati (ciclo AIRAC del giorno del volo) e NOTAM non caricati; spazi attraversati non modificati da anni
  const today = new Date().toISOString().slice(0, 10);
  state.analysis.warnings.push(...freshnessWarnings({ meta: state.packInfo?.meta, flightDate: ui.date.value, today, demo: state.airDemo || terrain.demo }));
  state.analysis.warnings.push(...staleAirspaceInfo([...new Set(state.analysis.warnings.map(w => w.airspace).filter(Boolean))], today));
  updateHighlight();
  // piano di volo calcolato sempre (anche fuori dalla sua scheda): il riepilogo e gli avvisi sul carburante si
  // aggiornano appena cambia un dato, per esempio il carburante a bordo
  try { state.planRes = state.route.length > 1 ? computePlan(navCtx()) : null; } catch { state.planRes = null; }
  if (state.view === 'navlog') {
    // stesso motivo dell'elenco dei punti: niente ridisegno mentre si compila un campo del piano
    if (editing($('navlog'))) state.nlPending = true;
    else { state.nlPending = false; state.nlChecks = renderNavlog($('navlog'), navCtx()).checks; }
    state.analysis.warnings.unshift(...(state.nlChecks || state.planRes?.checks || []).map(c => ({ ...c, kind: 'piano' })));
  } else if (state.planRes) {
    // nelle altre viste, solo i controlli sul carburante (gli altri del piano stanno nella sua scheda)
    state.analysis.warnings.unshift(...state.planRes.checks.filter(c => /carburante/i.test(c.title)).map(c => ({ ...c, kind: 'piano' })));
  }
  renderSummary(state.analysis); renderWarnings(state.analysis); renderWeather();
  drawProfileNow();
  if (state.view === 'radio') renderRadio();
  if (!(state.view === 'fly' && state.fly.pos)) setHazard(state.terrPlan && state.view !== 'fly', cruise());
}
// quota del nodo i nel profilo: quella della sua casella (il campo di partenza a terra, quello d'arrivo a quota di
// circuito sul campo). Se l'aereo non ci arriva col suo rateo, la linea passa sotto e il nodo resta alla sua quota.
function nodeAltFt(i, d) {
  const R = state.route, pr = state.profile, n = R.length;
  if (!pr) return cruise();
  if (i === 0 && pr.depGround) return pr.altAt(0);
  if (i === n - 1) return pr.arrGround ? pr.altAt(pr.total) : legAltFt(R, n - 2, cruise());
  return legAltFt(R, i, cruise());
}
function drawProfileNow() {
  if (!state.analysis) return;
  if (state.view === 'plan') {
    let acc = 0;
    const pr = state.profile, pd = state.profDrag;
    const ps = Number.isInteger(state.profSel) ? state.profSel : null;
    const marks = state.route.map((p, i) => { if (i) acc += distM(state.route[i - 1], p); const alt = nodeAltFt(i, acc), line = pr ? pr.altAt(acc) : alt; return { dist: acc, name: p.name || `P${i + 1}`, alt, line, short: alt - line > 60, drag: !!pd && pd.node === i, sel: !pd && ps === i }; });
    if (pr) for (const e of pr.events) marks.push({ dist: e.d, name: e.kind, alt: e.alt, small: true });
    // la linea della quota segue sempre il profilo attuale (anche durante il trascinamento, prima del ricalcolo completo)
    const S = pr && Math.abs(pr.total - state.analysis.total) < 1 ? state.analysis.samples.map(s => ({ ...s, alt: Math.round(pr.altAt(s.dist)) })) : state.analysis.samples;
    drawProfile(S, state.analysis.total, Math.max(cruise(), ...state.route.map(p => p.altFt || 0)), marks, { yMax: pd?.yMax, depField: !!pr?.depGround, arrField: !!pr?.arrGround });
  } else if (state.view === 'fly') drawAheadProfile();
}
// Quote dal profilo: ogni nodo è un punto della rotta alla quota della sua casella (la quota si raggiunge sul punto).
// Primo tocco su un nodo: lo seleziona (anello arancio, etichetta). Poi lo si trascina su o giù: si muove il nodo, le
// linee dritte verso i vicini e la casella della lista. Un tocco lontano dal nodo deseleziona. Il campo di partenza
// resta a terra (trascinandolo si cambia la quota da raggiungere dopo il decollo); il campo d'arrivo non si trascina.
function profileGeom() {
  const g = state.profGeom, R = state.route;
  if (!g || state.view !== 'plan' || R.length < 2 || !state.profile) return null;
  const X = d => g.L + (g.W - g.L - g.R) * d / g.total, Y = f => g.T + (g.H - g.T - g.B) * (1 - Math.max(0, Math.min(g.yMax, f)) / g.yMax);
  let acc = 0; const wpD = R.map((p, i) => (i ? (acc += distM(R[i - 1], p)) : 0));
  return { g, X, Y, wpD };
}
const nodeDraggable = i => !(i === state.route.length - 1 && state.profile?.arrGround);
function profileHit(e, lim = 30) {
  const G = profileGeom(); if (!G) return null;
  const r = pcv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let best = null;
  G.wpD.forEach((d, i) => { const dd = Math.hypot(G.X(d) - x, G.Y(nodeAltFt(i, d)) - y); if (dd < lim && (!best || dd < best.dd)) best = { dd, i }; });
  return best ? best.i : null;
}
pcv.addEventListener('pointerdown', e => {
  if (state.view !== 'plan') return;
  const hit = profileHit(e), sel = state.profSel;
  // si trascina solo il nodo già selezionato, toccandolo proprio (30 pixel): un tocco altrove non lo sposta mai
  const startDrag = Number.isInteger(sel) && hit === sel && nodeDraggable(sel);
  if (!startDrag) {
    if (hit === null) { if (Number.isInteger(sel)) { state.profSel = null; drawProfileNow(); } return; }
    e.preventDefault(); state.profSel = hit; if (navigator.vibrate) navigator.vibrate(15); drawProfileNow(); return;
  }
  e.preventDefault(); capturePtr(pcv, e);
  const g = state.profGeom, leg = Math.min(sel, state.route.length - 2), a0 = legAltFt(state.route, leg, cruise());
  state.profDrag = { node: sel, leg, y0: e.clientY, a0, v: a0, yMax: g.yMax, ftPerPx: g.yMax / (g.H - g.T - g.B), raf: 0, pid: e.pointerId, moved: false };
  drawProfileNow();
});
// casella della quota nella lista aggiornata mentre si trascina (carta o profilo)
function liveAltBox(i, v) { const el = $('wpList').querySelector(`[data-alt="${i}"]`); if (el && document.activeElement !== el) el.value = v; }
pcv.addEventListener('pointermove', e => {
  const pd = state.profDrag;
  if (!pd) { const h = profileHit(e); pcv.style.cursor = (Number.isInteger(state.profSel) && h === state.profSel) ? 'ns-resize' : h === null ? '' : 'pointer'; return; }
  if (e.pointerId !== pd.pid) return;
  if (!pd.moved && Math.abs(e.clientY - pd.y0) < 5) return;
  pd.moved = true;
  const m = nodeMin(pd.leg), min = Math.max(500, m ? m.minFt : 500);
  const v = Math.min(19500, Math.max(min, Math.round((pd.a0 + (pd.y0 - e.clientY) * pd.ftPerPx) / 100) * 100));
  if (v === pd.v && state.route[pd.leg].altFt === v) return;
  pd.v = v; pd.atMin = v === min && !!m; state.route[pd.leg].altFt = v; delete state.route[pd.leg].autoRaised;
  liveAltBox(pd.leg, v);
  state.profile = planProfile(); drawProfileNow();
  if (!pd.raf) pd.raf = requestAnimationFrame(() => { pd.raf = 0; buildRoute(); });
});
const endProfDrag = e => {
  if (!state.profDrag || (e && e.pointerId !== state.profDrag.pid)) return;
  state.profDrag = null; pcv.style.cursor = '';
  buildRoute(); buildForecast(); refresh();
};
pcv.addEventListener('pointerup', endProfDrag);
pcv.addEventListener('pointercancel', endProfDrag);

// Vento sulle piste di partenza e arrivo dal METAR più vicino (entro 25 km, al massimo 90 minuti), raffica compresa
function fieldWind(f) {
  if (!state.wx || !f) return null;
  const s = state.wx.stations.filter(x => x.ageMin <= 90 && Number.isFinite(x.wspd)).map(x => ({ x, d: distM(x, f) })).sort((a, b) => a.d - b.d)[0];
  if (!s || s.d > 25000 || s.x.wdir === 'VRB' || !Number.isFinite(Number(s.x.wdir))) return null;
  return { dir: Number(s.x.wdir), kt: Math.max(s.x.wspd, s.x.wgst || 0), src: `METAR ${s.x.id}` };
}
// Minimi personali: partenza all'ora del piano di volo (o adesso), arrivo dopo il tempo della rotta
function personalMinimaWarnings() {
  const pr = state.profile, t = routeTimeMin(), dep = Number.isFinite(takeoffMs()) ? takeoffMs() : Date.now();
  const mins = { ...state.minima, xwindKt: Number.isFinite(state.minima.xwindKt) ? state.minima.xwindKt : currentAircraft().crosswindKt };
  const R = state.route;
  return minimaWarnings({ route: R, stations: state.wx.stations, minima: mins, depMs: dep, arrMs: t ? dep + t * 60000 : NaN,
    rwys: p => ((p === R[0] ? pr?.depField : pr?.arrField)?.rwy || []) });
}
function runwayWindWarnings() {
  const pr = state.profile, ac = currentAircraft(), out = [];
  for (const [where, f] of [['partenza', pr.depField], ['arrivo', pr.arrField]]) {
    const w = fieldWind(f);
    if (!w) continue;
    const rw = runwayWind(w.dir, w.kt, f.rwyInfo || []);
    out.push(...crosswindChecks(`${where} (${f.icao || f.name}, ${w.src})`, rw, ac.crosswindKt));
  }
  return out;
}

// Contesto per la vista «Piano di volo»: solo dati e funzioni, i calcoli sono in navlog.js
function navCtx() {
  const fc = state.fc;
  const col = (lon, lat) => columnAt(fc, nearestPoint(fc, lon, lat).i, state.fcTi);
  const fcTime = () => new Date(fc.times[state.fcTi]).toISOString().slice(11, 13);
  return {
    nl: state.nl, esc, terrain, dist: distM, printRoot: $('printForm'),
    route: () => state.route.map((p, i) => ({ ...p, name: p.name || `P${i + 1}` })),
    date: () => ui.date.value, cruise, qnh,
    fields: () => (state.feats ? state.feats.airports.filter(a => ['aeroporto', 'aviosuperficie'].includes(aerodromeKind(a))) : []),
    fieldAt: p => fieldAt(state.feats, p),
    declGrid: () => state.decl,
    windAt: fc ? (lon, lat, alt) => { const w = windAtAlt(col(lon, lat), alt); return w && { ...w, src: `ICON-2I ${fcTime()} UTC` }; } : null,
    oatAt: fc ? (lon, lat, alt) => {
      const lv = col(lon, lat).levels.filter(l => Number.isFinite(l.tC)), z = alt / FT;
      if (!lv.length) return null;
      if (z <= lv[0].zM) return lv[0].tC;
      for (let k = 0; k < lv.length - 1; k++) if (z <= lv[k + 1].zM) return lv[k].tC + (z - lv[k].zM) / (lv[k + 1].zM - lv[k].zM) * (lv[k + 1].tC - lv[k].tC);
      return lv.at(-1).tC;
    } : null,
    wxNear: p => {
      if (!state.wx) return null;
      const s = state.wx.stations.filter(x => x.ageMin <= 90).map(x => ({ x, d: distM(x, p) })).sort((a, b) => a.d - b.d)[0];
      if (!s || s.d > 25000) return null;   // oltre 25 km un METAR non descrive il campo (come negli avvisi meteo)
      const m = s.x, clouds = m.clouds.length ? m.clouds.map(c => `${c.cover}${String(Math.round(c.base / 100)).padStart(3, '0')}`).join(' ') : (/CAVOK/.test(m.raw) ? 'CAVOK' : 'NSC');
      return { wind: `${m.wdir === 'VRB' ? 'VRB' : String(m.wdir).padStart(3, '0')}/${m.wspd} kt${m.wgst ? ' G' + m.wgst : ''}`, clouds, qnh: String(m.qnh), temp: `${m.temp} °C`,
        src: `METAR ${m.id} di ${Math.round(m.ageMin)} min fa, a ${Math.round(s.d / 1000)} km` };
    },
    download: (name, text, mime) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); },
    setLegAlt: (i, v) => { const n = parseInt(v, 10); if (state.route[i]) { if (Number.isFinite(n) && n > 0) state.route[i].altFt = n; else delete state.route[i].altFt; buildRoute(); } },
    setRoute: (pts, cruiseFt) => { state.route = pts.map(p => ({ lon: p.lon, lat: p.lat, name: p.name, ...(Number.isFinite(p.altFt) ? { altFt: p.altFt } : {}) })); state.routeDemo = false; if (cruiseFt) ui.cruise.value = cruiseFt; buildRoute(); refresh(); },
    error: m => $('navlog').insertAdjacentHTML('afterbegin', `<div class="warn crit"><b>Errore</b>${esc(m)}</div>`),
    changed: () => { buildRoute(); refresh(); },
  };
}
function updateHighlight() {
  const key = [...relevantAirspaces()].map(a => a.id).sort().join('|');
  if (key !== state.hitKey) { state.hitKey = key; buildAirspaces(); }
}
// Vista iniziale sul pacchetto grande: la zona dell'Aeroclub dei Marsi (Avezzano), se è nell'area
const HOME = { lon: 13.43, lat: 42.03 };
function resetCamera() {
  const a = state.area, P = state.proj, sw = P.toLocal(a.lonMin, a.latMin), ne = P.toLocal(a.lonMax, a.latMax);
  const span = Math.min(80, Math.max(ne.x - sw.x, sw.z - ne.z));
  let cx = 0, cz = 0;
  if (state.route.length) { state.route.forEach(p => { const l = P.toLocal(p.lon, p.lat); cx += l.x; cz += l.z; }); cx /= state.route.length; cz /= state.route.length; }
  else if (a.lonMin < HOME.lon && a.lonMax > HOME.lon && a.latMin < HOME.lat && a.latMax > HOME.lat && (a.lonMax - a.lonMin) > 1.5) { const l = P.toLocal(HOME.lon, HOME.lat); cx = l.x; cz = l.z; }
  camera.position.set(cx - span * 0.1, span * 0.62, cz + span * 1.0);
  controls.target.set(cx, yOf(3000), cz);
  camera.far = Math.max(400, span * 8); camera.updateProjectionMatrix();
  fogObj.near = span * 1.2; fogObj.far = span * 3;
  orthoHalf = span * 0.55; ortho.zoom = 1;
  if (state.dim === '2d') { ortho.position.set(cx, 600, cz + 0.06); controls.target.set(cx, 0, cz); setOrthoFrustum(); }
  controls.update(); dirty = true;
}

// ---------------------------------------------------------------- dati: pacchetto regionale, file, dimostrazione
function demoAirspaces() {
  const src = 'Dimostrativo (inventato)';
  const circle = (lon, lat, r) => { const pts = []; for (let k = 0; k <= 72; k++) pts.push(destPoint([lon, lat], k * 5, r)); return pts; };
  const L = (value, unit, ref) => ({ value, unit, ref });
  return [
    { id: 'd1', name: 'DEMO CTR', cls: 'D', type: 'CTR', lower: L(0, 'FT', 'GND'), upper: L(3000, 'FT', 'MSL'), rings: [circle(13.45, 42.02, 5)] },
    { id: 'd2', name: 'DEMO TMA', cls: 'C', type: 'TMA', lower: L(4500, 'FT', 'MSL'), upper: L(105, 'FL', 'STD'), rings: [[[13.2, 41.85], [13.75, 41.85], [13.8, 42.15], [13.25, 42.2], [13.2, 41.85]]] },
    { id: 'd3', name: 'DEMO R1', cls: '', type: 'R', lower: L(0, 'FT', 'GND'), upper: L(2000, 'FT', 'GND'), rings: [[[13.66, 42.05], [13.78, 42.05], [13.78, 42.13], [13.66, 42.13], [13.66, 42.05]]] },
  ].map(a => ({ ...a, typeCode: null, freqs: [], remarks: '', transponder: [], updatedAt: '', source: src }));
}
function loadDemo() {
  stopFly();
  terrain.setDemo();
  state.airspaces = demoAirspaces(); state.airDemo = true; state.airSource = 'dimostrativi (inventati)'; state.attribution = [];
  state.route = [{ lon: 13.10, lat: 42.04, name: 'Partenza' }, { lon: 13.45, lat: 42.06, name: 'Centro' }, { lon: 13.75, lat: 42.07, name: 'Arrivo' }];
  state.routeDemo = true; state.selected = null; ui.cruise.value = 4000;
  rebuildAll(true);
}
// Pacchetti: «centro» (Italia centrale, terreno a tessere dal ramo «pacchetti») oppure «marsica» (tutto in un file)
async function loadPack(dir = './data/centro/') {
  const J = async f => { const r = await fetch(dir + f); if (!r.ok) throw new Error(`${dir}${f}: ${r.status}`); return r.json(); };
  const meta = await J('pack.json');
  const region = meta.region ? await J(meta.region.file) : null;
  const gj = await J(meta.airspaces.file);
  const feats = meta.features ? await J(meta.features.file).catch(() => null) : null;
  const decl = meta.declination ? await J(meta.declination.file).catch(() => null) : null;
  const geoid = meta.geoid ? await J(meta.geoid.file).catch(() => null) : null;
  let grids = [], tiles = null, basemap = null, attrib;
  if (region) {
    const T = region.terrain, ov = T.overview;
    grids.push(gridFromPack({ ...ov, source: T.source, blockMax: true }, await decodePackGrid(await J(ov.file), ov.w, ov.h)));
    tiles = { recs: T.tiles, load: async rec => gridFromPack({ ...rec, source: T.source, blockMax: true }, await decodePackGrid(await J(rec.file), rec.w, rec.h)) };
    basemap = region.basemap ? await J(region.basemap.file).catch(() => null) : null;
    attrib = [`Terreno: ${T.attribution}`, ...(basemap ? [region.basemap.attribution] : [])];
    state.packInfo = { name: meta.name, created: region.created, peaks: T.peaks, sea: T.sea, tiles: T.tiles.length };
  } else {
    const t = meta.terrain;
    // pacchetto in un solo file: anche questo è «massimo per blocco» (tools/make_pack.py)
    grids.push(gridFromPack({ ...t, blockMax: true }, await decodePackGrid(await J(t.file), t.w, t.h)));
    attrib = [`Terreno: ${t.attribution}`];
    state.packInfo = { name: meta.name, created: meta.created };
  }
  stopFly();
  terrain.setDemo();
  grids.forEach(g => terrain.add(g));
  if (tiles) { terrain.setTiles(tiles.recs, tiles.load); terrain.regionBounds = meta.bounds; terrain.name = meta.name; }
  state.feats = feats; state.decl = decl; state.geoid = geoid; state.basemap = basemap;
  state.airspaces = fromGeojson(gj, `${meta.airspaces.source}, scaricato il ${meta.airspaces.downloaded}`);
  state.airDemo = false; state.airSource = `${meta.airspaces.source} ${meta.airspaces.downloaded}`;
  state.packInfo.meta = meta;
  state.attribution = [meta.airspaces.attribution, ...attrib, ...(meta.features ? [meta.features.attribution] : [])];
  if (state.routeDemo) { state.route = []; state.routeDemo = false; }
  state.selected = null; state.focus = null;
  rebuildAll(true);
  return meta;
}
const loadBestPack = () => loadPack('./data/centro/').catch(() => loadPack('./data/marsica/'));
async function handleFiles(files) {
  const errors = [];
  let gotDem = false, gotAir = false;
  for (const f of files) {
    try {
      if (/\.(hgt|tiff?)$/i.test(f.name)) {
        const g = /\.hgt$/i.test(f.name) ? parseHgt(f.name, await f.arrayBuffer()) : await parseTiff(f.name, await f.arrayBuffer(), window.GeoTIFF);
        terrain.add(g); gotDem = true;
      } else {
        const txt = await f.text(), src = `${f.name}, caricato il ${new Date().toLocaleString('it-IT')}`;
        const list = /^\s*\{/.test(txt) ? fromGeojson(JSON.parse(txt), src) : fromOpenAir(txt, src);
        if (!list.length) throw new Error(`In «${f.name}» non ho trovato spazi aerei leggibili.`);
        if (!gotAir) state.airspaces = [];
        state.airspaces.push(...list); gotAir = true;
      }
    } catch (e) { errors.push(e.message); }
  }
  if (gotDem && state.routeDemo) { state.route = []; state.routeDemo = false; }
  if (gotDem && state.airDemo && !gotAir) { state.airspaces = []; state.airDemo = false; state.airSource = 'nessun file'; }
  if (gotAir) { state.airDemo = false; state.airSource = [...new Set(files.filter(f => !/\.(hgt|tiff?)$/i.test(f.name)).map(f => f.name))].join(', '); }
  if (gotDem || gotAir) { state.selected = null; rebuildAll(gotDem); }
  if (errors.length) $('warnings').insertAdjacentHTML('afterbegin', errors.map(e => `<div class="warn crit"><b>File non caricato</b><span class="wt">${esc(e)}</span></div>`).join(''));
}

// ---------------------------------------------------------------- interazione
function setView(v) {
  state.view = v;
  if (v === 'fly') openRight();
  document.body.classList.remove('view-plan', 'view-fly', 'view-radio', 'view-navlog');
  document.body.classList.add(`view-${v}`);
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  if (v !== 'plan' && state.addMode) toggleAdd();
  if (v === 'fly' && !state.fly.follow) setFollow(true);   // entrando in «Volo» la carta torna sull'aereo
  setTimeout(() => { resize(); refresh(); if (v === 'fly') flyTick(); buildGlide(); renderNearest(); renderEmergency(); renderTimers(); renderChecks(); renderReview(); buildRoute(); }, 0);
}
// Pannelli sopra la carta: larghezza fissa, si chiudono e si riaprono; la carta non cambia dimensione e il suo
// centro resta nel mezzo dello spazio libero (spostamento della proiezione, come nei navigatori professionali).
function panels(cls, on) { document.body.classList.toggle(cls, on); state.panels[cls] = on; savePrefs(); resize(); schedule('profile'); }
const openRight = () => { if (document.body.classList.contains('right-closed')) panels('right-closed', false); };
$('closeLeft').addEventListener('click', () => panels('left-closed', true));
$('openLeft').addEventListener('click', () => panels('left-closed', false));
$('closeRight').addEventListener('click', () => panels('right-closed', true));
$('bubble').addEventListener('click', () => { const closed = document.body.classList.contains('right-closed'); panels('right-closed', !closed); if (closed) selectRTab('warn'); });
$('profToggle').addEventListener('click', () => { const c = !document.body.classList.contains('prof-closed'); panels('prof-closed', c); $('profToggle').textContent = c ? 'Profilo ▴' : 'Profilo ▾'; });
$('settingsBtn').addEventListener('click', () => document.body.classList.toggle('settings-open'));
$('closeSettings').addEventListener('click', () => document.body.classList.remove('settings-open'));
document.querySelector('.main').addEventListener('pointerdown', () => document.body.classList.remove('settings-open'));
function selectRTab(t) {
  document.querySelectorAll('[data-rtab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.rtab === t)));
  document.querySelectorAll('[data-rpane]').forEach(p => p.classList.toggle('on', p.dataset.rpane === t));
}
document.querySelectorAll('[data-rtab]').forEach(b => b.addEventListener('click', () => selectRTab(b.dataset.rtab)));
// zoom con i pulsanti, inquadratura della rotta, nord in alto
function zoomBy(f) {
  if (state.dim === '2d') { ortho.zoom = Math.max(0.05, Math.min(400, ortho.zoom / f)); ortho.updateProjectionMatrix(); }
  else { const d = new THREE.Vector3().subVectors(camera.position, controls.target).multiplyScalar(f); if (d.length() > 0.3 && d.length() < 1500) camera.position.copy(controls.target).add(d); }
  controls.update(); dirty = true;
}
$('zoomIn').addEventListener('click', () => zoomBy(0.7));
$('zoomOut').addEventListener('click', () => zoomBy(1 / 0.7));
function fitRoute(pts) {
  const R = Array.isArray(pts) && pts.length ? pts : state.route.length ? state.route : null;
  if (!R || !state.proj) { resetCamera(); return; }
  const P = state.proj, L = R.map(p => P.toLocal(p.lon, p.lat));
  // area libera dai pannelli: la rotta deve starci tutta, anche sul tablet in verticale
  const ins = visibleInsets(), w = Math.max(200, view.clientWidth - ins.l - ins.r), hh = Math.max(200, view.clientHeight - ins.b);
  const tanH = Math.tan(camera.fov * Math.PI / 360), m = 1.3;
  if (state.dim === '2d') {
    const x0 = Math.min(...L.map(l => l.x)), x1 = Math.max(...L.map(l => l.x)), z0 = Math.min(...L.map(l => l.z)), z1 = Math.max(...L.map(l => l.z));
    const c = P.fromLocal((x0 + x1) / 2, (z0 + z1) / 2); lookAt(c.lon, c.lat);
    // km per pixel necessari in larghezza e in altezza; la proiezione copre vp.fh pixel in verticale
    const kmPx = Math.max(4, (x1 - x0) * m) / w > Math.max(4, (z1 - z0) * m) / hh ? Math.max(4, (x1 - x0) * m) / w : Math.max(4, (z1 - z0) * m) / hh;
    ortho.zoom = (2 * orthoHalf) / (kmPx * vp.fh); ortho.updateProjectionMatrix();
  } else {
    // estensione della rotta nel riferimento della camera (destra sullo schermo e profondità), inclinazione 50°
    const d = new THREE.Vector3().subVectors(camera.position, controls.target), az = Math.atan2(d.x, d.z), pol = 50 * Math.PI / 180;
    const rx = Math.cos(az), rz = -Math.sin(az), fx = -Math.sin(az), fz = -Math.cos(az);
    const u = L.map(l => l.x * rx + l.z * rz), v = L.map(l => l.x * fx + l.z * fz);
    const u0 = Math.min(...u), u1 = Math.max(...u), v0 = Math.min(...v), v1 = Math.max(...v), cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    const c = P.fromLocal(cu * rx + cv * fx, cu * rz + cv * fz); lookAt(c.lon, c.lat);
    // distanza: la larghezza visibile a distanza r è 2·r·tan(fov/2)·(w/fh); la profondità appare ridotta di cos(50°)
    const rW = Math.max(6, (u1 - u0) * m) / (2 * tanH * (w / vp.fh)), rD = Math.max(6, (v1 - v0) * m) * Math.cos(pol) / (2 * tanH * (hh / vp.fh));
    const r = Math.max(rW, rD, 12);
    camera.position.set(controls.target.x + r * Math.sin(pol) * Math.sin(az), controls.target.y + r * Math.cos(pol), controls.target.z + r * Math.sin(pol) * Math.cos(az));
  }
  controls.update(); dirty = true;
}
$('ridgeBtn').addEventListener('click', () => {
  state.terrPlan = !state.terrPlan; $('ridgeBtn').setAttribute('aria-pressed', String(state.terrPlan));
  setHazard(state.terrPlan, cruise());
});
$('fitBtn').addEventListener('click', () => fitRoute(state.review?.samples));
$('recenterBtn').addEventListener('click', () => setFollow(true));
$('northBtn').addEventListener('click', () => {
  if (state.view === 'fly' && state.fly.pos && state.fly.follow) setFollow(false);
  if (state.dim === '2d') return;
  const d = new THREE.Vector3().subVectors(camera.position, controls.target), h = Math.hypot(d.x, d.z);
  camera.position.set(controls.target.x, camera.position.y, controls.target.z + h); controls.update(); dirty = true;
});
function setMode(m) {
  state.mode = m;
  document.body.classList.toggle('mode-beginner', m === 'beginner');
  document.body.classList.toggle('mode-expert', m === 'expert');
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  savePrefs();
  setTimeout(() => { buildAirspaces(); buildFeatures(); resize(); refresh(); }, 0);
}
function setTheme(t) {
  state.theme = t;
  // «Cabina» parte dai colori della notte (carta e simboli) e cambia l'aspetto di pannelli, tasti e strumenti
  document.body.classList.toggle('theme-night', t === 'night' || t === 'cockpit');
  document.body.classList.toggle('theme-cockpit', t === 'cockpit');
  for (const b of document.querySelectorAll('#themeSeg [data-theme]')) b.setAttribute('aria-pressed', String(b.dataset.theme === t));
  applySceneTheme(); savePrefs();
  buildRoute(); refresh();
}
function toggleAdd() {
  state.addMode = !state.addMode;
  $('addMode').classList.toggle('on', state.addMode);
  $('addMode').setAttribute('aria-pressed', String(state.addMode));
  $('addMode').innerHTML = state.addMode ? `${ic('check')}Fine inserimento` : `${ic('plus')}Aggiungi punti`;
  $('hint').textContent = hintText();
}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('themeSeg').addEventListener('click', e => { const t = e.target.closest('[data-theme]')?.dataset.theme; if (t) setTheme(t); });
$('addMode').addEventListener('click', toggleAdd);
$('addMode').innerHTML = `${ic('plus')}Aggiungi punti`;
$('aboutVer').textContent = `versione ${VERSION}`;
// Sostegno volontario: una voce piccola in fondo alle impostazioni, chiusa; nessun avviso, nessun richiamo altrove.
// Compare solo con un indirizzo PayPal valido (version.js). Il programma funziona allo stesso modo per tutti.
const SUPPORT_TEXT = 'AerIA VFR è gratuito ed è sviluppato nel tempo libero. Se ti è utile e ti fa piacere, puoi offrire un caffè: è un semplice grazie che aiuta a dedicare tempo al programma. Nessun obbligo: AerIA funziona allo stesso modo per tutti.';
if (/^https:\/\/(www\.)?(paypal\.me|paypal\.com)\//.test(DONATE_URL)) {
  $('supportText').textContent = SUPPORT_TEXT; $('supportLink').href = DONATE_URL; $('support').hidden = false;
}
// «Sostieni AerIA»: cuore nella barra in alto, a destra dell'ingranaggio; apre una finestra con PayPal, GitHub Sponsors
// (solo se il profilo è attivo, version.js) e la pagina del progetto. Nessun richiamo automatico: si apre solo a richiesta.
// fringuello79 di Avezzano
const SUPPORT_OK = /^https:\/\/(www\.)?(paypal\.me|paypal\.com)\//.test(DONATE_URL);
const SPONSOR_OK = /^https:\/\/github\.com\/sponsors\/[\w-]+$/.test(SPONSORS_URL);
if (SUPPORT_OK || SPONSOR_OK) {
  $('supportProject').href = PROJECT_URL;
  $('supportPaypal').href = DONATE_URL; $('supportPaypal').hidden = !SUPPORT_OK;
  $('supportSponsor').href = SPONSORS_URL; $('supportSponsor').hidden = !SPONSOR_OK;
  if (!SPONSOR_OK) $('supportPaypal').classList.add('primary');
  $('supportHow').textContent = `${SPONSOR_OK ? 'Puoi donare con GitHub Sponsors (una volta sola o ogni mese)' + (SUPPORT_OK ? ' oppure con PayPal' : '') : 'Puoi donare con PayPal'}: si apre il sito ufficiale nel browser, AerIA non vede né conserva i tuoi dati di pagamento. Anche una stella al progetto su GitHub aiuta a farlo conoscere.`;
  $('supportTop').hidden = false;
}
function supportDlg(open) {
  $('supportDlg').hidden = !open;
  if (open) $('supportDlg').querySelector('.xbtn').focus(); else $('supportTop').focus();
}
$('supportTop').addEventListener('click', () => supportDlg(true));
// chiude con «Chiudi», con la crocetta, toccando fuori dalla finestra o dopo aver aperto un collegamento
$('supportDlg').addEventListener('click', e => {
  if (e.target === e.currentTarget || e.target.closest('[data-s="close"]')) supportDlg(false);
  else if (e.target.closest('a[href^="https://"]')) setTimeout(() => supportDlg(false), 0);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('supportDlg').hidden) supportDlg(false); });
$('undoWp').addEventListener('click', undoRoute);
$('mapUndo').addEventListener('click', undoRoute);
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !editing(document.body)) { e.preventDefault(); undoRoute(); } });
$('clearWp').addEventListener('click', () => { state.route = []; state.selWp = state.selAlt = state.profSel = null; buildRoute(); refresh(); });
$('wpList').addEventListener('input', e => { const i = e.target.dataset.wp; if (i !== undefined) { state.route[i].name = e.target.value; schedule('route', ...(state.view !== 'plan' ? ['refresh'] : [])); } });
$('wpList').addEventListener('change', e => {
  const t = e.target;
  // quota a terra di partenza o arrivo: quella vera del campo (per esempio Celano 2260 ft); vuota = campo o terreno
  if (t.dataset.ground !== undefined) {
    const p = state.route[Number(t.dataset.ground)], v = parseInt(t.value, 10);
    if (Number.isFinite(v) && v > -100 && v < 15000) p.groundFt = v; else delete p.groundFt;
    buildRoute(); buildForecast(); refresh(); return;
  }
  if (t.matches('[data-air]')) { if (t.checked) state.route[0].airborne = true; else delete state.route[0].airborne; buildRoute(); buildForecast(); renderWaypoints(); refresh(); return; }
  const i = e.target.dataset.alt;
  // quota scritta: passi liberi, ma tra 500 e 19500 ft (come col trascinamento); vuota = quota di crociera
  if (i !== undefined) { const v = parseInt(e.target.value, 10); if (Number.isFinite(v) && v > 0) state.route[i].altFt = Math.min(19500, Math.max(500, v)); else delete state.route[i].altFt; buildRoute(); buildForecast(); }
  refresh();
});
$('wpList').addEventListener('focusout', () => setTimeout(() => { if (state.wpPending && !editing($('wpList'))) renderWaypoints(); }, 0));
$('navlog').addEventListener('focusout', () => setTimeout(() => { if (state.nlPending && !editing($('navlog'))) schedule('refresh'); }, 0));
// «Invio» sulla tastiera conferma la quota e chiude la tastiera
$('wpList').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
// al tocco sul campo della quota si seleziona tutto: si scrive subito la quota nuova senza cancellare
$('wpList').addEventListener('focusin', e => { const t = e.target; if (!t.matches('input.alt')) return; const v0 = t.value; t.select(); setTimeout(() => { if (t.value === v0) t.select(); }, 0); });
$('wpList').addEventListener('click', e => {
  const i = e.target.closest('[data-del]')?.dataset.del; if (i !== undefined) { state.route.splice(Number(i), 1); fixRouteFlags(); buildRoute(); refresh(); return; }
  const up = e.target.closest('[data-up]')?.dataset.up, dn = e.target.closest('[data-down]')?.dataset.down;
  if (up !== undefined || dn !== undefined) moveWp(Number(up ?? dn), up !== undefined ? -1 : 1);
});
// ordine dei punti: un punto scambia il posto con quello prima (−1) o dopo (+1). «Già in volo» resta alla partenza;
// la quota a terra scritta vale solo per partenza e arrivo.
function moveWp(i, dir) {
  const R = state.route, j = i + dir;
  if (j < 0 || j >= R.length) return;
  [R[i], R[j]] = [R[j], R[i]];
  fixRouteFlags();
  state.selWp = Number.isInteger(state.selWp) && state.selWp === i ? j : state.selWp; state.profSel = null;
  state.routeDemo = false;
  buildRoute(); buildForecast(); renderWaypoints(); refresh();
}
function fixRouteFlags() {
  const R = state.route; if (!R.length) return;
  const air = R.some(p => p.airborne); R.forEach(p => delete p.airborne); if (air) R[0].airborne = true;
}
[ui.cruise, ui.pilot, ui.date, ui.dayOverride].forEach(el => el.addEventListener('input', () => { schedule(...(state.airCeil === 'auto' ? ['air'] : []), 'feat', 'route', 'fc', 'refresh'); savePrefs(); }));
[ui.callsign, ui.acType].forEach(el => el.addEventListener('input', () => { savePrefs(); if (state.view === 'radio') renderRadio(); }));
$('glideMargin').value = String(state.glideMargin);
$('glideMargin').addEventListener('change', e => { state.glideMargin = Number(e.target.value) || 0; savePrefs(); buildGlide(); delete $('nearest').dataset.key; delete $('emerg').dataset.key; renderNearest(); renderEmergency(); });
[ui.qnh, ui.showFir].forEach(el => el.addEventListener('input', () => schedule('limits')));
ui.ceiling.innerHTML = ceilOptions();
ui.ceiling.addEventListener('change', () => setAirCeil(ui.ceiling.value));
ui.showLabels.addEventListener('input', () => { state.labelsTouched = true; groups.labels.children.forEach(l => { l.visible = l.userData.hot || ui.showLabels.checked; }); invalidate(); });
ui.exag.addEventListener('input', () => schedule('terrain'));
$('gpsBtn').addEventListener('click', startGps);
$('simBtn').addEventListener('click', startSim);
document.querySelectorAll('[data-dim]').forEach(b => b.addEventListener('click', () => setDim(b.dataset.dim)));
$('voiceBtn').addEventListener('click', () => {
  state.voice = !state.voice;
  $('voiceBtn').textContent = 'Voce'; $('voiceBtn').classList.toggle('on', !!state.voice); $('voiceBtn').title = state.voice ? 'Voce accesa: tocca per spegnerla' : 'Voce spenta: tocca per accenderla';
  $('voiceBtn').setAttribute('aria-pressed', String(state.voice)); $('voiceBtn').classList.toggle('on', state.voice);
  if (state.voice && 'speechSynthesis' in window) { const u = new SpeechSynthesisUtterance('Avvisi vocali attivi.'); u.lang = 'it-IT'; window.speechSynthesis.speak(u); }
});
const drop = $('drop'), fileIn = $('file');
drop.addEventListener('click', () => fileIn.click());
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
fileIn.addEventListener('change', () => { handleFiles([...fileIn.files]); fileIn.value = ''; });
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => handleFiles([...e.dataTransfer.files]));
$('demoBtn').addEventListener('click', loadDemo);
$('bleBtn').addEventListener('click', () => connectDevice('ble'));
$('usbBtn').addEventListener('click', () => connectDevice('usb'));
$('devDemoBtn').addEventListener('click', startDeviceDemo);
$('offSearch').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('offQ').value.trim();
  if (q) window.open(`https://www.google.com/search?q=${encodeURIComponent(`${q} (site:enav.it OR site:enac.gov.it)`)}`, '_blank', 'noopener');
});
$('packBtn').addEventListener('click', () => loadBestPack().catch(() => showFlyMsg('Pacchetto dati non trovato.')));

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let downAt = null;
const setRay = e => { const r = renderer.domElement.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(mouse, cam()); };
const groundAt = e => { setRay(e); const hit = ray.intersectObjects(terrainMeshes())[0]; return hit ? state.proj.fromLocal(hit.point.x, hit.point.z) : null; };
// aggancio a un campo o a un punto di riporto entro 1,2 km: posizione esatta e nome giusto
function snapPoint(ll) {
  const cand = state.feats ? [...state.feats.airports.filter(a => aerodromeKind(a) !== 'chiuso'), ...state.feats.reportingPoints] : [];
  let best = null;
  for (const c of cand) { const d = distM(c, ll); if (d < 1200 && (!best || d < best.d)) best = { c, d }; }
  return best ? { lon: best.c.lon, lat: best.c.lat, name: best.c.icao || best.c.name } : null;
}
// Posizione sullo schermo (pixel del client) di un punto della scena
function toScreen(v) {
  const q = v.clone().project(cam()), r = renderer.domElement.getBoundingClientRect();
  return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height, q.z < 1];
}
// Tratto della rotta sotto il dito (entro 16 pixel): trascinandolo si piega la rotta con un nuovo punto
function legNear(x, y) {
  const R = state.route, pr = state.profile;
  if (R.length < 2 || !pr || !state.proj) return null;
  const P = state.proj; let acc = 0, best = null;
  for (let i = 0; i < R.length - 1; i++) {
    const L = distM(R[i], R[i + 1]), pts = [];
    for (let k = 0; k <= 12; k++) { const d = acc + L * k / 12, q = routePointAt(d), l = P.toLocal(q.lon, q.lat); pts.push(toScreen(new THREE.Vector3(l.x, yOf(pr.altAt(d)), l.z))); }
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay, av] = pts[k], [bx, by, bv] = pts[k + 1];
      if (!av || !bv) continue;
      const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const dd = Math.hypot(ax + t * dx - x, ay + t * dy - y);
      if (dd < 16 && (!best || dd < best.dd)) best = { dd, leg: i };
    }
    acc += L;
  }
  return best ? best.leg : null;
}
// Trascinamento: il cerchio di un punto lo sposta (2D e 3D); la maniglia blu cambia la quota del tratto (3D);
// trascinare la linea della rotta piega il tratto con un nuovo punto; un punto lasciato sul cestino viene tolto.
// cattura del dito sull'elemento: se il browser la rifiuta (dito già sollevato) si continua senza
const capturePtr = (el, e) => { try { el.setPointerCapture?.(e.pointerId); } catch { /* niente cattura */ } };
const drag = { wp: null, alt: null, y0: 0, a0: 0, raf: 0, moved: false, pendingLeg: null, inserted: false, pid: null, orig: null, g0: null, p0: null };
const dragging = () => drag.wp !== null || drag.alt !== null || drag.pendingLeg !== null;
// un secondo dito durante il trascinamento (zoom, rotazione): il trascinamento si annulla e il punto torna dov'era.
// Prima il punto «saltava» sotto il secondo dito, perché si leggevano i movimenti di tutte le dita.
function cancelDrag() {
  if (drag.wp !== null && drag.orig) { if (drag.inserted) state.route.splice(drag.wp, 1); else Object.assign(state.route[drag.wp], drag.orig); }
  if (drag.alt !== null && drag.orig) { if (Number.isFinite(drag.orig.altFt)) state.route[drag.alt].altFt = drag.orig.altFt; else delete state.route[drag.alt].altFt; }
  Object.assign(drag, { wp: null, alt: null, pendingLeg: null, inserted: false, pid: null, orig: null, moved: false });
  controls.enabled = true; $('trash').classList.remove('on', 'hot'); $('hint').textContent = hintText();
  buildRoute(); refresh();
}
const press = { t: 0, x: 0, y: 0 };
const cancelPress = () => { clearTimeout(press.t); press.t = 0; };
renderer.domElement.addEventListener('pointerdown', e => {
  if (dragging() && drag.pid !== null && e.pointerId !== drag.pid) { e.stopImmediatePropagation(); cancelDrag(); return; }
  downAt = [e.clientX, e.clientY];
  hideWhats();
  // pressione lunga (0,6 s senza muoversi): colonna d'aria del punto
  cancelPress(); Object.assign(press, { x: e.clientX, y: e.clientY });
  press.t = setTimeout(() => {
    press.t = 0;
    if (drag.wp !== null || drag.alt !== null) return;
    if (drag.pendingLeg !== null) { drag.pendingLeg = null; controls.enabled = true; }
    downAt = null; showWhats(press.x, press.y);
  }, 600);
  if (state.view !== 'plan' || !state.route.length) return;
  drag.wp = drag.alt = null; // un trascinamento rimasto a metà (dito alzato fuori dalla carta) non continua mai
  setRay(e);
  const hit = ray.intersectObjects(groups.route.children.filter(o => o.isSprite && (o.userData.wp !== undefined || o.userData.altHandle !== undefined)))[0];
  // Selezione prima dello spostamento: il primo tocco su un punto (o sulla maniglia della quota) lo seleziona e lo
  // evidenzia; solo un punto già selezionato si trascina. Un tocco altrove deseleziona e non sposta nulla.
  const isSel = hit && (hit.object.userData.wp !== undefined ? hit.object.userData.wp === state.selWp : hit.object.userData.altHandle === state.selAlt);
  if (hit && !isSel) {
    e.preventDefault(); e.stopImmediatePropagation(); cancelPress(); downAt = null;
    selectRouteItem(hit.object.userData.wp ?? null, hit.object.userData.altHandle ?? null);
    return;
  }
  if (!hit && (Number.isInteger(state.selWp) || Number.isInteger(state.selAlt))) { selectRouteItem(null, null); return; }
  if (!hit) {
    // piega della rotta: solo se il dito è sulla linea (non in modalità «aggiungi punti»)
    const leg = state.addMode ? null : legNear(e.clientX, e.clientY);
    if (leg === null) return;
    e.preventDefault(); e.stopImmediatePropagation();
    controls.enabled = false; capturePtr(renderer.domElement, e);
    Object.assign(drag, { pendingLeg: leg, moved: false, inserted: false, pid: e.pointerId, orig: null });
    return;
  }
  e.preventDefault(); e.stopImmediatePropagation();
  controls.enabled = false; capturePtr(renderer.domElement, e);
  drag.moved = false; drag.inserted = false; drag.pid = e.pointerId;
  if (hit.object.userData.altHandle !== undefined) {
    cancelPress();
    drag.alt = hit.object.userData.altHandle; drag.y0 = e.clientY; drag.a0 = legAltFt(state.route, drag.alt, cruise()); drag.orig = { altFt: state.route[drag.alt].altFt };
    const r = renderer.domElement.getBoundingClientRect(), p0 = hit.object.userData.anchor.clone(), p1 = p0.clone().add(new THREE.Vector3(0, yOf(1000), 0));
    const px = Math.abs((p1.project(cam()).y - p0.project(cam()).y) / 2 * r.height);
    drag.ftPerPx = Math.min(50, px > 0.5 ? 1000 / px : 50);   // al massimo 50 ft per pixel: controllo fine anche da lontano
  }
  else {
    // il punto si sposta di quanto si sposta il dito (non salta sotto il dito), e solo dopo 6 pixel di movimento
    drag.wp = hit.object.userData.wp; const p = state.route[drag.wp];
    drag.orig = { lon: p.lon, lat: p.lat }; drag.p0 = { lon: p.lon, lat: p.lat }; drag.g0 = groundAt(e);
  }
}, { capture: true });
renderer.domElement.addEventListener('pointermove', e => {
  if (dragging() && drag.pid !== null && e.pointerId !== drag.pid) return;
  if (press.t && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancelPress();
  if (drag.pendingLeg !== null) {
    e.stopImmediatePropagation();
    if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6) return;
    // il dito si è mosso sulla linea: nuovo punto nel tratto, che da qui si trascina come gli altri
    const ll = groundAt(e), i = drag.pendingLeg; drag.pendingLeg = null;
    if (!ll) { controls.enabled = true; return; }
    const prev = state.route[i];
    state.route.splice(i + 1, 0, { lon: ll.lon, lat: ll.lat, name: newPName(), ...(Number.isFinite(prev.altFt) ? { altFt: prev.altFt } : {}) });
    drag.wp = i + 1; drag.inserted = true; drag.moved = true; state.routeDemo = false;
    drag.orig = { lon: ll.lon, lat: ll.lat }; drag.p0 = { lon: ll.lon, lat: ll.lat }; drag.g0 = ll;
  }
  if (drag.wp === null && drag.alt === null) return;
  e.stopImmediatePropagation();
  if (drag.wp !== null) {
    if (!drag.moved && downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6) return;
    const g = groundAt(e);
    if (!g) return;
    const g0 = drag.g0 || g, ll = { lon: drag.p0.lon + g.lon - g0.lon, lat: drag.p0.lat + g.lat - g0.lat };
    Object.assign(state.route[drag.wp], ll); drag.moved = true;
    const t = $('trash'); t.classList.add('on'); t.classList.toggle('hot', overTrash(e));
    $('hint').textContent = overTrash(e) ? `Rilascia per togliere il punto ${drag.wp + 1}` : `Punto ${drag.wp + 1}: ${ll.lat.toFixed(4)} N ${ll.lon.toFixed(4)} E · rilascia per fissarlo, sul cestino per toglierlo`;
  } else {
    if (!drag.moved && Math.abs(e.clientY - drag.y0) < 6) return;
    // piedi per pixel misurati sullo schermo (prospettiva ed esagerazione verticale comprese); passi di 100 ft, fino a 19500 ft
    const m = nodeMin(drag.alt), min = m ? m.minFt : 500;
    const v = Math.min(19500, Math.max(min, 500, Math.round((drag.a0 + (drag.y0 - e.clientY) * drag.ftPerPx) / 100) * 100));
    state.route[drag.alt].altFt = v; drag.moved = true; liveAltBox(drag.alt, v);
    $('hint').textContent = `Quota di ${state.route[drag.alt].name || `P${drag.alt + 1}`}: ${v} ft${v === min && m ? ` (minimo: ${LEG_CLEAR_FT} ft sopra il rilievo più alto del tratto, ${m.terrFt} ft)` : ''} · rilascia per fissarla`;
  }
  if (!drag.raf) drag.raf = requestAnimationFrame(() => { drag.raf = 0; buildRoute(); });
}, { capture: true });
// cestino: compare in basso mentre si trascina un punto (mai sotto i 2 punti: la rotta resta una rotta)
function overTrash(e) {
  const t = $('trash');
  if (drag.wp === null || state.route.length <= 2 || !t.classList.contains('on')) return false;
  const r = t.getBoundingClientRect();
  return e.clientX >= r.left - 12 && e.clientX <= r.right + 12 && e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12;
}
const endDrag = e => {
  if (dragging() && drag.pid !== null && e.pointerId !== drag.pid) return;
  cancelPress();
  if (drag.pendingLeg !== null) { drag.pendingLeg = null; controls.enabled = true; downAt = null; e.stopImmediatePropagation(); return; }
  if (drag.wp === null && drag.alt === null) return;
  e.stopImmediatePropagation();
  if (drag.wp !== null && drag.moved) {
    if (e.type === 'pointerup' && overTrash(e)) { state.route.splice(drag.wp, 1); state.selWp = null; }
    else {
      const p = state.route[drag.wp], sn = snapPoint(p), wasField = state.feats && [...state.feats.airports, ...state.feats.reportingPoints].some(c => (c.icao || c.name) === p.name);
      if (sn) Object.assign(p, sn); else if (wasField) p.name = `P${drag.wp + 1}`;
    }
  }
  drag.wp = drag.alt = null; drag.inserted = false; drag.pid = null; drag.orig = null; downAt = null; controls.enabled = true;
  $('trash').classList.remove('on', 'hot');
  $('hint').textContent = hintText();
  buildRoute(); buildForecast(); refresh();
};
renderer.domElement.addEventListener('pointerup', endDrag, { capture: true });
renderer.domElement.addEventListener('pointercancel', endDrag, { capture: true });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) return;
  if (state.addMode) {
    const ll = groundAt(e);
    if (ll) { const sn = snapPoint(ll); state.route.push(sn || { ...ll, name: newPName() }); state.routeDemo = false; buildRoute(); refresh(); }
    return;
  }
  pickAirspace(e);
  buildAirspaces(); renderInfo();
});
// spazi sovrapposti: prima il più basso; un altro tocco nello stesso punto passa al successivo verso l'alto
function pickAirspace(e) {
  setRay(e);
  const hits = ray.intersectObjects(groups.air.children.filter(o => o.isMesh));
  const list = [...new Set(hits.map(h => h.object.userData.airspace || h.object.userData.faceMap?.[h.faceIndex]).filter(Boolean))].sort((a, b) => (a.minLowerFt ?? 0) - (b.minLowerFt ?? 0));
  const again = state.pickAt && Math.hypot(e.clientX - state.pickAt[0], e.clientY - state.pickAt[1]) < 28 && list.includes(state.selected);
  state.selected = !list.length ? null : again ? list[(list.indexOf(state.selected) + 1) % list.length] : list[0];
  state.pickAt = [e.clientX, e.clientY]; state.pickList = list;
  return state.selected;
}
function selectRouteItem(wp, alt) {
  state.selWp = Number.isInteger(wp) ? wp : null; state.selAlt = Number.isInteger(alt) ? alt : null;
  if (Number.isInteger(wp) && navigator.vibrate) navigator.vibrate(15);
  $('hint').textContent = hintText(); buildRoute(); renderWaypoints(); dirty = true;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && (Number.isInteger(state.selWp) || Number.isInteger(state.selAlt))) selectRouteItem(null, null); });
// col mouse: tasto destro = colonna d'aria
renderer.domElement.addEventListener('contextmenu', e => { e.preventDefault(); cancelPress(); showWhats(e.clientX, e.clientY); });

// ---------------------------------------------------------------- colonna d'aria (pressione lunga sulla carta)
// Sezione verticale del punto toccato, dal terreno a FL 195: spazi aerei sovrapposti come fasce colorate, limite VDS,
// quota pianificata del tratto più vicino; accanto, i dati del punto e le azioni (in fondo, inserisci, centra, diretto).
// nome libero «Pn» per un punto nuovo: il numero più alto già usato più uno (niente doppioni)
const newPName = () => `P${Math.max(0, ...state.route.map(p => (/^P(\d+)$/.exec(p.name || '') || [0, 0])[1] * 1)) + 1}`;
const NEED_IT = { vietato: 'vietato', autorizzazione: 'autorizzazione', radio: 'contatto radio', nessuno: 'libero' };
function bestInsert(p) {
  const R = state.route;
  if (R.length < 2) return R.length;
  let best = { i: R.length, add: distM(R.at(-1), p) };
  for (let i = 0; i < R.length - 1; i++) { const add = distM(R[i], p) + distM(p, R[i + 1]) - distM(R[i], R[i + 1]); if (add < best.add) best = { i: i + 1, add }; }
  return best.i;
}
function hideWhats() { const w = $('whats'); if (w) w.style.display = 'none'; }
function drawColumn(cv, { terr, lim, air, plan }) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth || 120, H = cv.clientHeight || 240;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const top = Math.max(6000, Math.ceil(Math.max(terr + 3000, plan || 0, ...air.map(h => Math.min(h.hi, 19500))) / 1000) * 1000);
  const L = 34, R = 4, T = 6, B = 6, Y = f => T + (H - T - B) * (1 - Math.max(0, Math.min(top, f)) / top);
  ctx.font = `10px ${FONT}`; ctx.fillStyle = css('--muted'); ctx.strokeStyle = css('--line'); ctx.lineWidth = 1;
  const step = top > 12000 ? 4000 : top > 6000 ? 2000 : 1000;
  for (let f = 0; f <= top; f += step) { ctx.beginPath(); ctx.moveTo(L, Y(f) + 0.5); ctx.lineTo(W - R, Y(f) + 0.5); ctx.stroke(); ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, 4, Y(f) + 3); }
  // spazi aerei: fasce affiancate quando si sovrappongono in quota
  const lanes = [];
  for (const h of air) { let k = lanes.findIndex(l => l.every(o => o.hi <= h.lo || o.lo >= h.hi)); if (k < 0) { lanes.push([]); k = lanes.length - 1; } lanes[k].push(h); h.lane = k; }
  const lw = (W - L - R) / Math.max(1, lanes.length);
  for (const h of air) {
    const c = CAT_COLOR[category(h.a)], x = L + h.lane * lw + 1, y0 = Y(Math.min(h.hi, top)), y1 = Y(Math.max(h.lo, terr));
    ctx.fillStyle = c + '40'; ctx.fillRect(x, y0, lw - 2, y1 - y0); ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y0 + 0.5, lw - 3, y1 - y0 - 1);
  }
  ctx.fillStyle = css('--terrain-fill'); ctx.fillRect(L, Y(terr), W - L - R, H - B - Y(terr));
  if (Number.isFinite(lim)) { ctx.strokeStyle = '#d98a00'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]); ctx.beginPath(); ctx.moveTo(L, Y(lim)); ctx.lineTo(W - R, Y(lim)); ctx.stroke(); ctx.setLineDash([]); }
  if (Number.isFinite(plan)) { ctx.strokeStyle = css('--route'); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(L, Y(plan)); ctx.lineTo(W - R, Y(plan)); ctx.stroke(); }
}
function showWhats(cx, cy) {
  const ll = groundAt({ clientX: cx, clientY: cy });
  if (!ll) return;
  const terr = terrain.elevFt(ll.lon, ll.lat), pilot = ui.pilot.value, dd = day();
  const lim = pilot === 'basico' ? terrain.maxWithinFt(ll.lon, ll.lat) + dd.vdsAgl : null;
  const air = airspacesAt(ll.lon, ll.lat, terr, checkAirspaces(), qnh()).filter(h => h.hi > (terr || 0)).sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const fields = state.feats ? state.feats.airports.filter(a => aerodromeKind(a) !== 'chiuso').map(a => ({ a, d: distM(a, ll) })).filter(x => x.d < 15000).sort((x, y) => x.d - y.d).slice(0, 2) : [];
  let routeTxt = '', plan = null;
  if (state.route.length > 1) {
    let best = null;
    for (let i = 0; i < state.route.length - 1; i++) { const d = segDistM(state.route[i], state.route[i + 1], ll); if (!best || d < best.d) best = { d, i }; }
    if (best) { routeTxt = `${(best.d / NM).toFixed(1)} NM, tratto ${best.i + 1}→${best.i + 2}`; if (best.d < 5 * NM) plan = legAltFt(state.route, best.i, cruise()); }
  }
  const w = $('whats');
  w.innerHTML = `<div class="wh-h"><span><b>Colonna d'aria</b> <small>${ll.lat.toFixed(4)} N ${ll.lon.toFixed(4)} E</small></span><button type="button" class="xbtn" data-wh="close" aria-label="Chiudi">${ic('close')}</button></div>
    <div class="wh-b"><canvas aria-label="Sezione verticale del punto"></canvas><div>
      <div class="wh-row"><span>Terreno</span><b>${Number.isFinite(terr) ? Math.round(terr) + ' ft' : '—'}</b></div>
      ${lim !== null && Number.isFinite(lim) ? `<div class="wh-row"><span>Limite VDS oggi</span><b>${Math.round(lim)} ft</b></div>` : ''}
      ${routeTxt ? `<div class="wh-row"><span>Dalla rotta</span><b>${routeTxt}</b></div>` : ''}
      ${plan ? `<div class="wh-row"><span>Quota del tratto</span><b>${plan} ft</b></div>` : ''}
      <div class="wh-s">Spazi aerei, dal basso${air.length ? '' : ': nessuno nei dati caricati'}</div>
      ${air.map(h => { const r = entryRule(h.a, pilot), c = contactInfo(h.a); return `<div class="wh-air" style="border-color:${CAT_COLOR[category(h.a)]}"><b>${esc(h.a.name)}</b><span>${Math.round(Math.max(h.lo, terr || 0))}–${Math.round(h.hi)} ft · ${esc(limitText(h.a.lower))}–${esc(limitText(h.a.upper))}</span><span>${esc(NEED_IT[r.need] || r.need || '')}${c.freq ? ` · ${esc(c.unit)} ${esc(c.freq)}` : ''}</span></div>`; }).join('')}
      ${fields.length ? `<div class="wh-s">Campi vicini</div>${fields.map(({ a, d }) => { const f = a.freqs.find(x => x.mhz); return `<div class="wh-row"><span>${esc(a.icao || titleCaseIt(a.name))}${f ? ' · ' + esc(f.mhz) : ''}</span><b>${(d / NM).toFixed(1)} NM</b></div>`; }).join('')}` : ''}
    </div></div>
    <div class="wh-act">
      ${state.view === 'plan' ? `<button class="btn sm primary" data-wh="add">${ic('plus')}In fondo alla rotta</button>${state.route.length ? '<button class="btn sm" data-wh="start">Come partenza</button>' : ''}${state.route.length > 1 ? '<button class="btn sm" data-wh="ins">Inserisci nella rotta</button>' : ''}` : ''}
      ${state.view === 'fly' && state.fly.pos ? '<button class="btn sm primary" data-wh="direct">Diretto qui</button>' : ''}
      <button class="btn sm" data-wh="center">${ic('pin')}Centra</button>
    </div>
    <p class="note">Magenta: quota del tratto · arancio: limite VDS · fasce: spazi aerei. Dati non ufficiali (openAIP, Copernicus): verifica sulle fonti ufficiali.</p>`;
  w.dataset.lon = ll.lon; w.dataset.lat = ll.lat; w.dataset.name = fields[0] && fields[0].d < 1200 ? (fields[0].a.icao || fields[0].a.name) : '';
  w.style.display = 'block';
  drawColumn(w.querySelector('canvas'), { terr: Number.isFinite(terr) ? terr : 0, lim, air, plan });
  const vr = view.getBoundingClientRect(), ins = visibleInsets(), ww = w.offsetWidth, wh = w.offsetHeight;
  const x = Math.min(vr.width - ins.r - ww - 8, Math.max(ins.l + 8, cx - vr.left + 14)), y = Math.min(vr.height - ins.b - wh - 8, Math.max(8, cy - vr.top - 20));
  w.style.left = `${x}px`; w.style.top = `${Math.max(8, y)}px`;
  // gli spazi aerei del punto si evidenziano sulla carta (il primo dal basso è anche il «selezionato»)
  state.selected = air[0]?.a || null; buildAirspaces(); renderInfo();
}
$('whats').addEventListener('click', e => {
  const a = e.target.closest('[data-wh]')?.dataset.wh, w = $('whats');
  if (a === 'close') { hideWhats(); return; }
  if (!a) return;
  const p = { lon: Number(w.dataset.lon), lat: Number(w.dataset.lat) }, sn = snapPoint(p);
  if (a === 'add' || a === 'ins' || a === 'start') {
    const pt = sn || { ...p, name: newPName() };
    if (a === 'add') state.route.push(pt); else if (a === 'start') { state.route.unshift(pt); fixRouteFlags(); } else state.route.splice(bestInsert(pt), 0, pt);
    state.routeDemo = false; buildRoute(); refresh();
  } else if (a === 'center') lookAt(p.lon, p.lat);
  else if (a === 'direct') { const t = terrain.elevFt(p.lon, p.lat); state.direct = { ...p, name: w.dataset.name || 'punto scelto', elevM: (Number.isFinite(t) ? t : 0) / FT }; buildDirect(); flyTick(); }
  hideWhats();
});

// Etichette sempre leggibili: dimensione costante in pixel, calcolata a ogni fotogramma
const _v = new THREE.Vector3();
function scaleLabels() {
  const h = view.clientHeight || 1, fh = vp.fh || h, c = cam(), big = state.mode === 'beginner' ? 1.15 : 1;
  const perPx = c.isOrthographicCamera ? (c.top - c.bottom) / c.zoom / fh : null;
  const vKm = perPx ? perPx * h : null;
  for (const g of [groups.labels, groups.route, groups.wx, groups.fc, groups.feat, groups.base, groups.plane, groups.traffic, groups.review]) for (const o of g.children) {
    const u = o.userData;
    if (!u.px) continue;
    const anchor = u.anchor || o.getWorldPosition(_v);
    const dist = perPx ? null : c.position.distanceTo(anchor);
    // etichette lontane nascoste (in 2D: quando la carta mostra più del doppio della distanza massima)
    if (u.maxKm) { o.visible = perPx ? vKm <= u.maxKm * 2 : dist <= u.maxKm; if (!o.visible) continue; }
    const k = perPx ?? (2 * Math.tan(camera.fov * Math.PI / 360) * dist / fh), kb = k * (u.noBig ? 1 : big);
    if (o.isSprite) o.scale.set(u.px[0] * kb, u.px[1] * kb, 1); else o.scale.setScalar(u.px[0] * kb);
    // spostamento in pixel «verso l'alto dello schermo»: in 3D in quota, in 2D verso nord
    if (u.anchor) { o.position.copy(u.anchor); if (u.offPx) { if (perPx) o.position.z -= u.offPx * kb; else o.position.y += u.offPx * kb; } }
    // frecce di direzione: ruotate come il tratto sullo schermo
    if (u.dir && o.isSprite) {
      const a = _v.copy(u.dir[0]).project(c), bx = u.dir[1].clone().project(c);
      o.material.rotation = Math.atan2((bx.y - a.y) * h, (bx.x - a.x) * (view.clientWidth || 1));
    }
  }
  // scala grafica in miglia nautiche, solo sulla carta 2D
  const bar = $('scalebar');
  if (perPx) {
    const kmPerPx = perPx * 1, target = 120 * kmPerPx / 1.852;
    const nm = [0.5, 1, 2, 5, 10, 20, 50].find(v => v >= target * 0.6) || 50;
    bar.style.display = 'block'; bar.firstElementChild.style.width = `${nm * 1.852 / kmPerPx}px`; bar.lastElementChild.textContent = `${nm} NM`;
  } else bar.style.display = 'none';
}
function visibleInsets() {
  const cs = getComputedStyle(document.querySelector('.main')), px = v => parseFloat(cs.getPropertyValue(v)) || 0;
  return { l: px('--vl'), r: px('--vr'), b: px('--vb') };
}
function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  // il centro della carta (bersaglio della camera) va nel mezzo dello spazio non coperto dai pannelli
  const ins = visibleInsets(), sx = (ins.l - ins.r) / 2, sy = -ins.b / 2;
  Object.assign(vp, { fw: w + 2 * Math.abs(sx), fh: h + 2 * Math.abs(sy), x: sx > 0 ? 0 : 2 * Math.abs(sx), y: sy > 0 ? 0 : 2 * Math.abs(sy) });
  camera.aspect = vp.fw / vp.fh; camera.setViewOffset(vp.fw, vp.fh, vp.x, vp.y, w, h); camera.updateProjectionMatrix();
  setOrthoFrustum(); ortho.setViewOffset(vp.fw, vp.fh, vp.x, vp.y, w, h); ortho.updateProjectionMatrix();
  for (const m of fatLines) m.resolution.set(w, h);
  dirty = true;
}
new ResizeObserver(() => { resize(); schedule('profile'); }).observe(view);
new ResizeObserver(() => schedule('profile')).observe($('profileWrap'));
let lastFocusCheck = 0;
const stats = { frames: 0, k: TABELLA_K.length };
let lastLoopT = 0;
renderer.setAnimationLoop(t => {
  const idle = t - lastInteract > 250;
  // a carta ferma: un lavoro pesante per fotogramma (dettaglio del terreno, poi spazi aerei, campi, base cartografica)
  if (idle && state.proj) {
    if (jobs.size) { const [k, fn] = jobs.entries().next().value; jobs.delete(k); fn(); }
    else if (t - lastFocusCheck > 300) {
      lastFocusCheck = t;
      if (updateFocus()) { queueJob('air', buildAirspaces); queueJob('feat', buildFeatures); queueJob('base', buildBasemap); }
    }
  }
  // terreno: scelta delle tessere a ogni fotogramma; costruzione entro 4 ms mentre ci si muove, 12 ms a carta ferma
  if (state.proj) lodUpdate(idle ? 12 : 4);
  const g = state.fly.camGoal;
  if (g && !state.fly.hold && state.fly.active && state.view === 'fly' && (cam().position.distanceToSquared(g.pos) > 1e-6 || controls.target.distanceToSquared(g.target) > 1e-6)) {
    cam().position.lerp(g.pos, 0.08); controls.target.lerp(g.target, 0.08); dirty = true;
  }
  if (controls.update()) dirty = true;
  if (smoothPlane(Math.min(200, t - (lastLoopT || t)))) dirty = true;
  lastLoopT = t;
  if (!dirty && t - lastRender < 2000) return;
  // fluidità: intervallo tra due disegni consecutivi mentre la carta si muove (dito, inerzia o camera in volo)
  if (t - lastInteract < 250 || (g && !jobs.size)) { const dt = t - lastRender; if (dt > 0 && dt < 250) adaptQuality(dt); }
  dirty = false; lastRender = t; stats.frames++;
  scaleLabels(); renderer.render(scene, cam());
});
function adaptQuality(dt) {
  if (quality.mode !== 'auto') return;
  const S = quality.samples; S.push(dt);
  if (S.length < 45) return;
  const med = [...S].sort((a, b) => a - b)[S.length >> 1]; S.length = 0;
  if (med > 40 && quality.level < QLEVELS.length - 1) { quality.fast = 0; setQualityLevel(quality.level + 1); }
  else if (med < 19) { if (++quality.fast >= 4 && quality.level > 0) { quality.fast = 0; setQualityLevel(quality.level - 1); } }
  else quality.fast = 0;
}
function setQualityLevel(level) {
  const was = QLEVELS[quality.level].mesh;
  quality.level = level; quality.changes++; saveQuality();
  renderer.setPixelRatio(qPr()); resize();
  if (QLEVELS[level].mesh !== was && state.proj) queueJob('terrainQ', buildTerrain);
  renderQuality();
}
function renderQuality() {
  const el = $('qualStatus'); if (!el) return;
  const L = QLEVELS[quality.level], name = { alta: 'alta', media: 'media', bassa: 'bassa' }[L.mesh];
  el.textContent = `${quality.mode === 'auto' ? 'Automatica, ora' : 'Fissa:'} ${name} · risoluzione ${String(qPr().toFixed(2)).replace('.', ',')} · terreno a tessere di ${LOD.N} × ${LOD.N} celle (${LOD.shown.length} in vista, ${LOD.cache.size} in memoria)${quality.mode === 'auto' && quality.level > 2 && renderer.getContextAttributes()?.antialias ? ' · bordi smussati spenti dal prossimo avvio' : ''}.`;
}


// ---------------------------------------------------------------- ricerca: campi, punti di riporto, radioassistenze, località, vette
const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function searchAll(q) {
  const n = norm(q).trim();
  if (n.length < 2) return [];
  const F = state.feats || {}, B = state.basemap || {}, out = [];
  const score = (name, ...alt) => { const all = [name, ...alt].map(norm); return all.some(x => x === n) ? 0 : all.some(x => x.startsWith(n)) ? 1 : all.some(x => x.includes(n)) ? 2 : -1; };
  for (const a of F.airports || []) {
    const k = aerodromeKind(a); if (k === 'chiuso') continue;
    const al = aliasesFor(a), sc = score(a.name, a.icao, ...al);
    if (sc >= 0) out.push({ sc, pri: 0, name: [a.icao, ...al].filter(Boolean).concat(titleCaseIt(a.name)).join(' '), what: `${k}, ${Math.round(a.elevM * FT)} ft`, lon: a.lon, lat: a.lat, wpName: a.icao || a.name });
  }
  for (const r of F.reportingPoints || []) { const sc = score(r.name, r.airport); if (sc >= 0) out.push({ sc, pri: 1, name: r.name, what: `punto di riporto${r.airport ? ' di ' + r.airport : ''}${r.compulsory ? ', obbligatorio' : ''}`, lon: r.lon, lat: r.lat, wpName: r.name }); }
  for (const v of F.navaids || []) { const sc = score(v.name, v.ident); if (sc >= 0) out.push({ sc, pri: 2, name: `${v.ident} ${v.name}`, what: `${v.type} ${v.mhz}`, lon: v.lon, lat: v.lat, wpName: v.ident }); }
  for (const p of B.places || []) { const sc = score(p.n); if (sc >= 0) out.push({ sc, pri: 4 - p.k, name: p.n, what: ['', 'frazione o paese', 'paese', 'città'][p.k], lon: p.lon, lat: p.lat, wpName: p.n }); }
  for (const p of B.peaks || []) { const sc = score(p.n); if (sc >= 0) out.push({ sc, pri: 5, name: p.n, what: `vetta, ${p.ele} m`, lon: p.lon, lat: p.lat, wpName: p.n }); }
  const ref = state.route.at(-1) || state.focus?.c || HOME;
  return out.sort((a, b) => a.sc - b.sc || a.pri - b.pri || distM(ref, a) - distM(ref, b)).slice(0, 12);
}
function renderFind() {
  const hits = searchAll($('findQ').value);
  state.findHits = hits;
  $('findList').innerHTML = hits.map((h, i) => `<div class="hit"><div>${esc(h.name)}<small>${esc(h.what)} · ${h.lat.toFixed(3)} N ${h.lon.toFixed(3)} E</small></div>
    <button class="btn" type="button" data-go="${i}" aria-label="Mostra ${esc(h.name)} sulla carta">Vai</button><button class="btn primary" type="button" data-addf="${i}" aria-label="Aggiungi ${esc(h.name)} in fondo alla rotta">+ Rotta</button>${state.route.length ? `<button class="btn" type="button" data-adds="${i}" aria-label="Metti ${esc(h.name)} come partenza">Partenza</button>` : ''}</div>`).join('')
    || ($('findQ').value.trim().length >= 2 ? '<p class="note">Nessun risultato nei dati caricati.</p>' : '');
}
function lookAt(lon, lat) {
  const l = state.proj.toLocal(lon, lat), t = controls.target, d = new THREE.Vector3().subVectors(cam().position, t);
  t.set(l.x, state.dim === '2d' ? 0 : yOf(3000), l.z); cam().position.copy(t).add(d); controls.update(); dirty = true;
}
$('findQ').addEventListener('input', renderFind);
$('findForm').addEventListener('submit', e => { e.preventDefault(); renderFind(); });
$('findList').addEventListener('click', e => {
  const g = e.target.dataset.go, a = e.target.dataset.addf, st = e.target.dataset.adds, h = state.findHits?.[g ?? a ?? st];
  if (!h) return;
  if (!(h.lon >= state.area.lonMin && h.lon <= state.area.lonMax && h.lat >= state.area.latMin && h.lat <= state.area.latMax)) { showFlyMsg(`${h.name} è fuori dall'area del pacchetto dati.`); return; }
  if (a !== undefined || st !== undefined) {
    const pt = { lon: h.lon, lat: h.lat, name: h.wpName };
    if (st !== undefined) { state.route.unshift(pt); fixRouteFlags(); } else state.route.push(pt);
    state.routeDemo = false; buildRoute(); refresh(); $('findQ').value = ''; renderFind();
  }
  lookAt(h.lon, h.lat);
});

// ---------------------------------------------------------------- in volo: campi vicini, «diretto a», planata, fuori rotta, traccia
const FIELD_KINDS = ['aeroporto', 'aviosuperficie'];
// Planata: distanza raggiungibile in ogni direzione con l'efficienza del manuale, il vento del punto e il margine
// scelto nelle impostazioni (glide.js). Ci si ferma dove la quota di planata scende sotto il terreno.
function glideOpts() {
  const f = state.fly, ac = currentAircraft();
  // velocità vera di planata dalla indicata del manuale alla quota attuale (in quota la vera è maggiore)
  const ias = ac.glideKt || ac.iasKt, tas = ias ? tasFromIas(ias, f.altFt || 0, qnh()) : NaN;
  return { ratio: ac.glideRatio, tasKt: Number.isFinite(tas) ? tas : ias, wind: f.wind || null, marginPct: state.glideMargin, terrainFt: (lo, la) => terrain.elevFt(lo, la) };
}
function glideReach(pos, altFt, ratio, brg, maxNm = 30) {
  return glideReachM({ ...glideOpts(), pos, altFt, ratio, brg, maxNm });
}
function nearestFields(pos, n = 5) {
  const F = state.feats?.airports || [];
  return F.filter(a => FIELD_KINDS.includes(aerodromeKind(a))).map(a => ({ a, d: distM(pos, a), brg: bearingDeg(pos, a) })).sort((x, y) => x.d - y.d).slice(0, n);
}
const declAt = (lon, lat) => { const g = state.decl; if (!g) return 0; const i = Math.round((lon - g.lon0) / g.step), j = Math.round((lat - g.lat0) / g.step); const k = Math.max(0, Math.min(g.ny - 1, j)) * g.nx + Math.max(0, Math.min(g.nx - 1, i)); return g.d[k] + g.rate[k] * (new Date().getUTCFullYear() + new Date().getUTCMonth() / 12 - g.epoch); };
function renderNearest() {
  const box = $('nearest'), f = state.fly;
  box.classList.toggle('on', !!state.showNearest && state.view === 'fly');
  if (!state.showNearest || state.view !== 'fly') return;
  if (!f.pos) { box.innerHTML = '<b>Campi vicini</b><p class="note">Avvia il GPS o la simulazione.</p>'; return; }
  const ac = currentAircraft(), ratio = ac.glideRatio, dec = declAt(f.pos.lon, f.pos.lat);
  // righe stabili: si aggiorna solo il testo, così un tocco su «Diretto» non si perde durante l'aggiornamento
  const list = nearestFields(f.pos), key = list.map(x => x.a.id).join('|') + (ratio ? 'g' : '');
  if (box.dataset.key !== key) {
    box.dataset.key = key;
    box.innerHTML = '<b>Campi vicini</b>' + list.map(({ a }) => `<div class="row2"><div class="txt" data-f="${esc(a.id)}"></div><button class="btn" type="button" data-direct="${esc(a.id)}">Diretto</button></div>`).join('')
      + `<p class="note" data-gnote></p>`;
  }
  for (const { a, d, brg } of list) {
    const ete = f.gsKt > 20 ? d / NM / f.gsKt * 60 : NaN;
    const gl = ratio ? arrivalHeightFt({ ...glideOpts(), altFt: f.altFt, dM: d, brg, fieldElevFt: a.elevM * FT }) : NaN;
    const reach = ratio ? glideReach(f.pos, f.altFt, ratio, brg, d / NM + 0.5) >= d - 250 : false;
    const freq = a.freqs.find(x => x.mhz);
    box.querySelector(`.txt[data-f="${CSS.escape(String(a.id))}"]`).innerHTML = `<b>${esc(a.icao || titleCaseIt(a.name))}</b> ${esc(aerodromeKind(a))}${freq ? ' · ' + esc(channelOf(freq.mhz)) : ''}<br>
      ${(d / NM).toFixed(1)} NM · rotta ${String(Math.round((brg - dec + 360) % 360) || 360).padStart(3, '0')}° M${Number.isFinite(ete) ? ` · ${Math.round(ete)} min` : ''} · campo ${Math.round(a.elevM * FT)} ft
      ${ratio ? `<br>Planata: ${reach && gl > 0 ? `<b class="ok">arrivi a ${Math.round(gl)} ft sul campo</b>` : '<b class="no">non raggiungibile</b>'}` : ''}`;
    const btn = box.querySelector(`[data-direct="${CSS.escape(String(a.id))}"]`), on = state.direct === a;
    btn.textContent = on ? 'Annulla diretto' : 'Diretto'; btn.classList.toggle('on', on);
  }
  box.querySelector('[data-gnote]').textContent = glideNote();
}
function glideNote() {
  const ac = currentAircraft(), w = state.fly.wind;
  if (!ac.glideRatio) return 'Efficienza di planata non indicata nel profilo dell’aereo: planata non calcolata.';
  return `Planata con efficienza ${ac.glideRatio} (${ac.name}) meno ${state.glideMargin} % di margine, ${w ? `vento ${deg3(w.dir)}/${Math.round(w.kt)} kt (${w.src})` : 'senza vento (nessun dato)'}. Arrivo calcolato sul campo, senza circuito.`;
}
$('nearest').addEventListener('click', e => {
  const id = e.target.dataset.direct;
  if (id === undefined) return;
  const a = state.feats.airports.find(x => String(x.id) === id);
  state.direct = state.direct === a ? null : a;
  renderNearest(); flyTick();
});
$('nearBtn').addEventListener('click', () => { state.showNearest = !state.showNearest; $('nearBtn').classList.toggle('on', state.showNearest); $('nearBtn').setAttribute('aria-pressed', String(state.showNearest)); renderNearest(); });
// distanza dalla rotta del tratto attivo (positiva = a destra), metodo della sfera
// distanza dal segmento a-b (non dalla linea infinita): oltre gli estremi conta la distanza dal punto più vicino
function segDistM(a, b, p) {
  const R = 6371008.8, xt = crossTrackM(a, b, p), d13 = distM(a, p) / R;
  const along = Math.acos(Math.max(-1, Math.min(1, Math.cos(d13) / Math.cos(xt / R)))) * R * Math.sign(Math.cos((bearingDeg(a, p) - bearingDeg(a, b)) * Math.PI / 180) || 1);
  return along < 0 ? distM(a, p) : along > distM(a, b) ? distM(b, p) : Math.abs(xt);
}
function crossTrackM(a, b, p) {
  const R = 6371008.8, d13 = distM(a, p) / R, t13 = bearingDeg(a, p) * Math.PI / 180, t12 = bearingDeg(a, b) * Math.PI / 180;
  return Math.asin(Math.sin(d13) * Math.sin(t13 - t12)) * R;
}
function buildGlide() {
  const f = state.fly, ac = currentAircraft();
  groups.glide.clear();
  if (!f.pos || !ac.glideRatio || !state.proj || state.view !== 'fly') return;
  const P = state.proj, pts = [];
  for (let k = 0; k <= 36; k++) {
    const brg = k * 10, d = glideReach(f.pos, f.altFt, ac.glideRatio, brg), q = destPoint([f.pos.lon, f.pos.lat], brg, d / NM), l = P.toLocal(q[0], q[1]);
    pts.push(new THREE.Vector3(l.x, yOf((terrain.elevFt(q[0], q[1]) || 0) + 100), l.z));
  }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: '#16a34a', dashSize: 0.4, gapSize: 0.25 }));
  line.computeLineDistances(); groups.glide.add(line);
}
groups.glide = wrapGroup(new THREE.Group()); scene.add(groups.glide);
groups.traffic = wrapGroup(new THREE.Group()); scene.add(groups.traffic);
groups.review = wrapGroup(new THREE.Group()); scene.add(groups.review);
groups.trail = wrapGroup(new THREE.Group()); scene.add(groups.trail);
function buildDirect() {
  groups.direct.clear();
  const f = state.fly, a = state.direct;
  if (!a || !f.pos || !state.proj) return;
  const P = state.proj, A = P.toLocal(f.pos.lon, f.pos.lat), B = P.toLocal(a.lon, a.lat);
  groups.direct.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(A.x, yOf(f.altFt), A.z), new THREE.Vector3(B.x, yOf(a.elevM * FT + 1000), B.z)]), new THREE.LineBasicMaterial({ color: '#c026d3' })));
}
groups.direct = wrapGroup(new THREE.Group()); scene.add(groups.direct);
// traccia del volo: un punto ogni 5 s o 100 m, salvata anche nel dispositivo (ultimo volo)
function recordTrack(now = Date.now()) {
  const f = state.fly, last = state.track.at(-1);
  if (!f.pos) return;
  if (last && now - last.t < 5000 && distM(last, f.pos) < 100) return;
  state.track.push({ lon: f.pos.lon, lat: f.pos.lat, altFt: Math.round(f.altFt), t: now, src: f.source });
  if (state.track.length % 12 === 0) try { localStorage.setItem('airplanning.traccia', JSON.stringify(state.track.slice(-20000))); } catch { /* memoria piena */ }
}
function trackGpx(track) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="AerIA VFR ${VERSION}" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><author><name>${AUTHOR}</name></author></metadata>\n<trk><name>Volo ${new Date(track[0].t).toISOString().slice(0, 16).replace('T', ' ')} UTC</name><trkseg>\n`
    + track.map(p => `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><ele>${(p.altFt / FT).toFixed(1)}</ele><time>${new Date(p.t).toISOString()}</time></trkpt>`).join('\n') + '\n</trkseg></trk>\n</gpx>\n';
}
const trailUi = () => { $('trailBtn').textContent = 'Scia'; $('trailBtn').title = `Scia dell'aereo ${state.showTrail ? 'accesa: tocca per spegnerla' : 'spenta: tocca per accenderla'}`; $('trailBtn').setAttribute('aria-pressed', String(!!state.showTrail)); $('trailBtn').classList.toggle('on', !!state.showTrail); };
$('trailBtn').addEventListener('click', () => { state.showTrail = !state.showTrail; savePrefs(); trailUi(); buildTrail(); dirty = true; });
trailUi();
$('trackBtn').addEventListener('click', () => {
  let tr = state.track;
  if (!tr.length) try { tr = JSON.parse(localStorage.getItem('airplanning.traccia') || '[]'); } catch { tr = []; }
  if (!tr.length) { showFlyMsg('Nessuna traccia registrata: la traccia si registra quando il GPS, lo strumento esterno o la simulazione sono attivi.'); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([trackGpx(tr)], { type: 'application/gpx+xml' }));
  a.download = `traccia-${new Date(tr[0].t).toISOString().slice(0, 10)}.gpx`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
});

// ---------------------------------------------------------------- posizione in parole (radio, emergenza)
// «4 miglia a nord-est di Celano»: località abitata più vicina della base cartografica (centri maggiori prima),
// altrimenti il campo più vicino, altrimenti le coordinate.
function positionWords(pos) {
  const P = (state.basemap?.places || []).filter(x => x.k >= 2);
  let best = null;
  for (const x of P) { if (Math.abs(x.lat - pos.lat) > 0.3 || Math.abs(x.lon - pos.lon) > 0.4) continue; const d = distM(pos, x) * (x.k >= 3 ? 0.7 : 1); if (!best || d < best.s) best = { x, s: d, d: distM(pos, x) }; }
  const fld = nearestFields(pos, 1)[0];
  if (fld && (!best || fld.d < best.d * 0.6)) best = { x: { n: titleCaseIt(fld.a.name) }, d: fld.d, lon: fld.a.lon, lat: fld.a.lat, ref: fld.a };
  if (!best || best.d > 25000) return `${Math.abs(pos.lat).toFixed(2).replace('.', ',')} ${pos.lat >= 0 ? 'nord' : 'sud'}, ${Math.abs(pos.lon).toFixed(2).replace('.', ',')} ${pos.lon >= 0 ? 'est' : 'ovest'}`;
  const ref = best.ref || best.x;
  if (best.d < 1000) return `sopra ${best.x.n}`;
  return `${Math.round(best.d / NM)} ${Math.round(best.d / NM) === 1 ? 'miglio' : 'miglia'} a ${cardinal(bearingDeg(ref, pos))} di ${best.x.n}`;
}

// ---------------------------------------------------------------- emergenza
// Un tocco: area di planata e campi vicini accesi, campi raggiungibili in ordine di quota d'arrivo, «diretto» al
// migliore, messaggio di soccorso compilato. Le decisioni le prende il pilota: qui ci sono solo i dati.
// «Raggiungibile» solo se si arriva sul campo con almeno 500 ft: serve quota per il circuito e per gli errori di stima
const EMERG_MIN_ARR_FT = 500;
// Prua magnetica per il messaggio di soccorso: dal sensore esterno se recente, altrimenti dalla rotta GPS corretta
// col vento (triangolo del vento), altrimenti la rotta GPS stessa.
function headingMag() {
  const f = state.fly, e = state.ext, dec = declAt(f.pos.lon, f.pos.lat);
  if (e.heading && Date.now() - (e.seen.heading || 0) < 5000 && Number.isFinite(e.heading.headingDeg)) return e.heading.magnetic ? e.heading.headingDeg : e.heading.headingDeg - dec;
  const ias = currentAircraft().iasKt, tas = ias ? tasFromIas(ias, f.altFt || 0, qnh()) : NaN;
  if (f.wind && Number.isFinite(tas)) { const w = windTriangle(f.trk, tas, f.wind); if (Number.isFinite(w.th)) return w.th - dec; }
  return f.trk - dec;
}
function renderEmergency() {
  const box = $('emerg'), f = state.fly;
  box.classList.toggle('on', state.emerg && state.view === 'fly');
  $('emergBtn').classList.toggle('on', state.emerg);
  if (!state.emerg || state.view !== 'fly') return;
  if (!f.pos) { box.innerHTML = '<b>Emergenza</b><p class="note">Serve la posizione: avvia il GPS o la simulazione.</p>'; return; }
  const ac = currentAircraft(), dec = declAt(f.pos.lon, f.pos.lat), go = glideOpts();
  const list = nearestFields(f.pos, 12).map(x => ({ ...x, h: ac.glideRatio ? arrivalHeightFt({ ...go, altFt: f.altFt, dM: x.d, brg: x.brg, fieldElevFt: x.a.elevM * FT }) : NaN }))
    .map(x => ({ ...x, ok: Number.isFinite(x.h) && x.h >= EMERG_MIN_ARR_FT && glideReach(f.pos, f.altFt, ac.glideRatio, x.brg, x.d / NM + 0.5) >= x.d - 250 }));
  const reach = list.filter(x => x.ok).sort((p, q) => q.h - p.h).slice(0, 3), shown = reach.length ? reach : list.slice(0, 3);
  const inside = (f.inside || []).map(a => contactInfo(a)).find(c => c.freq);
  const m = maydayText({ profile: { callsign: ui.callsign.value, acType: ui.acType.value, category: ui.pilot.value }, position: positionWords(f.pos), altFt: f.altFt, hdgM: headingMag(),
    unit: inside ? inside.unit : '', freq: inside ? inside.freq : '' });
  const key = shown.map(x => x.a.id).join('|') + reach.length;
  if (box.dataset.key !== key) {
    box.dataset.key = key;
    box.innerHTML = `<div class="eh"><b>Emergenza</b><button type="button" class="btn" data-close>Chiudi</button></div>
      <div class="sh">${reach.length ? `Campi raggiungibili in planata (arrivo ≥ ${EMERG_MIN_ARR_FT} ft)` : `Nessun campo raggiungibile con ${EMERG_MIN_ARR_FT} ft d’arrivo: i più vicini`}</div>
      ${shown.map(({ a }) => `<div class="row2"><div class="txt" data-f="${esc(a.id)}"></div><button class="btn" type="button" data-direct="${esc(a.id)}">Diretto</button></div>`).join('')}
      <div class="sh">Messaggio di soccorso</div><div class="mayday" data-m></div><p class="note" data-gnote></p>
      ${checkLists().lists.some(isEmergency) ? '<button type="button" class="btn" data-elist>Lista di emergenza</button>' : '<p class="note">Lista di emergenza: copiala dal manuale nelle «Liste».</p>'}`;
  }
  for (const { a, d, brg, h, ok } of shown) {
    const freq = a.freqs.find(x => x.mhz);
    box.querySelector(`.txt[data-f="${CSS.escape(String(a.id))}"]`).innerHTML = `<b>${esc(a.icao || titleCaseIt(a.name))}</b> ${esc(aerodromeKind(a))}${freq ? ' · ' + esc(channelOf(freq.mhz)) : ''}<br>
      ${(d / NM).toFixed(1)} NM · ${deg3(brg - dec)}° M · ${Number.isFinite(h) ? (ok ? `<b class="ok">arrivi a ${Math.round(h)} ft</b>` : h > 0 ? `<b class="no">al limite: ${Math.round(h)} ft</b>` : '<b class="no">non raggiungibile</b>') : 'planata non calcolata'}`;
    const btn = box.querySelector(`[data-direct="${CSS.escape(String(a.id))}"]`), on = state.direct === a;
    btn.textContent = on ? 'Annulla' : 'Diretto'; btn.classList.toggle('on', on);
  }
  box.querySelector('[data-m]').innerHTML = `<div><span class="freq">${esc(m.freq)}</span> ${esc(m.unit)} · transponder <b>${m.squawk}</b></div><div class="say">${esc(m.text)}</div>`;
  box.querySelector('[data-gnote]').textContent = glideNote();
}
$('emerg').addEventListener('click', e => {
  if (e.target.dataset.close !== undefined) { state.emerg = false; renderEmergency(); return; }
  if (e.target.dataset.elist !== undefined) { openEmergencyChecklist(); return; }
  const id = e.target.dataset.direct; if (id === undefined) return;
  const a = state.feats.airports.find(x => String(x.id) === id);
  state.direct = state.direct === a ? null : a; delete $('emerg').dataset.key;
  renderEmergency(); renderNearest(); flyTick();
});
$('emergBtn').addEventListener('click', () => {
  state.emerg = !state.emerg;
  if (state.emerg && state.fly.pos) { // il campo migliore diventa subito «diretto», se raggiungibile
    const ac = currentAircraft(), f = state.fly, go = glideOpts();
    const best = nearestFields(f.pos, 12).map(x => ({ ...x, h: ac.glideRatio ? arrivalHeightFt({ ...go, altFt: f.altFt, dM: x.d, brg: x.brg, fieldElevFt: x.a.elevM * FT }) : NaN }))
      .filter(x => x.h >= EMERG_MIN_ARR_FT && glideReach(f.pos, f.altFt, ac.glideRatio, x.brg, x.d / NM + 0.5) >= x.d - 250).sort((p, q) => q.h - p.h)[0];
    if (best) state.direct = best.a;
  }
  delete $('emerg').dataset.key; renderEmergency(); if (state.fly.pos) flyTick();
});

// ---------------------------------------------------------------- tempi: volo, cronometro, promemoria, carburante, diario
const LS_LOG = 'airplanning.diario';
// ora del volo: simulata in simulazione, quella dell'ultima posizione col GPS
const flyNow = () => (state.fly.source === 'sim' ? state.fly.simClock : state.fly.active && state.fly.fixT ? state.fly.fixT : Date.now());
const logLoad = () => { try { return JSON.parse(localStorage.getItem(LS_LOG) || '[]'); } catch { return []; } };
function onTakeoff(t) {
  const tm = state.timers, f = state.fly;
  // carburante al decollo: quello del piano di volo (a bordo), se il pilota non l'ha cambiato qui
  if (!Number.isFinite(tm.fuelL)) { const v = Number(state.nl.st.load?.fuelL); tm.fuelL = v > 0 ? v : NaN; }
  if (tm.autoRemind && !tm.reminder) tm.reminder = { everyMin: state.remindMin, startAt: t, label: tm.remindLabel || 'carburante e serbatoi' };
  f.takeoffField = nearestFields(f.pos, 1)[0];
  f.remindMsg = null;
  for (const r of state.ptRem) r.st = {};
}
function onLanding(t) {
  const f = state.fly, to = nearestFields(f.pos, 1)[0], from = f.takeoffField;
  const nm = x => (x && x.d < 3 * NM ? (x.a.icao || titleCaseIt(x.a.name)) : '');
  const e = logEntry({ takeoffAt: f.ph.takeoffAt, landingAt: t, from: nm(from), to: nm(to), track: state.track, aircraft: currentAircraft().name });
  if (e.min >= 1) { const L = logLoad(); L.push(e); try { localStorage.setItem(LS_LOG, JSON.stringify(L.slice(-500))); } catch { /* memoria piena */ } }
  f.remindMsg = { t, text: `Atterrato: ${e.min} minuti di volo registrati nel diario. «Rivedi il volo» per il confronto con il piano.` };
  f.lastFlight = { from: f.ph.takeoffAt, to: t };
  if (state.timers.reminder) state.timers.reminder = null;
}
function checkReminder(now) {
  const tm = state.timers, r = reminderState(tm.reminder, now);
  if (!r) { tm.remindCount = -1; return; }
  if (tm.remindCount >= 0 && r.count > tm.remindCount) {
    const text = `Promemoria: ${tm.reminder.label}.`;
    state.fly.remindMsg = { t: now, text };
    say(text); if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
  }
  tm.remindCount = r.count;
}
function renderTimers() {
  const box = $('timers'), f = state.fly, tm = state.timers;
  box.classList.toggle('on', !!state.showTimers && state.view === 'fly');
  if (!state.showTimers || state.view !== 'fly') return;
  const now = flyNow();
  const ch = tm.chrono, chSec = ch ? ((ch.run ? now - ch.startAt : 0) + ch.acc) / 1000 : 0, rem = reminderState(tm.reminder, now);
  const ac = currentAircraft(), fe = f.ph.takeoffAt ? fuelEstimate({ fuelL: tm.fuelL, flowLh: ac.fuelFlowLh, flightMin: (now - f.ph.takeoffAt) / 60000, reserveMin: Number(state.nl.st.reserveMin) || 30 }) : null;
  const html = `<div class="eh"><b>Tempi e carburante</b><button type="button" class="btn" data-t="close">Chiudi</button></div>
    <div class="trow"><span>Tempo di volo</span><strong>${f.ph.takeoffAt && f.ph.phase === 'volo' ? fmtDur((now - f.ph.takeoffAt) / 60000) : 'a terra'}</strong></div>
    <div class="trow"><span>Cronometro</span><strong>${fmtMS(chSec)}</strong><button type="button" class="btn" data-t="chrono">${ch?.run ? 'Ferma' : 'Avvia'}</button><button type="button" class="btn" data-t="chrono0">Azzera</button></div>
    <div class="trow"><span>Promemoria ogni</span><select data-t="every">${[10, 15, 20, 30, 45, 60].map(m => `<option ${m === state.remindMin ? 'selected' : ''}>${m}</option>`).join('')}</select><span>min</span>
      <button type="button" class="btn" data-t="remind">${tm.reminder ? 'Spegni' : 'Avvia'}</button></div>
    <div class="trow"><span>${rem ? `Prossimo tra <b>${fmtMS(rem.nextSec)}</b>` : 'Spento'}</span><label class="chk"><input type="checkbox" data-t="auto" ${tm.autoRemind ? 'checked' : ''}> parte da solo al decollo</label></div>
    <div class="trow"><span>Carburante al decollo</span><input type="number" class="fld" data-t="fuel" min="0" max="300" step="1" value="${Number.isFinite(tm.fuelL) ? tm.fuelL : ''}" placeholder="litri"><span>l</span></div>
    <div class="trow"><span>Stima ora</span><strong>${fe ? `${Math.round(fe.remL)} l · ${fmtDur(fe.endMin)}` : '—'}</strong></div>
    <p class="note">Il carburante è <b>stimato</b> dal tempo di volo e dal consumo del profilo (${ac.fuelFlowLh || '?'} l/h): controlla sempre l’indicatore dell’aereo.</p>
    <div class="sh">Promemoria sui punti</div>${ptRemHtml()}
    <div class="sh">Diario dei voli</div>${logHtml()}`;
  if (editing(box)) return; // non ridisegnare mentre si scrive il carburante
  box.innerHTML = html;
}
function logHtml() {
  const L = logLoad().slice(-5).reverse();
  return (L.length ? `<table class="logt"><tr><th>Data</th><th>Da</th><th>A</th><th>Decollo</th><th>Atterr.</th><th>Durata</th></tr>${L.map(e => `<tr><td>${esc(e.date)}</td><td>${esc(e.from || '—')}</td><td>${esc(e.to || '—')}</td><td>${esc(e.off)}</td><td>${esc(e.on)}</td><td>${fmtDur(e.min)}</td></tr>`).join('')}</table>`
    : '<p class="note">Ancora nessun volo: decollo e atterraggio si registrano da soli col GPS (orari UTC).</p>') + '<button type="button" class="btn" data-t="csv">Esporta il diario (CSV)</button>';
}
$('timers').addEventListener('click', e => {
  const k = e.target.dataset.t, tm = state.timers, now = flyNow();
  if (!k) return;
  if (k === 'close') state.showTimers = false;
  else if (k === 'chrono') { const c = tm.chrono || { acc: 0, run: false }; if (c.run) { c.acc += now - c.startAt; c.run = false; } else { c.startAt = now; c.run = true; } tm.chrono = c; }
  else if (k === 'chrono0') tm.chrono = null;
  else if (k === 'ptadd') {
    const box = $('timers'), i = Number(box.querySelector('[data-t="ptwp"]').value), wp = state.route[i];
    if (!wp) return;
    const mode = box.querySelector('[data-t="ptmode"]').value, min = Number(box.querySelector('[data-t="ptmin"]').value) || 5;
    const text = box.querySelector('[data-t="pttext"]').value.trim() || (mode === 'prima' ? 'prepara la chiamata radio' : 'controlla rotta e quota');
    state.ptRem.push({ lon: wp.lon, lat: wp.lat, name: wp.name || `P${i + 1}`, mode, min, text, st: {} });
  } else if (k === 'ptdel') state.ptRem.splice(Number(e.target.dataset.i), 1);
  else if (k === 'remind') { tm.reminder = tm.reminder ? null : { everyMin: state.remindMin, startAt: now, label: 'carburante e serbatoi' }; tm.remindCount = -1; }
  else if (k === 'csv') {
    const L = logLoad(), head = 'data;da;a;decollo_utc;atterraggio_utc;minuti;aereo;quota_max_ft;distanza_nm';
    const csv = [head, ...L.map(x => [x.date, x.from, x.to, x.off, x.on, x.min, x.aircraft, x.maxAltFt ?? '', String(x.distNm).replace('.', ',')].join(';'))].join('\n');
    navCtx().download(`diario-voli-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + csv, 'text/csv'); return;
  } else return;
  $('timerBtn').classList.toggle('on', !!state.showTimers);
  renderTimers();
});
$('timers').addEventListener('change', e => {
  const k = e.target.dataset.t, tm = state.timers;
  if (k?.startsWith('pt')) return; // scelte del nuovo promemoria: si leggono quando si preme «Aggiungi»
  if (k === 'every') { state.remindMin = Number(e.target.value) || 30; if (tm.reminder) tm.reminder.everyMin = state.remindMin; savePrefs(); }
  else if (k === 'auto') tm.autoRemind = e.target.checked;
  else if (k === 'fuel') { const v = Number(e.target.value); tm.fuelL = v > 0 ? v : NaN; e.target.blur(); }
  renderTimers();
});
$('timerBtn').addEventListener('click', () => { state.showTimers = !state.showTimers; $('timerBtn').classList.toggle('on', state.showTimers); renderTimers(); });

// ---------------------------------------------------------------- promemoria legati ai punti della rotta
const PT_MODE = { prima: 'prima di', sopra: 'sopra', traverso: 'al traverso di' };
function ptRemHtml() {
  const R = state.route;
  const list = state.ptRem.map((r, i) => `<div class="trow"><span>${r.mode === 'prima' ? `${r.min} min prima di` : PT_MODE[r.mode]} <b>${esc(r.name)}</b>: ${esc(r.text)}${r.st?.fired ? ' ✓' : ''}</span><button type="button" class="btn" data-t="ptdel" data-i="${i}">Togli</button></div>`).join('');
  if (R.length < 1) return list + '<p class="note">Servono i punti della rotta.</p>';
  return `${list}<div class="trow"><select data-t="ptmode" style="width:auto"><option value="prima">Minuti prima di</option><option value="sopra">Sopra</option><option value="traverso">Al traverso di</option></select>
    <select data-t="ptmin" style="width:64px">${[1, 2, 3, 5, 10, 15].map(m => `<option ${m === 5 ? 'selected' : ''}>${m}</option>`).join('')}</select>
    <select data-t="ptwp" style="width:auto">${R.map((p, i) => `<option value="${i}">${esc(p.name || `P${i + 1}`)}</option>`).join('')}</select></div>
    <div class="trow"><input type="text" class="fld" data-t="pttext" placeholder="che cosa ricordare" style="flex:1;width:auto"><button type="button" class="btn" data-t="ptadd">Aggiungi</button></div>`;
}
function checkPointReminders(now, airborne) {
  if (!airborne || !state.ptRem.length) return;
  const f = state.fly, own = { ...f.pos, trk: f.trk, gsKt: f.gsKt };
  for (const r of state.ptRem) {
    r.st ||= {};
    if (pointReminderStep(r, r.st, own)) {
      const head = r.st.passedNm ? `Passato ${r.name} a ${r.st.passedNm.toFixed(1).replace('.', ',')} miglia` : r.mode === 'prima' ? `Tra ${r.min} minuti ${r.name}` : r.mode === 'sopra' ? `Sopra ${r.name}` : `Al traverso di ${r.name}`;
      const text = `${head}: ${r.text}.`;
      f.remindMsg = { t: now, text }; say(text); if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
    }
  }
}

// ---------------------------------------------------------------- traffico (FLARM, ADS-B)
function updateTraffic() {
  const f = state.fly, now = Date.now();
  pruneTraffic(state.traffic, now);
  groups.traffic.clear();
  const box = $('trafficAlert'), fu = state.ext.flarm && now - (state.ext.seen.flarm || 0) < 4000 ? state.ext.flarm : null;
  if (!f.pos || !state.proj || (!state.traffic.size && !(fu?.alarm >= 1))) { box.style.display = 'none'; state.trafficSaid = null; return; }
  const own = { ...f.pos, altFt: f.altFt, trk: f.trk }, list = trafficList(state.traffic, own, state.trafficBand), P = state.proj;
  for (const t of list) {
    if (!t.pos) continue;
    const l = P.toLocal(t.pos.lon, t.pos.lat), y = yOf(t.altFt), alarm = t.alarm >= 2;
    const m = symbol(alarm ? 'trafficAlarm' : 'traffic', alarm ? 40 : 32), tr = (Number.isFinite(t.trk) ? t.trk : 0) * Math.PI / 180;
    m.userData.anchor = new THREE.Vector3(l.x, y, l.z); m.userData.dir = [m.userData.anchor, new THREE.Vector3(l.x + Math.sin(tr), y, l.z - Math.cos(tr))];
    m.userData.noBig = true; m.renderOrder = 21; groups.traffic.add(m);
    // quota relativa in centinaia di piedi, con freccia se sale o scende
    const rel = Number.isFinite(t.relAltFt) ? `${t.relAltFt >= 0 ? '+' : '−'}${String(Math.round(Math.abs(t.relAltFt) / 100)).padStart(2, '0')}` : '';
    const vs = t.vsFpm > 300 ? ' ↑' : t.vsFpm < -300 ? ' ↓' : '';
    if (rel) { const lab = makeLabel(rel + vs, alarm ? '#b91c1c' : '#0e7490', 0.85); lab.userData.anchor = m.userData.anchor; lab.userData.offPx = -26; lab.renderOrder = 21; groups.traffic.add(lab); }
  }
  // allarme: quello dello strumento (o ADS-B vicino), finestra con «Chiudi», «Mostra», «Sospendi»
  // l'allarme di $PFLAU ha la precedenza: vale anche per ostacoli e zone di allerta, che non arrivano con $PFLAA
  const a = trafficAlarm(list), muted = now < state.trafficMuteUntil, ua = fu && fu.alarm >= 1 && fu.alarmType !== 0 ? fu : null;
  const key = ua ? `U-${ua.id || ua.alarmType}` : a?.key;
  if ((ua || a) && !muted && state.trafficShown !== `${key}|closed`) {
    const txt = ua ? flarmAlarmText(ua) : trafficText(a);
    box.style.display = 'flex'; box.querySelector('[data-txt]').textContent = txt; box.dataset.key = key;
    if (state.voice && state.trafficSaid !== key) { state.trafficSaid = key; say(ua ? flarmAlarmText(ua, true) : trafficText(a, true)); }
  } else box.style.display = 'none';
  if (!a && !ua) state.trafficSaid = null;
  dirty = true;
}
$('trafficAlert').addEventListener('click', e => {
  const k = e.target.dataset.ta, box = $('trafficAlert'), t = state.traffic.get(box.dataset.key);
  if (!k) return;
  if (k === 'close') state.trafficShown = `${box.dataset.key}|closed`;
  if (k === 'mute') state.trafficMuteUntil = Date.now() + 5 * 60000;
  if (k === 'show' && t?.pos) lookAt(t.pos.lon, t.pos.lat);
  box.style.display = 'none';
});
$('trafficBand').value = String(state.trafficBand);
$('trafficBand').addEventListener('change', e => { state.trafficBand = Number(e.target.value); savePrefs(); updateTraffic(); });

// ---------------------------------------------------------------- liste di controllo (copiate dal manuale dell'aereo)
const LS_CHECKS = 'airplanning.liste';
const checksAll = () => { try { return JSON.parse(localStorage.getItem(LS_CHECKS) || '{}'); } catch { return {}; } };
const checksText = () => checksAll()[currentAircraft().id] || '';
// lista mostrata: l'indice resta dentro l'elenco anche se si cambia aereo o si accorcia il testo
const checkLists = () => allLists(currentAircraft().id, checksText());
const curList = () => { const L = checkLists().lists; state.checkSel = Math.max(0, Math.min(state.checkSel || 0, L.length - 1)); return L[state.checkSel]; };
const ckKey = (ac, L, i) => `${ac.id}|${L.title}|${i}`;
const ckDoubt = t => (t ? `<div class="ckdoubt"><b>Da verificare (nota del programma):</b> ${esc(t)}</div>` : '');
function checkItemHtml(it, i, done, acId) {
  if (it.h) return `<div class="ckh ${it.c ? 'c-' + it.c : ''}">${esc(it.h)}</div>`;
  if (it.alert) return `<div class="ckalert"><b>${esc(it.t)}</b>${it.note ? `<small>${esc(it.note)}</small>` : ''}</div>${ckDoubt(noteFor(acId, 'alert'))}`;
  return `<label class="ckrow ${it.c ? 'c-' + it.c : ''} ${done ? 'done' : ''}"><input type="checkbox" data-c="item" data-i="${i}" ${done ? 'checked' : ''}><span class="ckt">${esc(it.t)}</span>${it.v ? `<span class="ckv">${esc(it.v)}</span>` : ''}</label>`;
}
// scelta dell'aereo dentro le liste: è la stessa del piano di volo (cambia anche lì)
const acPicker = ac => `<label class="ckac">Aereo <select data-c="ac">${state.nl.aircraft.map(a => `<option value="${esc(a.id)}" ${a.id === ac.id ? 'selected' : ''}>${esc(a.name)}${a.reg ? ' · ' + esc(a.reg) : ''}</option>`).join('')}</select></label>`;
function renderChecks() {
  const box = $('checks');
  box.classList.toggle('on', !!state.showChecks);
  $('checkTop').classList.toggle('on', !!state.showChecks); $('checkBtn').classList.toggle('on', !!state.showChecks);
  if (!state.showChecks) return;
  if (box.contains(document.activeElement) && document.activeElement.matches('textarea, select')) return; // non ridisegnare mentre si scrive
  const ac = currentAircraft(), { doc, lists } = checkLists(), ck = state.checkState ||= {};
  if (state.checkEdit || !lists.length) {
    box.innerHTML = `<div class="eh"><b>Liste personali · ${esc(ac.name)}</b><button type="button" class="btn" data-c="close">Chiudi</button></div>
      ${lists.length ? '' : acPicker(ac)}
      <p class="note">${doc ? `Le liste dell’Aeroclub dei Marsi (${esc(doc.rev)}) non si modificano qui: per una nuova revisione si aggiorna il documento originale. Qui puoi aggiungere liste tue, ` : 'Per questo aereo non ci sono liste dell’aeroclub. '}copiando le voci dal <b>manuale di volo</b>: una riga che comincia con «#» apre una lista; una voce per riga. Una lista con «emergenza» nel titolo compare anche nel pannello Emergenza.</p>
      <textarea data-c="text" rows="12" style="width:100%;font:0.95em/1.4 var(--font)" placeholder="# Prima dell'avviamento&#10;Voce ..... STATO">${esc(checksText())}</textarea>
      <div class="row"><button type="button" class="btn primary" data-c="save">Salva</button>${lists.length ? '<button type="button" class="btn" data-c="cancel">Annulla</button>' : ''}</div>`;
    return;
  }
  const L = curList(), sel = state.checkSel;
  const checkable = L.items.map((it, i) => isCheckable(it) ? i : -1).filter(i => i >= 0);
  const done = checkable.filter(i => ck[ckKey(ac, L, i)]).length;
  const src = L.club && doc ? `<p class="cksrc">${esc(doc.title)} · ${esc(doc.rev)} · Aeroclub dei Marsi</p>` : (!L.club ? '<p class="cksrc">Lista personale</p>' : '');
  let body;
  if (L.ref) body = `<table class="ckref">${L.ref.map(([k, v]) => { const n = noteFor(ac.id, 'ref', k); return `<tr${n ? ' class="doubt"' : ''}><td>${esc(k)}</td><td>${esc(v)}</td></tr>${n ? `<tr><td colspan="2">${ckDoubt(n)}</td></tr>` : ''}`; }).join('')}</table>`;
  else body = L.items.map((it, i) => checkItemHtml(it, i, ck[ckKey(ac, L, i)], ac.id)).join('');
  const foot = L.club && doc && (L.last || L.ref) ? doc.footer.map(f => `<div class="ckfoot">${f.map((x, j) => j ? `<span>${esc(x)}</span>` : `<b>${esc(x)}</b>`).join('')}</div>`).join('') + ckDoubt(noteFor(ac.id, 'footer')) : '';
  const allDone = checkable.length && done === checkable.length;
  box.innerHTML = `<div class="eh"><b>Liste di controllo</b><button type="button" class="btn" data-c="close">Chiudi</button></div>
    ${acPicker(ac)}
    <div class="trow"><select data-c="sel" style="flex:1">${lists.map((l, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(l.title)}${l.club ? '' : ' (personale)'}</option>`).join('')}</select>${L.ref ? '' : `<span class="ckcount ${allDone ? 'ok' : ''}">${done}/${checkable.length}</span>`}</div>
    ${src}<div class="cklist">${body}</div>${foot}
    <div class="row">${L.ref ? '' : '<button type="button" class="btn" data-c="reset">Ricomincia</button>'}${sel < lists.length - 1 ? `<button type="button" class="btn ${allDone ? 'primary' : ''}" data-c="next">Lista seguente</button>` : ''}<button type="button" class="btn" data-c="edit">Liste personali</button></div>`;
}
$('checks').addEventListener('click', e => {
  const k = e.target.dataset.c, box = $('checks'), ck = state.checkState ||= {}, ac = currentAircraft();
  if (!k || k === 'text' || k === 'sel' || k === 'ac') return;
  if (k === 'close') { state.showChecks = false; }
  else if (k === 'save') { const all = checksAll(); all[ac.id] = checklistText(parseChecklists(box.querySelector('[data-c="text"]').value)); try { localStorage.setItem(LS_CHECKS, JSON.stringify(all)); } catch { /* memoria piena */ } state.checkEdit = false; state.checkSel = 0; document.activeElement?.blur(); }
  else if (k === 'cancel') { state.checkEdit = false; document.activeElement?.blur(); }
  else if (k === 'edit') state.checkEdit = true;
  else if (k === 'item') { const L = curList(); ck[ckKey(ac, L, e.target.dataset.i)] = e.target.checked; }
  else if (k === 'reset') { const L = curList(); for (const kk of Object.keys(ck)) if (kk.startsWith(`${ac.id}|${L.title}|`)) delete ck[kk]; }
  else if (k === 'next') { state.checkSel = (state.checkSel || 0) + 1; box.querySelector('.cklist')?.scrollTo?.(0, 0); }
  renderChecks(); if (state.emerg) { delete $('emerg').dataset.key; renderEmergency(); }
});
$('checks').addEventListener('change', e => {
  const k = e.target.dataset.c;
  if (k === 'sel') { state.checkSel = Number(e.target.value); e.target.blur(); renderChecks(); }
  else if (k === 'ac') {
    // stesso aereo del piano di volo: si salva e il piano si ricalcola
    state.nl.st.aircraftId = e.target.value; state.checkSel = 0; state.checkEdit = false;
    try { localStorage.setItem('airplanning.piano', JSON.stringify(state.nl.st)); } catch { /* memoria piena */ }
    e.target.blur(); state.nlPending = true; buildRoute(); refresh(); renderChecks();
  }
});
const toggleChecks = () => { state.showChecks = !state.showChecks; renderChecks(); };
$('checkBtn').addEventListener('click', toggleChecks);
$('checkTop').addEventListener('click', toggleChecks);
function openEmergencyChecklist() {
  const lists = checkLists().lists, i = lists.findIndex(isEmergency);
  if (i < 0) return;
  state.showChecks = true; state.checkEdit = false; state.checkSel = i; $('checkBtn').classList.add('on'); renderChecks();
}

// ---------------------------------------------------------------- rivedere il volo (dopo l'atterraggio)
function lastTrack() {
  if (state.track.length) return state.track;
  try { return JSON.parse(localStorage.getItem('airplanning.traccia') || '[]'); } catch { return []; }
}
function startReview() {
  const tr = lastTrack();
  if (tr.length < 2) { showFlyMsg('Nessuna traccia registrata da rivedere: la traccia si registra quando il GPS, lo strumento esterno o la simulazione sono attivi.'); return; }
  const lf = state.fly.lastFlight, pilot = ui.pilot.value, d = day(), fields = (state.feats?.airports || []).map(a => ({ lon: a.lon, lat: a.lat, elevFt: a.elevM * FT }));
  const pr = state.profile, R = state.route, planned = new Set((state.analysis?.hits || []).map(h => h.a.id));
  const res = analyzeFlight({ track: tr, route: R, terrainFt: (lo, la) => { const v = terrain.elevFt(lo, la); return Number.isFinite(v) ? v : NaN; },
    vdsLimFt: pilot === 'basico' ? (lo, la) => terrain.maxWithinFt(lo, la) + d.vdsAgl : null, fields,
    airspaceAt: (lo, la, alt) => airspacesAt(lo, la, terrain.elevFt(lo, la) || 0, checkAirspaces(), qnh())
      .filter(x => alt >= x.lo && alt <= x.hi && ['P', 'R', 'CTRL'].includes(category(x.a)))
      // gli spazi controllati già sulla rotta pianificata (con la loro scheda radio) non sono superamenti
      .filter(x => !(category(x.a) === 'CTRL' && planned.has(x.a.id))).map(x => ({ name: x.a.name, need: entryRule(x.a, pilot).need })),
    planAltFt: pr && R.length > 1 ? x => pr.altAt(x) : null,
    from: lf?.from ?? -Infinity, to: lf?.to ?? Infinity });
  if (res.samples.length < 2) { showFlyMsg('La traccia dell’ultimo volo è troppo corta per la revisione.'); return; }
  state.review = { ...res, idx: 0 };
  state.showTimers = false; state.showChecks = false; $('timerBtn').classList.remove('on'); $('checkBtn').classList.remove('on'); renderTimers(); renderChecks();
  state.fly.camGoal = null;
  buildReview(); renderReview(); fitRoute(res.samples);
}
function buildReview() {
  groups.review.clear();
  const r = state.review;
  if (!r || !state.proj) return;
  const P = state.proj, lv = new Map();
  for (const e of r.episodes) if (e.lvl !== 'info') for (let i = e.i0; i <= e.i1; i++) if (lv.get(i) !== 'crit') lv.set(i, e.lvl);
  // traccia volata: verde; arancio o rossa nei tratti con superamenti (da controllare, da rivedere)
  const COL = { ok: '#16a34a', warn: '#d97706', crit: '#dc2626' };
  let seg = [], bad = null;
  const flush = () => { if (seg.length > 1) groups.review.add(fatLine(seg, fatMat({ color: COL[bad], linewidth: 5, depthTest: false, transparent: true }))); };
  r.samples.forEach((p, i) => {
    const l = P.toLocal(p.lon, p.lat), v = new THREE.Vector3(l.x, yOf(p.altFt), l.z), b = lv.get(i) || 'ok';
    if (bad !== null && b !== bad) { seg.push(v); flush(); seg = [seg.at(-1)]; }
    bad = b; seg.push(v);
  });
  flush();
  groups.review.children.forEach(o => { o.renderOrder = 18; });
  const p = r.samples[r.idx], l = P.toLocal(p.lon, p.lat), m = symbol('plane', 36), q = r.samples[Math.min(r.idx + 1, r.samples.length - 1)], qq = P.toLocal(q.lon, q.lat);
  m.userData.anchor = new THREE.Vector3(l.x, yOf(p.altFt), l.z); m.userData.dir = [m.userData.anchor, new THREE.Vector3(qq.x, yOf(q.altFt), qq.z)];
  m.userData.noBig = true; m.renderOrder = 22; groups.review.add(m);
  dirty = true;
}
function renderReview() {
  const box = $('review'), r = state.review;
  box.classList.toggle('on', !!r && state.view === 'fly');
  $('reviewBtn').classList.toggle('on', !!r);
  if (!r || state.view !== 'fly') return;
  const s = r.series[r.idx], p = r.samples[r.idx], RANK = { crit: 'crit', warn: 'warn', info: 'info' };
  const nCrit = r.episodes.filter(e => e.lvl === 'crit').length, nWarn = r.episodes.filter(e => e.lvl === 'warn').length;
  if (box.dataset.n !== String(r.samples.length)) {
    box.dataset.n = String(r.samples.length);
    box.innerHTML = `<div class="eh"><b>Rivedi il volo</b><button type="button" class="btn" data-r="close">Chiudi</button></div>
      <div class="trow"><span>Durata ${fmtDur(r.durMin)} · ${r.distNm.toFixed(1).replace('.', ',')} NM · quota max ${Math.round(r.maxAltFt / 10) * 10} ft</span></div>
      <div class="trow"><span>Margine minimo dal terreno lontano dai campi: <b>${Number.isFinite(r.minAglFt) ? Math.round(r.minAglFt) + ' ft' : '—'}</b>${state.route.length > 1 ? ` · scostamento max dalla rotta <b>${r.maxXtNm.toFixed(1).replace('.', ',')} NM</b>` : ''}</span></div>
      <canvas data-r="chart" style="width:100%;height:120px;display:block;margin:6px 0;touch-action:none"></canvas>
      <input type="range" data-r="pos" min="0" max="${r.samples.length - 1}" value="${r.idx}" style="width:100%">
      <div class="trow" data-r="now"></div>
      <div class="sh">${nCrit || nWarn ? `${nCrit ? `${nCrit} da rivedere` : ''}${nCrit && nWarn ? ', ' : ''}${nWarn ? `${nWarn} da controllare` : ''}` : 'Nessun superamento dei limiti'}</div>
      ${r.episodes.map((e, i) => `<div class="warn ${RANK[e.lvl]}" data-r="ep" data-i="${i}" style="cursor:pointer"><b>${esc(e.title)}</b><span class="wt">${esc(e.text)}</span></div>`).join('')}
      <p class="note">Confronto della traccia registrata con il terreno, ${ui.pilot.value === 'basico' ? 'il limite VDS, ' : ''}gli spazi aerei e la rotta pianificata attuale. Le quote sono quelle registrate (GPS o barometrica dello strumento).</p>`;
  }
  box.querySelector('[data-r="pos"]').value = String(r.idx);
  box.querySelector('[data-r="now"]').innerHTML = `<span>${new Date(p.t).toISOString().slice(11, 19)} UTC · ${Math.round(p.altFt / 10) * 10} ft · terreno ${Math.round(s.terrFt / 10) * 10} ft${Number.isFinite(s.planFt) ? ` · piano ${Math.round(s.planFt / 100) * 100} ft` : ''}</span>`;
  drawReviewChart(box.querySelector('[data-r="chart"]'));
}
// Grafico quota-tempo: terreno (marrone), quota volata (verde/rosso), piano (tratteggio), limite VDS (rosso tratteggiato)
function drawReviewChart(cv) {
  const r = state.review, dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 300, H = cv.clientHeight || 120;
  cv.width = W * dpr; cv.height = H * dpr;
  const c = cv.getContext('2d'); c.scale(dpr, dpr); c.clearRect(0, 0, W, H);
  const S = r.series, t0 = S[0].t, t1 = S.at(-1).t || t0 + 1;
  const vals = S.flatMap(x => [x.altFt, x.terrFt, x.planFt, x.limFt]).filter(Number.isFinite), lo = Math.max(0, Math.min(...vals) - 300), hi = Math.max(...vals) + 300;
  const X = t => 30 + (W - 34) * (t - t0) / (t1 - t0 || 1), Y = a => H - 14 - (H - 20) * (a - lo) / (hi - lo || 1);
  c.font = `11px ${FONT}`; c.fillStyle = css('--muted') || '#64748b';
  c.fillText(`${Math.round(hi / 100) * 100}`, 0, 12); c.fillText(`${Math.round(lo / 100) * 100}`, 0, H - 16);
  c.beginPath(); c.moveTo(X(t0), H - 14); S.forEach(x => c.lineTo(X(x.t), Y(x.terrFt))); c.lineTo(X(t1), H - 14); c.closePath(); c.fillStyle = 'rgba(146,108,72,0.55)'; c.fill();
  const line = (key, col, dash) => { c.beginPath(); let on = false; S.forEach(x => { if (!Number.isFinite(x[key])) { on = false; return; } on ? c.lineTo(X(x.t), Y(x[key])) : c.moveTo(X(x.t), Y(x[key])); on = true; }); c.setLineDash(dash || []); c.strokeStyle = col; c.lineWidth = 1.6; c.stroke(); c.setLineDash([]); };
  line('limFt', '#dc2626', [4, 3]); line('planFt', '#c026d3', [6, 4]); line('altFt', '#15803d');
  for (const e of r.episodes) if (e.lvl !== 'info') { c.fillStyle = e.lvl === 'crit' ? 'rgba(220,38,38,0.25)' : 'rgba(217,119,6,0.22)'; c.fillRect(X(S[e.i0].t), 0, Math.max(2, X(S[e.i1].t) - X(S[e.i0].t)), H - 14); }
  const x = X(S[r.idx].t); c.strokeStyle = '#111827'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H - 14); c.stroke();
}
function reviewGo(i) {
  const r = state.review; if (!r) return;
  r.idx = Math.max(0, Math.min(r.samples.length - 1, i)); buildReview(); renderReview();
}
$('review').addEventListener('input', e => { if (e.target.dataset.r === 'pos') reviewGo(Number(e.target.value)); });
$('review').addEventListener('click', e => {
  const t = e.target.closest('[data-r]'); if (!t) return;
  const k = t.dataset.r, r = state.review;
  if (k === 'close') { state.review = null; groups.review.clear(); dirty = true; delete $('review').dataset.n; renderReview(); }
  else if (k === 'ep') { const ep = r.episodes[Number(t.dataset.i)]; reviewGo(ep.worstI); const p = r.samples[ep.worstI]; lookAt(p.lon, p.lat); }
  else if (k === 'chart') { const b = t.getBoundingClientRect(), S = r.series, tt = S[0].t + (S.at(-1).t - S[0].t) * Math.max(0, Math.min(1, (e.clientX - b.left - 30) / (b.width - 34)));
    let bi = 0; S.forEach((x, i) => { if (Math.abs(x.t - tt) < Math.abs(S[bi].t - tt)) bi = i; }); reviewGo(bi); }
});
$('reviewBtn').addEventListener('click', () => { if (state.review) { state.review = null; groups.review.clear(); dirty = true; delete $('review').dataset.n; renderReview(); } else startReview(); });

// ---------------------------------------------------------------- minimi personali (pannello «Pilota e aereo»)
const MIN_FIELDS = { minCeil: 'ceilFt', minVis: 'visKm', minWind: 'windKt', minGust: 'gustKt', minXwind: 'xwindKt' };
for (const [id, k] of Object.entries(MIN_FIELDS)) {
  const el = $(id); el.value = Number.isFinite(state.minima[k]) ? state.minima[k] : '';
  el.addEventListener('change', () => { const v = el.value === '' ? null : Number(el.value); state.minima[k] = Number.isFinite(v) && v >= 0 ? v : null; savePrefs(); refresh(); });
}
$('minOn').checked = state.minima.on !== false;
$('minOn').addEventListener('change', e => { state.minima.on = e.target.checked; savePrefs(); refresh(); });

// Schermo sempre acceso con l'app aperta (dove il sistema lo permette)
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}
// Lo schermo resta acceso per tutto il tempo in cui l'app è aperta (non solo in volo): nell'app Android lo garantisce
// MainActivity (FLAG_KEEP_SCREEN_ON); qui, nella pagina web, il blocco dello schermo del browser dove esiste.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(true); });
keepAwake(true);
addEventListener('pointerdown', () => { if (!wakeLock) keepAwake(true); }, { passive: true });

// Aggancio per i test automatici (tools/shot.py)
window.__airplanning = {
  lodAt(lon, lat) { const m = LOD.shown.find(m => { const b = m.userData.tile.b; return lon >= b.lonMin && lon < b.lonMax && lat >= b.latMin && lat < b.latMax; }); return m ? m.userData.tile.level : null; },
  groupCounts: () => Object.fromEntries(Object.entries(groups).map(([k, g]) => { let n = 0, sp = 0; g.traverseVisible(o => { if (o.isMesh || o.isLine || o.isPoints) n++; if (o.isSprite) sp++; }); return [k, { draw: n, sprites: sp }]; })),
  // quota (ft) della superficie di spazio aereo più alta disegnata sopra un punto, e del terreno lì
  airTopFtAt(lon, lat) {
    const l = state.proj.toLocal(lon, lat), rc = new THREE.Raycaster(new THREE.Vector3(l.x, 1000, l.z), new THREE.Vector3(0, -1, 0));
    scene.updateMatrixWorld(true);
    const hits = rc.intersectObjects(groups.air.children.filter(o => o.isMesh)).map(h => ({ y: h.point.y, a: (h.object.userData.airspace || h.object.userData.faceMap?.[h.faceIndex])?.name }));
    const k = yOf(1000) / 1000;
    return { hits: hits.map(h => ({ ft: Math.round(h.y / k), a: h.a })), terrFt: Math.round(terrain.elevFt(lon, lat)) };
  },
  follow: () => ({ follow: state.fly.follow, k: state.fly.followK, btn: $('recenterBtn').getAttribute('aria-pressed') }),
  camTarget: () => controls.target.toArray(),
  visibleNames: () => visibleAirspaces().map(a => a.name),
  // due tocchi nello stesso punto della carta (vista dall'alto): nomi e quote inferiori degli spazi scelti
  pickTest(lon, lat) {
    setDim('2d'); lookAt(lon, lat); renderer.render(scene, cam()); buildAirspaces(); scene.updateMatrixWorld(true);
    const l = state.proj.toLocal(lon, lat), v = new THREE.Vector3(l.x, 0, l.z).project(cam()), r = renderer.domElement.getBoundingClientRect();
    const e = { clientX: r.left + (v.x + 1) / 2 * r.width, clientY: r.top + (1 - v.y) / 2 * r.height };
    state.pickAt = null; state.selected = null;
    const a = pickAirspace(e), b = pickAirspace(e), n = state.pickList.length;
    setDim('3d');
    return { n, first: a?.name, second: b?.name, firstLow: a?.minLowerFt, secondLow: b?.minLowerFt };
  },
  zoomTo(km) { const t = controls.target, d = cam().position.clone().sub(t).setLength(km); cam().position.copy(t).add(d); controls.update(); dirty = true; },
  lod: () => ({ shown: LOD.shown.length, cache: LOD.cache.size, builds: LOD.builds, ms: Math.round(LOD.ms), levels: LOD.shown.map(m => m.userData.tile.level), N: LOD.N }),
  setRoute(points) { state.route = points.map(([lon, lat], i) => ({ lon, lat, name: `P${i + 1}` })); state.routeDemo = false; buildRoute(); refresh(); },
  meshTopY, yAbove, groups, buildTrail, planProfile,
  setView, setMode, setTheme, setDim, startSim, stopFly, startDeviceDemo, disconnectDevice, state, camera, ortho, controls,
  async setRadar(b64s, time) {
    const dec = b => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
    state.radar.sri = { ...(await parseRadarTiff(dec(b64s[0]), window.GeoTIFF)), time };
    state.radar.cappi = b64s[1] ? { ...(await parseRadarTiff(dec(b64s[1]), window.GeoTIFF)), time } : null;
    buildRadar(); refresh();
    return [[13.43, 42.03], [13.0, 41.6], [14.0, 42.6]].map(([lo, la]) => [sampleRadar(state.radar.sri, lo, la), state.radar.cappi && sampleRadar(state.radar.cappi, lo, la)]);
  },
  sampleRadar: (lo, la) => [sampleRadar(state.radar.sri, lo, la), state.radar.cappi && sampleRadar(state.radar.cappi, lo, la)],
  setForecast(fx) { setForecastData(fromCompact(fx)); state.fcTi = 0; buildForecast(); refresh(); },
  setWeather(json, now) { state.wxErr = ''; state.wx = { stations: parseMetarsFor(json.metar, now), sigmets: [], fetched: Date.now() }; buildWeather(); refresh(); },
  tick(n = 1) { for (let i = 0; i < n; i++) flyTick(); },
  // posizione «come dal GPS» per le prove (fasi del volo, diario, emergenza): t in ms
  fix({ lon, lat, altFt, gsKt, trk, t }) { const f = state.fly; Object.assign(f, { active: true, source: 'prova', pos: { lon, lat }, altFt, gsKt, trk, fixT: t, altLabel: 'Quota di prova' }); flyTick(); },
  timers: () => state.timers, logLoad, ptRem: () => state.ptRem, reviewObjs: () => groups.review.children.length, traffic: () => state.traffic, review: () => state.review, startReview, onExtLine, positionWords, hazard: () => hazU.uHaz.value.toArray(), setGlideMargin(v) { state.glideMargin = v; },
  // posizione sullo schermo (pixel) del nodo i della rotta o della maniglia della quota
  screenOf(i, handle = false) {
    const o = groups.route.children.find(c => c.isSprite && (handle ? c.userData.altHandle === i : c.userData.wp === i));
    if (!o) return null;
    const v = o.getWorldPosition(new THREE.Vector3()).project(cam()), r = renderer.domElement.getBoundingClientRect();
    return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
  },
  quality: () => ({ ...quality, samples: undefined, pr: qPr(), mesh: QLEVELS[quality.level].mesh, aa: renderer.getContextAttributes()?.antialias }),
  setQualityLevel: l => setQualityLevel(l),
  info: () => ({ mem: { ...renderer.info.memory }, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, objs: (() => { let n = 0; scene.traverse(() => n++); return n; })() }),
  lookAt, refresh, terrainLabel: () => terrain.label(), elevM: (lon, lat) => terrain.elevM(lon, lat), profile: () => state.profile && { pts: state.profile.pts, events: state.profile.events, climb: state.profile.climb.src, depEnd: state.profile.depEnd, arrStart: state.profile.arrStart },
  zoom2d(z) { ortho.zoom = z; ortho.updateProjectionMatrix(); controls.update(); dirty = true; },
  frames: () => stats.frames,
  // posizione (pixel del client) del punto i nel profilo verticale
  profPt(i) {
    const g = state.profGeom, R = state.route, pr = state.profile;
    if (!g || !pr) return null;
    let d = 0; for (let k = 1; k <= i; k++) d += distM(R[k - 1], R[k]);
    const r = pcv.getBoundingClientRect(), a = pr.altAt(d);
    return [r.left + g.L + (g.W - g.L - g.R) * d / g.total, r.top + g.T + (g.H - g.T - g.B) * (1 - Math.max(0, Math.min(g.yMax, a)) / g.yMax)];
  },
};

// ---------------------------------------------------------------- avvio
$('guideBtn').addEventListener('click', () => { const f = $('guideFrame'); f.src = './guida.html'; $('guide').classList.add('on'); });
$('closeGuide').addEventListener('click', () => $('guide').classList.remove('on'));
$('qualSel').value = quality.mode;
$('qualSel').addEventListener('change', e => {
  quality.mode = e.target.value; quality.samples.length = 0; quality.fast = 0;
  if (quality.mode !== 'auto') setQualityLevel(QFIXED[quality.mode]); else { saveQuality(); renderQuality(); }
});
renderQuality();
// ---------------------------------------------------------------- aggiornamenti dell'app e uso senza rete
const LS_UPD = 'airplanning.aggiornamenti';
const upd = (() => { try { return { auto: true, last: 0, ...JSON.parse(localStorage.getItem(LS_UPD) || '{}') }; } catch { return { auto: true, last: 0 }; } })();
const saveUpd = () => { try { localStorage.setItem(LS_UPD, JSON.stringify({ auto: upd.auto, last: upd.last, lastMsg: upd.lastMsg, skip: upd.skip })); } catch { /* memoria piena */ } };
const nativeUpd = () => (globalThis.Capacitor?.isNativePlatform?.() && globalThis.Capacitor?.Plugins?.Aggiornamenti) || null;
$('updAuto').checked = upd.auto !== false;
$('updAuto').addEventListener('change', e => { upd.auto = e.target.checked; saveUpd(); renderOffline(); });
$('updCheck').addEventListener('click', () => checkUpdates(true));
async function checkUpdates(manual) {
  const airborne = state.fly?.ph?.phase === 'volo';
  if (!shouldCheck({ online: navigator.onLine !== false, airborne, lastCheck: upd.last, now: Date.now(), manual, enabled: upd.auto !== false })) {
    if (manual) { upd.lastMsg = airborne ? 'In volo non controllo gli aggiornamenti.' : 'Nessuna connessione: riprova quando c’è rete.'; renderOffline(); }
    return;
  }
  if (!nativeUpd() && !manual) return;   // nella pagina web la versione è sempre l'ultima pubblicata
  upd.lastMsg = 'Controllo in corso…'; renderOffline();
  let found = null, reached = false;
  for (const url of UPDATE_CHANNELS) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
      if (!r.ok) continue;
      reached = true;
      const u = pickUpdate(await r.json(), VERSION);
      if (u && (!found || compareVersions(u.version, found.version) > 0)) found = u;
      if (found) break;
    } catch { /* canale non raggiungibile */ }
  }
  upd.last = Date.now();
  if (!reached) upd.lastMsg = 'Pagina delle versioni non raggiungibile (rete assente o canale non ancora pubblico).';
  else if (!found) upd.lastMsg = `Hai l’ultima versione (${VERSION}).`;
  else upd.lastMsg = `Disponibile la versione ${found.version}.`;
  saveUpd(); renderOffline();
  if (found && (manual || upd.skip !== found.version)) showUpdate(found);
}
function showUpdate(u) {
  const box = $('updBanner'), native = nativeUpd();
  box.innerHTML = `<b>Nuova versione: AerIA VFR ${esc(u.version)}</b> <span class="note">(hai la ${esc(VERSION)})</span>
    ${u.notes.length ? `<ul>${u.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <p class="note">${native ? `Si scaricano circa ${Math.round(u.size / 1e6) || '?'} MB; poi Android chiede conferma per installare. Piani, profili e liste restano.${u.sha256 ? '' : ' <b>Impronta non pubblicata: il file non può essere verificato.</b>'}` : 'Nella pagina web la versione si aggiorna da sola; sul tablet installa l’APK dalla pagina del rilascio.'}</p>
    <div class="bar" hidden><i></i></div><p class="note" data-u="msg"></p>
    <div class="row">${native ? `<button type="button" class="btn primary" data-u="go" ${u.sha256 ? '' : 'disabled'}>Scarica e installa</button>` : ''}<button type="button" class="btn" data-u="later">Più tardi</button><button type="button" class="btn" data-u="skip">Salta questa versione</button></div>`;
  box.classList.add('on');
  box.onclick = async e => {
    const k = e.target.dataset.u, msg = box.querySelector('[data-u="msg"]');
    if (k === 'later') box.classList.remove('on');
    else if (k === 'skip') { upd.skip = u.version; saveUpd(); box.classList.remove('on'); }
    else if (k === 'go') {
      e.target.disabled = true;
      try {
        if (!(await native.puoInstallare()).ok) {
          msg.textContent = 'Serve il permesso «Installa app sconosciute» per AerIA VFR: si apre l’impostazione di Android; attivalo, torna qui e premi di nuovo.';
          await native.permesso(); e.target.disabled = false; return;
        }
        const bar = box.querySelector('.bar'); bar.hidden = false;
        const h = await native.addListener('avanzamento', p => { bar.firstElementChild.style.width = `${p.totale > 0 ? Math.round(100 * p.fatti / p.totale) : 50}%`; msg.textContent = `Scaricati ${Math.round(p.fatti / 1e6)} MB`; });
        msg.textContent = 'Scarico…';
        const f = await native.scarica({ url: u.url, sha256: u.sha256, nome: u.name });
        h?.remove?.();
        msg.textContent = 'File verificato. Conferma l’installazione nella finestra di Android.';
        await native.installa({ path: f.path });
      } catch (err) { msg.textContent = `Aggiornamento non riuscito: ${err?.message || err}. Riprova più tardi o installa l’APK a mano.`; e.target.disabled = false; }
    }
  };
}
setInterval(() => checkUpdates(false), 30 * 60e3);   // ogni mezz'ora verifica se sono passate 6 ore dall'ultimo controllo
addEventListener('online', () => { renderOffline(); checkUpdates(false); if (!state.wx || state.wx.cached) loadWeather(); });
addEventListener('offline', renderOffline);
function renderOffline() {
  const pi = state.packInfo || {}, m = pi.meta || {}, f = m.features?.counts || {};
  const docs = ACM_CHECKLISTS.map(d => `${d.title.replace(/^CHECK ?LIST\s*[-–]\s*/i, '')} (${d.rev})`).join(', ');
  const c = cachedWeather();
  const last = upd.last ? new Date(upd.last).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'mai';
  $('updStatus').innerHTML = `Versione installata <b>${esc(VERSION)}</b>. Ultimo controllo: ${esc(last)}${upd.lastMsg ? ` · ${esc(upd.lastMsg)}` : ''}${upd.auto === false ? ' · controllo automatico spento' : ''}`;
  $('offlineStatus').innerHTML = `<p>Rete: <b>${navigator.onLine === false ? 'assente' : 'presente'}</b>.</p>
    <p>Nel pacchetto installato, senza bisogno di rete: ${esc(pi.name || 'pacchetto dati')}${m.airspaces ? ` · spazi aerei ${m.airspaces.count} (openAIP, ${esc(m.airspaces.downloaded)}, ciclo AIRAC ${esc(airacCycle(m.airspaces.downloaded)?.id || '?')}; oggi vale il ${esc(airacCycle(new Date())?.id || '?')})` : ''}${f.airports ? ` · ${f.airports} campi, ${f.obstacles} ostacoli, ${f.reportingPoints} punti di riporto, ${f.navaids} radioassistenze` : ''}${pi.tiles ? ` · terreno in ${pi.tiles} tessere` : ''} · declinazione magnetica e geoide · liste di controllo: ${esc(docs)} · schede radio · emergenza e planata · piano di volo e stampa · guida all’uso nel programma.</p>
    <p>Serve la rete: METAR e TAF (${c ? `ultima copia salvata ${esc(agoText(c.at))}, usata senza rete con l’età ricalcolata` : 'nessuna copia salvata'}), radar, previsioni del vento, collegamenti ai siti ufficiali, aggiornamenti.</p>`;
}

{ const narrow = window.innerWidth <= 900, pp = prefs.panels || {};
  for (const c of ['left-closed', 'right-closed', 'prof-closed']) { const on = narrow && c !== 'prof-closed' ? true : !!pp[c]; document.body.classList.toggle(c, on); state.panels[c] = on; }
  $('profToggle').textContent = state.panels['prof-closed'] ? 'Profilo ▴' : 'Profilo ▾'; }
setMode(prefs.mode === 'expert' ? 'expert' : 'beginner');
setTheme(['night', 'cockpit'].includes(prefs.theme) ? prefs.theme : 'day');
loadBestPack().catch(() => loadDemo()).then(() => { if (prefs.dim === '2d') setDim('2d'); renderDevices(); loadWeather(); renderOffline(); setTimeout(() => checkUpdates(false), 8000); });
