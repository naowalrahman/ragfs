"""
AWS Bedrock service for Knowledge Base interactions.
Handles document upload to S3, Knowledge Base sync, and querying.
"""
import json
import logging
import boto3
from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid

from app.config import settings
from models.schemas import SearchResult, DocumentType

logger = logging.getLogger(__name__)


class BedrockService:
    """Service for interacting with AWS Bedrock Knowledge Base."""
    
    def __init__(self):
        """Initialize the Bedrock service with AWS clients."""
        # Initialize AWS clients
        session_kwargs = {
            'region_name': settings.aws_region
        }
        
        if settings.aws_access_key_id and settings.aws_secret_access_key:
            session_kwargs['aws_access_key_id'] = settings.aws_access_key_id
            session_kwargs['aws_secret_access_key'] = settings.aws_secret_access_key
            
            # Add session token if provided (for temporary credentials)
            if settings.aws_session_token:
                session_kwargs['aws_session_token'] = settings.aws_session_token
                logger.info("Using temporary AWS credentials with session token")
            else:
                logger.info("Using permanent AWS IAM user credentials (no session token)")
            
            logger.info(f"Access Key ID: {settings.aws_access_key_id[:4]}...{settings.aws_access_key_id[-4:]}")
            logger.info(f"Secret Key length: {len(settings.aws_secret_access_key)} characters")
        else:
            logger.warning("No AWS credentials in settings, will use default credential chain (AWS CLI, environment, IAM role)")
        
        logger.info(f"AWS Region: {settings.aws_region}")
        logger.info(f"S3 Bucket: {settings.s3_bucket_name}")
        logger.info(f"Knowledge Base ID: {settings.knowledge_base_id}")
        
        try:
            self.session = boto3.Session(**session_kwargs)
        except Exception as e:
            logger.error(f"❌ Failed to create boto3 session: {str(e)}")
            raise
        
        # Verify credentials work
        try:
            sts = self.session.client('sts')
            identity = sts.get_caller_identity()
            logger.info(f"✅ AWS credentials verified!")
            logger.info(f"   Account: {identity['Account']}")
            logger.info(f"   User/Role: {identity['Arn']}")
            logger.info(f"   UserId: {identity['UserId']}")
        except Exception as e:
            logger.error(f"❌ AWS credentials verification failed: {str(e)}")
            logger.error(f"   Error type: {type(e).__name__}")
            logger.error(f"   Full error: {str(e)}")
            logger.error("")
            logger.error("💡 Troubleshooting steps:")
            logger.error("   1. Verify your AWS_ACCESS_KEY_ID in .env file")
            logger.error("   2. Verify your AWS_SECRET_ACCESS_KEY in .env file")
            logger.error("   3. Check that the IAM user still exists and is active")
            logger.error("   4. Verify the access key is active in AWS Console")
            logger.error("   5. Try creating new access keys in AWS Console")
            raise
        
        self.s3_client = self.session.client('s3')
        self.bedrock_agent_client = self.session.client('bedrock-agent-runtime')
        self.bedrock_agent_mgmt_client = self.session.client('bedrock-agent')
        self.bedrock_runtime_client = self.session.client('bedrock-runtime')
        
        self.knowledge_base_id = settings.knowledge_base_id
        self.data_source_id = settings.data_source_id
        self.s3_bucket_name = settings.s3_bucket_name
        self.model_id = settings.bedrock_model_id
    
    def upload_documents_to_s3(
        self,
        documents: List[Dict[str, Any]],
        repo_name: str
    ) -> List[str]:
        """
        Upload documents to S3 for Knowledge Base ingestion.
        
        Args:
            documents: List of processed documents
            repo_name: Repository name for organization
            
        Returns:
            List of S3 object keys
        """
        uploaded_keys = []
        
        for i, doc in enumerate(documents):
            try:
                # Create a unique key for this document
                doc_id = str(uuid.uuid4())
                s3_key = f"repositories/{repo_name}/documents/{doc_id}.json"
                
                # Prepare document in Bedrock format
                # Ensure content is a clean string
                content = doc['content']
                if isinstance(content, str):
                    # Content is already a string, use as-is
                    pass
                else:
                    # Convert to string if needed
                    content = str(content)
                
                bedrock_doc = {
                    'content': content,
                    'metadata': doc['metadata']
                }
                
                # Upload to S3 with proper encoding
                self.s3_client.put_object(
                    Bucket=self.s3_bucket_name,
                    Key=s3_key,
                    Body=json.dumps(bedrock_doc, ensure_ascii=False, indent=None),
                    ContentType='application/json',
                    ContentEncoding='utf-8'
                )
                
                uploaded_keys.append(s3_key)
                
                if (i + 1) % 100 == 0:
                    logger.info(f"Uploaded {i + 1}/{len(documents)} documents to S3")
                
            except Exception as e:
                logger.error(f"Failed to upload document {i}: {str(e)}")
                continue
        
        logger.info(f"Successfully uploaded {len(uploaded_keys)}/{len(documents)} documents to S3")
        return uploaded_keys
    
    def start_ingestion_job(self) -> Optional[str]:
        """
        Start an ingestion job to sync S3 documents with Knowledge Base.
        
        Returns:
            Ingestion job ID if successful, None otherwise
        """
        try:
            response = self.bedrock_agent_mgmt_client.start_ingestion_job(
                knowledgeBaseId=self.knowledge_base_id,
                dataSourceId=self.data_source_id
            )
            
            job_id = response['ingestionJob']['ingestionJobId']
            logger.info(f"Started Knowledge Base ingestion job: {job_id}")
            return job_id
            
        except Exception as e:
            logger.error(f"Failed to start ingestion job: {str(e)}")
            return None
    
    def get_ingestion_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the status of an ingestion job.
        
        Args:
            job_id: Ingestion job ID
            
        Returns:
            Job status information
        """
        try:
            response = self.bedrock_agent_mgmt_client.get_ingestion_job(
                knowledgeBaseId=self.knowledge_base_id,
                dataSourceId=self.data_source_id,
                ingestionJobId=job_id
            )
            
            return response['ingestionJob']
            
        except Exception as e:
            logger.error(f"Failed to get ingestion job status: {str(e)}")
            return None
    
    async def retrieve_documents(
        self,
        query: str,
        max_results: int = 10,
        filter_type: Optional[DocumentType] = None,
        repo_url: Optional[str] = None
    ) -> List[SearchResult]:
        """
        Retrieve relevant documents from the Knowledge Base.
        
        Args:
            query: Search query
            max_results: Maximum number of results
            filter_type: Optional filter by document type
            repo_url: Optional filter by repository URL
            
        Returns:
            List of search results
        """
        try:
            # Build filter
            filter_dict = {}
            
            if filter_type:
                filter_dict['equals'] = {
                    'key': 'document_type',
                    'value': filter_type.value
                }
            
            if repo_url:
                if 'andAll' not in filter_dict:
                    filter_dict = {'andAll': [filter_dict]} if filter_dict else {'andAll': []}
                
                filter_dict['andAll'].append({
                    'equals': {
                        'key': 'repo_url',
                        'value': repo_url
                    }
                })
            
            # Prepare retrieval configuration
            retrieval_config = {
                'vectorSearchConfiguration': {
                    'numberOfResults': max_results
                }
            }
            
            if filter_dict:
                retrieval_config['vectorSearchConfiguration']['filter'] = filter_dict
            
            # Query Knowledge Base
            response = self.bedrock_agent_client.retrieve(
                knowledgeBaseId=self.knowledge_base_id,
                retrievalQuery={
                    'text': query
                },
                retrievalConfiguration=retrieval_config
            )
            
            # Process results
            results = []
            for item in response.get('retrievalResults', []):
                # Get content and ensure it's properly decoded
                content = item['content']['text']
                
                # If content looks like it's JSON-encoded, try to decode it
                if content and (content.startswith('{') or content.startswith('[')):
                    try:
                        import ast
                        decoded = ast.literal_eval(content)
                        if isinstance(decoded, str):
                            content = decoded
                    except:
                        pass  # Keep original content if decode fails
                
                # Try to decode Unicode escape sequences if present (e.g., \u251c)
                # Only do this if we see literal \u sequences (not already decoded)
                if content and isinstance(content, str) and '\\u' in content:
                    try:
                        import re
                        # Replace \uXXXX with actual Unicode characters
                        def decode_unicode_match(match):
                            code_point = int(match.group(1), 16)
                            # Skip surrogate pairs (D800-DFFF) to avoid encoding errors
                            if 0xD800 <= code_point <= 0xDFFF:
                                return match.group(0)  # Return original \uXXXX
                            try:
                                return chr(code_point)
                            except (ValueError, OverflowError):
                                return match.group(0)  # Return original if can't convert
                        content = re.sub(r'\\u([0-9a-fA-F]{4})', decode_unicode_match, content)
                    except Exception as e:
                        logger.debug(f"Could not decode Unicode escapes: {e}")
                        pass  # Keep original if decoding fails
                
                # Final safety check: ensure content is UTF-8 encodable
                # Replace any problematic characters with replacement character
                if content:
                    try:
                        # Test if content can be encoded to UTF-8
                        content.encode('utf-8', errors='strict')
                    except UnicodeEncodeError:
                        # If not, use 'replace' to substitute bad characters
                        logger.warning(f"Content contains invalid UTF-8 characters, cleaning...")
                        content = content.encode('utf-8', errors='replace').decode('utf-8', errors='replace')
                
                metadata = item.get('metadata', {})
                
                # Try to infer document_type from metadata if not explicitly set
                doc_type = metadata.get('document_type', '')
                if not doc_type:
                    # Infer from available metadata fields
                    if 'file_path' in metadata and 'start_line' in metadata:
                        doc_type = 'code'
                    elif 'commit_sha' in metadata:
                        doc_type = 'commit'
                    elif 'issue_number' in metadata:
                        doc_type = 'issue'
                    elif 'pr_number' in metadata:
                        doc_type = 'pull_request'
                    else:
                        doc_type = 'code'  # Default to code if we can't determine
                
                result = SearchResult(
                    content=content,
                    score=item.get('score', 0.0),
                    metadata=metadata,
                    document_type=doc_type,
                    source_location=self._format_source_location(metadata)
                )
                results.append(result)
            
            logger.info(f"Retrieved {len(results)} documents for query")
            return results
            
        except Exception as e:
            logger.error(f"Document retrieval failed: {str(e)}")
            raise
    
    def invoke_claude(self, query: str, context_documents: List[SearchResult]) -> str:
        """
        Invoke Claude with retrieved context to generate an answer (non-streaming).
        
        Args:
            query: User's question
            context_documents: Retrieved documents from knowledge base
            
        Returns:
            Generated answer from Claude
        """
        try:
            # Build context from retrieved documents
            context_parts = []
            for i, doc in enumerate(context_documents, 1):
                context_parts.append(
                    f"<document index=\"{i}\">\n"
                    f"<source>{doc.source_location or 'Unknown source'}</source>\n"
                    f"<document_type>{doc.document_type}</document_type>\n"
                    f"<content>\n{doc.content}\n</content>\n"
                    f"</document>"
                )
            
            context_str = "\n\n".join(context_parts)
            
            # Construct prompt for Claude
            prompt = f"""You are an AI assistant helping developers understand their codebase. You have been provided with relevant documents from a code repository knowledge base.

