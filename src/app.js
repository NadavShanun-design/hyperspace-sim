// Browser app for the hyperspace-jump simulator: pure trip/animation helpers
// (exported and unit tested in Node) plus mount(), the DOM wiring that
// index.html calls. Nothing here touches the DOM until mount() runs.

import { STARS, findStar } from './data/stars.js';
import { C, G0, LIGHT_YEAR_M } from './physics/constants.js';
import { aberrationAngle } from './physics/relativity.js';
import { accelerationLeg, flipAndBurn, massRatio } from './physics/rocket.js';
import { energyDensity, energyDensityGrid, warpTripTime } from './physics/alcubierre.js';
import { planRoute, SUN_NAME } from './nav/route.js';
import { createStarfield, stepStarfield, drawStarfield } from './render/starfield.js';
import {
  formatDuration, formatDistance, formatBeta, formatGamma, formatEnergy, formatSpeed,
} from './render/format.js';

/** Default departure body. */
export const DEFAULT_FROM = SUN_NAME;

/** Default destination body. */
export const DEFAULT_TO = 'Proxima Centauri';

/** Default drive mode ('rocket' = flip-and-burn, 'warp' = Alcubierre). */
export const DEFAULT_MODE = 'rocket';

/** Default proper acceleration, multiples of standard gravity G0. */
export const DEFAULT_ACCEL_G = 1;

/** Default Alcubierre bubble speed, multiples of c. */
export const DEFAULT_WARP_C = 10;

/** Default longest single jump in a route, light years. */
export const DEFAULT_MAX_JUMP_LY = 10;

/** Alcubierre bubble radius used by the app, m. */
export const BUBBLE_RADIUS_M = 100;

/** Alcubierre wall steepness used by the app, 1/m (sigma * R = 8, a thin wall). */
export const BUBBLE_SIGMA_PER_M = 0.08;

/** Starfield speed while idle or stopped, depth units per second. */
export const IDLE_SPEED = 0.03;

/** Starfield speed at full jump intensity, depth units per second. */
export const MAX_SPEED = 2.4;

/** Starfield speed cap under prefers-reduced-motion, depth units per second. */
export const REDUCED_MAX_SPEED = 0.12;

const MODES = ['rocket', 'warp'];
const RAMP_FRACTION = 0.15;
// Peak search: samples of |df/drs| over rs in [0, R + PEAK_SPAN_WALLS / sigma].
const PEAK_SAMPLES = 2048;
const PEAK_SPAN_WALLS = 12;
const GOLDEN = (Math.sqrt(5) - 1) / 2;
// Heatmap colour stops: t = 0 (no energy) to t = 1 (most negative energy).
const HEAT_STOPS = Object.freeze([
  [0, 3, 6, 18],
  [0.25, 46, 16, 101],
  [0.5, 156, 35, 125],
  [0.75, 240, 112, 52],
  [1, 252, 245, 196],
]);

function requireFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number, got ${String(value)}`);
  }
}

function requirePositive(value, name) {
  requireFinite(value, name);
  if (value <= 0) throw new RangeError(`${name} must be > 0, got ${value}`);
}

function requireUnit(value, name) {
  requireFinite(value, name);
  if (value < 0 || value > 1) throw new RangeError(`${name} must be in [0, 1], got ${value}`);
}

function requireBoolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean`);
}

function requireObject(value, name) {
  if (value === null || typeof value !== 'object') {
    throw new TypeError(`${name} must be an object`);
  }
}

/**
 * Names of every body a route can start or end at: the Sun first, then the
 * star catalog in catalog order.
 * @returns {string[]} Canonical body names.
 */
export function routeBodies() {
  return [SUN_NAME, ...STARS.map((s) => s.name)];
}

/**
 * Most negative Eulerian energy density anywhere around an Alcubierre bubble.
 * The density is -(c^4 / 8 pi G) beta^2 sin^2(theta) (df/drs)^2 / 4, so for
 * any rs it is most negative at sin(theta) = 1 (the x = 0 plane); the peak is
 * therefore at x = 0, rho = the rs maximising |df/drs|. That rs is found by a
 * dense scan over [0, R + 12 / sigma] refined with a golden-section search.
 * For a thin wall (sigma R >> 1) the peak tends to
 * -(c^4 / 8 pi G) beta^2 sigma^2 / 16 at rho = R.
 * @param {number} vs Bubble speed, m/s (>= 0; may exceed c).
 * @param {number} R Bubble radius, m (> 0).
 * @param {number} sigma Wall steepness, 1/m (> 0).
 * @returns {{energyDensityJm3: number, rhoM: number}} Peak (most negative)
 *   energy density in J/m^3 (<= 0) and the transverse distance in m where it occurs.
 * @throws {TypeError} If an argument is not a finite number.
 * @throws {RangeError} If vs < 0, R <= 0, sigma <= 0, or the density overflows.
 */
