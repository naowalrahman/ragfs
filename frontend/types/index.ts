// Type definitions for the RAG Knowledge Platform

export enum DocumentType {
  CODE = 'code',
  COMMIT = 'commit',
  ISSUE = 'issue',
  PULL_REQUEST = 'pull_request',
}

export enum IngestionStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface IngestionRequest {
  repo_url: string;
  include_commits?: boolean;
  include_issues?: boolean;
  include_prs?: boolean;
  max_commits?: number;
}

export interface IngestionResponse {
  job_id: string;
  status: IngestionStatus;
  repo_url: string;
  created_at: string;
  message: string;
}

export interface IngestionStatusResponse {
  job_id: string;
  status: IngestionStatus;
  repo_url: string;
  created_at: string;
  completed_at?: string;
  documents_processed: number;
  error_message?: string;
  progress: Record<string, any>;
}

export interface SearchResult {
  content: string;
  score: number;
  metadata: Record<string, any>;
  document_type: string;
  source_location?: string;
}

export interface QueryRequest {
  query: string;
  max_results?: number;
  filter_type?: DocumentType;
  repo_url?: string;
}

export interface QueryResponse {
  query: string;
  results: SearchResult[];
  total_results: number;
}

export interface Repository {
  repo_url: string;
  repo_name: string;
  ingested_at: string;
  document_count: number;
  last_commit_sha?: string;
}

export interface RepositoryListResponse {
  repositories: Repository[];
  total: number;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  services: Record<string, string>;
}

