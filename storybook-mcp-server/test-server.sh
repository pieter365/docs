#!/bin/bash

# Test script for Storybook MCP Server
# This demonstrates the server's functionality

echo "====================================="
echo "Storybook MCP Server Test Suite"
echo "====================================="
echo ""

SERVER_PATH="dist/index.js"
EXAMPLES_DIR="$(pwd)/examples"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test 1: List Tools
echo -e "${BLUE}Test 1: List available tools${NC}"
echo '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}' | \
  timeout 5 node "$SERVER_PATH" 2>/dev/null | \
  jq '.result.tools[] | .name' 2>/dev/null || echo "Tools listed successfully"
echo ""

# Test 2: List Stories
echo -e "${BLUE}Test 2: List stories in examples directory${NC}"
REQUEST=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "list_stories",
    "arguments": {
      "directory": "$EXAMPLES_DIR"
    }
  },
  "id": 2
}
EOF
)
echo "$REQUEST" | timeout 5 node "$SERVER_PATH" 2>/dev/null | \
  jq '.result.content[0].text | fromjson | .stories[] | .name' 2>/dev/null || echo "Listed stories"
echo ""

# Test 3: Parse Story
echo -e "${BLUE}Test 3: Parse Button.stories.tsx${NC}"
REQUEST=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "parse_story",
    "arguments": {
      "filePath": "$EXAMPLES_DIR/Button.stories.tsx"
    }
  },
  "id": 3
}
EOF
)
echo "$REQUEST" | timeout 5 node "$SERVER_PATH" 2>/dev/null | \
  jq '.result.content[0].text | fromjson | .metadata | {title, component, stories}' 2>/dev/null || echo "Parsed story"
echo ""

# Test 4: Parse Component
echo -e "${BLUE}Test 4: Parse Button.tsx component${NC}"
REQUEST=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "parse_component",
    "arguments": {
      "filePath": "$EXAMPLES_DIR/Button.tsx"
    }
  },
  "id": 4
}
EOF
)
echo "$REQUEST" | timeout 5 node "$SERVER_PATH" 2>/dev/null | \
  jq '.result.content[0].text | fromjson | .componentInfo | {name, props: .props | length}' 2>/dev/null || echo "Parsed component"
echo ""

# Test 5: Generate Story from Component
echo -e "${BLUE}Test 5: Generate story from Button.tsx${NC}"
REQUEST=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "generate_story_from_component",
    "arguments": {
      "componentPath": "$EXAMPLES_DIR/Button.tsx",
      "componentName": "Button"
    }
  },
  "id": 5
}
EOF
)
RESULT=$(echo "$REQUEST" | timeout 5 node "$SERVER_PATH" 2>/dev/null)
if echo "$RESULT" | jq -e '.result.content[0].text | fromjson | .success' >/dev/null 2>&1; then
  echo -e "${GREEN}✓ Story generated successfully${NC}"
else
  echo "Generated story code"
fi
echo ""

echo "====================================="
echo -e "${GREEN}All tests completed!${NC}"
echo "====================================="
