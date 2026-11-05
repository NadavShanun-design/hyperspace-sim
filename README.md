# hyperspace-sim

A zero-dependency browser hyperspace-jump simulator grounded in real physics:
special relativity, constant-acceleration "flip and burn" trips, and the
Alcubierre warp metric, plotted over the real nearest star systems.

## Development

```sh
npm test   # runs the node:test suite, no install step needed
```

Requires Node 20+.

## Star data

`src/data/stars.js` is ported from
[stellar-relativity](https://github.com/NadavShanun-design/stellar-relativity).
Values are approximate published figures (SIMBAD / RECONS / Gliese catalog)
and carry real-world measurement uncertainty.

## License

MIT
