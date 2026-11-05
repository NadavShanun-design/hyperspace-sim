// Tests for equatorial -> Cartesian conversion and inter-star distances.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STARS, findStar } from '../src/data/stars.js';
import { equatorialToCartesian, starPosition, distanceBetween } from '../src/nav/coords.js';

const EPS = 1e-12;

function near(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected}, got ${actual}`);
}

const SUN = Object.freeze({ name: 'Sun', distance_ly: 0, ra_hours: 0, dec_deg: 0 });

test('cardinal directions map onto the ICRS axes', () => {
  const x = equatorialToCartesian(0, 0, 1);
  near(x.x, 1, EPS); near(x.y, 0, EPS); near(x.z, 0, EPS);
  const y = equatorialToCartesian(6, 0, 2);
  near(y.x, 0, EPS); near(y.y, 2, EPS); near(y.z, 0, EPS);
  const negX = equatorialToCartesian(12, 0, 3);
  near(negX.x, -3, EPS); near(negX.y, 0, EPS); near(negX.z, 0, EPS);
  const pole = equatorialToCartesian(17, 90, 5);
  near(pole.x, 0, EPS); near(pole.y, 0, EPS); near(pole.z, 5, EPS);
  const south = equatorialToCartesian(3, -90, 5);
  near(south.z, -5, EPS);
});

test('known off-axis point: RA 3h Dec 30 deg', () => {
  // ra = 45 deg, dec = 30 deg: x = y = cos30 * cos45 = sqrt(6)/4, z = 1/2.
  const p = equatorialToCartesian(3, 30, 1);
  near(p.x, Math.sqrt(6) / 4, EPS);
  near(p.y, Math.sqrt(6) / 4, EPS);
  near(p.z, 0.5, EPS);
});

test('vector length equals the distance for every catalog star', () => {
  for (const s of STARS) {
    const p = starPosition(s);
    near(Math.hypot(p.x, p.y, p.z), s.distance_ly, 1e-9, s.name);
  }
});

test('Sun -> Proxima distance equals the catalog distance', () => {
  const proxima = findStar('Proxima Centauri');
  near(distanceBetween(SUN, proxima), proxima.distance_ly, 1e-12);
});

test('distances are symmetric and zero to self', () => {
  for (const a of STARS) {
    near(distanceBetween(a, a), 0, EPS, a.name);
    for (const b of STARS) {
      assert.equal(distanceBetween(a, b), distanceBetween(b, a), `${a.name} <-> ${b.name}`);
    }
  }
});

test('triangle inequality holds across the catalog', () => {
  for (const a of STARS) {
    for (const b of STARS) {
      for (const c of STARS) {
        const direct = distanceBetween(a, c);
        const via = distanceBetween(a, b) + distanceBetween(b, c);
        assert.ok(direct <= via + 1e-9, `${a.name} -> ${b.name} -> ${c.name}`);
      }
    }
  }
});

test('Alpha Centauri A and B are a tight pair', () => {
  const a = findStar('Alpha Centauri A');
  const b = findStar('Alpha Centauri B');
  const sep = distanceBetween(a, b);
  // Same RA and distance, Dec differs by 0.0033 deg: small-angle separation d * dDec.
  near(sep, 4.365 * 0.0033 * Math.PI / 180, 1e-9);
  assert.ok(sep > 0 && sep < 0.001, `separation ${sep} ly`);
});

test('Proxima lies within a fraction of a light year of Alpha Centauri', () => {
  const sep = distanceBetween(findStar('Proxima Centauri'), findStar('Alpha Centauri A'));
  assert.ok(sep > 0.05 && sep < 0.3, `separation ${sep} ly`);
});

test('equatorialToCartesian rejects non-finite or non-number input with TypeError', () => {
  for (const bad of [NaN, Infinity, -Infinity, '1', null, undefined]) {
    assert.throws(() => equatorialToCartesian(bad, 0, 1), TypeError);
    assert.throws(() => equatorialToCartesian(0, bad, 1), TypeError);
    assert.throws(() => equatorialToCartesian(0, 0, bad), TypeError);
  }
});

test('equatorialToCartesian rejects out-of-range input with RangeError', () => {
  assert.throws(() => equatorialToCartesian(-0.1, 0, 1), RangeError);
  assert.throws(() => equatorialToCartesian(24, 0, 1), RangeError);
  assert.throws(() => equatorialToCartesian(0, 90.01, 1), RangeError);
  assert.throws(() => equatorialToCartesian(0, -90.01, 1), RangeError);
  assert.throws(() => equatorialToCartesian(0, 0, -1), RangeError);
});

test('starPosition and distanceBetween validate the star argument', () => {
  assert.throws(() => starPosition(null), TypeError);
  assert.throws(() => starPosition('Sirius A'), TypeError);
  assert.throws(() => starPosition({ ra_hours: 1, dec_deg: 0 }), TypeError);
  assert.throws(() => starPosition({ ra_hours: 25, dec_deg: 0, distance_ly: 1 }), RangeError);
  assert.throws(() => distanceBetween(STARS[0], undefined), TypeError);
});
