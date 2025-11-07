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
    BranchListResponse,
    Branch,
    CommitListResponse,
    CommitSummary,
    CommitDetail,
    CommitExplanation,
    FileChange,
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
            created_at=datetime.now(timezone.utc),
            message="Ingestion job started successfully"
        )
        
    except Exception as e:
        logger.error(f"Failed to start ingestion: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to start ingestion: {str(e)}")


@app.get("/api/ingest/{job_id}/status", response_model=IngestionStatusResponse)
async def get_ingestion_status(job_id: str):
    """Get the status of an ingestion job."""
    logger.info(f"Checking status for job: {job_id}")
    logger.info(f"Available jobs: {list(ingestion_jobs.keys())}")
    
    if job_id not in ingestion_jobs:
        logger.warning(f"Job {job_id} not found in ingestion_jobs")
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


@app.get("/api/repositories/{repo_url:path}/branches", response_model=BranchListResponse)
async def list_branches(repo_url: str):
    """List all branches for a repository."""
    try:
        from services.github_ingestion import GitHubIngestionService
        
        github_service = GitHubIngestionService()
        
        # Clone the repository temporarily to get branches
        local_path, repo = github_service.clone_repository(repo_url)
        
        try:
            # Get all branches using repo.heads (more reliable than references)
            branches = []
            
            # Get default branch name
            try:
                default_branch = repo.active_branch.name
            except:
                default_branch = "main"  # Fallback
            
            logger.info(f"Default branch: {default_branch}")
            logger.info(f"Available heads: {[head.name for head in repo.heads]}")
            
            for head in repo.heads:
                branch_name = head.name
                is_default = branch_name == default_branch
                
                branches.append(Branch(
                    name=branch_name,
                    commit_sha=head.commit.hexsha,
                    is_default=is_default
                ))
            
            # Sort: default branch first, then alphabetically
            branches.sort(key=lambda b: (not b.is_default, b.name))
            
            logger.info(f"Returning {len(branches)} branches")
            
            return BranchListResponse(
                repo_url=repo_url,
                branches=branches,
                total=len(branches)
            )
        
        finally:
            # Cleanup
            github_service.cleanup(local_path)
    
    except Exception as e:
        logger.error(f"Failed to list branches: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list branches: {str(e)}")


@app.get("/api/repositories/{repo_url:path}/branches/{branch}/commits", response_model=CommitListResponse)
async def list_commits(repo_url: str, branch: str, limit: int = 50):
    """List commits for a specific branch."""
    try:
        from services.github_ingestion import GitHubIngestionService
        
        github_service = GitHubIngestionService()
        
        # Clone the repository temporarily
        local_path, repo = github_service.clone_repository(repo_url)
        
        try:
            # Checkout the branch
            repo.git.checkout(branch)
            
            # Get commits
            commits = []
            for i, commit in enumerate(repo.iter_commits(branch)):
                if i >= limit:
                    break
                
                parents = [p.hexsha for p in commit.parents]
                
                commits.append(CommitSummary(
                    sha=commit.hexsha,
                    message=commit.message.strip(),
                    author=str(commit.author),
                    author_email=commit.author.email if commit.author else None,
                    date=datetime.fromtimestamp(commit.committed_date),
                    parents=parents
                ))
            
            return CommitListResponse(
                repo_url=repo_url,
                branch=branch,
                commits=commits,
                total=len(commits)
            )
        
        finally:
            # Cleanup
            github_service.cleanup(local_path)
    
    except Exception as e:
        logger.error(f"Failed to list commits: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list commits: {str(e)}")


@app.get("/api/repositories/{repo_url:path}/commits/{commit_sha}", response_model=CommitDetail)
async def get_commit_detail(repo_url: str, commit_sha: str):
    """Get detailed information about a specific commit."""
    try:
        from services.github_ingestion import GitHubIngestionService
        from models.schemas import FileChange
        
        github_service = GitHubIngestionService()
        
        # Clone the repository temporarily
        local_path, repo = github_service.clone_repository(repo_url)
        
        try:
            # Get the commit
            commit = repo.commit(commit_sha)
            
            # Get diff and file changes
            diff_text = ""
            stats = {}
            files_changed = []
            
            if commit.parents:
                parent = commit.parents[0]
                diff = parent.diff(commit, create_patch=True)
                diff_text = '\n'.join([str(d) for d in diff])
                
                # Process each changed file
                for diff_item in diff:
                    if diff_item.a_path:
                        filename = diff_item.a_path
                    elif diff_item.b_path:
                        filename = diff_item.b_path
                    else:
                        filename = "unknown"
                    
                    # Get patch (diff text for this file)
                    patch = None
                    if hasattr(diff_item, 'diff') and diff_item.diff:
                        try:
                            patch = diff_item.diff.decode('utf-8', errors='replace')
                        except:
                            patch = str(diff_item.diff)
                    
                    files_changed.append(FileChange(
                        filename=filename,
                        additions=diff_item.diff.count(b'\n+') if hasattr(diff_item.diff, 'count') else 0,
                        deletions=diff_item.diff.count(b'\n-') if hasattr(diff_item.diff, 'count') else 0,
                        changes=len(diff_item.diff.split(b'\n')) if hasattr(diff_item.diff, 'split') else 0,
                        patch=patch[:5000] if patch else None  # Limit patch size
                    ))
                
                # Calculate stats
                stats = {
                    'files_changed': commit.stats.total['files'],
                    'insertions': commit.stats.total['insertions'],
                    'deletions': commit.stats.total['deletions']
                }
            
            parents = [p.hexsha for p in commit.parents]
            
            return CommitDetail(
                sha=commit.hexsha,
                message=commit.message.strip(),
                author=str(commit.author),
                author_email=commit.author.email if commit.author else None,
                date=datetime.fromtimestamp(commit.committed_date),
                parents=parents,
                diff=diff_text[:10000],  # Limit diff size
                stats=stats,
                files_changed=files_changed
            )
        
        finally:
            # Cleanup
            github_service.cleanup(local_path)
    
    except Exception as e:
        logger.error(f"Failed to get commit detail: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get commit detail: {str(e)}")


@app.get("/api/repositories/{repo_url:path}/commits/{commit_sha}/explain", response_model=CommitExplanation)
async def explain_commit(repo_url: str, commit_sha: str):
    """Get an LLM-generated explanation of what a commit does."""
    try:
        from services.github_ingestion import GitHubIngestionService
        from services.commit_analyzer import CommitAnalyzer
        
        github_service = GitHubIngestionService()
        commit_analyzer = CommitAnalyzer()
        
        # Clone the repository temporarily
        local_path, repo = github_service.clone_repository(repo_url)
        
        try:
            # Get the commit
            commit = repo.commit(commit_sha)
            
            # Get diff
            diff_text = ""
            file_list = []
            
            if commit.parents:
                parent = commit.parents[0]
                diff = parent.diff(commit, create_patch=True)
                diff_text = '\n'.join([str(d) for d in diff])
                
                # Get list of changed files
                file_list = [item.a_path if item.a_path else item.b_path for item in diff]
            
            # Analyze the commit with Claude
            analysis = commit_analyzer.analyze_commit(
                commit_sha=commit.hexsha,
                commit_message=commit.message.strip(),
                author=str(commit.author),
                date=datetime.fromtimestamp(commit.committed_date),
                diff=diff_text,
                file_list=file_list
            )
            
            return CommitExplanation(**analysis)
        
        finally:
            # Cleanup
            github_service.cleanup(local_path)
    
    except Exception as e:
        logger.error(f"Failed to explain commit: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to explain commit: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True
    )

