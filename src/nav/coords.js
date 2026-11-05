// Equatorial (ICRS, J2000) to heliocentric Cartesian coordinates, in light years.
// Axes: +x toward RA 0h / Dec 0, +y toward RA 6h / Dec 0, +z toward the north celestial pole.

const DEG_TO_RAD = Math.PI / 180;
const HOURS_TO_RAD = Math.PI / 12;

/**
 * @typedef {Object} Vec3
 * @property {number} x  light years, toward RA 0h / Dec 0
 * @property {number} y  light years, toward RA 6h / Dec 0
 * @property {number} z  light years, toward the north celestial pole
 */

function requireFinite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number, got ${String(value)}`);
  }
}

/**
 * Convert equatorial coordinates to Cartesian coordinates with the Sun at the origin.
 *
 * x = d cos(dec) cos(ra), y = d cos(dec) sin(ra), z = d sin(dec), where ra = raHours * 15 deg.
 *
 * @param {number} raHours     right ascension in hours, 0 <= raHours < 24
 * @param {number} decDeg      declination in degrees, -90 <= decDeg <= 90
 * @param {number} distanceLy  distance from the Sun in light years, >= 0
 * @returns {Vec3} position in light years
 * @throws {TypeError} if any argument is not a finite number
 * @throws {RangeError} if raHours, decDeg or distanceLy is out of range
 */
export function equatorialToCartesian(raHours, decDeg, distanceLy) {
  requireFinite(raHours, 'raHours');
  requireFinite(decDeg, 'decDeg');
  requireFinite(distanceLy, 'distanceLy');
  if (raHours < 0 || raHours >= 24) {
    throw new RangeError(`raHours must be in [0, 24), got ${raHours}`);
  }
  if (decDeg < -90 || decDeg > 90) {
    throw new RangeError(`decDeg must be in [-90, 90], got ${decDeg}`);
  }
  if (distanceLy < 0) {
    throw new RangeError(`distanceLy must be >= 0, got ${distanceLy}`);
  }
  const ra = raHours * HOURS_TO_RAD;
  const dec = decDeg * DEG_TO_RAD;
  const cosDec = Math.cos(dec);
  return {
    x: distanceLy * cosDec * Math.cos(ra),
    y: distanceLy * cosDec * Math.sin(ra),
    z: distanceLy * Math.sin(dec),
  };
}

/**
 * Cartesian position of a catalog star (uses its ra_hours, dec_deg and distance_ly fields).
 * @param {{ra_hours: number, dec_deg: number, distance_ly: number}} star  catalog entry
 * @returns {Vec3} position in light years
 * @throws {TypeError} if star is not an object or its fields are not finite numbers
 * @throws {RangeError} if its fields are out of range
 */
export function starPosition(star) {
  if (star === null || typeof star !== 'object') {
    throw new TypeError(`star must be an object, got ${star === null ? 'null' : typeof star}`);
  }
  return equatorialToCartesian(star.ra_hours, star.dec_deg, star.distance_ly);
}

/**
 * Straight-line (Euclidean) distance between two catalog stars.
 * @param {{ra_hours: number, dec_deg: number, distance_ly: number}} a  catalog entry
 * @param {{ra_hours: number, dec_deg: number, distance_ly: number}} b  catalog entry
 * @returns {number} separation in light years
 * @throws {TypeError|RangeError} if either star is invalid (see starPosition)
 */
export function distanceBetween(a, b) {
  const p = starPosition(a);
  const q = starPosition(b);
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
}
