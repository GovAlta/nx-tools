---
name: Agent Delivery Harness
aliases: []
not_confused_with: []
project-docs-ancestors: []
resolves: []
---

**Inside**: the four DDDD skills (Discover, Design, Develop, Deploy), the gate checks each skill
runs, the commit conventions each skill specifies, and the supporting scripts and tooling generated
by `@abgov/nx-agent:agent-delivery` into a consuming workspace. The step-by-step instructions
each skill gives an agent — including how the agent reads the lineage graph and what it must state
before proceeding — are inside this boundary.

**Outside**: the business domain being delivered (its requirements, domain models, API designs,
and UX designs), the code the agent writes for a consuming service, and the infrastructure
(OpenShift, ADSP) the consuming service deploys to.
