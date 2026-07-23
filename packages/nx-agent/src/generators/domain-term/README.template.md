# Domain terms

The ubiquitous language for this project — domain terms as the business actually uses them, not
translated into technical jargon.{{SHARED_CONTEXT_NOTE}} One file per term, so each stays
independently reviewable, and so listing this folder (cheap — just filenames) is enough to check
the existing vocabulary before coining a new name; only open a file when you need its full
definition.

Add a term with `nx g @abgov/nx-agent:domain-term <name>` — don't hand-author files here, so the
frontmatter shape stays consistent. Each file:

    ---
    term: Case
    aliases: []
    not_confused_with:
      - term: File
        reason: File is the underlying record storage; Case is the workflow around it.
    ---

    A single citizen-facing request being tracked from intake through resolution.

- `term` — the canonical name, matching the filename.
- `aliases` — other words that mean the *same* thing; recording them here heads off a synonym
  drifting into use unchecked elsewhere.
- `not_confused_with` — similar-sounding terms this one is deliberately distinct from, and why.
  Leave it empty if there's no real ambiguity to guard against.

The body is free text — the actual definition, in domain language, with as much nuance as the
term needs. Keep it current: when a term gets clarified (with a domain expert, in a requirements
doc, in conversation), update its file rather than letting the answer live only in one commit
message or one person's memory.
