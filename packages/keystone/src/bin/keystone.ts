#!/usr/bin/env node
// project-docs-ancestors: cli-designs:keystone-init

import { run } from '../cli';

// Deliberately three lines: everything testable lives in `run`, which is what lets the command's
// own contract — its option surface, exit status and payloads — be asserted without spawning a
// process.
run(process.argv.slice(2), {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
})
  .then((status) => process.exit(status))
  .catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
