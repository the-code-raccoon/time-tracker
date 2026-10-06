import { describe, expect, it } from 'vitest';
import { formatDateLabel, formatDurationShort, formatTimeLabel, parseDateInput, parseDuration, parseTimeInput } from './parse';

const NOW = new Date('2026-10-05T15:00'); // 3pm

describe('parseDateInput (DT-3)', () => {
  it.each([
    ['oct 5', '2026-10-05'],
    ['Oct 5', '2026-10-05'],
    ['october 5', '2026-10-05'],
    ['Oct. 5th', '2026-10-05'],
    ['sept 30', '2026-09-30'],
    ['5 oct', '2026-10-05'],
    ['Oct 5, 2027', '2027-10-05'],
    ['oct 5 2027', '2027-10-05'],
    ['10/5', '2026-10-05'],
    ['10/5/2027', '2027-10-05'],
    ['10/5/27', '2027-10-05'],
    ['2026-12-31', '2026-12-31'],
    ['today', '2026-10-05'],
    ['tomorrow', '2026-10-06'],
    ['yesterday', '2026-10-04'],
  ])('%j → %s', (input, expected) => {
    expect(parseDateInput(input, NOW)).toEqual(new Date(`${expected}T00:00`));
  });

  it.each(['', 'oct', 'octopus 5', 'feb 30', '13/1', 'oct 32', 'hello'])('rejects %j', (input) => {
    expect(parseDateInput(input, NOW)).toBeNull();
  });

  it('formats like Google Calendar', () => {
    expect(formatDateLabel(new Date('2026-10-05T00:00'))).toBe('Oct 5, 2026');
  });
});

describe('parseTimeInput (DT-5, DT-6)', () => {
  const at = (hour: number, minute = 0) => hour * 60 + minute;

  it.each([
    ['9:30', at(15), at(21, 30)], // 3pm: 9:30am has passed → 9:30pm
    ['4', at(15), at(16)],
    ['9:30', at(8), at(9, 30)], // 8am: 9:30am is next
    ['9:30', at(23), at(21, 30)], // both passed → pm
    ['12', at(15), at(12)], // 12am and 12pm passed → 12pm
    ['12:15', at(0), at(0, 15)],
    ['930', at(15), at(21, 30)],
    ['1030', at(8), at(10, 30)],
    ['9:30a', at(15), at(9, 30)],
    ['9:30 am', at(15), at(9, 30)],
    ['9.30pm', at(0), at(21, 30)],
    ['9:30p', at(0), at(21, 30)],
    ['12am', at(15), at(0)],
    ['12pm', at(0), at(12)],
    ['21:30', at(0), at(21, 30)],
    ['13', at(0), at(13)],
    ['0:30', at(15), at(0, 30)],
    ['09:30', at(15), at(9, 30)],
    ['0930', at(15), at(9, 30)],
  ])('%j with reference %i → %i', (input, reference, expected) => {
    expect(parseTimeInput(input, reference)).toBe(expected);
  });

  it('infers the end time from the start time, like Google Calendar', () => {
    expect(parseTimeInput('10', at(9, 30))).toBe(at(10));
    expect(parseTimeInput('9', at(9, 30))).toBe(at(21));
  });

  it.each(['', 'abc', '25', '9:60', '13pm', '0am', '12345', '9:3'])('rejects %j', (input) => {
    expect(parseTimeInput(input, 0)).toBeNull();
  });

  it('formats like Google Calendar', () => {
    expect(formatTimeLabel(new Date('2026-10-05T09:30'))).toBe('9:30am');
    expect(formatTimeLabel(new Date('2026-10-05T17:10'))).toBe('5:10pm');
    expect(formatTimeLabel(new Date('2026-10-05T10:00'))).toBe('10:00am');
  });
});

describe('parseDuration (DT-8)', () => {
  it.each([
    ['90', 90],
    ['1:30', 90],
    ['1h30', 90],
    ['1h 30m', 90],
    ['1 h 30 min', 90],
    ['1 hour 30 minutes', 90],
    ['1.5h', 90],
    ['1.5 hrs', 90],
    ['2 hr', 120],
    ['45m', 45],
    ['45 min', 45],
    ['5 mins', 5],
  ])('%j → %i min', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(['', '0', 'abc', '1:75', '25h', 'h'])('rejects %j', (input) => {
    expect(parseDuration(input)).toBeNull();
  });

  it.each([
    [30, '30 mins'],
    [1, '1 min'],
    [60, '1 hr'],
    [75, '1.25 hrs'],
    [90, '1.5 hrs'],
  ])('short label %i → %s', (minutes, expected) => {
    expect(formatDurationShort(minutes)).toBe(expected);
  });
});
