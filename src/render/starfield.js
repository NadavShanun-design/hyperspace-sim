// Hyperspace-jump starfield: a DOM-free particle core (seeded, reproducible)
// plus a Canvas 2D renderer that draws speed-dependent streaks.
//
// World space: the camera sits at the origin looking down +z. Particles live
// in the box x, y in [-spread, spread), z in (near, far] and fly toward the
// camera (z decreases). Lengths are in arbitrary "depth units" (far = 1 by
// default); speeds are depth units per second; dt is in seconds.

/** Default number of particles. */
export const DEFAULT_COUNT = 800;

/** Default PRNG seed. */
export const DEFAULT_SEED = 1;

/** Default half-width of the particle box in x and y, depth units. */
export const DEFAULT_SPREAD = 1;

/** Default near recycle plane, depth units (particles at z <= near respawn). */
export const DEFAULT_NEAR = 0.01;

/** Default far spawn plane, depth units. */
export const DEFAULT_FAR = 1;

/** Default vertical field of view, radians (60 degrees). */
export const DEFAULT_FOV = Math.PI / 3;

/**
 * Exposure time used to turn speed into streak length, seconds. The streak
 * tail is the particle position STREAK_TIME_S seconds ago at the draw speed.
 */
export const STREAK_TIME_S = 1 / 30;

const MAX_COUNT = 1_000_000;
const UINT32_MAX = 0xffffffff;
const CTX_METHODS = ['save', 'restore', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'stroke'];

function assertFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number, got ${String(value)}`);
  }
}

function assertObject(value, name) {
  if (value === null || typeof value !== 'object') {
    throw new TypeError(`${name} must be an object`);
  }
}

function assertSeed(seed) {
  if (typeof seed !== 'number' || !Number.isInteger(seed)) {
    throw new TypeError(`seed must be an integer, got ${String(seed)}`);
  }
  if (seed < 0 || seed > UINT32_MAX) {
    throw new RangeError(`seed must be in [0, ${UINT32_MAX}], got ${seed}`);
  }
}

// One mulberry32 step on a holder object { rngState: int32 }; returns [0, 1).
function nextRandom(holder) {
  holder.rngState = (holder.rngState + 0x6d2b79f5) | 0;
  const a = holder.rngState;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function assertState(state) {
  assertObject(state, 'state');
  if (!Array.isArray(state.particles)) {
    throw new TypeError('state.particles must be an array');
  }
  if (!Number.isInteger(state.rngState)) {
    throw new TypeError('state.rngState must be an integer');
  }
  assertFinite(state.spread, 'state.spread');
  assertFinite(state.near, 'state.near');
  assertFinite(state.far, 'state.far');
  if (!(state.spread > 0) || !(state.near > 0) || !(state.far > state.near)) {
    throw new RangeError('state requires spread > 0 and 0 < near < far');
  }
}

function respawnXY(state, p) {
  p.x = (nextRandom(state) * 2 - 1) * state.spread;
  p.y = (nextRandom(state) * 2 - 1) * state.spread;
}

/**
 * Create a mulberry32 pseudo-random generator.
 * @param {number} seed Unsigned 32-bit integer seed.
 * @returns {() => number} Function returning uniform floats in [0, 1).
 */
export function mulberry32(seed) {
  assertSeed(seed);
  const holder = { rngState: seed | 0 };
  return () => nextRandom(holder);
}

/**
 * Create a deterministic starfield. Same options always yield the same state.
 * The state is plain data (structuredClone-safe); the PRNG position is stored
 * in state.rngState so recycling stays reproducible.
 * @param {object} [options]
 * @param {number} [options.count=800] Integer number of particles, 1..1e6.
 * @param {number} [options.seed=1] Unsigned 32-bit integer PRNG seed.
 * @param {number} [options.spread=1] Half-width of the x/y box, depth units.
 * @param {number} [options.near=0.01] Recycle plane, depth units (> 0).
 * @param {number} [options.far=1] Spawn plane, depth units (> near).
 * @returns {{count: number, seed: number, spread: number, near: number, far: number,
 *   rngState: number, particles: Array<{x: number, y: number, z: number, pz: number}>}}
 *   Starfield state; each particle has position (x, y, z) and previous depth pz.
 */
export function createStarfield(options = {}) {
  assertObject(options, 'options');
  const {
    count = DEFAULT_COUNT,
    seed = DEFAULT_SEED,
    spread = DEFAULT_SPREAD,
    near = DEFAULT_NEAR,
    far = DEFAULT_FAR,
  } = options;
  if (typeof count !== 'number' || !Number.isInteger(count)) {
    throw new TypeError(`count must be an integer, got ${String(count)}`);
  }
  if (count < 1 || count > MAX_COUNT) {
    throw new RangeError(`count must be in [1, ${MAX_COUNT}], got ${count}`);
  }
  assertSeed(seed);
  assertFinite(spread, 'spread');
  assertFinite(near, 'near');
  assertFinite(far, 'far');
  if (spread <= 0) throw new RangeError(`spread must be > 0, got ${spread}`);
  if (near <= 0) throw new RangeError(`near must be > 0, got ${near}`);
  if (far <= near) throw new RangeError(`far must be > near, got far=${far}, near=${near}`);

  const state = { count, seed, spread, near, far, rngState: seed | 0, particles: [] };
  const depth = far - near;
  for (let i = 0; i < count; i++) {
    const p = { x: 0, y: 0, z: 0, pz: 0 };
    respawnXY(state, p);
    p.z = far - nextRandom(state) * depth; // (near, far]
    p.pz = p.z;
    state.particles.push(p);
  }
  return state;
}

/**
 * Advance every particle toward the camera by speed * dt and recycle those
 * that cross the near plane back to the far end (wrapping the overshoot) with
 * fresh x/y. Mutates and returns state; particle count never changes.
 * After the call, p.pz is the depth before the step (equal to p.z for a
 * particle that was just recycled, so no streak spans the wrap).
 * @param {object} state State from createStarfield.
 * @param {number} dt Time step, seconds (>= 0).
 * @param {number} speed Forward speed, depth units per second (>= 0).
 * @returns {object} The same state object.
 */
export function stepStarfield(state, dt, speed) {
  assertState(state);
  assertFinite(dt, 'dt');
  assertFinite(speed, 'speed');
  if (dt < 0) throw new RangeError(`dt must be >= 0, got ${dt}`);
  if (speed < 0) throw new RangeError(`speed must be >= 0, got ${speed}`);

  const { near, far } = state;
  const depth = far - near;
  const travel = speed * dt;
  for (const p of state.particles) {
    const z = p.z - travel;
    if (z > near) {
      p.pz = p.z;
      p.z = z;
    } else {
      const overshoot = (near - z) % depth; // [0, depth)
      respawnXY(state, p);
      p.z = far - overshoot; // (near, far]
      p.pz = p.z;
    }
  }
  return state;
}

/**
 * Perspective-project a particle onto a width x height screen (canvas pixels,
 * y down). Focal length f = (height / 2) / tan(fov / 2); screen point is
 * (width / 2 + f * x / z, height / 2 - f * y / z).
 * @param {{x: number, y: number, z: number, pz?: number}} p Particle; pz is the
 *   previous-frame depth (defaults to z).
 * @param {number} width Screen width, pixels (> 0).
 * @param {number} height Screen height, pixels (> 0).
 * @param {number} [fov=Math.PI/3] Vertical field of view, radians, in (0, pi).
 * @returns {{x: number, y: number, px: number, py: number, visible: boolean}}
 *   Current (x, y) and previous-frame (px, py) screen coordinates in pixels;
 *   visible is true when (x, y) lies inside [0, width] x [0, height].
 */
export function projectStar(p, width, height, fov = DEFAULT_FOV) {
  assertObject(p, 'p');
  assertFinite(p.x, 'p.x');
  assertFinite(p.y, 'p.y');
  assertFinite(p.z, 'p.z');
  const pz = p.pz === undefined ? p.z : p.pz;
  assertFinite(pz, 'p.pz');
  assertFinite(width, 'width');
  assertFinite(height, 'height');
  assertFinite(fov, 'fov');
  if (width <= 0) throw new RangeError(`width must be > 0, got ${width}`);
  if (height <= 0) throw new RangeError(`height must be > 0, got ${height}`);
  if (fov <= 0 || fov >= Math.PI) throw new RangeError(`fov must be in (0, pi), got ${fov}`);
  if (p.z <= 0) throw new RangeError(`p.z must be > 0 (in front of camera), got ${p.z}`);
  if (pz <= 0) throw new RangeError(`p.pz must be > 0 (in front of camera), got ${pz}`);

  const f = height / 2 / Math.tan(fov / 2);
  const cx = width / 2;
  const cy = height / 2;
  const x = cx + (f * p.x) / p.z;
  const y = cy - (f * p.y) / p.z;
  const px = cx + (f * p.x) / pz;
  const py = cy - (f * p.y) / pz;
  const visible = x >= 0 && x <= width && y >= 0 && y <= height;
  return { x, y, px, py, visible };
}

/**
 * Streak colour for a warp level and brightness: white at warp 0, blending
 * to blue-white rgb(170, 210, 255) at warp 1.
 * @param {number} warp Warp intensity in [0, 1].
 * @param {number} alpha Opacity in [0, 1].
 * @returns {string} CSS rgba() colour string.
 */
export function streakColor(warp, alpha) {
  assertFinite(warp, 'warp');
  assertFinite(alpha, 'alpha');
  if (warp < 0 || warp > 1) throw new RangeError(`warp must be in [0, 1], got ${warp}`);
  if (alpha < 0 || alpha > 1) throw new RangeError(`alpha must be in [0, 1], got ${alpha}`);
  const r = Math.round(255 - 85 * warp);
  const g = Math.round(255 - 45 * warp);
  return `rgba(${r}, ${g}, 255, ${alpha.toFixed(3)})`;
}

/**
 * Draw the starfield on a CanvasRenderingContext2D: a black background, then
 * one streak per on-screen particle from its position STREAK_TIME_S seconds
 * ago (depth z + speed * STREAK_TIME_S, capped at far) to its current
 * position, so streak length grows with speed. Nearer stars are brighter and
 * thicker. Uses only save, restore, fillRect, beginPath, moveTo, lineTo,
 * stroke and the fillStyle, strokeStyle, lineWidth, lineCap properties.
 * @param {CanvasRenderingContext2D} ctx Target 2D context.
 * @param {object} state State from createStarfield.
 * @param {object} view
 * @param {number} view.width Canvas width, pixels (> 0).
 * @param {number} view.height Canvas height, pixels (> 0).
 * @param {number} view.speed Forward speed, depth units per second (>= 0).
 * @param {number|boolean} [view.warp=0] Warp tint intensity in [0, 1]
 *   (true = 1, false = 0).
 * @param {number} [view.fov=Math.PI/3] Vertical field of view, radians.
 * @returns {number} Number of streaks drawn.
 */
export function drawStarfield(ctx, state, view) {
  assertObject(ctx, 'ctx');
  for (const m of CTX_METHODS) {
    if (typeof ctx[m] !== 'function') throw new TypeError(`ctx.${m} must be a function`);
  }
  assertState(state);
  assertObject(view, 'view');
  const { width, height, speed, fov = DEFAULT_FOV } = view;
  let { warp = 0 } = view;
  if (typeof warp === 'boolean') warp = warp ? 1 : 0;
  assertFinite(width, 'width');
  assertFinite(height, 'height');
  assertFinite(speed, 'speed');
  assertFinite(warp, 'warp');
  assertFinite(fov, 'fov');
  if (width <= 0) throw new RangeError(`width must be > 0, got ${width}`);
  if (height <= 0) throw new RangeError(`height must be > 0, got ${height}`);
  if (speed < 0) throw new RangeError(`speed must be >= 0, got ${speed}`);
  if (warp < 0 || warp > 1) throw new RangeError(`warp must be in [0, 1], got ${warp}`);
  if (fov <= 0 || fov >= Math.PI) throw new RangeError(`fov must be in (0, pi), got ${fov}`);

  const { near, far } = state;
  const depth = far - near;
  const tailDepth = speed * STREAK_TIME_S;
  let drawn = 0;

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.lineCap = 'round';
  for (const p of state.particles) {
    const tail = { x: p.x, y: p.y, z: p.z, pz: Math.min(far, p.z + tailDepth) };
    const s = projectStar(tail, width, height, fov);
    // The tail lies on the same ray from the centre, nearer the centre than
    // the head; if the tail is off-screen the whole streak is.
    if (s.px < 0 || s.px > width || s.py < 0 || s.py > height) continue;
    const closeness = Math.min(1, Math.max(0, 1 - (p.z - near) / depth));
    ctx.strokeStyle = streakColor(warp, 0.25 + 0.75 * closeness);
    ctx.lineWidth = 0.5 + 2 * closeness;
    ctx.beginPath();
    ctx.moveTo(s.px, s.py);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
    drawn++;
  }
  ctx.restore();
  return drawn;
}
