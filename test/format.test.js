// Tests for the locale-independent HUD / CLI formatting helpers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, JULIAN_YEAR_S, LIGHT_YEAR_M } from '../src/physics/constants.js';
import {
  formatDuration,
  formatDistance,
  formatBeta,
  formatGamma,
  formatEnergy,
  formatSpeed,
} from '../src/render/format.js';

const AU = 149_597_870_700;
const ALL = [formatDuration, formatDistance, formatBeta, formatGamma, formatEnergy, formatSpeed];

test('every formatter rejects non-finite and non-number input with TypeError', () => {
  for (const fn of ALL) {
    for (const bad of [Infinity, -Infinity, NaN, '1', null, undefined, 1n, {}, [1]]) {
      assert.throws(() => fn(bad), TypeError, `${fn.name}(${String(bad)})`);
    }
  }
});

test('formatDuration: zero, sub-second SI units and scientific tiny values', () => {
  assert.equal(formatDuration(0), '0 s');
  assert.equal(formatDuration(-0), '0 s');
  assert.equal(formatDuration(1e-12), '1.00e-12 s');
  assert.equal(formatDuration(2.5e-9), '2.50 ns');
  assert.equal(formatDuration(2.5e-6), '2.50 µs');
  assert.equal(formatDuration(0.25), '250 ms');
  assert.equal(formatDuration(0.0015), '1.50 ms');
  assert.equal(formatDuration(1.5), '1.50 s');
  assert.equal(formatDuration(45.3), '45.3 s');
});

test('formatDuration: rounding carries into the next unit instead of overflowing', () => {
  assert.equal(formatDuration(0.9996), '1.00 s');
  assert.equal(formatDuration(59.96), '1 min 0 s');
  assert.equal(formatDuration(3599.6), '1 h 0 min');
  assert.equal(formatDuration(86_399.9), '1 d 0 h');
  assert.equal(formatDuration(JULIAN_YEAR_S - 1), '1 y 0 d');
});

test('formatDuration: two-component minutes, hours, days, years (Julian)', () => {
  assert.equal(formatDuration(90), '1 min 30 s');
  assert.equal(formatDuration(3600), '1 h 0 min');
  assert.equal(formatDuration(2 * 3600 + 5 * 60), '2 h 5 min');
  assert.equal(formatDuration(86_400), '1 d 0 h');
  assert.equal(formatDuration(3 * 86_400 + 4 * 3600), '3 d 4 h');
  assert.equal(formatDuration(JULIAN_YEAR_S), '1 y 0 d');
  // 4.5 Julian years = 4 y + 182.625 d -> 183 d.
  assert.equal(formatDuration(4.5 * JULIAN_YEAR_S), '4 y 183 d');
  // Remainder never reaches a full year: 365 d < 365.25 d.
  assert.equal(formatDuration(2 * JULIAN_YEAR_S + 365 * 86_400), '2 y 365 d');
});

test('formatDuration: very long spans use whole then scientific years', () => {
  assert.equal(formatDuration(1000 * JULIAN_YEAR_S), '1000 y');
  assert.equal(formatDuration(12_345.4 * JULIAN_YEAR_S), '12345 y');
  assert.equal(formatDuration(1.23e9 * JULIAN_YEAR_S), '1.23e9 y');
  // Number.MAX_VALUE / JULIAN_YEAR_S = 5.6966...e300 years.
  assert.equal(formatDuration(Number.MAX_VALUE), '5.70e300 y');
});

test('formatDuration: negative durations are RangeError', () => {
  assert.throws(() => formatDuration(-1), RangeError);
  assert.throws(() => formatDuration(-1e-300), RangeError);
});

test('formatDistance: picks m, km, AU, ly', () => {
  assert.equal(formatDistance(0), '0 m');
  assert.equal(formatDistance(1), '1.000 m');
  assert.equal(formatDistance(0.5), '0.5000 m');
  assert.equal(formatDistance(1e-6), '1.000e-6 m');
  assert.equal(formatDistance(1500), '1.500 km');
  assert.equal(formatDistance(6_371_000), '6371 km');
  assert.equal(formatDistance(384_400_000), '384400 km');
  assert.equal(formatDistance(AU), '1.000 AU');
  assert.equal(formatDistance(5.2 * AU), '5.200 AU');
  assert.equal(formatDistance(LIGHT_YEAR_M), '1.000 ly');
  assert.equal(formatDistance(4.24 * LIGHT_YEAR_M), '4.240 ly');
  assert.equal(formatDistance(2.537e6 * LIGHT_YEAR_M), '2537000 ly');
  assert.equal(formatDistance(1e10 * LIGHT_YEAR_M), '1.000e10 ly');
});

test('formatDistance: unit boundaries use AU = 149597870700 m exactly', () => {
  assert.equal(formatDistance(999), '999.0 m');
  assert.equal(formatDistance(1000), '1.000 km');
  assert.equal(formatDistance(0.01 * AU - 1), '1495979 km');
  assert.equal(formatDistance(0.01 * AU), '0.01000 AU');
  // 0.1 ly in AU = 0.1 * LIGHT_YEAR_M / AU ~ 6324 AU.
  assert.equal(formatDistance(0.1 * LIGHT_YEAR_M - 1e6), '6324 AU');
  assert.equal(formatDistance(0.1 * LIGHT_YEAR_M), '0.1000 ly');
});

test('formatDistance: negative is RangeError', () => {
  assert.throws(() => formatDistance(-1), RangeError);
});

