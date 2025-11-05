# Using Storybook MCP Server with Claude Code

This guide shows you how to use the Storybook MCP server with Claude Code to automate Storybook and React component workflows.

## Quick Start

### 1. Build and Configure

```bash
# Build the server
npm run build

# Get the absolute path
pwd
# Example output: /home/user/docs/storybook-mcp-server
```

### 2. Configure Claude Code

Create `.claude/mcp.json` in your Storybook project:

```json
{
  "mcpServers": {
    "storybook": {
      "command": "node",
      "args": ["/absolute/path/to/storybook-mcp-server/dist/index.js"]
    }
  }
}
```

### 3. Start Using

Open Claude Code in your project:

```bash
cd /path/to/your/storybook-project
claude
```

## Practical Examples

### Example 1: List All Stories

**You ask:**
```
List all Storybook stories in the current project
```

**Claude Code will:**
1. Call `list_stories` with current directory
2. Show you all `.stories.tsx` files found
3. Display their paths and names

**Behind the scenes:**
```javascript
list_stories({
  directory: "/path/to/project",
  pattern: "**/*.stories.{js,jsx,ts,tsx}"
})
```

### Example 2: Analyze a Story

**You ask:**
```
Parse the Button.stories.tsx file and tell me what stories it contains
```

**Claude Code will:**
1. Call `parse_story` with the file path
2. Extract metadata (title, component, stories, args)
3. Show you a summary of the stories

**Response includes:**
- Story title (e.g., "Components/Button")
- Component reference
- List of exported stories (Primary, Secondary, etc.)
- Args and argTypes

### Example 3: Convert Story to Component

**You ask:**
```
Convert the Primary story from src/stories/Button.stories.tsx to a standalone
React component and save it as src/components/PrimaryButton.tsx
```

**Claude Code will:**
1. Call `parse_story` to understand the story
2. Call `convert_story_to_component` with:
   - filePath: "src/stories/Button.stories.tsx"
   - storyName: "Primary"
   - outputPath: "src/components/PrimaryButton.tsx"
3. Create the new component file
4. Show you the generated code

**Generated component example:**
```typescript
import React from 'react';
import { Button } from './Button';

export const PrimaryComponent: React.FC = () => {
  return (
    <Button
      label="Primary Button"
      variant="primary"
      size="medium"
    />
  );
};

export default PrimaryComponent;
```

### Example 4: Generate Story from Component

**You ask:**
```
Create a Storybook story for the LoginForm component in src/components/LoginForm.tsx
and save it as src/stories/LoginForm.stories.tsx
```

**Claude Code will:**
1. Call `parse_component` to extract props
2. Call `generate_story_from_component` with:
   - componentPath: "src/components/LoginForm.tsx"
   - outputPath: "src/stories/LoginForm.stories.tsx"
3. Create the story file with:
   - Proper imports
   - Meta configuration
   - ArgTypes based on prop types
   - Default and Example stories

**Generated story example:**
```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { LoginForm } from '../components/LoginForm';

const meta: Meta<typeof LoginForm> = {
  title: 'Components/LoginForm',
  component: LoginForm,
  tags: ['autodocs'],
  argTypes: {
    onSubmit: { control: 'text' },
    username: { control: 'text' },
    password: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof LoginForm>;

export const Default: Story = {
  args: {
    onSubmit: () => {},
    username: 'Example text',
    password: 'Example text',
  },
};
```

### Example 5: Bulk Operations

**You ask:**
```
Find all React components in src/components/*.tsx that don't have stories yet,
then generate stories for each one in src/stories/
```

**Claude Code will:**
1. Use `list_stories` to find existing stories
2. Find all component files
3. Compare and identify components without stories
4. Call `generate_story_from_component` for each
5. Create all missing story files

### Example 6: Extract and Analyze Props

**You ask:**
```
Show me all the props, controls, and argTypes defined in src/stories/Card.stories.tsx
```

**Claude Code will:**
1. Call `extract_story_props` with the file path
2. Display:
   - All args with their values
   - All argTypes with control types
   - Component reference

