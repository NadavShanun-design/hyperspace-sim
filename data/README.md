# Extended nearby-star catalog

`hyg-nearby.csv` lists real stars from the HYG database, nearest first. It grows one star per pull request.

| Column | Meaning |
| --- | --- |
| `hyg_id` | Row id in HYG v4.1 |
| `name` | Proper name, else Bayer/Flamsteed + constellation, else Gliese, HIP or HD number. Repeated names get a `(HYG id)` suffix |
| `distance_ly` | Distance from the Sun in light years (HYG parsecs x 3.261564) |
| `ra_hours` | Right ascension, hours, epoch J2000 |
| `dec_deg` | Declination, degrees, epoch J2000 |
| `spectral_type` | Spectral type as given in HYG (can be empty) |
| `constellation` | IAU constellation abbreviation (can be empty) |
| `apparent_magnitude` | Apparent visual magnitude |

The curated `src/data/stars.js` catalog that the app uses is unchanged. Distances here are HYG values, so they can differ slightly from the curated ones.

## License and attribution

The data in `hyg-nearby.csv` comes from the [HYG Database](https://github.com/astronexus/HYG-Database) v4.1 by David Nash (astronexus), licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). This derived file is shared under the same license. The rest of the repository stays MIT.
