// Tests for the pure helpers exported by src/app.js (the DOM wiring in mount() is browser-only).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, G, G0, JULIAN_YEAR_S, LIGHT_YEAR_M } from '../src/physics/constants.js';
import { STARS } from '../src/data/stars.js';
import { aberrationAngle } from '../src/physics/relativity.js';
import { energyDensityGrid } from '../src/physics/alcubierre.js';
import {
  DEFAULT_FROM, DEFAULT_TO, DEFAULT_MODE, DEFAULT_ACCEL_G, DEFAULT_WARP_C, DEFAULT_MAX_JUMP_LY,
  BUBBLE_RADIUS_M, BUBBLE_SIGMA_PER_M, IDLE_SPEED, MAX_SPEED, REDUCED_MAX_SPEED,
  routeBodies, peakEnergyDensity, computeTrip, jumpEnvelope, shipStateAt, jumpIntensity,
  starfieldSpeed, aberrateParticle, heatmapColor, gridToRgba, animationDurationS, tripSummary,
  mount,
} from '../src/app.js';

function near(actual, expected, rel = 1e-12, msg = '') {
  const tol = rel * Math.max(1, Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg} expected ${expected}, got ${actual} (tol ${tol})`,
  );
}

function nearRel(actual, expected, rel, msg = '') {
  assert.ok(
    Math.abs(actual - expected) <= rel * Math.abs(expected),
    `${msg} expected ${expected}, got ${actual} (rel ${rel})`,
  );
}

const BAD_NUMBERS = [NaN, Infinity, -Infinity, '1', null, 1n, {}];
const G_LY_YR2 = (G0 * JULIAN_YEAR_S * JULIAN_YEAR_S) / LIGHT_YEAR_M;
const ENERGY_SCALE = C ** 4 / (8 * Math.PI * G);

test('defaults: Sun to Proxima Centauri by flip-and-burn at 1 g', () => {
  assert.equal(DEFAULT_FROM, 'Sun');
  assert.equal(DEFAULT_TO, 'Proxima Centauri');
  assert.equal(DEFAULT_MODE, 'rocket');
  assert.equal(DEFAULT_ACCEL_G, 1);
  assert.equal(DEFAULT_WARP_C, 10);
  assert.equal(DEFAULT_MAX_JUMP_LY, 10);
  assert.ok(IDLE_SPEED < REDUCED_MAX_SPEED && REDUCED_MAX_SPEED < MAX_SPEED);
});

test('mount is exported for index.html but not run here', () => {
  assert.equal(typeof mount, 'function');
});

test('routeBodies: Sun first, then every catalog star in order', () => {
  const names = routeBodies();
  assert.equal(names.length, STARS.length + 1);
  assert.equal(names[0], 'Sun');
  assert.deepEqual(names.slice(1), STARS.map((s) => s.name));
});

test('computeTrip rocket: Proxima at 1 g matches the closed form and reference values', () => {
  const trip = computeTrip();
  assert.equal(trip.mode, 'rocket');
  assert.deepEqual(trip.route.path, ['Sun', 'Proxima Centauri']);
  assert.equal(trip.legs.length, 1);
  near(trip.accelMs2, G0, 1e-15, 'accel');
  const dLy = trip.distanceM / LIGHT_YEAR_M;
  near(dLy, 4.2465, 1e-9, 'distance ly');
  // Independent closed form in units c = 1 ly/yr: x = a d / 2, gamma_peak = 1 + x,
  // tau = 2 acosh(1 + x) / a, t = 2 sqrt(x (x + 2)) / a.
  const x = (G_LY_YR2 * dLy) / 2;
  near(trip.peakGamma, 1 + x, 1e-12, 'peak gamma');
  near(trip.properTimeS / JULIAN_YEAR_S, (2 * Math.acosh(1 + x)) / G_LY_YR2, 1e-12, 'tau');
  near(trip.coordinateTimeS / JULIAN_YEAR_S, (2 * Math.sqrt(x * (x + 2))) / G_LY_YR2, 1e-12, 't');
  // Reference values, quoted to 5 decimals: agree within half a unit in the last place.
  assert.ok(Math.abs(trip.properTimeS / JULIAN_YEAR_S - 3.54209) <= 5e-6, 'ship years');
  assert.ok(Math.abs(trip.coordinateTimeS / JULIAN_YEAR_S - 5.87259) <= 5e-6, 'Earth years');
  assert.ok(Math.abs(trip.peakBeta - 0.94965) <= 5e-6, 'peak beta');
  // Photon rocket, two burns: (1 + b) / (1 - b) = exp(2 acosh(gamma)).
  near(trip.massRatio, (1 + trip.peakBeta) / (1 - trip.peakBeta), 1e-9, 'mass ratio');
  near(trip.massRatio, Math.exp(2 * Math.acosh(trip.peakGamma)), 1e-9, 'mass ratio via gamma');
});

test('computeTrip rocket: Newtonian limit for a gentle burn', () => {
  // At 0.001 g the peak speed to Proxima is small: t ~ 2 sqrt(d / a).
  const trip = computeTrip({ accelG: 0.001 });
  const a = 0.001 * G0;
  nearRel(trip.coordinateTimeS, 2 * Math.sqrt(trip.distanceM / a), 1e-3, 'Newtonian time');
  nearRel(trip.properTimeS, trip.coordinateTimeS, 1e-3, 'little dilation');
  assert.ok(trip.properTimeS < trip.coordinateTimeS);
});

test('computeTrip rocket: multi-jump route sums legs and multiplies mass ratios', () => {
  const trip = computeTrip({ from: 'sun', to: 'ALTAIR', maxJumpLy: 10 });
  assert.ok(trip !== null, 'Altair reachable with 10 ly jumps');
  assert.equal(trip.route.path[0], 'Sun');
  assert.equal(trip.route.path.at(-1), 'Altair');
  assert.ok(trip.legs.length >= 2);
  let tau = 0;
  let t = 0;
  let ratio = 1;
  let peak = 0;
  for (const leg of trip.legs) {
    assert.ok(leg.distanceM <= 10 * LIGHT_YEAR_M * (1 + 1e-12));
    tau += leg.properTimeS;
    t += leg.coordinateTimeS;
    ratio *= (1 + leg.peakBeta) / (1 - leg.peakBeta);
    peak = Math.max(peak, leg.peakBeta);
  }
  near(trip.properTimeS, tau, 1e-12, 'tau sum');
  near(trip.coordinateTimeS, t, 1e-12, 't sum');
  nearRel(trip.massRatio, ratio, 1e-9, 'ratio product');
  assert.equal(trip.peakBeta, peak);
  near(trip.distanceM, trip.route.totalLy * LIGHT_YEAR_M, 1e-12, 'distance');
});

test('computeTrip warp: Proxima at 10 c takes 0.42465 yr of ship and Earth time', () => {
  const trip = computeTrip({ mode: 'warp', warpC: 10 });
  assert.equal(trip.mode, 'warp');
  near(trip.vsMs, 10 * C, 1e-15, 'vs');
  // A light year is c times a Julian year, so 4.2465 ly at 10 c is 0.42465 yr.
  near(trip.tripTimeS / JULIAN_YEAR_S, 0.42465, 1e-9, 'trip years');
  assert.equal(trip.properTimeS, trip.tripTimeS);
  assert.equal(trip.coordinateTimeS, trip.tripTimeS);
  assert.equal(trip.bubbleRadiusM, BUBBLE_RADIUS_M);
  assert.equal(trip.bubbleSigmaPerM, BUBBLE_SIGMA_PER_M);
  const peak = peakEnergyDensity(10 * C, BUBBLE_RADIUS_M, BUBBLE_SIGMA_PER_M);
  assert.equal(trip.peakEnergyDensityJm3, peak.energyDensityJm3);
  assert.ok(trip.peakEnergyDensityJm3 < 0);
});

test('computeTrip: same origin and destination is a zero trip', () => {
  const rocket = computeTrip({ from: 'Sirius A', to: 'sirius a' });
  assert.deepEqual(rocket.route.path, ['Sirius A']);
  assert.equal(rocket.legs.length, 0);
  assert.equal(rocket.properTimeS, 0);
  assert.equal(rocket.coordinateTimeS, 0);
  assert.equal(rocket.peakBeta, 0);
  assert.equal(rocket.peakGamma, 1);
  assert.equal(rocket.massRatio, 1);
  const warp = computeTrip({ from: 'Sun', to: 'Sun', mode: 'warp' });
  assert.equal(warp.tripTimeS, 0);
});

test('computeTrip: unreachable destination returns null', () => {
  assert.equal(computeTrip({ to: 'Vega', maxJumpLy: 1 }), null);
});

test('computeTrip: validation', () => {
  for (const bad of [null, 'x', 3]) {
    assert.throws(() => computeTrip(bad), TypeError);
  }
  assert.throws(() => computeTrip({ mode: 1 }), TypeError);
  assert.throws(() => computeTrip({ mode: 'hyperdrive' }), RangeError);
  for (const bad of BAD_NUMBERS) {
    assert.throws(() => computeTrip({ accelG: bad }), TypeError);
    assert.throws(() => computeTrip({ warpC: bad }), TypeError);
    assert.throws(() => computeTrip({ maxJumpLy: bad }), TypeError);
  }
  for (const bad of [0, -1]) {
    assert.throws(() => computeTrip({ accelG: bad }), RangeError);
    assert.throws(() => computeTrip({ warpC: bad }), RangeError);
    assert.throws(() => computeTrip({ maxJumpLy: bad }), RangeError);
  }
  assert.throws(() => computeTrip({ to: 'Tatooine' }), RangeError);
  assert.throws(() => computeTrip({ from: 42 }), TypeError);
  // Absurd acceleration: phi overflows inside flipAndBurn.
  assert.throws(() => computeTrip({ accelG: 1e300 }), RangeError);
});

test('peakEnergyDensity: thin-wall limit -(c^4 / 8 pi G) beta^2 sigma^2 / 16 at rho = R', () => {
  const R = 100;
  const sigma = 0.5; // sigma R = 50
  const vs = 2 * C;
  const peak = peakEnergyDensity(vs, R, sigma);
  nearRel(peak.energyDensityJm3, -ENERGY_SCALE * 4 * sigma * sigma / 16, 1e-9, 'peak');
  nearRel(peak.rhoM, R, 1e-6, 'rho');
});

test('peakEnergyDensity: scales as vs^2, is zero at rest, and bounds the grid minimum', () => {
  const R = BUBBLE_RADIUS_M;
  const s = BUBBLE_SIGMA_PER_M;
  const p1 = peakEnergyDensity(C, R, s).energyDensityJm3;
  const p10 = peakEnergyDensity(10 * C, R, s).energyDensityJm3;
  nearRel(p10, 100 * p1, 1e-12, 'vs^2');
  assert.equal(peakEnergyDensity(0, R, s).energyDensityJm3, 0);
  for (const n of [41, 101]) {
    const grid = energyDensityGrid(C, R, s, { nx: n, ny: n });
    assert.ok(p1 <= grid.min * (1 - 1e-12), `peak ${p1} <= grid min ${grid.min}`);
    assert.ok(p1 >= grid.min * 1.2, 'grid min is close to the true peak');
  }
});

test('peakEnergyDensity: a soft wall (sigma R < 1) still finds the true maximum', () => {
  const R = 1;
  const sigma = 0.5;
  const peak = peakEnergyDensity(C, R, sigma);
  // Brute-force check on a fine independent scan along x = 0 (nx = 3 includes x = 0).
  const grid = energyDensityGrid(C, R, sigma, { extentM: 30, nx: 3, ny: 512 });
  assert.ok(peak.energyDensityJm3 <= grid.min * (1 - 1e-9));
  assert.ok(peak.energyDensityJm3 >= grid.min * 1.01);
});

test('peakEnergyDensity: validation', () => {
  for (const bad of BAD_NUMBERS) {
    assert.throws(() => peakEnergyDensity(bad, 1, 1), TypeError);
    assert.throws(() => peakEnergyDensity(1, bad, 1), TypeError);
    assert.throws(() => peakEnergyDensity(1, 1, bad), TypeError);
  }
  assert.throws(() => peakEnergyDensity(-1, 1, 1), RangeError);
  assert.throws(() => peakEnergyDensity(1, 0, 1), RangeError);
  assert.throws(() => peakEnergyDensity(1, 1, 0), RangeError);
  assert.throws(() => peakEnergyDensity(1, 1e308, 1e308), RangeError);
});

test('jumpEnvelope: smooth 0 -> 1 -> 0 ramp', () => {
  assert.equal(jumpEnvelope(0), 0);
  assert.equal(jumpEnvelope(1), 0);
  assert.equal(jumpEnvelope(0.5), 1);
  assert.equal(jumpEnvelope(0.15), 1);
  near(jumpEnvelope(0.075), 0.5, 1e-12, 'smoothstep midpoint');
  near(jumpEnvelope(0.3), jumpEnvelope(0.7), 1e-12, 'symmetry');
  for (const bad of BAD_NUMBERS) assert.throws(() => jumpEnvelope(bad), TypeError);
  assert.throws(() => jumpEnvelope(-0.01), RangeError);
  assert.throws(() => jumpEnvelope(1.01), RangeError);
});

test('shipStateAt rocket: hyperbolic motion, peak at midpoint, rest at both ends', () => {
  const trip = computeTrip();
  const start = shipStateAt(trip, 0);
  assert.equal(start.properTimeS, 0);
  assert.equal(start.coordinateTimeS, 0);
  assert.equal(start.distanceM, 0);
  assert.equal(start.speedC, 0);
  assert.equal(start.gamma, 1);
  const mid = shipStateAt(trip, 0.5);
  near(mid.speedC, trip.peakBeta, 1e-12, 'beta at midpoint');
  near(mid.gamma, trip.peakGamma, 1e-12, 'gamma at midpoint');
  near(mid.coordinateTimeS, trip.coordinateTimeS / 2, 1e-12, 't at midpoint');
  near(mid.distanceM / trip.distanceM, 0.5, 1e-12, 'd at midpoint');
  const end = shipStateAt(trip, 1);
  near(end.properTimeS, trip.properTimeS, 1e-12, 'tau end');
  near(end.coordinateTimeS, trip.coordinateTimeS, 1e-12, 't end');
  near(end.distanceM / trip.distanceM, 1, 1e-12, 'd end');
  assert.equal(end.speedC, 0);
  // gamma(0.6 c) = 1.25 and gamma(0.8 c) = 5/3 on the way up: pick the fraction
  // of ship time where a tau / c = atanh(beta).
  for (const [beta, gamma] of [[0.6, 1.25], [0.8, 5 / 3]]) {
    const tau = (C / G0) * Math.atanh(beta);
    const s = shipStateAt(trip, tau / trip.properTimeS);
    near(s.speedC, beta, 1e-12, 'beta');
    near(s.gamma, gamma, 1e-12, 'gamma');
  }
  // Monotonic progress and mirror symmetry of speed.
  let prevD = -1;
  let prevT = -1;
  for (let i = 0; i <= 40; i++) {
    const s = shipStateAt(trip, i / 40);
    assert.ok(s.distanceM >= prevD && s.coordinateTimeS >= prevT);
    prevD = s.distanceM;
    prevT = s.coordinateTimeS;
    near(s.speedC, shipStateAt(trip, 1 - i / 40).speedC, 1e-9, 'mirror');
    near(s.gamma, 1 / Math.sqrt(1 - s.speedC * s.speedC), 1e-9, 'gamma(beta)');
  }
});

test('shipStateAt rocket: ship stops at every intermediate star', () => {
  const trip = computeTrip({ to: 'Altair', maxJumpLy: 10 });
  let tau = 0;
  let d = 0;
  for (let i = 0; i < trip.legs.length - 1; i++) {
    tau += trip.legs[i].properTimeS;
    d += trip.legs[i].distanceM;
    const s = shipStateAt(trip, tau / trip.properTimeS);
    assert.ok(s.speedC < 1e-6, `leg ${i} boundary speed ${s.speedC}`);
    nearRel(s.distanceM, d, 1e-9, 'distance at star');
  }
});

test('shipStateAt warp: constant bubble speed, linear progress', () => {
  const trip = computeTrip({ mode: 'warp', warpC: 20 });
  const q = shipStateAt(trip, 0.25);
  near(q.speedC, 20, 1e-12, 'speed in c');
  assert.equal(q.gamma, 1);
  near(q.properTimeS, trip.tripTimeS / 4, 1e-12, 'tau');
  near(q.coordinateTimeS, trip.tripTimeS / 4, 1e-12, 't');
  near(q.distanceM / trip.distanceM, 0.25, 1e-12, 'd');
  const end = shipStateAt(trip, 1);
  assert.equal(end.speedC, 0);
  near(end.distanceM / trip.distanceM, 1, 1e-12, 'arrived');
});

test('shipStateAt: zero-leg trip and validation', () => {
  const zero = computeTrip({ to: 'Sun' });
  assert.deepEqual(shipStateAt(zero, 0.5), {
    legIndex: -1, legFraction: 1, properTimeS: 0, coordinateTimeS: 0, distanceM: 0, speedC: 0, gamma: 1,
  });
  const trip = computeTrip();
  assert.throws(() => shipStateAt(null, 0), TypeError);
  assert.throws(() => shipStateAt({ mode: 'sail', legs: [] }, 0), TypeError);
  for (const bad of BAD_NUMBERS) assert.throws(() => shipStateAt(trip, bad), TypeError);
  assert.throws(() => shipStateAt(trip, -0.1), RangeError);
  assert.throws(() => shipStateAt(trip, 1.1), RangeError);
});

test('jumpIntensity: true beta for rockets, envelope for warp', () => {
  const rocket = computeTrip();
  const mid = shipStateAt(rocket, 0.5);
  near(jumpIntensity(rocket, mid), rocket.peakBeta, 1e-12, 'rocket');
  const warp = computeTrip({ mode: 'warp' });
  assert.equal(jumpIntensity(warp, shipStateAt(warp, 0.5)), 1);
  assert.equal(jumpIntensity(warp, shipStateAt(warp, 0)), 0);
  assert.equal(jumpIntensity(computeTrip({ to: 'Sun' }), { legFraction: 1, speedC: 0 }), 0);
  assert.throws(() => jumpIntensity(rocket, null), TypeError);
  assert.throws(() => jumpIntensity(rocket, { legFraction: 0.5, speedC: NaN }), TypeError);
});

test('starfieldSpeed: idle to max, quadratic, capped under reduced motion', () => {
  assert.equal(starfieldSpeed(0, false), IDLE_SPEED);
  near(starfieldSpeed(1, false), MAX_SPEED, 1e-15, 'max');
  near(starfieldSpeed(1, true), REDUCED_MAX_SPEED, 1e-15, 'reduced max');
  near(starfieldSpeed(0.5, false), IDLE_SPEED + (MAX_SPEED - IDLE_SPEED) / 4, 1e-15, 'quadratic');
  for (let i = 0; i <= 10; i++) {
    assert.ok(starfieldSpeed(i / 10, true) <= starfieldSpeed(i / 10, false));
  }
  for (const bad of BAD_NUMBERS) assert.throws(() => starfieldSpeed(bad, false), TypeError);
  assert.throws(() => starfieldSpeed(0.5, 'yes'), TypeError);
  assert.throws(() => starfieldSpeed(1.5, false), RangeError);
});

test('aberrateParticle: matches the aberration formula and bunches stars forward', () => {
  const p = { x: 0.3, y: -0.4, z: 0.5, pz: 0.6 }; // r = 0.5, theta = 45 degrees
  for (const beta of [0.5, 0.6, 0.9]) {
    const q = aberrateParticle(p, beta);
    assert.equal(q.z, p.z);
    assert.equal(q.pz, p.pz);
    const theta = Math.PI / 4;
    const apparent = Math.atan2(Math.hypot(q.x, q.y), q.z);
    // Independent formula: cos(theta') = (cos(theta) + beta) / (1 + beta cos(theta)).
    near(Math.cos(apparent), (Math.cos(theta) + beta) / (1 + beta * Math.cos(theta)), 1e-12, 'cos');
    near(apparent, aberrationAngle(beta, theta), 1e-12, 'module');
    assert.ok(apparent < theta, 'bunched toward heading');
    near(q.y / q.x, p.y / p.x, 1e-12, 'same side, same azimuth');
    assert.ok(q.x > 0 && q.y < 0);
  }
  // Exactly side-on star at beta = 0.5 appears at 60 degrees: pi/2 -> pi/3.
  const side = aberrateParticle({ x: 1e6, y: 0, z: 1e-6 }, 0.5);
  near(Math.atan2(side.x, side.z), Math.PI / 3, 1e-9, 'pi/2 -> pi/3');
  assert.equal(side.pz, 1e-6);
});

test('aberrateParticle: identity cases, negative beta, and validation', () => {
  assert.deepEqual(aberrateParticle({ x: 0.2, y: 0.1, z: 0.4 }, 0), { x: 0.2, y: 0.1, z: 0.4, pz: 0.4 });
  assert.deepEqual(aberrateParticle({ x: 0, y: 0, z: 0.4 }, 0.9), { x: 0, y: 0, z: 0.4, pz: 0.4 });
  const back = aberrateParticle({ x: 0.3, y: 0, z: 0.5 }, -0.5);
  assert.ok(Math.atan2(back.x, back.z) > Math.atan2(0.3, 0.5), 'receding view spreads out');
  assert.ok(Number.isFinite(back.x));
  assert.throws(() => aberrateParticle(null, 0.5), TypeError);
  for (const bad of BAD_NUMBERS) {
    assert.throws(() => aberrateParticle({ x: bad, y: 0, z: 1 }, 0.5), TypeError);
    assert.throws(() => aberrateParticle({ x: 0, y: 0, z: 1 }, bad), TypeError);
  }
  assert.throws(() => aberrateParticle({ x: 0, y: 0, z: 0 }, 0.5), RangeError);
  assert.throws(() => aberrateParticle({ x: 0, y: 0, z: 1, pz: -1 }, 0.5), RangeError);
  assert.throws(() => aberrateParticle({ x: 0, y: 0, z: 1 }, 1), RangeError);
});

test('heatmapColor: stops, interpolation, validation', () => {
  assert.deepEqual(heatmapColor(0), [3, 6, 18]);
  assert.deepEqual(heatmapColor(0.5), [156, 35, 125]);
  assert.deepEqual(heatmapColor(1), [252, 245, 196]);
  assert.deepEqual(heatmapColor(0.125), [25, 11, 60]);
  for (const bad of BAD_NUMBERS) assert.throws(() => heatmapColor(bad), TypeError);
  assert.throws(() => heatmapColor(-0.1), RangeError);
  assert.throws(() => heatmapColor(1.1), RangeError);
});

test('gridToRgba: +y up, normalised to the grid minimum', () => {
  const grid = { x: [-1, 1], y: [-1, 1], values: [[-4, 0], [-2, -1]], min: -4 };
  const img = gridToRgba(grid);
  assert.equal(img.width, 2);
  assert.equal(img.height, 2);
  assert.equal(img.data.length, 16);
  const px = (row, col) => Array.from(img.data.slice(4 * (row * 2 + col), 4 * (row * 2 + col) + 4));
  // values[0] is y = -1, which is the bottom row (row 1) of the image.
  assert.deepEqual(px(1, 0), [...heatmapColor(1), 255]);
  assert.deepEqual(px(1, 1), [...heatmapColor(0), 255]);
  assert.deepEqual(px(0, 0), [...heatmapColor(0.5), 255]);
  assert.deepEqual(px(0, 1), [...heatmapColor(0.25), 255]);
  const flat = gridToRgba({ x: [0, 1], y: [0, 1], values: [[0, 0], [0, 0]], min: 0 });
  assert.deepEqual(Array.from(flat.data.slice(0, 4)), [...heatmapColor(0), 255]);
});

test('gridToRgba: real Alcubierre grid is mirror-symmetric in y and brightest at the wall', () => {
  const grid = energyDensityGrid(10 * C, BUBBLE_RADIUS_M, BUBBLE_SIGMA_PER_M, { nx: 41, ny: 41 });
  const img = gridToRgba(grid);
  const n = 41;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const a = 4 * (row * n + col);
      const b = 4 * ((n - 1 - row) * n + col);
      assert.deepEqual(img.data.slice(a, a + 4), img.data.slice(b, b + 4));
    }
  }
  // The axis of motion (y = 0, middle row) has zero density: darkest colour.
  const mid = 4 * (20 * n + 20);
  assert.deepEqual(Array.from(img.data.slice(mid, mid + 3)), heatmapColor(0));
});

test('gridToRgba: validation', () => {
  assert.throws(() => gridToRgba(null), TypeError);
  assert.throws(() => gridToRgba({ x: [0], y: [0], values: [] , min: 0 }), TypeError);
  assert.throws(() => gridToRgba({ x: [0, 1], y: [0], values: [[0]], min: 0 }), TypeError);
  assert.throws(() => gridToRgba({ x: [0], y: [0], values: [[NaN]], min: -1 }), TypeError);
  assert.throws(() => gridToRgba({ x: [0], y: [0], values: [[0]], min: 1 }), RangeError);
  assert.throws(() => gridToRgba({ x: [0], y: [0], values: [[1]], min: -1 }), RangeError);
  assert.throws(() => gridToRgba({ x: [0], y: [0], values: [[-2]], min: -1 }), RangeError);
});

test('animationDurationS: scales with legs, capped, short under reduced motion', () => {
  assert.equal(animationDurationS(0, false), 0);
  assert.equal(animationDurationS(1, false), 9);
  assert.equal(animationDurationS(3, false), 15);
  assert.equal(animationDurationS(10, false), 18);
  assert.equal(animationDurationS(4, true), 2);
  assert.throws(() => animationDurationS(1.5, false), TypeError);
  assert.throws(() => animationDurationS('1', false), TypeError);
  assert.throws(() => animationDurationS(-1, false), RangeError);
  assert.throws(() => animationDurationS(1, 0), TypeError);
});

test('tripSummary: HUD rows use the format helpers', () => {
  const rocket = tripSummary(computeTrip());
  const labels = rocket.map(([label]) => label);
  assert.deepEqual(labels, [
    'Route', 'Distance', 'Ship time', 'Earth time', 'Peak speed', 'Peak γ', 'Mass ratio (photon rocket)',
  ]);
  assert.equal(rocket[0][1], 'Sun → Proxima Centauri');
  assert.equal(rocket[1][1], '4.247 ly');
  assert.equal(rocket[4][1], '0.950 c');
  const warp = Object.fromEntries(tripSummary(computeTrip({ mode: 'warp' })));
  assert.equal(warp['Bubble speed'], '2.998e9 m/s (10.00 c)');
  assert.match(warp['Peak energy density'], /^-\d\.\d{3}e\d+ J\/m³$/);
  assert.throws(() => tripSummary(null), TypeError);
});
