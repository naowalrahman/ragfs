"""
Configuration management for the RAG Knowledge Platform.
Loads settings from environment variables.
"""
from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # AWS Configuration
    aws_region: str = "us-east-1"
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    aws_session_token: Optional[str] = None  # Only needed for temporary credentials
    
    # AWS Bedrock Knowledge Base - Made optional with defaults
    knowledge_base_id: str = ""
    data_source_id: str = ""
    s3_bucket_name: str = ""
    
    # GitHub Configuration
    github_token: Optional[str] = None
    
    # Backend Configuration
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    
    # Storage
    temp_storage_path: str = "./temp_repos"
    
    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"


# Global settings instance
try:
    settings = Settings()
    
    # Show what was loaded
    print("📝 Configuration loaded:")
    print(f"   AWS Region: {settings.aws_region}")
    if settings.aws_access_key_id:
        print(f"   AWS Access Key: {settings.aws_access_key_id[:4]}...{settings.aws_access_key_id[-4:]} ({len(settings.aws_access_key_id)} chars)")
    else:
        print(f"   AWS Access Key: NOT SET")
    if settings.aws_secret_access_key:
        print(f"   AWS Secret Key: {'*' * 8} ({len(settings.aws_secret_access_key)} chars)")
    else:
        print(f"   AWS Secret Key: NOT SET")
    if settings.aws_session_token:
        print(f"   AWS Session Token: {'*' * 8} (temporary credentials)")
    print(f"   Knowledge Base ID: {settings.knowledge_base_id or 'NOT SET'}")
    print(f"   Data Source ID: {settings.data_source_id or 'NOT SET'}")
    print(f"   S3 Bucket: {settings.s3_bucket_name or 'NOT SET'}")
    
    # Validate critical settings
    if not settings.knowledge_base_id:
        print("⚠️  Warning: KNOWLEDGE_BASE_ID not set in .env file")
    if not settings.data_source_id:
        print("⚠️  Warning: DATA_SOURCE_ID not set in .env file")
    if not settings.s3_bucket_name:
        print("⚠️  Warning: S3_BUCKET_NAME not set in .env file")
    if not settings.aws_access_key_id:
        print("⚠️  Warning: AWS_ACCESS_KEY_ID not set in .env file")
    if not settings.aws_secret_access_key:
        print("⚠️  Warning: AWS_SECRET_ACCESS_KEY not set in .env file")
        
except Exception as e:
    # If .env doesn't exist or has issues, create settings with defaults
    print(f"⚠️  Warning: Could not load settings from .env file: {e}")
    print("📝 Please create a .env file with your AWS configuration.")
    print("   See .env.example for reference.")
    settings = Settings(
        knowledge_base_id="",
        data_source_id="",
        s3_bucket_name=""
    )
