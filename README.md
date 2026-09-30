# crapide

`crapide` is the future set of IDE adapters for the external `crap4csharp` CLI. The first package targets desktop VS Code and Cursor. **CRAP: Analyze Workspace** runs the installed CLI on explicit request, shows methods over the CRAP threshold in Problems, and displays member metrics through CodeLens.

## Project layout

| Path | Purpose |
| --- | --- |
| `docs/` | Architecture, decisions, and phased implementation plan. |
| `contracts/` | Shared JSON and behavior contract with P3 fixtures. |
| `extensions/vscode/` | npm-managed VS Code/Cursor workspace extension. |
| `extensions/vscode/test/unit/` | Parser, runner, path-resolution and stand-in process tests. |
| `extensions/vscode/test/integration/` | Extension Development Host tests. |
| `test/e2e/` | Optional contract smoke test against a built external CLI. |

Future Rider and Visual Studio adapters will live in `extensions/rider/` and `extensions/visual-studio/`. Those projects are deliberately not created in P2. There is no root package manager or shared executable library.

## Build and smoke test

Use a desktop VS Code installation, Node.js 22.13.x or 24+, and npm. From `extensions/vscode/`:

```sh
npm ci
npm run check
npm test
```

`check` runs TypeScript validation, ESLint, and Prettier validation. `test` builds the extension, runs the Node tests, and launches activation, diagnostic, and CodeLens tests in a VS Code Extension Development Host. The test runner may download VS Code into an ignored `.vscode-test/` directory.

`npm run test:unit` runs the JSON parser, process-runner, and path-resolution tests without a VS Code host or real CLI. The runner accepts an explicit native executable or prebuilt `.dll`, or searches for `crap4csharp` on `PATH`. It always passes `--format json` as separate arguments, treats exit `0` and `2` as usable only with valid JSON, and reports all incomplete runs as failures. It serializes runs per invocation directory. On cancellation or output overflow, it kills the process group on POSIX or uses `taskkill /T /F` on Windows to stop descendants such as `dotnet test`. Fixture provenance and accepted fields are in [the JSON contract](contracts/json-contract.md).

## Manual analysis and CodeLens (P5–P6)

Install a prebuilt JSON-capable `crap4csharp` CLI on the workspace host. Set `crapide.cliPath` to its executable or `.dll` path for each workspace folder; leave it empty to find `crap4csharp` on `PATH`. For a `.dll`, set `crapide.dotnetPath` if `dotnet` is not on `PATH`. Open a trusted, file-backed folder containing `src/`, then run **CRAP: Analyze Workspace**. The extension runs the CLI once per workspace folder, so a folder whose source spans multiple owning projects is rejected by the CLI.

The CLI runs target tests and replaces `coverage/` in its invocation folder. The extension asks for confirmation each time that directory already exists. The command clears old findings when a folder starts, then publishes Warning diagnostics for located members whose supplied CRAP score is strictly above `8.0`. Missing, escaped, or stale source locations are left out of Problems and reported in the **CRAP IDE** output channel. A failed or cancelled run leaves that folder without findings; other workspace folders retain their results.

After an analysis, C# files show CodeLens links at each located member's reported start line. Each link displays the CLI's CRAP score, cyclomatic complexity (CC), and coverage; missing values read `N/A`. Click a link to open that file at the start line. Multiple members on one line retain separate links, identified by name and ordinal. CodeLens reads the saved result only and refreshes when analysis results change. The CLI provides no columns, so links and navigation use column 0. Editing a file does not rerun analysis; run **CRAP: Analyze Workspace** again to refresh its metrics and locations.

For an optional real-CLI contract check, run `npm run test:contract -- /absolute/path/to/Microsoft.Crap4CSharp.dll` from `extensions/vscode/`. It analyzes a disposable C# fixture and compares the JSON member values with the checked-in real-run fixture. See [test/e2e](test/e2e/README.md).

For a lightweight P4 launch check, run `npm run test:runner-smoke -- /absolute/path/to/Microsoft.Crap4CSharp.dll`. It invokes the prebuilt DLL from an empty disposable directory and verifies exit `0` plus a valid empty JSON report; no target tests or coverage run.

The extension uses the Node workspace extension host, including remote workspace hosts. Browser and virtual workspaces are unsupported, as are untrusted workspaces.

See [the implementation plan](docs/implementation-plan.md) for P6–P8 and [the architecture](docs/architecture.md) for the CLI boundary.

## Contributing

Contributions are welcome through a fork, a branch, and a pull request to `main`. See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and checks.

## License

`crapide` is released under the [MIT License](LICENSE).

Security issues can be reported privately as described in [SECURITY.md](SECURITY.md).
