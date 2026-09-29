# `crapide` incremental implementation plan

Status: P1 architecture spike complete when these documents are reviewed. **Do not execute P2 in this spike.** The steps below apply to the existing `crapide` project root, separate from `crap4csharp`. Read [architecture.md](architecture.md) and ADRs [001](adr/001-repository-structure.md), [002](adr/002-cross-ide-sharing.md), [003](adr/003-crap4csharp-integration.md) first. `crap4csharp` remains an external tool; its pending JSON contribution must be available in an actual CLI build before release. The maintainer manages Git for `crapide`; these phases do not require changes to `crap4csharp`.

## Phase map

| Phase | Reviewable outcome |
| --- | --- |
| P2 | Extend `crapide` with an inert VS Code extension skeleton |
| P3 | Pinned JSON contract, fixtures and pure parser |
| P4 | External CLI runner and invocation outcome mapping |
| P5 | Manual workspace command and Problems diagnostics |
| P6 | CodeLens and navigation from the same result snapshot |
| P7 | Configuration, compatibility guidance and failure refinement |
| P8 | Cross-host verification, packaging and release readiness |

Every phase keeps implementation and tests in `crapide`, with no edits to `crap4csharp`. Each phase should be a separate, reviewable change. Accept the CLI's current limits instead of silently filling them with IDE-side metric or project logic.

## P2 — Repository bootstrap

**Objective.** Extend the existing `crapide` folder with a minimal, non-analyzing VS Code/Cursor extension package and the remaining project structure. Fix the build/test conventions so later prompts do not revisit repository organization.

**Inputs.** This spike's five documents; ADR 001 directory tree; the current VS Code extension API and TypeScript toolchain documentation. The repository name may be provisional.

**Deliverables.** Preserve the five existing documents under `docs/`. Add `README.md`, `contracts/json-contract.md`, `contracts/behavior.md`, and `contracts/fixtures/json/{valid,invalid}/` (placeholder documentation is acceptable until P3). Create `extensions/vscode/` with an npm-managed TypeScript package, `tsconfig`, lint/check scripts, a minimal `main` activation module and an extension manifest. Use a Node desktop **workspace** extension host, declare virtual workspaces unsupported and untrusted workspaces unsupported, and arrange only the future command contribution/activation point for `CRAP: Analyze Workspace`; executing it may show “not implemented” until P5. Compile TypeScript to `dist/`; use plain `tsc` with no bundler or monorepo package manager initially. Keep unit tests under `extensions/vscode/test/unit`, extension-host tests under `extensions/vscode/test/integration`, and reserve root `test/e2e` for later CLI contract smoke tests. Do not create Rider/Visual Studio projects; note their intended directories in documentation. Add extension-local formatting/lint configuration and ignore generated artifacts. Leave Git setup and history to the maintainer.

**Tests.** Typecheck/build the inert extension; launch it in a VS Code Extension Development Host and confirm activation/command registration without invoking a CLI. A small smoke assertion is enough.

**Non-goals.** No JSON parser, process runner, real analysis, diagnostics, CodeLens, distribution, Rider/Visual Studio package, or shared executable library.

**Dependencies.** P1 only. No `crap4csharp` runtime is needed to bootstrap.

**Completion criteria.** A fresh copy or checkout of `crapide` can install the extension's dev dependencies, compile and run the activation smoke test using documented commands. Every later code/file destination is clear from the tree and ADRs. The command cannot accidentally run tests or mutate coverage artifacts yet.

## P3 — JSON contract, fixtures and parser

**Objective.** Turn the available upstream JSON into a documented, testable consumer contract and a pure TypeScript parser with no VS Code dependency.

**Inputs.** `crap4csharp` JSON formatter, formatter/CLI tests, README and an actual build with `--format json`; `contracts/json-contract.md` and `behavior.md` placeholders from P2. Record the exact CLI build/revision or release used to generate fixtures as provenance, without relying on its source at runtime.

**Deliverables.** Fill `contracts/json-contract.md` with `members[]`, field types, nullability, 1-based inclusive lines, path base, lack of columns/schema version and CRAP ordering. Put representative real or source-verified documents in `contracts/fixtures/json/valid/`: empty, normal, score exactly `8.0`, score above `8.0`, nullable coverage/CRAP/location, escaped/Unicode names, overloads and accessor/operator naming. Add invalid fixtures for malformed JSON, missing `members`, wrong field types, invalid lines/ranges and impossible metric values. Implement a pure parser/validator returning typed *consumer data* and structured parse failures; ignore unknown additive fields, reject incompatible known shapes, and preserve unrounded numeric values. Keep analysis context (workspace folder, cwd, exit) outside the JSON type. Do not add fictitious version/project/member-kind fields.

