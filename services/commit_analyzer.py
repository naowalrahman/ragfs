"""
Commit Analyzer service using AWS Bedrock Claude Sonnet 4.5.
Generates functional explanations of what code changes do, not just syntax diffs.
"""
import json
import logging
import boto3
from typing import Dict, Any, Optional
from datetime import datetime, timezone

from app.config import settings

logger = logging.getLogger(__name__)


class CommitAnalyzer:
    """Service for analyzing commits using Claude Sonnet 4.5 on AWS Bedrock."""
    
    def __init__(self):
        """Initialize the Commit Analyzer with AWS Bedrock client."""
        session_kwargs = {
            'region_name': settings.aws_region
        }
        
        if settings.aws_access_key_id and settings.aws_secret_access_key:
            session_kwargs['aws_access_key_id'] = settings.aws_access_key_id
            session_kwargs['aws_secret_access_key'] = settings.aws_secret_access_key
            
            if settings.aws_session_token:
                session_kwargs['aws_session_token'] = settings.aws_session_token
        
        self.session = boto3.Session(**session_kwargs)
        self.bedrock_runtime = self.session.client('bedrock-runtime')
        
        # Use Claude 3.5 Sonnet v2 - the standard model that works with on-demand throughput
        self.model_id = getattr(settings, 'bedrock_model_id', 'anthropic.claude-3-5-sonnet-20241022-v2:0')
        
        logger.info(f"CommitAnalyzer initialized with model: {self.model_id}")
    
    def analyze_commit(
        self,
        commit_sha: str,
        commit_message: str,
        author: str,
        date: datetime,
        diff: str,
        file_list: Optional[list] = None
    ) -> Dict[str, Any]:
        """
        Analyze a commit and generate a functional explanation.
        
        Args:
            commit_sha: The commit SHA
            commit_message: The commit message
            author: The commit author
            date: The commit date
            diff: The git diff for the commit
            file_list: Optional list of files changed
            
        Returns:
            Dictionary containing the analysis
        """
        try:
            # Build the analysis prompt
            prompt = self._build_analysis_prompt(
                commit_sha, commit_message, author, date, diff, file_list
            )
            
            # Call Claude Sonnet 4.5
            response = self._invoke_claude(prompt)
            
            # Parse the response
            analysis = self._parse_response(response, commit_sha)
            
            logger.info(f"Successfully analyzed commit {commit_sha[:8]}")
            return analysis
            
        except Exception as e:
            logger.error(f"Failed to analyze commit {commit_sha[:8]}: {str(e)}")
            raise
    
    def _build_analysis_prompt(
        self,
        commit_sha: str,
        commit_message: str,
        author: str,
        date: datetime,
        diff: str,
        file_list: Optional[list] = None
    ) -> str:
        """Build the prompt for Claude to analyze the commit."""
        
        files_changed_str = ""
        if file_list:
            files_changed_str = f"\n\nFiles changed ({len(file_list)}):\n" + "\n".join(f"  - {f}" for f in file_list[:20])
            if len(file_list) > 20:
                files_changed_str += f"\n  ... and {len(file_list) - 20} more files"
        
        # Truncate diff if too long (keep it under 15000 chars to leave room for response)
        max_diff_length = 15000
        diff_str = diff[:max_diff_length]
        if len(diff) > max_diff_length:
            diff_str += "\n\n... (diff truncated)"
        
        prompt = f"""Analyze this git commit and explain what it does functionally, not just the syntax changes.

Commit: {commit_sha[:8]}
Author: {author}
Date: {date.isoformat()}
Message: {commit_message}
{files_changed_str}

Git Diff:
```
{diff_str}
```

Please provide a comprehensive analysis in the following format:

1. **Summary**: A one-sentence summary of what this commit does (focus on the "what", not the "how")

2. **What Changed**: Explain what functionality changed. Describe the behavioral changes, new features added, bugs fixed, or functionality removed. Focus on what the code NOW DOES differently, not just what lines were added/removed.

3. **Why Important**: Explain why these changes matter. What problem does this solve? What capability does it enable? What risk does it mitigate?

4. **Technical Details**: Describe the key technical implementation details. What patterns, algorithms, or architecture decisions were made? How does this integrate with existing code?

5. **Business Impact** (if applicable): What is the user-facing or business impact? Does this improve performance, add a feature, fix a bug, or improve maintainability?

Be specific and focus on FUNCTIONALITY and BEHAVIOR, not just syntax. Explain what the code DOES, not just what changed in the diff.

Return your response in JSON format with these keys: summary, what_changed, why_important, technical_details, business_impact"""
        
        return prompt
    
    def _invoke_claude(self, prompt: str) -> str:
        """Invoke Claude Sonnet 4.5 via AWS Bedrock."""
        try:
            # Prepare the request body for Claude
            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 4000,
                "temperature": 0.3,  # Lower temperature for more focused analysis
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            })
            
            # Invoke the model
            response = self.bedrock_runtime.invoke_model(
                modelId=self.model_id,
                contentType="application/json",
                accept="application/json",
                body=body
            )
            
            # Parse response
            response_body = json.loads(response['body'].read())
            
            # Extract the text from Claude's response
            if 'content' in response_body and len(response_body['content']) > 0:
                return response_body['content'][0]['text']
            else:
                raise ValueError("Unexpected response format from Claude")
                
        except Exception as e:
            logger.error(f"Failed to invoke Claude: {str(e)}")
            raise
    
    def _parse_response(self, response: str, commit_sha: str) -> Dict[str, Any]:
        """Parse Claude's response into structured data."""
        try:
            # Try to extract JSON from the response
            # Sometimes Claude wraps JSON in markdown code blocks
            response_clean = response.strip()
            
            # Remove markdown code blocks if present
            if response_clean.startswith('```json'):
                response_clean = response_clean[7:]
            elif response_clean.startswith('```'):
                response_clean = response_clean[3:]
            
            if response_clean.endswith('```'):
                response_clean = response_clean[:-3]
            
            response_clean = response_clean.strip()
            
            # Parse JSON
            parsed = json.loads(response_clean)
            
            # Ensure all required fields are present
            analysis = {
                'commit_sha': commit_sha,
                'summary': parsed.get('summary', ''),
                'what_changed': parsed.get('what_changed', ''),
                'why_important': parsed.get('why_important', ''),
                'technical_details': parsed.get('technical_details', ''),
                'business_impact': parsed.get('business_impact', None),
                'generated_at': datetime.now(timezone.utc)
            }
            
            return analysis
            
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON from Claude response: {str(e)}")
            logger.warning(f"Response was: {response[:500]}...")
            
            # Fallback: use the raw response
            return {
                'commit_sha': commit_sha,
                'summary': 'Analysis generated (see details below)',
                'what_changed': response,
                'why_important': '',
                'technical_details': '',
                'business_impact': None,
                'generated_at': datetime.now(timezone.utc)
            }
    
    def chat_about_commit(
        self,
        commit_sha: str,
        commit_message: str,
        author: str,
        date: datetime,
        diff: str,
        user_message: str,
        conversation_history: list = None,
        file_list: Optional[list] = None
    ) -> str:
        """
        Have a conversation about a commit.
        
        Args:
            commit_sha: The commit SHA
            commit_message: The commit message
            author: The commit author
            date: The commit date
            diff: The git diff for the commit
            user_message: The user's question/message
            conversation_history: Previous messages in the conversation
            file_list: Optional list of files changed
            
        Returns:
            The assistant's response
        """
        try:
            # Build conversation context
            files_changed_str = ""
            if file_list:
                files_changed_str = f"\n\nFiles changed ({len(file_list)}):\n" + "\n".join(f"  - {f}" for f in file_list[:20])
                if len(file_list) > 20:
                    files_changed_str += f"\n  ... and {len(file_list) - 20} more files"
            
            # Truncate diff if too long
            max_diff_length = 10000
            diff_display = diff[:max_diff_length]
            if len(diff) > max_diff_length:
                diff_display += f"\n\n... (diff truncated, showing first {max_diff_length} characters of {len(diff)})"
            
            # Build the system prompt with commit context
            system_context = f"""You are an expert code reviewer helping developers understand git commits.

Commit Context:
- SHA: {commit_sha[:8]}
- Message: {commit_message}
- Author: {author}
- Date: {date.strftime('%Y-%m-%d %H:%M:%S')}{files_changed_str}

Diff:
```
{diff_display}
```

Answer the user's questions about this commit clearly and concisely. Focus on explaining:
- What the code changes do functionally
- Why the changes were made
- Technical implications
- Potential impacts

Be conversational and helpful. If the user asks about specific parts of the code, refer to the diff above."""

            # Build messages array
            messages = []
            
            # Add conversation history if it exists
            if conversation_history:
                for msg in conversation_history:
                    messages.append({
                        "role": msg.get("role"),
                        "content": msg.get("content")
                    })
            
            # Add current user message
            messages.append({
                "role": "user",
                "content": user_message
            })
            
            # Call Claude
            request_body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 2000,
                "temperature": 0.7,
                "system": system_context,
                "messages": messages
            }
            
            response = self.bedrock_runtime.invoke_model(
                modelId=self.model_id,
                body=json.dumps(request_body)
            )
            
            response_body = json.loads(response['body'].read())
            assistant_message = response_body['content'][0]['text']
            
            logger.info(f"Generated chat response for commit {commit_sha[:8]}")
            return assistant_message
            
        except Exception as e:
            logger.error(f"Failed to generate chat response for commit {commit_sha[:8]}: {str(e)}")
            raise
