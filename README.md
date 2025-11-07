# RAG Knowledge Platform

An all-in-one knowledge platform for software products that vectorizes GitHub repositories (code, commits, issues, PRs) using AWS Bedrock Knowledge Base.

## Features

- 🔍 **Intelligent Code Search**: Search across entire codebases with semantic understanding
- 📝 **Commit History**: Query commit messages and diffs
- 🐛 **Issue Tracking**: Search through all issues and discussions
- 🔀 **Pull Request Analysis**: Find relevant PRs and their reviews
- 🤖 **AI-Powered**: Powered by AWS Bedrock's advanced embedding models
- 🚀 **Easy to Use**: Simple REST API and modern web interface

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Frontend  │────▶│  FastAPI API │────▶│   GitHub    │
│  (Next.js)  │     │   (Python)   │     │     API     │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Document    │
                    │  Processor   │
                    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐     ┌─────────────┐
                    │   AWS S3     │────▶│   Bedrock   │
                    │   Bucket     │     │ Knowledge   │
                    └──────────────┘     │    Base     │
                                         └─────────────┘
```

## AWS Setup Instructions

### Step 1: Create S3 Bucket

1. Log into AWS Console and navigate to **S3**
2. Click **Create bucket**
3. Enter a unique bucket name (e.g., `ragfs-knowledge-base-12345`)
4. Select your preferred region (e.g., `us-east-1`)
5. Enable **Bucket Versioning**
6. Keep default settings for the rest
7. Click **Create bucket**
8. **Note down the bucket name** for later configuration

### Step 2: Create IAM Role for Bedrock Knowledge Base

1. Navigate to **IAM** → **Roles**
2. Click **Create role**
3. Select **AWS service** as trusted entity
4. Choose **Bedrock** from the service list
5. Select the use case for Knowledge Base
6. Attach the following policies:
   - `AmazonBedrockFullAccess`
   - Create a custom inline policy for S3 access:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR_BUCKET_NAME/*",
        "arn:aws:s3:::YOUR_BUCKET_NAME"
      ]
    }
  ]
}
```

7. Name the role (e.g., `BedrockKnowledgeBaseRole`)
8. Click **Create role**
9. **Note down the Role ARN** (e.g., `arn:aws:iam::123456789012:role/BedrockKnowledgeBaseRole`)

### Step 3: Create Bedrock Knowledge Base

1. Navigate to **Amazon Bedrock** → **Knowledge bases**
2. Click **Create knowledge base**
3. Enter details:
   - **Name**: `ragfs-knowledge-base`
   - **Description**: Knowledge base for RAG software platform
   - **IAM Role**: Select the role created in Step 2
4. Click **Next**

5. Configure data source:
   - **Data source name**: `ragfs-s3-source`
   - **S3 URI**: `s3://YOUR_BUCKET_NAME/`
   - Select the bucket created in Step 1
6. Click **Next**

7. Select embeddings model:
   - Choose **Titan Embeddings G1 - Text** (`amazon.titan-embed-text-v1`) or
   - **Titan Text Embeddings V2** (`amazon.titan-embed-text-v2:0`)
8. Click **Next**

9. Configure vector store:
   - Select **Quick create a new vector store** (OpenSearch Serverless)
   - Or connect to existing OpenSearch/Pinecone/Redis
10. Click **Next** and then **Create**

11. Wait for the Knowledge Base to be created (may take 5-10 minutes)
12. **Note down**:
    - **Knowledge Base ID** (e.g., `ABCDEFGHIJ`)
    - **Data Source ID** (found in the data source details)

### Step 4: Create IAM User for API Access

1. Navigate to **IAM** → **Users**
2. Click **Add users**
3. Enter username (e.g., `ragfs-api-user`)
4. Select **Access key - Programmatic access**
5. Click **Next: Permissions**

