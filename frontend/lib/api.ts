// API client for backend communication

import axios, { AxiosInstance } from 'axios';
import {
  IngestionRequest,
  IngestionResponse,
  IngestionStatusResponse,
  QueryRequest,
  QueryResponse,
  RepositoryListResponse,
  HealthResponse,
  BranchListResponse,
  CommitListResponse,
  CommitDetail,
  CommitExplanation,
  ChatRequest,
  ChatResponse,
} from '@/types';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    
    this.client = axios.create({
      baseURL: apiUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 0, // No timeout - allow long-running operations
    });
  }

  // Health check
  async healthCheck(): Promise<HealthResponse> {
    const response = await this.client.get<HealthResponse>('/health');
    return response.data;
  }

  // Ingest repository
  async ingestRepository(request: IngestionRequest): Promise<IngestionResponse> {
    const response = await this.client.post<IngestionResponse>('/api/ingest', request);
    return response.data;
  }

  // Get ingestion status
  async getIngestionStatus(jobId: string): Promise<IngestionStatusResponse> {
    const response = await this.client.get<IngestionStatusResponse>(`/api/ingest/${jobId}/status`);
    return response.data;
  }

  // Query knowledge base (non-streaming)
  async query(request: QueryRequest): Promise<QueryResponse> {
    const response = await this.client.post<QueryResponse>('/api/query', request);
    return response.data;
  }

  // Query knowledge base with streaming
  async queryStream(
    request: QueryRequest,
    onEvent: (event: {
      type: 'sources' | 'text' | 'done' | 'error';
      sources?: any[];
      total_sources?: number;
      text?: string;
      error?: string;
    }) => void
  ): Promise<void> {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const response = await fetch(`${apiUrl}/api/query/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('Response body is not readable');
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        // Decode the chunk
        const chunk = decoder.decode(value, { stream: true });
        
        // Split by newlines to handle multiple events
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            try {
              const event = JSON.parse(data);
              onEvent(event);
              
              if (event.type === 'done' || event.type === 'error') {
                return;
              }
            } catch (e) {
              console.error('Failed to parse SSE event:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // List repositories
  async listRepositories(): Promise<RepositoryListResponse> {
    const response = await this.client.get<RepositoryListResponse>('/api/repositories');
    return response.data;
  }

  // List branches for a repository
  async listBranches(repoUrl: string): Promise<BranchListResponse> {
    const response = await this.client.get<BranchListResponse>(`/api/repositories/${encodeURIComponent(repoUrl)}/branches`);
    return response.data;
  }

  // List commits for a branch
  async listCommits(repoUrl: string, branch: string, limit: number = 50): Promise<CommitListResponse> {
    const response = await this.client.get<CommitListResponse>(
      `/api/repositories/${encodeURIComponent(repoUrl)}/branches/${encodeURIComponent(branch)}/commits`,
      { params: { limit } }
    );
    return response.data;
  }

  // Get commit details
  async getCommitDetail(repoUrl: string, commitSha: string): Promise<CommitDetail> {
    const response = await this.client.get<CommitDetail>(
      `/api/repositories/${encodeURIComponent(repoUrl)}/commits/${commitSha}`
    );
    return response.data;
  }

  // Get commit explanation from LLM
  async explainCommit(repoUrl: string, commitSha: string): Promise<CommitExplanation> {
    const response = await this.client.get<CommitExplanation>(
      `/api/repositories/${encodeURIComponent(repoUrl)}/commits/${commitSha}/explain`
    );
    return response.data;
  }

  // Chat about a commit
  async chatAboutCommit(repoUrl: string, commitSha: string, chatRequest: ChatRequest): Promise<ChatResponse> {
    const response = await this.client.post<ChatResponse>(
      `/api/repositories/${encodeURIComponent(repoUrl)}/commits/${commitSha}/chat`,
      chatRequest
    );
    return response.data;
  }
}

export const apiClient = new ApiClient();

