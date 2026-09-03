# Pin the ADSP SDK MCP server

The codemod half of this migration has already run. It rewrote the workspace-root
`.mcp.json` `adsp-sdk` entry from `npx -y @abgov/adsp-sdk-mcp-server` to
`npx --no @abgov/adsp-sdk-mcp-server` and added `@abgov/adsp-sdk-mcp-server` to
`devDependencies` — **unless** the entry had been customised, in which case it warned and
left it alone. Your job is only the customised case.

## Why the change

npm assumes `--yes` whenever stdin isn't a TTY, which is always true for a stdio MCP
server. So the old `npx -y` form fetched and executed whatever the registry resolved at
session start — the server _and_ its transitive dependencies
(`@modelcontextprotocol/sdk`, `zod`, `@abgov/adsp-cli`), outside the lockfile and
invisible to `npm audit`. `--no` resolves the local install instead and fails loudly if
it's missing, so the version your agent executes is the one your lockfile pinned.

## What to do

Check `agentContext` for the entry that was skipped. If there is none, there is nothing
to do — stop here and say so.

Otherwise, read the `adsp-sdk` entry in `.mcp.json` and decide:

- **It points at a local build** (e.g. `node /path/to/main.js`) — deliberate. Leave it,
  and say why you left it.
- **It runs `npx` in any other form** — pin it. Add
  `@abgov/adsp-sdk-mcp-server` to `devDependencies` (use the version already named in the
  entry's args if there is one, otherwise `^1.12.1`), then set the entry's `args` to
  `["--no", "@abgov/adsp-sdk-mcp-server"]`. Preserve every other field on the entry, and
  every other server in the file.

Do not touch any other `mcpServers` entry — they belong to other plugins or to the team.

Finish by telling the user to install dependencies and then reconnect their MCP client,
since a project-scoped server loads only at session start.
