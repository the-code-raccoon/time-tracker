import Search from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import type { Category, TimeEntry } from '../../../shared/types';
import { UNCATEGORISED_COLOR } from '../../lib/color';
import { formatTimeRange } from '../../lib/dates';
import { useSearch } from '../../hooks/data';

const DEBOUNCE_MS = 250;

type Props = { categories: Map<string, Category>; onPick: (entry: TimeEntry) => void; onClose: () => void };

/** `/`: find entries by title or notes. Enter opens the newest match. */
export function SearchDialog({ categories, onPick, onClose }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const search = useSearch(query);
  const results = query ? (search.data ?? []) : [];

  useEffect(() => {
    const id = setTimeout(() => setQuery(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text]);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen} slotProps={{ paper: { sx: { alignSelf: 'flex-start', mt: { sm: 8 } } } }}>
      <DialogContent sx={{ p: 0 }}>
        <TextField
          autoFocus
          fullWidth
          placeholder="Search entries"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && results.length > 0) {
              event.preventDefault();
              onPick(results[0]);
            }
          }}
          slotProps={{
            htmlInput: { 'aria-label': 'Search entries' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            },
          }}
          sx={{ p: 2, '& fieldset': { border: 'none' } }}
        />
        <Box sx={{ height: 2 }}>{search.isFetching && <LinearProgress sx={{ height: 2 }} />}</Box>
        {query && !search.isFetching && results.length === 0 && (
          <Typography color="text.secondary" sx={{ px: 3, py: 2 }}>
            No entries match “{query}”.
          </Typography>
        )}
        {search.isError && (
          <Typography color="error" sx={{ px: 3, py: 2 }}>
            Search failed: {search.error.message}
          </Typography>
        )}
        <Box component="ul" aria-label="Results" sx={{ listStyle: 'none', m: 0, p: 1, maxHeight: { sm: '60vh' }, overflowY: 'auto' }}>
          {results.map((entry) => {
            const start = new Date(entry.start);
            const color = (entry.categoryId && categories.get(entry.categoryId)?.appColor) || UNCATEGORISED_COLOR;
            return (
              <li key={entry.id}>
                <ButtonBase
                  onClick={() => onPick(entry)}
                  sx={{ width: '100%', justifyContent: 'flex-start', gap: 1.5, px: 2, py: 1, borderRadius: 1, textAlign: 'left', '&:hover, &.Mui-focusVisible': { bgcolor: 'action.hover' } }}
                >
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
                  <Typography variant="body2" sx={{ width: { xs: 96, sm: 120 }, flexShrink: 0, color: 'text.secondary' }}>
                    {format(start, 'EEE, MMM d yyyy')}
                  </Typography>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" noWrap>
                      {entry.title}
                    </Typography>
                    <Typography variant="caption" noWrap component="div" color="text.secondary">
                      {formatTimeRange(start, new Date(entry.end))}
                      {entry.notes && ` · ${entry.notes}`}
                    </Typography>
                  </Box>
                </ButtonBase>
              </li>
            );
          })}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
