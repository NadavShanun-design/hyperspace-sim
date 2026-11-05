# Special relativity toolkit

Module: `src/physics/relativity.js`. Every function works in the dimensionless
speed `beta = v / c`; multiply by `C` from `src/physics/constants.js` to get m/s.
All functions are pure and validate their inputs:

- `TypeError` for anything that is not a finite `number` (NaN, Infinity, strings, BigInt, ...).
- `RangeError` for physically invalid values: `|beta| >= 1`, `gamma < 1`,
  negative durations or lengths.

A negative `beta` means motion in the opposite direction; every formula below
stays valid for it.

## Lorentz factor and rapidity

| Function | Formula | Notes |
| --- | --- | --- |
| `lorentzFactor(beta)` | `gamma = 1 / sqrt(1 - beta^2)` | Evaluated as `1 / sqrt((1 - beta)(1 + beta))` for precision near c. |
| `betaFromGamma(gamma)` | `beta = sqrt(1 - 1 / gamma^2)` | Evaluated as `sqrt((gamma - 1)(gamma + 1)) / gamma`. Returns `beta >= 0`. Rounds to 1 for gamma of about 1e8 or more. |
| `rapidity(beta)` | `phi = atanh(beta)` | `cosh(phi) = gamma`, `sinh(phi) = gamma beta`. |
| `betaFromRapidity(phi)` | `beta = tanh(phi)` | Rounds to +/-1 in double precision for `abs(phi)` above about 19.06. |

Reference values: `gamma(0.6) = 1.25`, `gamma(0.8) = 5/3`, `phi(0.6) = ln 2`,
`phi(0.8) = ln 3`.

## Velocity addition

`addVelocities(b1, b2) = (b1 + b2) / (1 + b1 b2)` for collinear motion. This is
equivalent to adding rapidities: `tanh(atanh(b1) + atanh(b2))`. Example:
`0.5c (+) 0.5c = 0.8c`. The result never reaches c.

## Time dilation and length contraction

- `timeDilation(coordinateTime, beta) = coordinateTime / gamma`: the proper time
  shown by a clock moving at `beta` while `coordinateTime` passes in the rest
  frame. Units are preserved (years in, years out). Example: 10 years at 0.6c is
  8 years of ship time.
- `lengthContraction(properLength, beta) = properLength / gamma`: the length,
  along the motion, of an object of rest length `properLength` measured in a
  frame where it moves at `beta`. From the ship's point of view the distance to
  the destination contracts by the same factor.

## Doppler factor

```
D = f_observed / f_emitted = 1 / (gamma (1 - beta cos theta))
```

Sign convention: `theta` is measured **in the observer's frame**, between the
source's velocity and the line of sight from the source to the observer.

- `theta = 0`: head-on approach, `D = sqrt((1 + beta) / (1 - beta)) > 1` (blueshift).
- `theta = pi`: direct recession, `D = sqrt((1 - beta) / (1 + beta)) < 1` (redshift).
- `theta = pi / 2`: transverse Doppler, `D = 1 / gamma` (pure time-dilation redshift).

For the ship flying through a static star field, the same formula holds with
`theta` equal to the apparent (ship-frame) angle between the heading and the
star, which is what `aberrationAngle` returns. Equivalently, in terms of the
rest-frame angle `theta_rest`, `D = gamma (1 + beta cos theta_rest)`.
Wavelengths scale by `1 / D`.

## Aberration of starlight

`aberrationAngle(beta, theta)` takes the angle `theta` between the ship's
heading and a star, measured in the star field's rest frame, and returns the
apparent angle `theta'` seen aboard the ship:

```
cos theta' = (cos theta + beta) / (1 + beta cos theta)
sin theta' = sin theta / (gamma (1 + beta cos theta))
```

It is evaluated as `atan2(sin theta, gamma (cos theta + beta))`, so the quadrant
is always correct and the sign of `theta` (which side of the heading the star
is on) is preserved. The result lies in `(-pi, pi]`. For `beta > 0`,
`|theta'| <= |theta|`: stars crowd toward the direction of travel, and combined
with the Doppler blueshift this produces the forward "starbow" bunching at high
speed. A star at 90 degrees moves to 60 degrees at 0.5c. Applying
`aberrationAngle(-beta, ...)` undoes the transformation.

## Sources

Standard results of special relativity, for example Rindler, *Relativity:
Special, General, and Cosmological* (2nd ed., Oxford, 2006), chapters 2 to 4, and
Jackson, *Classical Electrodynamics* (3rd ed.), section 11.3. The test suite
checks the closed-form values above, low-speed limits, inverse pairs, and the
consistency identity `D(beta, aberrationAngle(beta, theta)) = gamma (1 + beta cos theta)`.
