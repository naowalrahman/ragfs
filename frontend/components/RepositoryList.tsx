'use client';

import * as React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Stack,
  IconButton,
  Alert,
  Button,
} from '@mui/material';
import { Refresh as RefreshIcon, GitHub as GitHubIcon } from '@mui/icons-material';
import { Repository } from '@/types';
import { format } from 'date-fns';

interface RepositoryListProps {
  repositories: Repository[];
  onRefresh: () => void;
}

export default function RepositoryList({ repositories, onRefresh }: RepositoryListProps) {
  if (repositories.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Alert severity="info">
          No repositories ingested yet. Use the "Ingest Repository" tab to add your first repository.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6" fontWeight={600}>
          Ingested Repositories ({repositories.length})
        </Typography>
        <Button
          startIcon={<RefreshIcon />}
          onClick={onRefresh}
          variant="outlined"
          size="small"
        >
          Refresh
        </Button>
      </Box>

      <Stack spacing={2}>
        {repositories.map((repo, index) => (
          <Card key={index} elevation={1}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <GitHubIcon color="action" />
                    <Typography variant="h6" component="div">
                      {repo.repo_name}
                    </Typography>
                  </Stack>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {repo.repo_url}
                  </Typography>

                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Chip
                      label={`${repo.document_count} documents`}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                    <Chip
                      label={`Ingested ${format(new Date(repo.ingested_at), 'MMM d, yyyy')}`}
                      size="small"
                      variant="outlined"
                    />
                    {repo.last_commit_sha && (
                      <Chip
                        label={`Commit ${repo.last_commit_sha.substring(0, 7)}`}
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Stack>
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}

