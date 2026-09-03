import {
  addDependenciesToPackageJson,
  Tree,
  updateJson,
  writeJson,
} from '@nx/devkit';

// Pinned rather than floating: `npx` resolves a bare package name against the
// local project, so the lockfile entry this produces is what pins the server
// and its whole transitive closure (@modelcontextprotocol/sdk, zod,
// @abgov/adsp-cli) — none of which `npm audit` can see when the server is
// fetched on demand instead. Bumping it for already-scaffolded workspaces
// needs a migration; consuming workspaces on Dependabot/Renovate get a
// reviewable PR instead of silent per-machine version drift.
const ADSP_MCP_SERVER_VERSION = '^1.12.1';

/**
 * Registers the @abgov/adsp-sdk-mcp-server MCP server in the workspace-root
 * `.mcp.json` so a coding agent (Claude Code and other MCP clients) can look up
 * grounded ADSP docs and `@abgov/adsp-service-sdk` reference instead of guessing.
 *
 * It's a stdio knowledge server (no credentials), but wiring is not just config:
 * it's also a dev dependency, so the version the client executes is the one the
 * lockfile resolved and `npm audit` can see. `--no` is what makes that binding
 * real — npm assumes `--yes` when stdin isn't a TTY, which is always the case for
 * a stdio MCP server, so without it a resolution miss would silently fetch from
 * the registry instead of failing. Merges into an existing `.mcp.json` and never
 * clobbers a user-customized `adsp-sdk` entry (or a pinned version), so it's safe
 * to re-run and to run for every generated service.
 *
 * The caller is responsible for the install task; every app/service generator
 * already returns one for its own dependencies, and `init` returns one for this.
 *
 * The reconnect reminder lives here, not in each caller — project-scoped MCP
 * servers load at session start, so a file write mid-session (whether from
 * an app/service generator or the standalone `init` generator) leaves the
 * entry configured but inert until the client reconnects, and every caller
 * needs to say so, not just one.
 */
export function addAdspMcpServer(host: Tree): void {
  const mcpPath = '.mcp.json';
  const server = {
    command: 'npx',
    args: ['--no', '@abgov/adsp-sdk-mcp-server'],
  };

  addDependenciesToPackageJson(
    host,
    {},
    { '@abgov/adsp-sdk-mcp-server': ADSP_MCP_SERVER_VERSION },
    'package.json',
    // A team may have pinned their own version; don't bump it out from under them.
    true,
  );

  if (host.exists(mcpPath)) {
    updateJson(host, mcpPath, (existing) => {
      const mcpServers = { ...(existing?.mcpServers ?? {}) };
      // Preserve an existing entry (a team may have pinned a version or repointed
      // it at a local build) — only add ours when it isn't already configured.
      mcpServers['adsp-sdk'] = mcpServers['adsp-sdk'] ?? server;
      return { ...existing, mcpServers };
    });
  } else {
    writeJson(host, mcpPath, { mcpServers: { 'adsp-sdk': server } });
  }

  console.log(
    '\n✓ .mcp.json configures the ADSP SDK MCP server (adsp-sdk), pinned to the\n' +
      '  @abgov/adsp-sdk-mcp-server dev dependency.\n' +
      '  Project-scoped MCP servers load at session start, not on a mid-session file\n' +
      '  change — install dependencies, then reconnect (or restart) your MCP client\n' +
      '  before relying on it.\n',
  );
}
