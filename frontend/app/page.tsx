'use client';

import * as React from 'react';
import {
  Box,
  Typography,
  Paper,
  Alert,
  Divider,
  Stack,
  CircularProgress,
} from '@mui/material';
import IngestionForm from '@/components/IngestionForm';
import BranchSelector from '@/components/BranchSelector';
import CommitList from '@/components/CommitList';
import { Branch, CommitSummary } from '@/types';
import { apiClient } from '@/lib/api';

export default function HomePage() {
  // State for ingested repository
  const [ingestedRepoUrl, setIngestedRepoUrl] = React.useState<string | null>(null);
  const [ingestedRepoName, setIngestedRepoName] = React.useState<string | null>(null);
  
  // Branch and commit state
  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = React.useState<string | null>(null);
  const [commits, setCommits] = React.useState<CommitSummary[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = React.useState(false);
  const [isLoadingCommits, setIsLoadingCommits] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleIngestionSuccess = async (repoUrl: string, repoName: string) => {
    console.log('handleIngestionSuccess called with:', { repoUrl, repoName });
    setIngestedRepoUrl(repoUrl);
    setIngestedRepoName(repoName);
    setError(null);
    setIsLoadingBranches(true);

    try {
      console.log('Loading branches for:', repoUrl);
      // Load branches for the ingested repository
      const response = await apiClient.listBranches(repoUrl);
      console.log('Branches loaded:', response.branches.length);
      setBranches(response.branches);
      
      // Auto-select default branch if available
      const defaultBranch = response.branches.find(b => b.is_default);
      console.log('Default branch:', defaultBranch?.name);
      if (defaultBranch) {
        await handleSelectBranch(repoUrl, defaultBranch.name);
      }
    } catch (err: any) {
      console.error('Failed to load branches:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to load branches');
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const handleSelectBranch = async (repoUrl: string, branchName: string) => {
    console.log('handleSelectBranch called with:', { repoUrl, branchName });
    setSelectedBranch(branchName);
    setCommits([]);
    setError(null);
    setIsLoadingCommits(true);

    try {
      console.log('Loading commits for branch:', branchName);
      const response = await apiClient.listCommits(repoUrl, branchName);
      console.log('Commits loaded:', response.commits.length);
      setCommits(response.commits);
    } catch (err: any) {
      console.error('Failed to load commits:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to load commits');
    } finally {
      setIsLoadingCommits(false);
    }
  };

  return (
    <Box>
      {/* Hero Section */}
      <Box sx={{ mb: 6, textAlign: 'center' }}>
        <Typography variant="h3" component="h1" gutterBottom fontWeight={700}>
          AI-Powered Commit Analysis
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
          Understand what your code changes actually do with Claude AI
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Ingest a repository, and instantly analyze commits with intelligent explanations
        </Typography>
      </Box>

      {/* Ingestion Form */}
      <Paper elevation={2} sx={{ p: 4, mb: 4 }}>
        <IngestionForm onSuccess={handleIngestionSuccess} />
      </Paper>

      {/* Commit Analysis Section - Shows after successful ingestion */}
      {ingestedRepoUrl && (
        <>
          <Divider sx={{ my: 4 }} />
          
          <Box sx={{ mb: 4 }}>
            <Typography variant="h5" gutterBottom fontWeight={600}>
              Analyze Commits
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Repository: <strong>{ingestedRepoName}</strong>
            </Typography>

            {/* Branch Selector */}
            {isLoadingBranches && (
              <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
                <Stack spacing={2} alignItems="center">
                  <CircularProgress />
                  <Typography variant="body2" color="text.secondary">
                    Loading branches...
                  </Typography>
                </Stack>
              </Box>
            )}
            
            {!isLoadingBranches && branches.length > 0 && (
              <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom fontWeight={600}>
                  Select Branch
                </Typography>
                <BranchSelector
                  branches={branches}
                  selectedBranch={selectedBranch}
                  onSelectBranch={(branch) => handleSelectBranch(ingestedRepoUrl, branch)}
                  isLoading={isLoadingBranches}
                />
              </Paper>
            )}

            {/* Error Display */}
            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}

            {/* Commits List */}
            {selectedBranch && (
              <Paper elevation={1} sx={{ p: 3 }}>
                <CommitList
                  commits={commits}
                  repoUrl={ingestedRepoUrl}
                  isLoading={isLoadingCommits}
                />
              </Paper>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}

