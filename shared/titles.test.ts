import { describe, expect, it } from 'vitest';
import { normalizeTitle } from './titles.js';

describe('normalizeTitle (NORM-1)', () => {
  it.each([
    ['Eat snack', 'eat snack'],
    ['  chill  ', 'chill'],
    ['make+eat   lunch', 'make + eat lunch'],
    ['Make +eat Breakfast', 'make + eat breakfast'],
    ['jp -srs', 'jp - srs'],
    ['jp- new vocab', 'jp - new vocab'],
    ['jp - srs', 'jp - srs'],
    ['make + eat pre-workout', 'make + eat pre-workout'],
    ['reading/writing', 'reading / writing'],
    ['Pjsk event story summary - make bg + fix pngs', 'pjsk event story summary - make bg + fix pngs'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeTitle(input)).toBe(expected);
  });

  it('is idempotent', () => {
    const once = normalizeTitle('Make+Eat  Lunch -  Home');
    expect(normalizeTitle(once)).toBe(once);
  });
});
