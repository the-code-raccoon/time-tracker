import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';

const SECTIONS: { title: string; shortcuts: [keys: string[], action: string][] }[] = [
  {
    title: 'Navigation',
    shortcuts: [
      [['k', 'p'], 'Previous date range'],
      [['j', 'n'], 'Next date range'],
      [['t'], 'Go to today'],
      [['g'], 'Go to a date'],
      [['/'], 'Search'],
    ],
  },
  {
    title: 'Views',
    shortcuts: [
      [['d', '1'], 'Day'],
      [['w', '2'], 'Week'],
      [['m', '3'], 'Month'],
      [['a', '5'], 'Schedule'],
    ],
  },
  {
    title: 'Entries',
    shortcuts: [
      [['c'], 'Create entry'],
      [['e'], 'Open the selected entry'],
      [['Backspace', 'Delete'], 'Delete the selected entry'],
      [['z'], 'Undo'],
      [['Ctrl/⌘ + s'], 'Save (in the editor)'],
      [['Shift + F10'], 'Entry menu'],
    ],
  },
  {
    title: 'App',
    shortcuts: [
      [['r'], 'Sync with Google Calendar'],
      [['s'], 'Settings'],
      [['Esc'], 'Close the dialog or go back'],
      [['?'], 'Show keyboard shortcuts'],
    ],
  },
];

function Key({ children }: { children: string }) {
  return (
    <Box
      component="kbd"
      sx={{ fontFamily: 'inherit', fontSize: 12, px: 0.75, py: 0.25, borderRadius: 0.5, border: 1, borderColor: 'divider', bgcolor: 'action.hover' }}
    >
      {children}
    </Box>
  );
}

/** §5.7: `?` lists the keyboard shortcuts. */
export function ShortcutHelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Keyboard shortcuts</DialogTitle>
      <DialogContent sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 4, rowGap: 2 }}>
        {SECTIONS.map((section) => (
          <Box key={section.title}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              {section.title}
            </Typography>
            <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.75, alignItems: 'center' }}>
              {section.shortcuts.map(([keys, action]) => (
                <Box key={action} sx={{ display: 'contents' }}>
                  <Box component="dt" sx={{ display: 'flex', gap: 0.5, alignItems: 'center', fontSize: 12, color: 'text.secondary' }}>
                    {keys.map((key, i) => (
                      <Box component="span" key={key} sx={{ display: 'contents' }}>
                        {i > 0 && 'or'}
                        <Key>{key}</Key>
                      </Box>
                    ))}
                  </Box>
                  <Box component="dd" sx={{ m: 0, fontSize: 14 }}>
                    {action}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </DialogContent>
    </Dialog>
  );
}
