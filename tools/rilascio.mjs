// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Etichette di versione e pagina di rilascio, da GitHub Actions (workflow «App Android»).
//
// Legge CHANGELOG.md:
//  - per ogni versione con «commit <sha>» crea l'etichetta vX.Y.Z su quel commit, se manca;
//  - la versione più recente (la prima) è quella di package.json: se la sua etichetta manca la crea sul commit
//    attuale e pubblica la pagina di rilascio con l'APK e le note prese dal registro.
// Uso: node tools/rilascio.mjs <apk>          (in CI, con GH_TOKEN)
//      node tools/rilascio.mjs --controlla    (solo controlli, senza git né rete)
//      node tools/rilascio.mjs --canale <apk> (in CI, con GH_TOKEN = token del canale: pubblica la versione nel
//                                              repository pubblico degli aggiornamenti, vedi docs/rilasci.md)
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const CANALE = 'fringuello79/AerIA-aggiornamenti';
export const sha256File = f => createHash('sha256').update(readFileSync(f)).digest('hex');

export function parseChangelog(text) {
  const out = [], re = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})(?: · commit ([0-9a-f]{40}))?\s*$/gm;
  const heads = [...text.matchAll(re)];
  heads.forEach((m, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index : text.length;
    out.push({ version: m[1], date: m[2], commit: m[3] || null, notes: text.slice(m.index + m[0].length, end).trim() });
  });
  return out;
}
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

export function check(root = '.') {
  const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8')).version;
  const app = /export const VERSION = '([^']+)'/.exec(readFileSync(`${root}/web-prototype/src/version.js`, 'utf8'))?.[1];
  const log = parseChangelog(readFileSync(`${root}/CHANGELOG.md`, 'utf8'));
  const errs = [];
  if (pkg !== app) errs.push(`package.json (${pkg}) e web-prototype/src/version.js (${app}) non coincidono`);
  if (!log.length || log[0].version !== pkg) errs.push(`la prima versione di CHANGELOG.md (${log[0]?.version}) non è quella di package.json (${pkg})`);
  for (let i = 1; i < log.length; i++) {
    if (cmp(log[i - 1].version, log[i].version) <= 0) errs.push(`CHANGELOG.md: ${log[i - 1].version} dovrebbe venire dopo ${log[i].version}`);
    // la storia pubblica riparte dalla 0.20.0: le versioni precedenti non hanno commit
    if (!log[i].commit && cmp(log[i].version, '0.20.0') >= 0) errs.push(`CHANGELOG.md: la versione ${log[i].version} non indica il commit`);
  }
  return { pkg, log, errs };
}

