#!/bin/bash

# Script to run the backend server

echo "🚀 Starting RAG Knowledge Platform Backend..."
echo ""

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "❌ Virtual environment not found. Creating one..."
    python -m venv .venv
    echo "✅ Virtual environment created"
fi

# Activate virtual environment
echo "📦 Activating virtual environment..."
source .venv/bin/activate

# Check if dependencies are installed
if ! pip show fastapi &> /dev/null; then
    echo "📥 Installing dependencies..."
    pip install -r requirements.txt
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found!"
    echo "Please create a .env file with your AWS credentials."
    echo "See .env.example for reference."
    exit 1
fi

# Run the server
echo "✅ Starting FastAPI server..."
echo "📍 API will be available at: http://localhost:8000"
echo "📚 API docs will be available at: http://localhost:8000/docs"
echo ""
echo "⚠️  Running without auto-reload to prevent restart loops during repository cloning"
python -m uvicorn app.main:app

