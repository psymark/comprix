# Evidence-linked change outcomes

## Purpose

Implement evidence-linked outcomes in Comprix so that a reviewer can move from
an explanation of a functional change directly to the exact diff hunks that
support it.

This document describes the desired product outcome and the conditions for a
complete implementation. `COMPRIX.md` remains the source of truth for the
overall product scope, and `AGENTS.md` defines the repository's engineering
conventions.

## Primary user story

As a developer reviewing or trying to understand a Git comparison, I want every
important claim made by Comprix to cite the exact changed code that supports it,
so that I can verify the explanation quickly, navigate through the relevant
parts of the change, and decide where to spend my review attention.

## User problem

Comprix currently groups changed files into functional outcomes and lets the
user open a contributing file's full diff. This is useful, but it still leaves
the user to locate the relevant lines within that diff. A file-level citation
also does not clearly establish which part of a file supports a generated
claim.

For a reviewer to trust and routinely use the analysis, the path from claim to
code must be short, precise, and mechanically verifiable.

## Desired experience

After analyzing a comparison, the user sees functional outcomes as they do
today. Expanding an outcome reveals its supporting evidence, organized in a
clear native VS Code hierarchy. Each evidence item identifies the changed file,
the relevant hunk or changed range, and why that code supports the outcome.

For example:

```text
Rejects unsupported hole types                         high
  src/validator.ts
    validateHole(): adds an early rejection branch
  src/errors.ts
    UnsupportedHoleError: defines the reported failure
```

When the user selects an evidence item, Comprix opens the analyzed historical
diff and reveals the cited range. The user should not have to search through the
file to locate it.

The experience must preserve the existing ability to:

- compare refs and ranges;
- see functional outcomes grouped above their contributing code;
- open historical before/after diffs;
- open the current working-tree copy when it exists; and
- use either supported analysis provider.

## Trust model

Diff locations are facts derived by Comprix, not values invented by the model.

Before analysis, Comprix must deterministically split the included Git patch
into addressable evidence units. Each unit has an opaque identifier and enough
metadata to reopen the corresponding diff location. The model receives these
units and cites their identifiers. Structured-output validation rejects unknown
or invalid identifiers.

The model must not be asked to calculate file line numbers or reproduce an
unvalidated path. File paths and old/new ranges displayed to the user are
resolved from the cited evidence unit.

An evidence unit should contain, at minimum:

- a stable identifier within the comparison snapshot;
- the changed file path and, for renames, its previous path;
- the old-side start and length;
- the new-side start and length;
- the hunk heading when Git provides one; and
- the bounded patch text belonging to that hunk.

Identifiers only need to remain stable for identical collected comparison
input. They must not depend on model-generated content or array positions that
can change accidentally during later processing.

## Analysis result

Each outcome must cite at least one valid evidence unit. An evidence citation
contains:

- the evidence unit identifier;
- a concise explanation of how it supports the outcome; and
- the nature of the claim: `fact`, `inference`, or `question`.

The meanings are:

- `fact`: directly established by the cited diff;
- `inference`: a plausible implication that is not completely established by
  the supplied code; and
- `question`: an issue the reviewer should investigate rather than a claim that
  something is wrong.

The UI must communicate this distinction without overwhelming the tree. The
exact presentation is an implementation decision, but users must not mistake an
inference or question for a verified fact.

Several evidence units may support one outcome, and the same evidence unit may
support more than one outcome when justified. Duplicate citations within one
outcome should be rejected or normalized deterministically.

## Navigation behavior

Selecting evidence for an addition or modification opens the same historical
before/after diff used by the existing file command and reveals the relevant
new-side range.

Selecting evidence for a deletion reveals the relevant old-side range. Renamed
files use the correct old and new paths. Empty sides of additions and deletions
must continue to render correctly.

Opening evidence must work when:

- the working-tree file has changed since the analysis;
- the working-tree file has been deleted;
- neither analyzed revision is currently checked out; and
- the comparison uses direct or merge-base semantics.

Navigation always targets the immutable revisions recorded in the comparison,
not the current contents on disk.

When exact reveal behavior is constrained by the public VS Code diff API, use
the closest reliable native behavior and document the limitation. Do not
silently navigate to an unrelated side or range.

## Context collection and truncation

Patch truncation must not create a partially addressable evidence unit. Apply
configured limits at evidence-unit boundaries wherever practical. The analysis
may only cite units whose complete bounded content was supplied to the model.

If some changed files or hunks are omitted, the analysis must state that its
input was incomplete, as it does today. Evidence links must never imply that
Comprix analyzed omitted code.

This work does not need to solve full large-change analysis or repository-wide
retrieval. However, its data model should make future per-file batching and
multi-stage analysis possible rather than preserving the patch solely as one
indivisible string.

## Native UI requirements

Prefer the existing native Source Control tree. Introduce a webview only if a
specific required interaction cannot be expressed clearly with native VS Code
APIs.

