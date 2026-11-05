import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STARS, findStar } from '../src/data/stars.js';

test('catalog has unique names and sane fields', () => {
  const names = new Set(STARS.map((s) => s.name));
  assert.equal(names.size, STARS.length);
  for (const s of STARS) {
    assert.ok(s.distance_ly > 0, s.name);
    assert.ok(s.ra_hours >= 0 && s.ra_hours < 24, s.name);
    assert.ok(s.dec_deg >= -90 && s.dec_deg <= 90, s.name);
  }
});

test('findStar is case-insensitive and trims', () => {
  assert.equal(findStar('  proxima centauri ').name, 'Proxima Centauri');
  assert.equal(findStar('Nowhere'), undefined);
});

test('catalog is frozen', () => {
  assert.throws(() => { STARS[0].distance_ly = 1; });
});
