"""
GitHub data extraction service.
Handles cloning repositories and extracting code, commits, issues, and PRs.
"""
import os
import shutil
import tempfile
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from urllib.parse import urlparse

from github import Github, GithubException
from git import Repo, GitCommandError

from app.config import settings

logger = logging.getLogger(__name__)


class GitHubIngestionService:
    """Service for extracting data from GitHub repositories."""
    
    # File extensions to include (code files)
    CODE_EXTENSIONS = {
        '.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.cpp', '.c', '.h', '.hpp',
        '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala', '.r', '.m', '.mm',
        '.cs', '.fs', '.clj', '.ex', '.exs', '.erl', '.hs', '.lua', '.pl', '.sh',
        '.bash', '.zsh', '.sql', '.html', '.css', '.scss', '.sass', '.less',
        '.vue', '.svelte', '.md', '.json', '.yaml', '.yml', '.toml', '.xml',
        '.proto', '.graphql', '.sol', '.v', '.vhd'
    }
    
    # Directories to skip
    SKIP_DIRECTORIES = {
        'node_modules', '.git', '__pycache__', 'venv', '.venv', 'env',
        'dist', 'build', 'target', 'out', '.next', '.nuxt', 'vendor',
        'bower_components', 'coverage', '.pytest_cache', '.mypy_cache',
        'eggs', '*.egg-info', '.tox', 'htmlcov'
    }
    
    def __init__(self):
        """Initialize the GitHub ingestion service."""
        self.github_client = Github(settings.github_token) if settings.github_token else Github()
        self.temp_dir = settings.temp_storage_path
        os.makedirs(self.temp_dir, exist_ok=True)
    
    def parse_repo_url(self, repo_url: str) -> tuple[str, str]:
        """
        Parse GitHub repository URL to extract owner and repo name.
        
        Args:
            repo_url: GitHub repository URL
            
        Returns:
            Tuple of (owner, repo_name)
        """
        # Handle various URL formats
        # https://github.com/owner/repo
        # https://github.com/owner/repo.git
        # git@github.com:owner/repo.git
        
        if repo_url.startswith('git@'):
            # SSH format
            parts = repo_url.replace('git@github.com:', '').replace('.git', '').split('/')
        else:
            # HTTPS format
            parsed = urlparse(repo_url)
            parts = parsed.path.strip('/').replace('.git', '').split('/')
        
        if len(parts) < 2:
            raise ValueError(f"Invalid GitHub repository URL: {repo_url}")
        
        return parts[0], parts[1]
    
    def clone_repository(self, repo_url: str) -> tuple[str, Repo]:
        """
        Clone a GitHub repository to a temporary directory.
        
        Args:
            repo_url: GitHub repository URL
            
        Returns:
            Tuple of (local_path, Repo object)
        """
        owner, repo_name = self.parse_repo_url(repo_url)
        local_path = os.path.join(self.temp_dir, f"{owner}_{repo_name}")
        
        # Remove existing directory if present
        if os.path.exists(local_path):
            shutil.rmtree(local_path)
        
        logger.info(f"Cloning repository {repo_url} to {local_path}")
        
        try:
            # Clone without depth limit to get full commit history
            repo = Repo.clone_from(repo_url, local_path)
            logger.info(f"Successfully cloned {repo_url}")
            return local_path, repo
        except GitCommandError as e:
            logger.error(f"Failed to clone repository: {str(e)}")
            raise
    
    def extract_code_files(self, repo_path: str) -> List[Dict[str, Any]]:
        """
        Extract all code files from the repository.
        
        Args:
            repo_path: Local path to the repository
            
        Returns:
            List of dictionaries containing file information
        """
        code_files = []
        repo_path_obj = Path(repo_path)
        
        for file_path in repo_path_obj.rglob('*'):
            # Skip directories
            if file_path.is_dir():
                continue
            
            # Skip files in excluded directories
            if any(skip_dir in file_path.parts for skip_dir in self.SKIP_DIRECTORIES):
                continue
            
            # Check if file has a code extension
            if file_path.suffix.lower() not in self.CODE_EXTENSIONS:
                continue
            
            try:
                # Read file content
                content = file_path.read_text(encoding='utf-8', errors='ignore')
                
                # Skip very large files (>1MB)
                if len(content) > 1_000_000:
                    logger.warning(f"Skipping large file: {file_path}")
                    continue
                
                # Get relative path from repo root
                relative_path = str(file_path.relative_to(repo_path_obj))
                
                code_files.append({
                    'file_path': relative_path,
                    'content': content,
                    'extension': file_path.suffix,
                    'size': len(content)
                })
                
            except Exception as e:
                logger.warning(f"Failed to read file {file_path}: {str(e)}")
                continue
        
        logger.info(f"Extracted {len(code_files)} code files")
        return code_files
    
    def extract_commits(self, repo: Repo, max_commits: int = 100) -> List[Dict[str, Any]]:
        """
        Extract commit history from the repository.
        
        Args:
            repo: GitPython Repo object
            max_commits: Maximum number of commits to extract
            
        Returns:
            List of dictionaries containing commit information
        """
        commits = []
        
        try:
            for i, commit in enumerate(repo.iter_commits()):
                if i >= max_commits:
                    break
                
                # Get diff for this commit
                diff_text = ""
                try:
                    if commit.parents:
                        parent = commit.parents[0]
                        diff = parent.diff(commit, create_patch=True)
                        diff_text = '\n'.join([str(d) for d in diff])
                    else:
                        # Initial commit - show the full commit instead of diff
                        logger.debug(f"Commit {commit.hexsha} has no parent (initial commit)")
                except Exception as e:
                    # Silently skip diff errors (common for merge commits or shallow clones)
                    logger.debug(f"Could not get diff for commit {commit.hexsha}: {str(e)}")
                
                commits.append({
                    'sha': commit.hexsha,
                    'author': str(commit.author),
                    'author_email': commit.author.email if commit.author else None,
                    'date': datetime.fromtimestamp(commit.committed_date),
                    'message': commit.message,
                    'diff': diff_text[:10000] if diff_text else ""  # Limit diff size
                })
            
            logger.info(f"Extracted {len(commits)} commits")
            return commits
            
        except Exception as e:
            logger.error(f"Failed to extract commits: {str(e)}")
            return []
    
    def extract_issues(self, repo_url: str, max_issues: int = 100) -> List[Dict[str, Any]]:
        """
        Extract issues from the repository using GitHub API.
        
        Args:
            repo_url: GitHub repository URL
            max_issues: Maximum number of issues to extract
            
        Returns:
            List of dictionaries containing issue information
        """
        try:
            owner, repo_name = self.parse_repo_url(repo_url)
            repo = self.github_client.get_repo(f"{owner}/{repo_name}")
            
            issues = []
            logger.info(f"Fetching issues from {owner}/{repo_name}...")
            
            for i, issue in enumerate(repo.get_issues(state='all')):
                # Skip pull requests (they appear in issues API)
                if issue.pull_request:
                    continue
                
                if len(issues) >= max_issues:
                    logger.info(f"Reached maximum issue limit ({max_issues})")
                    break
                
                # Log progress every 10 issues
                if (len(issues) + 1) % 10 == 0:
                    logger.info(f"Processed {len(issues) + 1} issues...")
                
                # Get comments (limit to first 10 to avoid too much data)
                comments = []
                for j, comment in enumerate(issue.get_comments()):
                    if j >= 10:  # Limit comments per issue
                        break
                    comments.append({
                        'author': comment.user.login if comment.user else 'unknown',
                        'body': comment.body,
                        'created_at': comment.created_at
                    })
                
                issues.append({
                    'number': issue.number,
                    'title': issue.title,
                    'body': issue.body or "",
                    'state': issue.state,
                    'author': issue.user.login if issue.user else 'unknown',
                    'created_at': issue.created_at,
                    'updated_at': issue.updated_at,
                    'closed_at': issue.closed_at,
                    'labels': [label.name for label in issue.labels],
                    'comments': comments
                })
            
            logger.info(f"Extracted {len(issues)} issues")
            return issues
            
        except GithubException as e:
            logger.error(f"Failed to extract issues: {str(e)}")
            return []
        except Exception as e:
            logger.error(f"Unexpected error extracting issues: {str(e)}")
            return []
    
    def extract_pull_requests(self, repo_url: str, max_prs: int = 100) -> List[Dict[str, Any]]:
        """
        Extract pull requests from the repository using GitHub API.
        
        Args:
            repo_url: GitHub repository URL
            max_prs: Maximum number of PRs to extract
            
        Returns:
            List of dictionaries containing PR information
        """
        try:
            owner, repo_name = self.parse_repo_url(repo_url)
            repo = self.github_client.get_repo(f"{owner}/{repo_name}")
            
            prs = []
            logger.info(f"Fetching pull requests from {owner}/{repo_name}...")
            
            for i, pr in enumerate(repo.get_pulls(state='all')):
                if i >= max_prs:
                    logger.info(f"Reached maximum PR limit ({max_prs})")
                    break
                
                # Log progress every 10 PRs
                if (i + 1) % 10 == 0:
                    logger.info(f"Processed {i + 1} pull requests...")
                
                # Get comments (limit to first 10)
                comments = []
                for j, comment in enumerate(pr.get_comments()):
                    if j >= 10:
                        break
                    comments.append({
                        'author': comment.user.login if comment.user else 'unknown',
                        'body': comment.body,
                        'created_at': comment.created_at
                    })
                
                # Get review comments (limit to first 10)
                review_comments = []
                for j, comment in enumerate(pr.get_review_comments()):
                    if j >= 10:
                        break
                    review_comments.append({
                        'author': comment.user.login if comment.user else 'unknown',
                        'body': comment.body,
                        'path': comment.path,
                        'created_at': comment.created_at
                    })
                
                prs.append({
                    'number': pr.number,
                    'title': pr.title,
                    'body': pr.body or "",
                    'state': pr.state,
                    'author': pr.user.login if pr.user else 'unknown',
                    'created_at': pr.created_at,
                    'updated_at': pr.updated_at,
                    'closed_at': pr.closed_at,
                    'merged_at': pr.merged_at,
                    'base_branch': pr.base.ref,
                    'head_branch': pr.head.ref,
                    'labels': [label.name for label in pr.labels],
                    'comments': comments,
                    'review_comments': review_comments
                })
            
            logger.info(f"Extracted {len(prs)} pull requests")
            return prs
            
        except GithubException as e:
            logger.error(f"Failed to extract pull requests: {str(e)}")
            return []
        except Exception as e:
            logger.error(f"Unexpected error extracting pull requests: {str(e)}")
            return []
    
    def cleanup(self, repo_path: str):
        """
        Clean up temporary repository directory.
        
        Args:
            repo_path: Local path to the repository
        """
        try:
            if os.path.exists(repo_path):
                shutil.rmtree(repo_path)
                logger.info(f"Cleaned up {repo_path}")
        except Exception as e:
            logger.error(f"Failed to cleanup {repo_path}: {str(e)}")

