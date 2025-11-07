# Quick Start Guide

Get up and running with RAG Knowledge Platform in 15 minutes!

## Prerequisites

- AWS Account with Bedrock access
- Python 3.9+
- Node.js 18+
- Git

## 1. AWS Setup (10 minutes)

### Create S3 Bucket
```bash
# In AWS Console → S3
# Create bucket: ragfs-knowledge-base-[unique-id]
# Enable versioning
```

### Create Bedrock Knowledge Base
```bash
# In AWS Console → Bedrock → Knowledge Bases
# Name: ragfs-knowledge-base
# Connect to S3 bucket
# Use Titan Embeddings V2
# Quick create vector store
# Save: Knowledge Base ID and Data Source ID
```

### Create IAM User
```bash
# In AWS Console → IAM → Users
# Create user: ragfs-api-user
# Attach: AmazonBedrockFullAccess
# Add S3 permissions for your bucket
# Create access keys
# Save: Access Key ID and Secret
```

## 2. Backend Setup (2 minutes)

```bash
# Clone and setup
cd /path/to/ragfs
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env with your AWS credentials

# Run
python -m uvicorn app.main:app --reload
```

✅ Backend running at: http://localhost:8000

## 3. Frontend Setup (2 minutes)

```bash
# In a new terminal
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

✅ Frontend running at: http://localhost:3000

## 4. Test It! (1 minute)

1. Open http://localhost:3000
2. Click "Ingest Repository" tab
3. Enter: `https://github.com/octocat/Hello-World`
4. Click "Start Ingestion"
5. Wait 2-3 minutes
6. Search for: `README` or `Hello World`

## Next Steps

- Read the [Complete Setup Guide](SETUP_GUIDE.md)
- Check [README.md](README.md) for API documentation
- Ingest your own repositories!

## Having Issues?

1. Check backend is running: `curl http://localhost:8000/health`
2. Check AWS credentials in `.env`
3. Verify Knowledge Base ID is correct
4. See [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed troubleshooting

