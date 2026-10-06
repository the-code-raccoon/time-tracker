import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import type { Category, TitleSuggestion } from '../../shared/types';
import { UNCATEGORISED_COLOR } from '../lib/color';

type Props = {
  value: string;
  onChange: (title: string) => void;
  /** A suggestion was picked: also use its usual category (TE-1a). */
  onPickCategory: (categoryId: string | null) => void;
  titles: TitleSuggestion[];
  categories: Category[];
  error?: string;
  autoFocus?: boolean;
};

/** TE-1a: title with autocomplete from past titles. */
export function TitleField({ value, onChange, onPickCategory, titles, categories, error, autoFocus }: Props) {
  return (
    <Autocomplete
      freeSolo
      options={titles}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.title)}
      filterOptions={(options, { inputValue }) => {
        const query = inputValue.trim().toLowerCase();
        return options.filter((option) => option.title.includes(query)).slice(0, 8);
      }}
      inputValue={value}
      onInputChange={(_, next) => onChange(next)}
      onChange={(_, picked) => {
        if (picked && typeof picked !== 'string') {
          onChange(picked.title);
          onPickCategory(picked.categoryId);
        }
      }}
      renderOption={({ key, ...props }, option) => (
        <li key={key} {...props}>
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              mr: 1.5,
              flexShrink: 0,
              bgcolor: categories.find((c) => c.id === option.categoryId)?.appColor ?? UNCATEGORISED_COLOR,
            }}
          />
          {option.title}
        </li>
      )}
      renderInput={(params) => <TextField {...params} label="Title" autoFocus={autoFocus} required error={!!error} helperText={error} />}
    />
  );
}

type CategorySelectProps = { value: string; onChange: (categoryId: string) => void; categories: Category[] };

/** Category picker; '' means none. */
export function CategorySelect({ value, onChange, categories }: CategorySelectProps) {
  return (
    <TextField select label="Category" value={value} onChange={(event) => onChange(event.target.value)}>
      <MenuItem value="">
        <em>None</em>
      </MenuItem>
      {categories.map((category) => (
        <MenuItem key={category.id} value={category.id}>
          <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: category.appColor, mr: 1.5, display: 'inline-block' }} />
          {category.name}
        </MenuItem>
      ))}
    </TextField>
  );
}
