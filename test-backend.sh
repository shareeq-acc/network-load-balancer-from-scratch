#!/bin/bash

# Quick test to verify backend server starts correctly

echo "Testing backend server startup..."
echo ""

# Start a backend server on port 9999
PORT=9999 go run backend/server.go &
SERVER_PID=$!

echo "Started server with PID: $SERVER_PID"
echo "Waiting for server to be ready..."

# Wait a moment for server to start
sleep 2

# Test health endpoint
echo "Testing health endpoint..."
curl -s http://localhost:9999/health
echo ""

# Test main endpoint
echo "Testing main endpoint..."
curl -s http://localhost:9999/
echo ""

# Cleanup
echo "Stopping server..."
kill $SERVER_PID 2>/dev/null

echo "✅ Test complete!"
