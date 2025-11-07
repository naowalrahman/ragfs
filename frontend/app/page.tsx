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
  Tabs,
  Tab,
} from '@mui/material';
import IngestionForm from '@/components/IngestionForm';
import ChatView from '@/components/ChatView';
import RepositoryList from '@/components/RepositoryList';
import BranchSelector from '@/components/BranchSelector';
import CommitList from '@/components/CommitList';
import { Repository, Branch, CommitSummary } from '@/types';
import { apiClient } from '@/lib/api';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: any[];
  timestamp: Date;
  isStreaming?: boolean;
}

export default function HomePage() {
  const [mainTabValue, setMainTabValue] = React.useState(0);
  const [repositoryTabValue, setRepositoryTabValue] = React.useState(0);
  
  // Shared repository state
  const [currentRepoUrl, setCurrentRepoUrl] = React.useState<string | null>(null);
  const [currentRepoName, setCurrentRepoName] = React.useState<string | null>(null);
  const [repositories, setRepositories] = React.useState<Repository[]>([]);
  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = React.useState<string | null>(null);
  const [commits, setCommits] = React.useState<CommitSummary[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = React.useState(false);
  const [isLoadingCommits, setIsLoadingCommits] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  
  // Chat state
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleMainTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setMainTabValue(newValue);
  };

  const handleRepositoryTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setRepositoryTabValue(newValue);
  };

  const loadRepositories = React.useCallback(async () => {
    try {
      const response = await apiClient.listRepositories();
      setRepositories(response.repositories);
    } catch (error) {
      console.error('Failed to load repositories:', error);
    }
  }, []);

  React.useEffect(() => {
    loadRepositories();
  }, [loadRepositories]);

  const handleSendMessage = async (content: string) => {
    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Create assistant message placeholder
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      sources: [],
      timestamp: new Date(),
      isStreaming: true,
    };
    
    setMessages(prev => [...prev, assistantMessage]);

    try {
      let sources: any[] = [];
      let fullText = '';

      await apiClient.queryStream(
        { query: content, max_results: 10 },
        (event) => {
          if (event.type === 'sources') {
            // Store sources
            sources = event.sources || [];
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, sources }
                  : msg
              )
            );
          } else if (event.type === 'text') {
            // Append text chunk
            fullText += event.text || '';
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, content: fullText }
                  : msg
              )
            );
          } else if (event.type === 'done') {
            // Mark as not streaming
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, isStreaming: false }
                  : msg
              )
            );
          } else if (event.type === 'error') {
            // Handle error
            console.error('Streaming error:', event.error);
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMessageId
                  ? {
                      ...msg,
                      content: `Error: ${event.error}`,
                      isStreaming: false,
                    }
                  : msg
              )
            );
          }
        }
      );
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: 'Sorry, I encountered an error processing your request.',
                isStreaming: false,
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleIngestionSuccess = async (repoUrl: string, repoName: string) => {
    console.log('handleIngestionSuccess called with:', { repoUrl, repoName });
    setCurrentRepoUrl(repoUrl);
    setCurrentRepoName(repoName);
    setError(null);
    setIsLoadingBranches(true);

    // Also refresh the repositories list
    await loadRepositories();

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
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Typography variant="h3" component="h1" gutterBottom fontWeight={700}>
          AI-Powered Code Analysis
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
          Chat with your codebase and analyze commits with Claude AI
        </Typography>
        <Typography variant="body2" color="text.secondary">
          First ingest a repository, then choose your analysis method below
        </Typography>
      </Box>

      {/* Repository Management Section */}
      <Paper elevation={2} sx={{ p: 4, mb: 4, borderRadius: 2 }}>
        <Typography variant="h5" gutterBottom fontWeight={600}>
          Repository Setup
        </Typography>
        
        <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden', mb: 3 }}>
          <Tabs
            value={repositoryTabValue}
            onChange={handleRepositoryTabChange}
            aria-label="repository tabs"
            sx={{
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Tab label="Ingest New Repository" id="repo-tab-0" aria-controls="repo-tabpanel-0" />
            <Tab label="Existing Repositories" id="repo-tab-1" aria-controls="repo-tabpanel-1" />
          </Tabs>

          <TabPanel value={repositoryTabValue} index={0}>
            <IngestionForm onSuccess={handleIngestionSuccess} />
          </TabPanel>

          <TabPanel value={repositoryTabValue} index={1}>
            <RepositoryList 
              repositories={repositories} 
              onRefresh={loadRepositories}
              onSelectRepository={(repo) => {
                setCurrentRepoUrl(repo.repo_url);
                setCurrentRepoName(repo.repo_name);
                handleIngestionSuccess(repo.repo_url, repo.repo_name);
              }}
            />
          </TabPanel>
        </Paper>

        {/* Current Repository Display */}
        {currentRepoUrl && (
          <Alert severity="success" sx={{ mb: 3 }}>
            <Typography variant="body1" fontWeight={600}>
              Active Repository: {currentRepoName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              You can now use either feature below with this repository
            </Typography>
          </Alert>
        )}
      </Paper>

      {/* Feature Tabs - Only show if repository is selected */}
      {currentRepoUrl && (
        <Paper elevation={0} sx={{ borderRadius: 2, overflow: 'hidden', mb: 4 }}>
          <Tabs
            value={mainTabValue}
            onChange={handleMainTabChange}
            aria-label="feature tabs"
            sx={{
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Tab label="Chat with Codebase" id="main-tab-0" aria-controls="main-tabpanel-0" />
            <Tab label="Analyze Commits" id="main-tab-1" aria-controls="main-tabpanel-1" />
          </Tabs>

          {/* Chat Tab */}
          <TabPanel value={mainTabValue} index={0}>
            <Box sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom fontWeight={600}>
                Chat with {currentRepoName}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Ask questions about your codebase, get explanations, and explore your code with AI
              </Typography>
              
              <ChatView
                onSendMessage={handleSendMessage}
                messages={messages}
                isLoading={isLoading}
              />
            </Box>
          </TabPanel>

          {/* Commit Analysis Tab */}
          <TabPanel value={mainTabValue} index={1}>
            <Box sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom fontWeight={600}>
                Analyze Commits in {currentRepoName}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Select a branch and explore commits with detailed AI analysis and conversations
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
                  <Typography variant="subtitle1" gutterBottom fontWeight={600}>
                    Select Branch
                  </Typography>
                  <BranchSelector
                    branches={branches}
                    selectedBranch={selectedBranch}
                    onSelectBranch={(branch) => handleSelectBranch(currentRepoUrl, branch)}
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
                    repoUrl={currentRepoUrl}
                    isLoading={isLoadingCommits}
                  />
                </Paper>
              )}
            </Box>
          </TabPanel>
        </Paper>
      )}

      {/* Help Message when no repository is selected */}
      {!currentRepoUrl && (
        <Paper elevation={1} sx={{ p: 4, textAlign: 'center', backgroundColor: 'grey.50' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No Repository Selected
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Please ingest a new repository or select an existing one from the Repository Setup section above to get started.
          </Typography>
        </Paper>
      )}
    </Box>
  );
}

