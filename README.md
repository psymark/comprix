# Comprix

Comprix is a Visual Studio Code extension prototype for understanding the
functional outcomes of a Git comparison. Its results live in a native Source
Control tree: outcomes at the top level, contributing files underneath, and
one-click access to each file's diff.

The extension is under active prototype development. See [COMPRIX.md](COMPRIX.md)
for the product brief.

## Development

Requirements:

- Node.js 20 or newer
- Git
- Visual Studio Code 1.90 or newer

Install and verify:

```bash
npm install
npm run check
```

Open this folder in VS Code and press `F5` using the **Run Comprix Extension**
launch configuration. This compiles the extension and opens an Extension
Development Host.

## Architecture direction

Comprix targets VS Code 1.90 because it is the first release with the finalized
Language Model API. It uses the local Git executable for deterministic repository
and comparison data, a native `TreeView` in Source Control for results, and the
`vscode.diff` command with read-only virtual documents for historical file
content. AI access is isolated behind a provider interface.
