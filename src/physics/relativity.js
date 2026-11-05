// Special relativity toolkit, expressed in dimensionless speed beta = v / c.
// All functions are pure; inputs are validated and invalid physics throws.

/**
 * Throw a TypeError unless `value` is a finite number.
 * @param {string} name Parameter name used in the error message.
 * @param {unknown} value Value to check.
 * @returns {number} The validated value.
 */
function requireFinite(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number, got ${String(value)}`);
  }
  return value;
}

/**
 * Validate a speed fraction: finite and strictly sub-luminal (|beta| < 1).
 * @param {string} name Parameter name used in the error message.
 * @param {unknown} beta Value to check.
 * @returns {number} The validated beta.
 */
function requireBeta(name, beta) {
  requireFinite(name, beta);
  if (Math.abs(beta) >= 1) {
    throw new RangeError(`${name} must satisfy |${name}| < 1 (speed below c), got ${beta}`);
  }
  return beta;
}

/**
 * Validate a non-negative finite magnitude (duration or length).
 * @param {string} name Parameter name used in the error message.
 * @param {unknown} value Value to check.
 * @returns {number} The validated value.
 */
function requireNonNegative(name, value) {
  requireFinite(name, value);
  if (value < 0) {
    throw new RangeError(`${name} must be >= 0, got ${value}`);
  }
  return value;
}

/**
 * Lorentz factor gamma = 1 / sqrt(1 - beta^2).
 * Computed as 1 / sqrt((1 - beta)(1 + beta)) to keep precision near beta = 1.
 * @param {number} beta Speed as a fraction of c, |beta| < 1 (sign ignored).
 * @returns {number} gamma, dimensionless, >= 1.
 * @throws {TypeError} If beta is not a finite number.
 * @throws {RangeError} If |beta| >= 1.
 */
export function lorentzFactor(beta) {
  requireBeta('beta', beta);
  return 1 / Math.sqrt((1 - beta) * (1 + beta));
}

/**
 * Speed fraction for a given Lorentz factor: beta = sqrt(1 - 1 / gamma^2).
 * Computed as sqrt((gamma - 1)(gamma + 1)) / gamma for precision near gamma = 1.
 * For gamma above roughly 1e8 the result rounds to 1 in double precision.
 * @param {number} gamma Lorentz factor, gamma >= 1.
 * @returns {number} beta in [0, 1), non-negative.
 * @throws {TypeError} If gamma is not a finite number.
 * @throws {RangeError} If gamma < 1.
 */
export function betaFromGamma(gamma) {
  requireFinite('gamma', gamma);
  if (gamma < 1) {
    throw new RangeError(`gamma must be >= 1, got ${gamma}`);
  }
  return Math.sqrt((gamma - 1) * (gamma + 1)) / gamma;
}

/**
 * Rapidity phi = atanh(beta). Rapidities add linearly for collinear boosts.
 * @param {number} beta Speed as a fraction of c, |beta| < 1 (sign preserved).
 * @returns {number} Rapidity phi, dimensionless (same sign as beta).
 * @throws {TypeError} If beta is not a finite number.
 * @throws {RangeError} If |beta| >= 1.
 */
export function rapidity(beta) {
  requireBeta('beta', beta);
  return Math.atanh(beta);
}

/**
 * Speed fraction for a given rapidity: beta = tanh(phi).
 * For |phi| above roughly 19 the result rounds to +/-1 in double precision.
 * @param {number} phi Rapidity, dimensionless, any finite value.
 * @returns {number} beta in (-1, 1) mathematically (same sign as phi).
 * @throws {TypeError} If phi is not a finite number.
 */
export function betaFromRapidity(phi) {
  requireFinite('phi', phi);
  return Math.tanh(phi);
}

/**
 * Collinear relativistic velocity addition: (b1 + b2) / (1 + b1 * b2).
 * Gives the speed, in the frame where b1 is measured, of an object moving at b2
 * relative to a frame that itself moves at b1. Signs encode direction.
 * @param {number} b1 First speed fraction, |b1| < 1.
 * @param {number} b2 Second speed fraction, |b2| < 1.
 * @returns {number} Combined speed fraction, |result| < 1.
 * @throws {TypeError} If either argument is not a finite number.
 * @throws {RangeError} If |b1| >= 1 or |b2| >= 1.
 */
export function addVelocities(b1, b2) {
  requireBeta('b1', b1);
  requireBeta('b2', b2);
  return (b1 + b2) / (1 + b1 * b2);
}

/**
 * Time dilation: proper time tau = t / gamma elapsed on a clock moving at beta
 * while coordinate time t elapses in the rest frame.
 * @param {number} coordinateTime Rest-frame elapsed time, >= 0, any unit.
 * @param {number} beta Clock speed as a fraction of c, |beta| < 1.
 * @returns {number} Proper time, same unit as coordinateTime, <= coordinateTime.
 * @throws {TypeError} If an argument is not a finite number.
 * @throws {RangeError} If coordinateTime < 0 or |beta| >= 1.
 */
export function timeDilation(coordinateTime, beta) {
  requireNonNegative('coordinateTime', coordinateTime);
  return coordinateTime / lorentzFactor(beta);
}

/**
 * Length contraction: L = L0 / gamma, the length along the direction of motion
 * measured in a frame where the object moves at beta.
 * @param {number} properLength Rest-frame length L0, >= 0, any unit.
 * @param {number} beta Relative speed as a fraction of c, |beta| < 1.
 * @returns {number} Contracted length, same unit as properLength.
 * @throws {TypeError} If an argument is not a finite number.
 * @throws {RangeError} If properLength < 0 or |beta| >= 1.
 */
export function lengthContraction(properLength, beta) {
  requireNonNegative('properLength', properLength);
  return properLength / lorentzFactor(beta);
}

/**
 * Relativistic Doppler factor D = f_observed / f_emitted = 1 / (gamma (1 - beta cos(theta))).
 *
 * Convention: theta is the angle, measured in the OBSERVER's frame, between the
 * source's velocity and the line of sight from the source to the observer.
 * theta = 0 is a head-on approach (blueshift, D = sqrt((1 + beta) / (1 - beta))),
 * theta = pi is direct recession (redshift, D = sqrt((1 - beta) / (1 + beta))),
 * theta = pi / 2 is the transverse case (D = 1 / gamma). Negative beta is
 * equivalent to theta + pi.
 *
 * For a ship moving through a static star field the same formula applies with
 * theta = the apparent angle (ship frame) between the ship's heading and the
 * star, i.e. the output of aberrationAngle.
 * @param {number} beta Relative speed as a fraction of c, |beta| < 1.
 * @param {number} angleRad Observer-frame angle theta, radians, any finite value.
 * @returns {number} Frequency ratio observed / emitted, > 0 (> 1 means blueshift).
 * @throws {TypeError} If an argument is not a finite number.
 * @throws {RangeError} If |beta| >= 1.
 */
export function dopplerFactor(beta, angleRad) {
  requireBeta('beta', beta);
  requireFinite('angleRad', angleRad);
  return 1 / (lorentzFactor(beta) * (1 - beta * Math.cos(angleRad)));
}

/**
 * Relativistic aberration of starlight seen from a ship moving at beta.
 *
 * Input theta is the angle, in the star field's rest frame, between the ship's
 * direction of motion and the direction from the ship to the star. Output is the
 * apparent angle theta' in the ship frame, with
 *   cos(theta') = (cos(theta) + beta) / (1 + beta cos(theta)),
 * evaluated as atan2(sin(theta), gamma (cos(theta) + beta)) for quadrant safety.
 * For beta > 0 stars crowd toward the heading (theta' <= theta), producing the
 * forward "bunching" seen at high speed. The sign of theta is preserved, so the
 * star stays on the same side of the heading; the result lies in (-pi, pi].
 * @param {number} beta Ship speed as a fraction of c, |beta| < 1.
 * @param {number} angleRad Rest-frame angle theta from the heading, radians.
 * @returns {number} Apparent ship-frame angle theta', radians, in (-pi, pi].
 * @throws {TypeError} If an argument is not a finite number.
 * @throws {RangeError} If |beta| >= 1.
 */
export function aberrationAngle(beta, angleRad) {
  requireBeta('beta', beta);
  requireFinite('angleRad', angleRad);
  const gamma = lorentzFactor(beta);
  return Math.atan2(Math.sin(angleRad), gamma * (Math.cos(angleRad) + beta));
}
