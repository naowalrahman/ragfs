'use client';

import * as React from 'react';
import {
  Box,
  Grid,
  Typography,
  Tab,
  Tabs,
  Paper,
} from '@mui/material';
import IngestionForm from '@/components/IngestionForm';
import SearchBar from '@/components/SearchBar';
import ResultsView from '@/components/ResultsView';
import RepositoryList from '@/components/RepositoryList';
import { QueryResponse, Repository } from '@/types';
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

export default function HomePage() {
  const [tabValue, setTabValue] = React.useState(0);
  const [searchResults, setSearchResults] = React.useState<QueryResponse | null>(null);
  const [isSearching, setIsSearching] = React.useState(false);
  const [repositories, setRepositories] = React.useState<Repository[]>([]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleSearch = async (query: string) => {
    setIsSearching(true);
    try {
      const results = await apiClient.query({ query, max_results: 10 });
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
      // TODO: Show error notification
    } finally {
      setIsSearching(false);
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
      <Box sx={{ mb: 6, textAlign: 'center' }}>
        <Typography variant="h3" component="h1" gutterBottom fontWeight={700}>
          AI-Powered Knowledge Search
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
          Search across your entire software ecosystem - code, commits, issues, and PRs
        </Typography>

        {/* Search Bar */}
        <SearchBar onSearch={handleSearch} isLoading={isSearching} />
      </Box>

      {/* Search Results */}
      {searchResults && (
        <Box sx={{ mb: 4 }}>
          <ResultsView results={searchResults} />
        </Box>
      )}

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

