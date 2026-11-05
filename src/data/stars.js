// Nearby star systems, ported from NadavShanun-design/stellar-relativity (data/stars.json).
// Frame: equatorial (ICRS), epoch J2000. Sun at the origin.
// Source: Approximate published values (SIMBAD / RECONS / Gliese catalog / Wikipedia). Distances are rounded measured parallaxes and carry real-world uncertainty.

/**
 * @typedef {Object} Star
 * @property {string} name
 * @property {number} distance_ly  distance from the Sun in light years
 * @property {number} ra_hours     right ascension in hours (0-24)
 * @property {number} dec_deg      declination in degrees (-90..+90)
 * @property {string} spectral_type
 * @property {string} constellation
 * @property {number} apparent_magnitude
 */

/** @type {ReadonlyArray<Readonly<Star>>} */
export const STARS = Object.freeze([
  Object.freeze({"name": "Proxima Centauri", "distance_ly": 4.2465, "ra_hours": 14.4959, "dec_deg": -62.6794, "spectral_type": "M5.5Ve", "constellation": "Centaurus", "apparent_magnitude": 11.13}),
  Object.freeze({"name": "Alpha Centauri A", "distance_ly": 4.365, "ra_hours": 14.66, "dec_deg": -60.8356, "spectral_type": "G2V", "constellation": "Centaurus", "apparent_magnitude": -0.01}),
  Object.freeze({"name": "Alpha Centauri B", "distance_ly": 4.365, "ra_hours": 14.66, "dec_deg": -60.8389, "spectral_type": "K1V", "constellation": "Centaurus", "apparent_magnitude": 1.33}),
  Object.freeze({"name": "Barnard's Star", "distance_ly": 5.963, "ra_hours": 17.9634, "dec_deg": 4.6683, "spectral_type": "M4.0Ve", "constellation": "Ophiuchus", "apparent_magnitude": 9.51}),
  Object.freeze({"name": "Wolf 359", "distance_ly": 7.856, "ra_hours": 10.9436, "dec_deg": 7.0144, "spectral_type": "M6.0V", "constellation": "Leo", "apparent_magnitude": 13.51}),
  Object.freeze({"name": "Lalande 21185", "distance_ly": 8.307, "ra_hours": 11.0556, "dec_deg": 35.97, "spectral_type": "M2.0V", "constellation": "Ursa Major", "apparent_magnitude": 7.52}),
  Object.freeze({"name": "Sirius A", "distance_ly": 8.659, "ra_hours": 6.7525, "dec_deg": -16.7161, "spectral_type": "A1V", "constellation": "Canis Major", "apparent_magnitude": -1.46}),
  Object.freeze({"name": "Luyten 726-8 A", "distance_ly": 8.73, "ra_hours": 1.6397, "dec_deg": -17.9503, "spectral_type": "M5.5V", "constellation": "Cetus", "apparent_magnitude": 12.54}),
  Object.freeze({"name": "Ross 154", "distance_ly": 9.7, "ra_hours": 18.8317, "dec_deg": -23.8364, "spectral_type": "M3.5Ve", "constellation": "Sagittarius", "apparent_magnitude": 10.44}),
  Object.freeze({"name": "Ross 248", "distance_ly": 10.3, "ra_hours": 23.7819, "dec_deg": 44.1764, "spectral_type": "M5.5V", "constellation": "Andromeda", "apparent_magnitude": 12.29}),
  Object.freeze({"name": "Epsilon Eridani", "distance_ly": 10.489, "ra_hours": 3.5483, "dec_deg": -9.4581, "spectral_type": "K2V", "constellation": "Eridanus", "apparent_magnitude": 3.73}),
  Object.freeze({"name": "Lacaille 9352", "distance_ly": 10.74, "ra_hours": 23.0981, "dec_deg": -35.8531, "spectral_type": "M1.5V", "constellation": "Piscis Austrinus", "apparent_magnitude": 7.34}),
  Object.freeze({"name": "Ross 128", "distance_ly": 11.01, "ra_hours": 11.7978, "dec_deg": 0.8047, "spectral_type": "M4.0V", "constellation": "Virgo", "apparent_magnitude": 11.13}),
  Object.freeze({"name": "61 Cygni A", "distance_ly": 11.4, "ra_hours": 21.1067, "dec_deg": 38.7497, "spectral_type": "K5V", "constellation": "Cygnus", "apparent_magnitude": 5.21}),
  Object.freeze({"name": "Procyon A", "distance_ly": 11.46, "ra_hours": 7.655, "dec_deg": 5.225, "spectral_type": "F5IV-V", "constellation": "Canis Minor", "apparent_magnitude": 0.34}),
  Object.freeze({"name": "Epsilon Indi", "distance_ly": 11.867, "ra_hours": 22.0375, "dec_deg": -56.7858, "spectral_type": "K5V", "constellation": "Indus", "apparent_magnitude": 4.69}),
  Object.freeze({"name": "Tau Ceti", "distance_ly": 11.905, "ra_hours": 1.7344, "dec_deg": -15.9375, "spectral_type": "G8V", "constellation": "Cetus", "apparent_magnitude": 3.5}),
  Object.freeze({"name": "Altair", "distance_ly": 16.73, "ra_hours": 19.8464, "dec_deg": 8.8683, "spectral_type": "A7V", "constellation": "Aquila", "apparent_magnitude": 0.76}),
  Object.freeze({"name": "Vega", "distance_ly": 25.04, "ra_hours": 18.6156, "dec_deg": 38.7837, "spectral_type": "A0V", "constellation": "Lyra", "apparent_magnitude": 0.03}),
]);

/**
 * Look up a star by name, case-insensitively.
 * @param {string} name
 * @returns {Readonly<Star> | undefined}
 */
export function findStar(name) {
  const key = String(name).trim().toLowerCase();
  return STARS.find((s) => s.name.toLowerCase() === key);
}
