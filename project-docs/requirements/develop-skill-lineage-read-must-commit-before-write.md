---
title: "develop skill: lineage read must commit before first write"
id: req-001
project-docs-ancestors:
  - product-briefs:agent-delivery-harness
  - features:develop-skill-lineage-plan-step
rules:
  - rule: step 1 requires a stated implementation plan before any code is written
    examples:
      - "Given: step 1 reads the lineage graph and finds sibling resources with shared patterns;
         When: the agent prepares to write the first file;
         Then: it states which sibling resources it found and will reuse, what it is implementing
         fresh, and which domain invariants belong in the service vs. orchestration layer"
    questions: []
  - rule: the independent review receives the implementation plan alongside code and design artifacts
    examples:
      - "Given: a develop skill pass has completed its implementation;
         When: the independent reviewer is invoked;
         Then: it receives the api-design/ux-design, domain terms, implementation plan from step 1,
         and new/changed code — never this pass's own reasoning"
    questions: []
  - rule: the independent reviewer's first question checks whether the diff matches the stated plan
    examples:
      - "Given: the independent reviewer has the implementation plan and the code diff;
         When: it evaluates the code;
         Then: its first question is: does the code match what the plan said it would reuse and
         build fresh?"
    questions: []
questions: []
---
