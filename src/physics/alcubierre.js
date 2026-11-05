// Alcubierre warp-drive metric (M. Alcubierre, Class. Quantum Grav. 11, L73, 1994).
// Shape function, its radial derivative, the Eulerian-observer energy density and
// trip time for a bubble of constant speed. All quantities are SI (metres, seconds,
// J/m^3). The bubble center is at the origin and travel is along +x.

import { C, G } from './constants.js';

/** Largest grid dimension accepted by energyDensityGrid (keeps the grid small). */
const MAX_GRID_POINTS = 512;

/**
 * Throw unless value is a finite number.
 * @param {string} name
 * @param {unknown} value
 */
function requireFinite(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number, got ${String(value)}`);
  }
}

/**
 * Throw unless value is a finite number >= 0.
 * @param {string} name
 * @param {unknown} value
 */
function requireNonNegative(name, value) {
  requireFinite(name, value);
  if (value < 0) throw new RangeError(`${name} must be >= 0, got ${value}`);
}

/**
 * Throw unless value is a finite number > 0.
 * @param {string} name
 * @param {unknown} value
 */
function requirePositive(name, value) {
  requireFinite(name, value);
  if (value <= 0) throw new RangeError(`${name} must be > 0, got ${value}`);
}

/**
 * Validate (rs, R, sigma) and return the tanh arguments sigma*(rs+R), sigma*(rs-R), sigma*R.
 * @param {number} rs
 * @param {number} R
 * @param {number} sigma
 * @returns {{ a: number, b: number, s: number }}
 */
function shapeArgs(rs, R, sigma) {
  requireNonNegative('rs', rs);
  requirePositive('R', R);
  requirePositive('sigma', sigma);
  const a = sigma * (rs + R);
  const b = sigma * (rs - R);
  const s = sigma * R;
  if (!Number.isFinite(a)) {
    throw new RangeError('sigma * (rs + R) overflows double precision');
  }
  return { a, b, s };
}

/**
 * ln(cosh(x)), stable for every finite x (no overflow for |x| > 710).
 * @param {number} x
 * @returns {number}
 */
function logCosh(x) {
  const ax = Math.abs(x);
  return ax + Math.log1p(Math.exp(-2 * ax)) - Math.LN2;
}

/**
 * Alcubierre top-hat shape function
 * f(rs) = (tanh(sigma (rs + R)) - tanh(sigma (rs - R))) / (2 tanh(sigma R)).
 * Evaluated through the exact identity f = cosh^2(sigma R) / (cosh(sigma (rs + R)) cosh(sigma (rs - R)))
 * in log space, so it neither overflows nor cancels catastrophically for large sigma R.
 * f(0) = 1 exactly; f -> 1 inside the bubble and 0 outside as sigma R -> infinity.
 * @param {number} rs     distance from the bubble center, m (>= 0)
 * @param {number} R      bubble radius, m (> 0)
 * @param {number} sigma  wall steepness, 1/m (> 0); wall thickness is of order 1/sigma
 * @returns {number} dimensionless value in (0, 1]
 */
export function shapeFunction(rs, R, sigma) {
  const { a, b, s } = shapeArgs(rs, R, sigma);
  return Math.exp(2 * logCosh(s) - logCosh(a) - logCosh(b));
}

/**
 * Analytic radial derivative of the shape function,
 * df/drs = sigma (sech^2(sigma (rs + R)) - sech^2(sigma (rs - R))) / (2 tanh(sigma R)),
 * evaluated as the equivalent -sigma f(rs) (tanh(sigma (rs + R)) + tanh(sigma (rs - R))).
 * It is 0 at rs = 0 and <= 0 for every rs >= 0.
 * @param {number} rs     distance from the bubble center, m (>= 0)
 * @param {number} R      bubble radius, m (> 0)
 * @param {number} sigma  wall steepness, 1/m (> 0)
 * @returns {number} derivative in 1/m
 */
export function shapeDerivative(rs, R, sigma) {
  const { a, b, s } = shapeArgs(rs, R, sigma);
  const f = Math.exp(2 * logCosh(s) - logCosh(a) - logCosh(b));
  const d = -sigma * f * (Math.tanh(a) + Math.tanh(b));
  return d === 0 ? 0 : d;
}

/**
 * Energy density measured by Eulerian (normal) observers in the Alcubierre metric
 * ds^2 = -c^2 dt^2 + (dx - vs f(rs) dt)^2 + dy^2 + dz^2:
 * T^{mu nu} n_mu n_nu = -(c^4 / (8 pi G)) * (vs/c)^2 rho^2 / (4 rs^2) * (df/drs)^2.
 * Alcubierre writes vs^2 with c = 1; here vs is in m/s, so it enters as (vs/c)^2.
 * Never positive: the metric needs negative energy (exotic matter).
 * Zero on the axis of motion (rho = 0), including at the center rs = 0.
 * @param {number} x      coordinate along the direction of travel, m, relative to the bubble center
 * @param {number} rho    transverse distance sqrt(y^2 + z^2) from the axis of motion, m (>= 0)
 * @param {number} vs     bubble speed, m/s (>= 0; may exceed c)
 * @param {number} R      bubble radius, m (> 0)
 * @param {number} sigma  wall steepness, 1/m (> 0)
 * @returns {number} energy density, J/m^3 (<= 0)
 */
export function energyDensity(x, rho, vs, R, sigma) {
  requireFinite('x', x);
  requireNonNegative('rho', rho);
  requireNonNegative('vs', vs);
  requirePositive('R', R);
  requirePositive('sigma', sigma);
  const rs = Math.hypot(x, rho);
  if (!Number.isFinite(rs)) throw new RangeError('sqrt(x^2 + rho^2) overflows double precision');
  if (rho === 0 || vs === 0) return 0;
  const sinTheta = rho / rs;
  const beta = vs / C;
  const df = shapeDerivative(rs, R, sigma);
  const value = -((C ** 4) / (8 * Math.PI * G)) * ((beta * sinTheta * df) ** 2) / 4;
  if (!Number.isFinite(value)) {
    throw new RangeError('energy density overflows double precision for these inputs');
  }
  return value === 0 ? 0 : value;
}

/**
 * Sample the energy density on a regular grid in the x-y plane (z = 0, so rho = |y|),
 * centered on the bubble, for heatmap rendering.
 * @param {number} vs     bubble speed, m/s (>= 0; may exceed c)
 * @param {number} R      bubble radius, m (> 0)
 * @param {number} sigma  wall steepness, 1/m (> 0)
 * @param {{ extentM?: number, nx?: number, ny?: number }} [options]
 *   extentM: half-width of the square window, m (> 0, default 2 R);
 *   nx, ny: sample counts along x and y (integers in [2, 512], default 41)
 * @returns {{ x: number[], y: number[], values: number[][], min: number, max: number }}
 *   x: nx sample coordinates, m; y: ny sample coordinates, m;
 *   values[j][i]: energy density at (x[i], y[j]), J/m^3;
 *   min, max: extreme values over the grid, J/m^3 (min <= max <= 0)
 */
export function energyDensityGrid(vs, R, sigma, options = {}) {
  requireNonNegative('vs', vs);
  requirePositive('R', R);
  requirePositive('sigma', sigma);
  if (options === null || typeof options !== 'object') {
    throw new TypeError('options must be an object');
  }
  const { extentM = 2 * R, nx = 41, ny = 41 } = options;
  requirePositive('extentM', extentM);
  for (const [name, n] of [['nx', nx], ['ny', ny]]) {
    if (typeof n !== 'number' || !Number.isInteger(n)) {
      throw new TypeError(`${name} must be an integer, got ${String(n)}`);
    }
    if (n < 2 || n > MAX_GRID_POINTS) {
      throw new RangeError(`${name} must be in [2, ${MAX_GRID_POINTS}], got ${n}`);
    }
  }
  const axis = (n) => Array.from({ length: n }, (_, i) => -extentM + (2 * extentM * i) / (n - 1));
  const x = axis(nx);
  const y = axis(ny);
  let min = 0;
  let max = -Infinity;
  const values = y.map((yj) => x.map((xi) => {
    const e = energyDensity(xi, Math.abs(yj), vs, R, sigma);
    if (e < min) min = e;
    if (e > max) max = e;
    return e;
  }));
  return { x, y, values, min, max };
}

/**
 * Trip time for a bubble moving at constant speed vs over distanceM. The ship rides at the
 * bubble center in free fall, where the lapse is 1 and f = 1, so its proper time equals
 * the coordinate time distance / vs (no time dilation, even for vs > c).
 * Acceleration and deceleration phases are not modelled.
 * @param {number} distanceM  distance travelled, m (>= 0)
 * @param {number} vs         bubble speed, m/s (> 0; may exceed c)
 * @returns {number} trip time, s (coordinate time = ship proper time)
 */
export function warpTripTime(distanceM, vs) {
  requireNonNegative('distanceM', distanceM);
  requirePositive('vs', vs);
  return distanceM / vs;
}
