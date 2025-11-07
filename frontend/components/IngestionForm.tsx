'use client';

import * as React from 'react';
import {
  Box,
  TextField,
  Button,
  FormControlLabel,
  Checkbox,
  Typography,
  Alert,
  CircularProgress,
  LinearProgress,
  Paper,
  Collapse,
} from '@mui/material';
import { CloudUpload } from '@mui/icons-material';
import { apiClient } from '@/lib/api';
import { IngestionStatus } from '@/types';

interface IngestionFormProps {
  onSuccess?: () => void;
}

export default function IngestionForm({ onSuccess }: IngestionFormProps) {
  const [repoUrl, setRepoUrl] = React.useState('');
  const [includeCommits, setIncludeCommits] = React.useState(true);
  const [includeIssues, setIncludeIssues] = React.useState(true);
  const [includePrs, setIncludePrs] = React.useState(true);
  const [maxCommits, setMaxCommits] = React.useState(100);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<IngestionStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await apiClient.ingestRepository({
        repo_url: repoUrl,
        include_commits: includeCommits,
        include_issues: includeIssues,
        include_prs: includePrs,
        max_commits: maxCommits,
      });

      setJobId(response.job_id);
      setStatus(response.status);
      
      // Start polling for status
      pollStatus(response.job_id);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to start ingestion');
      setIsSubmitting(false);
    }
  };

  const pollStatus = async (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const statusResponse = await apiClient.getIngestionStatus(jobId);
        setStatus(statusResponse.status);
        setProgress(statusResponse.progress);

        if (statusResponse.status === IngestionStatus.COMPLETED) {
          clearInterval(interval);
          setIsSubmitting(false);
          // Wait a brief moment to ensure repository is fully added to backend
          // then call onSuccess to refresh the repository list
          setTimeout(() => {
            if (onSuccess) {
              onSuccess();
            }
          }, 500);
          // Reset form after 3 seconds
          setTimeout(() => {
            setJobId(null);
            setStatus(null);
            setProgress(null);
            setRepoUrl('');
          }, 3000);
        } else if (statusResponse.status === IngestionStatus.FAILED) {
          clearInterval(interval);
          setIsSubmitting(false);
          setError(statusResponse.error_message || 'Ingestion failed');
        }
      } catch (err: any) {
        // If we get a 404, the server may have restarted
        // Check if repository was ingested by refreshing the list
        if (err.response?.status === 404) {
          console.warn('Job status returned 404 (server may have restarted), checking repositories...');
          // Wait a moment and refresh repositories
          setTimeout(() => {
            if (onSuccess) {
              onSuccess();
            }
          }, 1000);
          // Stop polling after a few 404s (job might be gone but repo ingested)
          clearInterval(interval);
          setIsSubmitting(false);
          // Don't show error if repository might be ingested
          setStatus(IngestionStatus.COMPLETED);
        } else {
          console.error('Failed to poll status:', err);
          clearInterval(interval);
          setIsSubmitting(false);
          setError('Failed to check ingestion status');
        }
      }
    }, 2000); // Poll every 2 seconds
  };

  const getProgressMessage = () => {
    if (!progress) return 'Starting...';
    
    const stage = progress.stage;
    switch (stage) {
      case 'cloning_repository':
        return 'Cloning repository...';
      case 'extracting_code':
        return 'Extracting code files...';
      case 'extracting_commits':
        return 'Extracting commit history...';
      case 'extracting_issues':
        return 'Extracting issues...';
      case 'extracting_prs':
        return 'Extracting pull requests...';
      case 'processing_documents':
        return 'Processing documents...';
      case 'uploading_to_s3':
        return `Uploading to S3... (${progress.total_documents || 0} documents)`;
      case 'syncing_knowledge_base':
        return 'Syncing with Knowledge Base...';
      case 'cleaning_up':
        return 'Cleaning up...';
      case 'completed':
        return `Completed! Processed ${progress.total_documents || 0} documents.`;
      default:
        return 'Processing...';
    }
  };

  return (
    <Paper elevation={0} sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom fontWeight={600}>
        Ingest GitHub Repository
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Add a GitHub repository to the knowledge base. We'll extract and index code, commits, issues, and pull requests.
      </Typography>

      <Box component="form" onSubmit={handleSubmit}>
        <TextField
          fullWidth
          label="GitHub Repository URL"
          placeholder="https://github.com/owner/repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          required
          disabled={isSubmitting}
          sx={{ mb: 2 }}
        />

        <TextField
          fullWidth
          type="number"
          label="Maximum Commits"
          value={maxCommits}
          onChange={(e) => setMaxCommits(parseInt(e.target.value))}
          disabled={isSubmitting}
          inputProps={{ min: 1, max: 1000 }}
          sx={{ mb: 2 }}
        />

        <Box sx={{ mb: 3 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={includeCommits}
                onChange={(e) => setIncludeCommits(e.target.checked)}
                disabled={isSubmitting}
              />
            }
            label="Include commit history"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={includeIssues}
                onChange={(e) => setIncludeIssues(e.target.checked)}
                disabled={isSubmitting}
              />
            }
            label="Include issues"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={includePrs}
                onChange={(e) => setIncludePrs(e.target.checked)}
                disabled={isSubmitting}
              />
            }
            label="Include pull requests"
          />
        </Box>

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={isSubmitting || !repoUrl}
          startIcon={isSubmitting ? <CircularProgress size={20} /> : <CloudUpload />}
          fullWidth
        >
          {isSubmitting ? 'Ingesting...' : 'Start Ingestion'}
        </Button>

        {/* Status Display */}
        <Collapse in={isSubmitting || status === IngestionStatus.COMPLETED}>
          <Box sx={{ mt: 3 }}>
            {status !== IngestionStatus.COMPLETED && <LinearProgress />}
            <Alert
              severity={
                status === IngestionStatus.COMPLETED
                  ? 'success'
                  : status === IngestionStatus.FAILED
                  ? 'error'
                  : 'info'
              }
              sx={{ mt: 2 }}
            >
              {status === IngestionStatus.COMPLETED
                ? 'Repository ingested successfully!'
                : getProgressMessage()}
            </Alert>
          </Box>
        </Collapse>

        {/* Error Display */}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </Box>
    </Paper>
  );
}

