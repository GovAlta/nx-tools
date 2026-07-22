**Ubiquitous language.** Name things — entities, actions, states, events — the way domain
experts describe them, not translated into generic technical terms (`Manager`, `Handler`,
`data`). Stay consistent with names the codebase already uses rather than inventing a synonym; if
the actual domain term is unknown, that's a stop-and-ask signal, not something to guess at — a
guessed term tends to propagate and compound the confusion. Prefer domain-oriented module
structure for new code where the layout allows it, but don't retrofit existing structure to
satisfy this.
