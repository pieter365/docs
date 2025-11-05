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
 * Main function to start the MCP server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't interfere with MCP protocol
  console.error("Storybook MCP Server started successfully");
  console.error("Version: 1.0.0");
  console.error("Available tools:");
  console.error("  - list_stories");
  console.error("  - parse_story");
  console.error("  - convert_story_to_component");
  console.error("  - generate_story_from_component");
  console.error("  - parse_component");
  console.error("  - extract_story_props");
}

// Start the server
main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
