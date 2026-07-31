#!/usr/bin/env node
// Deterministic check: every rule in a requirement's frontmatter must have at least one
// example or question, and every example must actually be Given/When/Then-shaped, not just
// any text — a vague sentence shouldn't satisfy the same bar as a concrete, testable scenario.
//
// project-docs-lineage's `orphans` check does NOT cover any of this — it's a graph check on
// backward references between files, and rules/examples/questions are structured content
// inside a single requirement file, not separate artifacts. This fills that specific gap.
//
// Rules/examples/questions live in YAML frontmatter (not markdown body bullets) specifically so
// this can use a real YAML parser instead of hand-rolled line-scanning — an earlier version of
// this script had two real bugs from parsing loose markdown by regex (multi-line examples only
// capturing the first line; a dropped exit-code block). Both bug classes disappear once the
// content is structured data instead of prose this script has to reverse-engineer.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const dir = 'project-docs/requirements';
const FRONTMATTER_BLOCK = /^---\n([\s\S]*?)\n---/;
let failed = false;

function isGivenWhenThenShaped(text) {
  const lower = text.toLowerCase();
  const givenAt = lower.indexOf('given');
  const whenAt = lower.indexOf('when', givenAt + 1);
  const thenAt = lower.indexOf('then', whenAt + 1);
  return givenAt !== -1 && whenAt !== -1 && thenAt !== -1;
}

for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
  const path = join(dir, file);
  const content = readFileSync(path, 'utf-8');
  const block = FRONTMATTER_BLOCK.exec(content);
  if (!block) {
    console.log(`[example-mapping] ${path}: no frontmatter block found, skipping.`);
    continue;
  }

  const frontmatter = parse(block[1]);
  const rules = frontmatter.rules ?? [];

  for (const { rule, examples = [], questions = [] } of rules) {
    if (examples.length === 0 && questions.length === 0) {
      console.log(`[example-mapping] ${path}: Rule "${rule}" has neither an Example nor a Question.`);
      failed = true;
      continue;
    }
    for (const example of examples) {
      if (!isGivenWhenThenShaped(example)) {
        console.log(`[example-mapping] ${path}: Rule "${rule}" has an Example that isn't Given/When/Then-shaped: "${example}"`);
        failed = true;
      }
    }
  }
}

if (failed) {
  console.error('[example-mapping] one or more rules are unresolved — see above.');
  process.exit(1);
}
console.log('[example-mapping] every rule has an example or an explicit question, each Given/When/Then-shaped.');
