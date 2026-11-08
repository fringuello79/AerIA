// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Vista «Piano di volo»: modulo compilabile sul modello dell'Aeroclub dei Marsi, stampa, salvataggio, GPX.
// Riceve dall'app solo funzioni e dati (ctx): nessun calcolo di sicurezza qui, solo presentazione.
import { computeNavlog, alternateLeg, fuelPlan, weightBalance, planChecks, planToJson, planFromJson, routeToGpx, routeFromGpx,
  msaForLeg, decl, decimalYear, fmtHM, clock, FORM_ACM, REFERENCE_AIRCRAFT, KMH_PER_KT } from './navlog.js';
import { VERSION } from './version.js';

const LS_PLAN = 'airplanning.piano', LS_AC = 'airplanning.aerei';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* memoria non disponibile */ } };
const n1 = x => (Number.isFinite(x) ? x.toFixed(1).replace('.', ',') : '—');
const n0 = x => (Number.isFinite(x) ? String(Math.round(x)) : '—');
const deg = x => (Number.isFinite(x) ? String(Math.round(x) % 360 || 360).padStart(3, '0') + '°' : '—');

export function defaultPlanState() {
  return { aircraftId: 'acm-sierra', legs: [], alternate: '', reserveMin: 30, reserveL: '', altL: '', extraL: 0, load: { pilotKg: '', copilotKg: '', luggageKg: '', fuelL: '' },
    startTime: '', toTime: '', timeRef: 'UTC', takeoff: {}, landing: {}, from: '', to: '', speedUnit: '' };
}
export function initNavlog() {
  const st = { ...defaultPlanState(), ...load(LS_PLAN, {}) };
  // profili di riferimento dell'aeroclub sempre presenti; quelli creati dal pilota restano
  const saved = (load(LS_AC, null) || []).filter(a => !a.ref && a.id !== 'acm');
  const aircraft = [...REFERENCE_AIRCRAFT.map(a => structuredClone(a)), ...saved];
  if (!aircraft.some(a => a.id === st.aircraftId)) st.aircraftId = aircraft[0].id;
  return { st, aircraft };
}

// Calcolo del piano (log, carburante, peso e centraggio, controlli) senza disegnare la pagina: serve anche al riepilogo
// della vista Pianifica, che così si aggiorna appena cambia un dato del piano (8/11/2026).
export function computePlan(ctx) {
  const { nl } = ctx, st = nl.st;
  const ac = nl.aircraft.find(a => a.id === st.aircraftId) || nl.aircraft[0];
  const route = ctx.route();
  const fd = new Date((ctx.date() || new Date().toISOString().slice(0, 10)) + 'T12:00:00Z');
  const year = decimalYear(fd);
  const fields = ctx.fields();
  const alt = st.alternate ? fields.find(f => f.name === st.alternate) : null;
  const unit = st.speedUnit || ac.speedUnit || 'kt';
  // quota del tratto: quella della rotta (la stessa che si cambia nella vista Pianifica)
  const legsKt = route.slice(0, -1).map((p, k) => { const l = (st.legs || [])[k] || {};
    return { ...l, levelFt: Number.isFinite(p.altFt) ? p.altFt : undefined, ...(l.ias !== '' && l.ias != null ? { iasKt: Number(l.ias) / (unit === 'kmh' ? KMH_PER_KT : 1) } : {}) }; });
  const plan = { route, aircraft: ac, cruiseFt: ctx.cruise(), qnh: ctx.qnh(), toTime: st.toTime, legs: legsKt, alternate: alt ? { lon: alt.lon, lat: alt.lat, name: alt.name } : null };
  const env = {
    decl: (lon, lat) => decl(ctx.declGrid(), lon, lat, year),
    windAt: ctx.windAt, oatAt: ctx.oatAt,
    msaFt: (a, b) => msaForLeg(ctx.terrain, a, b),
    alternateNear: p => { const c = fields.filter(f => ctx.dist(f, p) > 1500).sort((x, y) => ctx.dist(x, p) - ctx.dist(y, p))[0]; return c ? { name: c.name, km: ctx.dist(c, p) / 1000 } : null; },
    freqsNear: p => { const f = ctx.fieldAt(p); return f ? f.freqs.filter(x => x.mhz).map(x => `${x.mhz}${x.name ? ' ' + x.name : ''}`) : []; },
  };
  const nav = route.length > 1 ? computeNavlog(plan, env) : { legs: [], totalKm: 0, totalMin: 0, tripFuelL: 0 };
  const altLeg = plan.alternate ? alternateLeg(plan, env) : null;
  const altManual = st.altL !== '' && st.altL != null && Number.isFinite(Number(st.altL));
  const reserveL = st.reserveL !== '' && st.reserveL != null ? st.reserveL : ac.reserveL;
  const fuel = fuelPlan({ tripFuelL: nav.tripFuelL, tripMin: nav.totalMin, altFuelL: altManual ? Number(st.altL) : (altLeg ? altLeg.fuelL : 0), altMin: altManual ? NaN : (altLeg ? altLeg.timeMin : 0),
    reserveMin: Number(st.reserveMin) || 0, reserveL, extraL: st.extraL, fuelFlowLh: ac.fuelFlowLh, density: ac.fuelDensity });
  const fuelOnBoard = st.load.fuelL !== '' && st.load.fuelL != null ? Number(st.load.fuelL) : (Number.isFinite(fuel.tof.L) ? Math.ceil(fuel.tof.L) : 0);
  const wb = weightBalance(ac, { ...st.load, fuelL: fuelOnBoard }, Number.isFinite(nav.tripFuelL) ? nav.tripFuelL : 0);
  const checks = route.length > 1 ? planChecks({ fuel, wb, fuelOnBoardL: fuelOnBoard, nav, ac }) : [];
  const dep = route.length ? ctx.fieldAt(route[0]) : null, dest = route.length > 1 ? ctx.fieldAt(route.at(-1)) : null;
  const fuelEntered = st.load.fuelL !== '' && st.load.fuelL != null && Number.isFinite(Number(st.load.fuelL));
  return { st, ac, route, year, fields, alt, unit, plan, env, nav, altLeg, altManual, reserveL, fuel, fuelOnBoard, fuelEntered, wb, checks, dep, dest };
}

