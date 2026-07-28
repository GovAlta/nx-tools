**MCP servers.** Check `.mcp.json` for a project-scoped MCP server, when one's configured and
connected, before recalling a platform's or design system's API/component inventory from memory —
same training-data-staleness risk as the library case above, just reached through a different
mechanism. Two things routinely go wrong with these, not just one. First: they're typically only
added as a side effect of a specific scaffolding generator (a platform-integration server arriving
bundled with a backend-service generator, a design-system server with a frontend one) rather than
being available whenever the knowledge would actually help — a design decision made before that
generator ever runs gets none of it. Don't just wait for that side effect: check whether the
relevant plugin has an `init` generator — the established convention for a plugin's own
workspace-root setup, run once and safe to re-run — and run it as soon as the need is identified
(e.g. during Design), rather than waiting for a scaffolding generator to bundle it later. Second:
even once `.mcp.json` exists, a server configured or changed mid-session isn't picked up
automatically — say so explicitly and prompt for a reconnect before relying on it, rather than
silently proceeding as if it's already connected. Verify with a tool search rather than assuming
either the file's presence or a prior approval means the server is actually live right now.
