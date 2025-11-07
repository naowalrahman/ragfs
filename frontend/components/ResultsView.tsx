'use client';

import * as React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Stack,
  Divider,
  Link,
  Alert,
} from '@mui/material';
import {
  Code as CodeIcon,
  Commit as CommitIcon,
  BugReport as IssueIcon,
  MergeType as PrIcon,
} from '@mui/icons-material';
import { QueryResponse, DocumentType } from '@/types';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ResultsViewProps {
  results: QueryResponse;
}

const getDocumentIcon = (type: string) => {
  switch (type) {
    case DocumentType.CODE:
      return <CodeIcon />;
    case DocumentType.COMMIT:
      return <CommitIcon />;
    case DocumentType.ISSUE:
      return <IssueIcon />;
    case DocumentType.PULL_REQUEST:
      return <PrIcon />;
    default:
      return <CodeIcon />;
  }
};

const getDocumentColor = (type: string) => {
  switch (type) {
    case DocumentType.CODE:
      return 'primary';
    case DocumentType.COMMIT:
      return 'secondary';
    case DocumentType.ISSUE:
      return 'error';
    case DocumentType.PULL_REQUEST:
      return 'success';
    default:
      return 'default';
  }
};

export default function ResultsView({ results }: ResultsViewProps) {
  if (results.total_results === 0) {
    return (
      <Alert severity="info">
        No results found for "{results.query}". Try a different search query.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom fontWeight={600}>
        Search Results
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Found {results.total_results} result{results.total_results !== 1 ? 's' : ''} for "{results.query}"
      </Typography>

      <Stack spacing={2}>
        {results.results.map((result, index) => (
          <Card key={index} elevation={1}>
            <CardContent>
              {/* Header */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    icon={getDocumentIcon(result.document_type)}
                    label={result.document_type.replace('_', ' ').toUpperCase()}
                    color={getDocumentColor(result.document_type) as any}
                    size="small"
                  />
                  {result.source_location && (
                    <Typography variant="caption" color="text.secondary">
                      {result.source_location}
                    </Typography>
                  )}
                </Stack>
                <Chip
                  label={`${(result.score * 100).toFixed(0)}% match`}
                  size="small"
                  variant="outlined"
                />
              </Box>

              {/* Metadata */}
              {result.metadata && (
                <Box sx={{ mb: 2 }}>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {result.metadata.repo_name && (
                      <Chip
                        label={result.metadata.repo_name}
                        size="small"
                        variant="outlined"
                      />
                    )}
                    {result.metadata.file_path && (
                      <Chip
                        label={result.metadata.file_path}
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Stack>
                </Box>
              )}

              <Divider sx={{ my: 2 }} />

              {/* Content */}
              {result.document_type === DocumentType.CODE ? (
                <Box
                  sx={{
                    maxHeight: 400,
                    overflow: 'auto',
                    borderRadius: 1,
                    '& pre': {
                      margin: 0,
                      fontSize: '0.85rem',
                    },
                  }}
                >
                  <SyntaxHighlighter
                    language={result.metadata.file_extension?.substring(1) || 'text'}
                    style={vscDarkPlus}
                    showLineNumbers
                    customStyle={{
                      margin: 0,
                      borderRadius: 4,
                    }}
                  >
                    {result.content}
                  </SyntaxHighlighter>
                </Box>
              ) : (
                <Typography
                  variant="body2"
                  component="pre"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    fontFamily: 'monospace',
                    backgroundColor: 'action.hover',
                    p: 2,
                    borderRadius: 1,
                    maxHeight: 400,
                    overflow: 'auto',
                  }}
                >
                  {result.content}
                </Typography>
              )}

              {/* Repository Link */}
              {result.metadata.repo_url && (
                <Box sx={{ mt: 2 }}>
                  <Link
                    href={result.metadata.repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="caption"
                  >
                    View in GitHub →
                  </Link>
                </Box>
              )}
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}

