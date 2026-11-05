# hyperspace-sim

A zero-dependency browser hyperspace-jump simulator grounded in real physics:
special relativity, constant-acceleration "flip and burn" trips, and the
Alcubierre warp metric, plotted over the real nearest star systems.

**Live demo:** https://nadavshanun-design.github.io/hyperspace-sim/

Plain JavaScript ES modules, no build step and no npm dependencies. The same
modules run in the browser app, in the command-line tool and in the Node test
suite.

## Features

- **Cockpit (browser app, `index.html` + `src/app.js`).** Pick an origin and a
  destination from the catalog, set the longest single jump, choose a drive
  and press Engage.
  - *Flip-and-burn rocket:* a constant proper acceleration from 0.1 g to 10 g,
    rest to rest at every stop. The flight computer shows ship time, Earth
    time, peak speed, peak Lorentz factor and the ideal photon-rocket mass
    ratio.
  - *Alcubierre warp:* a bubble speed from 0.5 c to 100 c. It shows the trip
    time (ship time equals Earth time inside the bubble), the bubble speed
    and the peak negative energy density, plus a heatmap of the energy
    density around the bubble.
  - Live ship clock, Earth clock, distance flown, speed and gamma while the
    jump plays out.
  - A seeded hyperspace starfield drawn on a Canvas 2D context, with
    speed-dependent streaks and relativistic aberration that bunches stars
    toward the heading. With `prefers-reduced-motion`, the streaks stay short
    and slow and the aberration effect is turned off.
- **Route planner (`src/nav/`).** Dijkstra shortest total distance over the
  Sun plus the 19 catalog stars, with a cap on the length of any single
  jump.
- **CLI (`bin/hyperspace.js`).** List the catalog, plan routes and print
  relativistic trip times from a terminal.
- **HUD formatting (`src/render/format.js`).** Locale-independent formatting
  for durations, distances, beta, gamma, energies and speeds.

## Physics

Every formula is documented, with its sources and the reference values the
tests check, in [`docs/physics/`](docs/physics/README.md):

| Topic | Doc | Module |
| --- | --- | --- |
| Lorentz factor, rapidity, velocity addition, time dilation, length contraction, Doppler factor, aberration | [relativity.md](docs/physics/relativity.md) | `src/physics/relativity.js` |
| Constant proper acceleration, flip-and-burn, coast trips, photon-rocket mass ratio | [rocket.md](docs/physics/rocket.md) | `src/physics/rocket.js` |
| Alcubierre shape function, Eulerian energy density, warp trip time | [alcubierre.md](docs/physics/alcubierre.md) | `src/physics/alcubierre.js` |

In short:

- **Special relativity.** `gamma = 1 / sqrt(1 - beta^2)`, so 0.6 c gives
  gamma 1.25 and 0.8 c gives 5/3. Velocities add as
  `(b1 + b2) / (1 + b1 b2)`.
- **Rocket.** With rapidity `phi = a tau / c`, a constant-acceleration burn
  covers `d = (c^2 / a)(cosh(phi) - 1)` in Earth time `t = (c / a) sinh(phi)`.
  At 1 g, a flip-and-burn to Proxima Centauri (4.2465 ly) takes 3.542 years of
  ship time and 5.873 years of Earth time, with a peak of 0.950 c.
- **Warp.** The Alcubierre metric moves a flat bubble at any speed `v_s`,
  including speeds above c. It needs negative energy density
  `-(c^4 / 8 pi G)(v_s / c)^2 rho^2 / (4 r_s^2)(df/dr_s)^2`. This is
  speculative physics: no known matter supplies it.

Shared SI constants (C, G, G0, Julian year, light year, solar mass) live in
`src/physics/constants.js`.

## CLI usage

The CLI needs Node 20 or later. Run it from a checkout:

```sh
node bin/hyperspace.js --help
node bin/hyperspace.js stars
node bin/hyperspace.js route Sun "Tau Ceti" --max-jump 10
node bin/hyperspace.js trip Sun "Proxima Centauri" --accel 1 --warp 10
```

`npm link` installs it as `hyperspace`.

| Command | Options | Prints |
| --- | --- | --- |
| `stars` | | Every catalog star with its distance from the Sun and its spectral type |
| `route <from> <to>` | `--max-jump <ly>` | The shortest route and its legs. Without `--max-jump` it is a single direct jump |
| `trip <from> <to>` | `--accel <g>` (default 1), `--warp <c>`, `--max-jump <ly>` | Per-leg and total ship and Earth time, peak speed, peak gamma and mass ratio for a flip-and-burn rocket. With `--warp`, also the Alcubierre cruise time |

Star names are case-insensitive. Quote names that contain spaces. `Sun` is
always a valid start or destination. Exit codes: 0 on success, 1 when there is
no route or a computation fails, 2 on a usage error.

Example:

```text
$ node bin/hyperspace.js route Sun "Tau Ceti" --max-jump 10
Route: Sun -> Luyten 726-8 A -> Tau Ceti
Jumps: 2, total distance 11.93 ly
  1. Sun -> Luyten 726-8 A: 8.730 ly
  2. Luyten 726-8 A -> Tau Ceti: 3.204 ly
```

## Development

```sh
npm test   # runs the node:test suite, no install step needed
```

Requires Node 20+. CI runs `npm test` on Node 20, 22 and 24.

To run the app locally, serve the repo root over HTTP. Browsers block ES
module imports from `file://` URLs. For example:

```sh
python3 -m http.server 8000   # then open http://localhost:8000/
```

Every push to `main` deploys the site to GitHub Pages through
`.github/workflows/pages.yml`. That workflow runs the tests, then publishes
the tracked files minus `.github/`, `test/`, `docs/` and the Markdown files.

## Star data

`src/data/stars.js` is ported from
[stellar-relativity](https://github.com/NadavShanun-design/stellar-relativity).
Values are approximate published figures (SIMBAD / RECONS / Gliese catalog)
and carry real-world measurement uncertainty.

## License

MIT
