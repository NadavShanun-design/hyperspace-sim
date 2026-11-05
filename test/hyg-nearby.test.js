import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HEADER = 'hyg_id,name,distance_ly,ra_hours,dec_deg,spectral_type,constellation,apparent_magnitude';
const lines = readFileSync(new URL('../data/hyg-nearby.csv', import.meta.url), 'utf8').trimEnd().split('\n');
const rows = lines.slice(1).map((line) => line.split(','));

test('hyg-nearby.csv has the expected header', () => {
  assert.equal(lines[0], HEADER);
});

test('every row has 8 sane fields', () => {
  for (const r of rows) {
    assert.equal(r.length, 8, r.join(','));
    const [id, name, dist, ra, dec, , , mag] = r;
    assert.match(id, /^\d+$/, name);
    assert.ok(name.length > 0, id);
    assert.ok(Number(dist) > 0, name);
    assert.ok(Number(ra) >= 0 && Number(ra) < 24, name);
    assert.ok(Number(dec) >= -90 && Number(dec) <= 90, name);
    assert.ok(Number.isFinite(Number(mag)), name);
  }
});

test('ids and names are unique', () => {
  assert.equal(new Set(rows.map((r) => r[0])).size, rows.length);
  assert.equal(new Set(rows.map((r) => r[1])).size, rows.length);
});

test('rows are sorted nearest first', () => {
  for (let i = 1; i < rows.length; i++) {
    assert.ok(Number(rows[i][2]) >= Number(rows[i - 1][2]), rows[i][1]);
  }
});
