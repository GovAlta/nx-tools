---
title: "develop skill: require implementation plan commitment before first write"
project-docs-ancestors: []
resolves: []
---

The develop skill's step 1 reads the lineage graph and notes that a sibling resource may have
already implemented shared logic this pass should reuse. No subsequent step requires the agent
to commit to what it found before writing code. The lineage read is therefore structurally
identical whether it shapes the implementation or is noted and set aside.

Append a commitment sentence to step 1 requiring the agent to state its implementation plan —
which sibling resources it found and will reuse, what it is implementing fresh, and which domain
invariants belong in the service vs. orchestration layer — before writing anything. Also update
the independent review section to receive the plan and check the diff against it.

See `DEVELOP-SKILL-LINEAGE-PLAN-STEP-PROPOSAL.md` for the full evidence and exact change wording.
