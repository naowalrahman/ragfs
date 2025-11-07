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
  Collapse,
  CircularProgress,
  Alert,
  Paper,
  Divider,
  Button,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Psychology as PsychologyIcon,
} from '@mui/icons-material';
import { CommitSummary, CommitExplanation, CommitDetail } from '@/types';
import { apiClient } from '@/lib/api';
import { format } from 'date-fns';

interface CommitListProps {
  commits: CommitSummary[];
  repoUrl: string;
  isLoading?: boolean;
}

interface CommitItemProps {
  commit: CommitSummary;
  repoUrl: string;
}

function CommitItem({ commit, repoUrl }: CommitItemProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [showDiff, setShowDiff] = React.useState(false);
  const [commitDetail, setCommitDetail] = React.useState<CommitDetail | null>(null);
  const [explanation, setExplanation] = React.useState<CommitExplanation | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = React.useState(false);
  const [isLoadingExplanation, setIsLoadingExplanation] = React.useState(false);
  const [explanationError, setExplanationError] = React.useState<string | null>(null);

  const loadCommitDetail = async () => {
    if (commitDetail) return;
    
    setIsLoadingDetail(true);
    try {
      const detail = await apiClient.getCommitDetail(repoUrl, commit.sha);
      setCommitDetail(detail);
    } catch (error: any) {
      console.error('Failed to load commit detail:', error);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleExplainClick = async () => {
    if (explanation) {
      setExpanded(!expanded);
      return;
    }

    // Load commit detail first if not loaded
    if (!commitDetail) {
      await loadCommitDetail();
    }

    setIsLoadingExplanation(true);
    setExplanationError(null);

    try {
      const result = await apiClient.explainCommit(repoUrl, commit.sha);
      setExplanation(result);
      setExpanded(true);
    } catch (error: any) {
      setExplanationError(error.response?.data?.detail || error.message || 'Failed to generate explanation');
      console.error('Failed to explain commit:', error);
    } finally {
      setIsLoadingExplanation(false);
    }
  };

  const handleToggleDiff = async () => {
    if (!showDiff && !commitDetail) {
      await loadCommitDetail();
    }
    setShowDiff(!showDiff);
  };

  return (
    <Card elevation={1} sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
              {commit.message.split('\n')[0]}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
              <Chip 
                label={commit.sha.substring(0, 7)} 
                size="small" 
                variant="outlined" 
                color="primary"
              />
              <Chip
                label={`👤 ${commit.author}`}
                size="small"
                variant="outlined"
              />
              {commit.author_email && (
                <Typography variant="caption" color="text.secondary">
                  {commit.author_email}
                </Typography>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {format(new Date(commit.date), 'MMM d, yyyy HH:mm')}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              startIcon={isLoadingDetail ? <CircularProgress size={16} /> : null}
              onClick={handleToggleDiff}
              disabled={isLoadingDetail}
              variant="outlined"
              size="small"
            >
              {showDiff ? 'Hide' : 'Show'} Code Changes
            </Button>
            <Button
              startIcon={isLoadingExplanation ? <CircularProgress size={16} /> : <PsychologyIcon />}
              onClick={handleExplainClick}
              disabled={isLoadingExplanation}
              variant={explanation ? 'outlined' : 'contained'}
              size="small"
            >
              {explanation ? (expanded ? 'Hide' : 'Show') : 'Explain'} with AI
            </Button>
          </Stack>
        </Box>

        {/* Full commit message if multiline */}
        {commit.message.split('\n').length > 1 && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 1,
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
            }}
          >
            {commit.message}
          </Typography>
        )}

        {/* Code Diff Display */}
        <Collapse in={showDiff}>
          <Divider sx={{ my: 2 }} />
          {isLoadingDetail && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {commitDetail && (
            <Paper elevation={0} sx={{ p: 2, backgroundColor: 'action.hover' }}>
              <Typography variant="overline" color="primary" fontWeight={600}>
                Files Changed ({commitDetail.files_changed.length})
              </Typography>
              {commitDetail.files_changed.slice(0, 5).map((file, idx) => (
                <Box key={idx} sx={{ mt: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="body2" fontWeight={600} fontFamily="monospace">
                      {file.filename}
                    </Typography>
                    <Chip label={`+${file.additions} -${file.deletions}`} size="small" />
                  </Stack>
                  {file.patch && (
                    <Box
                      sx={{
                        backgroundColor: 'background.paper',
                        p: 1,
                        borderRadius: 1,
                        overflow: 'auto',
                        maxHeight: '300px',
                      }}
                    >
                      <Typography
                        variant="body2"
                        component="pre"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          m: 0,
                        }}
                      >
                        {file.patch}
                      </Typography>
                    </Box>
                  )}
                </Box>
              ))}
              {commitDetail.files_changed.length > 5 && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                  ... and {commitDetail.files_changed.length - 5} more files
                </Typography>
              )}
            </Paper>
          )}
        </Collapse>

        {/* Explanation */}
        <Collapse in={expanded}>
          <Divider sx={{ my: 2 }} />
          {explanationError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {explanationError}
            </Alert>
          )}
          {explanation && (
            <Paper elevation={0} sx={{ p: 2, backgroundColor: 'action.hover' }}>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="overline" color="primary" fontWeight={600}>
                    Summary
                  </Typography>
                  <Typography variant="body2">{explanation.summary}</Typography>
                </Box>

                <Box>
                  <Typography variant="overline" color="primary" fontWeight={600}>
                    What Changed
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {explanation.what_changed}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="overline" color="primary" fontWeight={600}>
                    Why Important
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {explanation.why_important}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="overline" color="primary" fontWeight={600}>
                    Technical Details
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {explanation.technical_details}
                  </Typography>
                </Box>

                {explanation.business_impact && (
                  <Box>
                    <Typography variant="overline" color="primary" fontWeight={600}>
                      Business Impact
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {explanation.business_impact}
                    </Typography>
                  </Box>
                )}

                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  Generated on {format(new Date(explanation.generated_at), 'MMM d, yyyy HH:mm')}
                </Typography>
              </Stack>
            </Paper>
          )}
        </Collapse>
      </CardContent>
    </Card>
  );
}

export default function CommitList({ commits, repoUrl, isLoading = false }: CommitListProps) {
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (commits.length === 0) {
    return (
      <Alert severity="info">
        No commits found for this branch.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom fontWeight={600}>
        Commits ({commits.length})
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Click "Explain with AI" on any commit to get a detailed explanation of what the changes do.
      </Typography>

      {commits.map((commit) => (
        <CommitItem key={commit.sha} commit={commit} repoUrl={repoUrl} />
      ))}
    </Box>
  );
}
