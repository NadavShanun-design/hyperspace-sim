# Relativistic rocket (constant proper acceleration)

Module: `src/physics/rocket.js`. All inputs and outputs are SI (m, s, m/s^2);
speeds are dimensionless fractions of c. Constants come from
`src/physics/constants.js`.

## Model

A ship that feels a constant acceleration `a` (its proper acceleration) moves
on a hyperbola in spacetime. With proper (ship) time `tau` and rapidity
`phi = a tau / c`, starting from rest in the rest frame of origin and
destination:

| Quantity | Formula |
| --- | --- |
| coordinate time | `t = (c / a) sinh(phi)` |
| distance | `d = (c^2 / a)(cosh(phi) - 1)` |
| speed | `v = c tanh(phi)` |
| Lorentz factor | `gamma = cosh(phi)` |

Sources: W. Rindler, *Relativity: Special, General, and Cosmological*
(2nd ed., OUP 2006), section on hyperbolic motion; P. Gibbs and J. Baez,
"The Relativistic Rocket" (Usenet Physics FAQ).

Numerically, `cosh(phi) - 1` is computed as `2 sinh^2(phi / 2)` and
`acosh(1 + x)` as `log1p(x + sqrt(x (x + 2)))` so that short, Newtonian
trips do not lose precision to cancellation.

## API

### `accelerationLeg(accelMs2, properTimeS)`

One burn from rest. Returns
`{ coordinateTimeS, distanceM, beta, gamma }`.

### `flipAndBurn(distanceM, accelMs2)`

Accelerate to the midpoint, flip, decelerate to rest. With
`x = a D / (2 c^2)`:

- `peakGamma = 1 + x`
- `peakBeta = sqrt(x (x + 2)) / (1 + x)`
- `properTimeS = 2 (c / a) acosh(1 + x)`
- `coordinateTimeS = 2 (c / a) sqrt(x (x + 2))`

Returns `{ properTimeS, coordinateTimeS, peakBeta, peakGamma }`.

### `coastTrip(distanceM, accelMs2, cruiseBeta)`

Accelerate to `cruiseBeta`, coast, decelerate to rest. Each burn covers
`(c^2 / a)(gamma - 1)` and takes `(c / a) atanh(beta)` ship time and
`(c / a) gamma beta` Earth time. During the coast, ship time runs at
`1 / gamma` of Earth time.

**Too-short distances throw.** If the two burns together need more than
`distanceM`, the function throws a `RangeError`. It does not silently fall
back to `flipAndBurn`, because the caller asked for a cruise speed the ship
never reaches. Call `flipAndBurn` (or lower `cruiseBeta`) instead. A
relative overshoot of at most `1e-12` counts as rounding and gives a
zero-length coast.

Returns
`{ properTimeS, coordinateTimeS, peakBeta, peakGamma, burnDistanceM, coastDistanceM }`,
where `burnDistanceM` is the distance of one burn.

### `massRatio(peakBeta, burns = 1)`

Ideal photon rocket (exhaust speed c). The relativistic rocket equation
gives, per burn between rest and `peakBeta`:

```
M0 / M1 = sqrt((1 + beta) / (1 - beta)) = e^phi
```

Burns multiply. Flip-and-burn and coast trips accelerate and then
decelerate, so they need `burns = 2`, which squares the ratio. Example:
0.6 c gives 2 for one burn and 4 for a round trip to rest; 0.8 c gives 3
and 9.

## Validation

- `TypeError`: an argument is not a finite number (NaN, Infinity, strings,
  null, ...), or `burns` is not an integer.
- `RangeError`: `accelMs2 <= 0`; negative time or distance; `coastTrip`
  distance `<= 0`; `cruiseBeta` outside `(0, 1)`; `peakBeta` outside
  `[0, 1)`; `burns < 1`; distance too short for the cruise speed; or a
  result that overflows double precision (e.g. `cosh(phi)` once
  `phi > ~710`).

For rapidities above about 19, `tanh(phi)` rounds to exactly 1 in double
precision. `gamma`, the times, and the distances stay finite and accurate.

## Reference values (1 g = 9.80665 m/s^2)

| Scenario | Result |
| --- | --- |
| 1 yr ship time | 0.775 c, 0.564 ly, 1.187 yr Earth time |
| Flip-and-burn to Proxima Centauri (4.2465 ly) | 3.542 yr ship, 5.873 yr Earth, peak 0.950 c |
| Flip-and-burn to Andromeda (2.5 Mly) | 28.6 yr ship time |

The tests in `test/rocket.test.js` check these against the closed forms,
evaluated separately in light-year / year units, and against the Newtonian
limit (`d -> a tau^2 / 2`).
