#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import {
  parseStoryFile,
  parseComponentFile,
  convertStoryToComponent,
  generateStoryFromComponent,
  comparePropSync,
  syncStoryToComponent,
  syncComponentToStory,
  findAndReplaceInFile,
} from "./storyParser.js";
import { parseComponentAST, parseStoryAST, type ASTComponentInfo } from "./astParser.js";
import { listAddons, addAddon, removeAddon, getRecommendedAddons, readStorybookConfig, POPULAR_ADDONS } from "./addonManager.js";
import { generateUnitTest, generateInteractionTest, generatePlayFunction, generateDecorator, generateA11yTests } from "./testGenerator.js";
import { updateStoryArgs, addStoryToFile, cloneStory, batchUpdateArgs } from "./interactiveEditor.js";
import { getCache } from "./cacheManager.js";

// Initialize MCP server
const server = new McpServer({
  name: "storybook-mcp-server",
  version: "3.0.0",
});

/**
 * Tool: list_stories
 * Lists all Storybook story files in a directory
 */
server.tool(
  "list_stories",
  {
    directory: z
      .string()
      .describe("Project directory to search for stories (absolute or relative path)"),
    pattern: z
      .string()
      .optional()
      .default("**/*.stories.{js,jsx,ts,tsx}")
      .describe("Glob pattern for story files"),
  },
  async ({ directory, pattern }) => {
    try {
      // Resolve to absolute path
      const absoluteDir = path.resolve(directory);

      // Check if directory exists
      try {
        await fs.access(absoluteDir);
      } catch {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Directory not found: ${absoluteDir}`,
              }),
            },
          ],
        };
      }

      const files = await glob(pattern, {
        cwd: absoluteDir,
        absolute: true,
        ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"],
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                count: files.length,
                directory: absoluteDir,
                pattern,
                stories: files.map((file) => ({
                  absolutePath: file,
                  relativePath: path.relative(absoluteDir, file),
                  name: path.basename(file),
                  directory: path.dirname(file),
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message,
              stack: error.stack,
            }),
          },
        ],
      };
    }
  }
);

/**
 * Tool: parse_story
 * Parses a story file and extracts metadata
 */
server.tool(
  "parse_story",
  {
    filePath: z.string().describe("Absolute path to the story file"),
  },
  async ({ filePath }) => {
    try {
      const absolutePath = path.resolve(filePath);

      // Check if file exists
      try {
        await fs.access(absolutePath);
      } catch {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `File not found: ${absolutePath}`,
              }),
            },
          ],
        };
      }

      const metadata = await parseStoryFile(absolutePath);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                metadata,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message,
              stack: error.stack,
            }),
          },
        ],
      };
    }
  }
);

/**
 * Tool: convert_story_to_component
 * Converts a Storybook story to a standalone React component
 */
server.tool(
  "convert_story_to_component",
  {
    filePath: z.string().describe("Absolute path to the story file"),
    storyName: z.string().describe("Name of the story to convert (e.g., 'Primary', 'Default')"),
    outputPath: z
      .string()
      .optional()
      .describe("Optional output path to save the component. If not provided, returns code only"),
  },
  async ({ filePath, storyName, outputPath }) => {
    try {
      const absolutePath = path.resolve(filePath);

      // Check if file exists
      try {
        await fs.access(absolutePath);
      } catch {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `File not found: ${absolutePath}`,
              }),
            },
          ],
        };
      }

      const componentCode = await convertStoryToComponent(absolutePath, storyName);

      // Write to file if output path provided
      let savedPath: string | null = null;
      if (outputPath) {
        const absoluteOutputPath = path.resolve(outputPath);
        await fs.writeFile(absoluteOutputPath, componentCode, "utf-8");
        savedPath = absoluteOutputPath;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                storyName,
                sourceFile: absolutePath,
                componentCode,
                savedTo: savedPath,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message,
              stack: error.stack,
            }),
          },
        ],
      };
    }
  }
);

/**
 * Tool: generate_story_from_component
 * Generates a Storybook story file from a React component
 */
server.tool(
  "generate_story_from_component",
  {
    componentPath: z.string().describe("Absolute path to the React component file"),
    componentName: z
      .string()
      .optional()
      .describe("Name of the component (auto-detected if not provided)"),
    outputPath: z
      .string()
      .optional()
      .describe("Optional output path to save the story. If not provided, returns code only"),
  },
  async ({ componentPath, componentName, outputPath }) => {
    try {
      const absolutePath = path.resolve(componentPath);

      // Check if file exists
      try {
        await fs.access(absolutePath);
      } catch {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `File not found: ${absolutePath}`,
              }),
            },
          ],
        };
      }

      const storyCode = await generateStoryFromComponent(absolutePath, componentName || "");

      // Write to file if output path provided
      let savedPath: string | null = null;
      if (outputPath) {
        const absoluteOutputPath = path.resolve(outputPath);
        // Ensure directory exists
        await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });
        await fs.writeFile(absoluteOutputPath, storyCode, "utf-8");
        savedPath = absoluteOutputPath;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                componentPath: absolutePath,
                storyCode,
                savedTo: savedPath,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message,
              stack: error.stack,
            }),
          },
        ],
      };
    }
  }
);

/**
 * Tool: parse_component
 * Parses a React component and extracts prop information
 */
server.tool(
  "parse_component",
  {
    filePath: z.string().describe("Absolute path to the React component file"),
  },
  async ({ filePath }) => {
    try {
      const absolutePath = path.resolve(filePath);

      // Check if file exists
      try {
        await fs.access(absolutePath);
      } catch {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `File not found: ${absolutePath}`,
              }),
            },
          ],
        };
      }

      const componentInfo = await parseComponentFile(absolutePath);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                componentInfo,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message,
              stack: error.stack,
            }),
          },
        ],
      };
    }
  }
);

/**
 * Tool: extract_story_props
 * Extracts props and argTypes from a story file
 */
server.tool(
  "extract_story_props",
  {
    filePath: z.string().describe("Absolute path to the story file"),
  },
  async ({ filePath }) => {
    try {
      const absolutePath = path.resolve(filePath);

      // Check if file exists
      try {
        await fs.access(absolutePath);
      } catch {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `File not found: ${absolutePath}`,
              }),
            },
          ],
        };
      }

      const metadata = await parseStoryFile(absolutePath);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                filePath: absolutePath,
                args: metadata.args,
                argTypes: metadata.argTypes,
                component: metadata.component,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message,
              stack: error.stack,
            }),
          },
        ],
      };
    }
  }
);

/**
 * Tool: validate_sync
 * Checks if a component and its story are in sync
 */
server.tool(
  "validate_sync",
  {
    componentPath: z.string().describe("Absolute path to the React component file"),
    storyPath: z.string().describe("Absolute path to the story file"),
  },
  async ({ componentPath, storyPath }) => {
    try {
      const absoluteComponentPath = path.resolve(componentPath);
      const absoluteStoryPath = path.resolve(storyPath);

      // Check if files exist
      try {
        await fs.access(absoluteComponentPath);
        await fs.access(absoluteStoryPath);
      } catch {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `File not found: ${absoluteComponentPath} or ${absoluteStoryPath}`,
              }),
            },
          ],
        };
      }

      const syncStatus = await comparePropSync(absoluteComponentPath, absoluteStoryPath);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                syncStatus,
                recommendation: syncStatus.inSync
                  ? "Component and story are in sync"
                  : "Sync issues detected. Use sync_story_to_component or sync_component_to_story to fix.",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message,
              stack: error.stack,
            }),
          },
        ],
      };
    }
  }
);

/**
 * Tool: sync_story_to_component
 * Updates a component's props to match its story args
 */
server.tool(
  "sync_story_to_component",
  {
    componentPath: z.string().describe("Absolute path to the React component file to update"),
    storyPath: z.string().describe("Absolute path to the story file (source of truth)"),
  },
  async ({ componentPath, storyPath }) => {
    try {
      const absoluteComponentPath = path.resolve(componentPath);
      const absoluteStoryPath = path.resolve(storyPath);

      // Check if files exist
      try {
        await fs.access(absoluteComponentPath);
        await fs.access(absoluteStoryPath);
      } catch {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `File not found: ${absoluteComponentPath} or ${absoluteStoryPath}`,
              }),
            },
          ],
        };
      }

      const result = await syncStoryToComponent(absoluteComponentPath, absoluteStoryPath);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                updated: result.updated,
                changes: result.changes,
                message: result.updated
                  ? `Component updated with ${result.changes.length} changes`
                  : "No changes needed - already in sync",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message,
              stack: error.stack,
            }),
          },
        ],
      };
    }
  }
);

/**
 * Tool: sync_component_to_story
 * Updates a story's args to match its component props
 */
server.tool(
  "sync_component_to_story",
  {
    componentPath: z.string().describe("Absolute path to the React component file (source of truth)"),
    storyPath: z.string().describe("Absolute path to the story file to update"),
    storyName: z
      .string()
      .optional()
      .default("Default")
      .describe("Name of the story to update (defaults to 'Default')"),
  },
  async ({ componentPath, storyPath, storyName }) => {
    try {
      const absoluteComponentPath = path.resolve(componentPath);
      const absoluteStoryPath = path.resolve(storyPath);

      // Check if files exist
      try {
        await fs.access(absoluteComponentPath);
        await fs.access(absoluteStoryPath);
      } catch {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `File not found: ${absoluteComponentPath} or ${absoluteStoryPath}`,
              }),
            },
          ],
        };
      }

      const result = await syncComponentToStory(
        absoluteComponentPath,
        absoluteStoryPath,
        storyName || "Default"
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                updated: result.updated,
                changes: result.changes,
                storyName: storyName || "Default",
                message: result.updated
                  ? `Story '${storyName}' updated with ${result.changes.length} changes`
                  : "No changes needed - already in sync",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message,
              stack: error.stack,
            }),
          },
        ],
      };
    }
  }
);

/**
 * Tool: find_and_replace
 * Find and replace a variable/prop across story and component files
 */
server.tool(
  "find_and_replace",
  {
    files: z.array(z.string()).describe("Array of file paths to search and replace in"),
    findValue: z.string().describe("The value to find"),
    replaceValue: z.string().describe("The value to replace with"),
    scope: z
      .enum(["propName", "propValue", "all"])
      .optional()
      .default("all")
      .describe("Scope: 'propName' (prop names only), 'propValue' (values only), or 'all'"),
  },
  async ({ files, findValue, replaceValue, scope }) => {
    try {
      const results: Array<{
        file: string;
        updated: boolean;
        occurrences: number;
      }> = [];

      let totalOccurrences = 0;
      let filesUpdated = 0;

      for (const filePath of files) {
        const absolutePath = path.resolve(filePath);

        try {
          await fs.access(absolutePath);
          const result = await findAndReplaceInFile(
            absolutePath,
            findValue,
            replaceValue,
            scope || "all"
          );

          results.push({
            file: filePath,
            updated: result.updated,
            occurrences: result.occurrences,
          });

          totalOccurrences += result.occurrences;
          if (result.updated) filesUpdated++;
        } catch (error: any) {
          results.push({
            file: filePath,
            updated: false,
            occurrences: 0,
          });
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                summary: {
                  filesProcessed: files.length,
                  filesUpdated,
                  totalOccurrences,
                  findValue,
                  replaceValue,
                  scope: scope || "all",
                },
                results,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message,
              stack: error.stack,
            }),
          },
        ],
      };
    }
  }
);

/**
 * Tool: bulk_sync_check
 * Check sync status for all component/story pairs in a directory
 */
server.tool(
  "bulk_sync_check",
  {
    directory: z.string().describe("Project directory to search"),
  },
  async ({ directory }) => {
    try {
      const absoluteDir = path.resolve(directory);

      // Find all story files
      const storyFiles = await glob("**/*.stories.{js,jsx,ts,tsx}", {
        cwd: absoluteDir,
        absolute: true,
        ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"],
      });

      const results: Array<{
        storyFile: string;
        componentFile: string | null;
        inSync: boolean;
        issues: string[];
      }> = [];

      for (const storyFile of storyFiles) {
        // Try to find corresponding component file
        const baseName = path.basename(storyFile).replace(/\.stories\.(tsx?|jsx?)$/, "");
        const storyDir = path.dirname(storyFile);

        // Look for component in same directory or parent
        const possiblePaths = [
          path.join(storyDir, `${baseName}.tsx`),
          path.join(storyDir, `${baseName}.ts`),
          path.join(storyDir, `${baseName}.jsx`),
          path.join(storyDir, `${baseName}.js`),
          path.join(storyDir, "..", "components", `${baseName}.tsx`),
          path.join(storyDir, "..", "components", `${baseName}.ts`),
        ];

        let componentFile: string | null = null;
        for (const possiblePath of possiblePaths) {
          try {
            await fs.access(possiblePath);
            componentFile = possiblePath;
            break;
          } catch {
            // Continue searching
          }
        }

        if (componentFile) {
          try {
            const syncStatus = await comparePropSync(componentFile, storyFile);
            const issues: string[] = [];

            if (syncStatus.missingInStory.length > 0) {
              issues.push(`Missing in story: ${syncStatus.missingInStory.join(", ")}`);
            }
            if (syncStatus.missingInComponent.length > 0) {
              issues.push(`Missing in component: ${syncStatus.missingInComponent.join(", ")}`);
            }
            if (syncStatus.typeMismatches.length > 0) {
              issues.push(
                `Type mismatches: ${syncStatus.typeMismatches.map((m) => m.prop).join(", ")}`
              );
            }

            results.push({
              storyFile: path.relative(absoluteDir, storyFile),
              componentFile: path.relative(absoluteDir, componentFile),
              inSync: syncStatus.inSync,
              issues,
            });
          } catch (error: any) {
            results.push({
              storyFile: path.relative(absoluteDir, storyFile),
              componentFile: path.relative(absoluteDir, componentFile),
              inSync: false,
              issues: [`Error checking sync: ${error.message}`],
            });
          }
        } else {
          results.push({
            storyFile: path.relative(absoluteDir, storyFile),
            componentFile: null,
            inSync: false,
            issues: ["Component file not found"],
          });
        }
      }

      const summary = {
        total: results.length,
        inSync: results.filter((r) => r.inSync).length,
        outOfSync: results.filter((r) => !r.inSync).length,
        missingComponents: results.filter((r) => r.componentFile === null).length,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                summary,
                results: results.filter((r) => !r.inSync), // Only show problems
                allResults: results, // Full list for reference
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message,
              stack: error.stack,
            }),
          },
        ],
      };
    }
  }
);

/**
 * Tool: parse_with_ast
 * Parse component or story using AST (more accurate than regex)
 */
server.tool(
  "parse_with_ast",
  {
    filePath: z.string().describe("Path to file"),
    type: z.enum(["component", "story"]).describe("File type to parse"),
  },
  async ({ filePath, type }) => {
    try {
      const absolutePath = path.resolve(filePath);
      const result = type === "component"
        ? await parseComponentAST(absolutePath)
        : await parseStoryAST(absolutePath);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, parsed: result }, null, 2),
        }],
      };
    } catch (error: any) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: false, error: error.message }),
        }],
      };
    }
  }
);

/**
 * Tool: manage_addons
 * Manage Storybook addons (list, add, remove)
 */
server.tool(
  "manage_addons",
  {
    projectPath: z.string().describe("Project root directory"),
    action: z.enum(["list", "add", "remove", "recommend"]).describe("Action to perform"),
    addonName: z.string().optional().describe("Addon name (for add/remove)"),
  },
  async ({ projectPath, action, addonName }) => {
    try {
      const absolutePath = path.resolve(projectPath);

      if (action === "list") {
        const addons = await listAddons(absolutePath);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: true, addons }, null, 2),
          }],
        };
      } else if (action === "recommend") {
        const config = await readStorybookConfig(absolutePath);
        const recommended = getRecommendedAddons(config);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: true, recommended, catalog: POPULAR_ADDONS }, null, 2),
          }],
        };
      } else if (action === "add" && addonName) {
        const result = await addAddon(absolutePath, addonName);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: result.success, message: result.message }, null, 2),
          }],
        };
      } else if (action === "remove" && addonName) {
        const result = await removeAddon(absolutePath, addonName);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: result.success, message: result.message }, null, 2),
          }],
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: false, error: "Invalid action or missing addonName" }),
        }],
      };
    } catch (error: any) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: false, error: error.message }),
        }],
      };
    }
  }
);

/**
 * Tool: generate_tests
 * Generate unit tests and accessibility tests for component
 */
server.tool(
  "generate_tests",
  {
    componentPath: z.string().describe("Path to component"),
    outputPath: z.string().optional().describe("Where to save test file"),
    testType: z.enum(["unit", "interaction", "a11y", "all"]).default("unit").describe("Type of tests"),
    framework: z.enum(["jest", "vitest"]).default("jest").describe("Test framework"),
  },
  async ({ componentPath, outputPath, testType, framework }) => {
    try {
      const absolutePath = path.resolve(componentPath);
      const componentInfo = await parseComponentAST(absolutePath);

      let testCode = "";

      if (testType === "unit" || testType === "all") {
        testCode += await generateUnitTest(absolutePath, componentInfo as ASTComponentInfo, {
          testFramework: framework,
          testingLibrary: "react-testing-library",
          includeAccessibility: testType === "all",
        });
      }

      if (testType === "a11y" || testType === "all") {
        testCode += "\n\n" + generateA11yTests(componentInfo.name, componentInfo as ASTComponentInfo);
      }

      if (outputPath) {
        const absoluteOutputPath = path.resolve(outputPath);
        await fs.writeFile(absoluteOutputPath, testCode, "utf-8");
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            testCode,
            savedTo: outputPath || null,
          }, null, 2),
        }],
      };
    } catch (error: any) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: false, error: error.message }),
        }],
      };
    }
  }
);

/**
 * Tool: generate_play_function
 * Generate Storybook play function for interaction testing
 */
server.tool(
  "generate_play_function",
  {
    interactions: z.array(z.object({
      action: z.string().describe("Action: click, type, clear, hover"),
      target: z.string().describe("Target element role/label"),
      value: z.string().optional().describe("Value for type action"),
    })).describe("Array of interactions"),
  },
  async ({ interactions }) => {
    try {
      const playCode = generatePlayFunction(interactions);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, playCode }, null, 2),
        }],
      };
    } catch (error: any) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: false, error: error.message }),
        }],
      };
    }
  }
);

/**
 * Tool: edit_story_interactively
 * Update story args, clone stories, batch updates
 */
server.tool(
  "edit_story_interactively",
  {
    filePath: z.string().describe("Path to story file"),
    action: z.enum(["update_args", "clone", "batch_update"]).describe("Edit action"),
    storyName: z.string().optional().describe("Story name (for update_args, clone)"),
    args: z.record(z.any()).optional().describe("Args to update/set"),
    newStoryName: z.string().optional().describe("New story name (for clone)"),
    updates: z.array(z.object({
      storyName: z.string(),
      args: z.record(z.any()),
    })).optional().describe("Batch updates array"),
  },
  async ({ filePath, action, storyName, args, newStoryName, updates }) => {
    try {
      const absolutePath = path.resolve(filePath);

      if (action === "update_args" && storyName && args) {
        const result = await updateStoryArgs(absolutePath, storyName, args);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: true, updated: result.updated }, null, 2),
          }],
        };
      } else if (action === "clone" && storyName && newStoryName) {
        await cloneStory(absolutePath, storyName, newStoryName, args);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: true, cloned: newStoryName }, null, 2),
          }],
        };
      } else if (action === "batch_update" && updates) {
        const result = await batchUpdateArgs(absolutePath, updates);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: true, updated: result.updated }, null, 2),
          }],
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: false, error: "Invalid action or missing parameters" }),
        }],
      };
    } catch (error: any) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: false, error: error.message }),
        }],
      };
    }
  }
);

/**
 * Tool: manage_cache
 * Manage cache for performance in large projects
 */
server.tool(
  "manage_cache",
  {
    action: z.enum(["stats", "clear", "cleanup", "invalidate"]).describe("Cache action"),
    pattern: z.string().optional().describe("Pattern for selective invalidation"),
  },
  async ({ action, pattern }) => {
    try {
      const cache = getCache();

      if (action === "stats") {
        const stats = await cache.getStats();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: true, stats }, null, 2),
          }],
        };
      } else if (action === "clear") {
        await cache.clear();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: true, message: "Cache cleared" }),
          }],
        };
      } else if (action === "cleanup") {
        const cleaned = await cache.cleanup();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: true, cleaned, message: `Cleaned ${cleaned} expired entries` }),
          }],
        };
      } else if (action === "invalidate" && pattern) {
        const count = await cache.invalidatePattern(pattern);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: true, invalidated: count, pattern }),
          }],
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: false, error: "Invalid action or missing pattern" }),
        }],
      };
    } catch (error: any) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: false, error: error.message }),
        }],
      };
    }
  }
);

/**
 * Main function to start the MCP server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't interfere with MCP protocol
  console.error("Storybook MCP Server started successfully");
  console.error("Version: 3.1.0");
  console.error("Available tools:");
  console.error("  [Basic Operations]");
  console.error("  - list_stories, parse_story, parse_component, extract_story_props");
  console.error("  [Generation]");
  console.error("  - convert_story_to_component, generate_story_from_component");
  console.error("  [Sync Operations]");
  console.error("  - validate_sync, sync_story_to_component, sync_component_to_story, bulk_sync_check");
  console.error("  [Find & Replace]");
  console.error("  - find_and_replace");
  console.error("  [AST Parsing (v3.0)]");
  console.error("  - parse_with_ast");
  console.error("  [Addon Management (v3.0)]");
  console.error("  - manage_addons");
  console.error("  [Test Generation (v3.0)]");
  console.error("  - generate_tests, generate_play_function");
  console.error("  [Interactive Editing (v3.0)]");
  console.error("  - edit_story_interactively");
  console.error("  [Cache Management (NEW v3.1)]");
  console.error("  - manage_cache");
}

// Start the server
main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
