#!/usr/bin/env node
// hyperspace: command-line front end for the simulator's catalog, route planner and trip physics.
// Commands: `stars`, `route <from> <to>`, `trip <from> <to>`. Exit codes: 0 ok, 1 no route or
// computation failure, 2 usage error (bad command, option, number or star name).

import { parseArgs } from 'node:util';
import { STARS, findStar } from '../src/data/stars.js';
import { planRoute, SUN_NAME } from '../src/nav/route.js';
import { flipAndBurn } from '../src/physics/rocket.js';
import { warpTripTime } from '../src/physics/alcubierre.js';
import { C, G0, LIGHT_YEAR_M } from '../src/physics/constants.js';
import { formatDistance, formatDuration, formatGamma, formatSpeed } from '../src/render/format.js';

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

const DEFAULT_ACCEL_G = 1;

const MAIN_HELP = `Usage: hyperspace <command> [options]

Commands:
  stars                      List the nearby-star catalog (name, distance, spectral type)
  route <from> <to>          Plan the shortest multi-jump route between two stars
  trip <from> <to>           Plan a route and print relativistic trip times for it

Run 'hyperspace <command> --help' for command options.
Star names are case-insensitive; quote names with spaces ("Proxima Centauri").
'${SUN_NAME}' is always available as a start or destination.

Options:
  -h, --help                 Show this help
`;

const STARS_HELP = `Usage: hyperspace stars

List every catalog star with its distance from the Sun and spectral type.

Options:
  -h, --help                 Show this help
`;

const ROUTE_HELP = `Usage: hyperspace route <from> <to> [--max-jump <ly>]

Plan the shortest-total-distance route where no single jump exceeds --max-jump.

Options:
  --max-jump <ly>            Longest allowed single jump in light years (> 0).
                             Default: no limit (a single direct jump).
  -h, --help                 Show this help
`;

const TRIP_HELP = `Usage: hyperspace trip <from> <to> [--accel <g>] [--warp <c>] [--max-jump <ly>]

Plan a route, then fly every leg as a rest-to-rest flip-and-burn rocket at constant
proper acceleration (accelerate to the midpoint, flip, decelerate). Prints ship
(proper) time, Earth (rest-frame) time, peak speed, peak Lorentz factor and the
ideal photon-rocket mass ratio. With --warp, also prints the constant-speed
Alcubierre warp cruise time over the same route.

Options:
  --accel <g>                Proper acceleration in units of standard gravity
                             (1 g = ${G0} m/s^2, > 0). Default: ${DEFAULT_ACCEL_G}.
  --warp <c>                 Alcubierre bubble speed as a multiple of c (> 0, may exceed 1).
  --max-jump <ly>            Longest allowed single jump in light years (> 0).
                             Default: no limit (a single direct jump).
  -h, --help                 Show this help
`;

const COMMANDS = {
  stars: {
    help: STARS_HELP,
    positionals: [],
    options: {},
    run: runStars,
  },
  route: {
    help: ROUTE_HELP,
    positionals: ['from', 'to'],
    options: { 'max-jump': { type: 'string' } },
    run: runRoute,
  },
  trip: {
    help: TRIP_HELP,
    positionals: ['from', 'to'],
    options: {
      'max-jump': { type: 'string' },
      accel: { type: 'string' },
      warp: { type: 'string' },
    },
    run: runTrip,
  },
};

/** An error caused by bad command-line input; reported with exit code 2. */
class UsageError extends Error {}

/** A valid request whose answer is "no"; reported with exit code 1. */
class NoRouteError extends Error {}

const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

