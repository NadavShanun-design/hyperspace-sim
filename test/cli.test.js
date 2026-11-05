// Tests for the hyperspace CLI: spawns bin/hyperspace.js and checks output and exit codes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STARS, findStar } from '../src/data/stars.js';
import { planRoute } from '../src/nav/route.js';
import { flipAndBurn, massRatio } from '../src/physics/rocket.js';
import { C, G0, JULIAN_YEAR_S, LIGHT_YEAR_M } from '../src/physics/constants.js';
import { formatDistance, formatDuration, formatGamma } from '../src/render/format.js';

const BIN = fileURLToPath(new URL('../bin/hyperspace.js', import.meta.url));
const PKG = fileURLToPath(new URL('../package.json', import.meta.url));

function run(...args) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [BIN, ...args], { timeout: 20_000 }, (err, stdout, stderr) => {
      if (err && typeof err.code !== 'number') {
        reject(err);
        return;
      }
      resolve({ code: err ? err.code : 0, stdout, stderr });
    });
  });
}

function ly(distanceLy) {
  return formatDistance(distanceLy * LIGHT_YEAR_M);
}

async function expectUsageError(args, pattern) {
  const r = await run(...args);
  assert.equal(r.code, 2, `exit code for ${JSON.stringify(args)}; stderr: ${r.stderr}`);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^hyperspace: /);
  if (pattern) assert.match(r.stderr, pattern);
}

test('the bin file has a node shebang, the executable bit and a package.json bin entry', () => {
  assert.ok(readFileSync(BIN, 'utf8').startsWith('#!/usr/bin/env node\n'));
  assert.notEqual(statSync(BIN).mode & 0o100, 0, 'owner execute bit must be set');
  const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
  assert.deepEqual(pkg.bin, { hyperspace: 'bin/hyperspace.js' });
});

test('--help and -h print usage to stdout and exit 0', async () => {
  for (const flag of ['--help', '-h']) {
    const r = await run(flag);
    assert.equal(r.code, 0);
    assert.equal(r.stderr, '');
    assert.match(r.stdout, /^Usage: hyperspace <command>/);
    for (const cmd of ['stars', 'route <from> <to>', 'trip <from> <to>']) {
      assert.ok(r.stdout.includes(cmd), `help lists ${cmd}`);
    }
  }
});

test('per-command --help documents the options and exits 0 without needing positionals', async () => {
  const stars = await run('stars', '--help');
  assert.equal(stars.code, 0);
  assert.match(stars.stdout, /^Usage: hyperspace stars/);
  const route = await run('route', '-h');
  assert.equal(route.code, 0);
  assert.match(route.stdout, /--max-jump <ly>/);
  const trip = await run('trip', '--help');
  assert.equal(trip.code, 0);
  for (const opt of ['--accel <g>', '--warp <c>', '--max-jump <ly>']) {
    assert.ok(trip.stdout.includes(opt), `trip help lists ${opt}`);
  }
});

test('no command prints usage to stderr and exits 2', async () => {
  const r = await run();
  assert.equal(r.code, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^Usage: hyperspace <command>/);
});

test('stars lists every catalog entry with its distance and spectral type', async () => {
  const r = await run('stars');
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  const lines = r.stdout.trimEnd().split('\n');
  assert.match(lines[0], /^Name\s+Distance\s+Spectral type$/);
  assert.equal(lines.length, STARS.length + 2);
  STARS.forEach((star, i) => {
    const cols = lines[i + 1].trim().split(/\s{2,}/);
    assert.deepEqual(cols, [star.name, `${star.distance_ly} ly`, star.spectral_type]);
  });
  assert.equal(lines.at(-1), `${STARS.length} stars. Distances are from the Sun.`);
});

