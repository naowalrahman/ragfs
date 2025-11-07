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
    const response = await this.client.get<IngestionStatusResponse>(`/api/ingest/status/${jobId}`);
    return response.data;
  }

  // Query knowledge base
  async query(request: QueryRequest): Promise<QueryResponse> {
    const response = await this.client.post<QueryResponse>('/api/query', request);
    return response.data;
  }

  // List repositories
  async listRepositories(): Promise<RepositoryListResponse> {
    const response = await this.client.get<RepositoryListResponse>('/api/repositories');
    return response.data;
  }
}

export const apiClient = new ApiClient();

