'use client';

import * as React from 'react';
import {
  Box,
  Typography,
  Tab,
  Tabs,
  Paper,
} from '@mui/material';
import IngestionForm from '@/components/IngestionForm';
import ChatView from '@/components/ChatView';
import RepositoryList from '@/components/RepositoryList';
import { Repository } from '@/types';
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
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [repositories, setRepositories] = React.useState<Repository[]>([]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

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

  return (
    <Box>
      {/* Hero Section */}
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Typography variant="h3" component="h1" gutterBottom fontWeight={700}>
          AI Chat with Your Codebase
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
          Have a conversation with AI about your code, commits, issues, and PRs
        </Typography>
      </Box>

      {/* Chat Interface */}
      <Box sx={{ mb: 4 }}>
        <ChatView
          onSendMessage={handleSendMessage}
          messages={messages}
          isLoading={isLoading}
        />
      </Box>

      {/* Tabs */}
      <Paper elevation={0} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="main tabs"
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Tab label="Ingest Repository" id="tab-0" aria-controls="tabpanel-0" />
          <Tab label="Repositories" id="tab-1" aria-controls="tabpanel-1" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <IngestionForm onSuccess={loadRepositories} />
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <RepositoryList repositories={repositories} onRefresh={loadRepositories} />
        </TabPanel>
      </Paper>
    </Box>
  );
}

