'use client';

import * as React from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  Alert,
} from '@mui/material';
import {
  Send as SendIcon,
  AutoAwesome as AiIcon,
  Person as PersonIcon,
  ExpandMore as ExpandMoreIcon,
  Code as CodeIcon,
  Commit as CommitIcon,
  BugReport as IssueIcon,
  MergeType as PrIcon,
  Source as SourceIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
} from '@mui/icons-material';
import { DocumentType } from '@/types';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: any[];
  timestamp: Date;
  isStreaming?: boolean;
}

interface ChatViewProps {
  onSendMessage: (message: string) => void;
  messages: Message[];
  isLoading: boolean;
}

// Helper function to format content for display
const formatContent = (content: string): string => {
  if (!content) return '';
  
  try {
    if (content.startsWith('{') || content.startsWith('[')) {
      const parsed = JSON.parse(content);
      if (typeof parsed === 'string') {
        content = parsed;
      }
    }
  } catch {
    // Not JSON, continue
  }
  
  content = content.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  content = content.replace(/\\n/g, '\n');
  content = content.replace(/\\t/g, '\t');
  content = content.replace(/\\r/g, '\r');
  content = content.replace(/\\"/g, '"');
  content = content.replace(/\\'/g, "'");
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

export default function ChatView({ onSendMessage, messages, isLoading }: ChatViewProps) {
  const [input, setInput] = React.useState('');
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Handle escape key to exit fullscreen
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isFullscreen]);

  return (
    <Box 
      sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: isFullscreen ? '100vh' : '70vh', 
        maxHeight: isFullscreen ? '100vh' : '800px',
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? 0 : 'auto',
        left: isFullscreen ? 0 : 'auto',
        right: isFullscreen ? 0 : 'auto',
        bottom: isFullscreen ? 0 : 'auto',
        zIndex: isFullscreen ? 1300 : 'auto',
        backgroundColor: isFullscreen ? 'background.default' : 'transparent',
        transition: 'all 0.3s ease-in-out',
      }}
    >
      {/* Fullscreen Toggle Button */}
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          mb: 1,
          px: isFullscreen ? 2 : 0,
          pt: isFullscreen ? 2 : 0,
        }}
      >
        <IconButton
          onClick={toggleFullscreen}
          size="small"
          sx={{
            backgroundColor: 'action.hover',
            '&:hover': {
              backgroundColor: 'action.selected',
            },
          }}
        >
          {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
        </IconButton>
      </Box>

      {/* Messages Area */}
      <Paper
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 3,
          mb: 2,
          backgroundColor: 'background.default',
        }}
      >
        {messages.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <AiIcon sx={{ fontSize: 64, color: 'text.secondary', opacity: 0.3 }} />
            <Typography variant="h6" color="text.secondary">
              Start a conversation about your codebase
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Ask questions like "How does authentication work?" or "Explain the database schema"
            </Typography>
          </Box>
        ) : (
          <Stack spacing={3}>
            {messages.map((message) => (
              <Box key={message.id}>
                {message.role === 'user' ? (
                  <Paper
                    sx={{
                      p: 2,
                      backgroundColor: 'primary.main',
                      color: 'primary.contrastText',
                      maxWidth: '50%',
                      ml: 'auto',
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <PersonIcon fontSize="small" />
                      <Typography variant="body2" fontWeight={600}>
                        You
                      </Typography>
                    </Stack>
                    <Typography variant="body1">{message.content}</Typography>
                  </Paper>
                ) : (
                  <Box sx={{ maxWidth: '90%' }}>
                    <Paper
                      sx={{
                        p: 2,
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        <AiIcon fontSize="small" />
                        {message.isStreaming && (
                          <CircularProgress size={16} sx={{ color: 'white' }} />
                        )}
                      </Stack>
                      <Box
                        sx={{
                          backgroundColor: 'rgba(255,255,255,0.95)',
                          color: 'text.primary',
                          p: 2,
                          borderRadius: 1,
                          '& p': { mb: 1 },
                          '& p:last-child': { mb: 0 },
                          '& pre': {
                            backgroundColor: 'rgba(0,0,0,0.05)',
                            p: 1,
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
                        <ReactMarkdown>{message.content || ' '}</ReactMarkdown>
                      </Box>
                    </Paper>

                    {/* Sources */}
                    {message.sources && message.sources.length > 0 && (
                      <Box sx={{ mt: 2 }}>
                        <Accordion defaultExpanded={false}>
                          <AccordionSummary 
                            expandIcon={<ExpandMoreIcon />}
                            sx={{
                              backgroundColor: 'action.hover',
                              borderRadius: 1,
                              '&:hover': {
                                backgroundColor: 'action.selected',
                              },
                            }}
                          >
                            <Stack direction="row" spacing={1} alignItems="center">
                              <SourceIcon fontSize="small" color="action" />
                              <Typography variant="body2" fontWeight={600}>
                                View Sources
                              </Typography>
                              <Chip
                                label={message.sources.length}
                                size="small"
                                color="primary"
                                sx={{ height: 20 }}
                              />
                            </Stack>
                          </AccordionSummary>
                          <AccordionDetails sx={{ pt: 2 }}>
                            <Stack spacing={1}>
                              {message.sources.map((source, index) => (
                                <Accordion key={index}>
                                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                                      <Chip
                                        icon={getDocumentIcon(source.document_type)}
                                        label={source.document_type === 'unknown' ? 'DOCUMENT' : source.document_type.replace('_', ' ').toUpperCase()}
                                        color={source.document_type === 'unknown' ? 'default' : getDocumentColor(source.document_type) as any}
                                        size="small"
                                      />
                                      {source.source_location && source.source_location !== 'unknown' && (
                                        <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {source.source_location}
                                        </Typography>
                                      )}
                                      <Chip
                                        label={`${(source.score * 100).toFixed(0)}%`}
                                        size="small"
                                        variant="outlined"
                                        sx={{ ml: 'auto' }}
                                      />
                                    </Box>
                                  </AccordionSummary>
                                  <AccordionDetails>
                                    {source.document_type === DocumentType.CODE ? (
                                      <Box
                                        sx={{
                                          maxHeight: 300,
                                          overflow: 'auto',
                                          borderRadius: 1,
                                          '& pre': {
                                            margin: 0,
                                            fontSize: '0.75rem',
                                          },
                                        }}
                                      >
                                        <SyntaxHighlighter
                                          language={source.metadata?.file_extension?.substring(1) || 'text'}
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
                                          p: 1.5,
                                          borderRadius: 1,
                                          maxHeight: 300,
                                          overflow: 'auto',
                                          fontSize: '0.75rem',
                                        }}
                                      >
                                        {formatContent(source.content)}
                                      </Typography>
                                    )}
                                  </AccordionDetails>
                                </Accordion>
                              ))}
                            </Stack>
                          </AccordionDetails>
                        </Accordion>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            ))}
            <div ref={messagesEndRef} />
          </Stack>
        )}
      </Paper>

      {/* Input Area */}
      <Paper 
        component="form" 
        onSubmit={handleSubmit} 
        sx={{ 
          p: 2,
          mx: isFullscreen ? 2 : 0,
          mb: isFullscreen ? 2 : 0,
        }}
      >
        <TextField
          fullWidth
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your codebase..."
          disabled={isLoading}
          variant="outlined"
          multiline
          maxRows={4}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  color="primary"
                  sx={{ 
                    '&:hover': { 
                      backgroundColor: 'primary.main',
                      color: 'primary.contrastText',
                    } 
                  }}
                >
                  {isLoading ? <CircularProgress size={24} /> : <SendIcon />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </Paper>
    </Box>
  );
}

