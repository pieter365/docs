# Storybook MCP Server

A Model Context Protocol (MCP) server that enables AI assistants like Claude Code to seamlessly work with Storybook stories and React components.

## What is This?

This repository contains a fully functional MCP server that bridges the gap between Storybook and React development. It allows Claude Code CLI to:

- 📖 **Read and parse** Storybook story files
- 🔄 **Convert stories** to standalone React components
- ✨ **Generate stories** from React components automatically
- 🔍 **Extract metadata** about components, props, and controls
- 🚀 **Automate workflows** like bulk story generation and validation

## Quick Start

### 1. Build the Server

```bash
cd storybook-mcp-server
npm install
npm run build
```

### 2. Configure Claude Code

Create `.claude/mcp.json` in your Storybook project:

```json
{
  "mcpServers": {
    "storybook": {
      "command": "node",
      "args": ["/absolute/path/to/this/repo/storybook-mcp-server/dist/index.js"]
    }
  }
}
```

**Note:** Replace `/absolute/path/to/this/repo/` with the actual path where you cloned this repository.

### 3. Start Using with Claude Code

```bash
cd /path/to/your/storybook-project
claude
```

Then use natural language:

```
List all Storybook stories in this project
```

```
Convert the Primary story from Button.stories.tsx to a standalone component
```

```
Generate a Storybook story for the LoginForm component
```

## Features

### 6 Powerful Tools

| Tool | Description |
|------|-------------|
| `list_stories` | Find all Storybook story files in a project |
| `parse_story` | Extract metadata, component references, args, and argTypes |
| `convert_story_to_component` | Convert Storybook stories → standalone React components |
| `generate_story_from_component` | Generate Storybook stories ← React components |
| `parse_component` | Extract prop types and component information |
| `extract_story_props` | Get args and controls from story files |

## Use Cases

### Daily Development

**Generate stories for new components:**
```
I just created a new DatePicker component. Generate a Storybook story for it.
```

**Convert story to component:**
```
Convert the "WithAvatar" story from UserCard.stories.tsx to a reusable component
```

### Refactoring & Migration

**Check story coverage:**
```
List all React components in src/components/ and tell me which ones don't have stories yet
```

**Bulk generation:**
```
Generate Storybook stories for all components in src/components/ that don't have them
```

**Validate consistency:**
```
Parse Button.tsx and Button.stories.tsx, then check if the story args match the component props
```

### Documentation

**Extract component info:**
```
Parse all story files and create a markdown table with component names, props, and controls
```

**Generate examples:**
```
For each story in the project, create example code showing how to use the component
```

## Project Structure

```
.
├── storybook-mcp-server/       # The MCP server
│   ├── src/
│   │   ├── index.ts            # Main MCP server
│   │   └── storyParser.ts      # Parsing utilities
│   ├── examples/               # Sample files for testing
│   ├── dist/                   # Built JavaScript (after npm run build)
│   ├── README.md               # Technical documentation
│   └── USAGE.md                # Practical usage examples
│
└── README.md                   # This file
```

## How It Works

The MCP server:

1. **Runs as a background process** that Claude Code communicates with
2. **Receives requests** via the Model Context Protocol
3. **Parses your files** using regex patterns to extract metadata
4. **Generates code** based on templates and extracted information
5. **Returns results** to Claude Code in structured JSON format

Claude Code then uses this information to help you with natural language commands.

## Requirements

- **Node.js 18+**
- **npm** or **yarn**
- **Claude Code CLI** installed
- A **Storybook project** to work with

## Example Workflows

### Workflow 1: Create Component Library Docs

```
1. List all stories in src/stories/
2. For each story, extract the component name, props, and argTypes
3. Generate a components.md file with a table showing all components
4. Include code examples from the story args
```

### Workflow 2: Migrate Story Format

```
1. List all stories in the project
2. Parse each one and identify which use CSF2 format
3. Show me the list of files that need migration
4. Help me convert them one by one to CSF3 format
```

### Workflow 3: Component from Story

```
1. Parse the "Success" story from Alert.stories.tsx
2. Convert it to a standalone SuccessAlert component
3. Save it to src/components/SuccessAlert.tsx
4. Show me the generated code
```

### Workflow 4: Validate Props

```
1. Find all component/story pairs (e.g., Button.tsx and Button.stories.tsx)
2. For each pair, compare component props vs story args
3. Report any mismatches or missing props
```

## Documentation

- **[storybook-mcp-server/README.md](storybook-mcp-server/README.md)** - Technical documentation, API reference, installation
- **[storybook-mcp-server/USAGE.md](storybook-mcp-server/USAGE.md)** - Practical examples, tips, and workflows

## Testing

Test the server directly:

```bash
cd storybook-mcp-server
./test-server.sh
```

This will verify all 6 tools are working correctly.

## Architecture

```
┌─────────────────┐
│   Claude Code   │  ← You interact with natural language
└────────┬────────┘
         │ MCP Protocol (JSON-RPC)
         ↓
┌─────────────────┐
│   MCP Server    │  ← Parses & processes requests
│  (Node.js)      │
└────────┬────────┘
         │ File System
         ↓
┌─────────────────┐
│  Your Project   │  ← Storybook stories & React components
│  ├── *.stories  │
│  └── *.tsx      │
└─────────────────┘
```

## Troubleshooting

### Server not starting

```bash
# Check if dependencies are installed
cd storybook-mcp-server
npm install

# Rebuild
npm run build

# Test directly
echo '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}' | node dist/index.js
```

### Tools not appearing in Claude Code

1. Verify the path in `.claude/mcp.json` is absolute and correct
2. Restart Claude Code after config changes
3. Check server logs (they appear on stderr)

### Parse errors

- Ensure story files use standard Storybook formats (CSF2 or CSF3)
- Check for syntax errors in your files
- For complex files, the regex parser may need enhancement

## Limitations

- Uses regex-based parsing (may not handle all edge cases)
- Currently supports React only (not Vue, Angular, etc.)
- Assumes standard Storybook naming conventions (`*.stories.{js,jsx,ts,tsx}`)
- For production use with complex codebases, consider AST-based parsing

## Future Enhancements

- [ ] AST-based parsing using Babel or TypeScript Compiler API
- [ ] Support for Vue, Angular, Svelte, and other frameworks
- [ ] Storybook addon integration
- [ ] Automated tests and decorators
- [ ] Interactive story editing
- [ ] Remote server deployment option
- [ ] Caching for large projects

## Contributing

Contributions welcome! To contribute:

1. Fork this repository
2. Create a feature branch
3. Make your changes
4. Test with `./test-server.sh`
5. Submit a pull request

## License

MIT

## About MCP

The Model Context Protocol (MCP) is an open standard developed by Anthropic that enables AI systems to integrate with external tools and data sources. Learn more:

- [MCP Specification](https://modelcontextprotocol.io/specification)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Claude Code Documentation](https://docs.claude.com/en/docs/claude-code/mcp)

## Support

- **Issues**: [Report bugs or request features](../../issues)
- **Questions**: Check the [USAGE.md](storybook-mcp-server/USAGE.md) guide
- **Examples**: See the [examples directory](storybook-mcp-server/examples/)

---

Built with ❤️ for the Storybook and React community
