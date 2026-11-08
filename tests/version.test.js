// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Versione: package.json, app e registro delle versioni devono coincidere; il registro è ordinato e ogni versione
// pubblicata indica il commit da cui è stata creata (serve al workflow per creare le etichette).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { check, parseChangelog } from '../tools/rilascio.mjs';
import { VERSION } from '../web-prototype/src/version.js';
import { planToJson, routeToGpx } from '../web-prototype/src/navlog.js';

const root = fileURLToPath(new URL('..', import.meta.url));

test('versione coerente in package.json, app e CHANGELOG.md', () => {
  const { pkg, log, errs } = check(root);
  assert.deepEqual(errs, []);
  assert.equal(pkg, VERSION);
  assert.equal(log.at(-1).version, '0.1.0', 'il registro parte dalla 0.1.0');
  assert.ok(log.length >= 12);
});

test('lettura del registro: versione, data, commit, note', () => {
  const t = '# x\n\n## [0.2.0] - 2026-11-07\n\n- b\n\n## [0.1.0] - 2026-11-06 · commit ' + 'a'.repeat(40) + '\n\n- a\n';
  const l = parseChangelog(t);
  assert.deepEqual(l.map(e => [e.version, e.date, e.commit, e.notes]), [['0.2.0', '2026-11-07', null, '- b'], ['0.1.0', '2026-11-06', 'a'.repeat(40), '- a']]);
});

test('la versione compare nei file di piano e nei GPX', () => {
  assert.equal(JSON.parse(planToJson({ route: [] })).app, `AerIA VFR ${VERSION}`);
  assert.match(routeToGpx([{ lon: 13, lat: 42, name: 'A' }]), new RegExp(`creator="AerIA VFR ${VERSION.replace(/\./g, '\\.')}"`));
});
