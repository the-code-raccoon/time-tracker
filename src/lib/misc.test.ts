import { describe, expect, it } from 'vitest';
import { formatHours } from './dates';
import { moveItem } from './list';
import { timeZoneLabel } from './timezone';

describe('timeZoneLabel', () => {
  it('matches Google Calendar in summer and winter', () => {
    expect(timeZoneLabel(new Date('2026-10-05T12:00'), 'America/Toronto')).toBe('(GMT-04:00) Eastern Time - Toronto');
    expect(timeZoneLabel(new Date('2026-12-05T12:00'), 'America/Toronto')).toBe('(GMT-05:00) Eastern Time - Toronto');
  });
});

describe('moveItem', () => {
  it('moves an item forwards and backwards', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });
});

describe('formatHours', () => {
  it.each([
    [45, '0.8 h'],
    [1668, '27.8 h'],
    [17898, '298 h'],
  ])('%i min → %s', (minutes, expected) => {
    expect(formatHours(minutes)).toBe(expected);
  });
});
