import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, G, LIGHT_YEAR_M, JULIAN_YEAR_S } from '../src/physics/constants.js';
import {
  shapeFunction,
  shapeDerivative,
  energyDensity,
  energyDensityGrid,
  warpTripTime,
} from '../src/physics/alcubierre.js';

const R = 100; // bubble radius, m
const SIGMA = 0.5; // wall steepness, 1/m (sigma R = 50)

/** Direct transcription of Alcubierre's eq. (6), used as an independent reference. */
function directShape(rs, r, sigma) {
  return (Math.tanh(sigma * (rs + r)) - Math.tanh(sigma * (rs - r))) / (2 * Math.tanh(sigma * r));
}

/** Direct sech^2 form of df/drs. */
function directDerivative(rs, r, sigma) {
  const sech2 = (u) => 1 / Math.cosh(u) ** 2;
  return (sigma * (sech2(sigma * (rs + r)) - sech2(sigma * (rs - r)))) / (2 * Math.tanh(sigma * r));
}

function assertClose(actual, expected, relTol, absTol = 0) {
  const tol = Math.max(absTol, relTol * Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual} (tol ${tol})`);
}

test('shape function equals 1 at the bubble center for any sigma R', () => {
  for (const [r, s] of [[1, 0.1], [1, 1], [R, SIGMA], [1, 1e4]]) {
    assertClose(shapeFunction(0, r, s), 1, 1e-15);
  }
});

test('shape function is a top hat for large sigma R', () => {
  assertClose(shapeFunction(R / 2, R, SIGMA), 1, 1e-12);
  assertClose(shapeFunction(R, R, SIGMA), 0.5, 1e-12);
  assert.ok(shapeFunction(2 * R, R, SIGMA) < 1e-20);
  assert.ok(shapeFunction(1e6, R, SIGMA) === 0 || shapeFunction(1e6, R, SIGMA) < 1e-300);
});

test('shape function tends to 0 far from the bubble and stays in (0, 1]', () => {
  let prev = shapeFunction(0, R, 0.02);
  for (let rs = 10; rs <= 2000; rs += 10) {
    const f = shapeFunction(rs, R, 0.02);
    assert.ok(f <= prev && f >= 0 && f <= 1);
    prev = f;
  }
  assert.ok(prev < 1e-15);
});

test('shape function matches the direct tanh formula where it is well conditioned', () => {
  for (const [rs, r, s] of [[0.5, 1, 1], [1.3, 1, 2], [3, 2, 0.7], [90, 100, 0.05], [150, 100, 0.05]]) {
    assertClose(shapeFunction(rs, r, s), directShape(rs, r, s), 1e-12);
  }
});

test('shape function stays finite and correct for very steep walls (sigma R = 1e5)', () => {
  assertClose(shapeFunction(0.5, 1, 1e5), 1, 1e-9);
  assertClose(shapeFunction(1, 1, 1e5), 0.5, 1e-9);
  assert.equal(shapeFunction(1.5, 1, 1e5), 0);
});

test('derivative matches the sech^2 formula and a central finite difference', () => {
  for (const [rs, r, s] of [[0.5, 1, 1], [1, 1, 2], [3, 2, 0.7], [95, 100, 0.2], [100, 100, 0.2], [104, 100, 0.2]]) {
    const d = shapeDerivative(rs, r, s);
    assertClose(d, directDerivative(rs, r, s), 1e-10, 1e-15);
    const h = 1e-5 * r;
    const fd = (shapeFunction(rs + h, r, s) - shapeFunction(rs - h, r, s)) / (2 * h);
    assertClose(d, fd, 1e-6, 1e-12);
  }
});

test('derivative is 0 at the center, <= 0 everywhere, and -sigma/2 at the wall for large sigma R', () => {
  assert.equal(shapeDerivative(0, R, SIGMA), 0);
  for (let rs = 0; rs <= 3 * R; rs += 0.5) assert.ok(shapeDerivative(rs, R, SIGMA) <= 0);
  assertClose(shapeDerivative(R, R, SIGMA), -SIGMA / 2, 1e-12);
});

test('energy density is never positive and peaks in the bubble wall', () => {
  const vs = 2 * C;
  for (let x = -3 * R; x <= 3 * R; x += 7) {
    for (let rho = 0; rho <= 3 * R; rho += 7) {
      assert.ok(energyDensity(x, rho, vs, R, SIGMA) <= 0);
    }
  }
  assert.ok(energyDensity(0, R, vs, R, SIGMA) < energyDensity(0, R / 2, vs, R, SIGMA));
  assert.ok(energyDensity(0, R, vs, R, SIGMA) < energyDensity(0, 2 * R, vs, R, SIGMA));
});

test('energy density is exactly zero on the axis of motion and at the center', () => {
  for (const x of [-2 * R, -R, -1, 0, 1, R, 2 * R]) {
    assert.equal(energyDensity(x, 0, 10 * C, R, SIGMA), 0);
  }
  assert.equal(energyDensity(0, 0, C, R, SIGMA), 0);
  assert.equal(energyDensity(R, R, 0, R, SIGMA), 0);
});

test('energy density at the equatorial wall matches the closed form for large sigma R', () => {
  // At x = 0, rho = R: rho/rs = 1 and df/drs = -sigma/2, so
  // E = -(c^4 / 8 pi G) * beta^2 * sigma^2 / 16.
  for (const beta of [0.5, 1, 10]) {
    const expected = -((C ** 4) / (8 * Math.PI * G)) * beta ** 2 * SIGMA ** 2 / 16;
    assertClose(energyDensity(0, R, beta * C, R, SIGMA), expected, 1e-12);
  }
});

test('energy density scales as vs^2 and as (rho/rs)^2 at fixed rs', () => {
  const e1 = energyDensity(30, 95, C, R, SIGMA);
  assertClose(energyDensity(30, 95, 3 * C, R, SIGMA), 9 * e1, 1e-12);
  const rs = 99;
  const theta1 = Math.PI / 2;
  const theta2 = Math.PI / 6;
  const ea = energyDensity(rs * Math.cos(theta1), rs * Math.sin(theta1), C, R, SIGMA);
  const eb = energyDensity(rs * Math.cos(theta2), rs * Math.sin(theta2), C, R, SIGMA);
  assertClose(eb / ea, Math.sin(theta2) ** 2, 1e-12);
});

test('energy density is symmetric front to back (x -> -x)', () => {
  assertClose(energyDensity(-60, 70, C, R, SIGMA), energyDensity(60, 70, C, R, SIGMA), 1e-14);
});

test('energyDensityGrid returns a symmetric, non-positive heatmap grid', () => {
  const grid = energyDensityGrid(C, R, SIGMA, { nx: 21, ny: 11 });
  assert.equal(grid.x.length, 21);
  assert.equal(grid.y.length, 11);
  assert.equal(grid.values.length, 11);
  for (const row of grid.values) assert.equal(row.length, 21);
  assertClose(grid.x[0], -2 * R, 1e-15);
  assertClose(grid.x[20], 2 * R, 1e-15);
  assertClose(grid.x[10], 0, 0, 1e-12);
  assert.ok(grid.min < 0);
  assert.ok(grid.max <= 0);
  assert.ok(grid.min <= grid.max);
  for (let j = 0; j < 11; j += 1) {
    for (let i = 0; i < 21; i += 1) {
      const v = grid.values[j][i];
      assert.ok(v <= 0 && v >= grid.min && v <= grid.max);
      assert.equal(v, energyDensity(grid.x[i], Math.abs(grid.y[j]), C, R, SIGMA));
      assertClose(v, grid.values[10 - j][20 - i], 1e-12, 1e-300);
    }
  }
  // Middle row is y = 0, the axis of motion.
  for (const v of grid.values[5]) assert.equal(v, 0);
});

test('energyDensityGrid defaults and custom extent', () => {
  const grid = energyDensityGrid(C, R, SIGMA);
  assert.equal(grid.x.length, 41);
  assert.equal(grid.y.length, 41);
  const wide = energyDensityGrid(C, R, SIGMA, { extentM: 5 * R, nx: 2, ny: 2 });
  assert.deepEqual(wide.x, [-5 * R, 5 * R]);
  assert.deepEqual(wide.y, [-5 * R, 5 * R]);
});

test('warpTripTime is distance over speed and allows superluminal bubbles', () => {
  assert.equal(warpTripTime(0, C), 0);
  assertClose(warpTripTime(LIGHT_YEAR_M, C), JULIAN_YEAR_S, 1e-15);
  assertClose(warpTripTime(4.2465 * LIGHT_YEAR_M, 10 * C), 0.42465 * JULIAN_YEAR_S, 1e-14);
  assertClose(warpTripTime(1000, 4), 250, 1e-15);
});

test('inputs are validated with TypeError / RangeError', () => {
  for (const bad of [NaN, Infinity, -Infinity, '1', null, undefined]) {
    assert.throws(() => shapeFunction(bad, R, SIGMA), TypeError);
    assert.throws(() => shapeDerivative(1, bad, SIGMA), TypeError);
    assert.throws(() => energyDensity(bad, 1, C, R, SIGMA), TypeError);
    assert.throws(() => energyDensity(1, 1, bad, R, SIGMA), TypeError);
    assert.throws(() => energyDensityGrid(C, R, bad), TypeError);
    assert.throws(() => warpTripTime(bad, C), TypeError);
    assert.throws(() => warpTripTime(1, bad), TypeError);
  }
  assert.throws(() => shapeFunction(-1, R, SIGMA), RangeError);
  assert.throws(() => shapeFunction(1, 0, SIGMA), RangeError);
  assert.throws(() => shapeFunction(1, R, -1), RangeError);
  assert.throws(() => shapeFunction(1e300, 1e300, 1e10), RangeError);
  assert.throws(() => shapeDerivative(1, -R, SIGMA), RangeError);
  assert.throws(() => energyDensity(0, -1, C, R, SIGMA), RangeError);
  assert.throws(() => energyDensity(0, 1, -C, R, SIGMA), RangeError);
  assert.throws(() => energyDensity(0, 1, C, 0, SIGMA), RangeError);
  assert.throws(() => energyDensity(0, R, 1e300, R, SIGMA), RangeError);
  assert.throws(() => energyDensityGrid(C, R, SIGMA, null), TypeError);
  assert.throws(() => energyDensityGrid(C, R, SIGMA, { nx: 2.5 }), TypeError);
  assert.throws(() => energyDensityGrid(C, R, SIGMA, { ny: '10' }), TypeError);
  assert.throws(() => energyDensityGrid(C, R, SIGMA, { nx: 1 }), RangeError);
  assert.throws(() => energyDensityGrid(C, R, SIGMA, { ny: 513 }), RangeError);
  assert.throws(() => energyDensityGrid(C, R, SIGMA, { extentM: 0 }), RangeError);
  assert.throws(() => energyDensityGrid(-1, R, SIGMA), RangeError);
  assert.throws(() => warpTripTime(-1, C), RangeError);
  assert.throws(() => warpTripTime(1, 0), RangeError);
});
