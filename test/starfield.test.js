import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mulberry32,
  createStarfield,
  stepStarfield,
  projectStar,
  streakColor,
  drawStarfield,
  STREAK_TIME_S,
} from '../src/render/starfield.js';

const EPS = 1e-9;

function assertClose(actual, expected, tol = EPS, msg) {
  assert.ok(Math.abs(actual - expected) <= tol, msg ?? `expected ${expected}, got ${actual}`);
}

function assertInBounds(state) {
  assert.equal(state.particles.length, state.count);
  for (const p of state.particles) {
    assert.ok(p.x >= -state.spread && p.x < state.spread, `x=${p.x}`);
    assert.ok(p.y >= -state.spread && p.y < state.spread, `y=${p.y}`);
    assert.ok(p.z > state.near && p.z <= state.far, `z=${p.z}`);
    assert.ok(p.pz >= p.z, `pz=${p.pz} z=${p.z}`);
  }
}

// Test double for CanvasRenderingContext2D: records method calls and the
// style properties in effect at each call.
function recordingContext() {
  const calls = [];
  const ctx = { calls, fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt' };
  for (const name of ['save', 'restore', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'stroke']) {
    ctx[name] = (...args) => {
      calls.push({
        name,
        args,
        fillStyle: ctx.fillStyle,
        strokeStyle: ctx.strokeStyle,
        lineWidth: ctx.lineWidth,
      });
    };
  }
  return ctx;
}

function streaks(calls) {
  const out = [];
  for (let i = 0; i < calls.length; i++) {
    if (calls[i].name === 'moveTo') {
      const [x0, y0] = calls[i].args;
      const [x1, y1] = calls[i + 1].args;
      assert.equal(calls[i + 1].name, 'lineTo');
      out.push({ length: Math.hypot(x1 - x0, y1 - y0), style: calls[i + 1].strokeStyle });
    }
  }
  return out;
}

test('mulberry32 is deterministic, seed-sensitive and in [0, 1)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const c = mulberry32(43);
  const seqA = Array.from({ length: 1000 }, a);
  const seqB = Array.from({ length: 1000 }, b);
  const seqC = Array.from({ length: 1000 }, c);
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
  const mean = seqA.reduce((s, v) => s + v, 0) / seqA.length;
  assertClose(mean, 0.5, 0.05, `mean ${mean} far from 0.5`);
  assert.throws(() => mulberry32(1.5), TypeError);
  assert.throws(() => mulberry32('1'), TypeError);
  assert.throws(() => mulberry32(-1), RangeError);
  assert.throws(() => mulberry32(2 ** 32), RangeError);
});

