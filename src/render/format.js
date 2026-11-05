// Pure, locale-independent formatting helpers for the cockpit HUD and CLI.
// Every function is deterministic: output depends only on the input number,
// never on the host locale (no toLocaleString / Intl).

import { C, JULIAN_YEAR_S, LIGHT_YEAR_M } from '../physics/constants.js';

/** Astronomical unit, m (exact, IAU 2012 Resolution B2). */
const AU_M = 149_597_870_700;

const MINUTE_S = 60;
const HOUR_S = 3_600;
const DAY_S = 86_400;

/** Plain-notation window for fmtSig; outside it we switch to scientific. */
const PLAIN_MIN = 1e-3;
const PLAIN_MAX = 1e7;

const SI_PREFIXES = Object.freeze({
  '-30': 'q', '-27': 'r', '-24': 'y', '-21': 'z', '-18': 'a', '-15': 'f',
  '-12': 'p', '-9': 'n', '-6': 'µ', '-3': 'm', '0': '', '3': 'k', '6': 'M',
  '9': 'G', '12': 'T', '15': 'P', '18': 'E', '21': 'Z', '24': 'Y', '27': 'R',
  '30': 'Q',
});

function assertFinite(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number, got ${String(value)}`);
  }
}

/** Scientific notation with a compact exponent: 1.234e8, 5.00e-12. */
function expo(x, fractionDigits) {
  return x.toExponential(fractionDigits).replace('e+', 'e');
}

/**
 * Format with `digits` significant figures in plain notation for magnitudes
 * in [1e-3, 1e7), scientific outside. Magnitudes >= 10^digits are shown as
 * whole numbers (more precise than requested, never in exponent form).
 */
function fmtSig(x, digits) {
  if (x === 0) return '0';
  const abs = Math.abs(x);
  if (abs < PLAIN_MIN || Math.round(abs) >= PLAIN_MAX) return expo(x, digits - 1);
  const s = x.toPrecision(digits);
  if (!s.includes('e')) return s;
  return String(Math.sign(x) * Math.round(abs));
}

/**
 * Shortest fixed-point rendering (>= 3 decimals, >= 3 significant figures)
 * of a value with |v| < 1 that does not round up to 1, so 0.999999 never
 * collapses to "1.000".
 * Non-zero magnitudes below 1e-3 use scientific notation.
 */
function fmtFraction(v) {
  const abs = Math.abs(v);
  if (abs === 0) return '0.000';
  if (abs < 1e-3) return expo(v, 2);
  // At least 3 decimals and at least 3 significant figures (0.00412).
  const minDecimals = Math.max(3, 2 - Math.floor(Math.log10(abs)));
  // 1 - 2^-53 (the largest double below 1) needs 16 decimals, so this loop
  // always returns by k = 16; toFixed accepts up to 100.
  let k = minDecimals;
  let s = abs.toFixed(k);
  while (Number(s) >= 1 && k < 100) {
    k += 1;
    s = abs.toFixed(k);
  }
  return v < 0 ? `-${s}` : s;
}

/**
 * Format a duration for display, picking sensible units.
 * Sub-minute values use 3 significant figures (s, ms, µs, ns; scientific
 * seconds below 1 ns). Longer values use two whole-number components:
 * "1 min 30 s", "2 h 5 min", "3 d 4 h", "4 y 183 d". From 1000 years on,
 * whole years ("12000 y"), scientific at or above 1e6 years ("1.23e9 y").
 * A year is the Julian year (365.25 d), a day is 86400 s.
 * @param {number} seconds Duration in seconds, finite and >= 0.
 * @returns {string} Human-readable duration.
 * @throws {TypeError} If seconds is not a finite number.
 * @throws {RangeError} If seconds is negative.
 */
export function formatDuration(seconds) {
  assertFinite('seconds', seconds);
  if (seconds < 0) throw new RangeError(`seconds must be >= 0, got ${seconds}`);
  const abs = Math.abs(seconds); // normalizes -0
  if (abs === 0) return '0 s';
  if (abs < 1e-9) return `${expo(abs, 2)} s`;

  const subMinute = [
    [1e-9, 'ns', 1000], [1e-6, 'µs', 1000], [1e-3, 'ms', 1000], [1, 's', MINUTE_S],
  ];
  // abs >= 1 ns, so the first unit's scaled value is >= 1. If rounding to
  // 3 significant figures reaches the unit's limit (999.6 ms), the next unit
  // renders it (1.00 s).
  for (const [unit, label, limit] of subMinute) {
    const scaled = abs / unit;
    if (scaled < limit) {
      const s = scaled.toPrecision(3);
      if (!s.includes('e') && Number(s) < limit) return `${s} ${label}`;
    }
  }

  // Two-component tiers: round to the small unit, carry into the next tier
  // when rounding reaches the tier limit (e.g. 59 min 59.9 s -> 1 h 0 min).
  const tiers = [
    [MINUTE_S, 'min', 1, 's', HOUR_S],
    [HOUR_S, 'h', MINUTE_S, 'min', DAY_S],
    [DAY_S, 'd', HOUR_S, 'h', JULIAN_YEAR_S],
  ];
  for (const [big, bigLabel, small, smallLabel, limit] of tiers) {
    const total = Math.round(abs / small);
    if (total * small < limit) {
      const ratio = big / small;
      const bigN = Math.floor(total / ratio);
      return `${bigN} ${bigLabel} ${total - bigN * ratio} ${smallLabel}`;
    }
  }

  const years = abs / JULIAN_YEAR_S;
  if (years < 1000) {
    const y = Math.floor(years);
    // Only reachable when the day tier rounded a value just under 1 year up.
    if (y < 1) return '1 y 0 d';
    const d = Math.round((abs - y * JULIAN_YEAR_S) / DAY_S);
    return `${y} y ${Math.abs(d)} d`;
  }
  const rounded = Math.round(years);
  if (rounded < 1e6) return `${rounded} y`;
  return `${expo(years, 2)} y`;
}

/**
 * Format a distance, choosing m, km, AU or ly with 4 significant figures.
 * Below 1 km: m. Below 0.01 AU: km. Below 0.1 ly: AU. Otherwise: ly.
 * AU = 149597870700 m (IAU 2012), ly = c * Julian year.
 * @param {number} meters Distance in meters, finite and >= 0.
 * @returns {string} e.g. "384400 km", "1.000 AU", "4.240 ly".
 * @throws {TypeError} If meters is not a finite number.
 * @throws {RangeError} If meters is negative.
 */
export function formatDistance(meters) {
  assertFinite('meters', meters);
  if (meters < 0) throw new RangeError(`meters must be >= 0, got ${meters}`);
  const abs = Math.abs(meters);
  if (abs < 1e3) return `${fmtSig(abs, 4)} m`;
  if (abs < 0.01 * AU_M) return `${fmtSig(abs / 1e3, 4)} km`;
  if (abs < 0.1 * LIGHT_YEAR_M) return `${fmtSig(abs / AU_M, 4)} AU`;
  return `${fmtSig(abs / LIGHT_YEAR_M, 4)} ly`;
}

/**
 * Format a velocity fraction beta = v / c. Uses at least 3 decimals and 3
 * significant figures, plus as many more decimals as needed so values near
 * 1 keep their nines ("0.999999", never "1.000"). Non-zero |beta| < 1e-3 is shown in scientific notation.
 * @param {number} beta Dimensionless v/c, finite with -1 < beta < 1.
 * @returns {string} e.g. "0.600", "0.999999", "-0.800", "1.00e-5".
 * @throws {TypeError} If beta is not a finite number.
 * @throws {RangeError} If |beta| >= 1.
 */
export function formatBeta(beta) {
  assertFinite('beta', beta);
  if (Math.abs(beta) >= 1) throw new RangeError(`|beta| must be < 1, got ${beta}`);
  return fmtFraction(beta);
}

/**
 * Format a Lorentz factor with 4 significant figures (scientific at >= 1e7).
 * @param {number} gamma Dimensionless Lorentz factor, finite and >= 1.
 * @returns {string} e.g. "1.250", "1.667", "22.37", "7089", "1.000e9".
 * @throws {TypeError} If gamma is not a finite number.
 * @throws {RangeError} If gamma < 1.
 */
export function formatGamma(gamma) {
  assertFinite('gamma', gamma);
  if (gamma < 1) throw new RangeError(`gamma must be >= 1, got ${gamma}`);
  return fmtSig(gamma, 4);
}

/**
 * Format an energy with an SI prefix (q through Q, 1e-30 to 1e30) and 4
 * significant figures; magnitudes >= 1e33 J or < 1e-30 J use scientific
 * notation in joules. Signed values are allowed (energy changes).
 * @param {number} joules Energy in joules, finite.
 * @returns {string} e.g. "1.500 kJ", "89.88 PJ", "-2.500 MJ", "5.400e44 J".
 * @throws {TypeError} If joules is not a finite number.
 */
export function formatEnergy(joules) {
  assertFinite('joules', joules);
  const abs = Math.abs(joules);
  if (abs === 0) return '0 J';
  const sign = joules < 0 ? '-' : '';
  const scale = (exp) => (exp >= 0 ? abs / 10 ** exp : abs * 10 ** -exp);
  let e = Math.floor(Math.log10(abs) / 3) * 3;
  let scaled = scale(e);
  // Correct any log10 rounding so scaled lies in [1, 1000).
  if (scaled >= 1000) {
    e += 3;
    scaled = scale(e);
  } else if (scaled < 1) {
    e -= 3;
    scaled = scale(e);
  }
  let digits = scaled.toPrecision(4);
  if (Number(digits) >= 1000) {
    // 999.96 kJ rounds to 1000 kJ: carry to the next prefix (1.000 MJ).
    e += 3;
    digits = (scaled / 1000).toPrecision(4);
  }
  if (e < -30 || e > 30) return `${expo(joules, 3)} J`;
  return `${sign}${digits} ${SI_PREFIXES[String(e)]}J`;
}

/**
 * Format a speed both in m/s (4 significant figures) and as a multiple of c.
 * Below c the multiple uses formatBeta-style nines; at or above c (apparent
 * warp / hyperspace speeds) it uses 4 significant figures. Signed values
 * are allowed (direction along the travel axis).
 * @param {number} metersPerSecond Speed in m/s, finite.
 * @returns {string} e.g. "1.799e8 m/s (0.600 c)", "2.998e9 m/s (10.00 c)".
 * @throws {TypeError} If metersPerSecond is not a finite number.
 */
export function formatSpeed(metersPerSecond) {
  assertFinite('metersPerSecond', metersPerSecond);
  const v = metersPerSecond === 0 ? 0 : metersPerSecond; // normalizes -0
  const multiple = v / C;
  const cPart = Math.abs(multiple) < 1 ? fmtFraction(multiple) : fmtSig(multiple, 4);
  return `${fmtSig(v, 4)} m/s (${cPart} c)`;
}