**Tests.** Fixture-driven unit tests for all valid/invalid cases, including `null` vs zero and duplicate names. Validate path strings as input but leave filesystem resolution to P5. Run at least one contract smoke test against a real CLI build and compare semantic fields, not whitespace or key order.

**Non-goals.** CLI launching inside the parser, editor APIs, SARIF parsing, metric recalculation or an upstream schema change.

**Dependencies.** P2 and access to a CLI build that contains JSON output. If that build is unavailable, fixture provenance is blocked; record the blocker and do not invent output.

**Completion criteria.** Known CLI JSON parses into faithful values; invalid or incompatible documents fail explicitly; parser unit tests require neither VS Code nor an executing CLI.

## P4 — External process runner

**Objective.** Isolate command discovery, argument construction, process lifecycle and exit protocol from analysis presentation.

**Inputs.** ADR 003, P3 parser, a prebuilt CLI executable or `.dll`, documented invocation root behavior.

**Deliverables.** A runner interface and real Node process adapter accepting executable specification, cwd, fixed `--format json` arguments and a cancellation handle. For a `.dll`, invoke configured `dotnet` with the DLL as an argument; otherwise invoke the configured executable or `crap4csharp` on the host `PATH`. Spawn via argument array without a shell. Capture bounded stdout and stderr concurrently. Return a structured success for exit `0` **or `2`** only when JSON is valid; preserve exit `2` as threshold status. Map exit `1`, missing binary/runtime, unexpected exit/signal, malformed stdout, output-limit and cancellation to distinct failures. Serialize calls targeting the same cwd. Establish an explicit child-process cleanup policy for cancelled `dotnet test` and test it where practical.

**Tests.** Unit tests with a fake runner for stdout/stderr/exit matrix and argument/cwd construction, including spaces and Unicode paths. Process integration tests with a tiny temporary stand-in executable for spawn error, stderr chatter, exit `2` with JSON, overflow and cancellation. One real CLI smoke check confirms it can be launched in the selected distribution form. Do not run full coverage for every test.

**Non-goals.** Diagnostics, CodeLens, auto-install, calling `dotnet run`, full multi-project handling, or a new CLI option.

**Dependencies.** P3. The real-CLI smoke check needs a CLI build with JSON support.

**Completion criteria.** Callers receive a stable outcome independent of VS Code APIs; exit `2` is a valid analyzed result; a failed/cancelled process never yields a publishable partial snapshot.

## P5 — Manual command and diagnostics

**Objective.** Connect one explicit user action to the CLI and show threshold findings in Problems.

**Inputs.** P3 parser and P4 runner; VS Code Diagnostic API; ADR 003 path and side-effect rules.

**Deliverables.** Implement `CRAP: Analyze Workspace` for trusted file-backed workspace folders. For each folder: use folder URI as invocation context/cwd, warn when the existing `coverage/` directory would be replaced and require explicit confirmation, run once with `--format json`, resolve only existing in-folder `.cs` paths, validate 1-based line ranges, and publish a per-folder immutable snapshot. On run start remove that folder's stale diagnostics; on failure/cancel leave it clear and report the reason. Publish Warning diagnostics only for located, non-null `crap > 8.0`, with the CLI value and member name in the message. Preserve all other records in the snapshot for P6. Keep folder results isolated in a multi-root workspace; do not analyze two folders as one CLI project. Provide actionable messages for missing CLI, no `src/`, multi-project failure and unusable locations; present the full bounded stderr in an output channel. Add a single diagnostic collection and dispose it correctly.

**Tests.** Pure mapping/path tests for relative/absolute paths, traversal/out-of-folder and symlink-escaped targets, missing files, Windows/macOS/Linux separators, line `1` → editor line `0`, exact `8.0`, `>8.0`, null score/location, duplicated names, and moved/edited files. Extension-host integration tests execute the command with a fake runner and assert Problems, failure clearing, multi-root isolation, trust/virtual restrictions and coverage-directory confirmation. Avoid launching a real CLI in these tests.

**Non-goals.** CodeLens, charts, full-workspace project enumeration, watching edits, background analysis or alternative metric thresholds.

**Dependencies.** P4, P3 and P2 command skeleton. P5 may use the preliminary CLI path setting defined in P2/P4; P7 refines its UX and validation.

**Completion criteria.** A manual command produces correct Problems from a supported one-project fixture; exit `2` still displays findings; invalid runs leave no stale findings; an existing `coverage/` is never replaced without the user's confirmation.

## P6 — CodeLens and navigation

**Objective.** Show the CLI's metric values near source members and let users open the corresponding source location.

**Inputs.** P5 result snapshots and resolved locations; VS Code CodeLens and document-opening APIs.

