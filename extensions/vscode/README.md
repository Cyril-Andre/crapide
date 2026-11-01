# CRAP IDE for VS Code and Cursor

Run **CRAP: Analyze Workspace** in a trusted, file-backed C# workspace. The extension shows CRAP scores above 8 in Problems and displays CRAP, complexity and coverage beside located members with CodeLens. The values come from the external `Crap4CSharp.IDE.Cli` .NET tool; this extension does not calculate them or include the CLI.

## Setup

1. Install `Crap4CSharp.IDE.Cli` on the machine hosting the workspace. Once published to NuGet, run `dotnet tool install --global Crap4CSharp.IDE.Cli --version <published-version>`. Install the required .NET SDK and the project's test dependencies.
2. Leave `crapide.cliPath` empty to find `crap4csharp-ide` on the workspace host `PATH`. Set it per folder only for an explicit native executable or prebuilt `.dll`.
3. For a `.dll`, set `crapide.dotnetPath` if `dotnet` is not on the host `PATH`.
4. Open a folder with `src/`, one owning C# project and a matching test project, then run **CRAP: Analyze Workspace** from the Command Palette.

Configured relative paths are resolved from each workspace folder. An invalid explicit path is reported without falling back to `PATH`. In a remote workspace, install both the extension and CLI on the remote host.

The CLI runs tests and replaces the folder's `coverage/` directory. CRAP IDE requests confirmation when that directory already exists. A cancelled or failed run clears that folder's previous findings. Run the command again after source changes.

## Troubleshooting and limits

Read the **CRAP IDE** output channel for the CLI's bounded diagnostic output and the analyzed/finding/unlocated counts. If `dotnet` exists but the CLI reports a missing SDK, compare the project's `global.json` with `dotnet --list-sdks`. If `--format json` is unsupported, update the CLI. A missing or failed matching test project, missing `coverlet.collector`, or more than one owning project can stop analysis.

The extension requires a desktop VS Code or Cursor workspace host. Browser and virtual workspaces are unsupported. It does not analyze untrusted workspaces, watch files, or orchestrate several projects as one run. Member locations use CLI line numbers and column zero because the JSON format has no columns.

For installation and development details, see the [project README](https://github.com/Cyril-Andre/crapide#readme). `Crap4CSharp.IDE.Cli` is distributed separately and is not bundled with this extension.
