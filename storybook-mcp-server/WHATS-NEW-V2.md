# Storybook MCP Server v2.0 - Enhanced Features

## 🎉 What's New in v2.0

Your MCP server now has **AUTO-SYNC** and **VARIABLE UPDATE** capabilities! Here's what you can do:

## All 11 Tools Available

### Basic Operations (6 tools)
1. **list_stories** - Find all story files
2. **parse_story** - Extract story metadata
3. **parse_component** - Extract component props
4. **extract_story_props** - Get args and controls
5. **convert_story_to_component** - Story → Component
6. **generate_story_from_component** - Component → Story

### 🆕 Sync Operations (3 NEW tools)
7. **validate_sync** - Check if component and story match
8. **sync_story_to_component** - Update component to match story
9. **sync_component_to_story** - Update story to match component

### 🆕 Bulk Operations (1 NEW tool)
10. **bulk_sync_check** - Check all components/stories in project

### 🆕 Find & Replace (1 NEW tool)
11. **find_and_replace** - Update variables across multiple files

---

## Real Usage Examples

### Option A: Generate Components from Stories ✅
**Already worked, now enhanced!**

```
You: "List all stories and generate React components from them"

Claude Code:
1. Calls list_stories
2. For each story, calls convert_story_to_component
3. Creates standalone components
```

### Option B: AUTO-SYNC Props and Args 🆕

#### Check if in sync:
```
You: "Check if Button.tsx and Button.stories.tsx are in sync"

Claude Code calls validate_sync:
{
  "inSync": false,
  "missingInStory": ["disabled", "size"],
  "missingInComponent": ["extraProp"],
  "typeMismatches": []
}
```

#### Sync Story → Component:
```
You: "Update Button.tsx to match the props in Button.stories.tsx"

Claude Code calls sync_story_to_component:
- Adds missing props from story to component
- Updates component interface
- Shows you what changed
```

**Result:**
```typescript
// Button.tsx - BEFORE
interface ButtonProps {
  label: string;
  onClick: () => void;
}

// Button.tsx - AFTER (auto-updated!)
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant: string;  // ← Added from story
  size: string;     // ← Added from story
}
```

#### Sync Component → Story:
```
You: "Update Button.stories.tsx to use all props from Button.tsx"

Claude Code calls sync_component_to_story:
- Reads all props from component
- Updates story args to include all props
- Generates example values
```

**Result:**
```typescript
// Button.stories.tsx - AFTER
export const Default: Story = {
  args: {
    label: 'Example text',
    variant: 'primary',
    size: 'medium',
    disabled: false,    // ← Added from component
    onClick: () => {},  // ← Added from component
  },
};
```

### Option C: Update Variables Across Files 🆕

#### Rename a prop everywhere:
```
You: "Rename the 'title' prop to 'heading' in all my story and component files"

Claude Code calls find_and_replace:
files: ["Button.tsx", "Button.stories.tsx", "Card.tsx", "Card.stories.tsx"]
findValue: "title"
replaceValue: "heading"
scope: "propName"

Result:
- 8 occurrences found
- 4 files updated
- All 'title' props renamed to 'heading'
```

#### Update a prop value everywhere:
```
You: "Change all button labels from 'Click me' to 'Submit' across all stories"

Claude Code calls find_and_replace:
findValue: "Click me"
replaceValue: "Submit"
scope: "propValue"

Result:
- Updates story args
- Shows which files changed
```

---

## Complete Workflows

### Workflow 1: Full Project Sync

```
You: "Check sync status for my entire project"

Claude Code:
1. Calls bulk_sync_check on your directory
2. Shows summary:
   - Total: 25 stories
   - In sync: 18
   - Out of sync: 7
   - Missing components: 2
3. Lists all problems:
   - Button.stories.tsx: Missing 'variant' in component
   - Card.stories.tsx: Has extra 'theme' not in component
   - Alert.stories.tsx: Component file not found

You: "Fix all the sync issues"

Claude Code:
4. For each out-of-sync pair:
   - Calls validate_sync
   - Calls sync_story_to_component or sync_component_to_story
   - Shows changes made
```

### Workflow 2: Component Refactoring

```
You: "I'm renaming 'buttonText' to 'label' in all Button components"

Claude Code:
1. Finds all Button files
2. Calls find_and_replace:
   - Renames prop in Button.tsx interface
   - Renames arg in Button.stories.tsx
   - Updates all usages
3. Calls validate_sync to verify everything matches
4. Shows summary of changes
```

### Workflow 3: Story-Driven Development

```
You: "I updated my Button story with new props. Update the component to match"

Claude Code:
1. Calls parse_story on Button.stories.tsx
2. Calls validate_sync - detects mismatches
3. Calls sync_story_to_component
4. Updates Button.tsx with new props
5. Shows you the changes:
   - Added 'icon' prop (string)
   - Added 'loading' prop (boolean)
```

---

## API Reference

### validate_sync
**Check if component and story are in sync**

