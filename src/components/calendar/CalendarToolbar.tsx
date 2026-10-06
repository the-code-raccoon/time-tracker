import Add from '@mui/icons-material/Add';
import BarChart from '@mui/icons-material/BarChart';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import Logout from '@mui/icons-material/Logout';
import MoreVert from '@mui/icons-material/MoreVert';
import Search from '@mui/icons-material/Search';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import Sync from '@mui/icons-material/Sync';
import Badge from '@mui/material/Badge';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState, type ReactNode } from 'react';
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
  onSearch: () => void;
  /** The timer button (desktop only; phones get a floating one). */
  timer?: ReactNode;
  onOpenSettings: () => void;
  onOpenReports: () => void;
  onSync: () => void;
  syncing: boolean;
  /** Entries waiting to be reconciled; shown as a badge on the sync button. */
  pendingConflicts: number;
  onLogout: () => void;
};

export function CalendarToolbar({ title, view, compact, onViewChange, onToday, onPrevious, onNext, onCreate, onSearch, timer, onOpenSettings, onOpenReports, onSync, syncing, pendingConflicts, onLogout }: Props) {
  const period = VIEW_LABELS[view].toLowerCase();
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const fromMore = (action: () => void) => () => {
    setMoreAnchor(null);
    action();
  };
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
      {!compact && (
        <Tooltip title="Search">
          <IconButton aria-label="Search" onClick={onSearch}>
            <Search />
          </IconButton>
        </Tooltip>
      )}
      {!compact && timer}
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
      {compact ? (
        <>
          <IconButton aria-label="More" onClick={(event) => setMoreAnchor(event.currentTarget)} size="small">
            <MoreVert />
          </IconButton>
          <Menu anchorEl={moreAnchor} open={!!moreAnchor} onClose={() => setMoreAnchor(null)}>
            <MenuItem onClick={fromMore(onSearch)}>
              <ListItemIcon>
                <Search fontSize="small" />
              </ListItemIcon>
              Search
            </MenuItem>
            <MenuItem onClick={fromMore(onOpenReports)}>
              <ListItemIcon>
                <BarChart fontSize="small" />
              </ListItemIcon>
              Reports
            </MenuItem>
            <MenuItem onClick={fromMore(onOpenSettings)}>
              <ListItemIcon>
                <SettingsOutlined fontSize="small" />
              </ListItemIcon>
              Settings
            </MenuItem>
            <MenuItem onClick={fromMore(onLogout)}>
              <ListItemIcon>
                <Logout fontSize="small" />
              </ListItemIcon>
              Sign out
            </MenuItem>
          </Menu>
        </>
      ) : (
        <>
          <Tooltip title="Reports">
            <IconButton aria-label="Reports" onClick={onOpenReports}>
              <BarChart />
            </IconButton>
          </Tooltip>
          <Tooltip title="Settings">
            <IconButton aria-label="Settings" onClick={onOpenSettings}>
              <SettingsOutlined />
            </IconButton>
          </Tooltip>
          <Tooltip title="Sign out">
            <IconButton aria-label="Sign out" onClick={onLogout}>
              <Logout />
            </IconButton>
          </Tooltip>
        </>
      )}
    </Toolbar>
  );
}