At minimum, the tree must make the following discoverable:

- which evidence belongs to each outcome;
- the file and useful hunk or symbol context for each citation;
- why the evidence supports the outcome;
- whether it is a fact, inference, or question; and
- that selecting it opens the relevant diff location.

Keep labels concise and put longer reasoning in an accessible tooltip or detail
surface. Preserve keyboard navigation and useful accessibility labels.

A file that contains several cited hunks should not appear as several
indistinguishable entries. Grouping by file or including distinct hunk context
are both acceptable solutions.

## Error behavior

The user should receive a concise, actionable error when:

- Git returns a patch that cannot be parsed safely;
- the model returns an unknown evidence identifier;
- structured output omits evidence for an outcome;
- a provider repeatedly returns invalid structured data; or
- a historical file cannot be opened.

The VS Code language-model provider may retain its single repair attempt. The
repair prompt should report invalid evidence identifiers without weakening
validation. The Codex CLI provider must be held to the same runtime validation
rules even when its output schema prevents most structural mistakes.

Do not display a partially validated analysis as though it were complete.

## Acceptance criteria

The feature is complete when all of the following are true:

1. Comprix deterministically parses included unified Git diffs into structured,
   addressable evidence units.
2. Added, modified, deleted, and renamed files produce correct old/new paths and
   ranges.
3. Every displayed outcome cites at least one supplied evidence identifier.
4. Runtime validation rejects unknown identifiers, missing citations, malformed
   citation data, and references to omitted hunks.
5. Neither analysis provider relies on the model to invent paths or line
   numbers.
6. Expanding an outcome exposes its supporting evidence and explanation.
7. Selecting evidence opens the immutable analyzed diff and reveals the cited
   location on the appropriate side whenever the VS Code API supports it.
8. Existing file-level diff and current-file navigation continue to work.
9. Truncation happens without exposing a partially supplied hunk as valid
   evidence.
10. Cancellation works during Git collection and model analysis without
    replacing existing results with partial results.
11. The README explains the new behavior and gives concise manual verification
    steps.
12. Lint, unit tests, and compilation pass.

## Required automated coverage

Add deterministic tests for at least:

- parsing one file with several hunks;
- an added file whose old range has zero length;
- a deleted file whose new range has zero length;
- a rename with modifications;
- paths containing spaces and unusual safe characters;
- hunk headings that are absent or contain punctuation;
- the final line lacking a newline marker;
- truncation at an evidence-unit boundary;
- valid evidence citations;
- unknown, duplicated, missing, and malformed citations;
- mapping evidence into the tree view model; and
- constructing correct navigation data for both diff sides.

Use or extend the existing disposable fixture repository where an actual Git
comparison gives more confidence than a synthetic patch.

## Manual verification

In an Extension Development Host:

1. Analyze a small branch containing modifications in several hunks.
2. Expand every outcome and verify that its evidence labels are understandable.
3. Select each evidence item and confirm that VS Code reveals the cited change.
4. Repeat with an added file, deleted file, and renamed file.
5. Change the working-tree file after analysis and verify that evidence still
   opens the recorded historical revisions.
6. Force a low diff-character limit and confirm that omitted or partial hunks
   cannot be cited.
7. Exercise both the VS Code language-model and Codex CLI providers when they
   are available.

Record any environment limitation in the README.

## Non-goals for this increment

Do not expand this feature into:

- automatic review comments or GitHub posting;
- autonomous code changes;
- repository-wide chat;
- running tests or coverage tools;
- a complete risk-scoring system;
- language-specific semantic parsing for every language;
- hosted storage, authentication, telemetry, or billing; or
- a broad redesign of the Source Control experience.

Symbol names are desirable when they can be obtained reliably from hunk
headings or native VS Code language features, but exact hunk evidence and
navigation must not depend on universal symbol extraction.

## Likely implementation areas

The implementing agent should inspect the current architecture before deciding
the exact design. Likely areas of change include:

- `src/git/gitClient.ts` for structured patch collection;
- `src/core/model.ts` for evidence and citation types;
- `src/analysis/prompt.ts` for evidence-aware prompts;
- `src/analysis/schema.ts` and `resources/analysis-schema.json` for validation;
- both analysis providers for the revised contract;
- `src/view/viewModel.ts` and `src/view/outcomeTree.ts` for presentation; and
- `src/view/diffService.ts` for range-aware navigation.

Keep deterministic Git parsing, prompt construction, schema validation, and
view-model mapping independently testable. Avoid adding a runtime dependency
unless it materially improves correctness and is justified against a focused
in-repository implementation.

## Definition of done

This request is for a working vertical slice, not only an architecture proposal.
The implementing agent should inspect the repository, implement the feature,
update documentation, run the relevant quality gates, fix failures, and report
any interactive VS Code verification that could not be performed in the current
environment.

The final result should let a reviewer read an outcome, understand what code
supports it, and reach that exact code with one action.
