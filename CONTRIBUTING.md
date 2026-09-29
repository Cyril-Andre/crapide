# Contributing to crapide

Thanks for helping improve `crapide`. The default branch is `main`. Please propose changes through a pull request; do not push directly to `main`.

## Propose a change

1. Open an issue for a substantial change so the approach can be discussed before implementation. Small fixes can go straight to a pull request.
2. Fork the repository, then create a focused branch in your fork.
3. Make the change and add or update tests when behavior changes.
4. Run the relevant checks from `extensions/vscode/`:

   ```sh
   npm ci
   npm run check
   npm test
   ```

   On a headless Linux machine, run the extension tests with `xvfb-run -a npm test`.
5. Open a pull request from your fork's branch to `Cyril-Andre/crapide:main`. Explain the change, link any relevant issue, and describe how you tested it.

CI runs on pull requests. The repository owner reviews external contributions and decides when to merge them. Please respond to review comments and keep the pull request focused.

If you find a security issue, follow [SECURITY.md](SECURITY.md) so it can be reported privately.

The optional contract smoke test uses a separately built `crap4csharp` CLI. See [test/e2e/README.md](test/e2e/README.md) for its setup; CI does not require that external build.
