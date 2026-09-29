# `crap4csharp` JSON consumer contract

This is the observed `--format json` contract, not a new upstream schema. The source reference is `crap4csharp` commit `064e2436b66251e66240f6ab77ced444670e1a22`, especially `JsonReportFormatter.cs`, `CliApplication.cs`, `MethodMetrics.cs`, and their tests. A disposable Debug build of that commit (with only `global.json` changed from SDK `8.0.406` to locally installed `8.0.404`) produced `Microsoft.Crap4CSharp.dll` SHA-256 `dc172852634bc3e97b6b7c16d44926b4228075a75d4e678c9442d217e5d1410a`. Invoking it with `--format json` from an empty directory returned exit `0` and [`valid/empty.json`](fixtures/json/valid/empty.json). This binary is a local verification artifact, not a bundled dependency.

The same build was invoked against a disposable single-project .NET 8 workspace with one xUnit test. It returned exit `0` and [`valid/real-analysis.json`](fixtures/json/valid/real-analysis.json). The source was `Calculator.Abs(int)`, a two-branch method; the sole test exercised the positive branch. The captured fields are `Demo.Calculator.Abs`, `src/Demo/Calculator.cs`, lines `5–13`, complexity `2`, coverage `66.66666666666667`, and CRAP `2.148148148148148`.

The remaining valid fixtures are source-verified examples, not claims of captured CLI runs. `normal.json` and `over-threshold.json` mirror the values asserted in `CliApplicationTests.MachineReportsPreserveMetricsLocationsAndThresholdExits`. Naming examples follow `JsonReportFormatterTests` and `CrapAnalyzerTests`. `exact-threshold.json` is a valid formatter input with a score of exactly `8.0`; it exercises the consumer boundary, rather than claiming a natural coverage run emitted that value.

## Document shape

The top level is an object with a required `members` array. It may be empty. Every member is an object with these required fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `name` | nonempty string | Qualified containing type and executable member name. Names are labels, **not unique identifiers**. Overloads can share a name. Accessors/operators use CLR names such as `get_Value` and `op_Addition`. |
| `file` | nonempty string or `null` | Source path relative to the CLI invocation directory when possible, using `/` separators. It may be absolute when relative conversion is unavailable. `null` means no file is supplied. |
| `startLine`, `endLine` | positive integer or `null` | Source lines are **1-based and inclusive**. Both are nullable; when both exist, `endLine >= startLine`. No column or syntax span is supplied. |
| `complexity` | positive integer | Cyclomatic complexity supplied by the CLI. |
| `coveragePercent` | finite number in `[0, 100]` or `null` | `null` means unavailable; `0` means measured zero coverage. |
| `crap` | finite number at least `1` or `null` | Original, unrounded CLI score; `null` means unavailable. The CLI owns the calculation. |

`JsonReportFormatter` orders members by CRAP descending, with null scores last, then file, start/end lines, name, complexity, and coverage for ties. Consumers preserve the array order and every record, including duplicate names; they must not use ordering or names as stable identity. Unknown additive fields are ignored, while missing or incompatible known fields fail validation. The format currently has **no schema or CLI version, project identity, member kind, signature, columns, severity, or analysis metadata**. Workspace URI, invocation directory, process exit, and errors belong to the caller's analysis context, outside this JSON type.

The parser validates the document and scalar domains. It does not resolve paths, inspect files, convert line numbers to editor coordinates, recalculate scores, or infer a missing location. A partially null location remains data for the later location resolver to classify as unlocated. JSON cannot encode non-finite numbers, but values parsed as non-finite or unsafe integers are rejected. The strict finding rule, when presentation is implemented, is `crap > 8.0`; a score of exactly `8.0` is not a finding. See [behavior.md](behavior.md).
