# Optional real CLI contract smoke test

The lightweight P4 runner smoke test launches a prebuilt DLL from an empty disposable directory. It verifies the process adapter and JSON protocol without running target tests or coverage:

```sh
npm run test:runner-smoke -- /absolute/path/to/Microsoft.Crap4CSharp.dll
```

Run this command from `extensions/vscode/` after `npm ci`.

From `extensions/vscode/`, after `npm ci`, run:

```sh
npm run test:contract -- /absolute/path/to/Microsoft.Crap4CSharp.dll
```

A native CLI executable path also works. The test copies [`fixture/`](fixture/) to a disposable directory, invokes the external CLI with `--format json`, parses stdout with the pure P3 parser, and compares the semantic member fields to [`real-analysis.json`](../../contracts/fixtures/json/valid/real-analysis.json). It then removes only its disposable directory. The CLI runs `dotnet test` and writes `coverage/` there. This optional test requires a built CLI with JSON support, .NET 8, and package restore access or a warm NuGet cache; it is not part of the ordinary unit or extension-host test suite.

P7 also checks the runner's three real CLI outcomes in separate disposable copies of the same project:

```sh
npm run test:p7-real-cli -- /absolute/path/to/Microsoft.Crap4CSharp.dll
```

The first copy produces exit `0`; the second adds an uncovered, complex method and produces exit `2` with usable JSON; the third removes the matching test project and produces fatal exit `1`. The script deletes its temporary copies after the check and never runs coverage against the original fixture or your workspace project.