test('createStarfield is deterministic by seed and in bounds', () => {
  const a = createStarfield({ count: 500, seed: 7 });
  const b = createStarfield({ count: 500, seed: 7 });
  const c = createStarfield({ count: 500, seed: 8 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.particles, c.particles);
  assert.equal(a.particles.length, 500);
  assertInBounds(a);
  for (const p of a.particles) assert.equal(p.pz, p.z);
  assert.deepEqual(structuredClone(a), a);
});

test('createStarfield validates options', () => {
  assert.throws(() => createStarfield(null), TypeError);
  assert.throws(() => createStarfield({ count: 2.5 }), TypeError);
  assert.throws(() => createStarfield({ count: '10' }), TypeError);
  assert.throws(() => createStarfield({ count: 0 }), RangeError);
  assert.throws(() => createStarfield({ seed: NaN }), TypeError);
  assert.throws(() => createStarfield({ near: Infinity }), TypeError);
  assert.throws(() => createStarfield({ near: 0 }), RangeError);
  assert.throws(() => createStarfield({ near: 1, far: 1 }), RangeError);
  assert.throws(() => createStarfield({ spread: -1 }), RangeError);
  assert.equal(createStarfield().particles.length, 800);
});

test('stepStarfield moves particles by speed * dt and records previous depth', () => {
  const s = createStarfield({ count: 200, seed: 3 });
  const before = structuredClone(s.particles);
  const dt = 1 / 60;
  const speed = 0.3;
  const ret = stepStarfield(s, dt, speed);
  assert.equal(ret, s);
  for (let i = 0; i < before.length; i++) {
    const p = s.particles[i];
    const q = before[i];
    if (q.z - speed * dt > s.near) {
      assertClose(p.z, q.z - speed * dt);
      assert.equal(p.pz, q.z);
      assert.equal(p.x, q.x);
      assert.equal(p.y, q.y);
    } else {
      assert.equal(p.pz, p.z);
    }
  }
});

test('stepStarfield recycles particles, keeping count constant and in bounds', () => {
  const s = createStarfield({ count: 300, seed: 11 });
  let recycled = 0;
  for (let frame = 0; frame < 500; frame++) {
    const prevZ = s.particles.map((p) => p.z);
    stepStarfield(s, 1 / 60, 2);
    recycled += s.particles.filter((p, i) => p.z > prevZ[i]).length;
    assertInBounds(s);
  }
  assert.ok(recycled > 300, `expected many recycles, got ${recycled}`);
  // A huge step that overshoots the depth many times still wraps into range.
  stepStarfield(s, 10, 37.3);
  assertInBounds(s);
});

test('stepStarfield is deterministic and a no-op at zero speed or dt', () => {
  const a = createStarfield({ count: 100, seed: 5 });
  const b = createStarfield({ count: 100, seed: 5 });
  for (let i = 0; i < 200; i++) {
    stepStarfield(a, 0.02, 1.5);
    stepStarfield(b, 0.02, 1.5);
  }
  assert.deepEqual(a, b);
  const snapshot = structuredClone(a.particles.map((p) => [p.x, p.y, p.z]));
  stepStarfield(a, 0, 5);
  stepStarfield(a, 1, 0);
  assert.deepEqual(a.particles.map((p) => [p.x, p.y, p.z]), snapshot);
});

test('stepStarfield validates inputs', () => {
  const s = createStarfield({ count: 10, seed: 1 });
  assert.throws(() => stepStarfield(null, 1, 1), TypeError);
  assert.throws(() => stepStarfield({ particles: 'x' }, 1, 1), TypeError);
  assert.throws(() => stepStarfield(s, NaN, 1), TypeError);
  assert.throws(() => stepStarfield(s, 1, '1'), TypeError);
  assert.throws(() => stepStarfield(s, -1, 1), RangeError);
  assert.throws(() => stepStarfield(s, 1, -0.1), RangeError);
});

test('projectStar maps the optical axis to the screen centre', () => {
  for (const z of [0.01, 0.5, 1, 100]) {
    const s = projectStar({ x: 0, y: 0, z, pz: z * 2 }, 800, 600, Math.PI / 3);
    assert.equal(s.x, 400);
    assert.equal(s.y, 300);
    assert.equal(s.px, 400);
    assert.equal(s.py, 300);
    assert.equal(s.visible, true);
  }
});

test('projectStar perspective math matches f = (h/2)/tan(fov/2)', () => {
  // fov = 90 degrees => tan(45 deg) = 1 => f = h / 2 = 300 px.
  const s = projectStar({ x: 1, y: 0, z: 1 }, 800, 600, Math.PI / 2);
  assertClose(s.x, 400 + 300);
  assertClose(s.y, 300);
  // +y in world is up on screen (canvas y grows downward).
  const up = projectStar({ x: 0, y: 0.5, z: 1 }, 800, 600, Math.PI / 2);
  assertClose(up.y, 300 - 150);
  // Halving depth doubles the offset from centre.
  const near = projectStar({ x: 0.2, y: -0.1, z: 0.5, pz: 1 }, 800, 600, Math.PI / 2);
  assertClose(near.x - 400, 2 * (near.px - 400));
  assertClose(near.y - 300, 2 * (near.py - 300));
  // fov = 60 degrees => f = 300 / tan(30 deg) = 300 * sqrt(3).
  const s60 = projectStar({ x: 0.1, y: 0, z: 1 }, 800, 600);
  assertClose(s60.x, 400 + 30 * Math.sqrt(3));
  // Missing pz means no motion: previous equals current.
  assert.equal(s.px, s.x);
  assert.equal(s.py, s.y);
  // Far off-axis points are flagged invisible.
  assert.equal(projectStar({ x: 5, y: 0, z: 1 }, 800, 600, Math.PI / 2).visible, false);
});

test('projectStar validates inputs', () => {
  const p = { x: 0, y: 0, z: 1 };
  assert.throws(() => projectStar(null, 1, 1), TypeError);
  assert.throws(() => projectStar({ x: NaN, y: 0, z: 1 }, 1, 1), TypeError);
  assert.throws(() => projectStar(p, '800', 600), TypeError);
  assert.throws(() => projectStar(p, 0, 600), RangeError);
  assert.throws(() => projectStar(p, 800, -1), RangeError);
  assert.throws(() => projectStar(p, 800, 600, 0), RangeError);
  assert.throws(() => projectStar(p, 800, 600, Math.PI), RangeError);
  assert.throws(() => projectStar({ x: 0, y: 0, z: 0 }, 800, 600), RangeError);
  assert.throws(() => projectStar({ x: 0, y: 0, z: 1, pz: -1 }, 800, 600), RangeError);
});

test('streakColor is white at rest and blue-white at full warp', () => {
  assert.equal(streakColor(0, 1), 'rgba(255, 255, 255, 1.000)');
  assert.equal(streakColor(1, 0.5), 'rgba(170, 210, 255, 0.500)');
  assert.throws(() => streakColor(1.1, 1), RangeError);
  assert.throws(() => streakColor(0, -0.1), RangeError);
  assert.throws(() => streakColor(NaN, 1), TypeError);
});

test('drawStarfield uses only standard canvas methods and paints background first', () => {
  const allowed = new Set(['save', 'restore', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'stroke']);
  const ctx = recordingContext();
  const s = createStarfield({ count: 400, seed: 9 });
  const drawn = drawStarfield(ctx, s, { width: 800, height: 600, speed: 1, warp: 0 });
  for (const c of ctx.calls) assert.ok(allowed.has(c.name), c.name);
  assert.equal(ctx.calls[0].name, 'save');
  assert.deepEqual(ctx.calls[1], {
    name: 'fillRect', args: [0, 0, 800, 600], fillStyle: '#000', strokeStyle: '', lineWidth: 1,
  });
  assert.equal(ctx.calls.at(-1).name, 'restore');
  assert.equal(ctx.calls.filter((c) => c.name === 'stroke').length, drawn);
  assert.ok(drawn > 0 && drawn <= 400, `drawn=${drawn}`);
  assert.equal(ctx.lineCap, 'round');
  for (const c of ctx.calls.filter((k) => k.name === 'stroke')) {
    assert.ok(c.lineWidth >= 0.5 && c.lineWidth <= 2.5, `lineWidth=${c.lineWidth}`);
  }
});

test('drawStarfield streaks grow with speed and vanish at rest', () => {
  const s = createStarfield({ count: 400, seed: 21 });
  const lengthsAt = (speed) => {
    const ctx = recordingContext();
    drawStarfield(ctx, s, { width: 800, height: 600, speed });
    return streaks(ctx.calls).map((k) => k.length);
  };
  const total = (xs) => xs.reduce((a, b) => a + b, 0);
  const still = lengthsAt(0);
  for (const len of still) assertClose(len, 0);
  const slow = total(lengthsAt(0.5));
  const fast = total(lengthsAt(3));
  assert.ok(fast > slow && slow > 0, `slow=${slow} fast=${fast}`);

  // A single on-axis-offset star: streak length matches the projection of
  // its position STREAK_TIME_S seconds earlier.
  const one = createStarfield({ count: 1, seed: 1 });
  one.particles[0] = { x: 0.05, y: 0, z: 0.5, pz: 0.5 };
  const ctx = recordingContext();
  drawStarfield(ctx, one, { width: 800, height: 600, speed: 3, fov: Math.PI / 2 });
  const [streak] = streaks(ctx.calls);
  const tailZ = 0.5 + 3 * STREAK_TIME_S;
  assertClose(streak.length, 300 * 0.05 / 0.5 - 300 * 0.05 / tailZ, 1e-9);
});

test('drawStarfield tints streaks blue-white at warp', () => {
  const s = createStarfield({ count: 200, seed: 4 });
  const styles = (warp) => {
    const ctx = recordingContext();
    drawStarfield(ctx, s, { width: 640, height: 480, speed: 2, warp });
    return streaks(ctx.calls).map((k) => k.style);
  };
  for (const style of styles(0)) assert.match(style, /^rgba\(255, 255, 255, /);
  for (const style of styles(1)) assert.match(style, /^rgba\(170, 210, 255, /);
  for (const style of styles(true)) assert.match(style, /^rgba\(170, 210, 255, /);
});

test('drawStarfield validates inputs', () => {
  const s = createStarfield({ count: 10, seed: 1 });
  const ctx = recordingContext();
  const view = { width: 100, height: 100, speed: 1 };
  assert.throws(() => drawStarfield(null, s, view), TypeError);
  assert.throws(() => drawStarfield({ ...ctx, stroke: undefined }, s, view), TypeError);
  assert.throws(() => drawStarfield(ctx, {}, view), TypeError);
  assert.throws(() => drawStarfield(ctx, s, null), TypeError);
  assert.throws(() => drawStarfield(ctx, s, { ...view, width: NaN }), TypeError);
  assert.throws(() => drawStarfield(ctx, s, { ...view, height: 0 }), RangeError);
  assert.throws(() => drawStarfield(ctx, s, { ...view, speed: -1 }), RangeError);
  assert.throws(() => drawStarfield(ctx, s, { ...view, warp: 2 }), RangeError);
  assert.throws(() => drawStarfield(ctx, s, { ...view, warp: 'on' }), TypeError);
  assert.throws(() => drawStarfield(ctx, s, { ...view, fov: 4 }), RangeError);
  assert.equal(ctx.calls.length, 0);
});