test('route without --max-jump is a single direct jump, names are case-insensitive', async () => {
  const r = await run('route', 'sun', '  proxima CENTAURI ');
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  const d = findStar('Proxima Centauri').distance_ly;
  assert.equal(r.stdout, [
    'Route: Sun -> Proxima Centauri',
    `Jumps: 1, total distance ${ly(d)}`,
    `  1. Sun -> Proxima Centauri: ${ly(d)}`,
    '',
  ].join('\n'));
  assert.ok(r.stdout.includes('4.247 ly'));
});

test('route with --max-jump prints the planRoute multi-jump path and leg distances', async () => {
  const expected = planRoute('Sun', 'Tau Ceti', 9);
  assert.ok(expected.legs.length >= 2, 'fixture must be a multi-jump route');
  for (const args of [['--max-jump', '9'], ['--max-jump=9']]) {
    const r = await run('route', 'Sun', 'Tau Ceti', ...args);
    assert.equal(r.code, 0, r.stderr);
    const lines = r.stdout.trimEnd().split('\n');
    assert.equal(lines[0], `Route: ${expected.path.join(' -> ')}`);
    assert.equal(lines[1], `Jumps: ${expected.legs.length}, total distance ${ly(expected.totalLy)}`);
    expected.legs.forEach((leg, i) => {
      assert.equal(lines[i + 2], `  ${i + 1}. ${leg.from} -> ${leg.to}: ${ly(leg.distanceLy)}`);
    });
    assert.equal(lines.length, expected.legs.length + 2);
  }
});

test('route between the same star is zero jumps', async () => {
  const r = await run('route', 'Vega', 'vega');
  assert.equal(r.code, 0);
  assert.equal(r.stdout, 'Route: Vega\nJumps: 0, total distance 0 m\n');
});

test('an unreachable destination exits 1 with a clear message', async () => {
  assert.equal(planRoute('Sun', 'Vega', 1), null);
  const r = await run('route', 'Sun', 'Vega', '--max-jump', '1');
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, 'hyperspace: no route from Sun to Vega with jumps of at most 1 ly\n');
  const t = await run('trip', 'Sun', 'Vega', '--max-jump=1', '--accel', '2');
  assert.equal(t.code, 1);
  assert.match(t.stderr, /no route from Sun to Vega/);
});

test('bad input exits 2 with a message on stderr', async () => {
  await expectUsageError(['warp'], /unknown command 'warp'/);
  await expectUsageError(['route', 'Sun', 'Nowhere'], /unknown star 'Nowhere'.*hyperspace stars/);
  await expectUsageError(['trip', '', 'Vega'], /start star name must not be empty/);
  await expectUsageError(['route', 'Sun'], /'route' takes 2 arguments \(<from> <to>\), got 1/);
  await expectUsageError(['route', 'Sun', 'Vega', 'Altair'], /got 3/);
  await expectUsageError(['stars', 'extra'], /'stars' takes no arguments, got 1/);
  await expectUsageError(['stars', '--max-jump', '3'], /Unknown option '--max-jump'/);
  await expectUsageError(['route', 'Sun', 'Vega', '--accel', '2'], /Unknown option '--accel'/);
  await expectUsageError(['route', 'Sun', 'Vega', '--max-jump'], /argument missing/);
  await expectUsageError(['trip', 'Sun', 'Vega', '--accel', '-1'], /ambiguous/);
});

test('numeric options reject non-numbers, non-finite and non-positive values', async () => {
  const cases = [
    ['route', '--max-jump', 'abc', /--max-jump must be a number in light years, got 'abc'/],
    ['route', '--max-jump', '', /got ''/],
    ['route', '--max-jump', '0', /--max-jump must be > 0 light years/],
    ['route', '--max-jump', '-5', /--max-jump must be > 0/],
    ['route', '--max-jump', 'Infinity', /must be a number/],
    ['route', '--max-jump', '0x10', /must be a number/],
    ['route', '--max-jump', '1e400', /--max-jump is too large/],
    ['trip', '--accel', 'NaN', /--accel must be a number in g/],
    ['trip', '--accel', '0', /--accel must be > 0 g/],
    ['trip', '--accel', '1e308', /--accel is too large/],
    ['trip', '--warp', 'fast', /--warp must be a number in multiples of c/],
    ['trip', '--warp', '-0', /--warp must be > 0/],
    ['trip', '--warp', '1e300', /--warp is too large/],
  ];
  for (const [cmd, flag, value, pattern] of cases) {
    await expectUsageError([cmd, 'Sun', 'Vega', `${flag}=${value}`], pattern);
  }
});

