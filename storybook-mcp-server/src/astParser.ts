import * as ts from "typescript";
import * as fs from "fs/promises";
import { getCache } from "./cacheManager.js";

/**
 * AST-based parser using TypeScript Compiler API
 * More robust than regex parsing
 * Now with intelligent caching for large projects
 */

const cache = getCache({
  ttl: 10 * 60 * 1000, // 10 minutes for AST parsing
  maxMemoryEntries: 500,
  enableFileWatching: true,
});

export interface ASTComponentInfo {
  name: string;
  props: Array<{
    name: string;
    type: string;
    optional: boolean;
    defaultValue?: string;
    description?: string;
  }>;
  imports: Array<{
    name: string;
    from: string;
  }>;
  exports: string[];
}

export interface ASTStoryInfo {
  title: string | null;
  component: string | null;
  stories: Array<{
    name: string;
    args: Record<string, any>;
    play?: string;
  }>;
  decorators: string[];
  parameters: Record<string, any>;
}

/**
 * Parse a TypeScript/React component file using AST (with caching)
 */
export async function parseComponentAST(filePath: string): Promise<ASTComponentInfo> {
  return cache.get(
    `component:${filePath}`,
    async () => parseComponentASTUncached(filePath),
    filePath
  );
}

/**
 * Internal: Parse component without cache
 */