### Example 7: Component Refactoring

**You ask:**
```
I'm refactoring the Button component. Parse Button.tsx and Button.stories.tsx,
then tell me if the story args match the component props
```

**Claude Code will:**
1. Call `parse_component` on Button.tsx
2. Call `parse_story` on Button.stories.tsx
3. Compare props vs args
4. Highlight any mismatches

### Example 8: Migration Workflow

**You ask:**
```
Help me migrate all stories from CSF2 to CSF3 format. Start by listing all
stories, then show me which ones need updating.
```

**Claude Code will:**
1. List all story files
2. Parse each one
3. Identify CSF2 vs CSF3 format
4. Suggest migration steps
5. Help you update each file

## Advanced Workflows

### Create Component Library Documentation

**You ask:**
```
Generate comprehensive documentation for all components:
1. List all stories
2. For each story, extract props and argTypes
3. Create a markdown table showing all components, their props, and controls
```

### Validate Story Coverage

**You ask:**
```
Check which components in src/components/ have Storybook stories and which don't.
Create a report showing coverage.
```

### Generate Stories with Custom Templates

**You ask:**
```
Generate a story for the DataTable component, but use our team's standard
story template with:
- Interactive controls for all props
- Multiple variants (Empty, WithData, Loading, Error)
- Accessibility tests
- Responsive previews
```

## Tips for Best Results

### Be Specific

❌ "Convert a story"
✅ "Convert the Primary story from Button.stories.tsx to a component"

### Provide Paths

❌ "Generate a story"
✅ "Generate a story for src/components/Header.tsx and save to src/stories/Header.stories.tsx"

### Chain Operations

✅ "List all stories, then for each one, extract the props and create documentation"

### Ask for Analysis

✅ "Parse both the component and its story, then tell me if they're in sync"

## Common Use Cases

### Daily Development

1. **Creating new components**: Generate story templates automatically
2. **Updating props**: Check if stories need updates after changing props
3. **Code review**: Verify story coverage for new components
4. **Documentation**: Extract props and controls for docs

### Refactoring

1. **Component renames**: Update all story references
2. **Prop changes**: Update story args to match new props
3. **Format migration**: Convert CSF2 to CSF3
4. **Story organization**: Restructure story hierarchy

### Team Onboarding

1. **Documentation**: Generate component docs from stories
2. **Examples**: Create example components from stories
3. **Templates**: Generate standard story templates

## Troubleshooting

### "File not found" errors

Make sure to provide absolute paths or paths relative to your current directory:

```
# Good
Parse src/stories/Button.stories.tsx

# Also good
Parse /absolute/path/to/Button.stories.tsx
```

### Complex stories not parsing correctly

The server uses regex-based parsing. For complex stories:

```
# Workaround: Be specific about what to extract
Extract just the Primary story from Button.stories.tsx

# Or: Read the file and help Claude understand it
Read Button.stories.tsx and help me convert the Primary story to a component
```

### Generated code needs tweaking

That's expected! The generator provides a template. You can ask Claude to:

```
Generate a story for LoginForm, then update it to:
- Use custom controls for the password field
- Add a decorator for authentication context
- Include accessibility tests
```

## Integration with Other Tools

### Git Workflows

```
After generating stories for all components:
1. Show me the git diff
2. Create a commit with message "Add Storybook stories"
3. Push to a new branch
```

### CI/CD

```
Check if all components have stories. If any are missing:
1. Generate them
2. Run Storybook build to verify
3. Create a pull request
```

### Documentation

```
Generate a components.md file that lists:
- All components
- Their props from stories
- Links to story files
- Example usage from story args
```

## Next Steps

- Check out the [README](README.md) for technical details
- View [example files](examples/) for reference
- Run tests with `./test-server.sh`
- Explore the [source code](src/) to understand how it works

## Getting Help

If you run into issues:

1. Check the server logs (stderr output)
2. Verify your MCP configuration
3. Test the server directly with the test script
4. Ask Claude Code to help debug: "Why isn't the storybook MCP server working?"
