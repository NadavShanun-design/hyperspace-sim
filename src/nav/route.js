// Shortest multi-jump route between catalog stars (Dijkstra over the Sun plus the catalog).
// Any two bodies closer than or equal to maxJumpLy are joined by an edge weighted by their distance.

import { STARS } from '../data/stars.js';
import { starPosition } from './coords.js';

/** Name of the body placed at the origin of the catalog frame. */
export const SUN_NAME = 'Sun';

/**
 * @typedef {Object} RouteLeg
 * @property {string} from        canonical name of the departure body
 * @property {string} to          canonical name of the arrival body
 * @property {number} distanceLy  straight-line length of the jump, light years
 */

/**
 * @typedef {Object} Route
 * @property {string[]} path    canonical body names from origin to destination, inclusive
 * @property {RouteLeg[]} legs  one entry per jump (path.length - 1 entries)
 * @property {number} totalLy   sum of leg distances, light years
 */

function normalizeName(name, label) {
  if (typeof name !== 'string') {
    throw new TypeError(`${label} must be a string, got ${typeof name}`);
  }
  const key = name.trim().toLowerCase();
  if (key === '') {
    throw new RangeError(`${label} must not be empty`);
  }
  return key;
}

function buildBodies(stars) {
  if (!Array.isArray(stars)) {
    throw new TypeError('stars must be an array of catalog entries');
  }
  const bodies = [{ name: SUN_NAME, pos: { x: 0, y: 0, z: 0 } }];
  const index = new Map([[SUN_NAME.toLowerCase(), 0]]);
  for (const star of stars) {
    if (star === null || typeof star !== 'object') {
      throw new TypeError('every entry in stars must be an object');
    }
    const key = normalizeName(star.name, 'star.name');
    if (index.has(key)) {
      throw new RangeError(`duplicate body name in stars: ${star.name}`);
    }
    index.set(key, bodies.length);
    bodies.push({ name: star.name, pos: starPosition(star) });
  }
  return { bodies, index };
}

function lookup(index, name, label) {
  const i = index.get(normalizeName(name, label));
  if (i === undefined) {
    throw new RangeError(`unknown star: ${name}`);
  }
  return i;
}

function separation(p, q) {
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
}

/**
 * Plan the shortest-total-distance route between two bodies where no single jump exceeds maxJumpLy.
 * The Sun is always present at the origin under the name "Sun". Names are matched like findStar
 * (trimmed, case-insensitive); the returned names are the canonical catalog spellings.
 *
 * @param {string} fromName       departure body name
 * @param {string} toName         destination body name
 * @param {number} maxJumpLy      longest allowed single jump, light years, > 0
 * @param {ReadonlyArray<{name: string, ra_hours: number, dec_deg: number, distance_ly: number}>} [stars=STARS]
 *   catalog to route over (must not contain a body named "Sun"; names unique case-insensitively)
 * @returns {Route | null} the route, or null if the destination is unreachable
 * @throws {TypeError} if a name is not a string, maxJumpLy is not a finite number, or stars is malformed
 * @throws {RangeError} if a name is unknown or empty, maxJumpLy <= 0, or stars has duplicate names
 */
export function planRoute(fromName, toName, maxJumpLy, stars = STARS) {
  if (typeof maxJumpLy !== 'number' || !Number.isFinite(maxJumpLy)) {
    throw new TypeError(`maxJumpLy must be a finite number, got ${String(maxJumpLy)}`);
  }
  if (maxJumpLy <= 0) {
    throw new RangeError(`maxJumpLy must be > 0, got ${maxJumpLy}`);
  }
  const { bodies, index } = buildBodies(stars);
  const source = lookup(index, fromName, 'fromName');
  const target = lookup(index, toName, 'toName');

  const n = bodies.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[source] = 0;

  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    for (let i = 0; i < n; i++) {
      if (!done[i] && dist[i] !== Infinity && (u === -1 || dist[i] < dist[u])) u = i;
    }
    if (u === -1 || u === target) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      const d = separation(bodies[u].pos, bodies[v].pos);
      if (d > maxJumpLy) continue;
      const alt = dist[u] + d;
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
      }
    }
  }

  if (dist[target] === Infinity) return null;

  const order = [];
  for (let at = target; at !== -1; at = prev[at]) order.push(at);
  order.reverse();

  const legs = [];
  let totalLy = 0;
  for (let i = 1; i < order.length; i++) {
    const a = bodies[order[i - 1]];
    const b = bodies[order[i]];
    const distanceLy = separation(a.pos, b.pos);
    legs.push({ from: a.name, to: b.name, distanceLy });
    totalLy += distanceLy;
  }
  return { path: order.map((i) => bodies[i].name), legs, totalLy };
}
