import * as fs from "fs/promises";
import * as path from "path";

/**
 * Storybook addon manager
 * Handles addon installation, configuration, and management
 */

export interface AddonInfo {
  name: string;
  type: "preset" | "decorator" | "loader";
  installed: boolean;
  configured: boolean;
}

export interface StorybookConfig {
  stories: string[];
  addons: Array<string | { name: string; options?: Record<string, any> }>;
  framework: string | { name: string; options?: Record<string, any> };
  docs?: Record<string, any>;
  [key: string]: any;
}

/**
 * Find and read .storybook/main.js or main.ts
 */
export async function readStorybookConfig(projectPath: string): Promise<StorybookConfig | null> {
  const possiblePaths = [
    path.join(projectPath, ".storybook", "main.ts"),
    path.join(projectPath, ".storybook", "main.js"),
    path.join(projectPath, ".storybook", "main.cjs"),
  ];

  for (const configPath of possiblePaths) {
    try {
      await fs.access(configPath);
      const content = await fs.readFile(configPath, "utf-8");

      // Parse the config (simplified - real implementation would use AST)
      const config: Partial<StorybookConfig> = {};

      // Extract stories
      const storiesMatch = content.match(/stories:\s*\[(.*?)\]/s);
      if (storiesMatch) {
        config.stories = storiesMatch[1]
          .split(",")
          .map((s) => s.trim().replace(/['"]/g, ""))
          .filter((s) => s);
      }

      // Extract addons
      const addonsMatch = content.match(/addons:\s*\[(.*?)\]/s);
      if (addonsMatch) {
        const addonsStr = addonsMatch[1];
        config.addons = [];

        // Simple string addons
        const simpleAddons = addonsStr.match(/['"]([^'"]+)['"]/g);
        if (simpleAddons) {
          config.addons.push(...simpleAddons.map((a) => a.replace(/['"]/g, "")));
        }

        // Object addons with options
        const objectAddons = addonsStr.match(/\{[^}]+\}/g);
        if (objectAddons) {
          objectAddons.forEach((obj) => {
            const nameMatch = obj.match(/name:\s*['"]([^'"]+)['"]/);
            if (nameMatch) {
              config.addons!.push({ name: nameMatch[1] });
            }
          });
        }
      }

      // Extract framework
      const frameworkMatch = content.match(/framework:\s*['"]([^'"]+)['"]/);
      if (frameworkMatch) {
        config.framework = frameworkMatch[1];
      }

      return config as StorybookConfig;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * List all configured addons
 */
export async function listAddons(projectPath: string): Promise<AddonInfo[]> {
  const config = await readStorybookConfig(projectPath);
  if (!config || !config.addons) {
    return [];
  }

  return config.addons.map((addon) => {
    const name = typeof addon === "string" ? addon : addon.name;
    return {
      name,
      type: determineAddonType(name),
      installed: true,
      configured: true,
    };
  });
}

/**
 * Add an addon to Storybook config
 */
export async function addAddon(
  projectPath: string,
  addonName: string,
  options?: Record<string, any>
): Promise<{ success: boolean; message: string }> {
  const configPaths = [
    path.join(projectPath, ".storybook", "main.ts"),
    path.join(projectPath, ".storybook", "main.js"),
  ];

  let configPath: string | null = null;
  let content: string = "";

  for (const testPath of configPaths) {
    try {
      await fs.access(testPath);
      configPath = testPath;
      content = await fs.readFile(testPath, "utf-8");
      break;
    } catch {
      continue;
    }
  }

  if (!configPath) {
    return {
      success: false,
      message: "Storybook config file not found",
    };
  }

  // Check if addon already exists
  if (content.includes(addonName)) {
    return {
      success: false,
      message: `Addon ${addonName} is already configured`,
    };
  }

  // Add addon to addons array
  const addonEntry = options
    ? `{\n      name: '${addonName}',\n      options: ${JSON.stringify(options, null, 2)}\n    }`
    : `'${addonName}'`;

  // Find the addons array and add the new addon
  const addonsRegex = /(addons:\s*\[)([\s\S]*?)(\])/;
  const match = content.match(addonsRegex);

  if (match) {
    const existingAddons = match[2].trim();
    const newAddons = existingAddons
      ? `${existingAddons},\n    ${addonEntry}`
      : `\n    ${addonEntry}\n  `;
    const newContent = content.replace(addonsRegex, `$1${newAddons}$3`);

    await fs.writeFile(configPath, newContent, "utf-8");

    return {
      success: true,
      message: `Added addon ${addonName} to Storybook config`,
    };
  }

  return {
    success: false,
    message: "Could not find addons array in config",
  };
}

/**
 * Remove an addon from Storybook config
 */
export async function removeAddon(
  projectPath: string,
  addonName: string
): Promise<{ success: boolean; message: string }> {
  const configPaths = [
    path.join(projectPath, ".storybook", "main.ts"),
    path.join(projectPath, ".storybook", "main.js"),
  ];

  let configPath: string | null = null;
  let content: string = "";

  for (const testPath of configPaths) {
    try {
      await fs.access(testPath);
      configPath = testPath;
      content = await fs.readFile(testPath, "utf-8");
      break;
    } catch {
      continue;
    }
  }

  if (!configPath) {
    return {
      success: false,
      message: "Storybook config file not found",
    };
  }

  // Remove simple string addon
  let newContent = content.replace(new RegExp(`['"]${addonName}['"],?\\s*`, "g"), "");

  // Remove object addon
  newContent = newContent.replace(
    new RegExp(`\\{[^}]*name:\\s*['"]${addonName}['"][^}]*\\},?\\s*`, "g"),
    ""
  );

  if (newContent !== content) {
    await fs.writeFile(configPath, newContent, "utf-8");
    return {
      success: true,
      message: `Removed addon ${addonName} from Storybook config`,
    };
  }

  return {
    success: false,
    message: `Addon ${addonName} not found in config`,
  };
}

/**
 * Get recommended addons based on project setup
 */
export function getRecommendedAddons(config: StorybookConfig | null): string[] {
  const recommendations: string[] = [];

  if (!config) return recommendations;

  const installedAddons = config.addons?.map((a) => (typeof a === "string" ? a : a.name)) || [];

  // Essential addons
  if (!installedAddons.includes("@storybook/addon-essentials")) {
    recommendations.push("@storybook/addon-essentials");
  }

  // Accessibility
  if (!installedAddons.some((a) => a.includes("a11y"))) {
    recommendations.push("@storybook/addon-a11y");
  }

  // Interactions
  if (!installedAddons.some((a) => a.includes("interactions"))) {
    recommendations.push("@storybook/addon-interactions");
  }

  // Design tokens
  if (!installedAddons.some((a) => a.includes("design"))) {
    recommendations.push("@storybook/addon-designs");
  }

  return recommendations;
}

/**
 * Determine addon type from name
 */
function determineAddonType(addonName: string): "preset" | "decorator" | "loader" {
  if (addonName.includes("preset")) return "preset";
  if (addonName.includes("decorator")) return "decorator";
  if (addonName.includes("loader")) return "loader";

  // Default based on common addons
  const decoratorAddons = ["a11y", "viewport", "backgrounds", "themes"];
  const presetAddons = ["essentials", "links", "docs"];

  if (decoratorAddons.some((d) => addonName.includes(d))) return "decorator";
  if (presetAddons.some((p) => addonName.includes(p))) return "preset";

  return "preset";
}

/**
 * Popular Storybook addons catalog
 */
export const POPULAR_ADDONS = {
  essentials: {
    name: "@storybook/addon-essentials",
    description: "Essential Storybook addons in one package",
    category: "core",
  },
  a11y: {
    name: "@storybook/addon-a11y",
    description: "Accessibility testing addon",
    category: "testing",
  },
  interactions: {
    name: "@storybook/addon-interactions",
    description: "Test component interactions",
    category: "testing",
  },
  designs: {
    name: "@storybook/addon-designs",
    description: "Embed Figma, Sketch, etc. in stories",
    category: "design",
  },
  storysource: {
    name: "@storybook/addon-storysource",
    description: "View story source code",
    category: "documentation",
  },
  jest: {
    name: "@storybook/addon-jest",
    description: "Display Jest test results",
    category: "testing",
  },
};