```
Parameters:
- componentPath: string (path to .tsx/.jsx)
- storyPath: string (path to .stories.tsx)

Returns:
{
  inSync: boolean,
  missingInStory: string[],
  missingInComponent: string[],
  typeMismatches: [{prop, componentType, storyValue}]
}
```

### sync_story_to_component
**Update component props to match story args**

```
Parameters:
- componentPath: string (file to UPDATE)
- storyPath: string (source of truth)

Returns:
{
  updated: boolean,
  changes: string[] (list of modifications made)
}
```

### sync_component_to_story
**Update story args to match component props**

```
Parameters:
- componentPath: string (source of truth)
- storyPath: string (file to UPDATE)
- storyName: string (optional, defaults to "Default")

Returns:
{
  updated: boolean,
  changes: string[]
}
```

### find_and_replace
**Replace variables across multiple files**

```
Parameters:
- files: string[] (array of file paths)
- findValue: string
- replaceValue: string
- scope: "propName" | "propValue" | "all"

Returns:
{
  filesProcessed: number,
  filesUpdated: number,
  totalOccurrences: number,
  results: [{file, updated, occurrences}]
}
```

### bulk_sync_check
**Check all component/story pairs in directory**

```
Parameters:
- directory: string

Returns:
{
  summary: {total, inSync, outOfSync, missingComponents},
  results: [{storyFile, componentFile, inSync, issues}]
}
```

---

## How It Works

```
┌──────────────────────────────────────────────────┐
│  You: "Sync Button story and component"         │
└─────────────────┬────────────────────────────────┘
                  │
                  v
┌──────────────────────────────────────────────────┐
│  Claude Code MCP Client                          │
│  - Understands your request                      │
│  - Chooses appropriate tool                      │
└─────────────────┬────────────────────────────────┘
                  │
                  v
┌──────────────────────────────────────────────────┐
│  MCP Server (v2.0)                               │
│  1. validate_sync → checks differences           │
│  2. sync_story_to_component → updates files      │
│  3. Returns changes made                         │
└─────────────────┬────────────────────────────────┘
                  │
                  v
┌──────────────────────────────────────────────────┐
│  Your Files - UPDATED!                           │
│  ✓ Button.tsx props interface modified           │
│  ✓ Now matches Button.stories.tsx               │
└──────────────────────────────────────────────────┘
```

---

## Examples with Claude Code

### Scenario 1: Keep Story and Component in Sync

**Problem:** You added props to your story, component is outdated

```
You: "I added 'variant' and 'size' props to Button.stories.tsx. Update Button.tsx to match"

Claude Code:
✓ Parsed Button.stories.tsx
✓ Found new props: variant, size
✓ Updated Button.tsx interface
✓ Changes:
  - Added variant: string (inferred from story)
  - Added size?: string (optional)
```

### Scenario 2: Rename Props Everywhere

**Problem:** Need to rename 'title' to 'heading' across 10 files

```
You: "Rename the 'title' prop to 'heading' in all component and story files in src/"

Claude Code:
✓ Found 10 files with 'title' prop
✓ Replaced 24 occurrences
✓ Files updated:
  - Button.tsx (3 occurrences)
  - Button.stories.tsx (2 occurrences)
  - Card.tsx (4 occurrences)
  ...
```

### Scenario 3: Bulk Validation

**Problem:** Need to check if 50 stories match their components

```
You: "Check if all stories in src/stories/ are in sync with their components"

Claude Code:
✓ Found 50 stories
✓ Summary:
  - 42 in sync ✓
  - 8 out of sync ✗
  - 2 missing components ✗

✗ Problems found:
  1. Button: Missing 'disabled' in story
  2. Card: Extra 'theme' in story
  3. Alert: Component not found
  ...

You: "Fix all sync issues automatically"

Claude Code:
✓ Fixed 8 files
✓ All components now in sync
```

---

## Tips for Best Results

### 1. Always Validate First
```
Good: "Check if Button is in sync, then update if needed"
Better than: "Update Button" (without checking first)
```

### 2. Specify Direction
```
Good: "Update component to match story" (story is source of truth)
Good: "Update story to match component" (component is source of truth)
```

### 3. Use Bulk Operations
```
Good: "Check sync for entire src/components/ directory"
Efficient: Checks all files at once
```

### 4. Chain Operations
```
Great: "Find all out-of-sync files, then fix them one by one, showing me each change"
```

---

## Installation

Same as before! Just rebuild:

```bash
cd storybook-mcp-server
npm run build
```

The new tools are automatically available in Claude Code!

---

## Upgrade from v1.0

If you're using v1.0, just pull the latest code and rebuild:

```bash
git pull
cd storybook-mcp-server
npm install
npm run build
```

Your `.claude/mcp.json` config stays the same!

---

## What You Asked For

✅ **Option A**: Generate components from stories - WORKS
✅ **Option B**: Auto-sync props between component and story - NOW WORKS
✅ **Option C**: Find and replace variables across files - NOW WORKS

All three options are fully implemented! 🎉
