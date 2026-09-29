# ADR 003 — Invoke `crap4csharp` as an external JSON producer

Status: accepted for the architecture spike. The observed CLI contract comes from the separate `crap4csharp` checkout's `src/Crap4CSharp/JsonReportFormatter.cs`, `CliApplication.cs`, `Program.cs`, `README.md` and tests; publication and distribution remain to be verified.

## Decision

Each IDE adapter uses a process boundary around a **user-installed, prebuilt** `crap4csharp` CLI. JSON stdout is the primary IDE contract. SARIF is not parsed into the IDE model. `crap4csharp` alone computes and gates the metrics. The VS Code/Cursor MVP invokes the CLI with argument-array tokens `--format`, `json`, cwd set to the selected workspace folder, and no file arguments. That uses the CLI's existing `src/` discovery and avoids implementing project/file resolution in the extension. The call is one per workspace folder, serialized per folder. Multi-project folders that the CLI rejects are reported as unsupported by this MVP.

## Discovery and configuration

1. Honor an explicit **per-workspace-folder** `crapide.cliPath` setting, after resolving it on the extension host machine. Accept a native executable or a `.dll`; for a `.dll`, spawn configurable `dotnet` with that DLL as the first argument. Paths and options are separate argument-array elements. An explicit invalid path is an error; do not silently switch to another CLI.
2. Without an explicit path, try `crap4csharp` on the extension host's `PATH` when a packaged executable is available. Do not assume `dotnet tool` distribution, a particular installed location, or a global executable name beyond the documented fallback. No automatic installation/download.
3. P4 validates these launch modes on the actual distributed CLI. P7 exposes the setting and user guidance. Do not use `dotnet run`: build/restore chatter could contaminate stdout and would depend on source checkout details.

The configured path is a command location, not a way to pass arbitrary shell text. Spawn without a shell, with an explicit cwd, bounded output buffers, and no secrets in user-facing errors. The CLI is trusted user-installed code and it runs target tests. Analysis requires a trusted, local/remote file-backed workspace. A desktop extension should run in the workspace extension host so the CLI and files are on the same machine; web-only and virtual workspaces fail with an explanation. [VS Code extension-host documentation](https://code.visualstudio.com/api/advanced-topics/extension-host) describes this placement.

## Output and exit protocol

| Exit / output | Adapter interpretation |
| --- | --- |
| `0` with valid JSON | Successful analysis, including `{ "members": [] }`. |
| `2` with valid JSON | Successful analysis whose **CLI** threshold was exceeded. Parse and publish members; do not classify as a process failure. |
| `1` | Fatal/usage failure. Do not parse stdout as a partial report or publish results; show a concise error and bounded stderr. |
| Other code, signal, spawn failure, timeout, cancellation | Failed/incomplete run; no new findings. Log bounded details and show a specific actionable message. |
| `0`/`2` with empty, malformed or incompatible stdout | Protocol failure. Do not interpret as an empty analysis. |

The current CLI reserves stdout for one JSON document in machine mode, sends progress/error text to stderr, emits an empty document and exit `0` when no files are found, emits the document and exit `2` for `CRAP > 8.0`, and emits no report on exit `1`. Drain stdout and stderr concurrently to avoid blocking. Do not reject a valid report merely because stderr contains test progress or a threshold message. Limit captured bytes and display only a bounded sanitized excerpt on error. Clear stale results on a new run; publish only after full validation.

## Compatibility rules

The current JSON has no schema version or CLI version metadata. The parser validates the **shape**, not a fictional version number: top-level object with `members` array, required known fields of expected type, nullable fields only where the CLI allows them, finite numeric values, positive/orderly lines, and meaningful coverage range. Ignore unknown additive fields; reject missing fields, wrong types, invalid required values and unexpected top-level structures. Preserve original numerical precision. P3 must use actual CLI fixtures, including escape characters, `null`, overloaded names and non-method member names. A stale CLI lacking `--format json` is detected by a failed invocation and non-JSON/usage output; P7 explains how to upgrade or configure the tool. A future upstream schema-version field may be adopted by a separate ADR after it exists; until then, do not claim reliable pre-run version negotiation. No import of `crap4csharp` assemblies/source and no duplicate CRAP formula, coverage mapping, or threshold configuration.

## Paths, failures and side effects

The CLI emits paths relative to cwd where possible. Resolve those against the same cwd; annotate only existing `.cs` files within that workspace folder. Nullable/missing locations remain unlocated. A CLI run can fail because no owning `.csproj` or matching test project exists, files span projects, coverage is absent/ambiguous, tests fail, or the CLI/runtime is missing. Error text should point to the CLI prerequisite or layout restriction rather than presenting a fabricated zero-score report.

The current CLI runs `dotnet test` and deletes/recreates `coverage/` beneath cwd. Before running against a folder with an existing `coverage/`, the MVP asks the user to confirm that the CLI may replace it; otherwise the folder is skipped. This remains true on subsequent runs until a safer output-directory facility is available. The eventual CLI output-directory option would remove this friction, but is not required or implemented during this spike. The extension does not remove files itself.

## Cancellation and isolation

The process runner returns a structured outcome (`stdout`, `stderr`, exit/signal, elapsed/cancelled state) to an analysis coordinator; only the coordinator and presentation layer know VS Code APIs. The runner knows neither diagnostics nor CodeLens. A future cancellation token terminates the child process and prevents publishing a partial document. Because the CLI starts `dotnet test`, P4 must verify whether terminating the top-level process also stops descendants on each host; if not, implement bounded process-tree cleanup using platform-appropriate mechanisms before promising robust cancellation. Timeouts are configurable only if actual run durations justify them; they follow the same incomplete-run rule. Avoid concurrent runs in the same folder because they share `coverage/`.

## Alternatives considered

- Link to a `crap4csharp` assembly or copy its calculation: breaks the external-tool boundary and causes semantics to drift.
- Consume SARIF as the main model: drops non-failing members needed for CodeLens and makes CI reporting structure dictate IDE behavior.
- Parse console output: fragile presentation format and incomplete location/nullable semantics.
- Run one CLI process per file or infer owning projects in the IDE: expensive, inconsistent with the CLI's own resolver, and outside the MVP.
