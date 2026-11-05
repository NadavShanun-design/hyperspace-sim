# Physics documentation

Each page documents one module under `src/physics/`: the formulas it
implements, the sign and unit conventions, how inputs are validated, and the
reference values the tests check. Shared constants (C, G, G0, JULIAN_YEAR_S,
LIGHT_YEAR_M, SOLAR_MASS_KG) live in `src/physics/constants.js` and are never
redefined elsewhere.

| Page | Module | Covers | Units |
| --- | --- | --- | --- |
| [Special relativity toolkit](relativity.md) | `src/physics/relativity.js` | Lorentz factor, rapidity, velocity addition, time dilation, length contraction, Doppler factor, aberration of starlight | Dimensionless `beta = v / c`; angles in radians |
| [Relativistic rocket](rocket.md) | `src/physics/rocket.js` | Constant proper acceleration (hyperbolic motion), flip-and-burn and coast trips, photon-rocket mass ratio | SI (m, s, m/s^2); speeds as fractions of c |
| [Alcubierre warp metric](alcubierre.md) | `src/physics/alcubierre.js` | Shape function and its derivative, Eulerian energy density and grid sampling, warp trip time | SI (m, s, m/s, J/m^3) |

## Reading order

1. [relativity.md](relativity.md): the special-relativity basics that the
   other two pages build on.
2. [rocket.md](rocket.md): how long sub-light trips to the nearest stars take
   at a constant 1 g, in ship time and in Earth time.
3. [alcubierre.md](alcubierre.md): the speculative faster-than-light option
   and the negative energy density it needs.

## Conventions shared by every module

- All functions are pure.
- `TypeError` for any argument that is not a finite number of the expected
  type.
- `RangeError` for physically invalid values, such as `|beta| >= 1`, a
  negative distance or duration, or a non-positive acceleration.
