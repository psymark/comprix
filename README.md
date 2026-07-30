# Comprix

Comprix is a Visual Studio Code extension prototype that explains the functional
outcomes of a Git comparison. Results live in a native Source Control tree:
outcomes at the top level, contributing files underneath, and one-click access
to each historical diff.

## What it does

- **Compare Git References** lets you choose a repository, base ref, and head
  ref. It analyzes the changes on the head since the refs' merge base (Git
  `base...head` semantics).
- **Analyze Commit Range** accepts either `A..B` for a direct endpoint
  comparison or `A...B` for a merge-base comparison.
- The **Comprix Outcomes** view groups changed files by behavioral, API, UI,
  testing, infrastructure, documentation, or other functional outcomes.
- Selecting a contributing file opens a read-only VS Code diff at the exact
  analyzed revisions. The file context menu can also open the current working
  tree copy.
- **Re-analyze Comparison** repeats the last request, while **Clear Results**
  resets the view.

Comprix does not run a hosted backend, store credentials, emit telemetry, or
send repository data anywhere itself. It reads the repository with the local
`git` executable. Analysis uses a language-model provider already enabled in
VS Code; that provider may process prompts remotely under its own terms and
VS Code asks for model access consent.

## Development

Requirements:

- Node.js 20 or newer
- Git
- Visual Studio Code 1.90 or newer
- A VS Code language-model provider, such as GitHub Copilot Chat, for end-to-end
  analysis

Install and verify:

```bash
npm install
npm run check
```

Open this folder in VS Code and press `F5` using the **Run Comprix Extension**
launch configuration. This compiles the extension and opens an Extension
Development Host.

In the development host:

1. Open a workspace backed by Git with at least two commits or refs.
2. Open Source Control and find **Comprix Outcomes**.
3. Run **Comprix: Compare Git References** from the Command Palette or use the
   compare icon in the view title.
4. Choose the base and head refs, approve model access if VS Code asks, and
   expand an outcome.
5. Select a contributing file and verify that the before/after diff opens.
6. Also try **Comprix: Analyze Commit Range** with `HEAD~1..HEAD`.

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

- `comprix.languageModel.vendor` defaults to `copilot`. Set it to an empty
  string to allow any available VS Code model provider.
- `comprix.languageModel.family` optionally prefers a model family. If that
  family is unavailable, Comprix falls back to another model from the selected
  vendor.
- `comprix.analysis.maxFiles` limits the number of changed files sent for one
  analysis (default `80`).
- `comprix.analysis.maxDiffCharacters` limits patch content (default `60000`).

When configured limits truncate input, the model is told explicitly and the
result view only accepts citations to included files.

## Architecture

Comprix targets VS Code 1.90 because it is the first release with the finalized
Language Model API. The implementation uses:

- a local-Git adapter built on argument-safe `spawn` calls (never a shell);
- deterministic comparison collection and bounded prompt construction;
- a small `AnalysisProvider` interface with a VS Code Language Model provider;
- strict JSON parsing and runtime schema/path validation before display;
- a native `TreeView` in Source Control, avoiding a webview;
- a read-only virtual-document provider plus the built-in `vscode.diff`
  command for revision-to-revision navigation.

The architecture follows the official [Language Model API
guidance](https://code.visualstudio.com/api/extension-guides/ai/language-model)
and [Tree View API
guidance](https://code.visualstudio.com/api/extension-guides/tree-view).

## Known limitations

- VS Code's public API does not expose the built-in Git history selection, so
  the prototype uses its own native ref pickers and range input.
- Results are model-generated and can still be incomplete or mistaken even
  after structural validation. Confidence labels communicate model certainty,
  not a correctness guarantee.
- Very large comparisons are intentionally truncated. Binary diffs and
  submodule content are not semantically expanded.
- Results exist for the current VS Code session only and are not cached.
- The first prototype analyzes one Git working tree at a time and does not
  include uncommitted changes.

See [COMPRIX.md](COMPRIX.md) for the complete product brief.
