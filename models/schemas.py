"""
Pydantic models for API requests and responses.
"""
from pydantic import BaseModel, HttpUrl, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class DocumentType(str, Enum):
    """Types of documents that can be ingested."""
    CODE = "code"
    COMMIT = "commit"
    ISSUE = "issue"
    PULL_REQUEST = "pull_request"


class IngestionRequest(BaseModel):
    """Request to ingest a GitHub repository."""
    repo_url: str = Field(..., description="GitHub repository URL (e.g., https://github.com/owner/repo)")
    include_commits: bool = Field(default=True, description="Include commit history")
    include_issues: bool = Field(default=True, description="Include issues")
    include_prs: bool = Field(default=True, description="Include pull requests")
    max_commits: Optional[int] = Field(default=100, description="Maximum number of commits to ingest")


class IngestionStatus(str, Enum):
    """Status of an ingestion job."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class IngestionResponse(BaseModel):
    """Response for ingestion request."""
    job_id: str
    status: IngestionStatus
    repo_url: str
    created_at: datetime
    message: str


class IngestionStatusResponse(BaseModel):
    """Response for ingestion status check."""
    job_id: str
    status: IngestionStatus
    repo_url: str
    created_at: datetime
    completed_at: Optional[datetime] = None
    documents_processed: int = 0
    error_message: Optional[str] = None
    progress: Dict[str, Any] = Field(default_factory=dict)


class QueryRequest(BaseModel):
    """Request to query the knowledge base."""
    query: str = Field(..., description="Search query")
    max_results: int = Field(default=10, description="Maximum number of results", ge=1, le=50)
    filter_type: Optional[DocumentType] = Field(default=None, description="Filter by document type")
    repo_url: Optional[str] = Field(default=None, description="Filter by repository URL")


class SearchResult(BaseModel):
    """Individual search result from knowledge base."""
    content: str
    score: float
    metadata: Dict[str, Any]
    document_type: str
    source_location: Optional[str] = None


class QueryResponse(BaseModel):
    """Response for query request."""
    query: str
    results: List[SearchResult]
    total_results: int


class Repository(BaseModel):
    """Information about an ingested repository."""
    repo_url: str
    repo_name: str
    ingested_at: datetime
    document_count: int
    last_commit_sha: Optional[str] = None


class RepositoryListResponse(BaseModel):
    """Response for listing repositories."""
    repositories: List[Repository]
    total: int


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    timestamp: datetime
    services: Dict[str, str]