test('trip to Proxima at 1 g matches the independent flip-and-burn closed form', async () => {
  const r = await run('trip', 'Sun', 'Proxima Centauri');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stderr, '');

  // x = a D / (2 c^2); peak gamma = 1 + x; tau = 2 (c/a) acosh(1 + x); t = 2 (c/a) sqrt(x (x + 2)).
  const a = G0;
  const D = 4.2465 * LIGHT_YEAR_M;
  const x = (a * D) / (2 * C * C);
  const gamma = 1 + x;
  const beta = Math.sqrt(1 - 1 / (gamma * gamma));
  const tauS = 2 * (C / a) * Math.acosh(gamma);
  const tS = 2 * (C / a) * Math.sqrt(x * (x + 2));
  // Published reference values for this trip (rocket module docs): 3.54209 y ship, 5.87259 y Earth.
  assert.ok(Math.abs(tauS / JULIAN_YEAR_S - 3.54209) < 1e-4);
  assert.ok(Math.abs(tS / JULIAN_YEAR_S - 5.87259) < 1e-4);
  // Photon rocket, two burns: (gamma (1 + beta))^2.
  const ratio = (gamma * (1 + beta)) ** 2;
  assert.ok(Math.abs(ratio / massRatio(beta, 2) - 1) < 1e-12);

  const out = r.stdout;
  assert.ok(out.includes('Flip-and-burn rocket at 1.000 g (9.807 m/s^2)'), out);
  assert.ok(out.includes(`ship time ${formatDuration(tauS)}, Earth time ${formatDuration(tS)}`), out);
  assert.ok(out.includes('ship time 3 y 198 d, Earth time 5 y 319 d'), out);
  assert.ok(out.includes('peak speed 2.847e8 m/s (0.950 c), peak gamma 3.192'), out);
  assert.ok(out.includes(`  Total ship time:  ${formatDuration(tauS)}\n`), out);
  assert.ok(out.includes(`  Total Earth time: ${formatDuration(tS)}\n`), out);
  assert.ok(out.includes('  Top speed:        2.847e8 m/s (0.950 c)\n'), out);
  assert.ok(out.includes(`Mass ratio M0/M1 (ideal photon rocket): ${formatGamma(ratio)}\n`), out);
  assert.equal(formatGamma(ratio), '38.73');
  assert.ok(!out.includes('Alcubierre'), 'no warp section without --warp');
});

test('a multi-leg trip sums per-leg flip-and-burn times and multiplies mass ratios', async () => {
  const route = planRoute('Sun', 'Tau Ceti', 9);
  const accelG = 2;
  const legs = route.legs.map((leg) => flipAndBurn(leg.distanceLy * LIGHT_YEAR_M, accelG * G0));
  const ship = legs.reduce((s, l) => s + l.properTimeS, 0);
  const earth = legs.reduce((s, l) => s + l.coordinateTimeS, 0);
  const ratio = legs.reduce((p, l) => p * massRatio(l.peakBeta, 2), 1);

  const r = await run('trip', 'sun', 'tau ceti', '--max-jump', '9', '--accel', '2');
  assert.equal(r.code, 0, r.stderr);
  const out = r.stdout;
  assert.ok(out.includes('Flip-and-burn rocket at 2.000 g (19.61 m/s^2)'), out);
  route.legs.forEach((leg, i) => {
    const l = legs[i];
    assert.ok(out.includes(`  ${i + 1}. ${leg.from} -> ${leg.to} (${ly(leg.distanceLy)})\n`), out);
    assert.ok(out.includes(`ship time ${formatDuration(l.properTimeS)}, Earth time ${formatDuration(l.coordinateTimeS)}\n`), out);
    assert.ok(out.includes(`peak gamma ${formatGamma(l.peakGamma)}\n`), out);
  });
  assert.ok(out.includes(`  Total ship time:  ${formatDuration(ship)}\n`), out);
  assert.ok(out.includes(`  Total Earth time: ${formatDuration(earth)}\n`), out);
  assert.ok(out.includes(`Mass ratio M0/M1 (ideal photon rocket): ${formatGamma(ratio)}\n`), out);
});

