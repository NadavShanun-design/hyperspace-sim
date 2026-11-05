import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lorentzFactor,
  betaFromGamma,
  rapidity,
  betaFromRapidity,
  addVelocities,
  timeDilation,
  lengthContraction,
  dopplerFactor,
  aberrationAngle,
} from '../src/physics/relativity.js';

const EPS = 1e-12;

function close(actual, expected, tol = EPS, msg = '') {
  assert.ok(
    Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected)),
    `${msg} expected ${expected}, got ${actual}`,
  );
}

const BAD_NUMBERS = [NaN, Infinity, -Infinity, '0.5', null, undefined, 1n, {}];

test('lorentzFactor matches known values', () => {
  assert.equal(lorentzFactor(0), 1);
  close(lorentzFactor(0.6), 1.25);
  close(lorentzFactor(0.8), 5 / 3);
  close(lorentzFactor(0.99), 1 / Math.sqrt(0.0199));
  close(lorentzFactor(-0.6), 1.25, EPS, 'sign of beta is irrelevant');
});

test('lorentzFactor tends to 1 + beta^2 / 2 at low speed', () => {
  const b = 1e-4;
  close(lorentzFactor(b), 1 + (b * b) / 2, 1e-15);
});

test('lorentzFactor rejects bad input', () => {
  for (const v of BAD_NUMBERS) assert.throws(() => lorentzFactor(v), TypeError);
  for (const v of [1, -1, 1.5, -2]) assert.throws(() => lorentzFactor(v), RangeError);
});

test('betaFromGamma inverts lorentzFactor', () => {
  assert.equal(betaFromGamma(1), 0);
  close(betaFromGamma(1.25), 0.6);
  close(betaFromGamma(5 / 3), 0.8);
  for (const b of [1e-6, 0.1, 0.5, 0.9, 0.999999]) {
    close(betaFromGamma(lorentzFactor(b)), b, 1e-9, `beta=${b}`);
  }
  for (const v of BAD_NUMBERS) assert.throws(() => betaFromGamma(v), TypeError);
  for (const v of [0.999, 0, -1]) assert.throws(() => betaFromGamma(v), RangeError);
});

test('rapidity and betaFromRapidity are inverse and match closed forms', () => {
  assert.equal(rapidity(0), 0);
  close(rapidity(0.6), Math.LN2);
  close(rapidity(0.8), Math.log(3));
  close(rapidity(-0.6), -Math.LN2);
  close(betaFromRapidity(Math.LN2), 0.6);
  close(betaFromRapidity(Math.log(3)), 0.8);
  for (const b of [-0.95, -0.3, 0, 0.3, 0.95]) {
    close(betaFromRapidity(rapidity(b)), b, 1e-12, `beta=${b}`);
  }
  for (const v of BAD_NUMBERS) {
    assert.throws(() => rapidity(v), TypeError);
    assert.throws(() => betaFromRapidity(v), TypeError);
  }
  assert.throws(() => rapidity(1), RangeError);
  assert.throws(() => rapidity(-1), RangeError);
});

test('rapidity relates to gamma via cosh', () => {
  for (const b of [0.1, 0.6, 0.9]) {
    close(Math.cosh(rapidity(b)), lorentzFactor(b), 1e-12, `beta=${b}`);
  }
});

test('addVelocities matches known values and limits', () => {
  close(addVelocities(0.5, 0.5), 0.8);
  close(addVelocities(0.6, 0.6), 15 / 17);
  close(addVelocities(0.6, -0.6), 0);
  close(addVelocities(0, 0.7), 0.7);
  close(addVelocities(0.9, 0.9), 1.8 / 1.81);
  // Galilean limit at low speed.
  close(addVelocities(1e-6, 2e-6), 3e-6, 1e-9);
  // Never reaches c.
  assert.ok(addVelocities(0.99, 0.99) < 1);
});

test('addVelocities equals adding rapidities', () => {
  for (const [a, b] of [[0.3, 0.4], [0.9, -0.2], [-0.7, -0.7]]) {
    close(addVelocities(a, b), betaFromRapidity(rapidity(a) + rapidity(b)), 1e-12);
  }
});

test('addVelocities rejects bad input', () => {
  for (const v of BAD_NUMBERS) {
    assert.throws(() => addVelocities(v, 0.1), TypeError);
    assert.throws(() => addVelocities(0.1, v), TypeError);
  }
  assert.throws(() => addVelocities(1, 0.1), RangeError);
  assert.throws(() => addVelocities(0.1, -1), RangeError);
});

