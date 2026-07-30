Build a working prototype of a Visual Studio Code extension for change comprehension.

Desired user outcome:

A user opens a Git repository in Visual Studio Code, views its Git commit history/tree, chooses two Git references or a range of commits—such as one branch compared with another branch—and asks the extension to analyze the change.

The extension generates a change-comprehension view whose top level is a list of behavioral or functional outcomes caused by the selected change.

Each outcome can be expanded to show the files that contributed to that outcome. Files should be selectable so the user can inspect the relevant diff or source code.

Examples of outcomes might be:

- Adds validation for unsupported hole types
- Changes how failures are reported
- Introduces a fallback tool-selection path
- Updates tests for the new behavior

These are examples only. Determine an effective initial implementation.

Your task:

1. Inspect the available VS Code extension and Git APIs.
2. Decide on a sensible architecture for a prototype.
3. Scaffold the complete extension in this empty repository, but do it in an organized fashion commit by commit.
4. Implement the full vertical slice.
5. Include an AI analysis abstraction and at least one usable provider.
6. Prefer using AI capabilities available through the user’s VS Code or existing model access rather than requiring a custom backend.
7. Define and validate structured AI output rather than parsing arbitrary prose.
8. Build an intuitive native VS Code interface unless a custom webview provides a clear advantage.
9. Add automated tests for the deterministic parts.
10. Add a small fixture Git repository or another reproducible way to test commit comparisons.
11. Add clear instructions for running and debugging the extension.
12. Run the build, linting and tests, and fix failures.
13. Launch or otherwise exercise the extension where possible and inspect the result.
14. Keep iterating autonomously until there is a coherent, usable prototype.

You have freedom to choose the implementation details.

Do not merely produce a plan or explanation. Build the extension.

Do not build production infrastructure, authentication, billing, telemetry or a hosted backend.

At the end, report:

- what you built;
- how to run it;
- important architectural decisions;
- known limitations;
- what I should manually test first.

Name of this VSC plugin is comprix.