export function renderNavlog(root, ctx) {
  const { nl, esc } = ctx, st = nl.st;
  const { ac, route, year, fields, alt, unit, plan, env, nav, altLeg, altManual, reserveL, fuel, fuelOnBoard, wb, checks, dep, dest } = computePlan(ctx);
  const wxDep = route.length ? ctx.wxNear(route[0]) : null, wxDest = route.length > 1 ? ctx.wxNear(route.at(-1)) : null;
  const sp = kt => (unit === 'kmh' ? n0(kt * KMH_PER_KT) : n0(kt)), spU = unit === 'kmh' ? 'km/h' : 'kt';
  const v = (o, k, d) => esc(o[k] ?? d ?? '');
  const inp = (path, val, attrs = '') => `<input data-p="${path}" value="${esc(val ?? '')}" ${attrs}>`;
  const result = { nav, fuel, wb, checks, altLeg, ac, dep, dest, fuelOnBoard };

  const rwyOpts = f => (f ? f.rwyInfo || [] : []);
  const legRows = nav.legs.map((l, k) => `<tr>
      <td><b>${esc(l.from)}</b> → <b>${esc(l.to)}</b><br>${inp(`route.${k}.altFt`, Number.isFinite(route[k].altFt) ? route[k].altFt : '', `placeholder="${l.levelFt}" inputmode="numeric" aria-label="Quota del tratto" class="sm"`)} ft</td>
      <td>${deg(l.tcM)}<small> M</small><br>${n1(l.distKm)} km<br><small>${n1(l.distNm)} NM</small></td>
      <td>${inp(`legs.${k}.ias`, st.legs[k]?.ias ?? '', `placeholder="${sp(l.iasKt)}" inputmode="numeric" class="xs" aria-label="IAS del tratto"`)}<br><small>TAS ${sp(l.tasKt)}</small></td>
      <td>${l.wind ? `${deg(l.wind.dir)}/${n0(l.wind.kt)}<br><small>${esc(l.wind.src || '')}</small>` : '—'}<br>
        ${inp(`legs.${k}.windDir`, st.legs[k]?.windDir ?? '', 'placeholder="dir" inputmode="numeric" class="xs" aria-label="Direzione del vento"')}${inp(`legs.${k}.windKt`, st.legs[k]?.windKt ?? '', 'placeholder="kt" inputmode="numeric" class="xs" aria-label="Intensità del vento"')}</td>
      <td><b>${deg(l.thM)}</b><br><small>WCA ${Number.isFinite(l.wca) ? (l.wca >= 0 ? '+' : '') + n0(l.wca) + '°' : '—'}</small></td>
      <td>${sp(l.gsKt)}</td>
      <td>${n0(l.timeMin)}′<br><small>tot ${fmtHM(l.cumMin)}</small></td>
      <td>${esc(l.eto) || '—'}</td>
      <td>${n1(l.fuelL)} l</td>
      <td>${n0(l.msaFt)} ft</td>
      <td>${l.alternate ? `${esc(l.alternate.name)}<br><small>${n1(l.alternate.km)} km</small>` : '—'}</td>
      <td>${l.freqs.map(esc).join('<br>') || '—'}</td></tr>`).join('');

  root.innerHTML = `
  <div class="nl-head">
    <h2>Piano di volo</h2>
    <div class="row">
      <button class="btn" type="button" data-act="print">Stampa o PDF</button>
      <button class="btn" type="button" data-act="save">Salva piano</button>
      <label class="btn">Apri piano o GPX<input type="file" accept=".json,.gpx,application/json,application/gpx+xml" data-act="open" hidden></label>
      <button class="btn" type="button" data-act="gpx">Esporta GPX</button>
    </div>
  </div>
  ${route.length < 2 ? '<p class="warn warn"><b>Rotta mancante</b>Disegna la rotta nella vista Pianifica (almeno due punti) o apri un piano salvato o un file GPX.</p>' : ''}
  <section class="nl-box"><h3>Volo</h3><div class="nl-grid">
    <label>Da ${inp('from', st.from || (route[0]?.name || ''))}</label>
    <label>A ${inp('to', st.to || (route.at(-1)?.name || ''))}</label>
    <label>Data <input value="${esc(ctx.date())}" disabled></label>
    <label>Avvio motore ${inp('startTime', st.startTime, 'type="time"')}</label>
    <label>Decollo ${inp('toTime', st.toTime, 'type="time"')}</label>
    <label>Quota di crociera <input value="${ctx.cruise()} ft" disabled></label>
  </div></section>

  <section class="nl-box"><h3>Aereo</h3><div class="nl-grid">
    <label>Profilo <select data-p="aircraftId">${nl.aircraft.map(a => `<option value="${esc(a.id)}" ${a.id === ac.id ? 'selected' : ''}>${esc(a.name)}${a.reg ? ' · ' + esc(a.reg) : ''}</option>`).join('')}</select></label>
    <label>Unità di velocità <select data-p="speedUnit"><option value="kt" ${unit === 'kt' ? 'selected' : ''}>nodi</option><option value="kmh" ${unit === 'kmh' ? 'selected' : ''}>km/h</option></select></label>
    <label>Orari <select data-p="timeRef"><option ${st.timeRef === 'UTC' ? 'selected' : ''}>UTC</option><option value="locale" ${st.timeRef === 'locale' ? 'selected' : ''}>ora locale</option></select></label>
    <button class="btn" type="button" data-act="newac">Nuovo aereo</button>
  </div>
  <details ${!ac.iasKt || !ac.fuelFlowLh || !ac.emptyKg ? 'open' : ''}><summary>Dati dell’aereo ${!ac.iasKt || !ac.fuelFlowLh || !ac.emptyKg ? '<b class="crit-t">(da completare)</b>' : ''}</summary>
    <div class="nl-grid">
      <label>Nome ${inp('ac.name', ac.name)}</label><label>Marche ${inp('ac.reg', ac.reg, 'placeholder="I-XXXX"')}</label><label>Tipo ${inp('ac.type', ac.type, 'placeholder="es. Tecnam P2002 Sierra"')}</label>
      <label>IAS di crociera (${spU}) ${inp('ac.iasKt', Number.isFinite(ac.iasKt) ? Math.round(unit === 'kmh' ? ac.iasKt * KMH_PER_KT : ac.iasKt) : '', `inputmode="decimal" data-unit="${unit}"`)}</label><label>Consumo (l/h) ${inp('ac.fuelFlowLh', ac.fuelFlowLh, 'inputmode="decimal"')}</label>
      <label>Densità carburante (kg/l) ${inp('ac.fuelDensity', ac.fuelDensity, 'inputmode="decimal"')}</label><label>Capacità serbatoi (l) ${inp('ac.tankL', ac.tankL, 'inputmode="decimal"')}</label>
      <label>Peso massimo al decollo (kg) ${inp('ac.mtowKg', ac.mtowKg, 'inputmode="decimal"')}</label><label>Peso a vuoto (kg) ${inp('ac.emptyKg', ac.emptyKg, 'inputmode="decimal"')}</label>
      <label>Baricentro minimo (m) ${inp('ac.cgMinM', ac.cgMinM, 'inputmode="decimal"')}</label><label>Baricentro massimo (m) ${inp('ac.cgMaxM', ac.cgMaxM, 'inputmode="decimal"')}</label>
      <label>Bagagli massimi (kg) ${inp('ac.maxLuggageKg', ac.maxLuggageKg, 'inputmode="decimal"')}</label>
      <label>Riserva predefinita (l) ${inp('ac.reserveL', ac.reserveL, 'inputmode="decimal"')}</label>
      <label>Velocità di salita Vy (${spU}) ${inp('ac.climb.kt', Number.isFinite(ac.climb?.kt) ? Math.round(unit === 'kmh' ? ac.climb.kt * KMH_PER_KT : ac.climb.kt) : '', 'inputmode="decimal"')}</label>
      <label>Rateo di salita al livello del mare (ft/min) ${inp('ac.climb.rocSlFpm', ac.climb?.rocSlFpm, 'inputmode="decimal" placeholder="500 prudente"')}</label>
      <label>Rateo di salita in quota (ft/min) ${inp('ac.climb.rocHiFpm', ac.climb?.rocHiFpm, 'inputmode="decimal"')}</label>
      <label>… alla quota di (ft) ${inp('ac.climb.hiFt', ac.climb?.hiFt, 'inputmode="decimal"')}</label>
      <label>Rateo di discesa pianificato (ft/min) ${inp('ac.descentFpm', ac.descentFpm, 'inputmode="decimal" placeholder="500"')}</label>
      <label>Vento al traverso massimo (kt) ${inp('ac.crosswindKt', ac.crosswindKt, 'inputmode="decimal"')}</label>
      <label>Efficienza di planata ${inp('ac.glideRatio', ac.glideRatio, 'inputmode="decimal"')}</label>
      ${['empty', 'pilot', 'copilot', 'fuel', 'luggage'].map(k => `<label>Braccio ${({ empty: 'peso a vuoto', pilot: 'pilota', copilot: 'copilota', fuel: 'carburante', luggage: 'bagagli' })[k]} (m) ${inp(`ac.arms.${k}`, ac.arms[k], 'inputmode="decimal"')}</label>`).join('')}
    </div><p class="note">${esc(ac.note || '')}</p></details></section>

  <section class="nl-box"><h3>Dati di decollo${dep ? ' · ' + esc(dep.name) : ''}</h3><div class="nl-grid">
    <label>Pista <select data-p="takeoff.rw"><option value=""></option>${rwyOpts(dep).map(r => `<option ${st.takeoff.rw === r.des ? 'selected' : ''}>${esc(r.des)}</option>`).join('')}</select></label>
    <label>Vento ${inp('takeoff.wind', st.takeoff.wind ?? (wxDep?.wind || ''))}</label>
    <label>Nubi ${inp('takeoff.clouds', st.takeoff.clouds ?? (wxDep?.clouds || ''))}</label>
    <label>QNH ${inp('takeoff.qnh', st.takeoff.qnh ?? (wxDep?.qnh || ''))}</label>
    <label>Temperatura ${inp('takeoff.temp', st.takeoff.temp ?? (wxDep?.temp || ''))}</label>
  </div>${wxDep ? `<p class="note">Proposta da ${esc(wxDep.src)}: verifica prima del decollo.</p>` : ''}</section>

  <section class="nl-box nl-wide"><h3>Log di navigazione</h3>
    <table class="nl-table"><thead><tr><th>Tratto · quota</th><th>Rotta M · distanza</th><th>IAS (${spU})</th><th>Vento (da/kt)</th><th>Prua M</th><th>GS (${spU})</th><th>LEG (tempo)</th><th>ETO ${esc(st.timeRef === 'locale' ? 'locale' : 'UTC')}</th><th>Carb.</th><th>MSA</th><th>Alternato in rotta</th><th>Frequenze</th></tr></thead>
    <tbody>${legRows}</tbody>
    <tfoot><tr><td><b>Totale</b></td><td>${n1(nav.totalKm)} km</td><td></td><td></td><td></td><td></td><td><b>${fmtHM(nav.totalMin)}</b></td><td>${esc(clock(st.toTime, nav.totalMin))}</td><td>${n1(nav.tripFuelL)} l</td><td></td><td></td><td></td></tr></tfoot></table>
    <p class="note">Rotte e prue magnetiche con la declinazione WMM2025 (circa +4° est in Marsica). Vento: inserito a mano oppure previsto da ICON-2I alla quota del tratto. TAS calcolata con l'atmosfera standard o con la temperatura del modello; IAS considerata uguale alla CAS. MSA: rilievo più alto entro 5 NM più 1000 ft, senza ostacoli artificiali. Tempi e carburante per tratto alla velocità di crociera: le salite (TOC) e le discese (TOD) sono nel profilo della vista Pianifica e nei controlli, non ancora nei tempi del log.</p></section>

  <section class="nl-box"><h3>Alternato</h3><div class="nl-grid">
    <label>Campo <select data-p="alternate"><option value="">nessuno</option>${(route.length ? fields.slice().sort((x, y) => ctx.dist(x, route.at(-1)) - ctx.dist(y, route.at(-1))) : fields).filter(f => !dest || f.name !== dest.name).slice(0, 30).map(f => `<option value="${esc(f.name)}" ${st.alternate === f.name ? 'selected' : ''}>${esc(f.icao || f.name)} · ${route.length ? n1(ctx.dist(f, route.at(-1)) / 1000) + ' km' : ''}</option>`).join('')}</select></label>
    ${altLeg ? `<div>Dalla destinazione: ${deg(altLeg.tcM)} M · ${n1(altLeg.distKm)} km · ${fmtHM(altLeg.timeMin)} · ${n1(altLeg.fuelL)} l</div>` : ''}
  </div></section>

  <section class="nl-box"><h3>Dati di atterraggio${dest ? ' · ' + esc(dest.name) : ''}</h3><div class="nl-grid">
    <label>Pista <select data-p="landing.rw"><option value=""></option>${rwyOpts(dest).map(r => `<option ${st.landing.rw === r.des ? 'selected' : ''}>${esc(r.des)}</option>`).join('')}</select></label>
    <label>QNH ${inp('landing.qnh', st.landing.qnh ?? (wxDest?.qnh || ''))}</label>
    <label>Vento ${inp('landing.wind', st.landing.wind ?? (wxDest?.wind || ''))}</label>
    <label>Temperatura ${inp('landing.temp', st.landing.temp ?? (wxDest?.temp || ''))}</label>
    <label>Lunghezza pista <input disabled value="${dest && (st.landing.rw ? rwyOpts(dest).find(r => r.des === st.landing.rw) : rwyOpts(dest)[0])?.lenM ? (st.landing.rw ? rwyOpts(dest).find(r => r.des === st.landing.rw) : rwyOpts(dest)[0]).lenM + ' m' : ''}"></label>
    <label>Quota del campo <input disabled value="${dest ? Math.round(dest.elevM * 3.28084) + ' ft' : ''}"></label>
    <label>Frequenza <input disabled value="${dest ? esc(dest.freqs.filter(f => f.mhz).map(f => f.mhz).join(' / ')) : ''}"></label>
  </div>${dest ? '<p class="note">Pista, quota e frequenza da openAIP: verificale sulla documentazione del campo.</p>' : ''}</section>

  <section class="nl-box"><h3>Carburante</h3>
    <table class="nl-table sm"><thead><tr><th></th><th>Litri</th><th>kg</th><th>Tempo</th></tr></thead><tbody>
      ${[['Tratta (LEG)', fuel.leg], [`Alternato (ALT${altLeg ? ', calcolato' : ''}; a mano ${inp('altL', st.altL, 'class="xs" inputmode="decimal" aria-label="Litri per l’alternato"')} l)`, fuel.alt],
        [`Riserva (RVE: ${inp('reserveL', st.reserveL, `class="xs" inputmode="decimal" placeholder="${ac.reserveL ?? ''}" aria-label="Litri di riserva"`)} l, oppure ${inp('reserveMin', st.reserveMin, 'class="xs" inputmode="numeric" aria-label="Minuti di riserva"')} min se i litri sono vuoti)`, fuel.rve], ['Minimo (MIN FUEL)', fuel.min],
        [`Extra (${inp('extraL', st.extraL, 'class="xs" inputmode="decimal" aria-label="Litri extra"')} l)`, fuel.extra], ['<b>Al decollo (T.O.F.)</b>', fuel.tof]]
        .map(([t, r]) => `<tr><td>${t}</td><td>${n1(r.L)}</td><td>${n1(r.kg)}</td><td>${fmtHM(r.min)}</td></tr>`).join('')}
    </tbody></table>
    <p>Autonomia con il carburante minimo al decollo (T.O.F.): <b>${fmtHM(fuel.enduranceMin)}</b>.</p>
    <div class="nl-onboard"><label><b>Carburante a bordo</b> ${inp('load.fuelL', st.load.fuelL, `class="sm" inputmode="decimal" aria-label="Carburante a bordo, litri" placeholder="${Number.isFinite(fuel.tof.L) ? Math.ceil(fuel.tof.L) : ''}"`)} litri</label>
      <span>${(() => { const ok = st.load.fuelL !== '' && st.load.fuelL != null && Number.isFinite(Number(st.load.fuelL)); if (!ok) return 'non indicato: si usa il minimo al decollo (T.O.F.)'; const L = Number(st.load.fuelL), endu = ac.fuelFlowLh ? L / ac.fuelFlowLh * 60 : NaN, spare = L - (fuel.min?.L ?? NaN); return `autonomia <b>${fmtHM(endu)}</b>${Number.isFinite(spare) ? (spare >= 0 ? ` · <b style="color:var(--ok)">${Math.floor(spare)} l</b> oltre volo, alternato e riserva` : ` · <b style="color:var(--crit)">mancano ${Math.ceil(-spare)} l</b>`) : ''}${ac.tankL && L > ac.tankL ? ` · <b style="color:var(--crit)">più della capacità (${ac.tankL} l)</b>` : ''}`; })()}</span></div>
    <p class="note">Riserva: quella del profilo dell’aereo (10 litri per l’Aeroclub dei Marsi), oppure in minuti (30 minuti nel VFR diurno secondo la Part-NCO). Adattala alle regole del tuo operatore.</p></section>

  <section class="nl-box"><h3>Peso e centraggio</h3>
    <div class="nl-grid">
      <label>Pilota (kg) ${inp('load.pilotKg', st.load.pilotKg, 'inputmode="decimal"')}</label>
      <label>Copilota (kg) ${inp('load.copilotKg', st.load.copilotKg, 'inputmode="decimal"')}</label>
      <label>Bagagli (kg) ${inp('load.luggageKg', st.load.luggageKg, 'inputmode="decimal"')}</label>
    </div>
    <table class="nl-table sm"><thead><tr><th></th><th>kg</th><th>Braccio (m)</th><th>Momento (kg·m)</th></tr></thead><tbody>
      ${wb.items.map(i => `<tr><td>${esc(i.label)}</td><td>${n1(i.kg)}</td><td>${String(i.arm).replace('.', ',')}</td><td>${n1(i.moment)}</td></tr>`).join('')}
      <tr><td><b>Al decollo</b></td><td><b>${n1(wb.to.kg)}</b></td><td><b>${Number.isFinite(wb.to.cg) ? wb.to.cg.toFixed(3).replace('.', ',') : '—'}</b></td><td>${n1(wb.to.moment)}</td></tr>
      <tr><td>All’atterraggio</td><td>${n1(wb.ldg.kg)}</td><td>${Number.isFinite(wb.ldg.cg) ? wb.ldg.cg.toFixed(3).replace('.', ',') : '—'}</td><td>${n1(wb.ldg.moment)}</td></tr>
    </tbody></table>
    <p class="note">Limiti: peso massimo ${ac.mtowKg} kg, baricentro ${String(ac.cgMinM).replace('.', ',')} – ${String(ac.cgMaxM).replace('.', ',')} m dal riferimento.</p></section>`;

  // eventi
  const set = (path, val) => {
    const parts = path.split('.');
    if (parts[0] === 'ac') {
      let o = ac; for (const p of parts.slice(1, -1)) o = (o[p] ??= {});
      const k = parts.at(-1), num = val === '' ? null : Number(String(val).replace(',', '.'));
      o[k] = ['name', 'reg', 'type'].includes(k) ? val : (['iasKt', 'kt', 'glideKt'].includes(k) && num != null && unit === 'kmh' ? num / KMH_PER_KT : num);
      // un profilo di riferimento modificato diventa una copia personale; il riferimento resta intatto
      if (ac.ref) {
        const i = nl.aircraft.indexOf(ac), orig = REFERENCE_AIRCRAFT.find(a => a.id === ac.id);
        Object.assign(ac, { ref: false, id: `${ac.id}-${Date.now()}`, name: `${ac.name.replace(' (riferimento ACM)', '')} (personale)` });
        nl.aircraft.splice(i, 0, structuredClone(orig));
        st.aircraftId = ac.id; save(LS_PLAN, st);
      }
      save(LS_AC, nl.aircraft.filter(a => !a.ref));
      return;
    }
    if (parts[0] === 'route') { ctx.setLegAlt(Number(parts[1]), val); return; }
    if (parts[0] === 'legs') { const i = Number(parts[1]); st.legs[i] = { ...(st.legs[i] || {}), [parts[2]]: val }; }
    else if (parts.length === 2) st[parts[0]] = { ...(st[parts[0]] || {}), [parts[1]]: val };
    else st[parts[0]] = val;
    save(LS_PLAN, st);
  };
  // dopo «Invio» il campo del carburante a bordo si chiude, così autonomia e margine si ridisegnano subito
  root.querySelectorAll('[data-p]').forEach(el => el.addEventListener('change', () => { set(el.dataset.p, el.value); if (el.dataset.p === 'load.fuelL') el.blur(); ctx.changed(); }));
  root.querySelector('[data-act="print"]').onclick = () => { buildPrint(ctx.printRoot, result, st, ctx, plan, wxDep, wxDest); window.print(); };
  root.querySelector('[data-act="save"]').onclick = () => ctx.download(`piano-${(st.from || 'volo').replace(/\W+/g, '_')}-${ctx.date()}.json`, planToJson({ route, state: st, aircraft: ac, cruiseFt: ctx.cruise(), date: ctx.date() }), 'application/json');
  root.querySelector('[data-act="gpx"]').onclick = () => ctx.download(`rotta-${ctx.date()}.gpx`, routeToGpx(route, `${st.from || ''} - ${st.to || ''}`), 'application/gpx+xml');
  root.querySelector('[data-act="newac"]').onclick = () => { const a = { ...structuredClone(ac), ref: false, id: `ac${Date.now()}`, name: `Nuovo aereo (da ${ac.name})` }; nl.aircraft.push(a); st.aircraftId = a.id; save(LS_AC, nl.aircraft.filter(x => !x.ref)); save(LS_PLAN, st); ctx.changed(); };
  root.querySelector('[data-act="open"]').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      if (/\.gpx$/i.test(f.name) || /<gpx/i.test(text.slice(0, 500))) ctx.setRoute(routeFromGpx(text));
      else {
        const p = planFromJson(text);
        if (p.state) Object.assign(st, defaultPlanState(), p.state);
        if (p.aircraft) { const i = nl.aircraft.findIndex(a => a.id === p.aircraft.id); if (i >= 0) nl.aircraft[i] = p.aircraft; else nl.aircraft.push(p.aircraft); st.aircraftId = p.aircraft.id; }
        save(LS_AC, nl.aircraft.filter(a => !a.ref)); save(LS_PLAN, st);
        ctx.setRoute(p.route, p.cruiseFt);
      }
    } catch (err) { ctx.error(`File non letto: ${err.message}`); }
  };
  return result;
}

