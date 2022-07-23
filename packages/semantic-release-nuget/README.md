# About this project
This is the Government of Alberta - Semantic Release plugin for Nuget.

This plugin is intended for CI environments and runs `dotnet pack` with `--no-build` and `/p:Version={semVer}` in `prepare`.
Note that this means it only sets the Nuget package version and does not handle assembly version(s).
