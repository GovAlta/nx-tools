# About this project
This is the Government of Alberta - Semantic Release plugin for Nuget.

This plugin includes the following stages and executes:

**prepare**

`dotnet pack [options] /p:Version=[semVer]`

Note that the semantic version is provided as the `Version` MSBuild property and no other version handling is provided (`VersionSuffix`, `AssemblyVersion`, etc.).

**publish**

`dotnet nuget push *.nupkg`

The `nupkgRoot` configuration property is used to determine the working directory for the command.

The environment variable `NUGET_API_KEY` is used as the API key for pushing to the Nuget source.
