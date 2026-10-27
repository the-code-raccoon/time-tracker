import { describe, expect, it } from 'vitest';
import { fromParts, minuteOptions, toParts } from './clock';

describe('TimeSelects helpers (DT-11)', () => {
  it('splits minutes into a 12-hour clock', () => {
    expect(toParts(0)).toEqual({ hour: 12, minute: 0, pm: false });
    expect(toParts(9 * 60 + 35)).toEqual({ hour: 9, minute: 35, pm: false });
    expect(toParts(12 * 60 + 5)).toEqual({ hour: 12, minute: 5, pm: true });
    expect(toParts(23 * 60 + 55)).toEqual({ hour: 11, minute: 55, pm: true });
  });

  it('round-trips every minute of the day', () => {
    for (let minutes = 0; minutes < 24 * 60; minutes++) expect(fromParts(toParts(minutes))).toBe(minutes);
  });

  it('handles 12 am and 12 pm', () => {
    expect(fromParts({ hour: 12, minute: 0, pm: false })).toBe(0);
    expect(fromParts({ hour: 12, minute: 30, pm: true })).toBe(12 * 60 + 30);
  });

  it('offers minutes in 5-minute steps, keeping an off-step current value', () => {
    expect(minuteOptions(10)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    expect(minuteOptions(7)).toEqual([0, 5, 7, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  });
});
