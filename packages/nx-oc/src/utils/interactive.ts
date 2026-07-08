/**
 * True when a generator is running non-interactively and must NOT open an
 * enquirer prompt. Nx's `--no-interactive` only suppresses its own schema
 * `x-prompt`s — manual enquirer prompts in generator code keep blocking unless
 * they check this. Mirrors nx-adsp's utils/agent.ts isNonInteractive; keep in sync.
 */
export function isNonInteractive(): boolean {
  const argv = process.argv;
  const interactiveIdx = argv.indexOf('--interactive');
  const flagged =
    argv.includes('--no-interactive') ||
    argv.includes('--interactive=false') ||
    (interactiveIdx !== -1 && argv[interactiveIdx + 1] === 'false');
  return flagged || !process.stdout.isTTY || process.env.CI === 'true';
}
