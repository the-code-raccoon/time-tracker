import Add from '@mui/icons-material/Add';
import DragIndicator from '@mui/icons-material/DragIndicator';
import EditOutlined from '@mui/icons-material/EditOutlined';
import MoreVert from '@mui/icons-material/MoreVert';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState, type DragEvent } from 'react';
import { gcalColorName } from '../../../shared/gcalColors';
import type { Category } from '../../../shared/types';
import { CategoryDialog } from '../categories/CategoryDialog';
import { DeleteCategoryDialog } from '../categories/DeleteCategoryDialog';
import { MoveByTitleDialog } from '../categories/MoveByTitleDialog';
import { useCategories, useCategoryMutations, useEntryMutations, useTitles } from '../../hooks/data';
import { formatHours } from '../../lib/dates';
import { moveItem } from '../../lib/list';

type DialogState =
  | { kind: 'create' }
  | { kind: 'edit'; category: Category }
  | { kind: 'delete' | 'merge'; category: Category }
  | { kind: 'move-by-title' };

/** CAT-7 – CAT-12: manage categories. */
export function CategoriesSection() {
  const categories = useCategories();
  const titles = useTitles();
  const mutations = useCategoryMutations();
  const entryMutations = useEntryMutations();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; index: number } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const list = categories.data ?? [];
  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= list.length) return;
    mutations.reorder.mutate(moveItem(list, from, to).map((c) => c.id), {
      onError: (error) => setNotice(error.message),
    });
  };

  function handleDrop(event: DragEvent, index: number) {
    event.preventDefault();
    if (dragIndex !== null) reorder(dragIndex, index);
    setDragIndex(null);
    setOverIndex(null);
  }

  const menuCategory = menu ? list[menu.index] : undefined;

  return (
    <Box component="section" aria-labelledby="categories-heading">
      <Typography id="categories-heading" component="h2" variant="h6" sx={{ mb: 1.5 }}>
        Categories
      </Typography>
      <Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
          <Button variant="contained" startIcon={<Add />} onClick={() => setDialog({ kind: 'create' })}>
            New category
          </Button>
          <Button variant="outlined" color="inherit" sx={{ borderColor: 'divider' }} onClick={() => setDialog({ kind: 'move-by-title' })}>
            Move entries by title
          </Button>
        </Box>

        {categories.isPending && <CircularProgress aria-label="Loading" />}
        {categories.isError && <Alert severity="error">Couldn't load categories: {categories.error.message}</Alert>}

        <Paper variant="outlined" component="ul" aria-label="Categories" sx={{ listStyle: 'none', m: 0, p: 0, bgcolor: 'transparent' }}>
          {list.map((category, index) => (
            <Box
              component="li"
              key={category.id}
              draggable
              onDragStart={(event: DragEvent) => {
                setDragIndex(index);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(event: DragEvent) => {
                event.preventDefault();
                setOverIndex(index);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDrop={(event: DragEvent) => handleDrop(event, index)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: { xs: 1, sm: 2 },
                px: { xs: 1, sm: 2 },
                py: 1.5,
                borderTop: index === 0 ? 0 : 1,
                borderColor: 'divider',
                opacity: dragIndex === index ? 0.4 : 1,
                boxShadow: (theme) =>
                  overIndex === index && dragIndex !== null && dragIndex !== index
                    ? `inset 0 ${dragIndex < index ? -2 : 2}px 0 ${theme.palette.primary.main}`
                    : 'none',
              }}
            >
              <DragIndicator sx={{ color: 'text.disabled', cursor: 'grab', display: { xs: 'none', sm: 'block' } }} aria-hidden />
              <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: category.appColor, flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap>{category.name}</Typography>
                <Typography variant="caption" color="text.secondary" component="div" noWrap>
                  {gcalColorName(category.gcalColorId)} in Google Calendar
                  <Box component="span" sx={{ display: { sm: 'none' } }}>
                    {' '}· {category.entryCount} · {formatHours(category.totalMinutes)}
                  </Box>
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, whiteSpace: 'nowrap' }}>
                {category.entryCount} {category.entryCount === 1 ? 'entry' : 'entries'} · {formatHours(category.totalMinutes)}
              </Typography>
              <Tooltip title="Edit">
                <IconButton aria-label={`Edit ${category.name}`} onClick={() => setDialog({ kind: 'edit', category })}>
                  <EditOutlined />
                </IconButton>
              </Tooltip>
              <IconButton aria-label={`More actions for ${category.name}`} onClick={(event) => setMenu({ anchor: event.currentTarget, index })}>
                <MoreVert />
              </IconButton>
            </Box>
          ))}
        </Paper>
        {list.length > 1 && (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
            Drag to reorder, or use ⋮ → Move up / Move down.
          </Typography>
        )}
      </Box>

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem disabled={menu?.index === 0} onClick={() => (reorder(menu!.index, menu!.index - 1), setMenu(null))}>
          Move up
        </MenuItem>
        <MenuItem disabled={menu?.index === list.length - 1} onClick={() => (reorder(menu!.index, menu!.index + 1), setMenu(null))}>
          Move down
        </MenuItem>
        <MenuItem disabled={list.length < 2} onClick={() => (setDialog({ kind: 'merge', category: menuCategory! }), setMenu(null))}>
          Merge into…
        </MenuItem>
        <MenuItem onClick={() => (setDialog({ kind: 'delete', category: menuCategory! }), setMenu(null))} sx={{ color: 'error.main' }}>
          Delete
        </MenuItem>
      </Menu>

      {(dialog?.kind === 'create' || dialog?.kind === 'edit') && (
        <CategoryDialog
          category={dialog.kind === 'edit' ? dialog.category : undefined}
          onClose={() => setDialog(null)}
          onSubmit={async (input) => {
            if (dialog.kind === 'edit') await mutations.update.mutateAsync({ id: dialog.category.id, patch: input });
            else await mutations.create.mutateAsync(input);
            setNotice(dialog.kind === 'edit' ? 'Category updated' : 'Category created');
          }}
        />
      )}
      {(dialog?.kind === 'delete' || dialog?.kind === 'merge') && (
        <DeleteCategoryDialog
          mode={dialog.kind}
          category={dialog.category}
          categories={list}
          onClose={() => setDialog(null)}
          onConfirm={async (moveTo) => {
            await mutations.remove.mutateAsync({ id: dialog.category.id, moveTo });
            setNotice(dialog.kind === 'merge' ? 'Categories merged' : 'Category deleted');
          }}
        />
      )}
      {dialog?.kind === 'move-by-title' && (
        <MoveByTitleDialog
          titles={titles.data ?? []}
          categories={list}
          onClose={() => setDialog(null)}
          onConfirm={(title, categoryId) => entryMutations.moveByTitle.mutateAsync({ title, categoryId })}
          onDone={(moved) => setNotice(`Moved ${moved} ${moved === 1 ? 'entry' : 'entries'}`)}
        />
      )}

      <Snackbar open={!!notice} autoHideDuration={3000} onClose={() => setNotice(null)} message={notice} />
    </Box>
  );
}
