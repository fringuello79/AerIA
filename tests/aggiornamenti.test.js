// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, compareVersions, pickUpdate, sha256Of, notesOf, shouldCheck, CHECK_EVERY_MS, UPDATE_CHANNELS } from '../web-prototype/src/update.js';

const H = 'a'.repeat(64), H2 = 'b'.repeat(64);
const rel = (tag, extra = {}) => ({ tag_name: tag, draft: false, prerelease: true, html_url: `https://github.com/x/y/releases/${tag}`, published_at: '2026-11-08T10:00:00Z',
  body: '### Volo\n- **Liste di controllo** dell’aeroclub\n- Aggiornamento automatico\n', assets: [{ name: `AerIA-VFR-${tag.slice(1)}.apk`, size: 31e6, digest: `sha256:${H}`, browser_download_url: `https://github.com/x/y/releases/download/${tag}/AerIA-VFR-${tag.slice(1)}.apk` }], ...extra });

test('numeri di versione', () => {
  assert.deepEqual(parseVersion('v0.18.0'), [0, 18, 0]);
  assert.deepEqual(parseVersion('0.18.0+57'), [0, 18, 0]);
  assert.equal(parseVersion('ultima'), null);
  assert.equal(compareVersions('0.18.0', '0.17.9'), 1);
  assert.equal(compareVersions('0.9.0', '0.10.0'), -1);    // confronto numerico, non alfabetico
  assert.equal(compareVersions('1.0.0', 'v1.0.0'), 0);
  assert.ok(Number.isNaN(compareVersions('x', '1.0.0')));
});

test('scelta dell’aggiornamento: la versione più alta, più nuova di quella installata, con APK', () => {
  const list = [rel('v0.17.0'), rel('v0.19.0'), rel('v0.18.0'), rel('v0.20.0', { draft: true }), rel('v0.21.0', { assets: [] })];
  const u = pickUpdate(list, '0.17.0');
  assert.equal(u.version, '0.19.0');
  assert.equal(u.sha256, H);
  assert.match(u.url, /^https:\/\/github\.com\//);
  assert.deepEqual(u.notes, ['Liste di controllo dell’aeroclub', 'Aggiornamento automatico']);
  assert.equal(pickUpdate(list, '0.19.0'), null);           // già aggiornato
  assert.equal(pickUpdate([rel('v0.16.0')], '0.17.0'), null); // mai una versione più vecchia
  assert.equal(pickUpdate(null, '0.17.0'), null);
});

test('impronta SHA-256 dal campo digest o dalle note', () => {
  const r = rel('v0.18.0');
  assert.equal(sha256Of(r, r.assets[0]), H);
  const noDigest = { ...r.assets[0], digest: undefined };
  assert.equal(sha256Of({ body: `AerIA-VFR-0.18.0.apk SHA-256: ${H2}` }, noDigest), H2);
  assert.equal(sha256Of({ body: 'nessuna impronta' }, noDigest), '');
  assert.deepEqual(notesOf(`- prima\n- SHA-256: ${H}\n* seconda`), ['prima', 'seconda']);
});

test('quando controllare: con rete, a terra, ogni 6 ore', () => {
  const now = Date.UTC(2026, 10, 8, 10);
  assert.equal(shouldCheck({ online: true, airborne: false, lastCheck: 0, now }), true);
  assert.equal(shouldCheck({ online: false, airborne: false, lastCheck: 0, now }), false);
  assert.equal(shouldCheck({ online: true, airborne: true, lastCheck: 0, now, manual: true }), false); // in volo mai
  assert.equal(shouldCheck({ online: true, airborne: false, lastCheck: now - CHECK_EVERY_MS + 60e3, now }), false);
  assert.equal(shouldCheck({ online: true, airborne: false, lastCheck: now - CHECK_EVERY_MS + 60e3, now, manual: true }), true);
  assert.equal(shouldCheck({ online: true, airborne: false, lastCheck: 0, now, enabled: false }), false);
  assert.ok(UPDATE_CHANNELS.every(u => u.startsWith('https://api.github.com/repos/fringuello79/')));
});