6. Attach policies directly:
   - `AmazonBedrockFullAccess`
   - Create custom inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock-agent:Retrieve",
        "bedrock-agent:StartIngestionJob",
        "bedrock-agent:GetIngestionJob"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR_BUCKET_NAME/*",
        "arn:aws:s3:::YOUR_BUCKET_NAME"
      ]
    }
  ]
}
```

7. Click **Next** through tags
8. Review and click **Create user**
9. **Download credentials** or note down:
   - Access Key ID
   - Secret Access Key
   - ⚠️ **Keep these secure!**

### Step 5: Enable Bedrock Models (if needed)

1. Navigate to **Amazon Bedrock** → **Model access**
2. Click **Manage model access**
3. Enable the following models:
   - Titan Embeddings (for embeddings)
   - Any LLM models you want to use for generation (optional)
4. Click **Save changes**
5. Wait for access to be granted (usually instant)

## Backend Setup

### Prerequisites

- Python 3.9+
- pip
- AWS Account with Bedrock access

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd ragfs
```

2. Create and activate virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your AWS credentials and Knowledge Base details:
```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here

KNOWLEDGE_BASE_ID=ABCDEFGHIJ
DATA_SOURCE_ID=KLMNOPQRST
S3_BUCKET_NAME=ragfs-knowledge-base-12345

# Optional: GitHub token for higher rate limits
GITHUB_TOKEN=ghp_your_token_here

API_HOST=0.0.0.0
API_PORT=8000
```

### Running the Backend

Start the FastAPI server:
```bash
python -m uvicorn app.main:app --reload
```

The API will be available at: `http://localhost:8000`

API Documentation: `http://localhost:8000/docs`

## API Usage

### 1. Ingest a Repository

```bash
curl -X POST "http://localhost:8000/api/ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "repo_url": "https://github.com/owner/repo",
    "include_commits": true,
    "include_issues": true,
    "include_prs": true,
    "max_commits": 100
  }'
```

Response:
```json
{
  "job_id": "uuid-here",
  "status": "pending",
  "repo_url": "https://github.com/owner/repo",
  "created_at": "2024-01-01T00:00:00",
  "message": "Ingestion job started successfully"
}
```

### 2. Check Ingestion Status

```bash
curl "http://localhost:8000/api/ingest/status/{job_id}"
```

### 3. Query Knowledge Base

```bash
curl -X POST "http://localhost:8000/api/query" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How does authentication work?",
    "max_results": 10
  }'
```

### 4. List Repositories

```bash
curl "http://localhost:8000/api/repositories"
```

## Frontend Setup

### Prerequisites

- Node.js 18+ and npm/yarn
- Backend server running (see Backend Setup above)

### Installation

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Create environment file:
```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
```

### Running the Frontend

Start the development server:
```bash
npm run dev
# or
yarn dev
```

The frontend will be available at: `http://localhost:3000`

### Building for Production

```bash
npm run build
npm start
# or
yarn build
yarn start
```

### Frontend Features

- **Modern UI**: Built with Material-UI and Next.js 14
- **Dark Mode**: Toggle between light and dark themes
- **Real-time Updates**: Live status updates during repository ingestion
- **Syntax Highlighting**: Beautiful code display with syntax highlighting
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Type-Safe**: Full TypeScript support

## Development

### Project Structure

```
ragfs/
├── app/
│   ├── config.py                 # Configuration management
│   └── main.py                   # FastAPI application
├── models/
│   └── schemas.py                # Pydantic models
├── services/
│   ├── github_ingestion.py       # GitHub data extraction
│   ├── document_processor.py     # Document processing
│   ├── bedrock_service.py        # AWS Bedrock integration
│   └── ingestion_orchestrator.py # Pipeline orchestration
├── utils/
│   └── chunking.py               # Code chunking utilities
├── frontend/                     # Next.js frontend
│   ├── app/
│   │   ├── layout.tsx            # Root layout with theme
│   │   └── page.tsx              # Main page
│   ├── components/
│   │   ├── IngestionForm.tsx     # Repository ingestion UI
│   │   ├── SearchBar.tsx         # Search interface
│   │   ├── ResultsView.tsx       # Search results display
│   │   └── RepositoryList.tsx    # Repository management
│   ├── lib/
│   │   └── api.ts                # API client
│   ├── theme/
│   │   └── theme.ts              # Material-UI theme
│   ├── types/
│   │   └── index.ts              # TypeScript types
│   └── package.json              # Frontend dependencies
├── requirements.txt              # Python dependencies
└── README.md                     # This file
```

### Testing

Test the ingestion pipeline with a small public repository:

```bash
# Start the server
python -m uvicorn app.main:app --reload

# In another terminal, test ingestion
curl -X POST "http://localhost:8000/api/ingest" \
  -H "Content-Type: application/json" \
  -d '{"repo_url": "https://github.com/octocat/Hello-World", "max_commits": 10}'
```

## Troubleshooting

### Common Issues

1. **"Knowledge Base not found"**
   - Verify `KNOWLEDGE_BASE_ID` in `.env`
   - Check that Knowledge Base is created and active in AWS Console

2. **"Access Denied" errors**
   - Verify IAM user permissions
   - Check that AWS credentials are correct in `.env`
   - Ensure Bedrock models are enabled

3. **"Rate limit exceeded" for GitHub**
   - Add `GITHUB_TOKEN` to `.env` for higher rate limits
   - Reduce `max_commits` or wait before next request

4. **Ingestion job fails**
   - Check CloudWatch logs in AWS Console
   - Verify S3 bucket permissions
   - Ensure documents are being uploaded to S3

## Cost Considerations

- **AWS Bedrock**: Pay per embedding and query
- **OpenSearch Serverless**: Minimum ~$700/month
- **S3 Storage**: ~$0.023 per GB/month
- **Data Transfer**: Check AWS pricing

Consider using existing OpenSearch/Pinecone for cost optimization.

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

