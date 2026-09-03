import {
  addDependenciesToPackageJson,
  formatFiles,
  logger,
  Tree,
  updateJson,
} from '@nx/devkit';

const MCP_PATH = '.mcp.json';
const SERVER_KEY = 'adsp-sdk';
const PACKAGE = '@abgov/adsp-sdk-mcp-server';

// The version this migration pins to, and the entry it knows how to rewrite,
// are both frozen literals rather than imports from utils/quality.ts. A
// released migration has to keep applying the same change forever, so reading
// the live value would let a later edit there silently change what this
// migration does to an old workspace.
const PINNED_VERSION = '^1.12.1';
const PRIOR_ENTRY = { command: 'npx', args: ['-y', PACKAGE] };
const PINNED_ENTRY = { command: 'npx', args: ['--no', PACKAGE] };

// Only ever compared against the two-key entry this generator emits, so key
// order is the sole structural difference JSON.stringify can't see — and
// `args` is the one field whose order is meaningful.
function isEntry(value: unknown, expected: Record<string, unknown>): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const keys = Object.keys(value);
  if (keys.length !== Object.keys(expected).length) return false;
  return keys.every(
    (key) =>
      JSON.stringify((value as Record<string, unknown>)[key]) ===
      JSON.stringify(expected[key]),
  );
}

// Retrofits the supply-chain fix into workspaces scaffolded with the earlier
// `npx -y @abgov/adsp-sdk-mcp-server` entry. npm assumes `--yes` whenever stdin
// isn't a TTY — always the case for a stdio MCP server — so that form fetches
// and executes whatever the registry currently resolves, outside the lockfile
// and invisible to `npm audit`, together with its transitive dependencies.
//
// A migration is the only route to an already-scaffolded workspace: init
// deliberately never clobbers an existing `adsp-sdk` entry (a team may have
// pinned it or repointed it at a local build), so re-running it would add the
// dependency and leave the fetching command form in place.
interface MigrationReport {
  nextSteps: string[];
  agentContext?: string[];
}

export default async function pinAdspMcpServer(
  tree: Tree,
): Promise<MigrationReport | undefined> {
  // No .mcp.json, or no entry in it, means nx-adsp's init never ran here —
  // there's no server to pin, and adding the dependency would be noise.
  if (!tree.exists(MCP_PATH)) {
    return undefined;
  }

  let entry: unknown;
  try {
    entry = JSON.parse(tree.read(MCP_PATH, 'utf-8') ?? '{}')?.mcpServers?.[
      SERVER_KEY
    ];
  } catch {
    logger.warn(
      `[nx-adsp] ${MCP_PATH} is not valid JSON — left untouched. Re-run ` +
        `\`nx g @abgov/nx-adsp:init\` once it parses.`,
    );
    return undefined;
  }

  if (entry === undefined) {
    return undefined;
  }

  // Already pinned, by a newer generator or a previous run of this migration.
  // Still ensure the dependency is present: the entry is only a real pin if
  // there's a local install for `--no` to resolve.
  const alreadyPinned = isEntry(entry, PINNED_ENTRY);

  if (!alreadyPinned && !isEntry(entry, PRIOR_ENTRY)) {
    logger.warn(
      `[nx-adsp] ${MCP_PATH}'s "${SERVER_KEY}" server is customised — left ` +
        `untouched rather than rewritten.`,
    );
    return {
      nextSteps: [
        `${MCP_PATH}'s "${SERVER_KEY}" entry differs from the generated one, so it was ` +
          `left as-is. If it still runs \`npx\` without \`--no\`, the version your agent ` +
          `executes is whatever the registry resolves at session start — outside your ` +
          `lockfile and invisible to \`npm audit\`. To pin it, add ${PACKAGE} to ` +
          `devDependencies and change the entry's args to ` +
          `${JSON.stringify(PINNED_ENTRY.args)}, keeping whatever else you've customised. ` +
          `An entry deliberately pointing at a local build needs no change.`,
      ],
      agentContext: [
        `${MCP_PATH} has a customised "${SERVER_KEY}" MCP server entry that this migration ` +
          `did not rewrite. Read it, and unless it points at a local build, pin it: add ` +
          `${PACKAGE} to devDependencies and set the entry's args to ` +
          `${JSON.stringify(PINNED_ENTRY.args)}. Preserve any other customisation.`,
      ],
    };
  }

  addDependenciesToPackageJson(
    tree,
    {},
    { [PACKAGE]: PINNED_VERSION },
    'package.json',
    // Respect a version the workspace already chose.
    true,
  );

  if (!alreadyPinned) {
    updateJson(tree, MCP_PATH, (json) => ({
      ...json,
      mcpServers: { ...json.mcpServers, [SERVER_KEY]: PINNED_ENTRY },
    }));
  }

  await formatFiles(tree);
  logger.info(
    `[nx-adsp] Pinned the ${SERVER_KEY} MCP server to a ${PACKAGE} dev dependency.`,
  );

  return {
    nextSteps: [
      `Install dependencies, then reconnect (or restart) your MCP client — in that order. ` +
        `\`npx --no\` will fall back to a copy left in npm's _npx cache by the previous ` +
        `\`npx -y\` form, so until the dependency is actually installed you'd still be ` +
        `running an unpinned version. Project-scoped MCP servers also load only at session ` +
        `start, so the entry stays inert until the reconnect.`,
    ],
  };
}