test('timeDilation gives proper time t / gamma', () => {
  close(timeDilation(10, 0.6), 8);
  close(timeDilation(5, 0.8), 3);
  assert.equal(timeDilation(7, 0), 7);
  assert.equal(timeDilation(0, 0.9), 0);
  for (const v of BAD_NUMBERS) {
    assert.throws(() => timeDilation(v, 0.5), TypeError);
    assert.throws(() => timeDilation(1, v), TypeError);
  }
  assert.throws(() => timeDilation(-1, 0.5), RangeError);
  assert.throws(() => timeDilation(1, 1), RangeError);
});

test('lengthContraction gives L0 / gamma', () => {
  close(lengthContraction(100, 0.8), 60);
  close(lengthContraction(4.2465, 0.6), 4.2465 * 0.8);
  assert.equal(lengthContraction(3, 0), 3);
  for (const v of BAD_NUMBERS) {
    assert.throws(() => lengthContraction(v, 0.5), TypeError);
    assert.throws(() => lengthContraction(1, v), TypeError);
  }
  assert.throws(() => lengthContraction(-0.1, 0.5), RangeError);
  assert.throws(() => lengthContraction(1, -1), RangeError);
});

test('dopplerFactor matches longitudinal and transverse closed forms', () => {
  close(dopplerFactor(0.6, 0), 2, EPS, 'head-on approach');
  close(dopplerFactor(0.6, Math.PI), 0.5, EPS, 'direct recession');
  close(dopplerFactor(0.6, Math.PI / 2), 0.8, EPS, 'transverse redshift');
  close(dopplerFactor(0.8, 0), 3);
  close(dopplerFactor(0.8, Math.PI), 1 / 3);
  assert.equal(dopplerFactor(0, 1.234), 1);
  close(dopplerFactor(-0.6, 0), dopplerFactor(0.6, Math.PI), EPS, 'negative beta flips direction');
});

test('dopplerFactor approach and recession are reciprocal', () => {
  for (const b of [0.1, 0.5, 0.95]) {
    close(dopplerFactor(b, 0) * dopplerFactor(b, Math.PI), 1, 1e-12);
  }
});

test('dopplerFactor rejects bad input', () => {
  for (const v of BAD_NUMBERS) {
    assert.throws(() => dopplerFactor(v, 0), TypeError);
    assert.throws(() => dopplerFactor(0.5, v), TypeError);
  }
  assert.throws(() => dopplerFactor(1, 0), RangeError);
});

test('aberrationAngle matches known values', () => {
  close(aberrationAngle(0.5, Math.PI / 2), Math.PI / 3, EPS, 'side star moves to 60 deg');
  close(aberrationAngle(0.6, Math.PI / 2), Math.acos(0.6));
  assert.equal(aberrationAngle(0.9, 0), 0);
  close(aberrationAngle(0.9, Math.PI), Math.PI, EPS, 'star directly behind stays behind');
  close(aberrationAngle(0, 1.1), 1.1, EPS, 'no aberration at rest');
});

test('aberrationAngle satisfies the cosine formula and bunches stars forward', () => {
  for (const b of [0.2, 0.7, 0.99]) {
    for (const th of [0.1, 0.5, 1, 1.5, 2, 2.5, 3]) {
      const ap = aberrationAngle(b, th);
      close(Math.cos(ap), (Math.cos(th) + b) / (1 + b * Math.cos(th)), 1e-12);
      assert.ok(ap < th, `beta=${b} theta=${th} should move forward`);
      assert.ok(ap > 0);
    }
  }
});

test('aberrationAngle is inverted by the opposite boost and preserves side', () => {
  for (const th of [-2.5, -0.4, 0.4, 1.2, 2.9]) {
    close(aberrationAngle(-0.8, aberrationAngle(0.8, th)), th, 1e-12, `theta=${th}`);
  }
  close(aberrationAngle(0.5, -Math.PI / 2), -Math.PI / 3);
});

test('Doppler at the aberrated angle equals gamma (1 + beta cos theta)', () => {
  for (const b of [0.3, 0.9]) {
    for (const th of [0, 0.7, Math.PI / 2, 2.2, Math.PI]) {
      const expected = lorentzFactor(b) * (1 + b * Math.cos(th));
      close(dopplerFactor(b, aberrationAngle(b, th)), expected, 1e-12);
    }
  }
});

test('aberrationAngle rejects bad input', () => {
  for (const v of BAD_NUMBERS) {
    assert.throws(() => aberrationAngle(v, 0), TypeError);
    assert.throws(() => aberrationAngle(0.5, v), TypeError);
  }
  assert.throws(() => aberrationAngle(-1, 0), RangeError);
});
