import Check from '@mui/icons-material/Check';
import ContentCopy from '@mui/icons-material/ContentCopy';
import DeleteOutline from '@mui/icons-material/DeleteOutlined';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import type { Category, TimeEntry } from '../../shared/types';
import { readableTextColor } from '../lib/color';

export type ContextMenuState = { entry: TimeEntry; x: number; y: number };

type Props = {
  state: ContextMenuState | null;
  categories: Category[];
  onClose: () => void;
  onChangeCategory: (entry: TimeEntry, categoryId: string | null) => void;
  onDuplicate: (entry: TimeEntry) => void;
  onDelete: (entry: TimeEntry) => void;
};

/** §5.2c: right-click / long-press menu for an entry. */
export function EntryContextMenu({ state, categories, onClose, onChangeCategory, onDuplicate, onDelete }: Props) {
  const entry = state?.entry;
  const act = (action: (entry: TimeEntry) => void) => () => {
    if (entry) action(entry);
    onClose();
  };

  return (
    <Menu
      open={!!state}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={state ? { top: state.y, left: state.x } : undefined}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
      slotProps={{ paper: { sx: { minWidth: 220 } }, list: { 'aria-label': entry ? `Actions for ${entry.title}` : undefined } }}
    >
      <Box
        role="group"
        aria-label="Category"
        sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 28px)', gap: 1, px: 2, py: 1, justifyContent: 'start' }}
      >
        {categories.map((category) => {
          const current = entry?.categoryId === category.id;
          return (
            <Tooltip key={category.id} title={category.name} placement="top">
              <ButtonBase
                aria-label={category.name}
                aria-pressed={current}
                onClick={act((e) => !current && onChangeCategory(e, category.id))}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  bgcolor: category.appColor,
                  color: readableTextColor(category.appColor),
                  '&:hover, &.Mui-focusVisible': { boxShadow: (theme) => `0 0 0 2px ${theme.palette.text.primary}` },
                }}
              >
                {current && <Check sx={{ fontSize: 18 }} />}
              </ButtonBase>
            </Tooltip>
          );
        })}
      </Box>
      <Divider />
      <MenuItem onClick={act(onDuplicate)}>
        <ListItemIcon>
          <ContentCopy fontSize="small" />
        </ListItemIcon>
        <ListItemText>Duplicate</ListItemText>
      </MenuItem>
      <MenuItem onClick={act(onDelete)}>
        <ListItemIcon>
          <DeleteOutline fontSize="small" />
        </ListItemIcon>
        <ListItemText>Delete</ListItemText>
      </MenuItem>
    </Menu>
  );
}
