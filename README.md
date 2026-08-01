# Comprix

Comprix is a Visual Studio Code extension prototype that explains the functional
outcomes of a Git comparison. Results live in a native Source Control tree:
outcomes at the top level, contributing files underneath, and cited diff hunks
beneath each file.

## What it does

- **Compare Git References** lets you choose a repository, base ref, and head
  ref. It analyzes the changes on the head since the refs' merge base (Git
  `base...head` semantics).
- **Analyze Commit Range** accepts either `A..B` for a direct endpoint
  comparison or `A...B` for a merge-base comparison.
- The **Comprix Outcomes** view groups changed files by behavioral, API, UI,
  testing, infrastructure, documentation, or other functional outcomes.
- Expanding a contributing file shows the exact hunks cited for that outcome.
  Each citation explains its relevance and is visibly classified as a verified
  `fact`, a model `inference`, or a reviewer `question`.
- Selecting cited evidence opens a read-only VS Code diff at the immutable
  analyzed revisions and reveals its new-side range (or old-side range for a
  deletion). Selecting the file itself still opens its full historical diff,
  and the file context menu can open the current working-tree copy.
- **Re-analyze Comparison** repeats the last request, while **Clear Results**
  resets the view.

Comprix does not run a hosted backend, store credentials, or emit telemetry. It
reads the repository with the local `git` executable. Analysis can use either a
language-model provider registered with VS Code or an explicitly selected local
Codex CLI. The selected provider may process prompts remotely under its own
terms.

## Development

Requirements:

- Node.js 20 or newer
- Git
- Visual Studio Code 1.90 or newer
- Either a VS Code language-model provider such as GitHub Copilot Chat, or an
  authenticated Codex CLI for end-to-end analysis

Install and verify:

```bash
npm install
npm run check
```

Open this folder in VS Code and press `F5` using the **Run Comprix Extension**
launch configuration. This compiles the extension and opens an Extension
Development Host.

Environment note: the WSL remote CLI available during the initial implementation
can open the workspace but rejects the `--extensionDevelopmentPath` flag, so an
automated shell-driven Extension Development Host launch was not possible.
Compilation, unit/integration tests, dependency audit, and VS Code package
inspection were completed successfully. Use `F5` for the remaining interactive
smoke test.

In the development host:

1. Open a workspace backed by Git with at least two commits or refs.
2. Open Source Control and find **Comprix Outcomes**.
3. Run **Comprix: Compare Git References** from the Command Palette or use the
   compare icon in the view title.
4. Choose the base and head refs, approve model access if VS Code asks, and
   expand an outcome, a contributing file, and its cited evidence.
5. Verify that every outcome has evidence, its `fact`, `inference`, or
   `question` label is appropriate, and the tooltip explains the citation.
6. Select a citation and confirm that the immutable before/after diff opens at
   the cited range. Select its parent file to confirm the full-diff command is
   preserved.
7. Also try **Comprix: Analyze Commit Range** with `HEAD~1..HEAD`.

After a successful analysis, Comprix opens Source Control and focuses the
**Comprix Outcomes** section. If the section was hidden manually, reveal it from
**Source Control > … > Views > Comprix Outcomes** or run **View: Open View** and
choose **Comprix Outcomes**.

The test suite creates a disposable, reproducible Git repository under the
system temporary directory. It does not mutate this repository:

```bash
npm test
```

Other useful commands:

```bash
npm run lint
npm run compile
npm run check
npm run watch
```

## Configuration

- `comprix.analysis.provider` selects `vscodeLanguageModel` (the recommended
  default) or `codexCli` (explicit opt-in).
- `comprix.languageModel.vendor` defaults to `copilot`. Set it to an empty
  string to allow any available VS Code model provider.
- `comprix.languageModel.family` optionally prefers a model family. If that
  family is unavailable, Comprix falls back to another model from the selected
  vendor.
- `comprix.codex.executable` defaults to `codex`. Set an absolute path when the
  executable is not on the extension host's `PATH`.
- `comprix.analysis.maxFiles` limits the number of changed files sent for one
  analysis (default `80`).
- `comprix.analysis.maxDiffCharacters` limits patch content (default `60000`).

When configured limits truncate input, Comprix stops at a complete hunk
boundary. The model is told explicitly, and runtime validation only accepts
opaque evidence identifiers for the complete hunks it actually received.

