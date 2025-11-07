#!/bin/bash

# Script to run the frontend

echo "🚀 Starting RAG Knowledge Platform Frontend..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📥 Installing dependencies..."
    npm install
fi

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "⚠️  Warning: .env.local file not found!"
    echo "Creating default .env.local..."
    echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
    echo "✅ Created .env.local with default settings"
fi

# Run the development server
echo "✅ Starting Next.js development server..."
echo "📍 Frontend will be available at: http://localhost:3000"
echo ""
npm run dev

