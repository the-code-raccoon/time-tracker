import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export type PickerOption<T> = { value: T; label: string; secondary?: string };

type Props<T> = {
  /** Committed value, formatted. */
  display: string;
  /** Called with typed text on Enter/blur. Return false if it can't be parsed (the field then reverts). */
  onCommit: (text: string) => boolean;
  ariaLabel: string;
  width: number;
  error?: boolean;
  /** A scrollable list of choices (time, duration)… */
  options?: PickerOption<T>[];
  selectedIndex?: number;
  onSelectOption?: (value: T) => void;
  /** …or custom popup content (calendar). Receives a function to close the popup. */
  popup?: (close: () => void) => ReactNode;
};

/**
 * A compact filled text field with a popup, like Google Calendar's date/time fields:
 * type a value and press Enter (or leave the field), or pick from the popup.
 */
export function PickerField<T>({ display, onCommit, ariaLabel, width, error, options, selectedIndex = -1, onSelectOption, popup }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(-1);
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  function openPopup() {
    setOpen(true);
    setHighlight(selectedIndex);
  }

  function close() {
    setOpen(false);
    setDraft(null);
  }

  function commit() {
    if (draft !== null && draft.trim() !== display) onCommit(draft);
    close();
  }

  function select(value: T) {
    onSelectOption?.(value);
    close();
  }

  useEffect(() => {
    if (!open || highlight < 0) return;
    const item = listRef.current?.children[highlight] as HTMLElement | undefined;
    item?.scrollIntoView?.({ block: 'nearest' });
  }, [open, highlight]);

  // Centre the selected option when the list opens.
  useEffect(() => {
    if (!open || selectedIndex < 0) return;
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView?.({ block: 'center' });
  }, [open, selectedIndex]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (options && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      if (!open) return openPopup();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((index) => Math.min(Math.max((index < 0 ? selectedIndex : index) + step, 0), options.length - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (draft === null && options && open && highlight >= 0) select(options[highlight].value);
      else commit();
    } else if (event.key === 'Escape' && (open || draft !== null)) {
      event.stopPropagation();
      close();
    }
  }

  return (
    <>
      <Box ref={setAnchor} sx={{ display: 'inline-flex' }}>
        <InputBase
          value={draft ?? display}
          onChange={(event) => {
            setDraft(event.target.value);
            setHighlight(-1);
          }}
          onFocus={(event) => {
            event.target.select();
            openPopup();
          }}
          onClick={() => !open && openPopup()}
          onBlur={() => {
            commit();
            setOpen(false);
          }}
          onKeyDown={handleKeyDown}
          inputProps={{
            'aria-label': ariaLabel,
            'aria-invalid': error || undefined,
            role: options ? 'combobox' : undefined,
            'aria-expanded': options ? open : undefined,
            'aria-controls': options && open ? listId : undefined,
            autoComplete: 'off',
            spellCheck: false,
          }}
          sx={{
            width,
            fontSize: 14,
            borderRadius: 1,
            bgcolor: error ? '#8c1d18' : 'action.hover',
            color: error ? '#f9dedc' : 'text.primary',
            '& input': { px: 1.5, py: 1, textAlign: 'center' },
            '&.Mui-focused': { boxShadow: (theme) => `inset 0 -2px 0 ${error ? '#f2b8b5' : theme.palette.primary.main}` },
          }}
        />
      </Box>
      <Popper
        open={open && !!anchor}
        anchorEl={anchor}
        placement="bottom-start"
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        {/* preventDefault keeps focus in the input while clicking inside the popup */}
        <Paper elevation={8} onMouseDown={(event) => event.preventDefault()} sx={{ mt: 0.5, bgcolor: '#1e1f20' }}>
          {popup?.(close)}
          {options && (
            <Box
              component="ul"
              role="listbox"
              id={listId}
              aria-label={`${ariaLabel} options`}
              ref={listRef}
              sx={{ listStyle: 'none', m: 0, py: 1, px: 0, maxHeight: 240, overflowY: 'auto', minWidth: width }}
            >
              {options.map((option, index) => (
                <Box
                  component="li"
                  role="option"
                  aria-selected={index === selectedIndex}
                  key={option.label + index}
                  onClick={() => select(option.value)}
                  onMouseEnter={() => setHighlight(index)}
                  sx={{
                    px: 2,
                    py: 0.75,
                    fontSize: 14,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    bgcolor: index === highlight ? 'action.hover' : index === selectedIndex ? 'action.selected' : undefined,
                  }}
                >
                  {option.label}
                  {option.secondary && (
                    <Box component="span" sx={{ color: 'text.secondary', ml: 1 }}>
                      ({option.secondary})
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Paper>
      </Popper>
    </>
  );
}
