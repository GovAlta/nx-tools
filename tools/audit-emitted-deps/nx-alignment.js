#!/usr/bin/env node
// Checks the generator pins that overlap with what the delegated @nx/*
// generators write.
//
// Each frontend generator calls an @nx/* application generator and then calls
// addDependenciesToPackageJson itself, without keepExistingVersions — so on any
// key both of them write, ours silently wins. When our range is the looser or
// lower one we are quietly walking a generated app back off the version Nx
// chose, and nothing notices. vue-router sat at ^4.0.0 against Nx's ^4.5.0 that
// way.
//
// Nx's choices are read by running the real generators rather than by reading
// their versions.js, because the export existing there does not mean the
// generator writes it: @nx/angular defaults `zoneless` to true on Angular >= 21
// and writes no zone.js entry at all, so a name-matching comparison reports an
// override that is not one.
const fs = require('fs');
const path = require('path');
const semver = require('semver');
const ts = require('typescript');

const { extract } = require('./extract');

// Mirrors the options each generator passes to its delegated @nx/* generator.
// Only the options that can change which dependencies get written matter here
// (routing, unitTestRunner, e2eTestRunner); the rest are copied so the run is
// as close to the real one as possible. Kept in step with the generators by
// assertDelegatesCovered below.
const DELEGATIONS = [
  {
    generator: 'vue-app',
    module: '@nx/vue',
    export: 'applicationGenerator',
    options: {
      name: 'probe',
      style: 'css',
      skipFormat: true,
      linter: 'eslint',
      unitTestRunner: 'vitest',
      e2eTestRunner: 'playwright',
      routing: true,
      directory: 'apps/probe',
    },
  },
  {
    generator: 'react-app',
    module: '@nx/react',
    export: 'applicationGenerator',
    options: {
      name: 'probe',
      style: 'css',
      skipFormat: true,
      linter: 'eslint',
      unitTestRunner: 'jest',
      e2eTestRunner: 'playwright',
      strict: false,
      directory: 'apps/probe',
    },
  },
  {
    generator: 'express-service',
    module: '@nx/express',
    export: 'applicationGenerator',
    options: {
      name: 'probe',
      skipFormat: true,
      skipPackageJson: false,
      linter: 'eslint',
      unitTestRunner: 'jest',
      e2eTestRunner: 'jest',
      js: false,
      directory: 'apps/probe',
    },
  },
  {
    generator: 'angular-app',
    module: '@nx/angular/generators',
    export: 'applicationGenerator',
    options: {
      name: 'probe',
      prefix: 'probe',
      linter: 'none',
      e2eTestRunner: 'playwright',
      skipFormat: true,
      directory: 'apps/probe',
    },
  },
];

// The generators reach their @nx/* peers through `await import('@nx/...')`, so
// the set of those specifiers is the source of truth for what should be covered
// above. A new delegated generator with no entry here would otherwise be
// checked silently against nothing.
function assertDelegatesCovered(packagesRoot) {
  const specifiers = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'files') continue;
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts'))
        continue;
      const source = ts.createSourceFile(
        full,
        fs.readFileSync(full, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node) => {
        if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments.length &&
          ts.isStringLiteralLike(node.arguments[0]) &&
          node.arguments[0].text.startsWith('@nx/')
        ) {
          specifiers.add(node.arguments[0].text);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  };
  walk(packagesRoot);

  const covered = new Set(DELEGATIONS.map((d) => d.module));
  // @nx/vue is imported twice (vue-app and vue-components); the library
  // generator writes no dependency our generators also pin, so one entry for
  // the application generator is enough.
  const missing = [...specifiers].filter((s) => !covered.has(s));
  if (missing.length) {
    console.log(
      `Delegated @nx/* generators with no DELEGATIONS entry: ${missing.join(', ')}`,
    );
    console.log(
      'Add one so its dependency choices are compared against our pins.\n',
    );
    return false;
  }
  return true;
}

async function nxChoices(delegation) {
  const { createTreeWithEmptyWorkspace } = require('@nx/devkit/testing');
  const { readJson } = require('@nx/devkit');
  const tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  const generator = require(delegation.module)[delegation.export];
  await generator(tree, delegation.options);
  const pkg = readJson(tree, 'package.json');
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

// True when `ours` admits nothing below what Nx picked. A range whose floor is
// under Nx's floor is the failure we care about: it lets an existing lockfile
// stay on a version Nx has moved past.
function floorAtLeast(ours, theirs) {
  const ourFloor = semver.minVersion(ours);
  const theirFloor = semver.minVersion(theirs);
  if (!ourFloor || !theirFloor) return null;
  return semver.gte(ourFloor, theirFloor);
}

async function main() {
  const extracted = extract('packages');
  const ourRanges = new Map();
  for (const map of [extracted.dependencies, extracted.devDependencies]) {
    for (const [name, byRange] of map) {
      ourRanges.set(name, [...byRange.keys()]);
    }
  }

  const ok = assertDelegatesCovered('packages');
  const problems = [];
  let compared = 0;

  for (const delegation of DELEGATIONS) {
    const theirs = await nxChoices(delegation);
    for (const [name, ourList] of ourRanges) {
      const theirRange = theirs[name];
      if (!theirRange) continue;
      for (const ours of ourList) {
        compared += 1;
        const satisfies = floorAtLeast(ours, theirRange);
        if (satisfies === false) {
          problems.push({
            generator: delegation.generator,
            name,
            ours,
            theirRange,
          });
        }
      }
    }
  }

  console.log(
    `Compared ${compared} pins against what ${DELEGATIONS.length} delegated @nx/* generators write.\n`,
  );

  if (problems.length) {
    console.log(`Pins below Nx's own floor (${problems.length}):\n`);
    for (const problem of problems) {
      console.log(
        `  ${problem.name}: we pin ${problem.ours}, ${problem.generator}'s @nx/* generator writes ${problem.theirRange}`,
      );
    }
    console.log(
      "\nOur addDependenciesToPackageJson runs after the @nx/* generator and does not\npass keepExistingVersions, so ours wins. Raise it to Nx's floor or above.",
    );
    return 1;
  }

  console.log("No pin sits below the delegated generator's own floor.");
  return ok ? 0 : 1;
}

main().then((code) => process.exit(code));