### Using Codex

The Codex IDE extension does not currently expose a public callable extension
API or register its account as a VS Code Language Model provider. A Codex
subscription therefore cannot be attached to GitHub Copilot Chat.

To use the authenticated Codex CLI explicitly:

1. Confirm `codex --version` works in the same local or remote environment where
   the repository is open.
2. Set **Comprix: Analysis Provider** to **Codex CLI**.
3. Run the comparison again.

Comprix invokes `codex exec` without a shell, in an ephemeral read-only sandbox,
ignores user Codex configuration (while retaining authentication), and supplies
a JSON Schema for the final response. It runs from a temporary empty directory
instead of the analyzed repository so repository instructions and tools do not
participate. The route is explicit because it integrates with the CLI process
rather than the VS Code Language Model API.

## Architecture

Comprix targets VS Code 1.90 because it is the first release with the finalized
Language Model API. The implementation uses:

- a local-Git adapter built on argument-safe `spawn` calls (never a shell);
- deterministic unified-diff parsing into stable, addressable evidence units;
- whole-hunk truncation and bounded prompt construction;
- a small `AnalysisProvider` interface with a VS Code Language Model provider;
- an explicit Codex CLI provider with read-only execution and JSON-Schema
  output;
- strict JSON parsing and runtime evidence-ID validation before display;
- a native `TreeView` in Source Control, avoiding a webview;
- a read-only virtual-document provider plus the built-in `vscode.diff`
  command for revision-to-revision navigation and range reveal.

Evidence paths and old/new hunk ranges always come from Git parsing, never from
model output. Both analysis providers use the same structured-output validator;
an unknown, duplicate, malformed, or missing citation rejects the entire
analysis. The VS Code provider retains one strict repair attempt.

## Evidence-link manual verification

The automated suite uses a disposable Git repository to cover a multi-hunk
modified rename, added and deleted files, unusual safe path characters, a final
line without a newline, whole-hunk truncation, structured citation validation,
view mapping, both diff sides, and working-tree independence.

For the interactive check in an Extension Development Host:

1. Compare a branch that changes one file in two separated hunks. Expand each
   file and confirm the hunk labels are distinct and useful.
2. Select citations for a modified or added file and confirm the new-side hunk
   is centered. Select a deleted-file citation and confirm the old side is
   centered. Repeat with a modified rename.
3. Edit or delete the working-tree file after analysis, then select the same
   citation again. The diff must still show the recorded commit revisions.
4. Set **Comprix: Analysis Max Diff Characters** low enough to omit a large
   later hunk, re-analyze, and confirm the overview warns about truncation and
   no result can cite the omitted hunk. The setting's minimum is 4,000
   characters; use a hunk larger than the remaining budget if needed.
5. Run the same comparison once with each configured provider available in your
   development environment.

The architecture follows the official [Language Model API
guidance](https://code.visualstudio.com/api/extension-guides/ai/language-model)
and [Tree View API
guidance](https://code.visualstudio.com/api/extension-guides/tree-view).

## Known limitations

- VS Code's public API does not expose the built-in Git history selection, so
  the prototype uses its own native ref pickers and range input.
- Results are model-generated and can still be incomplete or mistaken even
  after evidence validation. `inference` and `question` labels distinguish
  claims that the cited code does not directly establish; confidence is still
  model-reported and not a correctness guarantee.
- Very large comparisons are intentionally truncated. Binary diffs and
  submodule content are not semantically expanded. A comparison with no
  complete text hunk within the configured limit cannot be analyzed and gets
  an actionable error.
- VS Code's public diff command has no explicit old-side/new-side reveal
  parameter. Comprix opens the correct immutable diff, finds the matching
  visible historical editor, and reveals the range there. If a VS Code version
  does not expose that editor, Comprix keeps the correct diff open and reports
  that automatic reveal was unavailable instead of navigating elsewhere.
- Results exist for the current VS Code session only and are not cached.
- The first prototype analyzes one Git working tree at a time and does not
  include uncommitted changes.
- The Codex CLI provider requires the CLI executable and compatible
  non-interactive flags; it does not call into the Codex IDE panel.

See [COMPRIX.md](COMPRIX.md) for the complete product brief.
