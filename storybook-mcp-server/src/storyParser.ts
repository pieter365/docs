import * as fs from "fs/promises";

export interface StoryMetadata {
  title: string | null;
  component: string | null;
  stories: string[];
  args: Record<string, any>;
  argTypes: Record<string, any>;
  filePath: string;
}

export interface ComponentInfo {
  name: string;
  props: Array<{
    name: string;
    type: string;
    optional: boolean;
    defaultValue?: string;
  }>;
  imports: string[];
}

/**
 * Parse a Storybook story file and extract metadata
 */
export async function parseStoryFile(filePath: string): Promise<StoryMetadata> {
  const content = await fs.readFile(filePath, "utf-8");

  // Extract title from default export
  const titleMatch = content.match(/title:\s*['"`]([^'"`]+)['"`]/);
  const title = titleMatch ? titleMatch[1] : null;

  // Extract component reference
  const componentMatch = content.match(/component:\s*(\w+)/);
  const component = componentMatch ? componentMatch[1] : null;

  // Extract story names (both const and function declarations)
  const constStories = Array.from(content.matchAll(/export\s+const\s+(\w+)\s*[:=]/g)).map(
    (m) => m[1]
  );
  const functionStories = Array.from(
    content.matchAll(/export\s+function\s+(\w+)/g)
  ).map((m) => m[1]);
  const stories = [...new Set([...constStories, ...functionStories])].filter(
    (name) => name !== "default"
  );

  // Extract args from stories
  const args: Record<string, any> = {};
  const argsRegex = /args:\s*{([^}]+)}/gs;
  let argsMatch;
  while ((argsMatch = argsRegex.exec(content)) !== null) {
    try {
      const argsStr = `{${argsMatch[1]}}`;
      // Simple parsing - in production, use a proper parser
      const keyValuePairs = argsMatch[1]
        .split(",")
        .map((pair) => pair.trim())
        .filter((pair) => pair);
      keyValuePairs.forEach((pair) => {
        const [key, value] = pair.split(":").map((s) => s.trim());
        if (key && value) {
          args[key] = value;
        }
      });
    } catch (e) {
      // Skip if parsing fails
    }
  }

  // Extract argTypes
  const argTypes: Record<string, any> = {};
  const argTypesMatch = content.match(/argTypes:\s*{([^}]+)}/s);
  if (argTypesMatch) {
    const argTypesContent = argTypesMatch[1];
    const argMatches = argTypesContent.matchAll(/(\w+):\s*{([^}]+)}/g);
    for (const match of argMatches) {
      const propName = match[1];
      const propConfig = match[2];
      argTypes[propName] = {
        control: propConfig.match(/control:\s*['"`]([^'"`]+)['"`]/)?.[1] || "text",
        description: propConfig.match(/description:\s*['"`]([^'"`]+)['"`]/)?.[1] || "",
      };
    }
  }

  return {
    title,
    component,
    stories,
    args,
    argTypes,
    filePath,
  };
}

/**
 * Parse a React component file and extract prop information
 */
export async function parseComponentFile(filePath: string): Promise<ComponentInfo> {
  const content = await fs.readFile(filePath, "utf-8");

  // Extract component name
  const componentMatch =
    content.match(/export\s+(?:const|function)\s+(\w+)/) ||
    content.match(/export\s+default\s+(?:function\s+)?(\w+)/);
  const name = componentMatch ? componentMatch[1] : "Component";

  // Extract imports
  const imports: string[] = [];
  const importMatches = content.matchAll(/import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g);
  for (const match of importMatches) {
    imports.push(match[1]);
  }

  // Extract props from interface/type definitions
  const props: ComponentInfo["props"] = [];

  // Match interface Props or type Props
  const propsMatch =
    content.match(/(?:interface|type)\s+\w*Props\s*{([^}]+)}/s) ||
    content.match(/(?:interface|type)\s+(\w+)\s*{([^}]+)}/s);

  if (propsMatch) {
    const propsContent = propsMatch[propsMatch.length - 1];
    const propMatches = propsContent.matchAll(/(\w+)(\?)?:\s*([^;,\n]+)/g);

    for (const match of propMatches) {
      const propName = match[1];
      const optional = !!match[2];
      const type = match[3].trim();

      // Extract default value if present
      const defaultMatch = content.match(
        new RegExp(`${propName}\\s*=\\s*([^,\\s}]+)`)
      );
      const defaultValue = defaultMatch ? defaultMatch[1] : undefined;

      props.push({
        name: propName,
        type,
        optional,
        defaultValue,
      });
    }
  }

  return {
    name,
    props,
    imports,
  };
}

/**
 * Convert a Storybook story to a standalone React component
 */
export async function convertStoryToComponent(
  filePath: string,
  storyName: string
): Promise<string> {
  const metadata = await parseStoryFile(filePath);

  if (!metadata.stories.includes(storyName)) {
    throw new Error(`Story "${storyName}" not found in ${filePath}`);
  }

  const content = await fs.readFile(filePath, "utf-8");

  // Extract the specific story definition
  const storyRegex = new RegExp(
    `export\\s+const\\s+${storyName}\\s*[:=]\\s*({[\\s\\S]*?})\\s*;`,
    "m"
  );
  const storyMatch = content.match(storyRegex);

  let storyArgs: Record<string, string> = {};
  if (storyMatch) {
    const argsMatch = storyMatch[1].match(/args:\s*{([^}]+)}/s);
    if (argsMatch) {
      const argsContent = argsMatch[1];
      argsContent.split(",").forEach((pair) => {
        const [key, value] = pair.split(":").map((s) => s.trim());
        if (key && value) {
          storyArgs[key] = value;
        }
      });
    }
  }

  // Extract component import
  const importMatch = content.match(/import\s+{?\s*(\w+)\s*}?\s+from\s+['"`]([^'"`]+)['"`]/);
  const componentName = metadata.component || (importMatch ? importMatch[1] : "Component");
  const importPath = importMatch ? importMatch[2] : "./Component";

  // Generate standalone component code
  const propsSpread = Object.entries(storyArgs)
    .map(([key, value]) => `      ${key}={${value}}`)
    .join("\n");

  return `import React from 'react';
import { ${componentName} } from '${importPath}';

/**
 * ${storyName} - Standalone component from Storybook story
 * Generated from: ${filePath}
 */
export const ${storyName}Component: React.FC = () => {
  return (
    <${componentName}
${propsSpread || "      {/* Add props here */}"}
    />
  );
};

export default ${storyName}Component;
`;
}

/**
 * Generate a Storybook story from a React component
 */
export async function generateStoryFromComponent(
  componentPath: string,
  componentName: string
): Promise<string> {
  const componentInfo = await parseComponentFile(componentPath);

  // Use provided name or parsed name
  const finalComponentName = componentName || componentInfo.name;

  // Generate import path (remove extension)
  const importPath = componentPath.replace(/\.(tsx?|jsx?)$/, "");

  // Generate args with example values based on type
  const generateExampleValue = (type: string): string => {
    if (type.includes("string")) return "'Example text'";
    if (type.includes("number")) return "42";
    if (type.includes("boolean")) return "true";
    if (type.includes("[]") || type.includes("Array")) return "[]";
    if (type.includes("{}") || type.includes("object")) return "{}";
    if (type.includes("()") || type.includes("Function")) return "() => {}";
    return "'value'";
  };

  // Generate argTypes for controls
  const generateControlType = (type: string): string => {
    if (type.includes("string")) return "'text'";
    if (type.includes("number")) return "'number'";
    if (type.includes("boolean")) return "'boolean'";
    if (type.includes("[]") || type.includes("Array")) return "'object'";
    if (type.includes("enum") || type.includes("|")) return "'select'";
    return "'text'";
  };

  const argTypesContent = componentInfo.props
    .map(
      (prop) =>
        `    ${prop.name}: {\n      control: ${generateControlType(prop.type)},\n      description: '${prop.name} prop',\n    }`
    )
    .join(",\n");

  const defaultArgsContent = componentInfo.props
    .filter((p) => !p.optional)
    .map((prop) => `    ${prop.name}: ${prop.defaultValue || generateExampleValue(prop.type)}`)
    .join(",\n");

  const exampleArgsContent = componentInfo.props
    .map((prop) => `    ${prop.name}: ${prop.defaultValue || generateExampleValue(prop.type)}`)
    .join(",\n");

  return `import type { Meta, StoryObj } from '@storybook/react';
import { ${finalComponentName} } from '${importPath}';

/**
 * ${finalComponentName} component stories
 * Auto-generated from component file
 */
const meta: Meta<typeof ${finalComponentName}> = {
  title: 'Components/${finalComponentName}',
  component: ${finalComponentName},
  tags: ['autodocs'],
  argTypes: {
${argTypesContent || "    // Define argTypes here"}
  },
};

export default meta;
type Story = StoryObj<typeof ${finalComponentName}>;

/**
 * Default story with required props
 */
export const Default: Story = {
  args: {
${defaultArgsContent || "    // Add default args"}
  },
};

/**
 * Example story with all props
 */
export const Example: Story = {
  args: {
${exampleArgsContent || "    // Add example args"}
  },
};
`;
}

/**
 * Compare component props with story args to check sync status
 */
export interface SyncStatus {
  inSync: boolean;
  missingInStory: string[];
  missingInComponent: string[];
  typeMismatches: Array<{ prop: string; componentType: string; storyValue: string }>;
}

export async function comparePropSync(
  componentPath: string,
  storyPath: string
): Promise<SyncStatus> {
  const componentInfo = await parseComponentFile(componentPath);
  const storyMetadata = await parseStoryFile(storyPath);

  const componentPropNames = new Set(componentInfo.props.map((p) => p.name));
  const storyArgNames = new Set(Object.keys(storyMetadata.args));

  const missingInStory = componentInfo.props
    .filter((p) => !storyArgNames.has(p.name) && !p.optional)
    .map((p) => p.name);

  const missingInComponent = Object.keys(storyMetadata.args).filter(
    (arg) => !componentPropNames.has(arg)
  );

  const typeMismatches: SyncStatus["typeMismatches"] = [];
  // Simple type checking - could be enhanced
  for (const prop of componentInfo.props) {
    if (storyMetadata.args[prop.name]) {
      const storyValue = storyMetadata.args[prop.name];
      // Basic type mismatch detection
      if (prop.type.includes("number") && !storyValue.match(/^\d+$/)) {
        typeMismatches.push({
          prop: prop.name,
          componentType: prop.type,
          storyValue,
        });
      }
    }
  }

  return {
    inSync: missingInStory.length === 0 && missingInComponent.length === 0 && typeMismatches.length === 0,
    missingInStory,
    missingInComponent,
    typeMismatches,
  };
}

/**
 * Update component file to match story args
 */
export async function syncStoryToComponent(
  componentPath: string,
  storyPath: string
): Promise<{ updated: boolean; changes: string[] }> {
  const componentInfo = await parseComponentFile(componentPath);
  const storyMetadata = await parseStoryFile(storyPath);

  let content = await fs.readFile(componentPath, "utf-8");
  const changes: string[] = [];

  // Find props interface/type
  const propsMatch = content.match(/(?:interface|type)\s+(\w*Props)\s*{([^}]+)}/s);

  if (!propsMatch) {
    throw new Error(`Could not find props interface in ${componentPath}`);
  }

  const interfaceName = propsMatch[1];
  const existingProps = propsMatch[2];

  // Build new props based on story args
  const newProps: string[] = [];
  const existingPropNames = componentInfo.props.map((p) => p.name);

  // Keep existing props
  componentInfo.props.forEach((prop) => {
    if (storyMetadata.args[prop.name]) {
      newProps.push(`  ${prop.name}${prop.optional ? "?" : ""}: ${prop.type};`);
    } else if (prop.optional) {
      newProps.push(`  ${prop.name}?: ${prop.type};`);
    } else {
      // Required prop not in story - keep it but note the change
      newProps.push(`  ${prop.name}: ${prop.type};`);
      changes.push(`Kept required prop '${prop.name}' not found in story`);
    }
  });

  // Add new props from story
  Object.keys(storyMetadata.args).forEach((argName) => {
    if (!existingPropNames.includes(argName)) {
      // Infer type from story value
      const value = storyMetadata.args[argName];
      let inferredType = "any";
      if (value.match(/^['"`]/)) inferredType = "string";
      else if (value.match(/^\d+$/)) inferredType = "number";
      else if (value.match(/^(true|false)$/)) inferredType = "boolean";
      else if (value.match(/^\[/)) inferredType = "any[]";
      else if (value.match(/^\(/)) inferredType = "() => void";

      newProps.push(`  ${argName}?: ${inferredType};`);
      changes.push(`Added new prop '${argName}' from story with type '${inferredType}'`);
    }
  });

  if (changes.length > 0) {
    // Replace the interface
    const newInterface = `${interfaceName} {\n${newProps.join("\n")}\n}`;
    const newContent = content.replace(
      /(?:interface|type)\s+\w*Props\s*{[^}]+}/s,
      newInterface
    );

    await fs.writeFile(componentPath, newContent, "utf-8");
    return { updated: true, changes };
  }

  return { updated: false, changes: [] };
}

/**
 * Update story args to match component props
 */
export async function syncComponentToStory(
  componentPath: string,
  storyPath: string,
  storyName: string = "Default"
): Promise<{ updated: boolean; changes: string[] }> {
  const componentInfo = await parseComponentFile(componentPath);
  let content = await fs.readFile(storyPath, "utf-8");
  const changes: string[] = [];

  // Generate args for all component props
  const generateExampleValue = (type: string): string => {
    if (type.includes("string")) return "'Example text'";
    if (type.includes("number")) return "42";
    if (type.includes("boolean")) return "true";
    if (type.includes("[]") || type.includes("Array")) return "[]";
    if (type.includes("{}") || type.includes("object")) return "{}";
    if (type.includes("()") || type.includes("Function")) return "() => {}";
    return "'value'";
  };

  const newArgs = componentInfo.props
    .map((prop) => {
      const value = prop.defaultValue || generateExampleValue(prop.type);
      changes.push(`Set '${prop.name}' to ${value}`);
      return `    ${prop.name}: ${value}`;
    })
    .join(",\n");

  // Find and replace the story args
  const storyRegex = new RegExp(
    `export\\s+const\\s+${storyName}\\s*:\\s*Story\\s*=\\s*{([\\s\\S]*?)}\\s*;`,
    "m"
  );

  const storyMatch = content.match(storyRegex);

  if (storyMatch) {
    const newStoryContent = `export const ${storyName}: Story = {
  args: {
${newArgs}
  },
};`;

    const newContent = content.replace(storyRegex, newStoryContent);
    await fs.writeFile(storyPath, newContent, "utf-8");

    return { updated: true, changes };
  }

  return { updated: false, changes: [] };
}

/**
 * Find and replace a variable/prop across multiple files
 */
export async function findAndReplaceInFile(
  filePath: string,
  findValue: string,
  replaceValue: string,
  scope: "propName" | "propValue" | "all" = "all"
): Promise<{ updated: boolean; occurrences: number }> {
  let content = await fs.readFile(filePath, "utf-8");
  let occurrences = 0;
  let newContent = content;

  if (scope === "propName" || scope === "all") {
    // Replace prop names (in interfaces, args, etc.)
    const propNameRegex = new RegExp(`\\b${findValue}\\b`, "g");
    const matches = content.match(propNameRegex);
    if (matches) {
      occurrences += matches.length;
      newContent = newContent.replace(propNameRegex, replaceValue);
    }
  }

  if (scope === "propValue" || scope === "all") {
    // Replace prop values (in args, default values, etc.)
    const propValueRegex = new RegExp(`:\\s*['"\`]${findValue}['"\`]`, "g");
    const valueMatches = content.match(propValueRegex);
    if (valueMatches) {
      occurrences += valueMatches.length;
      newContent = newContent.replace(propValueRegex, `: '${replaceValue}'`);
    }
  }

  if (newContent !== content) {
    await fs.writeFile(filePath, newContent, "utf-8");
    return { updated: true, occurrences };
  }

  return { updated: false, occurrences: 0 };
}
