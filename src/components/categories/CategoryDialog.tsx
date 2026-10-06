import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { GCAL_COLORS, gcalColorName } from '../../../shared/gcalColors';
import type { Category, CategoryInput } from '../../../shared/types';
import { readableTextColor, UNCATEGORISED_COLOR } from '../../lib/color';
import { ColorSwatches, type Swatch } from './ColorSwatches';

/** Google Calendar's extended palette, offered as extra app colours (CAT-9). */
const EXTRA_COLORS: Swatch[] = [
  { name: 'Cherry blossom', hex: '#d81b60' },
  { name: 'Amethyst', hex: '#9e69af' },
  { name: 'Wisteria', hex: '#b39ddb' },
  { name: 'Cobalt', hex: '#4285f4' },
  { name: 'Eucalyptus', hex: '#009688' },
  { name: 'Pistachio', hex: '#7cb342' },
  { name: 'Avocado', hex: '#c0ca33' },
  { name: 'Citron', hex: '#e4c441' },
  { name: 'Mango', hex: '#f09300' },
  { name: 'Pumpkin', hex: '#ef6c00' },
  { name: 'Cocoa', hex: '#795548' },
  { name: 'Birch', hex: '#a79b8e' },
].map((color) => ({ ...color, value: color.hex }));

const APP_SWATCHES: Swatch[] = [...GCAL_COLORS.map((c) => ({ value: c.hex, name: c.name, hex: c.hex })), ...EXTRA_COLORS];

const DEFAULT_COLOR = 'default';
const GCAL_SWATCHES: Swatch[] = [
  ...GCAL_COLORS.map((c) => ({ value: c.id, name: c.name, hex: c.hex })),
  { value: DEFAULT_COLOR, name: 'Calendar default', hex: UNCATEGORISED_COLOR },
];

type Props = {
  category?: Category;
  onSubmit: (input: CategoryInput) => Promise<unknown>;
  onClose: () => void;
};

export function CategoryDialog({ category, onSubmit, onClose }: Props) {
  const [name, setName] = useState(category?.name ?? '');
  const [appColor, setAppColor] = useState(category?.appColor ?? GCAL_COLORS[6].hex);
  const [hexText, setHexText] = useState(appColor);
  const [gcalColorId, setGcalColorId] = useState<string | null>(category ? category.gcalColorId : GCAL_COLORS[6].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gcalChanged = !!category && category.gcalColorId !== gcalColorId;
  const hexValid = /^#[0-9a-f]{6}$/i.test(hexText);

  function chooseColor(hex: string) {
    setAppColor(hex.toLowerCase());
    setHexText(hex.toLowerCase());
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !hexValid) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name, appColor, gcalColorId });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs" slotProps={{ paper: { component: 'form', onSubmit: handleSubmit, noValidate: true } as object }}>
      <DialogTitle>{category ? 'Edit category' : 'New category'}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required slotProps={{ htmlInput: { maxLength: 60 } }} />

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Colour in this app
            </Typography>
            <ColorSwatches label="Colour in this app" swatches={APP_SWATCHES} value={appColor} onChange={chooseColor} />
            <Stack direction="row" spacing={1.5} sx={{ mt: 2, alignItems: 'center' }}>
              <Box
                component="input"
                type="color"
                aria-label="Custom colour"
                value={appColor}
                onChange={(e: ChangeEvent<HTMLInputElement>) => chooseColor(e.target.value)}
                sx={{ width: 40, height: 40, p: 0, border: 0, bgcolor: 'transparent', cursor: 'pointer' }}
              />
              <TextField
                label="Hex"
                size="small"
                value={hexText}
                error={!hexValid}
                onChange={(e) => {
                  setHexText(e.target.value);
                  if (/^#[0-9a-f]{6}$/i.test(e.target.value)) setAppColor(e.target.value.toLowerCase());
                }}
                sx={{ width: 120 }}
              />
              <Box
                aria-label="Preview"
                sx={{ flex: 1, px: 1, py: 0.5, borderRadius: 1, bgcolor: appColor, color: readableTextColor(appColor), fontSize: 12 }}
              >
                <strong>{name.trim() || 'Category'}</strong>, 9:30am
              </Box>
            </Stack>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Colour in Google Calendar: {gcalColorName(gcalColorId)}
            </Typography>
            <ColorSwatches
              label="Colour in Google Calendar"
              swatches={GCAL_SWATCHES}
              value={gcalColorId ?? DEFAULT_COLOR}
              onChange={(value) => setGcalColorId(value === DEFAULT_COLOR ? null : value)}
            />
          </Box>

          {gcalChanged && category.syncedCount > 0 && (
            <Alert severity="warning">
              {category.syncedCount} {category.syncedCount === 1 ? 'event' : 'events'} will be recoloured to {gcalColorName(gcalColorId)} in Google
              Calendar on the next sync.
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy} color="inherit">
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={busy || !name.trim() || !hexValid}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