export function peakEnergyDensity(vs, R, sigma) {
  requireFinite(vs, 'vs');
  if (vs < 0) throw new RangeError(`vs must be >= 0, got ${vs}`);
  requirePositive(R, 'R');
  requirePositive(sigma, 'sigma');
  const span = R + PEAK_SPAN_WALLS / sigma;
  if (!Number.isFinite(span)) throw new RangeError('bubble size overflows double precision');
  // Use vs = c for the search: the density is proportional to vs^2, so the
  // location of the peak does not depend on vs (and vs = 0 stays searchable).
  const depth = (rho) => energyDensity(0, rho, C, R, sigma);
  const step = span / PEAK_SAMPLES;
  let best = 0;
  let bestValue = 0;
  for (let i = 1; i <= PEAK_SAMPLES; i++) {
    const v = depth(i * step);
    if (v < bestValue) {
      bestValue = v;
      best = i;
    }
  }
  let lo = Math.max(0, (best - 1) * step);
  let hi = Math.min(span, (best + 1) * step);
  let m1 = hi - GOLDEN * (hi - lo);
  let m2 = lo + GOLDEN * (hi - lo);
  let v1 = depth(m1);
  let v2 = depth(m2);
  for (let k = 0; k < 80 && hi - lo > 1e-12 * span; k++) {
    if (v1 < v2) {
      hi = m2;
      m2 = m1;
      v2 = v1;
      m1 = hi - GOLDEN * (hi - lo);
      v1 = depth(m1);
    } else {
      lo = m1;
      m1 = m2;
      v1 = v2;
      m2 = lo + GOLDEN * (hi - lo);
      v2 = depth(m2);
    }
  }
  const rhoM = v1 < v2 ? m1 : m2;
  return { energyDensityJm3: energyDensity(0, rhoM, vs, R, sigma), rhoM };
}

function rocketTrip(route, accelMs2) {
  let properTimeS = 0;
  let coordinateTimeS = 0;
  let peakBeta = 0;
  let peakGamma = 1;
  let ratio = 1;
  const legs = route.legs.map((leg) => {
    const distanceM = leg.distanceLy * LIGHT_YEAR_M;
    const burn = flipAndBurn(distanceM, accelMs2);
    properTimeS += burn.properTimeS;
    coordinateTimeS += burn.coordinateTimeS;
    peakBeta = Math.max(peakBeta, burn.peakBeta);
    peakGamma = Math.max(peakGamma, burn.peakGamma);
    // Each leg starts and ends at rest: two 0 <-> peakBeta burns.
    ratio *= massRatio(burn.peakBeta, 2);
    return { from: leg.from, to: leg.to, distanceM, ...burn };
  });
  if (!Number.isFinite(ratio)) throw new RangeError('mass ratio overflows double precision');
  return {
    mode: 'rocket',
    route,
    distanceM: route.totalLy * LIGHT_YEAR_M,
    accelMs2,
    legs,
    properTimeS,
    coordinateTimeS,
    peakBeta,
    peakGamma,
    massRatio: ratio,
  };
}

function warpTrip(route, vs) {
  let tripTimeS = 0;
  const legs = route.legs.map((leg) => {
    const distanceM = leg.distanceLy * LIGHT_YEAR_M;
    const legTimeS = warpTripTime(distanceM, vs);
    tripTimeS += legTimeS;
    return { from: leg.from, to: leg.to, distanceM, tripTimeS: legTimeS };
  });
  const peak = peakEnergyDensity(vs, BUBBLE_RADIUS_M, BUBBLE_SIGMA_PER_M);
  return {
    mode: 'warp',
    route,
    distanceM: route.totalLy * LIGHT_YEAR_M,
    vsMs: vs,
    bubbleRadiusM: BUBBLE_RADIUS_M,
    bubbleSigmaPerM: BUBBLE_SIGMA_PER_M,
    legs,
    tripTimeS,
    properTimeS: tripTimeS,
    coordinateTimeS: tripTimeS,
    peakEnergyDensityJm3: peak.energyDensityJm3,
    peakEnergyRhoM: peak.rhoM,
  };
}

