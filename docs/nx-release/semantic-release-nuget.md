---
layout: page
title: semantic-release-nuget
parent: NX Release plugin
nav_order: 1
---

<details open markdown="block">
  <summary>
    Table of contents
  </summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

# semantic-release-nuget

[semantic-release](https://semantic-release.gitbook.io/semantic-release/) plugin for publishing NuGet packages from .NET projects.

## Installation

```bash
npm i -D semantic-release-nuget
```

## Configuration

Add the plugin to your `.releaserc.json`:

```json
{
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    ["semantic-release-nuget", {
      "nupkgRoot": "./src/MyProject/bin/Release"
    }]
  ]
}
```

## Plugin stages

### verifyConditions

Checks that the `NUGET_API_KEY` environment variable is set before proceeding. The release fails early if the key is absent.

### prepare

Packs the .NET project:

```bash
dotnet pack [options] /p:Version=<semver>
```

The semantic version is passed as the `Version` MSBuild property. No other version properties (`VersionSuffix`, `AssemblyVersion`, `FileVersion`) are set — manage those in the project file if needed.

### publish

Pushes the generated `.nupkg` to the configured NuGet source:

```bash
dotnet nuget push *.nupkg
```

The command runs from the directory specified by `nupkgRoot`.

## Options

| Option | Required | Description |
|--------|----------|-------------|
| `nupkgRoot` | No | Directory containing the `.nupkg` files produced by `prepare`. Defaults to the project root. |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NUGET_API_KEY` | Yes | API key for authenticating with the NuGet source |

## Full example

```json
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    ["semantic-release-nuget", {
      "nupkgRoot": "./src/MyProject/bin/Release"
    }],
    ["@semantic-release/git", {
      "assets": ["CHANGELOG.md"]
    }]
  ]
}
```
