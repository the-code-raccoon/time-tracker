import Stop from '@mui/icons-material/Stop';
import TimerOutlined from '@mui/icons-material/TimerOutlined';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import type { Category, TimeEntry, Timer, TitleSuggestion } from '../../../shared/types';
import { UNCATEGORISED_COLOR } from '../../lib/color';
import { formatElapsed } from '../../lib/dates';
import { useNow } from '../../hooks/useNow';
import { useTimer, useTimerMutations } from '../../hooks/data';
import { TimerDialog } from './TimerDialog';

type Props = {
  /** Toolbar button (desktop), or a floating button above the create button (phones, NFR-1). */
  variant: 'toolbar' | 'fab';
  categories: Category[];
  titles: TitleSuggestion[];
  /** The dialog is controlled by the parent, so the shortcut handler knows when it's open. */
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  /** The timer was stopped and logged as this entry. `timer` is what was running. */
  onLogged: (entry: TimeEntry, timer: Timer) => void;
  onError: (error: unknown) => void;
};

function Elapsed({ since }: { since: string }) {
  const now = useNow(1000);
  return <>{formatElapsed(now.getTime() - Date.parse(since))}</>;
}

/** TE-5: start/stop timer. The timer is stored server-side, so it can be stopped from another device. */
export function TimerControl({ variant, categories, titles, dialogOpen, onDialogOpenChange, onLogged, onError }: Props) {
  const timer = useTimer().data ?? null;
  const mutations = useTimerMutations();
  const color = (timer?.categoryId && categories.find((c) => c.id === timer.categoryId)?.appColor) || UNCATEGORISED_COLOR;

  async function stop() {
    if (!timer) return;
    const entry = await mutations.stop.mutateAsync();
    onLogged(entry, timer);
  }

  const dialog = dialogOpen && (
    <TimerDialog
      timer={timer}
      categories={categories}
      titles={titles}
      onStart={(input) => mutations.start.mutateAsync(input)}
      onSave={(patch) => mutations.update.mutateAsync(patch)}
      onStop={stop}
      onDiscard={() => mutations.discard.mutateAsync()}
      onClose={() => onDialogOpenChange(false)}
    />
  );
  const open = () => onDialogOpenChange(true);

  if (variant === 'fab') {
    return (
      <>
        {timer ? (
          <Fab variant="extended" color="secondary" onClick={open} aria-label={`Timer: ${timer.title}`} sx={{ position: 'fixed', right: 16, bottom: 88, maxWidth: 'calc(100vw - 32px)', gap: 1 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
            <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              <Elapsed since={timer.startedAt} />
            </Box>
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'none' }}>
              {timer.title}
            </Box>
          </Fab>
        ) : (
          <Fab size="small" onClick={open} aria-label="Start timer" sx={{ position: 'fixed', right: 24, bottom: 88 }}>
            <TimerOutlined />
          </Fab>
        )}
        {dialog}
      </>
    );
  }

  return (
    <>
      {timer ? (
        <Box sx={{ display: 'flex', alignItems: 'center', border: 1, borderColor: 'divider', borderRadius: 5, pl: 0.5, minWidth: 0, flexShrink: 1 }}>
          <Tooltip title="Edit timer">
            <ButtonBase onClick={open} aria-label={`Timer: ${timer.title}`} sx={{ gap: 1, px: 1, py: 0.5, borderRadius: 5, minWidth: 0 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
              <Box component="span" sx={{ fontSize: 14, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {timer.title}
              </Box>
              <Box component="span" sx={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                <Elapsed since={timer.startedAt} />
              </Box>
            </ButtonBase>
          </Tooltip>
          <Tooltip title="Stop and log">
            <IconButton aria-label="Stop timer" size="small" onClick={() => void stop().catch(onError)} disabled={mutations.stop.isPending}>
              <Stop fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ) : (
        <Tooltip title="Start timer">
          <IconButton aria-label="Start timer" onClick={open}>
            <TimerOutlined />
          </IconButton>
        </Tooltip>
      )}
      {dialog}
    </>
  );
}
