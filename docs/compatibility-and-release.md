# P8 compatibility and release evidence

Evidence updated on 2026-10-27 for preview `0.1.0`. The extension declares `engines.vscode: ^1.100.0` and `extensionKind: ["workspace"]`. The VSIX is platform-neutral JavaScript and contains no CLI binary. The tested CLI JSON contract comes from `crap4csharp` fork commit `064e2436b66251e66240f6ab77ced444670e1a22`, also proposed in [microsoft/crap4csharp#11](https://github.com/microsoft/crap4csharp/pull/11). A distributable build of that fork can support the preview independently of upstream acceptance.

| Host | Version / platform | Evidence | Remaining check |
| --- | --- | --- | --- |
| VS Code extension host | 1.100.0, macOS arm64 | 14 extension-host tests passed again on 2026-10-27. | CI Linux run. |
| VS Code extension host | 1.139.1, macOS arm64 | 14 standard tests passed; 15 passed with the real CLI presentation test enabled. Exit `2` JSON produced matching Problems and CodeLens. | CI Linux run. |
| VS Code desktop | macOS arm64 | VSIX `0.1.0` installed in a fresh isolated profile and listed as `crapide.crapide-vscode@0.1.0`. | Visual installed-package walkthrough. |
| Cursor desktop | 3.25.6, macOS arm64 | The same VSIX installed in a fresh isolated profile and listed as `crapide.crapide-vscode@0.1.0`. An attempt to run the VS Code test harness in Cursor passed 11 cases and failed 3: Cursor did not load the extension into that test host, so its configuration was unregistered; an editor-opening API also failed inside Cursor. This does not establish a normal-window product failure or success. | Manual Problems, CodeLens and navigation walkthrough in a normal Cursor window. |
| Linux Dev Container CLI host | .NET SDK 8.0.416, arm64 | A fresh Dev Container started with a disposable C# project and read-only fork CLI mount. The CLI returned exit `2` and JSON with `Demo.Calculator.Risky` at `src/Demo/Calculator.cs:15`, complexity 11, coverage 0% and CRAP 132. | Connect VS Code to this container and run the workspace extension there; CLI execution alone does not prove remote extension-host behavior. |
| Windows, macOS, Linux process paths | CI matrix prepared with Windows 2025, macOS 15 and Ubuntu 24.04 runners. | Local macOS unit/process tests passed. | Observe PR CI results on all three hosts. |
| Browser/virtual workspace | Unsupported by manifest; no `browser` entry point. | Extension-host tests reject virtual workspaces. | None for this preview. |

The ordinary CI tests use a fake CLI and do not require .NET. The optional real-CLI checks run on disposable projects only:

```sh
cd extensions/vscode
npm run test:p7-real-cli -- /absolute/path/to/Microsoft.Crap4CSharp.dll
CRAPIDE_REAL_CLI=/absolute/path/to/Microsoft.Crap4CSharp.dll npm run test:integration
```

The repository's CI locks npm dependencies in `package-lock.json`, `@vscode/vsce` to `4.0.0`, Node to `24.13.1`, tested VS Code versions to `1.100.0` and `1.139.1`, runner OS labels, and GitHub Actions to commit SHAs. Local `npm run check`, 57 unit tests, the VS Code host tests, the focused real-CLI exit `0`/`2`/`1` test, package creation and the 13-entry VSIX allowlist passed on 2026-10-27. A successful CI run builds `crapide-vscode-0.1.0.vsix`, verifies its archive contents and uploads it as a review artifact. That artifact is not a publication.

## Distribution decision

VS Code supports private VSIX installation and publishing through the Visual Studio Marketplace; packaging and publishing are separate steps ([VS Code publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)). Cursor uses Open VSX for third-party extensions ([Cursor extension guide](https://prod.cursor.com/help/customization/extensions)). Open VSX requires its own publisher namespace, agreement and upload process ([Open VSX publishing guide](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions)). A Marketplace listing alone does not distribute this extension to Cursor.

Before closing P8, review the PR CI results and complete the normal-window Cursor and remote VS Code extension-host walkthroughs above. The VS Code installed-package visual check is also outstanding. Record any product failure separately from the Cursor test-harness failure. Before a public release, provide a distributable CLI build with the tested JSON contract, verify the `crapide` publisher identity on each registry and explicitly authorize publication. The preview VSIX can be reviewed and installed privately now.
