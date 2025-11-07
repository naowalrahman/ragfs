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

export interface Branch {
  name: string;
  commit_sha: string;
  is_default: boolean;
}

export interface BranchListResponse {
  repo_url: string;
  branches: Branch[];
  total: number;
}

export interface CommitSummary {
  sha: string;
  message: string;
  author: string;
  author_email?: string;
  date: string;
  parents: string[];
}

export interface CommitListResponse {
  repo_url: string;
  branch: string;
  commits: CommitSummary[];
  total: number;
}

export interface CommitDetail {
  sha: string;
  message: string;
  author: string;
  author_email?: string;
  date: string;
  parents: string[];
  diff: string;
  stats: Record<string, any>;
  files_changed: Array<{
    filename: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
  }>;
}

export interface CommitExplanation {
  commit_sha: string;
  summary: string;
  what_changed: string;
  why_important: string;
  technical_details: string;
  business_impact?: string;
  generated_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatRequest {
  message: string;
  conversation_history: ChatMessage[];
}

export interface ChatResponse {
  commit_sha: string;
  message: ChatMessage;
  conversation_history: ChatMessage[];
}