/**
 * Plan a route and compute trip statistics for one drive mode.
 *
 * Rocket mode flies every leg as a rest-to-rest flip-and-burn at constant
 * proper acceleration accelG * G0 (rocket.flipAndBurn); times add, peaks are
 * the maximum over legs, and the photon-rocket mass ratio multiplies over legs
 * (two burns per leg, rocket.massRatio(peakBeta, 2)).
 * Warp mode cruises every leg at constant bubble speed warpC * c
 * (alcubierre.warpTripTime; ship time equals Earth time) and reports the most
 * negative energy density of a bubble with BUBBLE_RADIUS_M and BUBBLE_SIGMA_PER_M.
 *
 * @param {object} [options]
 * @param {string} [options.from='Sun'] Departure body (case-insensitive).
 * @param {string} [options.to='Proxima Centauri'] Destination body (case-insensitive).
 * @param {'rocket'|'warp'} [options.mode='rocket'] Drive mode.
 * @param {number} [options.accelG=1] Proper acceleration, multiples of G0 (> 0).
 * @param {number} [options.warpC=10] Bubble speed, multiples of c (> 0).
 * @param {number} [options.maxJumpLy=10] Longest single jump, light years (> 0).
 * @returns {object | null} null if no route exists within maxJumpLy. Otherwise
 *   rocket: {mode, route, distanceM, accelMs2, legs: [{from, to, distanceM,
 *   properTimeS, coordinateTimeS, peakBeta, peakGamma}], properTimeS,
 *   coordinateTimeS, peakBeta, peakGamma, massRatio};
 *   warp: {mode, route, distanceM, vsMs, bubbleRadiusM, bubbleSigmaPerM,
 *   legs: [{from, to, distanceM, tripTimeS}], tripTimeS, properTimeS,
 *   coordinateTimeS, peakEnergyDensityJm3, peakEnergyRhoM}.
 *   Times in s, distances in m, speeds in m/s, energy density in J/m^3,
 *   route as returned by planRoute (light years).
 * @throws {TypeError} If options is not an object, a name is not a string,
 *   mode is not a string, or a number is not finite.
 * @throws {RangeError} If a name is unknown, mode is not 'rocket' or 'warp',
 *   accelG, warpC or maxJumpLy is <= 0, or the physics overflows.
 */
export function computeTrip(options = {}) {
  requireObject(options, 'options');
  const {
    from = DEFAULT_FROM,
    to = DEFAULT_TO,
    mode = DEFAULT_MODE,
    accelG = DEFAULT_ACCEL_G,
    warpC = DEFAULT_WARP_C,
    maxJumpLy = DEFAULT_MAX_JUMP_LY,
  } = options;
  if (typeof mode !== 'string') throw new TypeError('mode must be a string');
  if (!MODES.includes(mode)) throw new RangeError(`mode must be 'rocket' or 'warp', got ${mode}`);
  requirePositive(accelG, 'accelG');
  requirePositive(warpC, 'warpC');
  const route = planRoute(from, to, maxJumpLy);
  if (route === null) return null;
  return mode === 'rocket' ? rocketTrip(route, accelG * G0) : warpTrip(route, warpC * C);
}

function requireTrip(trip) {
  requireObject(trip, 'trip');
  if (!MODES.includes(trip.mode)) throw new TypeError('trip must come from computeTrip');
  if (!Array.isArray(trip.legs)) throw new TypeError('trip.legs must be an array');
}

/**
 * Smooth 0 -> 1 -> 0 intensity envelope over a fraction of a leg: smoothstep
 * up over the first 15%, 1 in the middle, smoothstep down over the last 15%.
 * @param {number} fraction Position within the leg, in [0, 1].
 * @returns {number} Envelope value in [0, 1].
 * @throws {TypeError} If fraction is not a finite number.
 * @throws {RangeError} If fraction is outside [0, 1].
 */
export function jumpEnvelope(fraction) {
  requireUnit(fraction, 'fraction');
  const edge = Math.min(fraction, 1 - fraction) / RAMP_FRACTION;
  if (edge >= 1) return 1;
  return edge * edge * (3 - 2 * edge);
}