test('--warp adds the Alcubierre cruise time D / (N c)', async () => {
  const r = await run('trip', 'Sun', 'Proxima Centauri', '--warp', '10');
  assert.equal(r.code, 0, r.stderr);
  // 4.2465 ly at 10 c takes 0.42465 Julian years = 155.1 days.
  const seconds = (4.2465 * LIGHT_YEAR_M) / (10 * C);
  assert.ok(Math.abs(seconds / 86_400 - 0.42465 * 365.25) < 1e-9);
  assert.ok(r.stdout.includes('Alcubierre warp at 2.998e9 m/s (10.00 c), constant-speed cruise:'), r.stdout);
  assert.ok(r.stdout.includes(`  Trip time: ${formatDuration(seconds)} (ship time equals Earth time`), r.stdout);
  assert.ok(r.stdout.includes('  Trip time: 155 d 2 h'), r.stdout);

  const slow = await run('trip', 'Sun', 'Proxima Centauri', '--warp=0.5');
  assert.equal(slow.code, 0, slow.stderr);
  assert.ok(slow.stdout.includes('(0.500 c)'), slow.stdout);
  assert.ok(slow.stdout.includes(`  Trip time: ${formatDuration(2 * 4.2465 * JULIAN_YEAR_S)} `), slow.stdout);
});

test('a same-star trip reports zero time and a mass ratio of 1', async () => {
  const r = await run('trip', 'Sun', 'sun', '--warp', '2');
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('  Total ship time:  0 s\n'));
  assert.ok(r.stdout.includes('  Total Earth time: 0 s\n'));
  assert.ok(r.stdout.includes('  Top speed:        0 m/s (0.000 c)\n'));
  assert.ok(r.stdout.includes('Mass ratio M0/M1 (ideal photon rocket): 1.000\n'));
  assert.ok(r.stdout.includes('  Trip time: 0 s '));
});

test('extreme acceleration stays finite: beta rounds to 1 and the mass ratio goes scientific', async () => {
  const accelG = 1e200;
  const a = accelG * G0;
  const D = findStar('Vega').distance_ly * LIGHT_YEAR_M;
  const x = (a * D) / (2 * C * C);
  // ln(M0/M1) = 2 acosh(1 + x) = 2 ln(1 + x + sqrt(x (x + 2))), and 1 + x + sqrt(x(x+2)) ~ 2x here.
  const log10Ratio = (2 * Math.log(2 * x)) / Math.LN10;
  assert.ok(log10Ratio > 308, 'fixture must overflow a double mass ratio');
  const exponent = Math.floor(log10Ratio);
  const mantissa = (10 ** (log10Ratio - exponent)).toFixed(3);

  const r = await run('trip', 'Sun', 'Vega', `--accel=${accelG}`);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('peak speed c to double precision, peak gamma'), r.stdout);
  assert.ok(r.stdout.includes('  Top speed:        c to double precision\n'), r.stdout);
  assert.ok(r.stdout.includes(`Mass ratio M0/M1 (ideal photon rocket): ${mantissa}e${exponent}\n`), r.stdout);
  // Earth time tends to the light travel time D / c as a -> infinity.
  assert.ok(r.stdout.includes(`Earth time ${formatDuration(D / C)}`), r.stdout);
});

test('acceleration whose trip overflows double precision exits 1 with the physics error', async () => {
  const r = await run('trip', 'Sun', 'Vega', '--accel=1e300');
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^hyperspace: flipAndBurn overflows double precision/);
});
