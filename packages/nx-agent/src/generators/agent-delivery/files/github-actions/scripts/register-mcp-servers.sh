#!/usr/bin/env bash
set -euo pipefail

# Registers whatever MCP servers this workspace has configured in .mcp.json with Copilot CLI --
# generic HARNESS behavior; the *content* of .mcp.json (if any) is what varies per workspace/flow.
#
# .mcp.json is Claude-Code-shaped (an mcpServers wrapper); Copilot CLI's own config schema
# differs. Register through `copilot mcp add` directly instead of relying on Copilot to parse
# .mcp.json's shape as-is -- nothing persists on this ephemeral runner between runs, so this
# re-registers every time.

if [[ -f .mcp.json ]]; then
  while IFS= read -r entry; do
    name=$(jq -r '.name' <<<"$entry")
    command=$(jq -r '.command' <<<"$entry")
    mapfile -t args < <(jq -r '.args[]' <<<"$entry")
    echo "registering MCP server: $name"
    copilot mcp add "$name" -- "$command" "${args[@]}"
  done < <(jq -c '.mcpServers | to_entries[] | {name: .key, command: .value.command, args: (.value.args // [])}' .mcp.json)
else
  echo "no .mcp.json found -- nothing to register"
fi
