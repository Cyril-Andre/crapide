# Cross-adapter behavior contract

This document records observable consumer behavior. The P3 TypeScript parser implements only the **JSON validation** portion; process and editor behavior belong to P4–P7.

## JSON validation (P3)

- Parse one complete JSON document. A syntax error or empty/non-JSON stdout is a structured syntax failure, never an empty report.
- Require a top-level object with `members` array and every known member field with its documented type and domain. Reject absent fields, malformed records, invalid lines/ranges, and impossible scalar values with a field path such as `$.members[0].startLine`.
- Ignore unknown additive fields at the top level and on members. Retain known numbers without rounding, nulls without substituting zero, record order, and duplicate names.
- Accept a nonempty path string as input data. Filesystem existence, containment, separators, symlinks, and URI mapping are checked only in P5. Nullable or incomplete locations are retained; no source position is invented.
- Return typed member data or one structured parse failure. Parsing has no VS Code API, process launch, or filesystem dependency.

## Invocation and presentation (later phases)

- Exit `0` or `2` is a usable analysis only with valid JSON. Exit `2` preserves the CLI's threshold status. Exit `1`, cancellation, and malformed output never publish a partial snapshot.
- A score of exactly `8.0` is not a finding; only a **located**, non-null score `> 8.0` becomes a Warning diagnostic. Null CRAP has no threshold decision. Null coverage is unavailable, not 0%.
- Resolve relative paths against the CLI invocation directory, then accept only existing regular `.cs` files canonically contained in the corresponding workspace folder. Line `1` maps to editor line `0`; no column is inferred from the JSON.
- An empty `members` array is a valid report. Duplicate names/overloads remain separate records. Missing or unusable locations remain in the result but have no source annotation.

See [the JSON contract](json-contract.md) and [ADR 003](../docs/adr/003-crap4csharp-integration.md).
