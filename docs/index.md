---
layout: home
nav_order: 0
---

# Nx Tools

Government of Alberta's Nx Tools are a set of [Nx](https://nx.dev) plugins for building, deploying, and releasing applications on the [Alberta Digital Service Platform (ADSP)](https://adsp.alberta.ca).

## Plugins

| Plugin | Description |
|--------|-------------|
| [@abgov/nx-adsp](nx-adsp/nx-adsp) | Generators for ADSP application quickstarts (React, Angular, Express, .NET) |
| [@abgov/nx-oc](nx-oc/nx-oc) | Generators and executor for OpenShift CI/CD pipelines and deployments |
| [@abgov/nx-release](nx-release/nx-release) | Semantic-release configuration generator for Nx monorepos |
| [semantic-release-nuget](nx-release/semantic-release-nuget) | Semantic-release plugin for publishing NuGet packages |
| [@abgov/nx-agent](nx-agent/nx-agent) | AI-agent development tooling — pre-commit checks, secret scanning, a Claude Code deny-list, AGENTS.md guidance, and a domain-vocabulary generator |

## Version compatibility

`@abgov` plugins at version _x_ correspond to `@nx/devkit` at version _x + 10_.

| @abgov version | @nx/devkit version |
|----------------|-------------------|
| 1.x | 11.x |
| 2.x | 12.x |
| 5.x | 15.x |
| 12.x | 22.x |

When installing `@nx` peer dependencies, ensure all packages under the `@nx` scope are at the same version.

## Getting started

See the [Getting Started](getting-started) guide for a step-by-step walkthrough of scaffolding a PEVN (PostgreSQL + Express + Vue 3 + Node) fullstack application deployed on OpenShift.
