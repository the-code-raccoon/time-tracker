import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { parseDateInput } from '../../lib/parse';
import { MonthCalendar } from '../datetime/MonthCalendar';

type Props = { current: Date; onGo: (date: Date) => void; onClose: () => void };

/** `g`: type a date (same forms as the editor, DT-3) or pick one. */
export function GoToDateDialog({ current, onGo, onClose }: Props) {
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);

  return (
    <Dialog open onClose={onClose} maxWidth="xs">
      <DialogTitle>Go to date</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label="Date"
          placeholder="e.g. oct 5, 10/5 or tomorrow"
          value={text}
          error={invalid}
          helperText={invalid ? "Couldn't read that date" : ' '}
          onChange={(event) => {
            setText(event.target.value);
            setInvalid(false);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const date = parseDateInput(text);
            if (date) onGo(date);
            else setInvalid(true);
          }}
          sx={{ mt: 1 }}
        />
        <MonthCalendar selected={current} onSelect={onGo} />
      </DialogContent>
    </Dialog>
  );
}
