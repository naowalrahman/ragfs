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
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Code as CodeIcon,
  Commit as CommitIcon,
  BugReport as IssueIcon,
  MergeType as PrIcon,
  AutoAwesome as AiIcon,
  ExpandMore as ExpandMoreIcon,
  Source as SourceIcon,
} from '@mui/icons-material';
import { QueryResponse, DocumentType } from '@/types';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';

interface ResultsViewProps {
  results: QueryResponse;
}

// Helper function to format content for display
const formatContent = (content: string): string => {
  if (!content) return '';
  
  try {
    // Try to parse as JSON in case it's JSON-encoded
    if (content.startsWith('{') || content.startsWith('[')) {
      const parsed = JSON.parse(content);
      if (typeof parsed === 'string') {
        content = parsed;
      }
    }
  } catch {
    // Not JSON, continue with original content
  }
  
  // Replace Unicode escape sequences (e.g., \u251c -> ├)
  content = content.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  
  // Replace literal \n with actual newlines
  content = content.replace(/\\n/g, '\n');
  
  // Replace literal \t with actual tabs
  content = content.replace(/\\t/g, '\t');
  
  // Replace literal \r with carriage return
  content = content.replace(/\\r/g, '\r');
  
  // Replace literal \" with actual quotes
  content = content.replace(/\\"/g, '"');
  
  // Replace literal \' with actual single quotes
  content = content.replace(/\\'/g, "'");
  
  // Replace literal \\ with single backslash (do this last)
  content = content.replace(/\\\\/g, '\\');
  
  return content;
};

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
  if (results.total_sources === 0) {
    return (
      <Alert severity="info">
        No results found for "{results.query}". Try a different search query or ensure repositories have been ingested.
      </Alert>
    );
  }

  return (
    <Box>
      {/* AI-Generated Answer Section */}
      <Paper
        elevation={3}
        sx={{
          p: 3,
          mb: 4,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <AiIcon />
          <Typography variant="h5" fontWeight={700}>
            AI Answer
          </Typography>
          <Chip
            label="Claude Sonnet 4"
            size="small"
            sx={{
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: 'white',
              fontWeight: 600,
            }}
          />
        </Stack>
        
        <Typography variant="body2" sx={{ mb: 2, opacity: 0.9 }}>
          Based on {results.total_sources} source{results.total_sources !== 1 ? 's' : ''} from your knowledge base
        </Typography>

        <Box
          sx={{
            backgroundColor: 'rgba(255,255,255,0.95)',
            color: 'text.primary',
            p: 3,
            borderRadius: 2,
            '& p': { mb: 2 },
            '& pre': {
              backgroundColor: 'rgba(0,0,0,0.05)',
              p: 2,
              borderRadius: 1,
              overflow: 'auto',
            },
            '& code': {
              backgroundColor: 'rgba(0,0,0,0.05)',
              px: 0.5,
              borderRadius: 0.5,
              fontFamily: 'monospace',
            },
          }}
        >
          <ReactMarkdown>{results.answer}</ReactMarkdown>
        </Box>
      </Paper>

      {/* Source Documents Section */}
      <Box sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <SourceIcon color="action" />
          <Typography variant="h6" fontWeight={600}>
            Source Documents
          </Typography>
          <Chip
            label={`${results.total_sources} source${results.total_sources !== 1 ? 's' : ''}`}
            size="small"
            variant="outlined"
          />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Documents retrieved from the knowledge base to generate the answer above
        </Typography>
      </Box>

      <Stack spacing={2}>
        {results.sources.map((source, index) => (
          <Accordion key={index} defaultExpanded={index === 0}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
                <Chip
                  icon={getDocumentIcon(source.document_type)}
                  label={source.document_type.replace('_', ' ').toUpperCase()}
                  color={getDocumentColor(source.document_type) as any}
                  size="small"
                />
                {source.source_location && (
                  <Typography variant="body2" color="text.secondary">
                    {source.source_location}
                  </Typography>
                )}
                <Box sx={{ flexGrow: 1 }} />
                <Chip
                  label={`${(source.score * 100).toFixed(0)}% relevance`}
                  size="small"
                  variant="outlined"
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {/* Metadata */}
              {source.metadata && (
                <Box sx={{ mb: 2 }}>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {source.metadata.repo_name && (
                      <Chip
                        label={source.metadata.repo_name}
                        size="small"
                        variant="outlined"
                      />
                    )}
                    {source.metadata.file_path && (
                      <Chip
                        label={source.metadata.file_path}
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Stack>
                </Box>
              )}

              <Divider sx={{ my: 2 }} />

              {/* Content */}
              {source.document_type === DocumentType.CODE ? (
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
                    language={source.metadata.file_extension?.substring(1) || 'text'}
                    style={vscDarkPlus}
                    showLineNumbers
                    customStyle={{
                      margin: 0,
                      borderRadius: 4,
                    }}
                  >
                    {formatContent(source.content)}
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
                  {formatContent(source.content)}
                </Typography>
              )}

              {/* Repository Link */}
              {source.metadata.repo_url && (
                <Box sx={{ mt: 2 }}>
                  <Link
                    href={source.metadata.repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="caption"
                  >
                    View in GitHub →
                  </Link>
                </Box>
              )}
            </AccordionDetails>
          </Accordion>
        ))}
      </Stack>
    </Box>
  );
}

