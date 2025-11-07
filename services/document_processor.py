"""
Document processing service.
Handles chunking and formatting of code, commits, issues, and PRs for ingestion.
"""
import json
import logging
from typing import List, Dict, Any
from datetime import datetime

from utils.chunking import CodeChunker
from models.schemas import DocumentType

logger = logging.getLogger(__name__)


class DocumentProcessor:
    """Service for processing and formatting documents for Bedrock Knowledge Base."""
    
    def __init__(self):
        """Initialize the document processor."""
        self.code_chunker = CodeChunker(max_chunk_size=1500, overlap=200)
    
    def process_code_files(
        self,
        code_files: List[Dict[str, Any]],
        repo_url: str,
        repo_name: str
    ) -> List[Dict[str, Any]]:
        """
        Process code files into chunked documents.
        
        Args:
            code_files: List of code files with content
            repo_url: Repository URL
            repo_name: Repository name
            
        Returns:
            List of processed documents
        """
        documents = []
        
        for file_info in code_files:
            file_path = file_info['file_path']
            content = file_info['content']
            
            # Chunk the file content
            chunks = self.code_chunker.chunk_code_file(content, file_path)
            
            for i, chunk in enumerate(chunks):
                # Create document
                doc = {
                    'type': DocumentType.CODE,
                    'content': self._format_code_chunk(
                        chunk['content'],
                        file_path,
                        chunk.get('start_line', 1),
                        chunk.get('end_line', len(content.split('\n')))
                    ),
                    'metadata': {
                        'document_type': DocumentType.CODE,
                        'repo_url': repo_url,
                        'repo_name': repo_name,
                        'file_path': file_path,
                        'chunk_index': i,
                        'total_chunks': len(chunks),
                        'start_line': chunk.get('start_line', 1),
                        'end_line': chunk.get('end_line', len(content.split('\n'))),
                        'file_extension': file_info.get('extension', ''),
                        'ingested_at': datetime.utcnow().isoformat()
                    }
                }
                
                documents.append(doc)
        
        logger.info(f"Processed {len(documents)} code document chunks from {len(code_files)} files")
        return documents
    
    def process_commits(
        self,
        commits: List[Dict[str, Any]],
        repo_url: str,
        repo_name: str
    ) -> List[Dict[str, Any]]:
        """
        Process commits into documents.
        
        Args:
            commits: List of commits
            repo_url: Repository URL
            repo_name: Repository name
            
        Returns:
            List of processed documents
        """
        documents = []
        
        for commit in commits:
            # Format commit content
            content = self._format_commit(commit)
            
            doc = {
                'type': DocumentType.COMMIT,
                'content': content,
                'metadata': {
                    'document_type': DocumentType.COMMIT,
                    'repo_url': repo_url,
                    'repo_name': repo_name,
                    'commit_sha': commit['sha'],
                    'commit_author': commit['author'],
                    'commit_author_email': commit.get('author_email'),
                    'commit_date': commit['date'].isoformat() if isinstance(commit['date'], datetime) else commit['date'],
                    'ingested_at': datetime.utcnow().isoformat()
                }
            }
            
            documents.append(doc)
        
        logger.info(f"Processed {len(documents)} commit documents")
        return documents
    
    def process_issues(
        self,
        issues: List[Dict[str, Any]],
        repo_url: str,
        repo_name: str
    ) -> List[Dict[str, Any]]:
        """
        Process issues into documents.
        
        Args:
            issues: List of issues
            repo_url: Repository URL
            repo_name: Repository name
            
        Returns:
            List of processed documents
        """
        documents = []
        
        for issue in issues:
            # Format issue content
            content = self._format_issue(issue)
            
            doc = {
                'type': DocumentType.ISSUE,
                'content': content,
                'metadata': {
                    'document_type': DocumentType.ISSUE,
                    'repo_url': repo_url,
                    'repo_name': repo_name,
                    'issue_number': issue['number'],
                    'issue_title': issue['title'],
                    'issue_state': issue['state'],
                    'issue_author': issue['author'],
                    'issue_labels': ','.join(issue.get('labels', [])),
                    'created_at': issue['created_at'].isoformat() if isinstance(issue['created_at'], datetime) else issue['created_at'],
                    'ingested_at': datetime.utcnow().isoformat()
                }
            }
            
            documents.append(doc)
        
        logger.info(f"Processed {len(documents)} issue documents")
        return documents
    
    def process_pull_requests(
        self,
        prs: List[Dict[str, Any]],
        repo_url: str,
        repo_name: str
    ) -> List[Dict[str, Any]]:
        """
        Process pull requests into documents.
        
        Args:
            prs: List of pull requests
            repo_url: Repository URL
            repo_name: Repository name
            
        Returns:
            List of processed documents
        """
        documents = []
        
        for pr in prs:
            # Format PR content
            content = self._format_pull_request(pr)
            
            doc = {
                'type': DocumentType.PULL_REQUEST,
                'content': content,
                'metadata': {
                    'document_type': DocumentType.PULL_REQUEST,
                    'repo_url': repo_url,
                    'repo_name': repo_name,
                    'pr_number': pr['number'],
                    'pr_title': pr['title'],
                    'pr_state': pr['state'],
                    'pr_author': pr['author'],
                    'pr_labels': ','.join(pr.get('labels', [])),
                    'base_branch': pr.get('base_branch'),
                    'head_branch': pr.get('head_branch'),
                    'created_at': pr['created_at'].isoformat() if isinstance(pr['created_at'], datetime) else pr['created_at'],
                    'merged': pr.get('merged_at') is not None,
                    'ingested_at': datetime.utcnow().isoformat()
                }
            }
            
            documents.append(doc)
        
        logger.info(f"Processed {len(documents)} pull request documents")
        return documents
    
    def _format_code_chunk(
        self,
        content: str,
        file_path: str,
        start_line: int,
        end_line: int
    ) -> str:
        """Format a code chunk for indexing."""
        return f"""File: {file_path}
Lines: {start_line}-{end_line}

{content}
"""
    
    def _format_commit(self, commit: Dict[str, Any]) -> str:
        """Format a commit for indexing."""
        date_str = commit['date'].isoformat() if isinstance(commit['date'], datetime) else str(commit['date'])
        
        content = f"""Commit: {commit['sha'][:8]}
Author: {commit['author']}
Date: {date_str}

Message:
{commit['message']}
"""
        
        if commit.get('diff'):
            content += f"\nChanges:\n{commit['diff'][:5000]}"  # Limit diff size
        
        return content
    
    def _format_issue(self, issue: Dict[str, Any]) -> str:
        """Format an issue for indexing."""
        created_at = issue['created_at'].isoformat() if isinstance(issue['created_at'], datetime) else str(issue['created_at'])
        
        content = f"""Issue #{issue['number']}: {issue['title']}
State: {issue['state']}
Author: {issue['author']}
Created: {created_at}
Labels: {', '.join(issue.get('labels', []))}

Description:
{issue['body']}
"""
        
        # Add comments
        if issue.get('comments'):
            content += "\n\nComments:\n"
            for i, comment in enumerate(issue['comments'][:10], 1):  # Limit to 10 comments
                comment_date = comment['created_at'].isoformat() if isinstance(comment['created_at'], datetime) else str(comment['created_at'])
                content += f"\n--- Comment {i} by {comment['author']} ({comment_date}) ---\n"
                content += f"{comment['body']}\n"
        
        return content
    
    def _format_pull_request(self, pr: Dict[str, Any]) -> str:
        """Format a pull request for indexing."""
        created_at = pr['created_at'].isoformat() if isinstance(pr['created_at'], datetime) else str(pr['created_at'])
        
        content = f"""Pull Request #{pr['number']}: {pr['title']}
State: {pr['state']}
Author: {pr['author']}
Created: {created_at}
Branches: {pr.get('head_branch', 'unknown')} → {pr.get('base_branch', 'unknown')}
Labels: {', '.join(pr.get('labels', []))}
Merged: {'Yes' if pr.get('merged_at') else 'No'}

Description:
{pr['body']}
"""
        
        # Add comments
        if pr.get('comments'):
            content += "\n\nComments:\n"
            for i, comment in enumerate(pr['comments'][:10], 1):  # Limit to 10 comments
                comment_date = comment['created_at'].isoformat() if isinstance(comment['created_at'], datetime) else str(comment['created_at'])
                content += f"\n--- Comment {i} by {comment['author']} ({comment_date}) ---\n"
                content += f"{comment['body']}\n"
        
        # Add review comments
        if pr.get('review_comments'):
            content += "\n\nReview Comments:\n"
            for i, comment in enumerate(pr['review_comments'][:10], 1):  # Limit to 10 comments
                comment_date = comment['created_at'].isoformat() if isinstance(comment['created_at'], datetime) else str(comment['created_at'])
                content += f"\n--- Review Comment {i} by {comment['author']} on {comment.get('path', 'unknown')} ({comment_date}) ---\n"
                content += f"{comment['body']}\n"
        
        return content
    
    def create_bedrock_document(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a document in the format expected by Bedrock Knowledge Base.
        
        Args:
            doc: Processed document
            
        Returns:
            Document formatted for Bedrock
        """
        return {
            'content': doc['content'],
            'metadata': doc['metadata']
        }

