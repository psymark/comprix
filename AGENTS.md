# Comprix contributor guide

## Project goal

Comprix is a prototype Visual Studio Code extension that explains the functional
outcomes of a selected Git comparison. It should let a user choose two refs or a
commit range, generate structured change outcomes, and navigate from an outcome
to its contributing files and diffs.

The product brief is in [COMPRIX.md](COMPRIX.md). Treat it as the source of
truth for scope.

## Working conventions

- Use TypeScript and the VS Code Extension API. Prefer native VS Code views and
  commands; only introduce a webview when the native UI cannot communicate the
  hierarchy well.
- Keep the extension offline-first. Do not add a hosted service, authentication,
  telemetry, or billing.
- Use the local Git executable for repository and comparison data. Quote paths,
  validate selected refs, and handle repositories with no commits or no remote.
- Put AI access behind a small provider interface. A provider must return
  machine-readable structured data, and the extension must validate it before
  displaying it. Do not derive outcomes by parsing unstructured prose.
- Prefer an AI capability already available in the user's VS Code, such as
  GitHub Copilot Chat / Language Model API. Ensure the extension still gives a
  clear actionable message when that capability is unavailable.
- Keep deterministic Git parsing, prompt construction, schema validation, and
  view-model mapping unit tested. Use a tiny reproducible fixture repository for
  comparison tests where it adds confidence.
- Keep dependencies modest and avoid runtime dependencies unless they clearly
  improve correctness or the native extension experience.

## Repository hygiene

- Work in small, coherent commits. Do not bundle unrelated formatting or
  generated output with feature changes.
- Before each commit, inspect `git status` and `git diff --check`. Never discard
  changes you did not create.
- Do not commit `node_modules`, packaged `.vsix` files, coverage output, or
  private configuration. Add appropriate ignores as the scaffold is created.
- Update the README whenever commands, configuration, or user-visible behavior
  changes.

## Verification baseline

For each implementation increment, run the relevant checks and fix failures:

```bash
npm run lint
npm test
npm run compile
```

Also exercise the extension in VS Code's Extension Development Host when the
environment supports it. Record any environment limitation and give concise
manual test steps in the README.

## Expected initial workflow

1. Inspect the current VS Code Git and Language Model APIs against the target
   VS Code engine version before locking the extension architecture.
2. Scaffold commands, the contributed native view, configuration, build/test
   scripts, and documentation.
3. Implement Git comparison collection, structured AI analysis, validation, and
   outcome-to-file navigation as a single vertical slice.
4. Test deterministic seams and run the quality gates above.
