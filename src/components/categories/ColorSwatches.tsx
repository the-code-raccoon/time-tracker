import Check from '@mui/icons-material/Check';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Tooltip from '@mui/material/Tooltip';
import { readableTextColor } from '../../lib/color';

export type Swatch = { value: string; name: string; hex: string };

type Props = { label: string; swatches: Swatch[]; value: string; onChange: (value: string) => void };

/** A row of named colour circles; the selected one shows a check mark. */
export function ColorSwatches({ label, swatches, value, onChange }: Props) {
  return (
    <Box role="radiogroup" aria-label={label} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {swatches.map((swatch) => {
        const selected = swatch.value === value;
        return (
          <Tooltip key={swatch.value} title={swatch.name}>
            <ButtonBase
              role="radio"
              aria-checked={selected}
              aria-label={swatch.name}
              onClick={() => onChange(swatch.value)}
              sx={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                bgcolor: swatch.hex,
                color: readableTextColor(swatch.hex),
                boxShadow: (theme) => (selected ? `0 0 0 2px ${theme.palette.background.paper}, 0 0 0 4px ${swatch.hex}` : 'none'),
                '&:hover, &.Mui-focusVisible': { boxShadow: (theme) => `0 0 0 2px ${theme.palette.text.primary}` },
              }}
            >
              {selected && <Check sx={{ fontSize: 18 }} />}
            </ButtonBase>
          </Tooltip>
        );
      })}
    </Box>
  );
}
