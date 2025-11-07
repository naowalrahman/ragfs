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
  TextField,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Psychology as PsychologyIcon,
  Send as SendIcon,
  MinimizeOutlined as MinimizeIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { CommitSummary, CommitExplanation, CommitDetail, ChatMessage } from '@/types';
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
  const [showChat, setShowChat] = React.useState(false);
  const [chatMinimized, setChatMinimized] = React.useState(false);
  const [commitDetail, setCommitDetail] = React.useState<CommitDetail | null>(null);
  const [chatHistory, setChatHistory] = React.useState<ChatMessage[]>([]);
  const [userMessage, setUserMessage] = React.useState('');
  const [isLoadingDetail, setIsLoadingDetail] = React.useState(false);
  const [isLoadingChat, setIsLoadingChat] = React.useState(false);
  const [chatError, setChatError] = React.useState<string | null>(null);
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  // Scroll to bottom of chat when new messages arrive
  React.useEffect(() => {
    if (chatEndRef.current && !chatMinimized) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, chatMinimized]);

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

  const handleStartChat = async () => {
    if (showChat) {
      setShowChat(false);
      return;
    }

    // Load commit detail first if not loaded
    if (!commitDetail) {
      await loadCommitDetail();
    }

    // If no chat history, start with initial explanation
    if (chatHistory.length === 0) {
      setIsLoadingChat(true);
      setChatError(null);
      
      try {
        const response = await apiClient.chatAboutCommit(repoUrl, commit.sha, {
          message: "Please explain what this commit does.",
          conversation_history: []
        });
        
        setChatHistory(response.conversation_history);
        setShowChat(true);
        setChatMinimized(false);
      } catch (error: any) {
        setChatError(error.response?.data?.detail || error.message || 'Failed to start chat');
        console.error('Failed to start chat:', error);
      } finally {
        setIsLoadingChat(false);
      }
    } else {
      setShowChat(true);
      setChatMinimized(false);
    }
  };

  const handleSendMessage = async () => {
    if (!userMessage.trim() || isLoadingChat) return;

    const message = userMessage.trim();
    setUserMessage('');
    setIsLoadingChat(true);
    setChatError(null);

    try {
      const response = await apiClient.chatAboutCommit(repoUrl, commit.sha, {
        message,
        conversation_history: chatHistory
      });
      
      setChatHistory(response.conversation_history);
    } catch (error: any) {
      setChatError(error.response?.data?.detail || error.message || 'Failed to send message');
      console.error('Failed to send message:', error);
    } finally {
      setIsLoadingChat(false);
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
              startIcon={isLoadingChat ? <CircularProgress size={16} /> : <PsychologyIcon />}
              onClick={handleStartChat}
              disabled={isLoadingChat}
              variant={chatHistory.length > 0 ? 'outlined' : 'contained'}
              size="small"
            >
              {chatHistory.length > 0 ? (showChat ? 'Hide' : 'Show') : 'Chat with'} AI
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

        {/* AI Chat Interface */}
        <Collapse in={showChat}>
          <Divider sx={{ my: 2 }} />
          {chatError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {chatError}
            </Alert>
          )}
          <Paper 
            elevation={0} 
            sx={{ 
              backgroundColor: 'action.hover',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            {/* Chat Header */}
            <Box 
              sx={{ 
                p: 1.5, 
                backgroundColor: 'primary.main', 
                color: 'white',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <PsychologyIcon fontSize="small" />
                <Typography variant="subtitle2" fontWeight={600}>
                  AI Assistant - Commit {commit.sha.substring(0, 7)}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={0.5}>
                <IconButton 
                  size="small" 
                  onClick={() => setChatMinimized(!chatMinimized)}
                  sx={{ color: 'white' }}
                >
                  <MinimizeIcon fontSize="small" />
                </IconButton>
                <IconButton 
                  size="small" 
                  onClick={() => setShowChat(false)}
                  sx={{ color: 'white' }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Box>

            {/* Chat Messages */}
            <Collapse in={!chatMinimized}>
              <Box 
                sx={{ 
                  p: 2, 
                  maxHeight: '400px', 
                  overflowY: 'auto',
                  backgroundColor: 'background.paper'
                }}
              >
                {chatHistory.map((msg, idx) => (
                  <Box 
                    key={idx}
                    sx={{ 
                      mb: 2,
                      display: 'flex',
                      justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <Paper
                      elevation={1}
                      sx={{
                        p: 1.5,
                        maxWidth: '80%',
                        backgroundColor: msg.role === 'user' ? 'primary.light' : 'grey.100',
                        color: msg.role === 'user' ? 'primary.contrastText' : 'text.primary'
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                        {msg.role === 'user' ? 'You' : 'AI Assistant'}
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {msg.content}
                      </Typography>
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.7 }}>
                        {format(new Date(msg.timestamp), 'HH:mm')}
                      </Typography>
                    </Paper>
                  </Box>
                ))}
                {isLoadingChat && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size={24} />
                  </Box>
                )}
                <div ref={chatEndRef} />
              </Box>

              {/* Chat Input */}
              <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper' }}>
                <Stack direction="row" spacing={1}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Ask a question about this commit..."
                    value={userMessage}
                    onChange={(e) => setUserMessage(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    disabled={isLoadingChat}
                    multiline
                    maxRows={3}
                  />
                  <Button
                    variant="contained"
                    onClick={handleSendMessage}
                    disabled={!userMessage.trim() || isLoadingChat}
                    sx={{ minWidth: '60px' }}
                  >
                    <SendIcon />
                  </Button>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  Press Enter to send, Shift+Enter for new line
                </Typography>
              </Box>
            </Collapse>
          </Paper>
        </Collapse>
      </CardContent>
    </Card>
  );
}

export default function CommitList({ commits, repoUrl, isLoading = false }: CommitListProps) {
  const [selectedAuthor, setSelectedAuthor] = React.useState<string>('');

  // Get unique authors from commits
  const uniqueAuthors = React.useMemo(() => {
    const authors = new Set(commits.map(c => c.author));
    return Array.from(authors).sort();
  }, [commits]);

  // Filter commits by selected author
  const filteredCommits = React.useMemo(() => {
    if (!selectedAuthor) return commits;
    return commits.filter(c => c.author === selectedAuthor);
  }, [commits, selectedAuthor]);

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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h6" fontWeight={600}>
            Commits ({filteredCommits.length}{selectedAuthor ? ` of ${commits.length}` : ''})
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Click "Explain with AI" on any commit to get a detailed explanation of what the changes do.
          </Typography>
        </Box>
        
        {uniqueAuthors.length > 1 && (
          <Box sx={{ minWidth: 250 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Filter by Author
            </Typography>
            <select
              value={selectedAuthor}
              onChange={(e) => setSelectedAuthor(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid rgba(0, 0, 0, 0.23)',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
                backgroundColor: 'white',
                cursor: 'pointer',
              }}
            >
              <option value="">All Authors ({commits.length} commits)</option>
              {uniqueAuthors.map(author => {
                const count = commits.filter(c => c.author === author).length;
                return (
                  <option key={author} value={author}>
                    {author} ({count} {count === 1 ? 'commit' : 'commits'})
                  </option>
                );
              })}
            </select>
          </Box>
        )}
      </Box>

      {filteredCommits.length === 0 ? (
        <Alert severity="info">
          No commits found for author "{selectedAuthor}".
        </Alert>
      ) : (
        filteredCommits.map((commit) => (
          <CommitItem key={commit.sha} commit={commit} repoUrl={repoUrl} />
        ))
      )}
    </Box>
  );
}
