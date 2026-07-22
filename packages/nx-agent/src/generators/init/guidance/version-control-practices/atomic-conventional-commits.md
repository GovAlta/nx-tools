**Atomic, conventional commits.** One logical, self-contained change per commit — not a bundle of
unrelated changes, and not one change split across broken intermediate commits — described with
Conventional Commits formatting (`feat:`, `fix:`, `chore:`). In a workspace using
semantic-release, the type drives the actual version bump — a `fix` hidden inside a `feat` commit
produces the wrong release, not just an unclear message.