// Stampa sul modello del modulo cartaceo (due pagine A4). ETO calcolati; RETO, ATO e ritardi restano da scrivere in volo.
function buildPrint(el, r, st, ctx, plan, wxDep, wxDest) {
  const { esc } = ctx, nav = r.nav, f = r.fuel, wb = r.wb, ac = r.ac;
  const unit = st.speedUnit || ac.speedUnit || 'kt';
  const sp = kt => (unit === 'kmh' ? n0(kt * KMH_PER_KT) : n0(kt));
  // come nel modulo compilato dall'aeroclub: LEG = minuti del tratto, T.T. = tempo progressivo; la prua va nella cella della rotta
  const rows = nav.legs.map(l => `<tr><td class="wp"><b>${esc(l.from)}</b><div class="lv">${l.levelFt} ft</div><b>${esc(l.to)}</b></td>
    <td>${deg(l.tcM)}<br><small>HDG ${deg(l.thM)}</small><hr>${n1(l.distKm)}</td><td>${sp(l.iasKt)}<hr>${n0(l.timeMin)}</td><td><hr>${fmtHM(l.cumMin)}</td>
    <td>${esc(l.eto)}</td><td></td><td></td><td></td><td>${sp(l.gsKt)}</td><td>${l.alternate ? esc(l.alternate.name) + ' ' + n1(l.alternate.km) + ' km' : ''}</td><td>${l.freqs.map(esc).join('<br>')}</td></tr>`).join('');
  const blank = '<tr><td class="wp"><div class="lv"></div></td>' + '<td></td>'.repeat(10) + '</tr>';
  const fr = (t, x) => `<tr><td>${t}</td><td>${n1(x.L)}</td><td>${n1(x.kg)}</td><td>${fmtHM(x.min)}</td><td>${t === 'T.O.F.' ? fmtHM(f.enduranceMin) : ''}</td></tr>`;
  const dest = r.dest, rw = dest && (st.landing.rw ? dest.rwyInfo.find(x => x.des === st.landing.rw) : dest.rwyInfo[0]);
  const demo = ac.demo ? '<div class="pf-demo">ESEMPIO CON DATI DELL’AEREO INVENTATI: non usare per volare.</div>' : '';
  el.innerHTML = `<div class="pf-page">${demo}
    <table class="pf"><tr><td colspan="6">FROM <b>${esc(st.from || plan.route[0]?.name || '')}</b></td><td colspan="4">TO <b>${esc(st.to || plan.route.at(-1)?.name || '')}</b></td><td>DATA <b>${esc(ctx.date())}</b></td></tr>
    <tr><td colspan="2">T.O. DATA</td><td>RW <b>${esc(st.takeoff.rw || '')}</b></td><td colspan="2">WIND <b>${esc(st.takeoff.wind ?? wxDep?.wind ?? '')}</b></td><td colspan="2">CLOUDS <b>${esc(st.takeoff.clouds ?? wxDep?.clouds ?? '')}</b></td><td colspan="2">QNH <b>${esc(st.takeoff.qnh ?? wxDep?.qnh ?? '')}</b></td><td>T° <b>${esc(st.takeoff.temp ?? wxDep?.temp ?? '')}</b></td><td>START <b>${esc(st.startTime)}</b><br>T.O. <b>${esc(st.toTime)}</b> ${st.timeRef === 'locale' ? 'loc.' : 'UTC'}</td></tr></table>
    <table class="pf log"><thead><tr><th>WAY POINT<br>LEVEL<br>WAY POINT</th><th>TRACK M<hr>DIST. km</th><th>IAS ${unit === 'kmh' ? 'km/h' : 'kt'}<hr>LEG min</th><th>P.T.<hr>T.T.</th><th>ETO ${st.timeRef === 'locale' ? 'loc.' : 'UTC'}</th><th>RETO</th><th>ATO</th><th>DELAY</th><th>GS</th><th>ALTERN ON TRACK</th><th>FREQ.</th></tr></thead>
    <tbody>${rows}${blank.repeat(Math.max(0, 9 - nav.legs.length))}</tbody></table>
    <table class="pf"><tr><td>LANDING DATA</td><td>RW <b>${esc(st.landing.rw || rw?.des || '')}</b></td><td>QNH <b>${esc(st.landing.qnh ?? wxDest?.qnh ?? '')}</b></td><td>WIND <b>${esc(st.landing.wind ?? wxDest?.wind ?? '')}</b></td><td>T° <b>${esc(st.landing.temp ?? wxDest?.temp ?? '')}</b></td><td>RW LENGTH <b>${rw?.lenM ? rw.lenM + ' m' : ''}</b></td><td>FIELD ELEV. <b>${dest ? Math.round(dest.elevM * 3.28084) + ' ft' : ''}</b></td><td>FREQ. <b>${dest ? esc(dest.freqs.filter(x => x.mhz).map(x => x.mhz).join(' / ')) : ''}</b></td></tr>
    <tr><td colspan="4">HOURS METER</td><td colspan="4">BLOCK TIME</td></tr></table>
    <p class="pf-note">Alternato: ${plan.alternate ? esc(plan.alternate.name) + (r.altLeg ? ` · ${deg(r.altLeg.tcM)} M · ${n1(r.altLeg.distKm)} km · ${fmtHM(r.altLeg.timeMin)}` : '') : 'nessuno'} · Aereo: ${esc([ac.name, ac.reg, ac.type].filter(Boolean).join(' · '))} · Preparato con AerIA VFR ${VERSION} (prototipo: verificare ogni dato su fonti ufficiali).</p>
  </div><div class="pf-page">${demo}
    <table class="pf"><thead><tr><th>FUEL</th><th>Lit.</th><th>Kg.</th><th>Flight Time</th><th>Endurance</th></tr></thead><tbody>
    ${fr('LEG.', f.leg)}${fr('ALT.', f.alt)}${fr('RVE', f.rve)}${fr('MIN FUEL', f.min)}${fr('EXTRA', f.extra)}${fr('T.O.F.', f.tof)}</tbody></table>
    <table class="pf"><thead><tr><th colspan="5">WEIGHT &amp; BALANCE · max T.O.W. ${ac.mtowKg} kg</th><th colspan="2">LIMIT ${String(ac.cgMinM).replace('.', ',')} – ${String(ac.cgMaxM).replace('.', ',')} m</th></tr>
    <tr><th>EMPTY W</th><th>PILOT</th><th>CO PILOT</th><th>FUEL</th><th>LUGGAGES</th><th>T.O.W.</th><th>C.G.</th></tr></thead><tbody>
    <tr>${wb.items.map(i => `<td>${n1(i.kg)}</td>`).join('')}<td><b>${n1(wb.to.kg)}</b></td><td><b>${Number.isFinite(wb.to.cg) ? wb.to.cg.toFixed(3).replace('.', ',') : ''}</b></td></tr>
    <tr>${wb.items.map(i => `<td>arm ${String(i.arm).replace('.', ',')}</td>`).join('')}<td colspan="2"></td></tr>
    <tr>${wb.items.map(i => `<td>${n1(i.moment)}</td>`).join('')}<td colspan="2">MOMENT ${n1(wb.to.moment)}</td></tr></tbody></table>
    ${r.checks.length ? `<div class="pf-checks"><b>Controlli:</b><ul>${r.checks.map(c => `<li>${esc(c.title)}: ${esc(c.text)}</li>`).join('')}</ul></div>` : ''}
  </div>`;
}
