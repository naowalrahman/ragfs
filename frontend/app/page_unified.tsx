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
import BranchSelector from '@/components/BranchSelector';
import CommitList from '@/components/CommitList';
import RepositoryList from '@/components/RepositoryList';
import { Branch, CommitSummary, Repository } from '@/types';
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
  const [tabValue, setTabValue] = React.useState(0);
  
  // Chat state (from main branch)
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [repositories, setRepositories] = React.useState<Repository[]>([]);
  
  // Commit analysis state (from hassam branch)
  const [ingestedRepoUrl, setIngestedRepoUrl] = React.useState<string | null>(null);
  const [ingestedRepoName, setIngestedRepoName] = React.useState<string | null>(null);
  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = React.useState<string | null>(null);
  const [commits, setCommits] = React.useState<CommitSummary[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = React.useState(false);
  const [isLoadingCommits, setIsLoadingCommits] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // Load repositories for the repositories tab
  const loadRepositories = async () => {
    try {
      const response = await apiClient.listRepositories();
      setRepositories(response.repositories);
    } catch (error) {
      console.error('Failed to load repositories:', error);
    }
  };

  React.useEffect(() => {
    loadRepositories();
  }, []);

  // Chat message handler (from main branch)
  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

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
            sources = event.sources || [];
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, sources }
                  : msg
              )
            );
          } else if (event.type === 'text') {
            fullText += event.text || '';
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, content: fullText }
                  : msg
              )
            );
          } else if (event.type === 'done') {
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, isStreaming: false }
                  : msg
              )
            );
          } else if (event.type === 'error') {
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

  // Commit analysis handlers (from hassam branch)
  const handleIngestionSuccess = async (repoUrl: string, repoName: string) => {
    console.log('handleIngestionSuccess called with:', { repoUrl, repoName });
    setIngestedRepoUrl(repoUrl);
    setIngestedRepoName(repoName);
    setError(null);
    setIsLoadingBranches(true);

    // Also refresh repositories list
    await loadRepositories();

    try {
      console.log('Loading branches for:', repoUrl);
      const response = await apiClient.listBranches(repoUrl);
      console.log('Branches loaded:', response.branches.length);
      setBranches(response.branches);
      
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
          AI-Powered Code Intelligence Platform
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
          Chat with your codebase and analyze commits with intelligent AI explanations
        </Typography>
      </Box>

      {/* Main Tabs */}
      <Paper elevation={0} sx={{ borderRadius: 2, overflow: 'hidden', mb: 4 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="main tabs"
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Tab label="AI Chat" id="tab-0" aria-controls="tabpanel-0" />
          <Tab label="Commit Analysis" id="tab-1" aria-controls="tabpanel-1" />
          <Tab label="Ingest Repository" id="tab-2" aria-controls="tabpanel-2" />
          <Tab label="Repositories" id="tab-3" aria-controls="tabpanel-3" />
        </Tabs>

        {/* Tab 0: AI Chat */}
        <TabPanel value={tabValue} index={0}>
          <ChatView
            onSendMessage={handleSendMessage}
            messages={messages}
            isLoading={isLoading}
          />
        </TabPanel>

        {/* Tab 1: Commit Analysis */}
        <TabPanel value={tabValue} index={1}>
          {!ingestedRepoUrl ? (
            <Alert severity="info" sx={{ mb: 3 }}>
              Please ingest a repository first (go to "Ingest Repository" tab) to analyze commits.
            </Alert>
          ) : (
            <>
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
        </TabPanel>

        {/* Tab 2: Ingest Repository */}
        <TabPanel value={tabValue} index={2}>
          <IngestionForm onSuccess={handleIngestionSuccess} />
        </TabPanel>

        {/* Tab 3: Repositories */}
        <TabPanel value={tabValue} index={3}>
          <RepositoryList repositories={repositories} onRefresh={loadRepositories} />
        </TabPanel>
      </Paper>
    </Box>
  );
}