**Deliverables.** A CodeLens provider for C# documents that reads the current snapshot without running the CLI. Anchor each located member at the reported start line, display CRAP/CC/coverage with clear `N/A` for nulls, and offer navigation to the same location. Use the start line and column 0 because the CLI emits no columns; do not attempt AST matching. A diagnostic click already uses its source range; make CodeLens navigation explicit. Refresh lenses when a folder snapshot changes or is cleared. Preserve distinct overload records and use names in tooltips/commands when same-line members overlap. Keep presentation text adjustable after UX review.

**Tests.** Unit tests for label formatting, nullable metrics, source anchoring and multiple members per line. Extension-host integration tests query CodeLens, invoke navigation on a file fixture, and confirm a failed rerun removes stale lenses while leaving unrelated folders intact.

**Non-goals.** Member signatures, precise syntax spans, hover dashboards, refactoring, metric calculation or Cursor-only UI.

**Dependencies.** P5.

**Completion criteria.** A user can see all located members' supplied values and jump to their reported start line. The provider never starts the CLI and handles null/unlocated records honestly.

## P7 — Configuration and failure handling

**Objective.** Make the MVP usable across machines and diagnose unsupported installations/layouts without changing its metric semantics.

**Inputs.** P4–P6 behavior, real CLI launch observations and user smoke feedback.

**Deliverables.** Complete per-folder `crapide.cliPath` and `crapide.dotnetPath` settings, command-location validation, and guidance for native executable versus prebuilt `.dll`. Distinguish missing CLI, missing `dotnet`, unsupported `--format json`, malformed JSON, exit `1` coverage/test failures, output limit, cancellation and unsupported workspace type. Add a concise run summary with analyzed/unlocated/finding counts and a bounded output channel. Document the CLI's `src/`, single owning project, matching tests and `coverage/` side effects. If real runs justify a timeout, add a configurable bounded timeout following P4's cancellation policy. Verify no telemetry or network behavior was introduced.

**Tests.** Runner/config unit tests for explicit invalid path, fallback PATH, `.dll` launch and error categories. Extension-host tests for settings changes and clear user messages. A small real-CLI test exercises exit `0`, `2` and one fatal error in a disposable project.

**Non-goals.** Auto-download/install, silent fallback from an invalid explicit path, a home-grown project resolver, Rider/Visual Studio adapter, configurable CRAP threshold or background analysis.

**Dependencies.** P6; P4 runner behavior is stable.

**Completion criteria.** A user can point the extension at a supported CLI, understand prerequisites and recover from the main failure modes without consulting source code. An older CLI is not misreported as “no findings.”

## P8 — Packaging and release preparation

**Objective.** Verify the complete VS Code/Cursor MVP and produce reviewable packages and release documentation. Publishing is a separate authorized act.

**Inputs.** P2–P7 package, a released or review-approved CLI JSON contract, current VS Code/Cursor compatibility guidance.

**Deliverables.** Versioned VSIX package, install/use/troubleshooting guide, license/attribution, minimal release notes, pinned CI build/tests and a compatibility matrix for VS Code and Cursor. Run extension-host tests on representative supported VS Code versions and manual Cursor smoke tests. Check local desktop and at least one remote workspace host; document browser/virtual workspace exclusions. Verify package contents include no CLI source or executable unless a future distribution decision explicitly changes that. Verify distribution requirements for VS Code and Cursor/Open VSX independently; do not assume a Marketplace listing automatically appears in Cursor. Cursor's [extension guide](https://prod.cursor.com/help/customization/extensions) describes its registry difference.

**Tests.** Full unit and extension-host suite, focused real-CLI end-to-end run on a disposable one-project target for exit `0`/`2`/`1`, Windows/macOS/Linux path/process checks where available, VSIX install smoke in VS Code and Cursor, and manual validation of Problems/CodeLens/navigation. Keep real coverage runs few and isolated. The test matrix should use a CLI build whose JSON contract matches the P3 fixtures.

**Non-goals.** Publishing without approval, automatic code changes, analytics, Rider or Visual Studio implementation, multi-project orchestration, or shipping an embedded CLI by default.

**Dependencies.** P7 and an accepted distributable CLI with JSON output.

**Completion criteria.** Reviewers can install the VSIX, run the one-project MVP in VS Code/Cursor and trace every displayed metric to CLI JSON; the documented limitations and compatibility evidence are accurate. The package is ready for a separate release decision.

## Later work, outside P2–P8

Rider and Visual Studio adapters get their own architecture/implementation phases, using the same `contracts/` assets and respecting each SDK's UI/process model. A multi-project/workspace orchestration phase should start only after a CLI-level or user-validated approach to per-project analysis and coverage-output isolation exists. Any request for columns, stable member IDs, project identity or schema version should be justified with concrete failed UX/tests and proposed to the CLI as an explicit contract evolution.