Here are the relevant documents:

{context_str}

Based on the above documents, please answer the following question. If the documents don't contain enough information to answer the question, say so clearly. Always cite which document(s) you're referencing in your answer.

Question: {query}

Please provide a clear, concise, and helpful answer:"""

            # Invoke Claude via Bedrock
            request_body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 4000,
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "temperature": 0.7
            }
            
            response = self.bedrock_runtime_client.invoke_model(
                modelId=self.model_id,
                body=json.dumps(request_body)
            )
            
            # Parse response
            response_body = json.loads(response['body'].read())
            answer = response_body['content'][0]['text']
            
            logger.info(f"Generated answer using Claude ({len(answer)} characters)")
            return answer
            
        except Exception as e:
            logger.error(f"Claude invocation failed: {str(e)}")
            logger.error(f"Model ID: {self.model_id}")
            raise

    def invoke_claude_stream(self, query: str, context_documents: List[SearchResult]):
        """
        Invoke Claude with streaming response for real-time conversation.
        
        Args:
            query: User's question
            context_documents: Retrieved documents from knowledge base
            
        Yields:
            Chunks of generated text from Claude
        """
        try:
            # Build context from retrieved documents
            context_parts = []
            for i, doc in enumerate(context_documents, 1):
                context_parts.append(
                    f"<document index=\"{i}\">\n"
                    f"<source>{doc.source_location or 'Unknown source'}</source>\n"
                    f"<document_type>{doc.document_type}</document_type>\n"
                    f"<content>\n{doc.content}\n</content>\n"
                    f"</document>"
                )
            
            context_str = "\n\n".join(context_parts)
            
            # Construct prompt for Claude
            prompt = f"""You are an AI assistant helping developers understand their codebase. You have been provided with relevant documents from a code repository knowledge base.

