// Relativistic rocket with constant proper acceleration (hyperbolic motion).
// Closed forms from Rindler, "Relativity: Special, General, and Cosmological"
// (2006), and the Baez/Gibbs "Relativistic Rocket" FAQ. SI units throughout.

import { C } from './constants.js';

const C2 = C * C;

function requireFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number, got ${String(value)}`);
  }
}

function requirePositive(value, name) {
  requireFiniteNumber(value, name);
  if (value <= 0) {
    throw new RangeError(`${name} must be > 0, got ${value}`);
  }
}

function requireNonNegative(value, name) {
  requireFiniteNumber(value, name);
  if (value < 0) {
    throw new RangeError(`${name} must be >= 0, got ${value}`);
  }
}

function requireFiniteResult(result, what) {
  for (const [key, value] of Object.entries(result)) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`${what} overflows double precision (${key} is not finite)`);
    }
  }
  return result;
}

/**
 * One burn from rest at constant proper acceleration.
 *
 * With rapidity phi = a * tau / c:
 *   t = (c / a) sinh(phi), d = (c^2 / a)(cosh(phi) - 1),
 *   beta = tanh(phi), gamma = cosh(phi).
 * The distance uses cosh(phi) - 1 = 2 sinh^2(phi / 2) so it stays accurate
 * in the Newtonian limit (d -> a tau^2 / 2).
 *
 * @param {number} accelMs2 Proper acceleration felt aboard, m/s^2 (> 0).
 * @param {number} properTimeS Proper (ship) time of the burn, s (>= 0).
 * @returns {{coordinateTimeS: number, distanceM: number, beta: number, gamma: number}}
 *   Coordinate (rest-frame) time in s, distance covered in m, final speed as
 *   a fraction of c, and final Lorentz factor.
 * @throws {TypeError} If an argument is not a finite number.
 * @throws {RangeError} If accelMs2 <= 0, properTimeS < 0, or the result overflows.
 */
export function accelerationLeg(accelMs2, properTimeS) {
  requirePositive(accelMs2, 'accelMs2');
  requireNonNegative(properTimeS, 'properTimeS');
  const phi = (accelMs2 * properTimeS) / C;
  const halfSinh = Math.sinh(phi / 2);
  return requireFiniteResult({
    coordinateTimeS: (C / accelMs2) * Math.sinh(phi),
    distanceM: (C2 / accelMs2) * 2 * halfSinh * halfSinh,
    beta: Math.tanh(phi),
    gamma: Math.cosh(phi),
  }, 'accelerationLeg');
}

/**
 * Flip-and-burn trip from rest to rest: accelerate at a constant proper
 * acceleration to the midpoint, flip, and decelerate at the same rate.
 *
 * With x = a D / (2 c^2): peakGamma = 1 + x, peak rapidity
 * phi = acosh(1 + x), properTime = 2 (c / a) phi,
 * coordinateTime = 2 (c / a) sinh(phi) = 2 (c / a) sqrt(x (x + 2)),
 * peakBeta = sqrt(x (x + 2)) / (1 + x).
 *
 * @param {number} distanceM Rest-frame distance to the destination, m (>= 0).
 * @param {number} accelMs2 Proper acceleration felt aboard, m/s^2 (> 0).
 * @returns {{properTimeS: number, coordinateTimeS: number, peakBeta: number, peakGamma: number}}
 *   Ship time in s, rest-frame time in s, speed at the midpoint as a fraction
 *   of c, and Lorentz factor at the midpoint.
 * @throws {TypeError} If an argument is not a finite number.
 * @throws {RangeError} If distanceM < 0, accelMs2 <= 0, or the result overflows.
 */
export function flipAndBurn(distanceM, accelMs2) {
  requireNonNegative(distanceM, 'distanceM');
  requirePositive(accelMs2, 'accelMs2');
  const x = (accelMs2 * distanceM) / (2 * C2);
  const sinhPhi = Math.sqrt(x) * Math.sqrt(x + 2);
  const phi = Math.log1p(x + sinhPhi);
  return requireFiniteResult({
    properTimeS: (2 * C * phi) / accelMs2,
    coordinateTimeS: (2 * C * sinhPhi) / accelMs2,
    peakBeta: sinhPhi / (1 + x),
    peakGamma: 1 + x,
  }, 'flipAndBurn');
}

/**
 * Accelerate-coast-decelerate trip from rest to rest: burn at constant proper
 * acceleration up to cruiseBeta, coast at cruiseBeta, then burn at the same
 * rate down to rest at the destination.
 *
 * With gamma = 1 / sqrt(1 - beta^2) and rapidity phi = atanh(beta), each burn
 * covers (c^2 / a)(gamma - 1) and takes (c / a) phi proper time and
 * (c / a) gamma beta coordinate time. The coast covers the remainder at
 * beta c, during which ship time runs slow by 1 / gamma.
 *
 * This function does NOT fall back to flipAndBurn: if the two burns alone
 * need more than distanceM (cruiseBeta unreachable before the midpoint) it
 * throws a RangeError. A relative overshoot up to 1e-12 is treated as
 * rounding and clamped to a zero-length coast.
 *
 * @param {number} distanceM Rest-frame distance to the destination, m (> 0).
 * @param {number} accelMs2 Proper acceleration felt aboard during burns, m/s^2 (> 0).
 * @param {number} cruiseBeta Coasting speed as a fraction of c (0 < cruiseBeta < 1).
 * @returns {{properTimeS: number, coordinateTimeS: number, peakBeta: number, peakGamma: number, burnDistanceM: number, coastDistanceM: number}}
 *   Ship time in s, rest-frame time in s, cruise speed as a fraction of c,
 *   cruise Lorentz factor, rest-frame distance of ONE burn in m, and
 *   rest-frame coasting distance in m.
 * @throws {TypeError} If an argument is not a finite number.
 * @throws {RangeError} If distanceM <= 0, accelMs2 <= 0, cruiseBeta is not in
 *   (0, 1), the distance is too short to reach cruiseBeta, or the result overflows.
 */
export function coastTrip(distanceM, accelMs2, cruiseBeta) {
  requirePositive(distanceM, 'distanceM');
  requirePositive(accelMs2, 'accelMs2');
  requireFiniteNumber(cruiseBeta, 'cruiseBeta');
  if (cruiseBeta <= 0 || cruiseBeta >= 1) {
    throw new RangeError(`cruiseBeta must be in (0, 1), got ${cruiseBeta}`);
  }
  const b2 = cruiseBeta * cruiseBeta;
  const gamma = 1 / Math.sqrt((1 - cruiseBeta) * (1 + cruiseBeta));
  // gamma - 1 = beta^2 gamma^2 / (1 + gamma), exact and cancellation-free.
  const burnDistanceM = (C2 / accelMs2) * ((b2 * gamma * gamma) / (1 + gamma));
  const excess = 2 * burnDistanceM - distanceM;
  if (excess > distanceM * 1e-12) {
    throw new RangeError(
      `distanceM ${distanceM} m is too short to reach cruiseBeta ${cruiseBeta} at ` +
      `${accelMs2} m/s^2: the two burns alone need ${2 * burnDistanceM} m`,
    );
  }
  const coastDistanceM = Math.max(0, -excess);
  const burnProperS = (C / accelMs2) * Math.atanh(cruiseBeta);
  const burnCoordS = (C / accelMs2) * gamma * cruiseBeta;
  const coastCoordS = coastDistanceM / (cruiseBeta * C);
  return requireFiniteResult({
    properTimeS: 2 * burnProperS + coastCoordS / gamma,
    coordinateTimeS: 2 * burnCoordS + coastCoordS,
    peakBeta: cruiseBeta,
    peakGamma: gamma,
    burnDistanceM,
    coastDistanceM,
  }, 'coastTrip');
}

/**
 * Initial-to-final mass ratio M0 / M1 of an ideal photon rocket (exhaust
 * speed c) changing speed between rest and peakBeta, from the relativistic
 * rocket equation: per burn M0 / M1 = sqrt((1 + beta) / (1 - beta)) = e^phi.
 * Burns multiply, so a flip-and-burn or coast trip (accelerate, then
 * decelerate) needs burns = 2, i.e. the square.
 *
 * @param {number} peakBeta Peak speed as a fraction of c (0 <= peakBeta < 1).
 * @param {number} [burns=1] Number of identical 0 <-> peakBeta burns (positive integer).
 * @returns {number} Dimensionless mass ratio M0 / M1 (>= 1).
 * @throws {TypeError} If peakBeta is not a finite number or burns is not an integer.
 * @throws {RangeError} If peakBeta is not in [0, 1), burns < 1, or the result overflows.
 */
export function massRatio(peakBeta, burns = 1) {
  requireFiniteNumber(peakBeta, 'peakBeta');
  if (!Number.isInteger(burns)) {
    throw new TypeError(`burns must be an integer, got ${String(burns)}`);
  }
  if (peakBeta < 0 || peakBeta >= 1) {
    throw new RangeError(`peakBeta must be in [0, 1), got ${peakBeta}`);
  }
  if (burns < 1) {
    throw new RangeError(`burns must be >= 1, got ${burns}`);
  }
  const ratio = Math.exp(burns * Math.atanh(peakBeta));
  if (!Number.isFinite(ratio)) {
    throw new RangeError('massRatio overflows double precision');
  }
  return ratio;
}
