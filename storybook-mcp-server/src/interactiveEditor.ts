import * as fs from "fs/promises";
import { updateStoryArgsAST } from "./astParser.js";

/**
 * Interactive story editing capabilities
 * Allows programmatic updates to stories
 */

export interface EditOperation {
  type: "update_args" | "add_story" | "update_decorator" | "update_parameters";
  target: string;
  data: Record<string, any>;
}

/**
 * Update specific arg values in a story
 */
export async function updateStoryArgs(
  filePath: string,
  storyName: string,
  argUpdates: Record<string, any>
): Promise<{ success: boolean; updated: string[] }> {
  try {
    await updateStoryArgsAST(filePath, storyName, argUpdates);

    return {
      success: true,
      updated: Object.keys(argUpdates),
    };
  } catch (error: any) {
    throw new Error(`Failed to update story args: ${error.message}`);
  }
}

/**
 * Add a new story to an existing story file
 */
export async function addStoryToFile(
  filePath: string,
  storyName: string,
  args: Record<string, any>,
  options?: { play?: string; decorators?: string[] }
): Promise<string> {
  const content = await fs.readFile(filePath, "utf-8");

  const argsStr = Object.entries(args)
    .map(([key, value]) => `    ${key}: ${JSON.stringify(value)}`)
    .join(",\n");

  const playStr = options?.play ? `,\n  play: ${options.play}` : "";
  const decoratorsStr = options?.decorators
    ? `,\n  decorators: [${options.decorators.join(", ")}]`
    : "";

  const newStory = `
export const ${storyName}: Story = {
  args: {
${argsStr}
  }${playStr}${decoratorsStr}
};
`;

  const updatedContent = content + "\n" + newStory;
  await fs.writeFile(filePath, updatedContent, "utf-8");

  return updatedContent;
}

/**
 * Update story parameters
 */
export async function updateStoryParameters(
  filePath: string,
  storyName: string,
  parameters: Record<string, any>
): Promise<string> {
  const content = await fs.readFile(filePath, "utf-8");

  // Find the story and add/update parameters
  const storyRegex = new RegExp(
    `export\\s+const\\s+${storyName}\\s*:\\s*Story\\s*=\\s*{([\\s\\S]*?)}\\s*;`,
    "m"
  );

  const match = content.match(storyRegex);
  if (!match) {
    throw new Error(`Story "${storyName}" not found`);
  }

  const parametersStr = Object.entries(parameters)
    .map(([key, value]) => `    ${key}: ${JSON.stringify(value)}`)
    .join(",\n");

  // Check if parameters already exist
  if (match[1].includes("parameters:")) {
    // Update existing parameters
    const updatedStory = match[0].replace(
      /parameters:\s*{[^}]*}/,
      `parameters: {\n${parametersStr}\n  }`
    );
    const newContent = content.replace(match[0], updatedStory);
    await fs.writeFile(filePath, newContent, "utf-8");
    return newContent;
  } else {
    // Add new parameters
    const updatedStory = match[0].replace(
      /}(\s*);$/,
      `,\n  parameters: {\n${parametersStr}\n  }$1;`
    );
    const newContent = content.replace(match[0], updatedStory);
    await fs.writeFile(filePath, newContent, "utf-8");
    return newContent;
  }
}

/**
 * Batch update multiple args across multiple stories
 */
export async function batchUpdateArgs(
  filePath: string,
  updates: Array<{ storyName: string; args: Record<string, any> }>
): Promise<{ success: boolean; updated: number }> {
  let updated = 0;

  for (const update of updates) {
    try {
      await updateStoryArgs(filePath, update.storyName, update.args);
      updated++;
    } catch (error) {
      console.error(`Failed to update ${update.storyName}:`, error);
    }
  }

  return {
    success: updated > 0,
    updated,
  };
}

/**
 * Clone a story with modifications
 */
export async function cloneStory(
  filePath: string,
  sourceStoryName: string,
  newStoryName: string,
  argOverrides?: Record<string, any>
): Promise<string> {
  const content = await fs.readFile(filePath, "utf-8");

  // Find source story
  const storyRegex = new RegExp(
    `export\\s+const\\s+${sourceStoryName}\\s*:\\s*Story\\s*=\\s*{([\\s\\S]*?)}\\s*;`,
    "m"
  );

  const match = content.match(storyRegex);
  if (!match) {
    throw new Error(`Source story "${sourceStoryName}" not found`);
  }

  // Clone and modify
  let clonedStory = match[0].replace(
    `const ${sourceStoryName}`,
    `const ${newStoryName}`
  );

  // Apply arg overrides if provided
  if (argOverrides) {
    const argsStr = Object.entries(argOverrides)
      .map(([key, value]) => `    ${key}: ${JSON.stringify(value)}`)
      .join(",\n");

    clonedStory = clonedStory.replace(/args:\s*{[^}]*}/, `args: {\n${argsStr}\n  }`);
  }

  const updatedContent = content + "\n" + clonedStory;
  await fs.writeFile(filePath, updatedContent, "utf-8");

  return updatedContent;
}

/**
 * Update story decorators
 */
export async function updateStoryDecorators(
  filePath: string,
  storyName: string,
  decorators: string[]
): Promise<string> {
  const content = await fs.readFile(filePath, "utf-8");

  const storyRegex = new RegExp(
    `export\\s+const\\s+${storyName}\\s*:\\s*Story\\s*=\\s*{([\\s\\S]*?)}\\s*;`,
    "m"
  );

  const match = content.match(storyRegex);
  if (!match) {
    throw new Error(`Story "${storyName}" not found`);
  }

  const decoratorsStr = `[${decorators.join(", ")}]`;

  // Check if decorators already exist
  if (match[1].includes("decorators:")) {
    const updatedStory = match[0].replace(/decorators:\s*\[[^\]]*\]/, `decorators: ${decoratorsStr}`);
    const newContent = content.replace(match[0], updatedStory);
    await fs.writeFile(filePath, newContent, "utf-8");
    return newContent;
  } else {
    const updatedStory = match[0].replace(/}(\s*);$/, `,\n  decorators: ${decoratorsStr}$1;`);
    const newContent = content.replace(match[0], updatedStory);
    await fs.writeFile(filePath, newContent, "utf-8");
    return newContent;
  }
}

/**
 * Preview changes without writing to file
 */
export async function previewEdit(
  filePath: string,
  operation: EditOperation
): Promise<{ original: string; modified: string }> {
  const original = await fs.readFile(filePath, "utf-8");
  let modified = original;

  switch (operation.type) {
    case "update_args":
      // Simulate the update
      const storyRegex = new RegExp(
        `export\\s+const\\s+${operation.target}\\s*:\\s*Story\\s*=\\s*{([\\s\\S]*?)}\\s*;`,
        "m"
      );
      const match = original.match(storyRegex);
      if (match) {
        const argsStr = Object.entries(operation.data)
          .map(([key, value]) => `    ${key}: ${JSON.stringify(value)}`)
          .join(",\n");
        modified = original.replace(
          match[0],
          match[0].replace(/args:\s*{[^}]*}/, `args: {\n${argsStr}\n  }`)
        );
      }
      break;

    case "add_story":
      const argsStr = Object.entries(operation.data)
        .map(([key, value]) => `    ${key}: ${JSON.stringify(value)}`)
        .join(",\n");
      const newStory = `\nexport const ${operation.target}: Story = {\n  args: {\n${argsStr}\n  }\n};\n`;
      modified = original + newStory;
      break;
  }

  return { original, modified };
}
