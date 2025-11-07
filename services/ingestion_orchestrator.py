"""
Ingestion orchestrator that coordinates the entire ingestion pipeline.
"""
import logging
from typing import Dict, Any
from datetime import datetime, timezone

from models.schemas import IngestionRequest, IngestionStatus, IngestionStatusResponse
from services.github_ingestion import GitHubIngestionService
from services.document_processor import DocumentProcessor
from services.bedrock_service import BedrockService

logger = logging.getLogger(__name__)


def run_ingestion(
    job_id: str,
    request: IngestionRequest,
    jobs_dict: Dict[str, IngestionStatusResponse],
    repos_dict: Dict[str, dict]
):
    """
    Run the complete ingestion pipeline.
    
    Args:
        job_id: Unique job identifier
        request: Ingestion request parameters
        jobs_dict: Shared dictionary for job status
        repos_dict: Shared dictionary for repository information
    """
    try:
        logger.info(f"[{job_id}] Starting ingestion pipeline...")
        # Update status to in_progress
        if job_id not in jobs_dict:
            logger.error(f"[{job_id}] Job ID not found in jobs_dict! This should not happen.")
            return
        
        jobs_dict[job_id].status = IngestionStatus.IN_PROGRESS
        jobs_dict[job_id].progress = {"stage": "initializing"}
        logger.info(f"[{job_id}] Status updated to IN_PROGRESS")
        
        # Initialize services
        github_service = GitHubIngestionService()
        document_processor = DocumentProcessor()
        bedrock_service = BedrockService()
        
        # Parse repo info
        owner, repo_name = github_service.parse_repo_url(request.repo_url)
        full_repo_name = f"{owner}/{repo_name}"
        
        logger.info(f"Starting ingestion for {full_repo_name}")
        
        # Step 1: Clone repository
        jobs_dict[job_id].progress = {"stage": "cloning_repository"}
        logger.info(f"[{job_id}] Cloning repository...")
        
        local_path, repo = github_service.clone_repository(request.repo_url)
        
        # Step 2: Extract code files
        jobs_dict[job_id].progress = {"stage": "extracting_code"}
        logger.info(f"[{job_id}] Extracting code files...")
        
        code_files = github_service.extract_code_files(local_path)
        logger.info(f"[{job_id}] Found {len(code_files)} code files")
        
        # Step 3: Extract commits
        commits = []
        if request.include_commits:
            jobs_dict[job_id].progress = {"stage": "extracting_commits"}
            logger.info(f"[{job_id}] Extracting commits...")
            
            commits = github_service.extract_commits(repo, max_commits=request.max_commits or 100)
            logger.info(f"[{job_id}] Found {len(commits)} commits")
        
        # Step 4: Extract issues
        issues = []
        if request.include_issues:
            jobs_dict[job_id].progress = {"stage": "extracting_issues"}
            logger.info(f"[{job_id}] Extracting issues...")
            
            issues = github_service.extract_issues(request.repo_url)
            logger.info(f"[{job_id}] Found {len(issues)} issues")
        
        # Step 5: Extract pull requests
        prs = []
        if request.include_prs:
            jobs_dict[job_id].progress = {"stage": "extracting_prs"}
            logger.info(f"[{job_id}] Extracting pull requests...")
            
            prs = github_service.extract_pull_requests(request.repo_url)
            logger.info(f"[{job_id}] Found {len(prs)} pull requests")
        
        # Step 6: Process documents
        jobs_dict[job_id].progress = {"stage": "processing_documents"}
        logger.info(f"[{job_id}] Processing documents...")
        
        all_documents = []
        
        # Process code files
        if code_files:
            code_docs = document_processor.process_code_files(
                code_files, request.repo_url, full_repo_name
            )
            all_documents.extend(code_docs)
        
        # Process commits
        if commits:
            commit_docs = document_processor.process_commits(
                commits, request.repo_url, full_repo_name
            )
            all_documents.extend(commit_docs)
        
        # Process issues
        if issues:
            issue_docs = document_processor.process_issues(
                issues, request.repo_url, full_repo_name
            )
            all_documents.extend(issue_docs)
        
        # Process pull requests
        if prs:
            pr_docs = document_processor.process_pull_requests(
                prs, request.repo_url, full_repo_name
            )
            all_documents.extend(pr_docs)
        
        logger.info(f"[{job_id}] Total documents to upload: {len(all_documents)}")
        
        # Step 7: Upload to S3
        jobs_dict[job_id].progress = {
            "stage": "uploading_to_s3",
            "total_documents": len(all_documents)
        }
        logger.info(f"[{job_id}] Uploading documents to S3...")
        
        uploaded_keys = bedrock_service.upload_documents_to_s3(
            all_documents, full_repo_name
        )
        
        logger.info(f"[{job_id}] Uploaded {len(uploaded_keys)} documents to S3")
        
        # Step 8: Start Knowledge Base ingestion job
        jobs_dict[job_id].progress = {"stage": "syncing_knowledge_base"}
        logger.info(f"[{job_id}] Starting Knowledge Base sync...")
        
        kb_job_id = bedrock_service.start_ingestion_job()
        
        if kb_job_id:
            logger.info(f"[{job_id}] Knowledge Base ingestion job started: {kb_job_id}")
        else:
            logger.warning(f"[{job_id}] Failed to start Knowledge Base ingestion job")
        
        # Step 9: Cleanup
        jobs_dict[job_id].progress = {"stage": "cleaning_up"}
        github_service.cleanup(local_path)
        
        # Get last commit SHA
        last_commit_sha = commits[0]['sha'] if commits else None
        
        # Store repository information BEFORE updating status to ensure it's available
        # when the frontend polls for completion
        completed_time = datetime.now(timezone.utc)
        
        repo_data = {
            "repo_url": request.repo_url,
            "repo_name": full_repo_name,
            "ingested_at": completed_time,
            "document_count": len(all_documents),
            "last_commit_sha": last_commit_sha
        }
        
        repos_dict[request.repo_url] = repo_data
        logger.info(f"[{job_id}] Repository stored in repos_dict: {request.repo_url}")
        logger.info(f"[{job_id}] Total repositories in dict: {len(repos_dict)}")
        
        # Update job status to completed (after repository is stored)
        jobs_dict[job_id].status = IngestionStatus.COMPLETED
        jobs_dict[job_id].completed_at = completed_time
        jobs_dict[job_id].documents_processed = len(all_documents)
        jobs_dict[job_id].progress = {
            "stage": "completed",
            "total_documents": len(all_documents),
            "code_files": len(code_files),
            "commits": len(commits),
            "issues": len(issues),
            "pull_requests": len(prs),
            "kb_ingestion_job_id": kb_job_id
        }
        
        logger.info(f"[{job_id}] Ingestion completed successfully! Status: {jobs_dict[job_id].status}")
        logger.info(f"[{job_id}] Repository should now be available in /api/repositories endpoint")
        
    except Exception as e:
        logger.error(f"[{job_id}] Ingestion failed: {str(e)}", exc_info=True)
        
        # Update job status to failed (if job exists in dict)
        if job_id in jobs_dict:
            jobs_dict[job_id].status = IngestionStatus.FAILED
            jobs_dict[job_id].completed_at = datetime.now(timezone.utc)
            jobs_dict[job_id].error_message = str(e)
            jobs_dict[job_id].progress = {"stage": "failed", "error": str(e)}
        else:
            logger.error(f"[{job_id}] Cannot update job status - job not found in jobs_dict!")
        
        # Cleanup if local_path exists
        try:
            if 'local_path' in locals():
                github_service.cleanup(local_path)
        except Exception as cleanup_error:
            logger.error(f"Failed to cleanup after error: {str(cleanup_error)}")