/**
 * Where the ship is at a given fraction of the mission's ship (proper) time.
 * Rocket legs use the exact hyperbolic motion of rocket.accelerationLeg for
 * the acceleration half and its mirror image for the deceleration half, so
 * speed peaks at each leg midpoint and returns to 0 at each star. Warp legs
 * cruise at the constant bubble speed (ship time = Earth time).
 * @param {object} trip Result of computeTrip.
 * @param {number} fraction Elapsed share of total ship time, in [0, 1].
 * @returns {{legIndex: number, legFraction: number, properTimeS: number,
 *   coordinateTimeS: number, distanceM: number, speedC: number, gamma: number}}
 *   Current leg (index into trip.legs, -1 for a zero-leg trip) and fraction of
 *   it, elapsed ship time in s, elapsed Earth time in s, distance flown in m,
 *   speed as a multiple of c (beta for rocket legs; may exceed 1 for warp) and
 *   Lorentz factor of the ship relative to the stars (1 for warp: the ship is
 *   in free fall at rest inside the bubble).
 * @throws {TypeError} If trip is malformed or fraction is not a finite number.
 * @throws {RangeError} If fraction is outside [0, 1].
 */
export function shipStateAt(trip, fraction) {
  requireTrip(trip);
  requireUnit(fraction, 'fraction');
  const atRest = { speedC: 0, gamma: 1 };
  if (trip.legs.length === 0) {
    return { legIndex: -1, legFraction: 1, properTimeS: 0, coordinateTimeS: 0, distanceM: 0, ...atRest };
  }
  const legTime = (leg) => (trip.mode === 'rocket' ? leg.properTimeS : leg.tripTimeS);
  const legEarthTime = (leg) => (trip.mode === 'rocket' ? leg.coordinateTimeS : leg.tripTimeS);
  const target = fraction * trip.properTimeS;
  let tau = 0;
  let t = 0;
  let d = 0;
  for (let i = 0; i < trip.legs.length; i++) {
    const leg = trip.legs[i];
    const span = legTime(leg);
    const last = i === trip.legs.length - 1;
    if (target > tau + span && !last) {
      tau += span;
      t += legEarthTime(leg);
      d += leg.distanceM;
      continue;
    }
    const local = Math.min(span, Math.max(0, target - tau));
    const legFraction = span > 0 ? local / span : 1;
    if (trip.mode === 'warp') {
      const done = local >= span;
      return {
        legIndex: i,
        legFraction,
        properTimeS: tau + local,
        coordinateTimeS: t + local,
        distanceM: d + legFraction * leg.distanceM,
        speedC: done ? 0 : trip.vsMs / C,
        gamma: 1,
      };
    }
    const half = span / 2;
    let state;
    if (local <= half) {
      const burn = accelerationLeg(trip.accelMs2, local);
      state = {
        coordinateTimeS: burn.coordinateTimeS,
        distanceM: burn.distanceM,
        speedC: burn.beta,
        gamma: burn.gamma,
      };
    } else {
      const burn = accelerationLeg(trip.accelMs2, span - local);
      state = {
        coordinateTimeS: leg.coordinateTimeS - burn.coordinateTimeS,
        distanceM: leg.distanceM - burn.distanceM,
        speedC: burn.beta,
        gamma: burn.gamma,
      };
    }
    return {
      legIndex: i,
      legFraction,
      properTimeS: tau + local,
      coordinateTimeS: t + Math.max(0, state.coordinateTimeS),
      distanceM: d + Math.max(0, state.distanceM),
      speedC: state.speedC,
      gamma: state.gamma,
    };
  }
  throw new RangeError('trip has no legs to sample');
}

/**
 * Visual jump intensity in [0, 1] for the starfield: the true beta for rocket
 * trips (so streaks grow as the ship really speeds up), and the per-leg
 * envelope for warp trips (whose physics models only constant-speed cruise).
 * @param {object} trip Result of computeTrip.
 * @param {{legFraction: number, speedC: number}} ship Result of shipStateAt.
 * @returns {number} Intensity in [0, 1].
 * @throws {TypeError} If an argument is malformed.
 */
export function jumpIntensity(trip, ship) {
  requireTrip(trip);
  requireObject(ship, 'ship');
  requireFinite(ship.speedC, 'ship.speedC');
  requireUnit(ship.legFraction, 'ship.legFraction');
  if (trip.legs.length === 0) return 0;
  if (trip.mode === 'rocket') return Math.min(1, Math.max(0, ship.speedC));
  return jumpEnvelope(ship.legFraction);
}

