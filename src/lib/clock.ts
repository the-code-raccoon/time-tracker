/** A time of day on a 12-hour clock, for the phone time selects (DT-11). */
const MINUTE_STEP = 5;

export type TimeParts = { hour: number; minute: number; pm: boolean };

/** Splits minutes after midnight into a 12-hour clock: 0 → 12:00 am, 780 → 1:00 pm. */
export function toParts(minutes: number): TimeParts {
  const hours = Math.floor(minutes / 60);
  return { hour: hours % 12 || 12, minute: minutes % 60, pm: hours >= 12 };
}

/** The inverse of toParts. */
export function fromParts({ hour, minute, pm }: TimeParts): number {
  return ((hour % 12) + (pm ? 12 : 0)) * 60 + minute;
}

/** Minutes in 5-minute steps, plus the current value if it is off the step (e.g. an imported 9:07). */
export function minuteOptions(current: number): number[] {
  const options = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);
  return options.includes(current) ? options : [...options, current].sort((a, b) => a - b);
}
