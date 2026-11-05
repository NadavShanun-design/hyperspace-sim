// Tests for Dijkstra route planning over the Sun plus the star catalog.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STARS, findStar } from '../src/data/stars.js';
import { starPosition } from '../src/nav/coords.js';
import { planRoute, SUN_NAME } from '../src/nav/route.js';

function near(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected}, got ${actual}`);
}

// Independent all-pairs shortest paths (Floyd-Warshall) used to check Dijkstra's optimality.
function floydWarshall(stars, maxJumpLy) {
  const pos = [{ x: 0, y: 0, z: 0 }, ...stars.map(starPosition)];
  const n = pos.length;
  const d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => {
    if (i === j) return 0;
    const len = Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y, pos[i].z - pos[j].z);
    return len <= maxJumpLy ? len : Infinity;
  }));
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
      }
    }
  }
  return d;
}

// Build a synthetic star from a Cartesian point, for hand-checkable geometries.
function starAt(name, x, y, z) {
  const r = Math.hypot(x, y, z);
  let ra = Math.atan2(y, x) * 12 / Math.PI;
  if (ra < 0) ra += 24;
  return { name, distance_ly: r, ra_hours: ra, dec_deg: Math.asin(z / r) * 180 / Math.PI };
}

test('Sun -> Proxima with a generous jump is one leg of catalog length', () => {
  const route = planRoute('Sun', 'Proxima Centauri', 10);
  assert.deepEqual(route.path, ['Sun', 'Proxima Centauri']);
  assert.equal(route.legs.length, 1);
  near(route.totalLy, findStar('Proxima Centauri').distance_ly, 1e-12);
  near(route.legs[0].distanceLy, 4.2465, 1e-12);
});

test('names are matched case-insensitively and returned canonically', () => {
  const route = planRoute('  sun ', 'alpha centauri b', 5);
  assert.equal(route.path[0], SUN_NAME);
  assert.equal(route.path[route.path.length - 1], 'Alpha Centauri B');
});

test('same start and destination is an empty route', () => {
  assert.deepEqual(planRoute('Vega', 'vega', 1), { path: ['Vega'], legs: [], totalLy: 0 });
});

test('a short max jump forces a multi-hop route to Vega', () => {
  const direct = findStar('Vega').distance_ly;
  // Vega's nearest catalog neighbour is Altair (~14.6 ly), so 16 ly jumps reach it only via relays.
  const maxJump = 16;
  const route = planRoute('Sun', 'Vega', maxJump);
  assert.ok(route, 'Vega should be reachable with 16 ly jumps');
  assert.ok(route.path.length > 2, `expected multi-hop, got ${route.path.join(' -> ')}`);
  assert.equal(route.legs.length, route.path.length - 1);
  let sum = 0;
  route.legs.forEach((leg, i) => {
    assert.equal(leg.from, route.path[i]);
    assert.equal(leg.to, route.path[i + 1]);
    assert.ok(leg.distanceLy <= maxJump, `${leg.from} -> ${leg.to} is ${leg.distanceLy} ly`);
    sum += leg.distanceLy;
  });
  near(route.totalLy, sum, 1e-9);
  assert.ok(route.totalLy >= direct - 1e-9, 'multi-hop cannot beat the straight line');
});

test('route length matches an independent Floyd-Warshall for every pair', () => {
  const names = [SUN_NAME, ...STARS.map((s) => s.name)];
  for (const maxJump of [4, 6, 8, 12, 30]) {
    const fw = floydWarshall(STARS, maxJump);
    for (let i = 0; i < names.length; i++) {
      for (let j = 0; j < names.length; j++) {
        const route = planRoute(names[i], names[j], maxJump);
        if (fw[i][j] === Infinity) {
          assert.equal(route, null, `${names[i]} -> ${names[j]} @ ${maxJump}`);
        } else {
          near(route.totalLy, fw[i][j], 1e-9, `${names[i]} -> ${names[j]} @ ${maxJump}`);
        }
      }
    }
  }
});

test('unreachable destinations return null', () => {
  // Nearest star is 4.2465 ly away, so 3 ly jumps cannot leave the Sun.
  assert.equal(planRoute('Sun', 'Proxima Centauri', 3), null);
  // The Alpha Centauri trio is internally connected at 0.5 ly but isolated from everything else.
  assert.ok(planRoute('Proxima Centauri', 'Alpha Centauri B', 0.5));
  assert.equal(planRoute('Alpha Centauri A', 'Sirius A', 0.5), null);
  // No catalog star lies within 14 ly of Vega.
  assert.equal(planRoute('Sun', 'Vega', 14), null);
});

test('Dijkstra minimises distance, not hop count', () => {
  // Straight chain Sun -> A -> B -> T (10 ly, 3 hops) vs detour Sun -> Q -> T (2*sqrt(34) ly, 2 hops).
  const stars = [
    starAt('A', 3.4, 0, 0),
    starAt('B', 6.7, 0, 0),
    starAt('T', 10, 0, 0),
    starAt('Q', 5, 3, 0),
  ];
  const route = planRoute('Sun', 'T', 6, stars);
  assert.deepEqual(route.path, ['Sun', 'A', 'B', 'T']);
  near(route.totalLy, 10, 1e-9);
  const detourOnly = planRoute('Sun', 'T', 6, [stars[2], stars[3]]);
  assert.deepEqual(detourOnly.path, ['Sun', 'Q', 'T']);
  near(detourOnly.totalLy, 2 * Math.sqrt(34), 1e-9);
});

test('a jump exactly equal to the separation is allowed', () => {
  const route = planRoute('Sun', 'X', 5, [starAt('X', 0, 0, 5)]);
  assert.deepEqual(route.path, ['Sun', 'X']);
});

test('unknown or malformed names throw', () => {
  assert.throws(() => planRoute('Sun', 'Nowhere', 10), RangeError);
  assert.throws(() => planRoute('Nowhere', 'Sun', 10), RangeError);
  assert.throws(() => planRoute('  ', 'Sun', 10), RangeError);
  assert.throws(() => planRoute(42, 'Sun', 10), TypeError);
  assert.throws(() => planRoute('Sun', null, 10), TypeError);
});

test('invalid maxJumpLy throws', () => {
  for (const bad of [NaN, Infinity, '5', undefined, null]) {
    assert.throws(() => planRoute('Sun', 'Vega', bad), TypeError);
  }
  assert.throws(() => planRoute('Sun', 'Vega', 0), RangeError);
  assert.throws(() => planRoute('Sun', 'Vega', -1), RangeError);
});

test('malformed star lists throw', () => {
  assert.throws(() => planRoute('Sun', 'A', 5, 'stars'), TypeError);
  assert.throws(() => planRoute('Sun', 'A', 5, [null]), TypeError);
  assert.throws(() => planRoute('Sun', 'A', 5, [starAt('A', 1, 0, 0), starAt('a', 2, 0, 0)]), RangeError);
  assert.throws(() => planRoute('Sun', 'A', 5, [starAt('sun', 1, 0, 0)]), RangeError);
  assert.throws(() => planRoute('Sun', 'A', 5, [{ name: 'A', ra_hours: 0, dec_deg: 0 }]), TypeError);
});