/**
 * Starfield flight speed for a jump intensity. Grows with the square of the
 * intensity from IDLE_SPEED to MAX_SPEED (or REDUCED_MAX_SPEED when the user
 * prefers reduced motion, which keeps streaks short and slow).
 * @param {number} intensity Jump intensity in [0, 1].
 * @param {boolean} reducedMotion True when prefers-reduced-motion is set.
 * @returns {number} Speed in depth units per second.
 * @throws {TypeError} If intensity is not a finite number or reducedMotion is not a boolean.
 * @throws {RangeError} If intensity is outside [0, 1].
 */
export function starfieldSpeed(intensity, reducedMotion) {
  requireUnit(intensity, 'intensity');
  requireBoolean(reducedMotion, 'reducedMotion');
  const top = reducedMotion ? REDUCED_MAX_SPEED : MAX_SPEED;
  const idle = Math.min(IDLE_SPEED, top);
  return idle + (top - idle) * intensity * intensity;
}

/**
 * Apply relativistic aberration to one starfield particle as seen from a ship
 * moving along +z at beta. The particle's angle from the heading,
 * theta = atan2(hypot(x, y), z), becomes theta' = aberrationAngle(beta, theta);
 * depth z (and pz) is kept and the transverse offset is rescaled to
 * z tan(theta'), so the star keeps its side of the heading. For beta > 0 stars
 * bunch toward the centre of view.
 * @param {{x: number, y: number, z: number, pz?: number}} p Particle, z > 0.
 * @param {number} beta Ship speed as a fraction of c, |beta| < 1.
 * @returns {{x: number, y: number, z: number, pz: number}} New particle object.
 * @throws {TypeError} If a field or beta is not a finite number.
 * @throws {RangeError} If z <= 0, pz <= 0 or |beta| >= 1.
 */
export function aberrateParticle(p, beta) {
  requireObject(p, 'p');
  requireFinite(p.x, 'p.x');
  requireFinite(p.y, 'p.y');
  requireFinite(p.z, 'p.z');
  const pz = p.pz === undefined ? p.z : p.pz;
  requireFinite(pz, 'p.pz');
  requireFinite(beta, 'beta');
  if (p.z <= 0) throw new RangeError(`p.z must be > 0, got ${p.z}`);
  if (pz <= 0) throw new RangeError(`p.pz must be > 0, got ${pz}`);
  if (Math.abs(beta) >= 1) throw new RangeError(`|beta| must be < 1, got ${beta}`);
  const r = Math.hypot(p.x, p.y);
  if (r === 0 || beta === 0) return { x: p.x, y: p.y, z: p.z, pz };
  const theta = Math.atan2(r, p.z);
  const apparent = aberrationAngle(beta, theta);
  // theta lies in (0, pi/2) because z > 0; for beta > 0, 0 < theta' <= theta.
  // For beta < 0 theta' can pass pi/2 (behind the camera): clamp just short.
  const clamped = Math.min(apparent, Math.PI / 2 - 1e-6);
  const k = (p.z * Math.tan(clamped)) / r;
  return { x: p.x * k, y: p.y * k, z: p.z, pz };
}

/**
 * Heatmap colour for a normalised energy-density magnitude: dark navy at 0
 * through violet and magenta to orange and pale yellow at 1 (piecewise linear).
 * @param {number} t Normalised magnitude in [0, 1].
 * @returns {[number, number, number]} Integer RGB channels in [0, 255].
 * @throws {TypeError} If t is not a finite number.
 * @throws {RangeError} If t is outside [0, 1].
 */
export function heatmapColor(t) {
  requireUnit(t, 't');
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [t1, r1, g1, b1] = HEAT_STOPS[i];
    if (t <= t1) {
      const [t0, r0, g0, b0] = HEAT_STOPS[i - 1];
      const u = (t - t0) / (t1 - t0);
      return [
        Math.round(r0 + (r1 - r0) * u),
        Math.round(g0 + (g1 - g0) * u),
        Math.round(b0 + (b1 - b0) * u),
      ];
    }
  }
  const [, r, g, b] = HEAT_STOPS[HEAT_STOPS.length - 1];
  return [r, g, b];
}

