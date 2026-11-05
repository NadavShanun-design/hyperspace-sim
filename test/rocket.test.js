import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, G0, JULIAN_YEAR_S, LIGHT_YEAR_M } from '../src/physics/constants.js';
import { accelerationLeg, flipAndBurn, coastTrip, massRatio } from '../src/physics/rocket.js';

// Relative-tolerance float comparison.
function near(actual, expected, rel = 1e-12, msg = '') {
  const tol = rel * Math.max(1, Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg} expected ${expected}, got ${actual} (tol ${tol})`,
  );
}

// 1 g expressed in light years per year^2 (about 1.0323), so the closed forms
// below can be evaluated independently in natural units where c = 1.
const G_LY_YR2 = (G0 * JULIAN_YEAR_S * JULIAN_YEAR_S) / LIGHT_YEAR_M;
const PROXIMA_LY = 4.2465;

test('accelerationLeg: 1 g for 1 year of ship time (Baez FAQ table)', () => {
  const leg = accelerationLeg(G0, JULIAN_YEAR_S);
  const phi = G_LY_YR2; // a * tau / c with tau = 1 yr, c = 1 ly/yr
  near(leg.beta, Math.tanh(phi), 1e-12, 'beta');
  near(leg.gamma, Math.cosh(phi), 1e-12, 'gamma');
  near(leg.coordinateTimeS / JULIAN_YEAR_S, Math.sinh(phi) / G_LY_YR2, 1e-12, 't');
  near(leg.distanceM / LIGHT_YEAR_M, (Math.cosh(phi) - 1) / G_LY_YR2, 1e-12, 'd');
  // Published values: 0.77 c, 0.56 ly, 1.19 yr Earth time (to 2 decimals).
  assert.ok(leg.beta > 0.77 && leg.beta < 0.78, `beta ${leg.beta}`);
  const dLy = leg.distanceM / LIGHT_YEAR_M;
  assert.ok(dLy > 0.56 && dLy < 0.57, `d ${dLy} ly`);
  const tYr = leg.coordinateTimeS / JULIAN_YEAR_S;
  assert.ok(tYr > 1.185 && tYr < 1.195, `t ${tYr} yr`); // 1.19 rounded
});

test('accelerationLeg: gamma and beta are consistent and match known speeds', () => {
  // gamma(0.6c) = 1.25 and gamma(0.8c) = 5/3: pick tau so tanh(phi) = beta.
  for (const [beta, gamma] of [[0.6, 1.25], [0.8, 5 / 3]]) {
    const tau = (C / G0) * Math.atanh(beta);
    const leg = accelerationLeg(G0, tau);
    near(leg.beta, beta, 1e-12, 'beta');
    near(leg.gamma, gamma, 1e-12, 'gamma');
    // Coordinate time is gamma * beta * c / a; distance is (gamma - 1) c^2 / a.
    near(leg.coordinateTimeS, gamma * beta * C / G0, 1e-12, 't');
    near(leg.distanceM, (gamma - 1) * C * C / G0, 1e-12, 'd');
  }
});

test('accelerationLeg: zero time is at rest at the origin', () => {
  assert.deepEqual(accelerationLeg(G0, 0), {
    coordinateTimeS: 0, distanceM: 0, beta: 0, gamma: 1,
  });
});

test('accelerationLeg: Newtonian limit for short burns', () => {
  const tau = 60; // one minute at 1 g: v / c ~ 2e-6
  const leg = accelerationLeg(G0, tau);
  near(leg.distanceM, 0.5 * G0 * tau * tau, 1e-9, 'd');
  near(leg.coordinateTimeS, tau, 1e-9, 't');
  near(leg.beta, (G0 * tau) / C, 1e-9, 'beta');
});

test('accelerationLeg: beta stays below 1 and grows monotonically', () => {
  let prev = 0;
  for (let years = 0.5; years <= 10; years += 0.5) {
    const { beta } = accelerationLeg(G0, years * JULIAN_YEAR_S);
    assert.ok(beta > prev && beta < 1, `beta ${beta} at ${years} yr`);
    prev = beta;
  }
});

test('flipAndBurn: 1 g to Proxima Centauri', () => {
  const trip = flipAndBurn(PROXIMA_LY * LIGHT_YEAR_M, G0);
  // Independent closed form in ly / yr units.
  const peakGamma = 1 + (G_LY_YR2 * PROXIMA_LY) / 2;
  const phi = Math.acosh(peakGamma);
  near(trip.peakGamma, peakGamma, 1e-12, 'peakGamma');
  near(trip.peakBeta, Math.tanh(phi), 1e-12, 'peakBeta');
  near(trip.properTimeS / JULIAN_YEAR_S, (2 * phi) / G_LY_YR2, 1e-12, 'tau');
  near(trip.coordinateTimeS / JULIAN_YEAR_S, (2 * Math.sinh(phi)) / G_LY_YR2, 1e-12, 't');
  // Sanity bounds: ~3.5 yr ship time, ~5.9 yr Earth time, peak ~0.95 c.
  const tauYr = trip.properTimeS / JULIAN_YEAR_S;
  const tYr = trip.coordinateTimeS / JULIAN_YEAR_S;
  assert.ok(tauYr > 3.5 && tauYr < 3.6, `tau ${tauYr} yr`);
  assert.ok(tYr > 5.85 && tYr < 5.9, `t ${tYr} yr`);
  assert.ok(trip.peakBeta > 0.94 && trip.peakBeta < 0.96, `peakBeta ${trip.peakBeta}`);
  // Ship time is always shorter than Earth time, and Earth time exceeds d / c.
  assert.ok(tauYr < tYr);
  assert.ok(tYr > PROXIMA_LY);
});

test('flipAndBurn equals two mirrored accelerationLeg halves', () => {
  const distanceM = 12.3 * LIGHT_YEAR_M;
  const trip = flipAndBurn(distanceM, 2 * G0);
  const half = accelerationLeg(2 * G0, trip.properTimeS / 2);
  near(2 * half.distanceM, distanceM, 1e-12, 'distance');
  near(2 * half.coordinateTimeS, trip.coordinateTimeS, 1e-12, 't');
  near(half.beta, trip.peakBeta, 1e-12, 'beta');
  near(half.gamma, trip.peakGamma, 1e-12, 'gamma');
});

test('flipAndBurn: Newtonian limit and zero distance', () => {
  const distanceM = 1e6; // 1000 km
  const trip = flipAndBurn(distanceM, G0);
  const newtonT = 2 * Math.sqrt(distanceM / G0);
  near(trip.properTimeS, newtonT, 1e-9, 'tau');
  near(trip.coordinateTimeS, newtonT, 1e-9, 't');
  near(trip.peakBeta, Math.sqrt(G0 * distanceM) / C, 1e-9, 'peakBeta');
  assert.deepEqual(flipAndBurn(0, G0), {
    properTimeS: 0, coordinateTimeS: 0, peakBeta: 0, peakGamma: 1,
  });
});

test('flipAndBurn: ultra-relativistic trip stays finite with beta < 1 or rounded to 1', () => {
  const trip = flipAndBurn(2.5e6 * LIGHT_YEAR_M, G0); // Andromeda distance
  const tauYr = trip.properTimeS / JULIAN_YEAR_S;
  // Known result: ~28-29 yr ship time at 1 g.
  assert.ok(tauYr > 27 && tauYr < 30, `tau ${tauYr} yr`);
  assert.ok(trip.peakBeta <= 1 && trip.peakBeta > 0.999999);
  assert.ok(trip.coordinateTimeS / JULIAN_YEAR_S > 2.5e6);
});

test('coastTrip: closed form with cruise at 0.6 c (gamma 1.25, phi ln 2)', () => {
  const dLy = 10;
  const trip = coastTrip(dLy * LIGHT_YEAR_M, G0, 0.6);
  const a = G_LY_YR2;
  const burnLy = 0.25 / a; // (gamma - 1) / a
  const coastLy = dLy - 2 * burnLy;
  const coastT = coastLy / 0.6;
  near(trip.peakBeta, 0.6, 0, 'peakBeta');
  near(trip.peakGamma, 1.25, 1e-15, 'peakGamma');
  near(trip.burnDistanceM / LIGHT_YEAR_M, burnLy, 1e-12, 'burn');
  near(trip.coastDistanceM / LIGHT_YEAR_M, coastLy, 1e-12, 'coast');
  near(trip.properTimeS / JULIAN_YEAR_S, (2 * Math.LN2) / a + coastT / 1.25, 1e-12, 'tau');
  near(trip.coordinateTimeS / JULIAN_YEAR_S, (2 * 0.75) / a + coastT, 1e-12, 't');
});

test('coastTrip approaches flipAndBurn as cruise speed approaches the flip peak', () => {
  const distanceM = PROXIMA_LY * LIGHT_YEAR_M;
  const flip = flipAndBurn(distanceM, G0);
  const trip = coastTrip(distanceM, G0, flip.peakBeta * (1 - 1e-12));
  near(trip.properTimeS, flip.properTimeS, 1e-5, 'tau');
  near(trip.coordinateTimeS, flip.coordinateTimeS, 1e-5, 't');
  assert.ok(trip.coastDistanceM < distanceM * 1e-5);
  // A slow cruise always takes longer than flip-and-burn.
  const slow = coastTrip(distanceM, G0, 0.5);
  assert.ok(slow.coordinateTimeS > flip.coordinateTimeS);
  assert.ok(slow.properTimeS > flip.properTimeS);
});

test('coastTrip throws RangeError when distance is too short for cruise speed', () => {
  const distanceM = PROXIMA_LY * LIGHT_YEAR_M;
  const flip = flipAndBurn(distanceM, G0);
  assert.throws(() => coastTrip(distanceM, G0, flip.peakBeta * 1.001), RangeError);
  assert.throws(() => coastTrip(1e9, G0, 0.5), /too short/);
});

test('massRatio: photon rocket rocket equation', () => {
  near(massRatio(0), 1, 0, 'rest');
  near(massRatio(0.6), 2, 1e-14, '0.6c'); // sqrt(1.6 / 0.4)
  near(massRatio(0.8), 3, 1e-14, '0.8c'); // sqrt(1.8 / 0.2)
  near(massRatio(0.6, 2), 4, 1e-14, '0.6c flip');
  near(massRatio(0.8, 2), 9, 1e-14, '0.8c flip');
  const b = 0.9;
  near(massRatio(b), Math.sqrt((1 + b) / (1 - b)), 1e-14, '0.9c');
  // Flip-and-burn to Proxima: the mass ratio is the square of one burn's.
  const flip = flipAndBurn(PROXIMA_LY * LIGHT_YEAR_M, G0);
  near(massRatio(flip.peakBeta, 2), massRatio(flip.peakBeta) ** 2, 1e-12, 'square');
});

test('input validation: TypeError for non-finite or wrong types', () => {
  for (const bad of [NaN, Infinity, -Infinity, '1', null, undefined, {}]) {
    assert.throws(() => accelerationLeg(bad, 1), TypeError);
    assert.throws(() => accelerationLeg(G0, bad), TypeError);
    assert.throws(() => flipAndBurn(bad, G0), TypeError);
    assert.throws(() => flipAndBurn(1, bad), TypeError);
    assert.throws(() => coastTrip(bad, G0, 0.5), TypeError);
    assert.throws(() => coastTrip(LIGHT_YEAR_M, bad, 0.5), TypeError);
    assert.throws(() => coastTrip(LIGHT_YEAR_M, G0, bad), TypeError);
    assert.throws(() => massRatio(bad), TypeError);
  }
  assert.throws(() => massRatio(0.5, 1.5), TypeError);
  assert.throws(() => massRatio(0.5, '2'), TypeError);
});

test('input validation: RangeError for physically invalid values', () => {
  assert.throws(() => accelerationLeg(0, 1), RangeError);
  assert.throws(() => accelerationLeg(-G0, 1), RangeError);
  assert.throws(() => accelerationLeg(G0, -1), RangeError);
  assert.throws(() => accelerationLeg(G0, 1e4 * JULIAN_YEAR_S), RangeError); // cosh overflow
  assert.throws(() => flipAndBurn(-1, G0), RangeError);
  assert.throws(() => flipAndBurn(1, 0), RangeError);
  assert.throws(() => coastTrip(0, G0, 0.5), RangeError);
  assert.throws(() => coastTrip(LIGHT_YEAR_M, 0, 0.5), RangeError);
  for (const beta of [0, 1, 1.5, -0.1]) {
    assert.throws(() => coastTrip(LIGHT_YEAR_M, G0, beta), RangeError);
  }
  for (const beta of [1, 1.01, -0.01]) {
    assert.throws(() => massRatio(beta), RangeError);
  }
  assert.throws(() => massRatio(0.5, 0), RangeError);
});
