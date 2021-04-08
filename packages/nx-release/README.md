# About this project
This is the Government of Alberta - DIO - Nx plugin for Semantic Release.

The project contains both the Nx plugin generator for setting up a monorepo with semantic release
configuration as well as a plugin for semantic release. 

## Semantic release / monorepo
There are multiple challenges with using semantic release in a monorepo:
1. Each release project needs distinct release tags.
2. Each project should be evaluated based on only commits related to it.
3. Interdependencies between projects need to be handled.
4. Interdependencies between publishable/releasable projects require coordinatino of releases.

For 1, 2, and 3 in part this project uses the approach from [semantic-release-monorepo](https://github.com/pmowrer/semantic-release-monorepo) along with Nx capabilities: 
- Each project uses a distinct `tagFormat`; 
- A custom plugin wraps default plugins for `analyzeCommits` and `generateNotes` and filters for only relevant commits;
- Nx `dep-graph` is used to determine dependency paths that should also be included.

4 is not currently handled, but a solution leveraging Nx capabilities is the general direction. For example, Nx supports ordered execution of tasks based on 'affected'.
