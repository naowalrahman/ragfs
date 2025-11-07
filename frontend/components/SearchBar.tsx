'use client';

import * as React from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
}

export default function SearchBar({ onSearch, isLoading = false }: SearchBarProps) {
  const [query, setQuery] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        maxWidth: 800,
        mx: 'auto',
      }}
    >
      <TextField
        fullWidth
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for code, commits, issues, or pull requests..."
        variant="outlined"
        disabled={isLoading}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              {isLoading ? <CircularProgress size={20} /> : <SearchIcon />}
            </InputAdornment>
          ),
          sx: {
            backgroundColor: 'background.paper',
            '& fieldset': {
              borderWidth: 2,
            },
          },
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            fontSize: '1.1rem',
            py: 1,
          },
        }}
      />
    </Box>
  );
}

