import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, JULIAN_YEAR_S, LIGHT_YEAR_M } from '../src/physics/constants.js';

test('light year is c times a Julian year', () => {
  assert.equal(C * JULIAN_YEAR_S, LIGHT_YEAR_M);
});
