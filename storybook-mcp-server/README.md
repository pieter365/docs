# Storybook MCP Server

A Model Context Protocol (MCP) server that enables Claude Code to seamlessly work with Storybook stories and React components.

## Features

This MCP server provides the following tools:

- **list_stories** - Find all Storybook story files in a project
- **parse_story** - Extract metadata from story files (title, component, args, argTypes)
- **convert_story_to_component** - Convert a Storybook story to a standalone React component
- **generate_story_from_component** - Generate a Storybook story from a React component
- **parse_component** - Extract prop information from React components
- **extract_story_props** - Get props and argTypes from story files

## Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Build the Server

```bash
npm run build
```

## Usage

### Configure Claude Code

Add the server to your Claude Code MCP configuration.

**Option 1: Project-level configuration** (recommended)

Create `.claude/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "storybook": {
      "command": "node",
      "args": ["/absolute/path/to/storybook-mcp-server/dist/index.js"],
      "env": {}
    }
  }
}
```

**Option 2: User-level configuration**

Edit `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "storybook": {
      "command": "node",
      "args": ["/absolute/path/to/storybook-mcp-server/dist/index.js"],
      "env": {}
    }
  }
}
```

### Using with Claude Code

Once configured, start Claude Code in your Storybook project and use natural language commands:

#### List all stories
```
List all Storybook stories in the current project
```

#### Parse a story file
```
Parse the Button.stories.tsx file and show me its metadata
```

#### Convert story to component
```
Convert the "Primary" story from Button.stories.tsx to a standalone React component
and save it as src/components/PrimaryButton.tsx
```

#### Generate story from component
```
Create a Storybook story for the LoginForm component located at src/components/LoginForm.tsx
and save it as src/stories/LoginForm.stories.tsx
```

#### Extract props
```
Show me all the props and controls defined in the Card.stories.tsx file
```

#### Parse component
```
Parse the Header.tsx component and show me all its prop types
```

## Example Workflows

### Convert Multiple Stories to Components

```
List all stories in src/stories, then convert each "Primary" story
to a standalone component in src/components/generated/
```

### Generate Stories for All Components

```
Find all React components in src/components/*.tsx, then generate
Storybook stories for each one in src/stories/
```

### Migrate Story Format

```
Parse all story files, identify those using CSF2 format,
and help me migrate them to CSF3
```

## Development

### Run in Development Mode

```bash
npm run dev
```

### Watch Mode

```bash
npm run watch
```

### Testing the Server

You can test the server directly with the MCP protocol:

```bash
echo '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}' | npm run dev
```

## Tool Reference

### list_stories

Lists all Storybook story files in a directory.

**Parameters:**
- `directory` (string, required) - Project directory to search
- `pattern` (string, optional) - Glob pattern, defaults to `**/*.stories.{js,jsx,ts,tsx}`

**Returns:**
- List of story files with absolute and relative paths

### parse_story

Parses a story file and extracts metadata.

**Parameters:**
- `filePath` (string, required) - Absolute path to story file

**Returns:**
- Story metadata including title, component, stories, args, and argTypes

### convert_story_to_component

Converts a Storybook story to a standalone React component.

**Parameters:**
- `filePath` (string, required) - Path to story file
- `storyName` (string, required) - Name of the story (e.g., "Primary")
- `outputPath` (string, optional) - Where to save the component

**Returns:**
- Generated component code and save location

### generate_story_from_component

Generates a Storybook story from a React component.

**Parameters:**
- `componentPath` (string, required) - Path to React component
- `componentName` (string, optional) - Component name (auto-detected if not provided)
- `outputPath` (string, optional) - Where to save the story

**Returns:**
- Generated story code and save location

### parse_component

Parses a React component and extracts prop information.

**Parameters:**
- `filePath` (string, required) - Path to component file

**Returns:**
- Component name, props with types, and imports

### extract_story_props

Extracts props and argTypes from a story file.

**Parameters:**
- `filePath` (string, required) - Path to story file

**Returns:**
- Args, argTypes, and component reference

## Troubleshooting

### Server not starting

- Ensure all dependencies are installed: `npm install`
- Check that the build succeeded: `npm run build`
- Verify the path in your MCP config is absolute and correct

### Tools not appearing in Claude Code

- Restart Claude Code after changing MCP configuration
- Check server logs (stderr output)
- Verify the server process is running

### Parse errors

- Ensure story files use standard Storybook formats (CSF2 or CSF3)
- Check for syntax errors in story/component files
- For complex files, the regex-based parser may need enhancement

## Limitations

- Uses regex-based parsing (may not handle all edge cases)
- For production use, consider using AST parsing (Babel, TypeScript Compiler API)
- Currently supports React only (not Vue, Angular, etc.)
- Assumes standard Storybook file naming conventions

## Future Enhancements

- AST-based parsing for more robust code analysis
- Support for Vue, Angular, and other frameworks
- Storybook addon integration
- Automated story generation from component usage
- Bulk operations and batch processing
- Interactive story editing

## License

MIT

## Contributing

Contributions welcome! Please feel free to submit issues or pull requests.
