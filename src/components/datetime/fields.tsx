import { addMinutes, startOfDay } from 'date-fns';
import { formatDuration } from '../../lib/dates';
import { formatDateLabel, formatDurationShort, formatTimeLabel, minutesOfDay, parseDateInput, parseDuration, parseTimeInput } from '../../lib/parse';
import { MonthCalendar } from './MonthCalendar';
import { PickerField, type PickerOption } from './PickerField';

const STEP = 15;

type DateFieldProps = { value: Date; onChange: (day: Date) => void; ariaLabel: string; error?: boolean };

export function DateField({ value, onChange, ariaLabel, error }: DateFieldProps) {
  return (
    <PickerField<never>
      display={formatDateLabel(value)}
      ariaLabel={ariaLabel}
      width={124}
      error={error}
      onCommit={(text) => {
        const day = parseDateInput(text);
        if (day) onChange(day);
        return day !== null;
      }}
      popup={(close) => (
        <MonthCalendar
          selected={value}
          onSelect={(day) => {
            onChange(day);
            close();
          }}
        />
      )}
    />
  );
}

type TimeFieldProps = {
  value: Date;
  onChange: (minutes: number) => void;
  ariaLabel: string;
  /** am/pm inference reference, in minutes after midnight (DT-6). */
  referenceMinutes: number;
  error?: boolean;
};

/** Start time: every 15 minutes of the day. */
export function TimeField({ value, onChange, ariaLabel, referenceMinutes, error }: TimeFieldProps) {
  const day = startOfDay(value);
  const options: PickerOption<number>[] = Array.from({ length: (24 * 60) / STEP }, (_, i) => ({
    value: i * STEP,
    label: formatTimeLabel(addMinutes(day, i * STEP)),
  }));
  return (
    <PickerField
      display={formatTimeLabel(value)}
      ariaLabel={ariaLabel}
      width={96}
      error={error}
      options={options}
      selectedIndex={Math.floor(minutesOfDay(value) / STEP)}
      onSelectOption={onChange}
      onCommit={(text) => {
        const minutes = parseTimeInput(text, referenceMinutes);
        if (minutes !== null) onChange(minutes);
        return minutes !== null;
      }}
    />
  );
}

type EndTimeFieldProps = {
  start: Date;
  end: Date;
  /** Typed end time, in minutes after midnight. */
  onChangeTime: (minutes: number) => void;
  /** Picked from the list: minutes after the start. */
  onChangeDuration: (minutes: number) => void;
  ariaLabel: string;
  referenceMinutes: number;
  error?: boolean;
};

/** End time: the next 24 hours after the start, each with its duration, like Google Calendar. */
export function EndTimeField({ start, end, onChangeTime, onChangeDuration, ariaLabel, referenceMinutes, error }: EndTimeFieldProps) {
  const options: PickerOption<number>[] = Array.from({ length: (24 * 60) / STEP }, (_, i) => ({
    value: i * STEP,
    label: formatTimeLabel(addMinutes(start, i * STEP)),
    secondary: formatDurationShort(i * STEP),
  }));
  const duration = Math.round((end.getTime() - start.getTime()) / 60_000);
  return (
    <PickerField
      display={formatTimeLabel(end)}
      ariaLabel={ariaLabel}
      width={96}
      error={error}
      options={options}
      selectedIndex={duration >= 0 && duration < 24 * 60 ? Math.floor(duration / STEP) : -1}
      onSelectOption={onChangeDuration}
      onCommit={(text) => {
        const minutes = parseTimeInput(text, referenceMinutes);
        if (minutes !== null) onChangeTime(minutes);
        return minutes !== null;
      }}
    />
  );
}

const DURATION_PRESETS = [5, 10, 15, 30, 45, 60, 90, 120];

type DurationFieldProps = { minutes: number | null; onChange: (minutes: number) => void };

/** DT-8: presets or a typed duration ("90", "1:30", "1h30", "1.5h"). */
export function DurationField({ minutes, onChange }: DurationFieldProps) {
  return (
    <PickerField
      display={minutes !== null && minutes > 0 ? formatDuration(new Date(0), new Date(minutes * 60_000)) : '—'}
      ariaLabel="Duration"
      width={120}
      options={DURATION_PRESETS.map((preset) => ({ value: preset, label: formatDuration(new Date(0), new Date(preset * 60_000)) }))}
      selectedIndex={minutes === null ? -1 : DURATION_PRESETS.indexOf(minutes)}
      onSelectOption={onChange}
      onCommit={(text) => {
        const parsed = parseDuration(text);
        if (parsed !== null) onChange(parsed);
        return parsed !== null;
      }}
    />
  );
}
