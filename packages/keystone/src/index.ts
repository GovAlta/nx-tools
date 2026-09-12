// project-docs-ancestors: cli-designs:keystone-init

// The package's entry point is its `bin`; this exists because the build declares a `main`. A
// deliberately small surface: an earlier version re-exported every symbol in the package, which
// implied a public API a `bin`-only installer does not have and nothing consumed.
export { run, parse, Io, Options, UsageError } from './cli';
