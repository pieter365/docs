import * as fs from "fs/promises";
import { ASTComponentInfo } from "./astParser.js";

/**
 * Test and decorator generation for Storybook
 */

export interface TestGenerationOptions {
  testFramework: "jest" | "vitest";
  testingLibrary: "react-testing-library" | "enzyme";
  includeAccessibility?: boolean;
  includeInteractions?: boolean;
}

export interface DecoratorOptions {
  type: "theme" | "layout" | "provider" | "custom";
  name: string;
  config?: Record<string, any>;
}

/**
 * Generate unit tests for a component
 */
export async function generateUnitTest(
  componentPath: string,
  componentInfo: ASTComponentInfo,
  options: TestGenerationOptions
): Promise<string> {
  const { testFramework, testingLibrary, includeAccessibility } = options;

  const componentName = componentInfo.name;
  const testRunner = testFramework === "vitest" ? "vitest" : "jest";

  // Generate imports
  const imports = [
    `import { render, screen } from '@testing-library/react';`,
    `import { ${componentName} } from '${componentPath.replace(/\.(tsx?|jsx?)$/, "")}';`,
  ];

  if (includeAccessibility) {
    imports.push(`import { axe, toHaveNoViolations } from 'jest-axe';`);
    imports.push(`expect.extend(toHaveNoViolations);`);
  }

  // Generate test cases
  const testCases: string[] = [];

  // Basic render test
  testCases.push(`
  it('renders without crashing', () => {
    render(<${componentName} ${generateDefaultProps(componentInfo)} />);
    expect(screen.getByRole).toBeDefined();
  });`);

  // Props tests
  componentInfo.props.filter((p) => !p.optional).forEach((prop) => {
    if (prop.type.includes("string")) {
      testCases.push(`
  it('renders with ${prop.name} prop', () => {
    const test${capitalize(prop.name)} = 'Test ${prop.name}';
    render(<${componentName} ${prop.name}={test${capitalize(prop.name)}} ${generateOtherProps(
        componentInfo,
        prop.name
      )} />);
    expect(screen.getByText(test${capitalize(prop.name)})).toBeInTheDocument();
  });`);
    }
  });

  // Accessibility test
  if (includeAccessibility) {
    testCases.push(`
  it('has no accessibility violations', async () => {
    const { container } = render(<${componentName} ${generateDefaultProps(componentInfo)} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });`);
  }

  // Build test file
  return `${imports.join("\n")}

describe('${componentName}', () => {${testCases.join("\n")}
});
`;
}

/**
 * Generate interaction tests using Testing Library
 */
export async function generateInteractionTest(
  componentPath: string,
  componentInfo: ASTComponentInfo,
  interactions: Array<{ event: string; target: string; assertion: string }>
): Promise<string> {
  const componentName = componentInfo.name;

  const imports = [
    `import { render, screen, fireEvent } from '@testing-library/react';`,
    `import userEvent from '@testing-library/user-event';`,
    `import { ${componentName} } from '${componentPath.replace(/\.(tsx?|jsx?)$/, "")}';`,
  ];

  const testCases = interactions.map((interaction) => {
    return `
  it('${interaction.event} on ${interaction.target}', async () => {
    const user = userEvent.setup();
    render(<${componentName} ${generateDefaultProps(componentInfo)} />);

    const element = screen.getBy${interaction.target === "button" ? "Role" : "LabelText"}('${interaction.target}');
    await user.${interaction.event}(element);

    ${interaction.assertion}
  });`;
  });

  return `${imports.join("\n")}

describe('${componentName} Interactions', () => {${testCases.join("\n")}
});
`;
}

/**
 * Generate Storybook play function for interaction testing
 */
export function generatePlayFunction(
  interactions: Array<{ action: string; target: string; value?: string }>
): string {
  const steps = interactions.map((interaction, index) => {
    const { action, target, value } = interaction;

    switch (action) {
      case "click":
        return `  await userEvent.click(canvas.getByRole('${target}'));`;
      case "type":
        return `  await userEvent.type(canvas.getByRole('${target}'), '${value}');`;
      case "clear":
        return `  await userEvent.clear(canvas.getByRole('${target}'));`;
      case "hover":
        return `  await userEvent.hover(canvas.getByRole('${target}'));`;
      default:
        return `  // ${action} on ${target}`;
    }
  });

  return `play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const user = userEvent.setup();

${steps.join("\n")}
}`;
}

/**
 * Generate decorator for Storybook
 */
