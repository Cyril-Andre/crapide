# Install and use the preview VSIX

The VSIX contains the VS Code/Cursor workspace extension. Install the external `crap4csharp` CLI separately on the machine that hosts the project. This preview uses its `--format json` output; [the observed JSON contract](../contracts/json-contract.md) records the tested upstream commit.

## Install

From `extensions/vscode/`, run `npm ci`, `npm run check`, `npm test`, then `npm run package`. The resulting file is `crapide-vscode-0.1.0.vsix`. You can also download the review artifact from a successful CI run. The package contains no CLI binary or source.

In VS Code or Cursor, use **Extensions: Install from VSIX...** and select the file. The desktop CLIs also accept:

```sh
code --install-extension /absolute/path/to/crapide-vscode-0.1.0.vsix
cursor --install-extension /absolute/path/to/crapide-vscode-0.1.0.vsix
```

For a remote folder, install the extension on the remote workspace host as prompted by the editor. The CLI, `dotnet`, SDK and project test dependencies must also be available there. VS Code runs a `workspace` extension where the workspace lives; check **Developer: Show Running Extensions** if its location is unclear ([VS Code remote extension guidance](https://code.visualstudio.com/api/advanced-topics/remote-extensions)).

## Analyze a folder

1. Open and trust a file-backed folder with `src/`.
2. In folder settings, set `crapide.cliPath` to a prebuilt CLI executable or `.dll`. Leave it empty only when `crap4csharp` is on the workspace host `PATH`.
3. For a `.dll`, set `crapide.dotnetPath` if `dotnet` is not on the host `PATH`. Absolute paths and paths relative to the folder are supported.
4. Ensure the source belongs to one `.csproj` in the folder and a matching `*.Tests.csproj` or `*.UnitTests.csproj` transitively references it. The test project needs `coverlet.collector`.
5. Run **CRAP: Analyze Workspace**. Confirm replacement if `coverage/` already exists. The CLI runs tests, generates coverage and may return exit `2` when scores exceed 8; that exit still supplies a usable analysis.

Problems contains located members with CRAP strictly above 8. Open a C# source file to see CodeLens values for located members, including those below the threshold. Select a lens to navigate to its reported start line. Rerun the command after edits; CodeLens does not trigger analysis.

## Troubleshoot

Open **View: Toggle Output**, choose **CRAP IDE**, and read the run summary and bounded CLI stderr.

| Symptom | Check |
| --- | --- |
| Command missing | Confirm the VSIX is installed and enabled on the workspace host; reload the editor window. |
| CLI or `dotnet` missing | Check the per-folder paths or host `PATH`. Explicit invalid paths never fall back silently. |
| Required .NET SDK unavailable | Compare the project's `global.json` with `dotnet --list-sdks` on the workspace host. |
| `--format json` unsupported | Install a CLI build with JSON output and update `crapide.cliPath`. |
| Invalid JSON | Verify the configured CLI build against the [JSON contract](../contracts/json-contract.md). |
| Exit `1` | Inspect test failures, matching test-project discovery, `coverlet.collector`, and coverage output in the channel. |
| No `src/` or more than one owning project | Open a supported single-project folder. Multi-project orchestration is not in this preview. |
| Missing Problems or CodeLens for a member | The CLI must supply a valid, existing, in-folder `.cs` location. Unlocated records are counted in the output channel. Ensure `editor.codeLens` is enabled and rerun after edits. |
| Previous findings disappeared | A new run clears old results before analysis. Cancelled and failed runs do not publish partial results. |

Browser and virtual workspaces, untrusted workspaces, background analysis, and arbitrary project layouts are unsupported. The output channel retains at most 256 KiB of recent text. The extension does not send telemetry or fetch the CLI; the CLI may restore project packages while running tests.