async function parseComponentASTUncached(filePath: string): Promise<ASTComponentInfo> {
  const sourceCode = await fs.readFile(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  const result: ASTComponentInfo = {
    name: "",
    props: [],
    imports: [],
    exports: [],
  };

  function visit(node: ts.Node) {
    // Extract imports
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (ts.isStringLiteral(moduleSpecifier)) {
        const from = moduleSpecifier.text;
        if (node.importClause?.namedBindings) {
          if (ts.isNamedImports(node.importClause.namedBindings)) {
            node.importClause.namedBindings.elements.forEach((element) => {
              result.imports.push({
                name: element.name.text,
                from,
              });
            });
          }
        }
      }
    }

    // Extract interface/type Props
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      const name = node.name.text;
      if (name.includes("Props")) {
        if (ts.isInterfaceDeclaration(node)) {
          node.members.forEach((member) => {
            if (ts.isPropertySignature(member) && member.name) {
              const propName = member.name.getText(sourceFile);
              const optional = !!member.questionToken;
              const type = member.type ? member.type.getText(sourceFile) : "any";

              // Extract JSDoc description
              let description: string | undefined;
              const jsDocTags = ts.getJSDocTags(member);
              if (jsDocTags.length > 0) {
                description = jsDocTags[0].comment?.toString();
              }

              result.props.push({
                name: propName,
                type,
                optional,
                description,
              });
            }
          });
        }
      }
    }

    // Extract component name from export
    if (ts.isFunctionDeclaration(node) || ts.isVariableStatement(node)) {
      const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      if (modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (ts.isFunctionDeclaration(node) && node.name) {
          result.name = node.name.text;
          result.exports.push(node.name.text);
        } else if (ts.isVariableStatement(node)) {
          node.declarationList.declarations.forEach((decl) => {
            if (ts.isIdentifier(decl.name)) {
              if (!result.name) result.name = decl.name.text;
              result.exports.push(decl.name.text);
            }
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return result;
}

/**
 * Parse a Storybook story file using AST (with caching)
 */
export async function parseStoryAST(filePath: string): Promise<ASTStoryInfo> {
  return cache.get(
    `story:${filePath}`,
    async () => parseStoryASTUncached(filePath),
    filePath
  );
}

/**
 * Internal: Parse story without cache
 */
async function parseStoryASTUncached(filePath: string): Promise<ASTStoryInfo> {
  const sourceCode = await fs.readFile(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  const result: ASTStoryInfo = {
    title: null,
    component: null,
    stories: [],
    decorators: [],
    parameters: {},
  };

  function extractObjectLiteral(node: ts.ObjectLiteralExpression): Record<string, any> {
    const obj: Record<string, any> = {};
    node.properties.forEach((prop) => {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        const key = prop.name.text;
        const value = prop.initializer.getText(sourceFile);
        obj[key] = value;
      }
    });
    return obj;
  }

  function visit(node: ts.Node) {
    // Extract meta (default export)
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      if (ts.isObjectLiteralExpression(node.expression)) {
        node.expression.properties.forEach((prop) => {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            const key = prop.name.text;
            if (key === "title" && ts.isStringLiteral(prop.initializer)) {
              result.title = prop.initializer.text;
            } else if (key === "component" && ts.isIdentifier(prop.initializer)) {
              result.component = prop.initializer.text;
            } else if (key === "decorators" && ts.isArrayLiteralExpression(prop.initializer)) {
              result.decorators = prop.initializer.elements.map((el) => el.getText(sourceFile));
            } else if (key === "parameters" && ts.isObjectLiteralExpression(prop.initializer)) {
              result.parameters = extractObjectLiteral(prop.initializer);
            }
          }
        });
      }
    }

    // Extract stories (named exports)
    if (ts.isVariableStatement(node)) {
      const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      if (modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        node.declarationList.declarations.forEach((decl) => {
          if (ts.isIdentifier(decl.name) && decl.initializer) {
            const storyName = decl.name.text;
            if (storyName !== "default" && ts.isObjectLiteralExpression(decl.initializer)) {
              const args: Record<string, any> = {};
              let play: string | undefined;

              decl.initializer.properties.forEach((prop) => {
                if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                  const key = prop.name.text;
                  if (key === "args" && ts.isObjectLiteralExpression(prop.initializer)) {
                    Object.assign(args, extractObjectLiteral(prop.initializer));
                  } else if (key === "play") {
                    play = prop.initializer.getText(sourceFile);
                  }
                }
              });

              result.stories.push({
                name: storyName,
                args,
                play,
              });
            }
          }
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return result;
}

/**
 * Update story args using AST transformation
 */
export async function updateStoryArgsAST(
  filePath: string,
  storyName: string,
  newArgs: Record<string, any>
): Promise<string> {
  const sourceCode = await fs.readFile(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  const printer = ts.createPrinter();
  let modified = false;

  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    return (rootNode) => {
      function visit(node: ts.Node): ts.Node {
        // Find the story variable declaration
        if (ts.isVariableStatement(node)) {
          const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
          if (modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
            const declaration = node.declarationList.declarations[0];
            if (
              declaration &&
              ts.isIdentifier(declaration.name) &&
              declaration.name.text === storyName &&
              declaration.initializer &&
              ts.isObjectLiteralExpression(declaration.initializer)
            ) {
              // Create new args property
              const argsProperties = Object.entries(newArgs).map(([key, value]) => {
                return ts.factory.createPropertyAssignment(
                  ts.factory.createIdentifier(key),
                  ts.factory.createIdentifier(String(value))
                );
              });

              const newArgsObject = ts.factory.createObjectLiteralExpression(argsProperties, true);

              // Replace or add args property
              const properties = declaration.initializer.properties.map((prop) => {
                if (
                  ts.isPropertyAssignment(prop) &&
                  ts.isIdentifier(prop.name) &&
                  prop.name.text === "args"
                ) {
                  modified = true;
                  return ts.factory.createPropertyAssignment("args", newArgsObject);
                }
                return prop;
              });

              // If args wasn't found, add it
              if (!modified) {
                properties.push(ts.factory.createPropertyAssignment("args", newArgsObject));
                modified = true;
              }

              const newInitializer = ts.factory.createObjectLiteralExpression(properties, true);

              const newDeclaration = ts.factory.updateVariableDeclaration(
                declaration,
                declaration.name,
                declaration.exclamationToken,
                declaration.type,
                newInitializer
              );

              const newList = ts.factory.updateVariableDeclarationList(node.declarationList, [
                newDeclaration,
              ]);

              return ts.factory.updateVariableStatement(node, modifiers, newList);
            }
          }
        }

        return ts.visitEachChild(node, visit, context);
      }

      return ts.visitNode(rootNode, visit) as ts.SourceFile;
    };
  };

  const result = ts.transform(sourceFile, [transformer]);
  const transformedSourceFile = result.transformed[0];
  const newCode = printer.printFile(transformedSourceFile);

  result.dispose();

  if (modified) {
    await fs.writeFile(filePath, newCode, "utf-8");
  }

  return newCode;
}
