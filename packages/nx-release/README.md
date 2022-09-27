# About this project
This is the Government of Alberta - Nx plugin for Semantic Release.

The project contains both the Nx plugin generator for setting up a monorepo with semantic release
configuration as well as a plugin for semantic release. 

## Semantic release / monorepo
There are multiple challenges with using semantic release in a monorepo:
1. Each release project needs distinct release tags.
2. Each project should be evaluated based on only commits related to it.
3. Interdependencies between projects need to be handled.
4. Interdependencies between publishable/releasable projects require coordination of releases.
5. Channel (next-major, next, latest) information is stored in a git note on a semantic-release ref and does not distinguished between tags (and consequently projects).

For (1), (2), and (3) in part this project uses the approach from [semantic-release-monorepo](https://github.com/pmowrer/semantic-release-monorepo) along with Nx capabilities: 
- Each project uses a distinct `tagFormat`; 
- A custom plugin wraps default plugins for `analyzeCommits` and `generateNotes` and filters for only relevant commits;
- Nx `dep-graph` is used to determine dependency paths that should also be included.

(4) is not currently handled, but a solution leveraging Nx capabilities is the general direction. For example, Nx supports ordered execution of tasks based on 'affected'.



**KNOWN ISSUE** (5) from above is not handled, and non-prerelease channel upgrades will result in only the first project being upgraded when release tags from multiple projects are on the same commit. 

In Semantic Release the channel upgrade is done separately from the next version analysis and there are no extension hooks to modify the behaviour. Prerelease channels with a distinct version format (e.g. 1.0.0-beta.x) are excluded from that process and appear to work.
