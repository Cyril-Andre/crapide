# crapide

`crapide` is the future set of IDE adapters for the external `crap4csharp` CLI. The first package targets desktop VS Code and Cursor. The current P2 extension is intentionally inert: **CRAP: Analyze Workspace** only displays a “not implemented” message. It does not run the CLI, tests, or coverage.

## Project layout

| Path | Purpose |
| --- | --- |
| `docs/` | Architecture, decisions, and phased implementation plan. |
| `contracts/` | Shared JSON and behavior contract with P3 fixtures. |
| `extensions/vscode/` | npm-managed VS Code/Cursor workspace extension. |
| `extensions/vscode/test/unit/` | Pure TypeScript parser tests. |
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

`check` runs TypeScript validation, ESLint, and Prettier validation. `test` builds the extension, runs the pure parser tests, and launches the activation smoke test in a VS Code Extension Development Host. The test runner may download VS Code into an ignored `.vscode-test/` directory. To debug manually, open `extensions/vscode/` in VS Code, run `npm run build`, press F5 with the included launch configuration, then run **CRAP: Analyze Workspace** in the new window. The command only shows a placeholder message.

`npm run test:unit` runs the JSON parser and fixture tests without a VS Code host or CLI. P3 adds a pure parser; process launching and actual editor analysis are still scheduled for P4 and P5. Fixture provenance and accepted fields are in [the JSON contract](contracts/json-contract.md).

For an optional real-CLI contract check, run `npm run test:contract -- /absolute/path/to/Microsoft.Crap4CSharp.dll` from `extensions/vscode/`. It analyzes a disposable C# fixture and compares the JSON member values with the checked-in real-run fixture. See [test/e2e](test/e2e/README.md).

The extension uses the Node workspace extension host, including remote workspace hosts. Browser and virtual workspaces are unsupported, as are untrusted workspaces.

See [the implementation plan](docs/implementation-plan.md) for P3–P8 and [the architecture](docs/architecture.md) for the CLI boundary.

## Contributing

Contributions are welcome through a fork, a branch, and a pull request to `main`. See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and checks.

## License

`crapide` is released under the [MIT License](LICENSE).
