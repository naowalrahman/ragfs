'use client';

import * as React from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Chip,
  Stack,
} from '@mui/material';
import { Branch } from '@/types';

interface BranchSelectorProps {
  branches: Branch[];
  selectedBranch: string | null;
  onSelectBranch: (branch: string) => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function BranchSelector({
  branches,
  selectedBranch,
  onSelectBranch,
  isLoading = false,
  error = null,
}: BranchSelectorProps) {
  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <CircularProgress size={20} />
        <span>Loading branches...</span>
      </Box>
    );
  }

  if (branches.length === 0) {
    return (
      <Alert severity="info" sx={{ mb: 2 }}>
        No branches found for this repository.
      </Alert>
    );
  }

  return (
    <Box sx={{ mb: 3 }}>
      <FormControl fullWidth>
        <InputLabel id="branch-select-label">Select Branch</InputLabel>
        <Select
          labelId="branch-select-label"
          id="branch-select"
          value={selectedBranch || ''}
          label="Select Branch"
          onChange={(e) => onSelectBranch(e.target.value)}
        >
          {branches.map((branch) => (
            <MenuItem key={branch.name} value={branch.name}>
              <Stack direction="row" spacing={1} alignItems="center">
                <span>{branch.name}</span>
                {branch.is_default && (
                  <Chip label="default" size="small" color="primary" />
                )}
              </Stack>
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
}
