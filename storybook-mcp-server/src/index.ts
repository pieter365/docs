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

// Initialize MCP server
const server = new McpServer({
  name: "storybook-mcp-server",
  version: "1.0.0",
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
 * Main function to start the MCP server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't interfere with MCP protocol
  console.error("Storybook MCP Server started successfully");
  console.error("Version: 2.0.0");
  console.error("Available tools:");
  console.error("  [Basic Operations]");
  console.error("  - list_stories");
  console.error("  - parse_story");
  console.error("  - parse_component");
  console.error("  - extract_story_props");
  console.error("  [Generation]");
  console.error("  - convert_story_to_component");
  console.error("  - generate_story_from_component");
  console.error("  [Sync Operations]");
  console.error("  - validate_sync");
  console.error("  - sync_story_to_component");
  console.error("  - sync_component_to_story");
  console.error("  - bulk_sync_check");
  console.error("  [Find & Replace]");
  console.error("  - find_and_replace");
}

// Start the server
main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