test('formatBeta: keeps the nines near 1', () => {
  assert.equal(formatBeta(0.6), '0.600');
  assert.equal(formatBeta(0.8), '0.800');
  assert.equal(formatBeta(0.99), '0.990');
  assert.equal(formatBeta(0.9999), '0.9999');
  assert.equal(formatBeta(0.999999), '0.999999');
  assert.equal(formatBeta(0.99999999), '0.99999999');
  const nearest = 1 - 2 ** -53; // largest double below 1
  const s = formatBeta(nearest);
  assert.equal(s, '0.9999999999999999');
  assert.ok(Number(s) < 1);
  for (let n = 1; n <= 15; n += 1) {
    const out = formatBeta(1 - 10 ** -n);
    assert.ok(!out.startsWith('1'), `1 - 1e-${n} -> ${out}`);
    assert.ok(Math.abs(Number(out) - (1 - 10 ** -n)) <= 10 ** -n, out);
  }
});

test('formatBeta: zero, negatives, tiny values', () => {
  assert.equal(formatBeta(0), '0.000');
  assert.equal(formatBeta(-0), '0.000');
  assert.equal(formatBeta(-0.8), '-0.800');
  assert.equal(formatBeta(-0.999999), '-0.999999');
  assert.equal(formatBeta(1e-5), '1.00e-5');
  assert.equal(formatBeta(-0.0004), '-4.00e-4');
  assert.equal(formatBeta(0.001), '0.00100');
  assert.equal(formatBeta(0.0412), '0.0412');
  assert.equal(formatBeta(0.123456), '0.123');
});

test('formatBeta: |beta| >= 1 is RangeError', () => {
  assert.throws(() => formatBeta(1), RangeError);
  assert.throws(() => formatBeta(-1), RangeError);
  assert.throws(() => formatBeta(1.5), RangeError);
});

test('formatGamma: known Lorentz factors and limits', () => {
  assert.equal(formatGamma(1), '1.000');
  assert.equal(formatGamma(1 / Math.sqrt(1 - 0.6 ** 2)), '1.250'); // gamma(0.6c) = 1.25
  assert.equal(formatGamma(1 / Math.sqrt(1 - 0.8 ** 2)), '1.667'); // gamma(0.8c) = 5/3
  assert.equal(formatGamma(1 / Math.sqrt(1 - 0.999 ** 2)), '22.37');
  assert.equal(formatGamma(7088.8), '7089');
  assert.equal(formatGamma(1e9), '1.000e9');
  assert.throws(() => formatGamma(0.999), RangeError);
  assert.throws(() => formatGamma(0), RangeError);
  assert.throws(() => formatGamma(-2), RangeError);
});

test('formatEnergy: SI prefixes with 4 significant figures', () => {
  assert.equal(formatEnergy(0), '0 J');
  assert.equal(formatEnergy(-0), '0 J');
  assert.equal(formatEnergy(1), '1.000 J');
  assert.equal(formatEnergy(1500), '1.500 kJ');
  assert.equal(formatEnergy(4.184e9), '4.184 GJ');
  assert.equal(formatEnergy(C ** 2), '89.88 PJ'); // rest energy of 1 kg
  assert.equal(formatEnergy(1e-3), '1.000 mJ');
  assert.equal(formatEnergy(2.5e-6), '2.500 µJ');
  assert.equal(formatEnergy(1e30), '1.000 QJ');
  assert.equal(formatEnergy(1e-30), '1.000 qJ');
  assert.equal(formatEnergy(-2.5e6), '-2.500 MJ');
});

test('formatEnergy: rounding carries to the next prefix', () => {
  assert.equal(formatEnergy(999.96), '1.000 kJ');
  assert.equal(formatEnergy(999_960), '1.000 MJ');
  assert.equal(formatEnergy(1000), '1.000 kJ');
  assert.equal(formatEnergy(999.9), '999.9 J');
});

test('formatEnergy: scientific notation beyond the SI prefix range', () => {
  assert.equal(formatEnergy(5.4e44), '5.400e44 J');
  assert.equal(formatEnergy(-5.4e44), '-5.400e44 J');
  assert.equal(formatEnergy(999.96e30), '1.000e33 J');
  assert.equal(formatEnergy(1e-31), '1.000e-31 J');
  assert.equal(formatEnergy(Number.MAX_VALUE), '1.798e308 J');
  assert.equal(formatEnergy(Number.MIN_VALUE), '4.941e-324 J');
});

test('formatSpeed: m/s and multiples of c', () => {
  assert.equal(formatSpeed(0), '0 m/s (0.000 c)');
  assert.equal(formatSpeed(-0), '0 m/s (0.000 c)');
  assert.equal(formatSpeed(1000), '1000 m/s (3.34e-6 c)');
  assert.equal(formatSpeed(0.6 * C), '1.799e8 m/s (0.600 c)');
  assert.equal(formatSpeed(-0.8 * C), '-2.398e8 m/s (-0.800 c)');
  assert.equal(formatSpeed(0.999999 * C), '2.998e8 m/s (0.999999 c)');
  assert.equal(formatSpeed(C), '2.998e8 m/s (1.000 c)');
  assert.equal(formatSpeed(10 * C), '2.998e9 m/s (10.00 c)');
  assert.equal(formatSpeed(12.5), '12.50 m/s (4.17e-8 c)');
});

test('formatters are deterministic and locale-free (no grouping separators)', () => {
  const samples = [
    formatDuration(1e15), formatDistance(9e15), formatGamma(123456),
    formatEnergy(123456789), formatSpeed(1234567),
  ];
  for (const s of samples) assert.ok(!/[,  ']/.test(s), s);
  assert.equal(formatSpeed(1234567), formatSpeed(1234567));
  assert.equal(formatSpeed(1234567), '1234567 m/s (0.00412 c)');
});
