"""
FastAPI application for RAG Knowledge Platform.
"""
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
from typing import Dict
import logging
import uuid

from models.schemas import (
    IngestionRequest,
    IngestionResponse,
    IngestionStatus,
    IngestionStatusResponse,
    QueryRequest,
    QueryResponse,
    RepositoryListResponse,
    HealthResponse,
)
from app.config import settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="RAG Knowledge Platform API",
    description="API for ingesting and querying GitHub repositories using AWS Bedrock",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for job status (in production, use a database)
ingestion_jobs: Dict[str, IngestionStatusResponse] = {}
ingested_repositories: Dict[str, dict] = {}


@app.get("/", response_model=HealthResponse)
async def root():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        timestamp=datetime.now(timezone.utc),
        services={
            "api": "running",
            "aws_bedrock": "configured",
            "s3": "configured"
        }
    )


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Detailed health check endpoint."""
    try:
        # In a real implementation, check AWS connectivity here
        return HealthResponse(
            status="healthy",
            timestamp=datetime.utcnow(),
            services={
                "api": "running",
                "aws_bedrock": "configured",
                "s3": "configured"
            }
        )
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        raise HTTPException(status_code=503, detail="Service unhealthy")


@app.post("/api/ingest", response_model=IngestionResponse)
async def ingest_repository(
    request: IngestionRequest,
    background_tasks: BackgroundTasks
):
    """
    Start ingestion of a GitHub repository.
    
    This endpoint accepts a GitHub repository URL and begins the process of:
    1. Cloning the repository
    2. Extracting code, commits, issues, and PRs
    3. Processing and chunking documents
    4. Uploading to S3
    5. Syncing with Bedrock Knowledge Base
    """
    try:
        # Generate unique job ID
        job_id = str(uuid.uuid4())
        
        # Create job status
        job_status = IngestionStatusResponse(
            job_id=job_id,
            status=IngestionStatus.PENDING,
            repo_url=request.repo_url,
            created_at=datetime.now(timezone.utc),
            progress={}
        )
        
        ingestion_jobs[job_id] = job_status
        
        # Start background task for ingestion
        from services.ingestion_orchestrator import run_ingestion
        background_tasks.add_task(
            run_ingestion,
            job_id=job_id,
            request=request,
            jobs_dict=ingestion_jobs,
            repos_dict=ingested_repositories
        )
        
        logger.info(f"Started ingestion job {job_id} for {request.repo_url}")
        
        return IngestionResponse(
            job_id=job_id,
            status=IngestionStatus.PENDING,
            repo_url=request.repo_url,
            created_at=datetime.utcnow(),
            message="Ingestion job started successfully"
        )
        
    except Exception as e:
        logger.error(f"Failed to start ingestion: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to start ingestion: {str(e)}")


@app.get("/api/ingest/status/{job_id}", response_model=IngestionStatusResponse)
async def get_ingestion_status(job_id: str):
    """Get the status of an ingestion job."""
    if job_id not in ingestion_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return ingestion_jobs[job_id]


@app.post("/api/query", response_model=QueryResponse)
async def query_knowledge_base(request: QueryRequest):
    """
    Query the knowledge base.
    
    Searches across all ingested repositories and returns relevant results.
    """
    try:
        from services.bedrock_service import BedrockService
        
        bedrock_service = BedrockService()
        results = await bedrock_service.query(
            query=request.query,
            max_results=request.max_results,
            filter_type=request.filter_type,
            repo_url=request.repo_url
        )
        
        return QueryResponse(
            query=request.query,
            results=results,
            total_results=len(results)
        )
        
    except Exception as e:
        logger.error(f"Query failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@app.get("/api/repositories", response_model=RepositoryListResponse)
async def list_repositories():
    """List all ingested repositories."""
    from models.schemas import Repository
    
    repos = [
        Repository(
            repo_url=repo_data["repo_url"],
            repo_name=repo_data["repo_name"],
            ingested_at=repo_data["ingested_at"],
            document_count=repo_data["document_count"],
            last_commit_sha=repo_data.get("last_commit_sha")
        )
        for repo_data in ingested_repositories.values()
    ]
    
    return RepositoryListResponse(
        repositories=repos,
        total=len(repos)
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True
    )

