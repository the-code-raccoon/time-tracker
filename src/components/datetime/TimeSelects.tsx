import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { fromParts, minuteOptions, toParts, type TimeParts } from '../../lib/clock';

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);

type Props = {
  /** Minutes after midnight. */
  value: number;
  onChange: (minutes: number) => void;
  ariaLabel: string;
  error?: boolean;
};

/** DT-11: on phones a time is picked with hour, minute and am/pm selects (the phone's own wheel picker), like Google Calendar. */
export function TimeSelects({ value, onChange, ariaLabel, error }: Props) {
  const parts = toParts(value);
  const set = (patch: Partial<TimeParts>) => onChange(fromParts({ ...parts, ...patch }));
  const select = (label: string, current: string, options: { value: string; label: string }[], pick: (value: string) => void) => (
    <TextField
      select
      size="small"
      variant="filled"
      hiddenLabel
      error={error}
      value={current}
      onChange={(event) => pick(event.target.value)}
      slotProps={{ select: { native: true }, htmlInput: { 'aria-label': `${ariaLabel} ${label}` } }}
      sx={{ minWidth: 64 }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </TextField>
  );
  return (
    <Box role="group" aria-label={ariaLabel} sx={{ display: 'flex', gap: 0.5 }}>
      {select('hour', String(parts.hour), HOURS.map((h) => ({ value: String(h), label: String(h) })), (v) => set({ hour: Number(v) }))}
      {select(
        'minute',
        String(parts.minute),
        minuteOptions(parts.minute).map((m) => ({ value: String(m), label: String(m).padStart(2, '0') })),
        (v) => set({ minute: Number(v) }),
      )}
      {select('am/pm', parts.pm ? 'pm' : 'am', [{ value: 'am', label: 'am' }, { value: 'pm', label: 'pm' }], (v) => set({ pm: v === 'pm' }))}
    </Box>
  );
}
