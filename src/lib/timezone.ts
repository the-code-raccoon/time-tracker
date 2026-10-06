import { format } from 'date-fns';

/** "(GMT-04:00) Eastern Time - Toronto", like Google Calendar. */
export function timeZoneLabel(date: Date, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const generic =
    new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longGeneric' }).formatToParts(date).find((p) => p.type === 'timeZoneName')
      ?.value ?? timeZone;
  const city = timeZone.split('/').at(-1)?.replaceAll('_', ' ');
  return `(GMT${format(date, 'xxx')}) ${generic}${city && city !== timeZone ? ` - ${city}` : ''}`;
}