export function generateDecorator(options: DecoratorOptions): string {
  const { type, name, config } = options;

  switch (type) {
    case "theme":
      return `export const ${name}Decorator = (Story) => (
  <ThemeProvider theme={${config?.theme || "defaultTheme"}}>
    <Story />
  </ThemeProvider>
);`;

    case "layout":
      return `export const ${name}Decorator = (Story) => (
  <div style={{
    padding: '${config?.padding || "20px"}',
    maxWidth: '${config?.maxWidth || "1200px"}',
    margin: '0 auto'
  }}>
    <Story />
  </div>
);`;

    case "provider":
      return `export const ${name}Decorator = (Story) => (
  <${config?.providerName || "Provider"} ${config?.providerProps ? `{...${JSON.stringify(config.providerProps)}}` : ""}>
    <Story />
  </${config?.providerName || "Provider"}>
);`;

    case "custom":
      return `export const ${name}Decorator = (Story, context) => {
  // Custom decorator logic here
  return <Story />;
};`;

    default:
      return `export const ${name}Decorator = (Story) => <Story />;`;
  }
}

/**
 * Generate decorator file for Storybook
 */
export async function generateDecoratorFile(
  decorators: DecoratorOptions[],
  outputPath: string
): Promise<string> {
  const imports = [
    `import React from 'react';`,
    ...decorators
      .filter((d) => d.type === "theme")
      .map(() => `import { ThemeProvider } from 'styled-components'; // or your theme provider`),
  ];

  const decoratorCode = decorators.map((d) => generateDecorator(d)).join("\n\n");

  const content = `${[...new Set(imports)].join("\n")}

${decoratorCode}

// Export all decorators
export const decorators = [
${decorators.map((d) => `  ${d.name}Decorator`).join(",\n")}
];
`;

  await fs.writeFile(outputPath, content, "utf-8");
  return content;
}

/**
 * Generate snapshot test
 */
export function generateSnapshotTest(
  componentName: string,
  componentInfo: ASTComponentInfo
): string {
  return `import { render } from '@testing-library/react';
import { ${componentName} } from './${componentName}';

describe('${componentName} Snapshot', () => {
  it('matches snapshot', () => {
    const { container } = render(<${componentName} ${generateDefaultProps(componentInfo)} />);
    expect(container).toMatchSnapshot();
  });
});
`;
}

/**
 * Helper: Generate default props for testing
 */
function generateDefaultProps(componentInfo: ASTComponentInfo): string {
  const requiredProps = componentInfo.props.filter((p) => !p.optional);

  return requiredProps
    .map((prop) => {
      if (prop.type.includes("string")) return `${prop.name}="test"`;
      if (prop.type.includes("number")) return `${prop.name}={42}`;
      if (prop.type.includes("boolean")) return `${prop.name}={true}`;
      if (prop.type.includes("()") || prop.type.includes("Function"))
        return `${prop.name}={() => {}}`;
      return `${prop.name}={{}}`;
    })
    .join(" ");
}

/**
 * Helper: Generate other required props except one
 */
function generateOtherProps(componentInfo: ASTComponentInfo, excludeProp: string): string {
  const requiredProps = componentInfo.props.filter((p) => !p.optional && p.name !== excludeProp);

  return requiredProps
    .map((prop) => {
      if (prop.type.includes("string")) return `${prop.name}="test"`;
      if (prop.type.includes("number")) return `${prop.name}={42}`;
      if (prop.type.includes("boolean")) return `${prop.name}={true}`;
      if (prop.type.includes("()") || prop.type.includes("Function"))
        return `${prop.name}={() => {}}`;
      return `${prop.name}={{}}`;
    })
    .join(" ");
}

/**
 * Helper: Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Generate accessibility tests
 */
export function generateA11yTests(componentName: string, componentInfo: ASTComponentInfo): string {
  return `import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ${componentName} } from './${componentName}';

expect.extend(toHaveNoViolations);

describe('${componentName} Accessibility', () => {
  it('should not have any accessibility violations', async () => {
    const { container } = render(<${componentName} ${generateDefaultProps(componentInfo)} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has proper ARIA attributes', () => {
    render(<${componentName} ${generateDefaultProps(componentInfo)} />);
    // Add specific ARIA assertions here
  });

  it('is keyboard navigable', () => {
    render(<${componentName} ${generateDefaultProps(componentInfo)} />);
    // Add keyboard navigation tests here
  });
});
`;
}