Here are the relevant documents:

{context_str}

Based on the above documents, please answer the following question. If the documents don't contain enough information to answer the question, say so clearly. Always cite which document(s) you're referencing in your answer.

Question: {query}

Please provide a clear, concise, and helpful answer:"""

            # Invoke Claude via Bedrock with streaming
            request_body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 4000,
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "temperature": 0.7
            }
            
            response = self.bedrock_runtime_client.invoke_model_with_response_stream(
                modelId=self.model_id,
                body=json.dumps(request_body)
            )
            
            # Stream the response
            stream = response.get('body')
            if stream:
                for event in stream:
                    chunk = event.get('chunk')
                    if chunk:
                        chunk_obj = json.loads(chunk.get('bytes').decode())
                        
                        if chunk_obj['type'] == 'content_block_delta':
                            if chunk_obj['delta']['type'] == 'text_delta':
                                text = chunk_obj['delta']['text']
                                yield text
                        elif chunk_obj['type'] == 'message_stop':
                            break
            
            logger.info("Streaming response completed")
            
        except Exception as e:
            logger.error(f"Claude streaming invocation failed: {str(e)}")
            logger.error(f"Model ID: {self.model_id}")
            raise
    
    async def query(
        self,
        query: str,
        max_results: int = 10,
        filter_type: Optional[DocumentType] = None,
        repo_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        RAG query: Retrieve documents and generate answer using Claude (non-streaming).
        
        Args:
            query: User's question
            max_results: Maximum number of source documents to retrieve
            filter_type: Optional filter by document type
            repo_url: Optional filter by repository URL
            
        Returns:
            Dictionary with 'answer' and 'sources'
        """
        try:
            # Step 1: Retrieve relevant documents
            logger.info(f"Retrieving documents for query: {query}")
            sources = await self.retrieve_documents(
                query=query,
                max_results=max_results,
                filter_type=filter_type,
                repo_url=repo_url
            )
            
            # Step 2: Generate answer using Claude
            if sources:
                logger.info(f"Generating answer with {len(sources)} source documents")
                answer = self.invoke_claude(query, sources)
            else:
                logger.warning("No documents found for query")
                answer = "I couldn't find any relevant information in the knowledge base to answer your question. Please try rephrasing your query or ensure the relevant repositories have been ingested."
            
            return {
                'answer': answer,
                'sources': sources
            }
            
        except Exception as e:
            logger.error(f"RAG query failed: {str(e)}")
            raise

    async def query_stream(
        self,
        query: str,
        max_results: int = 10,
        filter_type: Optional[DocumentType] = None,
        repo_url: Optional[str] = None
    ):
        """
        RAG query with streaming: Retrieve documents and stream Claude's response.
        
        Args:
            query: User's question
            max_results: Maximum number of source documents to retrieve
            filter_type: Optional filter by document type
            repo_url: Optional filter by repository URL
            
        Yields:
            Dictionary events for streaming (sources first, then text chunks)
        """
        try:
            # Step 1: Retrieve relevant documents
            logger.info(f"Retrieving documents for query: {query}")
            sources = await self.retrieve_documents(
                query=query,
                max_results=max_results,
                filter_type=filter_type,
                repo_url=repo_url
            )
            
            # First, send the sources as a separate event
            yield {
                'type': 'sources',
                'sources': [source.model_dump() for source in sources],
                'total_sources': len(sources)
            }
            
            # Step 2: Stream answer using Claude
            if sources:
                logger.info(f"Streaming answer with {len(sources)} source documents")
                for text_chunk in self.invoke_claude_stream(query, sources):
                    yield {
                        'type': 'text',
                        'text': text_chunk
                    }
            else:
                logger.warning("No documents found for query")
                yield {
                    'type': 'text',
                    'text': "I couldn't find any relevant information in the knowledge base to answer your question. Please try rephrasing your query or ensure the relevant repositories have been ingested."
                }
            
            # Send completion event
            yield {
                'type': 'done'
            }
            
        except Exception as e:
            logger.error(f"RAG streaming query failed: {str(e)}")
            yield {
                'type': 'error',
                'error': str(e)
            }
            raise
    
    def _format_source_location(self, metadata: Dict[str, Any]) -> str:
        """
        Format a human-readable source location from metadata.
        
        Args:
            metadata: Document metadata
            
        Returns:
            Formatted source location string
        """
        doc_type = metadata.get('document_type', '')
        
        if doc_type == DocumentType.CODE or doc_type == 'code':
            file_path = metadata.get('file_path', '')
            if file_path:
                start_line = metadata.get('start_line', '')
                end_line = metadata.get('end_line', '')
                if start_line and end_line:
                    return f"{file_path}:{start_line}-{end_line}"
                return file_path
            
        elif doc_type == DocumentType.COMMIT or doc_type == 'commit':
            commit_sha = metadata.get('commit_sha', '')
            if commit_sha:
                return f"Commit {commit_sha[:8]}"
        
        elif doc_type == DocumentType.ISSUE or doc_type == 'issue':
            issue_number = metadata.get('issue_number', '')
            if issue_number:
                return f"Issue #{issue_number}"
        
        elif doc_type == DocumentType.PULL_REQUEST or doc_type == 'pull_request':
            pr_number = metadata.get('pr_number', '')
            if pr_number:
                return f"Pull Request #{pr_number}"
        
        # Fallback: try to construct something meaningful from available metadata
        if 'file_path' in metadata:
            return metadata['file_path']
        elif 'commit_sha' in metadata:
            return f"Commit {metadata['commit_sha'][:8]}"
        elif 'issue_number' in metadata:
            return f"Issue #{metadata['issue_number']}"
        elif 'pr_number' in metadata:
            return f"PR #{metadata['pr_number']}"
        elif 'repo_name' in metadata:
            return metadata['repo_name']
        
        # Last resort: return a generic label
        return "Document"
    
    def list_documents_in_s3(self, repo_name: str) -> List[str]:
        """
        List all documents in S3 for a given repository.
        
        Args:
            repo_name: Repository name or full path (username/repo_name)
            
        Returns:
            List of S3 object keys
        """
        try:
            prefix = f"repositories/{repo_name}/documents/"
            
            paginator = self.s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=self.s3_bucket_name, Prefix=prefix)
            
            keys = []
            for page in pages:
                if 'Contents' in page:
                    keys.extend([obj['Key'] for obj in page['Contents']])
            
            return keys
            
        except Exception as e:
            logger.error(f"Failed to list S3 documents: {str(e)}")
            return []
    
    def delete_repository_documents(self, repo_name: str) -> bool:
        """
        Delete all documents for a repository from S3.
        
        Args:
            repo_name: Repository name or full path (username/repo_name)
            
        Returns:
            True if successful, False otherwise
        """
        try:
            keys = self.list_documents_in_s3(repo_name)
            
            if not keys:
                logger.info(f"No documents found for {repo_name}")
                return True
            
            # Delete in batches of 1000 (S3 limit)
            for i in range(0, len(keys), 1000):
                batch = keys[i:i+1000]
                delete_objects = [{'Key': key} for key in batch]
                
                self.s3_client.delete_objects(
                    Bucket=self.s3_bucket_name,
                    Delete={'Objects': delete_objects}
                )
            
            logger.info(f"Deleted {len(keys)} documents for {repo_name}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete documents: {str(e)}")
            return False
    
    def list_ingested_repositories(self) -> List[Dict[str, Any]]:
        """
        List all ingested repositories by scanning S3 bucket.
        S3 structure: repositories/{username}/{repo_name}/documents/{doc_id}.json
        
        Returns:
            List of repository information dictionaries
        """
        try:
            prefix = "repositories/"
            
            logger.info(f"Scanning S3 bucket '{self.s3_bucket_name}' with prefix '{prefix}'")
            
            # Step 1: Get all usernames (first level)
            paginator = self.s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(
                Bucket=self.s3_bucket_name,
                Prefix=prefix,
                Delimiter='/'
            )
            
            usernames = set()
            for page in pages:
                if 'CommonPrefixes' in page:
                    for common_prefix in page['CommonPrefixes']:
                        username_path = common_prefix['Prefix']
                        username = username_path.replace(prefix, '').rstrip('/')
                        if username:
                            usernames.add(username)
                            logger.info(f"Found username folder: {username}")
            
            logger.info(f"Found {len(usernames)} usernames: {usernames}")
            
            # Step 2: For each username, get all repositories
            repositories = []
            repo_full_paths_seen = set()
            
            for username in usernames:
                username_prefix = f"{prefix}{username}/"
                logger.info(f"Scanning repositories for user: {username}")
                
                user_paginator = self.s3_client.get_paginator('list_objects_v2')
                user_pages = user_paginator.paginate(
                    Bucket=self.s3_bucket_name,
                    Prefix=username_prefix,
                    Delimiter='/'
                )
                
                for page in user_pages:
                    if 'CommonPrefixes' in page:
                        for common_prefix in page['CommonPrefixes']:
                            repo_path = common_prefix['Prefix']
                            repo_name = repo_path.replace(username_prefix, '').rstrip('/')
                            if repo_name:
                                full_path = f"{username}/{repo_name}"
                                if full_path not in repo_full_paths_seen:
                                    repo_full_paths_seen.add(full_path)
                                    logger.info(f"Found repository: {username}/{repo_name}")
            
            logger.info(f"Found {len(repo_full_paths_seen)} repositories total")
            
            # Step 3: For each repository, get document count and last modified time
            for full_path in repo_full_paths_seen:
                repo_prefix = f"{prefix}{full_path}/documents/"
                username, repo_name = full_path.split('/', 1)
                
                try:
                    # List all documents for this repository
                    doc_paginator = self.s3_client.get_paginator('list_objects_v2')
                    doc_pages = doc_paginator.paginate(
                        Bucket=self.s3_bucket_name,
                        Prefix=repo_prefix
                    )
                    
                    document_count = 0
                    last_modified = None
                    
                    for doc_page in doc_pages:
                        if 'Contents' in doc_page:
                            for obj in doc_page['Contents']:
                                document_count += 1
                                obj_last_modified = obj['LastModified']
                                if last_modified is None or obj_last_modified > last_modified:
                                    last_modified = obj_last_modified
                    
                    if document_count > 0:  # Only include repos with documents
                        # Try to extract repo URL from metadata of first document
                        repo_url = self._extract_repo_url_from_s3(full_path)
                        
                        repositories.append({
                            'repo_name': full_path,  # Use full path as repo_name (username/repo)
                            'repo_url': repo_url or f"https://github.com/{full_path}",  # Fallback
                            'document_count': document_count,
                            'ingested_at': last_modified.isoformat() if last_modified else datetime.now().isoformat(),
                            'last_commit_sha': None  # Could be extracted from metadata if needed
                        })
                        
                        logger.info(f"Added repository {full_path} with {document_count} documents")
                        
                except Exception as e:
                    logger.error(f"Error processing repository {full_path}: {str(e)}")
                    continue
            
            logger.info(f"Found {len(repositories)} ingested repositories in S3")
            return repositories
            
        except Exception as e:
            logger.error(f"Failed to list ingested repositories: {str(e)}", exc_info=True)
            return []
    
    def _extract_repo_url_from_s3(self, repo_full_path: str) -> Optional[str]:
        """
        Extract repository URL from metadata of first document in S3.
        
        Args:
            repo_full_path: Full repository path (username/repo_name)
            
        Returns:
            Repository URL if found, None otherwise
        """
        try:
            prefix = f"repositories/{repo_full_path}/documents/"
            
            # Get first document
            response = self.s3_client.list_objects_v2(
                Bucket=self.s3_bucket_name,
                Prefix=prefix,
                MaxKeys=1
            )
            
            if 'Contents' in response and len(response['Contents']) > 0:
                first_key = response['Contents'][0]['Key']
                
                # Get the object
                obj_response = self.s3_client.get_object(
                    Bucket=self.s3_bucket_name,
                    Key=first_key
                )
                
                # Parse JSON content
                content = json.loads(obj_response['Body'].read())
                
                # Extract repo_url from metadata
                if 'metadata' in content and 'repo_url' in content['metadata']:
                    return content['metadata']['repo_url']
            
            return None
            
        except Exception as e:
            logger.debug(f"Could not extract repo URL for {repo_full_path}: {str(e)}")
            return None

