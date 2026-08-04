---
service: Agent Delivery Harness
audience: [AI coding agents operating a DDDD workflow]
known-platforms: []
questions: []
project-docs-ancestors: [features:develop-skill-lineage-plan-step]
---

The Agent Delivery Harness is the set of DDDD skills (Discover, Design, Develop, Deploy) and
supporting tooling that guides an AI coding agent through delivering a feature end to end.
Each skill is a Markdown file the agent reads at the start of a stage; together they form the
workflow skeleton the agent follows to decompose, design, implement, and ship a capability.

The harness is the primary scaffolded output of the `@abgov/nx-agent:agent-delivery` generator.
It operates in any workspace that hosts a `project-docs/` artifact graph.

Outside the boundary: the business domain being delivered (requirements, domain models, designs),
the code the agent writes for a consuming service, and the OpenShift/ADSP infrastructure the
consuming service deploys to.
