import Add from '@mui/icons-material/Add';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import Logout from '@mui/icons-material/Logout';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import Sync from '@mui/icons-material/Sync';
import Badge from '@mui/material/Badge';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { VIEW_LABELS, type ViewMode } from '../../lib/dates';

type Props = {
  title: string;
  view: ViewMode;
  compact: boolean;
  onViewChange: (view: ViewMode) => void;
  onToday: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onCreate: () => void;
  onOpenSettings: () => void;
  onSync: () => void;
  syncing: boolean;
  /** Entries waiting to be reconciled; shown as a badge on the sync button. */
  pendingConflicts: number;
  onLogout: () => void;
};

export function CalendarToolbar({ title, view, compact, onViewChange, onToday, onPrevious, onNext, onCreate, onOpenSettings, onSync, syncing, pendingConflicts, onLogout }: Props) {
  const period = VIEW_LABELS[view].toLowerCase();
  return (
    <Toolbar sx={{ gap: { xs: 0.5, sm: 1 }, px: { xs: 1, sm: 2 } }}>
      {!compact && (
        <Button variant="contained" startIcon={<Add />} onClick={onCreate} sx={{ mr: 1 }}>
          Create
        </Button>
      )}
      <Button variant="outlined" color="inherit" onClick={onToday} sx={{ borderColor: 'divider', minWidth: 0 }}>
        Today
      </Button>
      <Tooltip title={`Previous ${period}`}>
        <IconButton aria-label={`Previous ${period}`} onClick={onPrevious} size={compact ? 'small' : 'medium'}>
          <ChevronLeft />
        </IconButton>
      </Tooltip>
      <Tooltip title={`Next ${period}`}>
        <IconButton aria-label={`Next ${period}`} onClick={onNext} size={compact ? 'small' : 'medium'}>
          <ChevronRight />
        </IconButton>
      </Tooltip>
      <Typography component="h1" variant={compact ? 'subtitle1' : 'h6'} noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
        {title}
      </Typography>
      <TextField
        select
        size="small"
        value={view}
        onChange={(event) => onViewChange(event.target.value as ViewMode)}
        slotProps={{ htmlInput: { 'aria-label': 'View' } }}
        sx={{ minWidth: compact ? 104 : 120, flexShrink: 0 }}
      >
        {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
          <MenuItem key={mode} value={mode}>
            {VIEW_LABELS[mode]}
          </MenuItem>
        ))}
      </TextField>
      <Tooltip title={pendingConflicts > 0 ? `Sync with Google Calendar (${pendingConflicts} to reconcile)` : 'Sync with Google Calendar'}>
        <span>
          <IconButton aria-label="Sync with Google Calendar" onClick={onSync} disabled={syncing} size={compact ? 'small' : 'medium'}>
            <Badge badgeContent={pendingConflicts} color="warning" max={99}>
              <Sync
                sx={{
                  animation: syncing ? 'tt-spin 1s linear infinite' : 'none',
                  '@keyframes tt-spin': { from: { transform: 'rotate(360deg)' }, to: { transform: 'rotate(0deg)' } },
                }}
              />
            </Badge>
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Settings">
        <IconButton aria-label="Settings" onClick={onOpenSettings} size={compact ? 'small' : 'medium'}>
          <SettingsOutlined />
        </IconButton>
      </Tooltip>
      <Tooltip title="Sign out">
        <IconButton aria-label="Sign out" onClick={onLogout} size={compact ? 'small' : 'medium'}>
          <Logout />
        </IconButton>
      </Tooltip>
    </Toolbar>
  );
}