function parsePositive(raw, flag, unit) {
  if (!DECIMAL.test(raw)) {
    throw new UsageError(`${flag} must be a number in ${unit}, got '${raw}'`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new UsageError(`${flag} is too large, got '${raw}'`);
  }
  if (value <= 0) {
    throw new UsageError(`${flag} must be > 0 ${unit}, got '${raw}'`);
  }
  return value;
}

function canonicalName(raw, label) {
  const key = raw.trim();
  if (key === '') throw new UsageError(`${label} star name must not be empty`);
  if (key.toLowerCase() === SUN_NAME.toLowerCase()) return SUN_NAME;
  const star = findStar(key);
  if (star === undefined) {
    throw new UsageError(`unknown star '${raw}'. Run 'hyperspace stars' to list catalog names`);
  }
  return star.name;
}

function maxJumpFrom(values) {
  // No --max-jump means no per-jump limit; the largest finite double satisfies planRoute's contract.
  return values['max-jump'] === undefined
    ? Number.MAX_VALUE
    : parsePositive(values['max-jump'], '--max-jump', 'light years');
}

function plan(from, to, maxJumpLy) {
  const fromName = canonicalName(from, 'start');
  const toName = canonicalName(to, 'destination');
  const route = planRoute(fromName, toName, maxJumpLy);
  if (route === null) {
    throw new NoRouteError(
      `no route from ${fromName} to ${toName} with jumps of at most ${maxJumpLy} ly`,
    );
  }
  return route;
}

function ly(distanceLy) {
  return formatDistance(distanceLy * LIGHT_YEAR_M);
}

function routeLines(route) {
  const jumps = route.legs.length;
  const lines = [
    `Route: ${route.path.join(' -> ')}`,
    `Jumps: ${jumps}, total distance ${ly(route.totalLy)}`,
  ];
  route.legs.forEach((leg, i) => {
    lines.push(`  ${i + 1}. ${leg.from} -> ${leg.to}: ${ly(leg.distanceLy)}`);
  });
  return lines;
}

function sig4(value) {
  return value.toPrecision(4).replace('e+', 'e');
}

function peakSpeedText(peakBeta) {
  // At gamma above ~1e8 the double nearest to beta is exactly 1; say so instead of printing "1.000 c".
  if (peakBeta < 1) return formatSpeed(peakBeta * C);
  return 'c to double precision';
}

// Ideal photon-rocket mass ratio M0/M1 = exp(total rapidity change). Each rest-to-rest leg changes
// rapidity by 2 * atanh(peakBeta) = a * tau / c (tau = that leg's proper time), which matches
// massRatio(peakBeta, 2) in src/physics/rocket.js but stays finite in log form for huge ratios.
function massRatioText(lnRatio) {
  const ratio = Math.exp(lnRatio);
  if (Number.isFinite(ratio)) return formatGamma(ratio);
  const log10 = lnRatio / Math.LN10;
  let exponent = Math.floor(log10);
  let mantissa = (10 ** (log10 - exponent)).toFixed(3);
  if (Number(mantissa) >= 10) {
    exponent += 1;
    mantissa = (10 ** (log10 - exponent)).toFixed(3);
  }
  return `${mantissa}e${exponent}`;
}

function runStars() {
  const nameWidth = Math.max('Name'.length, ...STARS.map((s) => s.name.length));
  const distances = STARS.map((s) => `${s.distance_ly} ly`);
  const distWidth = Math.max('Distance'.length, ...distances.map((d) => d.length));
  const lines = [`${'Name'.padEnd(nameWidth)}  ${'Distance'.padStart(distWidth)}  Spectral type`];
  STARS.forEach((s, i) => {
    lines.push(`${s.name.padEnd(nameWidth)}  ${distances[i].padStart(distWidth)}  ${s.spectral_type}`);
  });
  lines.push(`${STARS.length} stars. Distances are from the Sun.`);
  return lines;
}

function runRoute(values, [from, to]) {
  return routeLines(plan(from, to, maxJumpFrom(values)));
}

function runTrip(values, [from, to]) {
  const maxJumpLy = maxJumpFrom(values);
  const accelG = values.accel === undefined
    ? DEFAULT_ACCEL_G
    : parsePositive(values.accel, '--accel', 'g');
  const accelMs2 = accelG * G0;
  if (!Number.isFinite(accelMs2)) throw new UsageError(`--accel is too large, got '${values.accel}'`);
  let warpVs;
  if (values.warp !== undefined) {
    warpVs = parsePositive(values.warp, '--warp', 'multiples of c') * C;
    if (!Number.isFinite(warpVs)) throw new UsageError(`--warp is too large, got '${values.warp}'`);
  }

  const route = plan(from, to, maxJumpLy);
  const lines = routeLines(route);
  lines.push('');
  lines.push(`Flip-and-burn rocket at ${sig4(accelG)} g (${sig4(accelMs2)} m/s^2), rest to rest at every stop:`);

  let shipS = 0;
  let earthS = 0;
  let lnRatio = 0;
  let topBeta = 0;
  let topGamma = 1;
  route.legs.forEach((leg, i) => {
    const r = flipAndBurn(leg.distanceLy * LIGHT_YEAR_M, accelMs2);
    shipS += r.properTimeS;
    earthS += r.coordinateTimeS;
    lnRatio += (accelMs2 * r.properTimeS) / C;
    if (r.peakGamma > topGamma) {
      topGamma = r.peakGamma;
      topBeta = r.peakBeta;
    }
    lines.push(`  ${i + 1}. ${leg.from} -> ${leg.to} (${ly(leg.distanceLy)})`);
    lines.push(`     ship time ${formatDuration(r.properTimeS)}, Earth time ${formatDuration(r.coordinateTimeS)}`);
    lines.push(`     peak speed ${peakSpeedText(r.peakBeta)}, peak gamma ${formatGamma(r.peakGamma)}`);
  });
  if (!Number.isFinite(shipS) || !Number.isFinite(earthS)) {
    throw new RangeError('trip time overflows double precision');
  }
  lines.push(`  Total ship time:  ${formatDuration(shipS)}`);
  lines.push(`  Total Earth time: ${formatDuration(earthS)}`);
  lines.push(`  Top speed:        ${peakSpeedText(topBeta)}`);
  lines.push(`  Mass ratio M0/M1 (ideal photon rocket): ${massRatioText(lnRatio)}`);

  if (warpVs !== undefined) {
    const warpS = route.legs.reduce((sum, leg) => sum + warpTripTime(leg.distanceLy * LIGHT_YEAR_M, warpVs), 0);
    if (!Number.isFinite(warpS)) throw new RangeError('warp trip time overflows double precision');
    lines.push('');
    lines.push(`Alcubierre warp at ${formatSpeed(warpVs)}, constant-speed cruise:`);
    lines.push(`  Trip time: ${formatDuration(warpS)} (ship time equals Earth time inside the bubble)`);
  }
  return lines;
}

function parseCommand(name, spec, rest) {
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: { ...spec.options, help: { type: 'boolean', short: 'h' } },
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    if (typeof err.code === 'string' && err.code.startsWith('ERR_PARSE_ARGS')) {
      throw new UsageError(err.message.split('\n')[0].replace(/\. To specify .*$/, '.'));
    }
    throw err;
  }
  if (parsed.values.help) return { help: true };
  const want = spec.positionals.length;
  if (parsed.positionals.length !== want) {
    const expected = want === 0 ? 'no arguments' : `${want} arguments (${spec.positionals.map((p) => `<${p}>`).join(' ')})`;
    throw new UsageError(`'${name}' takes ${expected}, got ${parsed.positionals.length}`);
  }
  return { help: false, values: parsed.values, positionals: parsed.positionals };
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command === undefined) {
    process.stderr.write(MAIN_HELP);
    return EXIT_USAGE;
  }
  if (command === '-h' || command === '--help') {
    process.stdout.write(MAIN_HELP);
    return EXIT_OK;
  }
  const spec = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  try {
    if (spec === undefined) {
      throw new UsageError(`unknown command '${command}'. Run 'hyperspace --help' for usage`);
    }
    const args = parseCommand(command, spec, rest);
    if (args.help) {
      process.stdout.write(spec.help);
      return EXIT_OK;
    }
    process.stdout.write(`${spec.run(args.values, args.positionals).join('\n')}\n`);
    return EXIT_OK;
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`hyperspace: ${err.message}\n`);
      if (spec !== undefined) process.stderr.write(`Run 'hyperspace ${command} --help' for usage.\n`);
      return EXIT_USAGE;
    }
    if (err instanceof NoRouteError || err instanceof RangeError || err instanceof TypeError) {
      process.stderr.write(`hyperspace: ${err.message}\n`);
      return EXIT_FAILURE;
    }
    throw err;
  }
}

process.exitCode = main(process.argv.slice(2));