/**
 * Convert an alcubierre.energyDensityGrid result into RGBA pixels (row-major,
 * top row first, so +y points up and +x right). Each sample's colour is
 * heatmapColor(value / min), i.e. relative to the most negative sample;
 * an all-zero grid renders as heatmapColor(0).
 * @param {{x: number[], y: number[], values: number[][], min: number}} grid Grid from energyDensityGrid.
 * @returns {{width: number, height: number, data: Uint8ClampedArray}}
 *   width = x.length, height = y.length, data has 4 * width * height bytes.
 * @throws {TypeError} If grid is malformed or contains non-finite values.
 * @throws {RangeError} If a value is positive or below grid.min.
 */
export function gridToRgba(grid) {
  requireObject(grid, 'grid');
  if (!Array.isArray(grid.x) || !Array.isArray(grid.y) || !Array.isArray(grid.values)) {
    throw new TypeError('grid must have x, y and values arrays');
  }
  requireFinite(grid.min, 'grid.min');
  if (grid.min > 0) throw new RangeError(`grid.min must be <= 0, got ${grid.min}`);
  const width = grid.x.length;
  const height = grid.y.length;
  if (width < 1 || height < 1 || grid.values.length !== height) {
    throw new TypeError('grid.values must have one row per y sample');
  }
  const data = new Uint8ClampedArray(4 * width * height);
  for (let j = 0; j < height; j++) {
    const row = grid.values[j];
    if (!Array.isArray(row) || row.length !== width) {
      throw new TypeError('every grid.values row must have one entry per x sample');
    }
    const out = height - 1 - j;
    for (let i = 0; i < width; i++) {
      const v = row[i];
      requireFinite(v, `grid.values[${j}][${i}]`);
      if (v > 0 || v < grid.min) throw new RangeError(`grid value out of [min, 0]: ${v}`);
      const t = grid.min === 0 ? 0 : Math.min(1, v / grid.min);
      const [r, g, b] = heatmapColor(t);
      const k = 4 * (out * width + i);
      data[k] = r;
      data[k + 1] = g;
      data[k + 2] = b;
      data[k + 3] = 255;
    }
  }
  return { width, height, data };
}

/**
 * Wall-clock length of the jump animation.
 * @param {number} legCount Number of route legs (non-negative integer).
 * @param {boolean} reducedMotion True when prefers-reduced-motion is set.
 * @returns {number} Duration in seconds: 6 s + 3 s per leg (capped at 18 s),
 *   or 2 s with reduced motion; 0 for a zero-leg trip.
 * @throws {TypeError} If legCount is not an integer or reducedMotion is not a boolean.
 * @throws {RangeError} If legCount < 0.
 */
export function animationDurationS(legCount, reducedMotion) {
  if (typeof legCount !== 'number' || !Number.isInteger(legCount)) {
    throw new TypeError(`legCount must be an integer, got ${String(legCount)}`);
  }
  if (legCount < 0) throw new RangeError(`legCount must be >= 0, got ${legCount}`);
  requireBoolean(reducedMotion, 'reducedMotion');
  if (legCount === 0) return 0;
  if (reducedMotion) return 2;
  return Math.min(18, 6 + 3 * legCount);
}

/**
 * Format a stat as a list of [label, value] rows for the HUD.
 * @param {object} trip Result of computeTrip.
 * @returns {Array<[string, string]>} Label/value pairs, in display order.
 * @throws {TypeError} If trip is malformed.
 */
export function tripSummary(trip) {
  requireTrip(trip);
  const rows = [
    ['Route', trip.route.path.join(' → ')],
    ['Distance', formatDistance(trip.distanceM)],
  ];
  if (trip.mode === 'rocket') {
    rows.push(
      ['Ship time', formatDuration(trip.properTimeS)],
      ['Earth time', formatDuration(trip.coordinateTimeS)],
      ['Peak speed', `${formatBeta(trip.peakBeta)} c`],
      ['Peak γ', formatGamma(trip.peakGamma)],
      // A mass ratio is a dimensionless number >= 1, the same domain as gamma.
      ['Mass ratio (photon rocket)', formatGamma(trip.massRatio)],
    );
  } else {
    rows.push(
      ['Trip time (ship = Earth)', formatDuration(trip.tripTimeS)],
      ['Bubble speed', formatSpeed(trip.vsMs)],
      ['Peak energy density', `${formatEnergy(trip.peakEnergyDensityJm3)}/m³`],
    );
  }
  return rows;
}

// ---------------------------------------------------------------------------
// DOM wiring. Only index.html calls mount(); the tests never do.

function byId(doc, id) {
  const el = doc.getElementById(id);
  if (!el) throw new Error(`index.html is missing #${id}`);
  return el;
}