const sh = (cmd, args, opt = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opt }).trim();
const hasTag = t => { try { sh('git', ['rev-parse', '-q', '--verify', `refs/tags/${t}`]); return true; } catch { return false; } };

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { pkg, log, errs } = check();
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  if (process.argv[2] === '--controlla') { console.log(`versione ${pkg}: registro coerente (${log.length} versioni)`); process.exit(0); }
  if (process.argv[2] === '--canale') {
    // canale di aggiornamento: un rilascio normale (non «pre-release», così è l'ultimo) per ogni versione nuova
    const apkC = process.argv[3], top = log[0], tag = `v${top.version}`, name = `AerIA-VFR-${pkg}.apk`;
    const tryC = args => { try { sh('gh', args); return true; } catch { return false; } };
    if (tryC(['release', 'view', tag, '--repo', CANALE])) { console.log(`canale: ${tag} già pubblicata`); process.exit(0); }
    sh('cp', [apkC, name]);
    const hash = sha256File(name);
    writeFileSync('note-canale.md', `${top.notes}\n\n---\n${name} SHA-256: ${hash}\nPrototipo: non usare per la navigazione.\n`);
    if (!tryC(['release', 'create', tag, name, '--repo', CANALE, '--title', `AerIA VFR ${pkg}`, '--notes-file', 'note-canale.md', '--latest'])) throw new Error(`canale: ${tag} non pubblicata`);
    console.log(`canale: ${tag} pubblicata in ${CANALE} (SHA-256 ${hash})`);
    process.exit(0);
  }
  const apk = process.argv[2];
  sh('git', ['fetch', '--tags', '--quiet', 'origin']);
  const tryRun = (cmd, args) => { try { sh(cmd, args); return true; } catch { return false; } };
  // 1. versione attuale: etichetta sul commit attuale e pagina di rilascio con l'APK (se non esiste già)
  const top = log[0], topTag = `v${top.version}`;
  if (!hasTag(topTag)) {
    sh('git', ['tag', '-a', topTag, 'HEAD', '-m', `AerIA VFR ${top.version}\n\n${top.notes}`]);
    if (tryRun('git', ['push', '--quiet', 'origin', `refs/tags/${topTag}`])) console.log(`etichetta ${topTag} sul commit attuale`);
    else {
      // due invii della stessa versione uno dopo l'altro: l'etichetta l'ha già creata l'altra esecuzione, che resta valida
      sh('git', ['tag', '-d', topTag]);
      sh('git', ['fetch', '--tags', '--quiet', '--force', 'origin']);
      if (!hasTag(topTag)) throw new Error(`etichetta ${topTag} non pubblicata`);
      console.log(`etichetta ${topTag} già creata da un'altra esecuzione: la tengo`);
    }
  }
  if (apk && !tryRun('gh', ['release', 'view', topTag])) {
    const name = `AerIA-VFR-${pkg}.apk`;
    sh('cp', [apk, name]);
    writeFileSync('note-rilascio.md', `${top.notes}\n\n---\n${name} SHA-256: ${sha256File(name)}\nAPK firmato con la chiave di AerIA (impronta in android/firma-sha256.txt): si installa sopra le versioni dalla 0.20.0 in poi.\nPrototipo: non usare per la navigazione.\n`);
    if (tryRun('gh', ['release', 'create', topTag, name, '--title', `AerIA VFR ${pkg}`, '--notes-file', 'note-rilascio.md', ...(pkg.startsWith('0.') ? ['--prerelease'] : [])])) console.log(`pagina di rilascio ${topTag} pubblicata con ${name}`);
    else if (tryRun('gh', ['release', 'view', topTag])) console.log(`pagina di rilascio ${topTag} già pubblicata da un'altra esecuzione`);
    else throw new Error(`pagina di rilascio ${topTag} non pubblicata`);
  }
  // 2. versioni precedenti: etichette sui commit del registro, al meglio. GitHub rifiuta al token del workflow le
  //    etichette su commit con una versione diversa dei file dei workflow: si prova con git e poi con l'API;
  //    se non si può, resta il registro (CHANGELOG.md) e l'etichetta va creata a mano (docs/rilasci.md).
  const repo = process.env.GITHUB_REPOSITORY;
  // con il segreto RILASCI_TOKEN (token personale con permesso «Workflows», vedi docs/rilasci.md) GitHub le accetta
  const tokRemote = process.env.RILASCI_TOKEN && repo ? `https://x-access-token:${process.env.RILASCI_TOKEN}@github.com/${repo}.git` : null;
  for (const e of log.slice(1)) {
    const tag = `v${e.version}`;
    if (hasTag(tag) || !e.commit) continue;
    const ok = (tryRun('git', ['tag', '-a', tag, e.commit, '-m', `AerIA VFR ${e.version}`]) && (tryRun('git', ['push', '--quiet', 'origin', `refs/tags/${tag}`]) || (tokRemote && tryRun('git', ['push', '--quiet', tokRemote, `refs/tags/${tag}`]))))
      || (repo && tryRun('gh', ['api', '-X', 'POST', `repos/${repo}/git/refs`, '-f', `ref=refs/tags/${tag}`, '-f', `sha=${e.commit}`]));
    console.log(ok ? `etichetta ${tag} su ${e.commit}` : `etichetta ${tag} non creata (permessi): da creare a mano`);
  }
}
