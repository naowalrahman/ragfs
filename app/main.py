"""
FastAPI application for RAG Knowledge Platform.
"""
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
from typing import Dict
import logging
import uuid
import json
import os

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

# Persistence file for repositories (survives server restarts)
REPOSITORIES_FILE = "ingested_repositories.json"
JOB_MAPPING_FILE = "job_id_to_repo_url.json"

# In-memory storage for job status (in production, use a database)
ingestion_jobs: Dict[str, IngestionStatusResponse] = {}
ingested_repositories: Dict[str, dict] = {}
# Map job_id to repo_url for lookup after server restart
job_id_to_repo_url: Dict[str, str] = {}


def load_persisted_data():
    """Load persisted repositories and job mappings from disk."""
    global ingested_repositories, job_id_to_repo_url
    
    # Load repositories
    if os.path.exists(REPOSITORIES_FILE):
        try:
            with open(REPOSITORIES_FILE, 'r') as f:
                data = json.load(f)
                # Convert ingested_at strings back to datetime objects
                for repo_url, repo_data in data.items():
                    if "ingested_at" in repo_data and isinstance(repo_data["ingested_at"], str):
                        try:
                            iso_string = repo_data["ingested_at"].replace('Z', '+00:00')
                            repo_data["ingested_at"] = datetime.fromisoformat(iso_string)
                        except (ValueError, AttributeError) as e:
                            logger.warning(f"Failed to parse ingested_at for {repo_url}: {e}, using current time")
                            repo_data["ingested_at"] = datetime.now(timezone.utc)
                ingested_repositories = data
                logger.info(f"Loaded {len(ingested_repositories)} repositories from disk")
        except Exception as e:
            logger.error(f"Failed to load repositories from disk: {str(e)}")
    
    # Load job mappings
    if os.path.exists(JOB_MAPPING_FILE):
        try:
            with open(JOB_MAPPING_FILE, 'r') as f:
                job_id_to_repo_url = json.load(f)
                logger.info(f"Loaded {len(job_id_to_repo_url)} job mappings from disk")
        except Exception as e:
            logger.error(f"Failed to load job mappings from disk: {str(e)}")


def save_repositories():
    """Save repositories to disk."""
    try:
        # Convert datetime objects to ISO format strings for JSON serialization
        data_to_save = {}
        for repo_url, repo_data in ingested_repositories.items():
            data_to_save[repo_url] = repo_data.copy()
            if isinstance(data_to_save[repo_url].get("ingested_at"), datetime):
                data_to_save[repo_url]["ingested_at"] = data_to_save[repo_url]["ingested_at"].isoformat()
        
        with open(REPOSITORIES_FILE, 'w') as f:
            json.dump(data_to_save, f, indent=2)
        logger.debug(f"Saved {len(ingested_repositories)} repositories to disk")
    except Exception as e:
        logger.error(f"Failed to save repositories to disk: {str(e)}")


def save_job_mappings():
    """Save job mappings to disk."""
    try:
        with open(JOB_MAPPING_FILE, 'w') as f:
            json.dump(job_id_to_repo_url, f, indent=2)
        logger.debug(f"Saved {len(job_id_to_repo_url)} job mappings to disk")
    except Exception as e:
        logger.error(f"Failed to save job mappings to disk: {str(e)}")


# Load persisted data on startup
load_persisted_data()


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
        job_id_to_repo_url[job_id] = request.repo_url
        save_job_mappings()  # Persist the mapping
        
        # Start background task for ingestion
        from services.ingestion_orchestrator import run_ingestion
        
        def run_ingestion_wrapper():
            """Wrapper to run ingestion in background with proper error handling."""
            try:
                run_ingestion(
                    job_id=job_id,
                    request=request,
                    jobs_dict=ingestion_jobs,
                    repos_dict=ingested_repositories
                )
                # Save repositories to disk after ingestion completes
                save_repositories()
            except Exception as e:
                logger.error(f"Background task for job {job_id} failed: {str(e)}", exc_info=True)
                # Ensure job status is marked as failed if not already set
                if job_id in ingestion_jobs:
                    ingestion_jobs[job_id].status = IngestionStatus.FAILED
                    ingestion_jobs[job_id].error_message = str(e)
                    ingestion_jobs[job_id].completed_at = datetime.now(timezone.utc)
        
        # Add the task to background tasks (now that it's a regular function, this will work)
        background_tasks.add_task(run_ingestion_wrapper)
        
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
    if job_id in ingestion_jobs:
        return ingestion_jobs[job_id]
    
    # Job not found - check if repository was successfully ingested (server may have restarted)
    if job_id in job_id_to_repo_url:
        repo_url = job_id_to_repo_url[job_id]
        if repo_url in ingested_repositories:
            # Repository was ingested, return a completed status
            repo_data = ingested_repositories[repo_url]
            logger.info(f"Job {job_id} not found, but repository {repo_url} is ingested. Returning completed status.")
            return IngestionStatusResponse(
                job_id=job_id,
                status=IngestionStatus.COMPLETED,
                repo_url=repo_url,
                created_at=repo_data.get("ingested_at", datetime.now(timezone.utc)),
                completed_at=repo_data.get("ingested_at", datetime.now(timezone.utc)),
                documents_processed=repo_data.get("document_count", 0),
                progress={
                    "stage": "completed",
                    "total_documents": repo_data.get("document_count", 0)
                }
            )
    
    raise HTTPException(status_code=404, detail="Job not found")


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
    
    try:
        logger.info(f"Listing repositories. Total in dict: {len(ingested_repositories)}")
        
        repos = []
        for repo_url, repo_data in ingested_repositories.items():
            try:
                repo = Repository(
                    repo_url=repo_data["repo_url"],
                    repo_name=repo_data["repo_name"],
                    ingested_at=repo_data["ingested_at"],
                    document_count=repo_data["document_count"],
                    last_commit_sha=repo_data.get("last_commit_sha")
                )
                repos.append(repo)
            except Exception as e:
                logger.error(f"Failed to serialize repository {repo_url}: {str(e)}", exc_info=True)
                # Continue with other repositories even if one fails
        
        logger.info(f"Returning {len(repos)} repositories")
        return RepositoryListResponse(
            repositories=repos,
            total=len(repos)
        )
    except Exception as e:
        logger.error(f"Error listing repositories: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list repositories: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True
    )

