# ADR 001 — Standalone monorepo for IDE integrations

Status: accepted for the architecture spike. Scope: the separate `crapide` project root, where these documents now live. Git ownership and operations belong to the maintainer; this spike does not create or alter a repository.

## Decision

Organize `crapide` separately from `crap4csharp`, with three independently packaged IDE adapters and shared contract assets. Bootstrap only the VS Code/Cursor package in P2. Reserve Rider and Visual Studio directories as documented destinations, without generating their projects or adding their toolchains now.

```text
crapide/
├── README.md
├── docs/
│   ├── architecture.md
│   ├── adr/
│   └── implementation-plan.md
├── contracts/
│   ├── json-contract.md
│   ├── behavior.md
│   └── fixtures/
│       └── json/
│           ├── valid/
│           └── invalid/
├── extensions/
│   ├── vscode/                  # VS Code + Cursor, P2 onward
│   │   ├── src/
│   │   └── test/
│   │       ├── unit/
│   │       └── integration/
│   ├── rider/                   # future plugin, no project in P2
│   └── visual-studio/           # future extension, no project in P2
└── test/
    └── e2e/                    # optional real-CLI fixture tests, later
```

The fixture directory contains expected CLI JSON, not copies of `crap4csharp` source. Fixtures are reviewed against the external CLI and can be consumed by each adapter's own tests. Platform-specific tests live beside the corresponding extension. End-to-end tests that exercise a built CLI and a disposable C# project live at the repository root because they validate the boundary rather than an IDE API. Contract docs and ADRs live centrally. No common `src/`, cross-IDE runtime package, workspace-level package manager, or LSP server is required by this decision.

## Rationale

A single repository keeps the shared contract, fixtures, and behavioral rules aligned while allowing independent release identities and SDK lifecycles. It avoids direct source and build coupling to `crap4csharp`, whose JSON contribution is still under review. TypeScript, Rider and Visual Studio will have different build ecosystems; their manifests, dependencies, tests and release workflows stay separate. The common assets are files and specifications, not a package whose implementation language would favor one IDE.

## Alternatives considered

| Option | Reason declined now |
| --- | --- |
| Add IDE extensions to the `crap4csharp` repository | Couples the external analyzer's build/release process to editor toolchains and obscures the CLI contract boundary. |
| One repository per IDE | Makes contract fixtures and behavior specifications easy to drift; creates coordination overhead before the first adapter exists. Revisit if independent ownership/release needs later justify splitting. |
| One multi-target executable library | TypeScript cannot consume the .NET or JVM library directly and it would duplicate metric semantics. |
| LSP service as a fourth product | Adds a long-lived process and protocol before there is a need beyond one manual command and line-level annotations. |

## Consequences

- P2 extends the existing `crapide` documentation into a standalone project skeleton and one TypeScript extension package, not Rider/Visual Studio implementations.
- Each adapter can depend on the CLI contract and its own IDE SDK, not on another adapter's code.
- Release workflows may differ per adapter; shared docs and fixtures receive coordinated reviews.
- A later repository split is possible without changing the CLI JSON contract.
