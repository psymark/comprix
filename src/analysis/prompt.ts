import { formatComparison } from '../core/comparison';
import type { ComparisonSnapshot } from '../core/model';

export const analysisInstructions = `You are a change-comprehension engine. Analyze a Git comparison and identify user-visible, developer-visible, or operational functional outcomes.

Return exactly one JSON object. Do not use Markdown or a code fence. The object must have this schema:
{
  "version": 1,
  "overview": "one concise paragraph",
  "outcomes": [
    {
      "title": "specific outcome stated as an action",
      "description": "what changed and why it matters",
      "category": "behavior | api | user-interface | performance | security | testing | infrastructure | documentation | other",
      "confidence": "high | medium | low",
      "files": [
        {
          "path": "an exact path from CHANGED FILES",
          "reason": "how this file contributes to the outcome"
        }
      ]
    }
  ]
}

Rules:
- Describe functional outcomes, not a file-by-file changelog.
- Group files that jointly produce one outcome.
- Every outcome must cite at least one exact changed-file path.
- Never invent a path, behavior, motivation, issue, or runtime effect.
- Separate test-only and documentation-only changes when they are not part of a broader outcome.
- Use low confidence when the patch does not establish the effect clearly.
- Keep titles distinct, concrete, and under 120 characters.`;

export function buildAnalysisPrompt(snapshot: ComparisonSnapshot): string {
  const files = snapshot.files
    .map((file) => {
      const rename =
        file.oldPath === undefined ? '' : ` (from ${file.oldPath})`;
      return `- [${file.status}] ${file.path}${rename}`;
    })
    .join('\n');
  const commits =
    snapshot.commits.length === 0
      ? '- No commits are exclusive to the head side.'
      : snapshot.commits
          .map(
            (commit) =>
              `- ${commit.shortHash} ${commit.subject} — ${commit.author}`,
          )
          .join('\n');
  const truncation = snapshot.truncated
    ? '\nNOTICE: Input was truncated by configured safety limits. Do not infer omitted changes.'
    : '';

  return `REPOSITORY COMPARISON
Range: ${formatComparison(snapshot.spec)}
Resolved base: ${snapshot.baseRevision}
Resolved head: ${snapshot.headRevision}
Statistics: ${snapshot.shortStat || 'not available'}
Changed files included: ${snapshot.files.length.toString()} of ${snapshot.totalFileCount.toString()}${truncation}

COMMITS
${commits}

CHANGED FILES
${files}

PATCH
${snapshot.patch}`;
}
