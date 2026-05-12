#!/bin/bash

# V2 Endpoints Testing Script
# Tests all newly created V2 resume optimization endpoints

echo ""
echo "=========================================="
echo "🧪 V2 ENDPOINTS STRUCTURE TEST"
echo "=========================================="

BASE_URL="http://localhost:10000/api/v2"

# Test 1: Check if endpoints exist (without auth)
echo ""
echo "1️⃣  Testing POST /api/v2/resume/upload-master (no auth)"
echo "---"
curl -X POST "$BASE_URL/resume/upload-master" \
  -H "Content-Type: application/json" \
  -d '{"latexContent":"test"}' \
  -w "\nStatus: %{http_code}\n" 2>/dev/null | head -20

echo ""
echo "2️⃣  Testing GET /api/v2/resume/master (no auth)"
echo "---"
curl -X GET "$BASE_URL/resume/master" \
  -w "\nStatus: %{http_code}\n" 2>/dev/null | head -20

echo ""
echo "3️⃣  Testing POST /api/v2/resume/analyze (no auth)"
echo "---"
curl -X POST "$BASE_URL/resume/analyze" \
  -H "Content-Type: application/json" \
  -d '{"jobDescription":"test","extractedContentJson":{}}' \
  -w "\nStatus: %{http_code}\n" 2>/dev/null | head -20

echo ""
echo "4️⃣  Testing POST /api/v2/resume/optimize-to-target (no auth)"
echo "---"
curl -X POST "$BASE_URL/resume/optimize-to-target" \
  -H "Content-Type: application/json" \
  -d '{"extractedContentJson":{},"jobDescription":"test"}' \
  -w "\nStatus: %{http_code}\n" 2>/dev/null | head -20

echo ""
echo "5️⃣  Testing GET /api/v2/usage/stats (no auth)"
echo "---"
curl -X GET "$BASE_URL/usage/stats" \
  -w "\nStatus: %{http_code}\n" 2>/dev/null | head -20

echo ""
echo "=========================================="
echo "✅ Endpoint Structure Test Complete"
echo "=========================================="
echo ""
echo "📝 Notes:"
echo "  - All endpoints should return 401 (Unauthorized) without valid auth token"
echo "  - This confirms the endpoints exist and auth middleware is working"
echo "  - To fully test, you need a valid JWT token from the auth endpoint"
echo ""
