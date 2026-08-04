---
term: Implementation Plan
aliases: []
not_confused_with: []
project-docs-ancestors: [bounded-contexts:agent-delivery-harness]
resolves: []
---

A structured statement an agent makes after reading the lineage graph in develop skill step 1,
before writing any code. It specifies:

- which sibling resources it found and will reuse (naming them explicitly)
- what it is implementing fresh (and why no sibling already covers it)
- which domain invariants belong in the service layer vs. the orchestration layer

The Implementation Plan is what transforms the lineage read from a note into a commitment — it
forces a decision to be stated before it can be assumed. It is passed to the independent code
reviewer alongside the code diff, so the reviewer can ask whether the diff matches it.
