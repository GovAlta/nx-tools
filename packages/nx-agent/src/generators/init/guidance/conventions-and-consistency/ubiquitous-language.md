**Ubiquitous language.** Name things — entities, actions, states, events — the way domain
experts describe them, not translated into generic technical terms (`Manager`, `Handler`,
`data`). Stay consistent with names the codebase already uses rather than inventing a synonym; if
the actual domain term is unknown, that's a stop-and-ask signal, not something to guess at — a
guessed term tends to propagate and compound the confusion. If this workspace has a
`project-docs/domain-terms/` folder, check it before naming something new, and add a missing term
with `nx g @abgov/nx-agent:domain-term <name>` rather than letting the answer live only in one
commit message or one person's memory. Prefer domain-oriented module structure for new code where
the layout allows it, but don't retrofit existing structure to satisfy this.
