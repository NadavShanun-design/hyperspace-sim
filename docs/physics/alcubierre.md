# Alcubierre warp metric

Module: `src/physics/alcubierre.js`. Source: M. Alcubierre, "The warp drive: hyper-fast travel
within general relativity", *Class. Quantum Grav.* **11**, L73-L77 (1994), doi:10.1088/0264-9381/11/5/001, arXiv:gr-qc/0009013.

> **Speculative physics.** The Alcubierre spacetime is an exact solution of the Einstein field
> equations only if it is sourced by **negative energy density** (exotic matter that violates the
> weak, null and dominant energy conditions). No such matter is known in the required
> amounts, and later work (e.g. M. J. Pfenning and L. H. Ford, "The unphysical nature of
> Warp Drive", *Class. Quantum Grav.* **14**, 1743 (1997), arXiv:gr-qc/9702026) shows the total negative energy needed is
> enormous. This module computes what the metric *requires*. It does not claim a warp drive can be built.

## Metric

In SI units, with the bubble moving along +x on the trajectory `x_s(t)` at speed `v_s = dx_s/dt`:

```
ds^2 = -c^2 dt^2 + (dx - v_s f(r_s) dt)^2 + dy^2 + dz^2
r_s  = sqrt((x - x_s(t))^2 + y^2 + z^2)
```

The lapse is 1 and the shift vector is `(-v_s f(r_s), 0, 0)`. Spatial slices are flat. The module
works in the bubble-centred frame: the center is at the origin, `x` is measured along the direction of
travel, `rho = sqrt(y^2 + z^2)` is the transverse distance and `r_s = sqrt(x^2 + rho^2)`.

## Shape function

```
f(r_s) = (tanh(sigma (r_s + R)) - tanh(sigma (r_s - R))) / (2 tanh(sigma R))
```

`R > 0` is the bubble radius in m and `sigma > 0` sets the wall steepness in 1/m (the wall is about `1/sigma` thick).
`f(0) = 1` exactly. As `sigma R -> infinity`, `f` becomes a top hat: 1 for `r_s < R`, 1/2 at `r_s = R` and 0 outside.

`shapeFunction` uses the exact identity `tanh a - tanh b = sinh(a - b) / (cosh a cosh b)`, which gives

```
f = cosh^2(sigma R) / (cosh(sigma (r_s + R)) cosh(sigma (r_s - R)))
```

and it evaluates this in log space with `ln cosh x = |x| + log1p(e^(-2|x|)) - ln 2`. That keeps it finite and
accurate for steep walls (`sigma R` far beyond 710, where `cosh` overflows), and it avoids the
cancellation in the tanh difference.

`shapeDerivative` returns the analytic derivative

```
df/dr_s = sigma (sech^2(sigma (r_s + R)) - sech^2(sigma (r_s - R))) / (2 tanh(sigma R))
        = -sigma f(r_s) (tanh(sigma (r_s + R)) + tanh(sigma (r_s - R)))
```

The second form is the one evaluated. The derivative is 0 at the center, `<= 0` for every `r_s >= 0`, and tends to `-sigma/2`
at `r_s = R` for large `sigma R`.

## Energy density (Eulerian observers)

For observers whose 4-velocity is normal to the `t = const` slices, Alcubierre (with `c = G = 1`) gives

```
T^{mu nu} n_mu n_nu = -(1 / 8 pi) v_s^2 rho^2 / (4 r_s^2) (df/dr_s)^2
```

Restoring SI units, `v_s` is replaced by `beta = v_s / c` and the curvature is multiplied by `c^4 / G`:

```
E(x, rho) = -(c^4 / (8 pi G)) (v_s / c)^2 rho^2 / (4 r_s^2) (df/dr_s)^2     [J/m^3]
```

Properties, all checked in `test/alcubierre.test.js`:

- `E <= 0` everywhere. The required energy is negative.
- `E = 0` on the axis of motion (`rho = 0`). The center `r_s = 0` is handled explicitly and returns 0, not NaN.
- `E` is concentrated in a torus around the bubble wall, peaking at `x = 0, rho = R`. There it tends to
  `-(c^4 / 8 pi G) beta^2 sigma^2 / 16` for large `sigma R`.
- `E` scales as `v_s^2` and is symmetric under `x -> -x`.

`v_s` may exceed `c`. That is the point of the metric, since nothing moves locally faster than light.

`energyDensityGrid(vs, R, sigma, { extentM, nx, ny })` samples `E` on a regular square grid in the x-y plane
(`z = 0`, so `rho = |y|`). The window spans `[-extentM, extentM]` on both axes. The defaults are `extentM = 2R` and `nx = ny = 41`, and each
dimension is capped at 512. It returns `{ x, y, values, min, max }`, where `values[j][i]` is the value at `(x[i], y[j])`, for heatmap rendering.

## Trip time

A ship at the bubble center follows `x = x_s(t)`. There `f = 1` and the lapse is 1, so the ship is in free fall
and its proper time equals coordinate time (Alcubierre 1994):

```
tau = t = distance / v_s
```

`warpTripTime(distanceM, vs)` returns this value in seconds. It models only the constant-speed cruise; the bubble's
acceleration and deceleration phases are not modelled.
