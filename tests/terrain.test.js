// AerIA VFR · © 2026 fringuello79 (Avezzano). Tutti i diritti riservati.
// Terreno a tessere: decodifica dei pacchetti, quota «massimo per blocco», precedenza delle griglie fini,
// caricamento delle tessere quando servono.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodePackGrid, gridFromPack, gridElev, Terrain } from '../web-prototype/src/terrain.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/terrain-velino-rowdelta.json', import.meta.url)));

test('decodifica «int16le-rowdelta-gzip-base64» identica a numpy (ritaglio reale del Velino)', async () => {
  const d = await decodePackGrid(fx, fx.w, fx.h);
  let sum = 0, max = -Infinity, at = null;
  d.forEach((v, i) => { sum += v; if (v > max) { max = v; at = [Math.floor(i / fx.w), i % fx.w]; } });
  assert.equal(sum, fx.sum);
  assert.equal(max, fx.max);
  assert.deepEqual(at, fx.argmax);
  assert.equal(d[0], fx.corner);
  assert.equal(d[d.length - 1], fx.last);
});

test('decodifica «int16le-base64» e controllo delle dimensioni', async () => {
  const a = new Int16Array([-5, 0, 1200, 32000]);
  const b64 = Buffer.from(a.buffer).toString('base64');
  assert.deepEqual([...await decodePackGrid({ encoding: 'int16le-base64', data: b64 }, 2, 2)], [-5, 0, 1200, 32000]);
  await assert.rejects(decodePackGrid({ encoding: 'int16le-base64', data: b64 }, 3, 2), /incompleta/);
});

test('differenze per riga con salti oltre Int16 (mare a -5 m, cima a 32000 m) senza errori di overflow', async () => {
  const { gzipSync } = await import('node:zlib');
  const vals = new Int16Array([-5, 32000, -32000, 100]);
  const d = new Int16Array(4); d[0] = vals[0]; for (let i = 1; i < 4; i++) d[i] = (vals[i] - vals[i - 1]) << 16 >> 16;
  const data = gzipSync(Buffer.from(d.buffer)).toString('base64');
  assert.deepEqual([...await decodePackGrid({ encoding: 'int16le-rowdelta-gzip-base64', data }, 4, 1)], [-5, 32000, -32000, 100]);
});

test('griglia «massimo per blocco»: si usa il blocco che contiene il punto, mai la media con i vicini', async () => {
  const g = gridFromPack({ ...fx, key: 'velino', blockMax: true }, await decodePackGrid(fx, fx.w, fx.h));
  const [r, c] = fx.argmax;
  const lonC = fx.cx0 + c * fx.dx, latC = fx.cy0 + r * fx.dy;
  // bordo del blocco della cima (a 0,49 blocchi dal centro): resta la quota della cima
  assert.equal(gridElev(g, lonC + 0.49 * fx.dx, latC), fx.max);
  assert.equal(gridElev(g, lonC, latC - 0.49 * fx.dy), fx.max);
  // la stessa griglia interpolata scenderebbe sotto la cima
  const lin = { ...g, blockMax: false };
  assert.ok(gridElev(lin, lonC + 0.49 * fx.dx, latC) < fx.max);
  // fuori dalla griglia
  assert.equal(gridElev(g, fx.cx0 - fx.dx, latC), undefined);
});

test('Terrain: la tessera fine ha la precedenza sulla griglia d’insieme e si carica solo quando serve', async () => {
  const coarse = { key: 'overview', cx0: 13.0, cy0: 43.0, dx: 1, dy: -1, w: 2, h: 2, data: new Int16Array([3000, 3000, 3000, 3000]), nodata: -32768, blockMax: true, bounds: { lonMin: 12.5, lonMax: 14.5, latMin: 41.5, latMax: 43.5 } };
  const t = new Terrain();
  t.add(coarse);
  t.regionBounds = coarse.bounds;
  let loads = 0;
  t.setTiles([{ key: 'velino', bounds: { lonMin: fx.cx0 - fx.dx / 2, lonMax: fx.cx0 + (fx.w - 0.5) * fx.dx, latMin: fx.cy0 + (fx.h - 0.5) * fx.dy, latMax: fx.cy0 - fx.dy / 2 } }],
    async rec => { loads++; return gridFromPack({ ...fx, key: rec.key, blockMax: true }, await decodePackGrid(fx, fx.w, fx.h)); });
  const p = [fx.cx0 + 10 * fx.dx, fx.cy0 + 10 * fx.dy];
  assert.equal(t.elevM(...p), 3000, 'prima del caricamento vale la griglia d’insieme (più alta, prudente)');
  assert.deepEqual(t.missing({ lonMin: p[0] - 0.001, lonMax: p[0] + 0.001, latMin: p[1] - 0.001, latMax: p[1] + 0.001 }), ['velino']);
  await Promise.all([t.ensure({ lonMin: 13.3, lonMax: 13.5, latMin: 42.1, latMax: 42.2 }), t.ensure({ lonMin: 13.3, lonMax: 13.5, latMin: 42.1, latMax: 42.2 })]);
  assert.equal(loads, 1, 'due richieste contemporanee caricano la tessera una volta sola');
  assert.ok(t.elevM(...p) < 3000 && t.elevM(...p) > 1000);
  assert.deepEqual(t.missing({ lonMin: 13.3, lonMax: 13.5, latMin: 42.1, latMax: 42.2 }), []);
  assert.deepEqual(t.bounds(), coarse.bounds);
  // area senza tessere fini: nessun caricamento
  assert.equal(await t.ensure({ lonMin: 14.0, lonMax: 14.2, latMin: 41.6, latMax: 41.7 }), 0);
});
