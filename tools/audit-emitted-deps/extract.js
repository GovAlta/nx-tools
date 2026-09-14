// Extracts every dependency range the generators write into a consuming
// workspace, by reading the actual `addDependenciesToPackageJson` call sites
// with the TypeScript AST.
//
// Reading the call sites rather than a hand-maintained list is deliberate: the
// ranges are plain string literals in generator bodies, so any list kept
// alongside them would drift the first time someone edits one, and a new
// generator would be missed entirely.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const CALL_NAME = 'addDependenciesToPackageJson';

// Migrations are excluded on purpose. A released migration has to keep applying
// the same change forever, so its version literals are frozen by design — see
// the comment on PINNED_VERSION in nx-adsp's pin-adsp-mcp-server. Auditing them
// would report drift that must not be fixed.
const EXCLUDED_DIR = `${path.sep}migrations${path.sep}`;

function sourceFiles(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'files') continue;
        walk(full);
      } else if (
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.spec.ts') &&
        !entry.name.endsWith('.d.ts') &&
        !full.includes(EXCLUDED_DIR)
      ) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found;
}

// Module-level `const NAME = 'range'` declarations, so a range held in a named
// const (nx-agent's HUSKY_VERSION, nx-adsp's ADSP_MCP_SERVER_VERSION) is picked
// up rather than silently skipped.
function stringConstants(source) {
  const constants = new Map();
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isStringLiteralLike(node.initializer)
    ) {
      constants.set(node.name.text, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return constants;
}

// Collects `'name': 'range'` pairs from an argument that may be an object
// literal, a conditional spread (`...(cond ? {a} : {})`), or a nested spread of
// either — all three shapes appear in these generators.
function collectRanges(node, into, constants) {
  if (!node) return;
  if (ts.isObjectLiteralExpression(node)) {
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const name = ts.isIdentifier(prop.name)
          ? prop.name.text
          : ts.isStringLiteralLike(prop.name)
            ? prop.name.text
            : null;
        const range = ts.isStringLiteralLike(prop.initializer)
          ? prop.initializer.text
          : ts.isIdentifier(prop.initializer)
            ? constants.get(prop.initializer.text)
            : undefined;
        if (name && range !== undefined) {
          into.push({ name, range });
        }
      } else if (ts.isSpreadAssignment(prop)) {
        collectRanges(prop.expression, into, constants);
      }
    }
    return;
  }
  if (ts.isConditionalExpression(node)) {
    collectRanges(node.whenTrue, into, constants);
    collectRanges(node.whenFalse, into, constants);
    return;
  }
  if (ts.isParenthesizedExpression(node)) {
    collectRanges(node.expression, into, constants);
  }
}

// Returns { dependencies, devDependencies }, each a map of name -> Set of the
// ranges seen for it. A name with more than one range means two generators
// disagree, which is itself worth reporting.
function extract(packagesRoot) {
  const dependencies = new Map();
  const devDependencies = new Map();

  for (const file of sourceFiles(packagesRoot)) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );

    const constants = stringConstants(source);

    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === CALL_NAME
      ) {
        // addDependenciesToPackageJson(tree, deps, devDeps, packageJsonPath?, keepExistingVersions?)
        const targets = [
          [node.arguments[1], dependencies],
          [node.arguments[2], devDependencies],
        ];
        for (const [arg, sink] of targets) {
          const found = [];
          collectRanges(arg, found, constants);
          for (const { name, range } of found) {
            if (!sink.has(name)) sink.set(name, new Map());
            const bySource = sink.get(name);
            if (!bySource.has(range)) bySource.set(range, []);
            bySource.get(range).push(path.relative(process.cwd(), file));
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return { dependencies, devDependencies };
}

module.exports = { extract };
