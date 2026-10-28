# P8 compatibility and release evidence

Evidence updated on 2026-10-28 for preview `0.1.0`. The extension declares `engines.vscode: ^1.100.0` and `extensionKind: ["workspace"]`. The VSIX is platform-neutral JavaScript and contains no CLI binary. The tested CLI JSON contract comes from `crap4csharp` fork commit `064e2436b66251e66240f6ab77ced444670e1a22`, also proposed in [microsoft/crap4csharp#11](https://github.com/microsoft/crap4csharp/pull/11). A distributable build of that fork can support the preview independently of upstream acceptance.

| Host | Version / platform | Evidence | Remaining check |
| --- | --- | --- | --- |
| VS Code extension host | 1.100.0, macOS arm64 | 14 extension-host tests passed again on 2026-10-27; Linux CI passed. | None. |
| VS Code extension host | 1.139.1, macOS arm64 | 14 standard tests passed; 15 passed with the real CLI presentation test enabled. Exit `2` JSON produced matching Problems and CodeLens. Linux CI passed on retry after an Xvfb window became unresponsive on the first attempt. | Watch for repeated Linux startup flakiness. |
| VS Code desktop | 1.139.1, macOS arm64 | VSIX `0.1.0` installed in a fresh isolated profile. On a disposable C# project, `CRAP: Analyze Workspace` reported 2 analyzed methods, 1 finding and 0 unlocated. Problems showed `Demo.Calculator.Risky: CRAP 132 (> 8)` at line 15; CodeLens showed `CRAP 132 · CC 11 · Coverage 0%`, and clicking it navigated to line 15. | None. |
| Cursor desktop | 3.25.6, macOS arm64 | The same VSIX installed in a fresh isolated profile and listed as `crapide.crapide-vscode@0.1.0`; the disposable project and `Calculator.cs` opened in a normal Cursor window. An attempt to run the VS Code test harness in Cursor passed 11 cases and failed 3: Cursor did not load the extension into that test host, so its configuration was unregistered; an editor-opening API also failed inside Cursor. Normal-window command execution could not be verified because computer input was redirected to other active Cursor windows and macOS screen capture failed. This does not establish a product failure or success. | Manual Problems, CodeLens and navigation walkthrough in the normal Cursor window. |
| Linux Dev Container extension host | VS Code 1.139.1; .NET SDK 8.0.416, arm64 | A fresh Dev Container started with a disposable C# project and read-only fork CLI mount. The VSIX was installed in the container extension host and `CRAP: Analyze Workspace` ran there. It reported 2 analyzed methods, 1 finding and 0 unlocated; CodeLens showed `CRAP 132 · CC 11 · Coverage 0%`, Problems showed 1 finding, and clicking CodeLens navigated to line 15. The fork CLI independently returned exit `2` JSON for that method. A workspace `crapide.cliPath` pointing at the macOS host initially overrode the Dev Container setting; setting it to the container path resolved the setup error. | None. |
| Windows, macOS, Linux process paths | CI matrix with Windows 2025, macOS 15 and Ubuntu 24.04 runners. | Type, lint, format and unit checks passed on all three hosts in [PR CI run #25](https://github.com/Cyril-Andre/crapide/actions/runs/40541115277). | None. |
| Browser/virtual workspace | Unsupported by manifest; no `browser` entry point. | Extension-host tests reject virtual workspaces. | None for this preview. |

The ordinary CI tests use a fake CLI and do not require .NET. The optional real-CLI checks run on disposable projects only:

```sh
cd extensions/vscode
npm run test:p7-real-cli -- /absolute/path/to/Microsoft.Crap4CSharp.dll
CRAPIDE_REAL_CLI=/absolute/path/to/Microsoft.Crap4CSharp.dll npm run test:integration
```

The repository's CI locks npm dependencies in `package-lock.json`, `@vscode/vsce` to `4.0.0`, Node to `24.13.1`, tested VS Code versions to `1.100.0` and `1.139.1`, runner OS labels, and GitHub Actions to commit SHAs. Local `npm run check`, 57 unit tests, the VS Code host tests, the focused real-CLI exit `0`/`2`/`1` test, package creation and the 13-entry VSIX allowlist passed on 2026-10-27. [PR CI run #26](https://github.com/Cyril-Andre/crapide/actions/runs/40542183627) passed all 11 checks on the prior head and uploaded artifact `crapide-vscode-0.1.0` (SHA-256 `b214324b8cd1d58877e916c38235a1d40aafd46f167d0478025b5dd01e501342`). That artifact is not a publication.

## Distribution decision

VS Code supports private VSIX installation and publishing through the Visual Studio Marketplace; packaging and publishing are separate steps ([VS Code publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)). Cursor uses Open VSX for third-party extensions ([Cursor extension guide](https://prod.cursor.com/help/customization/extensions)). Open VSX requires its own publisher namespace, agreement and upload process ([Open VSX publishing guide](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions)). A Marketplace listing alone does not distribute this extension to Cursor.

Before closing P8, complete the normal-window Cursor walkthrough above. In the isolated Cursor profile with this VSIX installed, open a trusted disposable C# workspace, set `crapide.cliPath` to the local fork DLL, run `CRAP: Analyze Workspace`, confirm one Problems warning and the `CRAP 132 · CC 11 · Coverage 0%` CodeLens on `Risky`, then click the lens and confirm navigation to line 15. Record any product failure separately from the Cursor test-harness failure. Before a public release, provide a distributable CLI build with the tested JSON contract, verify the `crapide` publisher identity on each registry and explicitly authorize publication. The preview VSIX can be reviewed and installed privately now.