function fillRows(doc, list, rows) {
  list.replaceChildren();
  for (const [label, value] of rows) {
    const dt = doc.createElement('dt');
    dt.textContent = label;
    const dd = doc.createElement('dd');
    dd.textContent = value;
    list.append(dt, dd);
  }
}

/**
 * Wire the app into the page: full-window starfield canvas, cockpit form,
 * HUD and warp heatmap. Called once from index.html.
 * @param {Document} doc The page document.
 * @param {Window} win The page window (requestAnimationFrame, matchMedia, devicePixelRatio).
 * @returns {void}
 */
export function mount(doc, win) {
  const sky = byId(doc, 'sky');
  const skyCtx = sky.getContext('2d');
  const form = byId(doc, 'cockpit-form');
  const fromSel = byId(doc, 'from');
  const toSel = byId(doc, 'to');
  const accel = byId(doc, 'accel');
  const accelOut = byId(doc, 'accel-out');
  const warp = byId(doc, 'warp');
  const warpOut = byId(doc, 'warp-out');
  const maxJump = byId(doc, 'max-jump');
  const maxJumpOut = byId(doc, 'max-jump-out');
  const rocketGroup = byId(doc, 'rocket-controls');
  const warpGroup = byId(doc, 'warp-controls');
  const status = byId(doc, 'status');
  const live = byId(doc, 'live');
  const stats = byId(doc, 'stats');
  const legsList = byId(doc, 'legs');
  const heat = byId(doc, 'heatmap');
  const heatFigure = byId(doc, 'heatmap-figure');
  const warpNote = byId(doc, 'warp-note');
  const heatCaption = byId(doc, 'heatmap-caption');
  const heatCtx = heat.getContext('2d');

  for (const sel of [fromSel, toSel]) {
    for (const name of routeBodies()) {
      const opt = doc.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.append(opt);
    }
  }
  fromSel.value = DEFAULT_FROM;
  toSel.value = DEFAULT_TO;
  accel.value = String(DEFAULT_ACCEL_G);
  warp.value = String(DEFAULT_WARP_C);
  maxJump.value = String(DEFAULT_MAX_JUMP_LY);

  const motionQuery = win.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionQuery.matches;
  motionQuery.addEventListener('change', (e) => { reducedMotion = e.matches; });

  const field = createStarfield({ count: 900, seed: 7 });
  let view = { width: 1, height: 1 };
  let jump = null;
  let lastFrame = null;
  let lastLive = 0;

  const mode = () => form.elements.mode.value;

  function resize() {
    const dpr = Math.max(1, win.devicePixelRatio || 1);
    const width = Math.max(1, win.innerWidth);
    const height = Math.max(1, win.innerHeight);
    sky.width = Math.round(width * dpr);
    sky.height = Math.round(height * dpr);
    skyCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view = { width, height };
    drawHeatmap();
  }

  function drawHeatmap() {
    if (mode() !== 'warp') return;
    const dpr = Math.max(1, win.devicePixelRatio || 1);
    const css = heat.clientWidth || 180;
    heat.width = Math.round(css * dpr);
    heat.height = Math.round(css * dpr);
    const vs = Number(warp.value) * C;
    const grid = energyDensityGrid(vs, BUBBLE_RADIUS_M, BUBBLE_SIGMA_PER_M, { nx: 121, ny: 121 });
    const img = gridToRgba(grid);
    const tile = doc.createElement('canvas');
    tile.width = img.width;
    tile.height = img.height;
    tile.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    heatCtx.imageSmoothingEnabled = true;
    heatCtx.drawImage(tile, 0, 0, heat.width, heat.height);
    heatCaption.textContent =
      `Eulerian energy density in the x-y plane, bubble R = ${BUBBLE_RADIUS_M} m, ` +
      `σ = ${BUBBLE_SIGMA_PER_M} /m, travel along +x (right). ` +
      `Scale: 0 (dark) to ${formatEnergy(grid.min)}/m³ (bright).`;
  }

  function syncControls() {
    accelOut.value = `${Number(accel.value).toFixed(1)} g`;
    warpOut.value = `${Number(warp.value)} c`;
    maxJumpOut.value = `${Number(maxJump.value).toFixed(1)} ly`;
    const isWarp = mode() === 'warp';
    rocketGroup.hidden = isWarp;
    warpGroup.hidden = !isWarp;
    heatFigure.hidden = !isWarp;
    warpNote.hidden = !isWarp;
    drawHeatmap();
  }

  function showStats(trip) {
    fillRows(doc, stats, tripSummary(trip));
    legsList.replaceChildren();
    if (trip.legs.length > 1) {
      for (const leg of trip.legs) {
        const li = doc.createElement('li');
        li.textContent = `${leg.from} → ${leg.to}: ${formatDistance(leg.distanceM)}`;
        legsList.append(li);
      }
    }
  }

  function showLive(trip, ship) {
    const rows = [
      ['Ship clock', formatDuration(ship.properTimeS)],
      ['Earth clock', formatDuration(ship.coordinateTimeS)],
      ['Flown', formatDistance(ship.distanceM)],
    ];
    if (trip.mode === 'rocket') {
      rows.push(['Speed', `${formatBeta(Math.min(ship.speedC, 1 - Number.EPSILON))} c`]);
      rows.push(['γ', formatGamma(ship.gamma)]);
    } else {
      rows.push(['Bubble speed', formatSpeed(ship.speedC * C)]);
    }
    fillRows(doc, live, rows);
  }

  function arrive(trip) {
    const dest = trip.route.path[trip.route.path.length - 1];
    const star = findStar(dest);
    const detail = star ? ` (${star.spectral_type}, ${star.constellation})` : '';
    status.textContent = `Dropped out at ${dest}${detail}.`;
    showLive(trip, shipStateAt(trip, 1));
    jump = null;
  }

  function engage(event) {
    event.preventDefault();
    let trip;
    try {
      trip = computeTrip({
        from: fromSel.value,
        to: toSel.value,
        mode: mode(),
        accelG: Number(accel.value),
        warpC: Number(warp.value),
        maxJumpLy: Number(maxJump.value),
      });
    } catch (err) {
      jump = null;
      status.textContent = `Cannot plot this jump: ${err.message}`;
      return;
    }
    if (trip === null) {
      jump = null;
      status.textContent =
        `No route: ${toSel.value} is not reachable from ${fromSel.value} ` +
        `with jumps of at most ${Number(maxJump.value).toFixed(1)} ly.`;
      stats.replaceChildren();
      live.replaceChildren();
      legsList.replaceChildren();
      return;
    }
    showStats(trip);
    const durationS = animationDurationS(trip.legs.length, reducedMotion);
    if (durationS === 0) {
      status.textContent = `Already at ${trip.route.path[0]}.`;
      showLive(trip, shipStateAt(trip, 1));
      jump = null;
      return;
    }
    const legs = trip.legs.length === 1 ? '1 jump' : `${trip.legs.length} jumps`;
    status.textContent = `Engaged: ${trip.route.path[0]} to ` +
      `${trip.route.path[trip.route.path.length - 1]}, ${legs}.`;
    jump = { trip, durationS, elapsedS: 0 };
  }

  function frame(nowMs) {
    const dt = lastFrame === null ? 0 : Math.min(0.1, Math.max(0, (nowMs - lastFrame) / 1000));
    lastFrame = nowMs;
    let intensity = 0;
    let beta = 0;
    let tint = 0;
    if (jump) {
      jump.elapsedS += dt;
      const fraction = Math.min(1, jump.elapsedS / jump.durationS);
      const ship = shipStateAt(jump.trip, fraction);
      intensity = jumpIntensity(jump.trip, ship);
      if (jump.trip.mode === 'rocket') {
        beta = Math.min(ship.speedC, 0.999);
        tint = intensity * 0.6;
      } else {
        tint = intensity;
      }
      if (nowMs - lastLive > 100 || fraction === 1) {
        showLive(jump.trip, ship);
        lastLive = nowMs;
      }
      if (fraction === 1) arrive(jump.trip);
    }
    const speed = starfieldSpeed(intensity, reducedMotion);
    stepStarfield(field, dt, speed);
    let drawn = field;
    if (beta > 1e-6 && !reducedMotion) {
      drawn = { ...field, particles: field.particles.map((p) => aberrateParticle(p, beta)) };
    }
    drawStarfield(skyCtx, drawn, { width: view.width, height: view.height, speed, warp: tint });
    win.requestAnimationFrame(frame);
  }

  form.addEventListener('submit', engage);
  form.addEventListener('input', syncControls);
  form.addEventListener('change', syncControls);
  win.addEventListener('resize', resize);
  syncControls();
  resize();
  win.requestAnimationFrame(frame);
}
